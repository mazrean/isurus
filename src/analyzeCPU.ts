import * as vscode from "vscode";
import { SqlPlan } from "@/model/plan";
import { addDiagnostic, updateDiagnostics } from "@/diagnostics";
import { analyze } from "@/planning/cpu";

const getDiagnosticsPositions = (plan: SqlPlan) => {
  return [
    plan.targetFunction.namePosition,
    ...plan.targetFunction.queryPositions,
    ...plan.relatedFunctions.flatMap((f) => [
      f.namePosition,
      ...f.queryPositions,
    ]),
  ];
};

export const analyzeCPUCmd = async () => {
  if (!vscode.workspace.workspaceFolders) {
    vscode.window.showInformationMessage(
      `No workspace folder is opened. Please open workspace folder.`
    );
    return;
  }

  const plan = await analyze();

  if (plan.appPlans !== undefined) {
    for (const { name, usage } of plan.appPlans) {
      vscode.window.showInformationMessage(
        `Application ${name} has CPU usage over 50%: ${usage}`
      );
    }
  }

  if (plan.nginxPlans !== undefined) {
    for (const { usage } of plan.nginxPlans) {
      vscode.window.showInformationMessage(
        `Nginx has CPU usage over 50%: ${usage}`
      );
    }
  }

  if (plan.unknownProcesses !== undefined) {
    for (const { name, usage } of plan.unknownProcesses) {
      vscode.window.showInformationMessage(
        `Unknown process ${name} has CPU usage over 50%: ${usage}`
      );
    }
  }

  if (plan.sqlPlans !== undefined) {
    for (const sqlPlan of plan.sqlPlans) {
      let message = "";
      switch (sqlPlan.plan.type) {
        case "index":
          message = `SQL ${sqlPlan.targetQuery.query} is too slow. Please add index.`;
          break;
        case "join":
          message = `SQL ${sqlPlan.targetQuery.query} is too slow. Please join the table.`;
          break;
        case "bulk":
          message = `SQL ${sqlPlan.targetQuery.query} is too slow. Please bulk insert the table.`;
          break;
        case "cache":
          message = `SQL ${sqlPlan.targetQuery.query} is cacheable. Please cache the query result.`;
          break;
        case "unknown":
          message = `SQL ${sqlPlan.targetQuery.query} is too slow.`;
          break;
      }

      for (const planPosition of getDiagnosticsPositions(sqlPlan)) {
        addDiagnostic(
          planPosition.file,
          planPosition,
          message,
          vscode.DiagnosticSeverity.Warning
        );
      }
    }
  }

  updateDiagnostics();
};
