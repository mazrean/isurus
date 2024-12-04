// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { config, registerCommand } from "@/config";
import { goServer, startGoServer } from "./externals/go-server";
import path from "path";
import { analyzeCPUCmd } from "./analyzeCPU";
import { CodeActionProvider, codeActionProvider } from "@/diagnostics";

const helloWorldCmd = () => {
  vscode.window.showInformationMessage("Hello World from Isurus!");
};

export async function activate(context: vscode.ExtensionContext) {
  const files = await vscode.workspace.findFiles("**/go.mod");
  if (files.length === 0) {
    vscode.window.showErrorMessage(
      "Go module not found in the workspace. Go server may not work properly."
    );
    return;
  }

  const dir = path.dirname(files[0].path);

  // Start Go server
  await startGoServer(config("isurus.server.path"), dir).then(async () => {
    const goFiles = await vscode.workspace.findFiles("**/*.go");
    if (goFiles.length === 0) {
      vscode.window.showErrorMessage(
        "Go files not found in the workspace. Go server may not work properly."
      );
      return;
    }
    await Promise.all(
      goFiles.map(async (file) => {
        const content = (await vscode.workspace.fs.readFile(file)).toString();
        await goServer?.addFile(file.path, content);
      })
    );

    console.debug("Go server started");
  });

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: "file", language: "go" },
      codeActionProvider,
      {
        providedCodeActionKinds: CodeActionProvider.providedCodeActionKinds,
      }
    )
  );

  registerCommand(context, "isurus.helloWorld", helloWorldCmd);
  registerCommand(context, "isurus.analyzeCPU", analyzeCPUCmd);

  console.debug('Congratulations, your extension "isurus" is now active!');
}

export function deactivate() {}
