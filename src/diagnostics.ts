import * as vscode from "vscode";
import { Range } from "@/model/code-position";
import { convertRange } from "@/vscode";
import { randomUUID } from "crypto";

const collection = vscode.languages.createDiagnosticCollection("isurus");

const diagnosticMap = new Map<string, vscode.Diagnostic[]>();

export type QuickFix = {
  title: string;
  range: Range;
  sourceCode: string;
};

export type QuickFixFunction = () => Promise<QuickFix | undefined>;

export const addDiagnostic = (
  fileName: string,
  range: Range,
  message: string,
  severity: vscode.DiagnosticSeverity,
  quickFixFunction?: QuickFixFunction
) => {
  const diagnostic = new vscode.Diagnostic(
    convertRange(range),
    message,
    severity
  );
  diagnostic.code = randomUUID().toString();
  const diagnostics = diagnosticMap.get(fileName) ?? [];
  console.debug(
    "addDiagnostic",
    diagnostic.code,
    fileName,
    range,
    message,
    severity
  );

  diagnostics.push(diagnostic);
  diagnosticMap.set(fileName, diagnostics);

  if (quickFixFunction) {
    codeActionProvider.setQuickFixFunction(diagnostic.code, quickFixFunction);
  }
};

export const updateDiagnostics = () => {
  collection.clear();

  for (const [fileName, diagnostics] of diagnosticMap) {
    collection.set(vscode.Uri.file(fileName), diagnostics);
  }
};

export class CodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  private quickFixFunctions = new Map<string, QuickFixFunction>();
  private quickFixCache = new Map<string, QuickFix>();

  setQuickFixFunction(
    diagnosticID: string,
    quickFixFunction: QuickFixFunction
  ) {
    this.quickFixFunctions.set(diagnosticID, quickFixFunction);
  }

  async getCodeAction(documentUri: vscode.Uri, diagnosticID: string) {
    let quickFix = this.quickFixCache.get(diagnosticID);
    if (!quickFix) {
      const quickFixFunction = this.quickFixFunctions.get(diagnosticID);
      if (!quickFixFunction) {
        return;
      }

      quickFix = await quickFixFunction();
      if (!quickFix) {
        return;
      }

      this.quickFixCache.set(diagnosticID, quickFix);
    }

    const codeAction = new vscode.CodeAction(
      quickFix.title,
      vscode.CodeActionKind.QuickFix
    );
    codeAction.edit = new vscode.WorkspaceEdit();
    codeAction.edit.replace(
      documentUri,
      convertRange(quickFix.range),
      quickFix.sourceCode
    );
    codeAction.diagnostics = [];

    return codeAction;
  }

  public async provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ) {
    const codeActions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (!diagnostic.code || typeof diagnostic.code !== "string") {
        continue;
      }

      const codeAction = await this.getCodeAction(
        document.uri,
        diagnostic.code
      );
      if (!codeAction) {
        continue;
      }

      codeAction.diagnostics = [diagnostic];
      codeActions.push(codeAction);
    }
    return codeActions;
  }
}

export const codeActionProvider = new CodeActionProvider();
