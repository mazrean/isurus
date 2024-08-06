// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "isurus" is now active!');

  const config = vscode.workspace.getConfiguration("isurus");

  const geminiToken = config.get<string>("gemini.token") ?? "";
  console.log("Gemini token:", geminiToken);

  const disposable = vscode.commands.registerCommand(
    "isurus.helloWorld",
    () => {
      vscode.window.showInformationMessage("Hello World from isurus!");
    }
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
