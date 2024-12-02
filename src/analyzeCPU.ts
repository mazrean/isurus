import * as vscode from "vscode";
import { config } from "@/config";
import { Prometheus } from "@/externals/prometheus";
import { goServer, GoServer, Range } from "@/externals/go-server";
import { addDiagnostic, updateDiagnostics } from "@/diagnostics";

const cpuUsageLimit = 0.5;
const sqlCheckLimit = 5;

interface SQLAnalyzeResult {
  sql: string;
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

    results.push({ sql, duration, latency, executionCount });
  }

  return results;
};

const summarizeCRUDGraph = async (goServer: GoServer) => {
  const crud = await goServer.crud();

  const tableCacheAvailabilityMap = new Map(
    crud.tables.map((t) => [t.id, true])
  );

  const queries = crud.functions.flatMap((f) => {
    const queryMap = new Map<
      string,
      {
        position: Range;
        type: "select" | "insert" | "update" | "delete" | "unknown";
        inLoop: boolean;
        tableIds: string[];
      }
    >();
    for (const q of f.queries) {
      if (!queryMap.has(q.raw)) {
        queryMap.set(q.raw, {
          position: q.position,
          type: q.type,
          inLoop: q.inLoop,
          tableIds: [],
        });
      }
      queryMap.get(q.raw)?.tableIds.push(q.tableId);
    }

    return Array.from(queryMap).map(([raw, query]) => ({
      ...query,
      raw,
      function: f,
    }));
  });
  for (const query of queries) {
    if (query.type !== "select" && query.type !== "insert") {
      for (const tableId of query.tableIds) {
        tableCacheAvailabilityMap.set(tableId, false);
      }
    }
  }

  const functionCallerMap = new Map<string, string[]>();
  for (const f of crud.functions) {
    for (const call of f.calls) {
      if (!functionCallerMap.has(call.functionId)) {
        functionCallerMap.set(call.functionId, []);
      }
      functionCallerMap.get(call.functionId)?.push(f.id);
    }
  }

  return {
    tableCacheAvailabilityMap,
    queries,
    functionCallerMap,
  };
};

interface SQLFixPlan {
  plan: "index" | "join" | "cache" | "unknown";
  targetFunction: {
    position: Range;
    name: string;
    queryPositions: Range[];
  };
  relatedFunctions: {
    position: Range;
    name: string;
    queryPositions: Range[];
  }[];
}

const getDiagnotsticsPositions = (plan: SQLFixPlan) => {
  return [
    ...plan.targetFunction.queryPositions,
    ...plan.relatedFunctions.flatMap((f) => f.queryPositions),
  ];
};

const getPromptPositions = (plan: SQLFixPlan) => {
  return [
    plan.targetFunction.position,
    ...plan.relatedFunctions.map((f) => f.position),
  ];
};

const planSQLFix = async (
  crudSummary: {
    tableCacheAvailabilityMap: Map<string, boolean>;
    queries: {
      position: Range;
      type: "select" | "insert" | "update" | "delete" | "unknown";
      inLoop: boolean;
      raw: string;
      function: {
        id: string;
        position: Range;
        name: string;
      };
      tableIds: string[];
    }[];
    functionCallerMap: Map<string, string[]>;
  },
  sqlAnalyzeResult: SQLAnalyzeResult
) => {
  let [driver, query] = sqlAnalyzeResult.sql
    .toLowerCase()
    .split(/(?<=^[^:]+?):/);
  query = query.trimStart().replace(/\s+/g, " ");

  const sql = crudSummary.queries.find((q) => {
    let crudQuery = q.raw.toLowerCase();
    switch (driver) {
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
    return query === crudQuery;
  });

  const fixPlans: SQLFixPlan[] = [];

  if (!sql) {
    return fixPlans;
  }

  const isCacheable = sql.tableIds.every((id) =>
    crudSummary.tableCacheAvailabilityMap.get(id)
  );
  if (isCacheable) {
    fixPlans.push({
      plan: "cache",
      targetFunction: {
        position: sql.function.position,
        name: sql.function.name,
        queryPositions: [sql.position],
      },
      relatedFunctions: [],
    });
  }

  if (fixPlans.length === 0) {
    fixPlans.push({
      plan: "unknown",
      targetFunction: {
        position: sql.function.position,
        name: sql.function.name,
        queryPositions: [sql.position],
      },
      relatedFunctions: [],
    });
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
          summarizeCRUDGraph(goServer),
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
              `SQL ${result.sql} is too slow. but isurus can't provide the fix plan.`
            );
            continue;
          }

          for (const plan of plans) {
            let message = "";
            switch (plan.plan) {
              case "index":
                message = `SQL ${result.sql} is too slow. Please add index.`;
                break;
              case "join":
                message = `SQL ${result.sql} is too slow. Please join the table.`;
                break;
              case "cache":
                message = `SQL ${result.sql} is cacheable. Please cache the table.`;
                break;
              case "unknown":
                message = `SQL ${result.sql} is too slow.`;
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
