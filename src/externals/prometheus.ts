import { config } from "@/config";
import { getLatestBenchmark } from "@/externals/isutools";

type Histogram = {
  count: number;
  sum: number;
  buckets: [number, string, string, string][];
};

type Response<T> = {
  status: "success" | "error";
  data: {
    resultType: string;
    result: T[];
  };
  errorType?: string;
  error?: string;
  warnings?: string[];
  infos?: string;
};
type Results<T> = {
  metric: Record<string, string>;
} & T;

export class Prometheus {
  constructor(private url: string) {}

  async queryMaxCPUUsage() {
    const data = await this.queryRange(
      'sum by (name) (irate(process_cpu_seconds_total{job="nodes"}[4s]))'
    );
    if (data.resultType !== "matrix") {
      throw new Error(`Unexpected result type: ${data.resultType}`);
    }

    const maxValueMap = new Map<string, number>();
    for (const result of data.result) {
      const name = result.metric.name;
      const value = result.values;
      if (!name || !value) {
        continue;
      }

      const numberValue = value
        .map((v) => Number(v[1]))
        .filter((v) => !isNaN(v));
      if (numberValue.length === 0) {
        continue;
      }

      const max = Math.max(...numberValue);
      maxValueMap.set(name, max);
    }

    return maxValueMap;
  }

  async querySQLDuration() {
    const data = await this.queryRange(
      'sum by (driver, query)(increase(isutools_db_query_duration_seconds_sum{job="app"}[4s]))'
    );
    if (data.resultType !== "matrix") {
      throw new Error(`Unexpected result type: ${data.resultType}`);
    }

    const maxValueMap = new Map<string, number>();
    for (const result of data.result) {
      const driver = result.metric.driver;
      const query = result.metric.query;
      const value = result.values;
      if (!driver || !query || !value) {
        continue;
      }

      const numberValue = value
        .map((v) => Number(v[1]))
        .filter((v) => !isNaN(v));
      if (numberValue.length === 0) {
        continue;
      }

      const max = Math.max(...numberValue);
      maxValueMap.set(`${driver}:${query}`, max);
    }

    return maxValueMap;
  }

  async querySQLExecutionCount() {
    const data = await this.queryRange(
      'sum by (driver, query)(increase(isutools_db_query_count{job="app"}[5s]))'
    );
    if (data.resultType !== "matrix") {
      throw new Error(`Unexpected result type: ${data.resultType}`);
    }

    const maxValueMap = new Map<string, number>();
    for (const result of data.result) {
      const driver = result.metric.driver;
      const query = result.metric.query;
      const value = result.values;
      if (!driver || !query || !value) {
        continue;
      }

      const numberValue = value
        .map((v) => Number(v[1]))
        .filter((v) => !isNaN(v));
      if (numberValue.length === 0) {
        continue;
      }

      const max = Math.max(...numberValue);
      maxValueMap.set(`${driver}:${query}`, max);
    }

    return maxValueMap;
  }

  async querySQLLatency() {
    const data = await this.queryRange(
      'sum by (driver, query)(rate(isutools_db_query_duration_seconds_sum{job="app"}[4s])) / sum by (driver, query)(rate(isutools_db_query_duration_seconds_count{job="app"}[4s]))'
    );
    if (data.resultType !== "matrix") {
      throw new Error(`Unexpected result type: ${data.resultType}`);
    }

    const maxValueMap = new Map<string, number>();
    for (const result of data.result) {
      const driver = result.metric.driver;
      const query = result.metric.query;
      const value = result.values;
      if (!driver || !query || !value) {
        continue;
      }

      const numberValue = value
        .map((v) => Number(v[1]))
        .filter((v) => !isNaN(v));
      if (numberValue.length === 0) {
        continue;
      }

      const max = Math.max(...numberValue);
      maxValueMap.set(`${driver}:${query}`, max);
    }

    return maxValueMap;
  }

  async queryRange(query: string) {
    const benchmark = await getLatestBenchmark();
    const queryParam = new URLSearchParams({
      query,
      start: benchmark.start.toISOString(),
      end: benchmark.end.toISOString(),
      step: "4s",
      timeout: "1m",
    });
    const res = await fetch(`${this.url}/api/v1/query_range?${queryParam}`);
    if (!res.ok || res.status !== 200) {
      throw new Error(
        `Failed to query Prometheus(${res.status} ${
          res.statusText
        }): ${await res.text()}`
      );
    }

    const contentType = res.headers.get("Content-Type");
    if (contentType !== "application/json") {
      throw new Error(
        `Unexpected content type: ${contentType} (${await res.text()})`
      );
    }

    const data = (await res.json()) as Response<
      Results<
        Partial<{
          values: [number, string][];
          histograms: [number, Histogram][];
        }>
      >
    >;
    if (data.status === "error") {
      throw new Error(
        `Failed to query Prometheus: ${JSON.stringify(data.error)}`
      );
    }

    if (data.warnings) {
      console.warn(`Prometheus query warnings: ${data.warnings.join(", ")}`);
    }

    if (data.infos) {
      console.info(`Prometheus query info: ${data.infos}`);
    }

    return data.data;
  }

  async query(query: string) {
    const benchmark = await getLatestBenchmark();

    const diff = benchmark.end.getTime() - benchmark.start.getTime();
    const time = new Date(benchmark.start.getTime() + diff / 2);

    const queryParam = new URLSearchParams({
      query,
      time: time.toISOString(),
    });
    const res = await fetch(`${this.url}/api/v1/query?${queryParam}`);
    if (!res.ok || res.status !== 200) {
      throw new Error(
        `Failed to query Prometheus(${res.status} ${
          res.statusText
        }): ${await res.text()}`
      );
    }

    const contentType = res.headers.get("Content-Type");
    if (contentType !== "application/json") {
      throw new Error(
        `Unexpected content type: ${contentType} (${await res.text()})`
      );
    }

    const data = (await res.json()) as Response<
      Results<
        Partial<{
          value: [number, string];
          histogram: [number, Histogram];
        }>
      >
    >;
    if (data.status === "error") {
      throw new Error(
        `Failed to query Prometheus: ${JSON.stringify(data.error)}`
      );
    }

    if (data.warnings) {
      console.warn(`Prometheus query warnings: ${data.warnings.join(", ")}`);
    }

    if (data.infos) {
      console.info(`Prometheus query info: ${data.infos}`);
    }

    return data.data;
  }
}

export const prometheus = new Prometheus(config("isurus.prometheus.url"));
