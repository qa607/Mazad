/** English UI strings. Every key added here must also be added to ar.ts. */
export const en = {} satisfies Record<string, string>;

export type TranslationKey = keyof typeof en;
export type Translations = Record<TranslationKey, string>;
