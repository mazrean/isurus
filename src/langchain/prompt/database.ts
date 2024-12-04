import { SqlPlan } from "@/model/plan";
import { rangeTextReader } from "@/vscode";

export const createIndexPrompt = async (sqlPlan: SqlPlan) => {
  if (sqlPlan.plan.type !== "index") {
    return "";
  }

  const queryIssuePrompt = sqlPlan.plan.issues
    .map(
      (issue) =>
        `The \`${issue.table.name}\` table uses the \`${issue.key}\` index for reading, but reads an average of ${issue.rows} records, of which only ${issue.filtered}% are used after filtering.`
    )
    .join("\n");

  const tableSchemaPrompt = sqlPlan.plan.issues
    .map((issue) => issue.table.createQuery)
    .filter((createQuery) => createQuery)
    .join("\n\n");

  return `Please create appropriate indexes for the following specified SQL in Go language.
EXPLAIN investigation revealed that there is a problem that the specified SQL is reading many unnecessary records at runtime.
Creating appropriate indexes will solve this problem.
Please output only the SQL that creates the appropriate indexes.

# target SQL
\`\`\`sql
${sqlPlan.targetQuery.query}
\`\`\`

# target SQL issues
${queryIssuePrompt}

# table schema
\`\`\`sql
${tableSchemaPrompt}
\`\`\`

# SQL for creating indexes`;
};

export const createJoinPrompt = async (sqlPlan: SqlPlan) => {
  if (sqlPlan.plan.type !== "join") {
    return "";
  }

  const targetFunctionText = await rangeTextReader(
    sqlPlan.targetFunction.position
  );
  const targetFunctionName = sqlPlan.targetFunction.name;

  if (sqlPlan.relatedFunctions.length === 0) {
    return `Please modify the following target functions of the Go language to reduce the number of SQL executions with respect to the specified SQL.
The specified SQL is executed in a for statement.
This can be modified by perhaps using a Join clause or a single query to get the results together.
Please output only the source code of the target function in a single code block.

# target SQL
\`\`\`sql
${sqlPlan.targetQuery.query}
\`\`\`

# target function
\`\`\`go
${targetFunctionText}
\`\`\`

# Fixed \`${targetFunctionName}\``;
  }

  const sqlExecFunction =
    sqlPlan.relatedFunctions[sqlPlan.relatedFunctions.length - 1];
  const sqlExecFunctionText = await rangeTextReader(sqlExecFunction.position);

  const relatedFunctionsText = (
    await Promise.all(
      sqlPlan.relatedFunctions.map((f) => rangeTextReader(f.position))
    )
  ).join("\n\n");

  return `Please modify the following target functions of the Go language to reduce the number of SQL executions with respect to the specified SQL.
The specified SQL is executed in the specified SQL execution function, which is executed within the for statement of the target function.
Functions called in the process from the target function until the specified SQL execution function is called are listed as related functions.
You can probably fix this by using a join clause or by using a query to get the results at once.
Please output only the source code of the target function and the new function in a single code block.

# target SQL
\`\`\`sql
${sqlPlan.targetQuery.query}
\`\`\`

# SQL execution function
\`\`\`go
${sqlExecFunctionText}
\`\`\`

# related functions
\`\`\`go
${relatedFunctionsText}
\`\`\`

# target function
\`\`\`go
${targetFunctionText}
\`\`\`

# Fixed \`${targetFunctionName}\``;
};

export const createBulkPrompt = async (sqlPlan: SqlPlan) => {
  if (sqlPlan.plan.type !== "bulk") {
    return "";
  }

  const targetFunctionText = await rangeTextReader(
    sqlPlan.targetFunction.position
  );
  const targetFunctionName = sqlPlan.targetFunction.name;

  if (sqlPlan.relatedFunctions.length === 0) {
    let directionPrompt = "";
    switch (sqlPlan.queryType) {
      case "insert":
        directionPrompt = `The specified SQL is an INSERT statement executed in a for statement.
It can probably be modified using bulk insert.`;
        break;
      case "update":
        directionPrompt = `The specified SQL is an UPDATE statement executed in a for statement.
It can probably be corrected by making it so that UPDATE is executed in a batch.`;
        break;
      case "delete":
        directionPrompt = `The specified SQL is a DELETE statement executed in a for statement.
It can probably be modified by making it delete in a batch.`;
    }

    return `Modify the following target functions of the Go language to reduce the number of times the specified SQL is executed.
${directionPrompt}
Please output only the source code of the target function and the new function in a single code block.

# target SQL
\`\`\`sql
${sqlPlan.targetQuery.query}
\`\`\`

# target function
\`\`\`go
${targetFunctionText}
\`\`\`

# Fixed \`${targetFunctionName}\``;
  }

  const sqlExecFunction =
    sqlPlan.relatedFunctions[sqlPlan.relatedFunctions.length - 1];
  const sqlExecFunctionText = await rangeTextReader(sqlExecFunction.position);

  const relatedFunctionsText = (
    await Promise.all(
      sqlPlan.relatedFunctions.map((f) => rangeTextReader(f.position))
    )
  ).join("\n\n");

  let directionPrompt = "";
  switch (sqlPlan.queryType) {
    case "insert":
      directionPrompt = `The specified SQL is an INSERT statement executed in a for statement.
Functions called in the process from the target function until the specified SQL execution function is called are listed as related functions.
It can probably be modified using bulk insert.`;
      break;
    case "update":
      directionPrompt = `The specified SQL is an UPDATE statement executed in a for statement.
Functions called in the process from the target function until the specified SQL execution function is called are listed as related functions.
It can probably be corrected by making it so that UPDATE is executed in a batch.`;
      break;
    case "delete":
      directionPrompt = `The specified SQL is a DELETE statement executed in a for statement.
Functions called in the process from the target function until the specified SQL execution function is called are listed as related functions.
It can probably be modified by making it delete in a batch.`;
  }

  return `Please modify the following target functions of the Go language to reduce the number of SQL executions with respect to the specified SQL.
${directionPrompt}
Please output only the source code of the target function and the new function in a single code block.

# target SQL
\`\`\`sql
${sqlPlan.targetQuery.query}
\`\`\`

# SQL execution function
\`\`\`go
${sqlExecFunctionText}
\`\`\`

# related functions
\`\`\`go
${relatedFunctionsText}
\`\`\`

# target function
\`\`\`go
${targetFunctionText}
\`\`\`

# Fixed \`${targetFunctionName}\``;
};

export const createCachePrompt = async (sqlPlan: SqlPlan) => {
  if (sqlPlan.plan.type !== "cache") {
    return "";
  }

  const targetFunctionText = await rangeTextReader(
    sqlPlan.targetFunction.position
  );
  const targetFunctionName = sqlPlan.targetFunction.name;

  return `Modify the following functions of the Go language to cache on-memory the results of specified SQL executions.
The cache should be available across requests.
Also, use \`isucache.New\` function for the modification.
Please output only the source code of the target function in a single code block.

# \`isucache.New\`
## isucache package
\`\`\`go
func New[K comparable, V any](name string, replaceFn func(ctx context.Context, key K) (V, error), freshFor, ttl time.Duration, options ...sc.CacheOption) (*sc.Cache[K, V], error)
\`\`\`

## scパッケージ
\`\`\`go
type Cache[K comparable, V any] struct {
	// contains filtered or unexported fields
}

func (c Cache) Forget(key K)
func (c Cache) ForgetIf(predicate func(key K) bool)
func (c Cache) Get(ctx context.Context, key K) (V, error)
func (c Cache) GetIfExists(key K) (v V, ok bool)
func (c Cache) Notify(ctx context.Context, key K)
func (c Cache) Purge()
func (c Cache) Stats() Stats

type CacheOption func(c *cacheConfig)
func EnableStrictCoalescing() CacheOption
func WithCleanupInterval(interval time.Duration) CacheOption
func WithLRUBackend(capacity int) CacheOption
func WithMapBackend(initialCapacity int) CacheOption
\`\`\`

# target SQL
\`\`\`sql
${sqlPlan.targetQuery.query}
\`\`\`

# target function
\`\`\`go
${targetFunctionText}
\`\`\`

# Fixed \`${targetFunctionName}\``;
};

export const createUnknownPrompt = async (sqlPlan: SqlPlan) => {
  if (sqlPlan.plan.type !== "unknown") {
    return "";
  }

  const targetFunctionText = await rangeTextReader(
    sqlPlan.targetFunction.position
  );
  const targetFunctionName = sqlPlan.targetFunction.name;

  const tableSchemaPrompt = sqlPlan.plan.tables
    ?.map((table) => table.createQuery)
    .filter((createQuery) => createQuery)
    .join("\n\n");

  return `Please fix the performance issues with the specified SQL in the following target functions of the Go language.
The specified SQL is known to have long execution times and performance issues.
However, the execution time per query is as short as 10 ms, the number of executions per request is low, and we do not know the cause of the problem.
Please modify the target function, taking into account the possibility that the specified SQL should not be executed in the first place, etc.

# target SQL
\`\`\`sql
${sqlPlan.targetQuery.query}
\`\`\`
${
  tableSchemaPrompt
    ? `
# table schema
\`\`\`sql
${tableSchemaPrompt}
\`\`\`
`
    : ""
}
# target function
\`\`\`go
${targetFunctionText}
\`\`\`

# Fixed \`${targetFunctionName}\``;
};
