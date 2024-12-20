import * as vscode from "vscode";
import { SqlPlan } from "@/model/plan";
import {
  addDiagnostic,
  QuickFix,
  QuickFixFunction,
  updateDiagnostics,
} from "@/diagnostics";
import { analyze } from "@/planning/cpu";
import { langchain } from "./langchain/openai-o1";

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
          const suggestion = await langchain.generateSuggestion(sqlPlan);
          if (suggestion.type === "index") {
            message = `SQL ${sqlPlan.targetQuery.query} is too slow. Please add index with below SQL.

${suggestion.createIndexQuery}`;
          } else {
            message = `SQL ${sqlPlan.targetQuery.query} is too slow. Please add index.`;
          }
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

      let quickFixActionFunc: QuickFixFunction | undefined = undefined;
      if (sqlPlan.plan.type !== "index") {
        let quickFixCache: QuickFix | undefined = undefined;
        quickFixActionFunc = async () => {
          if (quickFixCache) {
            return quickFixCache;
          }

          const suggestion = await langchain.generateSuggestion(sqlPlan);
          if (suggestion.type !== "targetFunction") {
            return;
          }

          const quickFix: QuickFix = {
            title: "fix by isurus",
            range: sqlPlan.targetFunction.position,
            sourceCode: suggestion.targetFunction,
          };

          quickFixCache = quickFix;

          return quickFix;
        };
      }

      for (const planPosition of getDiagnosticsPositions(sqlPlan)) {
        addDiagnostic(
          planPosition.file,
          planPosition,
          message,
          vscode.DiagnosticSeverity.Warning,
          quickFixActionFunc
        );
      }
    }
  }

  updateDiagnostics();
};
