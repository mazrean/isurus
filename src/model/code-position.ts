export type Range = {
  file: string;
  start: Position;
  end: Position;
};

export type Position = {
  line: number;
  column: number;
};
