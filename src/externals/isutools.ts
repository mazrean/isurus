let url = "http://localhost:6061";

export const setIsutoolsUrl = (newUrl: string) => {
  url = newUrl;
};

export type Benchmark = {
  start: Date;
  end: Date;
  score: number;
};

export const getLatestBenchmark = async () => {
  const res = await fetch(`${url}/benchmark/latest`);
  if (!res.ok || res.status !== 200) {
    throw new Error(
      `Failed to fetch benchmark(${res.status}): ${await res.text()}`
    );
  }

  const body = (await res.json()) as {
    start: string;
    end: string;
    score: number;
  };

  return {
    start: new Date(body.start),
    end: new Date(body.end),
    score: body.score,
  } as Benchmark;
};

export type QueryExplainResult = {
  table: string;
  possibleKeys: string;
  key: string;
  rows: number;
  filtered: number;
};

export const explainQuery = async (driver: string, query: string) => {
  const queriesRes = await fetch(`${url}/queries`);
  if (!queriesRes.ok || queriesRes.status !== 200) {
    console.info(
      `Failed to fetch queries(query: ${query}, status: ${
        queriesRes.status
      }): ${await queriesRes.text()}`
    );
    return;
  }
  const queries = (await queriesRes.json()) as {
    id: number;
    driver: string;
    normalized: string;
    latency: number;
  }[];

  const queryId = queries.find(
    (q) =>
      q.driver === driver &&
      q.normalized.toLowerCase().trimStart().replace(/\s+/g, " ") === query
  )?.id;
  if (!queryId) {
    console.info(`Query not found: ${driver}, ${query}`);
    return;
  }

  const res = await fetch(`${url}/queries/${queryId}/explain`);
  if (!res.ok || res.status !== 200) {
    console.info(
      `Failed to explain query(query: ${query}, status: ${
        queriesRes.status
      }, id: ${queryId}): ${await res.text()}`
    );
    return;
  }

  return (await res.json()) as QueryExplainResult[];
};

export const getTableCreateQuery = async (driver: string, table: string) => {
  const res = await fetch(`${url}/tables?driver=${driver}`);
  if (!res.ok || res.status !== 200) {
    console.info(
      `Failed to fetch table create query(table: ${table}, status: ${
        res.status
      }): ${await res.text()}`
    );
    return;
  }

  const tableMap = (await res.json()) as Record<string, string>;

  return tableMap[table];
};
