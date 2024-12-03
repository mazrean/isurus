import { config } from "@/config";
import { Prometheus, prometheus } from "@/externals/prometheus";
import { goServer } from "@/externals/go-server";
import { analyze as analyzeDatabase } from "./database";
import { CpuFixPlan } from "@/model/plan";

const cpuUsageLimit = 0.5;

const collectCpuUsageMetrics = async (prometheus: Prometheus) => {
  const cpuUsageMap = await prometheus.queryMaxCPUUsage();
  return [...cpuUsageMap]
    .filter(([_, usage]) => usage > cpuUsageLimit)
    .sort((a, b) => b[1] - a[1]);
};

export const analyze = async () => {
  if (!goServer) {
    throw new Error(
      "isurus server is not running. Please check the server path in the settings."
    );
  }

  const highCpuUsageProcesses = await collectCpuUsageMetrics(prometheus);

  const plan: CpuFixPlan = {
    unknownProcesses: [],
  };
  for (const [name, usage] of highCpuUsageProcesses) {
    switch (name) {
      case config("isurus.app.name"):
        if (plan.appPlans === undefined) {
          plan.appPlans = [];
        }

        plan.appPlans.push({ name, usage });

        break;
      case config("isurus.db.name"):
        if (plan.sqlPlans === undefined) {
          plan.sqlPlans = [];
        }

        const sqlPlans = await analyzeDatabase(prometheus, goServer);
        plan.sqlPlans.push(...sqlPlans);

        break;
      case "nginx":
        if (plan.nginxPlans === undefined) {
          plan.nginxPlans = [];
        }

        plan.nginxPlans.push({ usage });

        break;
      default:
        plan.unknownProcesses.push({ name, usage });
        break;
    }
  }

  return plan;
};
