import { getLatestBenchmark } from "@/externals/benchmark";

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
