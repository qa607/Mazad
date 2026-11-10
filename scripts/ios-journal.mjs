#!/usr/bin/env node
/**
 * QA-OWNER tool for the iOS recovery journal (reports/ios-account-state/journal-*.json). The tests never close
 * a journal entry: only a person does, after checking the account (docs/ios-journal-recovery.md).
 *
 *   npm run ios:journal -- list
 *   npm run ios:journal -- close <entry-id> --by "<your name>" --note "<what you checked>"
 *
 * `list` prints every entry (id, operation, state, masked phone, dates, note); no password, OTP or full phone
 * is ever stored in them. `close` moves a PENDING or APPLIED entry to CLOSED, recording who closed it and why.
 * It refuses anything else (a restored or closed entry, an unreadable file, a missing name, a note that says
 * nothing). It never deletes, renames or edits any other file, and it never touches the OTP ledger.
 * `--dir <folder>` overrides the journal folder (used by the selfchecks).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OPERATIONS = ['password-reset-to-baseline', 'invalid-password-attempts'];
const STATES = ['pending', 'applied', 'restored', 'closed'];
const KEYS = new Set([
  'runId',
  'role',
  'maskedPhone',
  'operation',
  'state',
  'createdAt',
  'updatedAt',
  'closedBy',
  'note',
]);
const ID = /^[A-Za-z0-9_-]{6,96}$/;

const say = (text) => process.stdout.write(`${text}\n`);

function fail(message) {
  process.stderr.write(`ios-journal: ${message}
`);
  process.exit(1);
}

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) fail(`${argv[i]} needs a value.`);
      out[argv[i].slice(2)] = value;
      i++;
    } else out._.push(argv[i]);
  }
  return out;
}

function valid(entry) {
  return (
    entry !== null &&
    typeof entry === 'object' &&
    Object.keys(entry).every((k) => KEYS.has(k)) &&
    typeof entry.runId === 'string' &&
    ID.test(entry.runId) &&
    entry.role === 'dealer' &&
    typeof entry.maskedPhone === 'string' &&
    OPERATIONS.includes(entry.operation) &&
    STATES.includes(entry.state) &&
    typeof entry.createdAt === 'string' &&
    typeof entry.updatedAt === 'string'
  );
}

function readAll(dir) {
  const entries = [];
  const unreadable = [];
  if (!fs.existsSync(dir)) return { entries, unreadable };
  for (const name of fs.readdirSync(dir).filter((n) => /^journal-.*\.json$/.test(n))) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      if (valid(parsed)) entries.push(parsed);
      else unreadable.push(name);
    } catch {
      unreadable.push(name);
    }
  }
  return { entries, unreadable };
}

const options = args(process.argv.slice(2));
const dir = path.resolve(options.dir ?? path.join(HERE, '..', 'reports', 'ios-account-state'));
const [command, id] = options._;

if (command === 'list') {
  const { entries, unreadable } = readAll(dir);
  if (!entries.length && !unreadable.length) say('No journal entries.');
  for (const e of entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    say(
      `${e.runId}\n  ${e.operation} | ${e.state.toUpperCase()} | account ${e.maskedPhone}\n  created ${e.createdAt}, updated ${e.updatedAt}` +
        (e.closedBy ? `, closed by ${e.closedBy}` : '') +
        (e.note ? `\n  note: ${e.note}` : ''),
    );
  }
  for (const name of unreadable)
    say(`UNREADABLE: ${name} (do not edit it; see the recovery document)`);
  const open = entries.filter((e) => e.state === 'pending' || e.state === 'applied');
  say(
    `\n${open.length} open entr${open.length === 1 ? 'y' : 'ies'}; ${unreadable.length} unreadable.`,
  );
} else if (command === 'close') {
  if (!id || !ID.test(id)) fail('close needs the entry id exactly as `list` prints it.');
  const by = (options.by ?? '').trim();
  const note = (options.note ?? '').trim();
  if (by.length < 2) fail('close needs --by "<your name>".');
  if (note.length < 10)
    fail('close needs --note "<what you checked on the account>" (at least 10 characters).');
  const { entries, unreadable } = readAll(dir);
  if (unreadable.length)
    fail(`unreadable journal file(s): ${unreadable.join(', ')}. Resolve them first.`);
  const entry = entries.find((e) => e.runId === id);
  if (!entry) fail(`no journal entry "${id}".`);
  if (entry.state !== 'pending' && entry.state !== 'applied') {
    fail(`entry "${id}" is ${entry.state}: only a pending or applied entry can be closed.`);
  }
  const next = {
    ...entry,
    state: 'closed',
    updatedAt: new Date().toISOString(),
    closedBy: by.slice(0, 80),
    note: note.slice(0, 300),
  };
  const file = path.join(dir, `journal-${id}.json`);
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, file);
  say(`Closed ${id} (was ${entry.state}) by ${next.closedBy}.`);
} else {
  fail('usage: list | close <entry-id> --by "<name>" --note "<what you checked>"');
}
