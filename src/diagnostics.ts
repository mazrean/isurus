import * as vscode from "vscode";

const collection = vscode.languages.createDiagnosticCollection("isurus");

type Position = {
  line: number;
  column: number;
};

export const addDiagnostic = (
  fileName: string,
  range: vscode.Range,
  message: string,
  severity: vscode.DiagnosticSeverity
) => {
  const diagnostic = new vscode.Diagnostic(range, message, severity);
  collection.set(vscode.Uri.file(fileName), [diagnostic]);
};
