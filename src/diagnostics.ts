import * as vscode from "vscode";

const collection = vscode.languages.createDiagnosticCollection("isurus");

type Position = {
  line: number;
  column: number;
};

export const addDiagnostic = (
  fileName: string,
  start: Position,
  end: Position,
  message: string,
  severity: vscode.DiagnosticSeverity
) => {
  const range = new vscode.Range(
    new vscode.Position(start.line - 1, start.column - 1),
    new vscode.Position(end.line - 1, end.column - 1)
  );
  const diagnostic = new vscode.Diagnostic(range, message, severity);
  collection.set(vscode.Uri.file(fileName), [diagnostic]);
};
