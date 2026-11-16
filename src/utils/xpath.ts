/** An XPath 1.0 string literal for `text`, whichever quotes it contains. */
export function xpathLiteral(text: string): string {
  if (!text.includes('"')) return `"${text}"`;
  if (!text.includes("'")) return `'${text}'`;
  return `concat("${text.split('"').join(`", '"', "`)}")`;
}
