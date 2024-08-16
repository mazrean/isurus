// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { Langchain } from "@/langchain/langchain";
import { setBenchmarkUrl } from "@/externals/benchmark";
import { config, registerCommand } from "@/config";
import { goServer, startGoServer } from "./externals/go-server";
import path from "path";

const helloWorldCmd = () => {
  vscode.window.showInformationMessage("Hello World from Isurus!");
};

const generateResponseCmd = () => {
  const geminiToken = config("isurus.gemini.token");
  if (!geminiToken) {
    return () => {
      vscode.window.showErrorMessage(
        "Gemini API token is required.\nPlease set it and reload the window."
      );
    };
  }

  const openaiToken = config("isurus.openai.token");
  if (!openaiToken) {
    return () => {
      vscode.window.showErrorMessage(
        "OpenAI API token is required.\nPlease set it and reload the window."
      );
    };
  }

  const langchainToken = config("isurus.langchain.token");

  const benchmarkUrl = config("isurus.benchmark.url");
  if (benchmarkUrl) {
    setBenchmarkUrl(benchmarkUrl);
  }

  const prometheusURL = config("isurus.prometheus.url");

  let langchain = new Langchain({
    geminiToken,
    openaiToken,
    prometheusURL,
    langchainToken,
  });

  return async () => {
    const input = await vscode.window.showInputBox({
      placeHolder: "Enter input",
    });
    if (!input) {
      vscode.window.showErrorMessage("Input is required");
      return;
    }

    const response = await langchain.generateResponse(input);
    vscode.window.showInformationMessage(response);
  };
};

export async function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "isurus" is now active!');

  // Start Go server
  await startGoServer(config("isurus.server.path")).then(async () => {
    const files = await vscode.workspace.findFiles("**/go.mod");
    if (files.length === 0) {
      vscode.window.showErrorMessage(
        "Go module not found in the workspace. Go server may not work properly."
      );
      return;
    }

    const dir = path.dirname(files[0].path);
    goServer?.initialize(dir);
    console.log("Go server started");
  });

  registerCommand(context, "isurus.helloWorld", helloWorldCmd);
  registerCommand(context, "isurus.generateResponse", generateResponseCmd());
}

export function deactivate() {}
