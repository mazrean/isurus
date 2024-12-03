import { Range } from "@/model/code-position";

export type CpuFixPlan = {
  appPlans?: AppPlan[];
  sqlPlans?: SqlPlan[];
  nginxPlans?: NginxPlan[];
  unknownProcesses: UnknownProcessInfo[];
};

export type AppPlan = {
  name: string;
  usage: number;
};

export type NginxPlan = {
  usage: number;
};

export type UnknownProcessInfo = {
  name: string;
  usage: number;
};

export type SqlPlan = {
  plan:
    | {
        type: "index";
        issues: {
          table: {
            name: string;
            createQuery?: string;
          };
          key: string;
          rows: number;
          filtered: number;
        }[];
      }
    | { type: "join" }
    | { type: "bulk" }
    | { type: "cache" }
    | {
        type: "unknown";
        tables?: {
          name: string;
          createQuery?: string;
          rows: number;
        }[];
      };
  targetQuery: Query;
  queryType: "select" | "insert" | "update" | "delete" | "unknown";
  targetFunction: SqlPlanFunction;
  relatedFunctions: SqlPlanFunction[];
};

export type Query = {
  driver: string;
  query: string;
  duration: number;
  latency: number;
  executionCount: number;
};

export type SqlPlanFunction = {
  position: Range;
  name: string;
  namePosition: Range;
  queryPositions: Range[];
};
