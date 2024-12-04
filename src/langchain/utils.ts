export const codeBlockExtractor = (text: string, language: string) => {
  const prefix = `\`\`\`${language}\n`;
  const suffix = "\n```";
  text = text.trim();

  if (text.startsWith(prefix)) {
    text = text.substring(prefix.length);
  }

  if (text.endsWith(suffix)) {
    text = text.substring(0, text.length - suffix.length);
  }

  return text;
};
