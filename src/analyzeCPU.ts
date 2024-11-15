import * as vscode from "vscode";
import { config } from "@/config";
import { Prometheus } from "@/externals/prometheus";

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

export const analyzeCPUCmd = async () => {
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
        const sqlAnalyzeResult = await analyzeDB(prometheus);
        if (sqlAnalyzeResult.length === 0) {
          vscode.window.showInformationMessage(
            `Database CPU usage over 50%. but isurus can't detect the issue.`
          );
        }

        for (const result of sqlAnalyzeResult) {
          vscode.window.showInformationMessage(
            `SQL ${result.sql} has issue. duration: ${result.duration}, latency: ${result.latency}, execution count: ${result.executionCount}`
          );
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
};
