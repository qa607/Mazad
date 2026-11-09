import type { TestInfo } from '@playwright/test';
import { ACCEPTED_FINDINGS } from '../data/ui-allowlists';

/**
 * error:  a layout or localization defect; the test fails (after its screenshots are taken).
 * review: needs a human decision (for example intentional truncation, or English text in the
 *         Arabic interface that may be an approved brand name). Reported, never failed.
 * accepted: a finding the QA owner accepted as intended design (ACCEPTED_FINDINGS). Still
 *         reported, with the reason, and never failed.
 */
export type Severity = 'error' | 'review' | 'accepted';

export interface Finding {
  screen: string;
  component: string;
  language: string;
  viewport: string;
  rule: string;
  severity: Severity;
  expected: string;
  actual: string;
  /** Name of the outline screenshot attached to the same test. */
  screenshot: string;
  /** Why an accepted finding was accepted. */
  note?: string;
}

export type FindingInput = Omit<Finding, 'language' | 'viewport' | 'note'>;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export class Findings {
  readonly list: Finding[] = [];

  constructor(
    readonly language: string,
    readonly viewport: string,
  ) {}

  add(input: FindingInput): void {
    const accepted = ACCEPTED_FINDINGS.find(
      (a) => a.rule === input.rule && a.screen === input.screen,
    );
    this.list.push({
      ...input,
      ...(accepted ? { severity: 'accepted' as const, note: accepted.reason } : {}),
      language: this.language,
      viewport: this.viewport,
    });
  }

  errors(): Finding[] {
    return this.list.filter((f) => f.severity === 'error');
  }

  async attach(testInfo: TestInfo): Promise<void> {
    if (!this.list.length) return;
    await testInfo.attach('findings.json', {
      body: JSON.stringify(this.list, null, 2),
      contentType: 'application/json',
    });
    const rows = this.list
      .map(
        (f) =>
          `<tr class="${f.severity}"><td>${escapeHtml(f.severity)}</td><td>${escapeHtml(f.screen)}</td>` +
          `<td>${escapeHtml(f.component)}</td><td>${escapeHtml(f.language)}</td>` +
          `<td>${escapeHtml(f.viewport)}</td><td>${escapeHtml(f.rule)}</td>` +
          `<td>${escapeHtml(f.expected)}</td><td>${escapeHtml(f.actual)}${f.note ? `<br><em>${escapeHtml(f.note)}</em>` : ''}</td>` +
          `<td>${escapeHtml(f.screenshot)}</td></tr>`,
      )
      .join('\n');
    const html =
      '<!doctype html><meta charset="utf-8"><title>UI findings</title>' +
      '<style>body{font:14px system-ui;margin:16px}table{border-collapse:collapse;width:100%}' +
      'td,th{border:1px solid #ccc;padding:4px 6px;vertical-align:top;text-align:start}' +
      'tr.error td:first-child{color:#b00020;font-weight:600}</style>' +
      '<table><tr><th>Severity</th><th>Screen</th><th>Component</th><th>Language</th>' +
      '<th>Viewport</th><th>Rule</th><th>Expected</th><th>Actual</th><th>Screenshot</th></tr>' +
      `${rows}</table>`;
    await testInfo.attach('findings.html', { body: html, contentType: 'text/html' });
  }
}
