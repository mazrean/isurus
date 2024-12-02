import * as cp from "child_process";
import * as rpc from "vscode-jsonrpc/node";

type Position = {
  line: number;
  column: number;
};

export type Range = {
  file: string;
  start: Position;
  end: Position;
};

export type Query = {
  tableId: string;
  position: Range;
  type: "select" | "insert" | "update" | "delete" | "unknown";
  raw: string;
  inLoop: boolean;
};

export type Table = {
  id: string;
  name: string;
};

export type CRUDResponse = {
  functions: {
    id: string;
    position: Range;
    name: string;
    calls: {
      functionId: string;
      position: Range;
      inLoop: boolean;
    }[];
    queries: Query[];
  }[];
  tables: Table[];
};

export class GoServer {
  connection: rpc.MessageConnection;

  constructor(command: string, rootPath: string) {
    const childProcess = cp.spawn(command, {
      cwd: rootPath,
    });
    this.connection = rpc.createMessageConnection(
      new rpc.StreamMessageReader(childProcess.stdout),
      new rpc.StreamMessageWriter(childProcess.stdin)
    );
    childProcess.stderr.on("data", (data) => {
      for (const line of data.toString().split("\n")) {
        console.debug(line);
      }
    });

    this.connection.onError((error) => {
      console.error(error);
    });
    this.connection.onClose(() => {
      console.log("Connection closed");
    });

    this.connection.listen();
  }

  async crud() {
    return await this.connection.sendRequest<CRUDResponse>("crud", {});
  }

  async addFile(path: string, content: string) {
    return await this.connection.sendRequest<string>("addFile", {
      path,
      content,
    });
  }
}

export let goServer: GoServer | undefined;

export const startGoServer = async (command: string, rootPath: string) => {
  goServer = new GoServer(command, rootPath);
};
