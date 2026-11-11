#!/usr/bin/env node
/* global process, console */
/**
 * Copies named screenshot candidates into visual-baselines/approved/. The ONLY way a baseline
 * becomes approved. A person runs it in their own terminal; it refuses in CI, under an AI agent
 * and without an interactive terminal.
 *
 *   npm run ui:approve -- --run <run-id> [--replace] <project>/<platform>/<name>.png ...
 *
 * Exit codes: 0 approved, 1 cancelled, 2 invalid input, 3 would overwrite, 4 refused here.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.VISUAL_BASELINES_ROOT
  ? path.resolve(process.env.VISUAL_BASELINES_ROOT)
  : path.join(REPO_ROOT, 'visual-baselines');
const RUN_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
// Web: web-<lang>-<width>/<platform>/<name>.png   iOS: ios-<lang>-<device>/<name>.png
const FILE = /^(web-(en|ar)-\d{3,4}\/[a-z0-9]+|ios-(en|ar)-[a-z0-9]+)\/[a-z0-9-]+\.png$/;

function fail(code, message) {
  console.error(`visual-approve: ${message}`);
  process.exit(code);
}

const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// 1. Arguments
const args = process.argv.slice(2);
let runId;
let replace = false;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--run') runId = args[++i];
  else if (args[i] === '--replace') replace = true;
  else if (args[i].startsWith('-')) fail(2, `invalid option ${args[i]}`);
  else files.push(args[i]);
}
if (!runId || !RUN_ID.test(runId)) fail(2, 'invalid or missing --run <run-id>');
if (!files.length) fail(2, 'invalid: name at least one <project>/<platform>/<name>.png');
for (const f of files) {
  if (!FILE.test(f))
    fail(
      2,
      `invalid file name "${f}" (expected web-<lang>-<width>/<platform>/<name>.png or ios-<lang>-<device>/<name>.png)`,
    );
}
if (new Set(files).size !== files.length) fail(2, 'invalid: a file is named twice');

// 2. Sources and destinations
const runDir = path.join(ROOT, 'candidates', runId);
const approvedDir = path.join(ROOT, 'approved');
const plan = files.map((f) => {
  const src = path.join(runDir, f);
  const dest = path.join(approvedDir, f);
  let stat;
  try {
    stat = fs.lstatSync(src);
  } catch {
    fail(2, `invalid: candidate not found: ${path.relative(REPO_ROOT, src)}`);
  }
  if (!stat.isFile()) fail(2, `invalid: candidate is not a regular file: ${f}`);
  const real = fs.realpathSync(src);
  if (!real.startsWith(fs.realpathSync(runDir) + path.sep))
    fail(2, `invalid: ${f} leaves the run folder`);
  const exists = fs.existsSync(dest);
  if (exists && !replace) fail(3, `${f} is already approved; pass --replace to overwrite it`);
  return { f, src, dest, exists, hash: sha256(src) };
});

// 3. Who is running this
if (process.env.CI) fail(4, 'refused: approval is not allowed in CI');
if (process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT) {
  fail(4, 'refused: approval is not allowed under an AI agent; run it in your own terminal');
}
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  fail(4, 'refused: approval needs an interactive terminal');
}

// 4. Confirmation
console.log(`Approve ${plan.length} candidate(s) from run ${runId}:`);
for (const p of plan)
  console.log(`  ${p.exists ? 'REPLACE' : 'new    '}  ${p.f}  sha256:${p.hash.slice(0, 16)}`);
const expected = `APPROVE ${plan.length}`;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const answer = (await rl.question(`Type "${expected}" to confirm: `)).trim();
rl.close();
if (answer !== expected) fail(1, 'cancelled; nothing was copied');

// 5. Copy and record
const manifestFile = path.join(approvedDir, 'MANIFEST.json');
const manifest = fs.existsSync(manifestFile)
  ? JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  : { entries: [] };
const approvedAt = new Date().toISOString();
for (const p of plan) {
  fs.mkdirSync(path.dirname(p.dest), { recursive: true });
  fs.copyFileSync(p.src, p.dest, p.exists ? 0 : fs.constants.COPYFILE_EXCL);
  if (sha256(p.dest) !== p.hash) fail(2, `copy check failed for ${p.f}`);
  manifest.entries.push({ file: p.f, sha256: p.hash, run: runId, approvedAt, replaced: p.exists });
}
fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Approved ${plan.length} file(s). Review with git diff before committing.`);
