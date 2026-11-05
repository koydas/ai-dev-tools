// site-kit (koydas/koydas ADR-0001): the dashboard carries the shared top bar, footer and page header, and its
// vendored copy (scripts/site-kit/) matches the version and hash it declares.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { summarize, renderOverview, renderObservations, renderEvals } from '../scripts/build-dashboard.mjs';

const DIR = fileURLToPath(new URL('../scripts/site-kit/', import.meta.url));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const manifest = JSON.parse(readFileSync(join(DIR, 'KIT.json'), 'utf8'));
const set = () => ({ schema_version: 1, date: '2026-10-22', tests: { passed: 10, total: 10 }, observations: [{ id: 'O1', title: 'T', summary: 'S', status: 'fixed', date: '2026-10-22' }] });
const pages = () => {
  const m = summarize(set());
  return { 'index.html': renderOverview(m), 'observations.html': renderObservations(m), 'evals.html': renderEvals(m) };
};

test('site-kit copy: files match the version and hash it declares (profile node)', () => {
  const actual = Object.fromEntries(Object.keys(manifest.files).sort().map((f) => [f, sha(readFileSync(join(DIR, f)))]));
  assert.deepEqual(actual, manifest.files);
  assert.equal(sha(Buffer.from(Object.keys(actual).sort().map((f) => `${f} ${actual[f]}\n`).join(''))), manifest.hash);
  assert.equal(manifest.profile, 'node');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test('site-kit copy: the version in the markup is the declared one', () => {
  for (const html of Object.values(pages())) assert.match(html, new RegExp(`data-site-kit="${manifest.version}"`));
});

test('every page: shared top bar before the dashboard header, shared footer after it, this site marked, five sites listed', () => {
  for (const [file, html] of Object.entries(pages())) {
    const bar = html.indexOf('class="sk-bar"');
    assert.ok(bar > 0 && bar < html.indexOf('<header>'), `${file}: kit bar precedes the dashboard header`);
    assert.ok(html.indexOf('class="sk-footer"') > html.indexOf('<footer>'), `${file}: kit footer follows the dashboard footer`);
    for (const part of [html.slice(bar, html.indexOf('<header>')), html.slice(html.indexOf('class="sk-footer"'))]) {
      assert.equal((part.match(/aria-current="true"/g) ?? []).length, 1);
      assert.match(part, /<a href="https:\/\/koydas\.github\.io\/ai-dev-tools\/" aria-current="true">/);
      for (const site of ['koydas/', 'agent-patterns/', 'autonomous-dev-loop/', 'repo-orchestrator/']) assert.ok(part.includes(`https://koydas.github.io/${site}"`), `${file}: ${site}`);
    }
    assert.match(html, /href="https:\/\/github\.com\/koydas\/ai-dev-tools">GitHub</);
    assert.match(html, /<style>\/\* site-kit design tokens[\s\S]*--sk-bg: #05070f;/, `${file}: the kit CSS is inlined, no <link>`);
    assert.doesNotMatch(html, /<link|<script/);
  }
});

test('overview opens with the shared page header (the only h1); the other pages keep their own', () => {
  const p = pages();
  assert.match(p['index.html'], /<div class="sk-pagehead">[\s\S]*?<p class="sk-eyebrow">AI Dev Tools · Dashboard<\/p>\s*<h1 class="sk-title">Tool health<\/h1>/);
  assert.equal((p['index.html'].match(/<h1/g) ?? []).length, 1);
  for (const f of ['observations.html', 'evals.html']) {
    assert.doesNotMatch(p[f], /class="sk-pagehead"/);
    assert.equal((p[f].match(/<h1/g) ?? []).length, 1);
  }
});

test('the dashboard header sits below the sticky kit bar', () => {
  assert.match(pages()['index.html'], /header \{ position: sticky; top: var\(--sk-bar-h, 0px\);/);
});
