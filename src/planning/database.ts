import * as vscode from "vscode";
import { Prometheus } from "@/externals/prometheus";
import { CRUDResponse, GoServer, Range } from "@/externals/go-server";
import {
  explainQuery,
  getTableCreateQuery,
  QueryExplainResult,
} from "@/externals/isutools";
import { SqlPlan } from "@/model/plan";

const sqlCheckLimit = 5;

interface SQLAnalyzeResult {
  driver: string;
  query: string;
  duration: number;
  latency: number;
  executionCount: number;
  explainPromise: Promise<QueryExplainResult[] | undefined>;
}

const collectMetrics = async (prometheus: Prometheus) => {
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

    const explainPromise = explainQuery(driver, query);

    results.push({
      driver,
      query,
      duration,
      latency,
      executionCount,
      explainPromise,
    });
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

const summarizeCRUDGraph = async (crud: CRUDResponse) => {
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

const generateFixPlan = async (
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

  const fixPlans: SqlPlan[] = [];

  const explainResult = await sqlAnalyzeResult.explainPromise;
  const indexIssues =
    explainResult &&
    (await Promise.all(
      explainResult
        .filter((result) => result.rows > 100 && result.filtered < 80)
        .map(async (result) => ({
          table: {
            name: result.table,
            createQuery: await getTableCreateQuery(
              sqlAnalyzeResult.driver,
              result.table
            ),
          },
          key: result.key,
          rows: result.rows,
          filtered: result.filtered,
        }))
    ));
  const tables =
    explainResult &&
    (await Promise.all(
      explainResult
        .filter((result) => result.rows > 100)
        .map(async (result) => ({
          name: result.table,
          createQuery: await getTableCreateQuery(
            sqlAnalyzeResult.driver,
            result.table
          ),
          rows: result.rows,
        }))
    ));

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
        plan: { type: "cache" },
        queryType: sql.type,
        targetQuery: sqlAnalyzeResult,
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
        plan: sql.type === "select" ? { type: "join" } : { type: "bulk" },
        queryType: sql.type,
        targetQuery: sqlAnalyzeResult,
        targetFunction: callStack[0],
        relatedFunctions: callStack.slice(1),
      });
    }

    if (indexIssues && indexIssues.length > 0) {
      fixPlans.push({
        plan: { type: "index", issues: indexIssues },
        queryType: sql.type,
        targetQuery: sqlAnalyzeResult,
        targetFunction: {
          ...sql.execution.executor,
          queryPositions: [sql.execution.position],
        },
        relatedFunctions: [],
      });
    }

    if (fixPlans.length === 0) {
      fixPlans.push({
        plan: {
          type: "unknown",
          tables,
        },
        queryType: sql.type,
        targetQuery: sqlAnalyzeResult,
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

export const analyze = async (prometheus: Prometheus, goServer: GoServer) => {
  const [sqlAnalyzeResult, crudSummary] = await Promise.all([
    collectMetrics(prometheus),
    (async () => await summarizeCRUDGraph(await goServer.crud()))(),
  ]);

  return (
    await Promise.all(
      sqlAnalyzeResult.map(
        async (result) => await generateFixPlan(crudSummary, result)
      )
    )
  ).flat();
};
