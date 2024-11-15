import * as cp from "child_process";
import * as rpc from "vscode-jsonrpc/node";

type Position = {
  file: string;
  line: number;
  column: number;
};

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

  async crud(workDir: string) {
    return (await this.connection.sendRequest("crud", {
      workDir,
    })) as {
      functions: {
        id: string;
        position: Position;
        name: string;
        calls: {
          functionId: string;
          position: Position;
          inLoop: boolean;
        }[];
        queries: {
          tableId: string;
          position: Position;
          type: "select" | "insert" | "update" | "delete" | "unknown";
          raw: string;
          inLoop: boolean;
        }[];
      }[];
      tables: {
        id: string;
        name: string;
      }[];
    };
  }
}

export let goServer: GoServer | undefined;

export const startGoServer = async (command: string) => {
  goServer = new GoServer(command);
};
