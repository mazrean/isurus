import * as vscode from "vscode";
import { Range } from "@/model/code-position";

export const convertRange = (position: Range) => {
  return new vscode.Range(
    new vscode.Position(position.start.line - 1, position.start.column - 1),
    new vscode.Position(position.end.line - 1, position.end.column - 1)
  );
};

export const rangeTextReader = async (range: Range) => {
  const document = await vscode.workspace.openTextDocument(range.file);
  const text = document.getText(convertRange(range));

  return text;
};
