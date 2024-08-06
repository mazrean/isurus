// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { Model } from "@/langchain/model";
import { GeminiModel } from "@/langchain/gemini";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "isurus" is now active!');

  const config = vscode.workspace.getConfiguration("isurus");

  const geminiToken = config.get<string>("gemini.token");
  if (!geminiToken) {
    vscode.window.showErrorMessage("Gemini token is not set");
    return;
  }
  let model: Model = new GeminiModel(geminiToken);

  const helloWorldCmd = vscode.commands.registerCommand(
    "isurus.helloWorld",
    () => {
      vscode.window.showInformationMessage("Hello World from isurus!");
    }
  );

  const generateResponseCmd = vscode.commands.registerCommand(
    "isurus.generateResponse",
    async () => {
      const input = await vscode.window.showInputBox({
        placeHolder: "Enter input",
      });
      if (!input) {
        vscode.window.showErrorMessage("Input is required");
        return;
      }
      const response = await model.generateResponse(input);
      vscode.window.showInformationMessage(response);
    }
  );

  context.subscriptions.push(helloWorldCmd, generateResponseCmd);
}

// This method is called when your extension is deactivated
export function deactivate() {}
