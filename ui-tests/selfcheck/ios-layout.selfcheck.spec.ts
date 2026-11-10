import { expect, test } from '../support/fixtures';
import { findIosLayoutIssues, parseIosSource } from '../support/ios/ios-layout';

/** Offline page-source samples: each rule must fire on a known defect and stay quiet otherwise. */
const el = (type: string, label: string, x: number, y: number, w: number, h: number) =>
  `<XCUIElementType${type} type="XCUIElementType${type}" label="${label}" visible="true" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
const doc = (...children: string[]) =>
  `<?xml version="1.0"?><AppiumAUT><XCUIElementTypeApplication type="XCUIElementTypeApplication" visible="true" x="0" y="0" width="430" height="932">${el('Window', '', 0, 0, 430, 932)}${children.join('')}</XCUIElementTypeApplication></AppiumAUT>`;

const clean = doc(
  el('StaticText', 'Mobile Number', 16, 100, 120, 20),
  el('TextField', '', 16, 124, 398, 44),
  el('StaticText', 'Password', 16, 184, 100, 20),
  el('SecureTextField', '', 16, 208, 398, 44),
  el('Button', 'Log In', 16, 300, 398, 48),
);

test.describe('iOS layout rules (selfcheck)', () => {
  test('parses elements and frames', () => {
    const els = parseIosSource(clean);
    expect(els.find((e) => e.type === 'Button')).toMatchObject({ label: 'Log In', x: 16, y: 300 });
  });

  test('a clean English form has no issues', () => {
    expect(findIosLayoutIssues(parseIosSource(clean), { language: 'en' })).toEqual([]);
  });

  test('flags off-screen, overlap and label misalignment', () => {
    const broken = doc(
      el('StaticText', 'Mobile Number', 40, 100, 120, 20),
      el('TextField', '', 16, 124, 398, 44),
      el('Button', 'Log In', 16, 150, 398, 48),
      el('StaticText', 'Too wide', 300, 400, 200, 20),
    );
    const rules = findIosLayoutIssues(parseIosSource(broken), { language: 'en' }).map(
      (i) => i.rule,
    );
    expect(rules).toEqual(
      expect.arrayContaining(['off-screen', 'text-overlap', 'label-alignment']),
    );
  });

  test('Arabic labels must align to the right edge', () => {
    const ar = doc(
      el('StaticText', 'رقم الجوال', 16, 100, 120, 20),
      el('TextField', '', 16, 124, 398, 44),
    );
    const rules = findIosLayoutIssues(parseIosSource(ar), { language: 'ar' }).map((i) => i.rule);
    expect(rules).toContain('label-alignment');
  });

  test('keyboard covering the focused field is an error; covering the button is review', () => {
    const withKeyboard = doc(
      el('TextField', '', 16, 600, 398, 44),
      el('Button', 'Log In', 16, 700, 398, 48),
      el('Keyboard', '', 0, 580, 430, 352),
    );
    const els = parseIosSource(withKeyboard);
    const issues = findIosLayoutIssues(els, {
      language: 'en',
      focusedField: els.find((e) => e.type === 'TextField'),
      primaryButton: els.find((e) => e.type === 'Button'),
    });
    expect(issues.map((i) => `${i.rule}:${i.severity}`)).toEqual(
      expect.arrayContaining(['covered-by-keyboard:error', 'button-under-keyboard:review']),
    );
  });
});
