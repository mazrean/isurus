import { DynamicStructuredTool } from "@langchain/core/tools";

import { z } from "zod";
import { getLatestBenchmark } from "@/externals/isutools";
import { formatTable } from "@/utils/format";

const getPrometheusMetrics = async (url: string) => {
  const res = await fetch(`${url}/api/v1/targets/metadata`);
  if (!res.ok || res.status !== 200) {
    return "";
  }

  const body = (await res.json()) as {
    status: string;
    data: {
      target: Record<string, string>;
      metric: string;
      type: string;
      help: string;
    }[];
  };
  if (body.status !== "success") {
    return "";
  }

  const metrics: Map<
    string,
    {
      type: string;
      help: string;
      labels: Map<string, string[]>;
    }
  > = new Map();
  for (const metric of body.data) {
    let mapMetric = metrics.get(metric.metric);
    if (!mapMetric) {
      mapMetric = {
        type: metric.type,
        help: metric.help,
        labels: new Map(),
      };
    }

    mapMetric.type ??= metric.type;
    mapMetric.help ??= metric.help;

    const labels = Object.entries(metric.target);
    for (const [label, value] of labels) {
      let labelValues = mapMetric.labels.get(label);
      if (!labelValues) {
        labelValues = [];
      }

      if (!labelValues.includes(value)) {
        labelValues.push(value);
      }

      mapMetric.labels.set(label, labelValues);
    }

    metrics.set(metric.metric, mapMetric);
  }

  const table: {
    metric: string;
    type: string;
    help: string;
    labels: string;
  }[] = [];
  for (const [metric, { type, help, labels }] of metrics) {
    const labelValue = Object.entries(labels)
      .map(([label, values]) => `${label}: ${values.join("|")}`)
      .join(", ");
    table.push({ metric, type, help, labels: labelValue });
  }

  return formatTable(table);
};

const createPrometheusQueryExecuteTool = async (url: string) => {
  return new DynamicStructuredTool({
    name: "prometheus-query-executer",
    description: `Queries Prometheus for a given query.`,
    schema: z.object({
      query: z.string().describe("The query to execute"),
    }),
    func: async ({ query }) => {
      const benchmark = await getLatestBenchmark();

      const queryParam = new URLSearchParams({
        query,
        start: benchmark.start.toISOString(),
        end: benchmark.end.toISOString(),
        step: "4s",
        timeout: "1m",
      });
      const res = await fetch(`${url}/api/v1/query_range?${queryParam}`);
      if (!res.ok || res.status !== 200) {
        return `Failed to query Prometheus(${res.status}): ${await res.text()}`;
      }

      return await res.text();
    },
  });
};

export const createTools = async (prometheusURL: string) => [
  await createPrometheusQueryExecuteTool(prometheusURL),
];
