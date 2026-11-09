/** Escapes text so it matches itself literally inside a RegExp. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Matches the whole text exactly, ignoring surrounding whitespace. */
export function exactText(text: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(text)}\\s*$`);
}
