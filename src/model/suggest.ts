type FixSuggestion =
  | {
      type: "index";
      createIndexQuery: string;
    }
  | {
      type: "targetFunction";
      targetFunction: string;
    };
