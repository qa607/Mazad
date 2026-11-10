import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../support/fixtures';

const SCRIPT = path.resolve(__dirname, '..', '..', 'scripts', 'visual-approve.mjs');
const FILE = 'web-en-1440/darwin/home.png';

/** Runs the approval script without a terminal (stdin is a pipe), against a temporary root. */
function approve(root: string, args: string[], env: Record<string, string> = {}) {
  const clean = { ...process.env };
  delete clean.CI;
  delete clean.CLAUDECODE;
  delete clean.CLAUDE_CODE_ENTRYPOINT;
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { ...clean, VISUAL_BASELINES_ROOT: root, ...env },
    input: '',
    encoding: 'utf8',
  });
}

test.describe('visual-approve.mjs (selfcheck)', () => {
  let root: string;

  test.beforeEach(() => {
    root = test.info().outputPath('baselines');
    const candidate = path.join(root, 'candidates', 'run-1', FILE);
    fs.mkdirSync(path.dirname(candidate), { recursive: true });
    fs.writeFileSync(candidate, 'not really a png');
    fs.mkdirSync(path.join(root, 'approved'), { recursive: true });
  });

  const approvedFiles = () =>
    fs
      .readdirSync(path.join(root, 'approved'), { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('.png'));

  test('refuses in CI', () => {
    const r = approve(root, ['--run', 'run-1', FILE], { CI: '1' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/CI/);
    expect(approvedFiles()).toEqual([]);
  });

  test('refuses under an agent', () => {
    const r = approve(root, ['--run', 'run-1', FILE], { CLAUDECODE: '1' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/agent/);
    expect(approvedFiles()).toEqual([]);
  });

  test('refuses without an interactive terminal', () => {
    const r = approve(root, ['--run', 'run-1', FILE]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/terminal/);
    expect(approvedFiles()).toEqual([]);
  });

  test('refuses bad names and wildcards', () => {
    for (const bad of [
      'web-en-1440/darwin/Home.png',
      'web-en-1440/darwin/*.png',
      '../x.png',
      'home.png',
    ]) {
      const r = approve(root, ['--run', 'run-1', bad]);
      expect(r.status, bad).not.toBe(0);
      expect(r.stderr, bad).toMatch(/invalid/i);
    }
    expect(approvedFiles()).toEqual([]);
  });

  test('accepts iOS baseline names, then still refuses without a terminal', () => {
    const iosFile = 'ios-ar-iphone15plus/ios-login.png';
    const candidate = path.join(root, 'candidates', 'run-1', iosFile);
    fs.mkdirSync(path.dirname(candidate), { recursive: true });
    fs.writeFileSync(candidate, 'not really a png');
    const r = approve(root, ['--run', 'run-1', iosFile]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).not.toMatch(/invalid/i);
    expect(r.stderr).toMatch(/terminal/);
    expect(approvedFiles()).toEqual([]);
  });

  test('refuses bad iOS names', () => {
    for (const bad of [
      'ios-fr-iphone15plus/ios-login.png',
      'ios-en-iphone15plus/darwin/ios-login.png',
      'ios-en-iPhone15Plus/ios-login.png',
      'ios-en-iphone15plus/../x.png',
    ]) {
      const r = approve(root, ['--run', 'run-1', bad]);
      expect(r.status, bad).not.toBe(0);
      expect(r.stderr, bad).toMatch(/invalid/i);
    }
    expect(approvedFiles()).toEqual([]);
  });

  test('refuses to overwrite without --replace', () => {
    const existing = path.join(root, 'approved', FILE);
    fs.mkdirSync(path.dirname(existing), { recursive: true });
    fs.writeFileSync(existing, 'approved');
    const r = approve(root, ['--run', 'run-1', FILE]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/--replace/);
    expect(fs.readFileSync(existing, 'utf8')).toBe('approved');
  });
});
