/**
 * Request-body inspection for the request guard. Runs in the route handler, before a request
 * is sent. Nothing here ever returns or logs a raw body value: summaries hold field names,
 * value types and whether a value matched an approved synthetic test value, and rejection
 * reasons name fields only.
 */

export type BodyFormat = 'json' | 'form' | 'empty' | 'malformed' | 'unsupported';

export interface BodyFieldSummary {
  /** Dot path of the field (arrays as name[]). Value-like names are replaced, see safeName(). */
  name: string;
  type: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';
  /** Name of the synthetic test value it equals (e.g. "unregisteredPhone"), or null. Never the value. */
  synthetic: string | null;
}

export interface BodySummary {
  format: BodyFormat;
  /** The content type without parameters (e.g. "application/json"); never the body. */
  contentType: string;
  fields: BodyFieldSummary[];
}

/**
 * An allowed value: an exact synthetic value, or a pattern for synthetic values generated per
 * test (for example a unique "@example.invalid" email). Patterns must be anchored (^…$) so they
 * describe the whole value; see unanchoredPattern().
 */
export type AllowedValue = string | RegExp;

/** An approved body shape: the exact set of fields, and the allowed synthetic value(s) of each. */
export interface BodyRule {
  format: 'json' | 'form';
  fields: Readonly<Record<string, readonly AllowedValue[]>>;
}

/**
 * The field of the first pattern that could match more than whole values (missing ^ or $, or
 * the m flag) or that keeps state between calls (g or y flag), if any.
 */
export function unanchoredPattern(rule: BodyRule): string | undefined {
  for (const [field, allowed] of Object.entries(rule.fields)) {
    for (const value of allowed) {
      if (
        value instanceof RegExp &&
        (!value.source.startsWith('^') ||
          !value.source.endsWith('$') ||
          value.multiline ||
          value.global ||
          value.sticky)
      ) {
        return safeName(field);
      }
    }
  }
  return undefined;
}

function isAllowed(allowed: readonly AllowedValue[], value: string): boolean {
  return allowed.some((a) => (typeof a === 'string' ? a === value : a.test(value)));
}

const MAX_FIELDS = 100;

/**
 * Field names are echoed only when every segment looks like an ordinary identifier: letters and
 * underscores, at most two trailing digits, up to 32 characters (for example "phone",
 * "countryCode", "device_id", "line2"). Anything else (digits, tokens, dashes, very long or
 * value-like names) is replaced, so a value used as a key can never reach a report.
 */
function safeName(name: string): string {
  const segments = name.split('.').map((part) => part.replace(/\[\]$/, ''));
  const ok = segments.every((part) => /^[A-Za-z_][A-Za-z_]{0,29}\d{0,2}$/.test(part));
  return ok ? name : '[redacted-name]';
}

function mediaType(contentType: string | undefined): string {
  return (contentType ?? '').split(';')[0].trim().toLowerCase();
}

type Flat = { name: string; type: BodyFieldSummary['type']; value: unknown }[];

function flatten(value: unknown, prefix: string, out: Flat): void {
  if (out.length >= MAX_FIELDS) return;
  if (Array.isArray(value)) {
    out.push({ name: prefix, type: 'array', value: undefined });
    value.forEach((v) => flatten(v, `${prefix}[]`, out));
    return;
  }
  if (value !== null && typeof value === 'object') {
    if (prefix) out.push({ name: prefix, type: 'object', value: undefined });
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return;
  }
  const type = value === null ? 'null' : (typeof value as 'string' | 'number' | 'boolean');
  out.push({ name: prefix, type, value });
}

/** Parses a body into flat fields, or reports why it cannot be parsed. Values stay internal. */
function parse(
  contentType: string | undefined,
  body: string | null | undefined,
): { format: BodyFormat; fields: Flat } {
  const type = mediaType(contentType);
  if (body === null || body === undefined || body === '') return { format: 'empty', fields: [] };
  if (type === 'application/json') {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { format: 'malformed', fields: [] };
      }
      const fields: Flat = [];
      flatten(parsed, '', fields);
      return { format: 'json', fields };
    } catch {
      return { format: 'malformed', fields: [] };
    }
  }
  if (type === 'application/x-www-form-urlencoded') {
    const fields: Flat = [];
    for (const [k, v] of new URLSearchParams(body))
      fields.push({ name: k, type: 'string', value: v });
    return { format: 'form', fields };
  }
  return { format: 'unsupported', fields: [] };
}

/** Digits only, without a leading 966 / 0, so +966509999999, 966509999999 and 0509999999 compare equal. */
function nationalNumber(value: string): string {
  return value.replace(/\D/g, '').replace(/^966/, '').replace(/^0/, '');
}

/** Which synthetic value a scalar equals: exactly, or as the same phone number in another form. */
function syntheticName(value: unknown, synthetic: Readonly<Record<string, string>>): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value);
  for (const [name, expected] of Object.entries(synthetic)) {
    if (text === expected) return name;
  }
  for (const [name, expected] of Object.entries(synthetic)) {
    const national = nationalNumber(expected);
    if (national.length >= 8 && nationalNumber(text) === national)
      return `${name} (same number, other format)`;
  }
  return null;
}

/** Structure-only summary of a request body, safe to log. */
export function summarizeBody(
  contentType: string | undefined,
  body: string | null | undefined,
  synthetic: Readonly<Record<string, string>> = {},
): BodySummary {
  const { format, fields } = parse(contentType, body);
  return {
    format,
    contentType: mediaType(contentType) || '(none)',
    fields: fields.map((f) => ({
      name: safeName(f.name),
      type: f.type,
      synthetic:
        f.type === 'object' || f.type === 'array' ? null : syntheticName(f.value, synthetic),
    })),
  };
}

/**
 * Checks a body against an approved rule. Returns a reason (field names only, never values)
 * when the body must be blocked, or undefined when it matches exactly.
 */
export function bodyRuleProblem(
  rule: BodyRule,
  contentType: string | undefined,
  body: string | null | undefined,
): string | undefined {
  const { format, fields } = parse(contentType, body);
  if (format !== rule.format) return `body is ${format}, not ${rule.format}`;
  const scalars = fields.filter((f) => f.type !== 'object' && f.type !== 'array');
  if (scalars.length !== fields.length) return 'body has nested objects or arrays';
  const names = new Set(scalars.map((f) => f.name));
  if (names.size !== scalars.length) return 'body repeats a field';
  for (const expected of Object.keys(rule.fields)) {
    if (!names.has(expected)) return `missing field ${safeName(expected)}`;
  }
  for (const f of scalars) {
    const allowed = rule.fields[f.name];
    if (!allowed) return `unexpected field ${safeName(f.name)}`;
    if ((f.type !== 'string' && f.type !== 'number') || !isAllowed(allowed, String(f.value))) {
      return `field ${safeName(f.name)} is not an approved synthetic value`;
    }
  }
  return undefined;
}
