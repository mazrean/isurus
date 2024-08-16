import * as cp from "child_process";
import * as rpc from "vscode-jsonrpc/node";

class GoServer {
  connection: rpc.MessageConnection;

  constructor(command: string) {
    const childProcess = cp.spawn(command);
    this.connection = rpc.createMessageConnection(
      new rpc.StreamMessageReader(childProcess.stdout),
      new rpc.StreamMessageWriter(childProcess.stdin)
    );

    this.connection.listen();
  }

  async initialize(rootPath: string) {
    return this.connection.sendRequest("initialize", { rootPath });
  }
}

export let goServer: GoServer | undefined;

export const startGoServer = async (command: string) => {
  goServer = new GoServer(command);
};
