import * as vscode from "vscode";
import { config } from "@/config";
import { Prometheus } from "@/externals/prometheus";

export const analyzeCPUCmd = async () => {
  let prometheus = new Prometheus(config("isurus.prometheus.url"));

  const cpuUsageMap = await prometheus.queryMaxCPUUsage();
  const cpuUsage = [...cpuUsageMap]
    .filter(([_, usage]) => usage > 0.5)
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
        return;
      case config("isurus.db.name"):
        vscode.window.showInformationMessage(
          `Database ${name} has CPU usage over 50%: ${usage}`
        );
        return;
      case "nginx":
        vscode.window.showInformationMessage(
          `Nginx has CPU usage over 50%: ${usage}`
        );
        return;
      default:
    }
  }
};
