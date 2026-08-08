/**
 * The agent surface.
 *
 * This writes into a file the user already keeps and an assistant reads on
 * every turn, which makes it the most intrusive thing the tool does. The bar
 * is correspondingly high: never lose what was there, never leave two copies
 * of an instruction that contradict each other, never create files nobody
 * asked for.
 *
 * The placement itself is not a guess. Aion benchmarked it over 27 sessions —
 * 22% adoption as an opt-in skill, 100% named in the always-read file — which
 * is why the instruction goes here rather than into a README.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { install, installInto, SNIPPET, BEGIN, END, AGENT_FILES } from '../src/agent.js';

function scratch(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wid-agent-'));
}

describe('installing into an agent file', () => {
  test('an existing file keeps everything it had', () => {
    const dir = scratch();
    const original = '# My project\n\nAlways use pnpm.\nNever commit to main.\n';
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), original);

    installInto(dir, 'CLAUDE.md');
    const after = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');

    assert.ok(after.includes('Always use pnpm.'), 'existing rules must survive');
    assert.ok(after.includes('Never commit to main.'));
    assert.ok(after.includes(BEGIN) && after.includes(END));
  });

  test('running it twice replaces, never duplicates', () => {
    // Two copies of a standing instruction in a file read on every turn is
    // worse than none — the agent has to guess which one is current.
    const dir = scratch();
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Project\n');

    installInto(dir, 'CLAUDE.md');
    installInto(dir, 'CLAUDE.md');
    installInto(dir, 'CLAUDE.md');

    const after = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.equal(after.split(BEGIN).length - 1, 1, 'exactly one block');
    assert.equal(after.split(END).length - 1, 1);
  });

  test('a second run on unchanged content reports no change', () => {
    const dir = scratch();
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Project\n');
    installInto(dir, 'CLAUDE.md');
    assert.equal(installInto(dir, 'CLAUDE.md').action, 'unchanged');
  });

  test('an updated snippet replaces the old one in place', () => {
    // The block is version-controlled by its markers, so a later release can
    // correct the instruction without the user hand-editing anything.
    const dir = scratch();
    const stale = `# Project\n\n${BEGIN}\nold and wrong instruction\n${END}\n\nKeep this line.\n`;
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), stale);

    installInto(dir, 'CLAUDE.md');
    const after = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');

    assert.equal(after.includes('old and wrong instruction'), false, 'stale text is gone');
    assert.ok(after.includes('Keep this line.'), 'text after the block survives');
    assert.ok(after.includes('Checking what you changed'));
  });

  test('no file, no problem — it creates one', () => {
    const dir = scratch();
    assert.equal(installInto(dir, 'CLAUDE.md').action, 'created');
    assert.ok(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8').includes(BEGIN));
  });
});

describe('choosing which files to touch', () => {
  test('it writes to the agent files already present, and only those', () => {
    const dir = scratch();
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# agents\n');
    fs.writeFileSync(path.join(dir, '.cursorrules'), 'rules\n');

    const touched = install(dir).map((r) => r.file).sort();
    assert.deepEqual(touched, ['.cursorrules', 'AGENTS.md']);
    assert.equal(fs.existsSync(path.join(dir, 'CLAUDE.md')), false, 'no uninvited files');
  });

  test('with none present it creates exactly one', () => {
    // Scattering four config files through someone's repository uninvited is
    // rude; adding to the ones they keep is not.
    const dir = scratch();
    const results = install(dir);
    assert.equal(results.length, 1);
    assert.equal(results[0].file, 'CLAUDE.md');
  });
});

describe('what the instruction actually says', () => {
  test('it tells the agent to raise findings rather than quietly fix them', () => {
    // The tool hedges every finding because a finding can be wrong. An agent
    // that silently "fixes" a false alarm would undo working code on our say-so.
    // \s+ rather than a literal space: the snippet is hard-wrapped, so these
    // phrases legitimately span a line break.
    assert.match(SNIPPET, /Surface\s+anything\s+it\s+flags\s+to\s+the\s+user/);
    assert.match(SNIPPET, /may\s+be\s+a\s+false\s+alarm/);
  });

  test('it states when NOT to apply, which is what stops it being ignored', () => {
    assert.match(SNIPPET, /Skip\s+this\s+for\s+changes\s+that\s+cannot\s+alter\s+behaviour/);
  });

  test('it uses the real commands, so a copy-paste actually runs', () => {
    assert.match(SNIPPET, /npx what-it-does --json/);
    assert.match(SNIPPET, /npx what-it-does diff/);
  });

  test('every supported agent file is a real one', () => {
    assert.deepEqual(
      AGENT_FILES.map((a) => a.file),
      ['CLAUDE.md', 'AGENTS.md', '.cursorrules'],
    );
  });
});
