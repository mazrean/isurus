export const formatTable = (table: Record<string, string>[]) => {
  const keys = Object.keys(table[0]);
  const header = `| ${keys.join(" | ")} |`;
  const divider = `| ${keys.map(() => "---").join(" | ")} |`;
  const body = table
    .map((row) => `| ${keys.map((key) => row[key] ?? "").join(" | ")} |`)
    .join("\n");
  return `${header}\n${divider}\n${body}`;
};
