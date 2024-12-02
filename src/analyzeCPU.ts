import * as vscode from "vscode";
import { config } from "@/config";
import { Prometheus } from "@/externals/prometheus";
import { goServer, GoServer, Range } from "@/externals/go-server";
import { addDiagnostic, updateDiagnostics } from "@/diagnostics";

const cpuUsageLimit = 0.5;
const sqlCheckLimit = 5;

interface SQLAnalyzeResult {
  driver: string;
  query: string;
  duration: number;
  latency: number;
  executionCount: number;
}

const analyzeDB = async (prometheus: Prometheus) => {
  const [sqlDurationMap, sqlLatencyMap, sqlExecutionCountMap] =
    await Promise.all([
      prometheus.querySQLDuration(),
      prometheus.querySQLLatency(),
      prometheus.querySQLExecutionCount(),
    ]);
  const sqlDuration = [...sqlDurationMap]
    .sort((a, b) => b[1] - a[1])
    .slice(0, sqlCheckLimit);

  const results: SQLAnalyzeResult[] = [];

  for (const [sql, duration] of sqlDuration) {
    const latency = sqlLatencyMap.get(sql);
    const executionCount = sqlExecutionCountMap.get(sql);
    if (!latency || !executionCount) {
      vscode.window.showInformationMessage(
        `SQL ${sql} is too slow. but isurus can't detect the issue.`
      );
      continue;
    }

    let [driver, query] = sql.toLowerCase().split(/(?<=^[^:]+?):/);
    query = query.trimStart().replace(/\s+/g, " ");

    results.push({ driver, query, duration, latency, executionCount });
  }

  return results;
};

type SummaryFunction = {
  id: string;
  position: Range;
  name: string;
  namePosition: Range;
  callers: {
    position: Range;
    inLoop: boolean;
    callee: SummaryFunction;
  }[];
};

type CRUDGraphSummary = Map<
  string,
  {
    name: string;
    queries: {
      type: "select" | "insert" | "update" | "delete" | "unknown";
      raw: string;
      tableIds: string[];
      execution: {
        executor: SummaryFunction;
        position: Range;
        inLoop: boolean;
      };
      metrics: {
        duration: number;
        latency: number;
        executionCount: number;
      };
    }[];
  }
>;

const createCRUDSummary = async (goServer: GoServer) => {
  const crud = await goServer.crud();

  const functionMap = new Map(
    crud.functions.map((func) => [
      func.id,
      {
        id: func.id,
        position: func.position,
        name: func.name,
        namePosition: func.namePosition,
        callers: [],
      } as SummaryFunction,
    ])
  );

  for (const func of crud.functions) {
    const currentFunc = functionMap.get(func.id)!;
    for (const call of func.calls) {
      const calledFunc = functionMap.get(call.functionId);
      if (!calledFunc) {
        continue;
      }

      calledFunc.callers.push({
        position: call.position,
        inLoop: call.inLoop,
        callee: currentFunc,
      });
    }
  }

  const tableMap = new Map(crud.tables.map((table) => [table.id, table.name]));

  const crudGraphSummary: CRUDGraphSummary = new Map();
  for (const func of crud.functions) {
    const executor = functionMap.get(func.id)!;

    for (const query of func.queries) {
      const crudItem = {
        type: query.type,
        raw: query.raw,
        tableIds: [query.tableId],
        execution: {
          executor,
          position: query.position,
          inLoop: query.inLoop,
        },
        metrics: {
          duration: 0,
          latency: 0,
          executionCount: 0,
        },
      };

      const key = query.tableId;
      let table = crudGraphSummary.get(key);
      if (!table) {
        table = {
          name: tableMap.get(key) ?? "unknown",
          queries: [],
        };
      }

      table.queries.push(crudItem);
      crudGraphSummary.set(key, table);
    }
  }

  return crudGraphSummary;
};

type SQLFixPlanFunction = {
  position: Range;
  name: string;
  namePosition: Range;
  queryPositions: Range[];
};

interface SQLFixPlan {
  plan: "index" | "join" | "bulk insert" | "cache" | "unknown";
  targetFunction: SQLFixPlanFunction;
  relatedFunctions: SQLFixPlanFunction[];
}

const getDiagnotsticsPositions = (plan: SQLFixPlan) => {
  return [
    plan.targetFunction.namePosition,
    ...plan.targetFunction.queryPositions,
    ...plan.relatedFunctions.flatMap((f) => [
      f.namePosition,
      ...f.queryPositions,
    ]),
  ];
};

const planSQLFix = async (
  crudSummary: CRUDGraphSummary,
  sqlAnalyzeResult: SQLAnalyzeResult
) => {
  const sqlList = [...crudSummary.values()]
    .flatMap(({ queries }) => queries)
    .filter((q) => {
      let crudQuery = q.raw.toLowerCase();
      switch (sqlAnalyzeResult.driver) {
        case "postgres":
          crudQuery = crudQuery.replace(/(\$(\d*)\s*,\s*)+\$(\d*)/, "..., ?");
          crudQuery = crudQuery.replace(/(\(..., \?\)\s*,\s*)+/, "..., ");
          break;
        case "mysql":
          crudQuery = crudQuery.replace(/(\?\s*,\s*)+/, "..., ");
          crudQuery = crudQuery.replace(/(\(\.\.\., \?\)\s*,\s*)+/, "..., ");
          break;
        case "sqlite":
          crudQuery = crudQuery.replace(
            /((?:\?(\d*)|[@:$][0-9A-Fa-f]+)\s*,\s*)+(?:\?(\d*)|[@:$][0-9A-Fa-f]+)/,
            "..., ?"
          );
          crudQuery = crudQuery.replace(/(\(\.\.\., \?\)\s*,\s*)+/, "..., ");
          break;
      }
      return sqlAnalyzeResult.query === crudQuery;
    });

  const fixPlans: SQLFixPlan[] = [];

  for (const sql of sqlList) {
    const shouldCache =
      sql.metrics.executionCount > 500 &&
      sql.tableIds.every((id) =>
        crudSummary
          .get(id)
          ?.queries.every((q) => q.type === "select" || q.type === "insert")
      );
    if (shouldCache) {
      fixPlans.push({
        plan: "cache",
        targetFunction: {
          ...sql.execution.executor,
          queryPositions: [sql.execution.position],
        },
        relatedFunctions: [],
      });
    }

    const inLoopCallStacksChecker = (
      func: SummaryFunction,
      callStack: SummaryFunction[]
    ): SummaryFunction[][] => {
      const newCallStack = [func, ...callStack];

      const inLoopCallStacks = [];
      for (const call of func.callers) {
        if (call.inLoop) {
          inLoopCallStacks.push([call.callee, ...newCallStack]);
          continue;
        }

        if (newCallStack.includes(call.callee)) {
          continue;
        }

        const res = inLoopCallStacksChecker(call.callee, newCallStack);
        inLoopCallStacks.push(...res);
      }

      return inLoopCallStacks;
    };

    const inLoopCallStacks: SummaryFunction[][] = [];
    if (sql.execution.inLoop) {
      inLoopCallStacks.push([sql.execution.executor]);
    }
    inLoopCallStacks.push(
      ...inLoopCallStacksChecker(sql.execution.executor, [])
    );
    for (const inLoopCallStack of inLoopCallStacks) {
      const callStack = inLoopCallStack.map((f) => ({
        ...f,
        queryPositions: [] as Range[],
      }));
      callStack[callStack.length - 1].queryPositions.push(
        sql.execution.position
      );

      fixPlans.push({
        plan: sql.type === "insert" ? "bulk insert" : "join",
        targetFunction: callStack[0],
        relatedFunctions: callStack.slice(1),
      });
    }

    if (fixPlans.length === 0) {
      fixPlans.push({
        plan: "unknown",
        targetFunction: {
          ...sql.execution.executor,
          queryPositions: [sql.execution.position],
        },
        relatedFunctions: [],
      });
    }
  }

  return fixPlans;
};

const goPositionToVSCodePosition = (position: Range) => {
  return new vscode.Range(
    new vscode.Position(position.start.line - 1, position.start.column - 1),
    new vscode.Position(position.end.line - 1, position.end.column - 1)
  );
};

export const analyzeCPUCmd = async () => {
  if (!vscode.workspace.workspaceFolders) {
    vscode.window.showInformationMessage(
      `No workspace folder is opened. Please open workspace folder.`
    );
    return;
  }

  let prometheus = new Prometheus(config("isurus.prometheus.url"));

  const cpuUsageMap = await prometheus.queryMaxCPUUsage();
  const cpuUsage = [...cpuUsageMap]
    .filter(([_, usage]) => usage > cpuUsageLimit)
    .sort((a, b) => b[1] - a[1]);

  if (cpuUsage.length === 0) {
    vscode.window.showInformationMessage("No CPU usage over 50%.");
    return;
  }

  for (const [name, usage] of cpuUsage) {
    switch (name) {
      case config("isurus.app.name"):
        vscode.window.showInformationMessage(
          `Application ${name} has CPU usage over 50%: ${usage}`
        );
        break;
      case config("isurus.db.name"):
        vscode.window.showInformationMessage(
          `Database ${name} has CPU usage over 50%: ${usage}`
        );

        if (!goServer) {
          vscode.window.showInformationMessage(
            `Go server is not running. Please start go server first.`
          );
          break;
        }

        const [sqlAnalyzeResult, crudSummary] = await Promise.all([
          analyzeDB(prometheus),
          createCRUDSummary(goServer),
        ]);
        if (sqlAnalyzeResult.length === 0) {
          vscode.window.showInformationMessage(
            `Database CPU usage over 50%. but isurus can't detect the issue.`
          );
          break;
        }

        for (const result of sqlAnalyzeResult) {
          const plans = await planSQLFix(crudSummary, result);
          if (!plans) {
            vscode.window.showInformationMessage(
              `SQL ${result.query} is too slow. but isurus can't provide the fix plan.`
            );
            continue;
          }

          for (const plan of plans) {
            let message = "";
            switch (plan.plan) {
              case "index":
                message = `SQL ${result.query} is too slow. Please add index.`;
                break;
              case "join":
                message = `SQL ${result.query} is too slow. Please join the table.`;
                break;
              case "bulk insert":
                message = `SQL ${result.query} is too slow. Please bulk insert the table.`;
                break;
              case "cache":
                message = `SQL ${result.query} is cacheable. Please cache the query result.`;
                break;
              case "unknown":
                message = `SQL ${result.query} is too slow.`;
                break;
            }

            for (const planPosition of getDiagnotsticsPositions(plan)) {
              addDiagnostic(
                planPosition.file,
                goPositionToVSCodePosition(planPosition),
                message,
                vscode.DiagnosticSeverity.Warning
              );
            }
          }
        }

        break;
      case "nginx":
        vscode.window.showInformationMessage(
          `Nginx has CPU usage over 50%: ${usage}`
        );
        break;
      default:
        vscode.window.showInformationMessage(
          `Unknown service ${name} has CPU usage over ${
            cpuUsageLimit * 100
          }%: ${usage}`
        );
        break;
    }
  }

  updateDiagnostics();
};
