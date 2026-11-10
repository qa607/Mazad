/** An element from an XCUITest page source (XML), with its frame in points. */
export interface IosElement {
  type: string;
  label: string;
  name: string;
  value: string;
  /** placeholderValue (text fields): UI text, unlike `value`, which can hold typed input. */
  placeholder: string;
  visible: boolean;
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Decodes the XML entities Appium writes in attribute values (&amp;, &quot;, &#10;, &#x2019;...). */
export function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code =
        ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[ref] ?? whole;
  });
}

/** Parses the flat list of elements from an Appium XCUITest page source. */
export function parseIosSource(xml: string): IosElement[] {
  const out: IosElement[] = [];
  for (const m of xml.matchAll(/<XCUIElementType(\w+)\b([^>]*?)\/?>/g)) {
    const attrs: Record<string, string> = {};
    for (const a of m[2].matchAll(/(\w+)="([^"]*)"/g)) attrs[a[1]] = decodeXmlEntities(a[2]);
    out.push({
      type: m[1],
      label: attrs.label ?? '',
      name: attrs.name ?? '',
      value: attrs.value ?? '',
      placeholder: attrs.placeholderValue ?? '',
      visible: attrs.visible === 'true',
      // Absent means enabled (XCUITest writes enabled="false" for disabled controls).
      enabled: attrs.enabled !== 'false',
      x: Number(attrs.x ?? 0),
      y: Number(attrs.y ?? 0),
      width: Number(attrs.width ?? 0),
      height: Number(attrs.height ?? 0),
    });
  }
  return out;
}

const INPUT_TAG = /<XCUIElementType(?:TextField|SecureTextField|TextView|SearchField)\b[^>]*>/g;

/**
 * Page source with every input element's value replaced by "[redacted]", for attachments: with
 * noReset the app may show a remembered value (e.g. a phone number) even when nothing was typed.
 */
export function redactInputValues(xml: string): string {
  return xml.replace(INPUT_TAG, (tag) => tag.replace(/\bvalue="[^"]+"/, 'value="[redacted]"'));
}
