import { expect, test } from '../support/fixtures';
import { Findings } from '../support/findings';

test.describe('Accepted findings (selfcheck)', () => {
  test('accepted rules are kept, marked accepted with the reason, and never fail', () => {
    const findings = new Findings('en', '1440x900');
    const base = { component: 'c', expected: 'e', actual: 'a', screenshot: 's.png' };
    findings.add({
      ...base,
      screen: 'forgot-password',
      rule: 'no-back-control',
      severity: 'review',
    });
    findings.add({
      ...base,
      screen: 'forgot-password',
      rule: 'browser-back-observed',
      severity: 'review',
    });
    // Same rule on another screen, and an unrelated rule, are not accepted.
    findings.add({ ...base, screen: 'login', rule: 'no-back-control', severity: 'review' });
    findings.add({ ...base, screen: 'login', rule: 'text-clipped', severity: 'error' });

    expect(findings.list.map((f) => `${f.screen}/${f.rule}: ${f.severity}`)).toEqual([
      'forgot-password/no-back-control: accepted',
      'forgot-password/browser-back-observed: accepted',
      'login/no-back-control: review',
      'login/text-clipped: error',
    ]);
    expect(findings.list[0].note).toMatch(/Accepted design behaviour/);
    expect(findings.list[2].note).toBeUndefined();
    expect(findings.errors().map((f) => f.rule)).toEqual(['text-clipped']);
  });
});
