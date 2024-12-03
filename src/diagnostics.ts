import * as vscode from "vscode";
import { Range } from "@/model/code-position";

const collection = vscode.languages.createDiagnosticCollection("isurus");

const diagnosticMap = new Map<string, vscode.Diagnostic[]>();

const convertRange = (position: Range) => {
  return new vscode.Range(
    new vscode.Position(position.start.line - 1, position.start.column - 1),
    new vscode.Position(position.end.line - 1, position.end.column - 1)
  );
};

export const addDiagnostic = (
  fileName: string,
  range: Range,
  message: string,
  severity: vscode.DiagnosticSeverity
) => {
  const diagnostic = new vscode.Diagnostic(
    convertRange(range),
    message,
    severity
  );
  const diagnostics = diagnosticMap.get(fileName) ?? [];

  diagnostics.push(diagnostic);
  diagnosticMap.set(fileName, diagnostics);
};

export const updateDiagnostics = () => {
  collection.clear();

  for (const [fileName, diagnostics] of diagnosticMap) {
    collection.set(vscode.Uri.file(fileName), diagnostics);
  }
};
