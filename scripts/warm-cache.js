import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error('Usage: node scripts/warm-cache.js <baseUrl>');
  process.exitCode = 1;
} else {
  await warm(baseUrl);
}

async function fetchJson(url) {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `${response.status} ${response.statusText}`);
  return body;
}

async function warm(rawBaseUrl) {
  const origin = new URL(rawBaseUrl).origin;
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const replayDir = path.join(root, 'data', 'replay');
  await mkdir(replayDir, { recursive: true });
  const prs = await fetchJson(`${origin}/api/prs`);
  const summary = [];

  for (const pr of prs) {
    for (const mode of ['graph', 'diffonly']) {
      const started = Date.now();
      try {
        const card = await fetchJson(`${origin}/api/analyze/${pr.number}?mode=${mode}&refresh=1`);
        await writeFile(
          path.join(replayDir, `${pr.number}-${mode}.json`),
          `${JSON.stringify(card, null, 2)}\n`
        );
        summary.push({ pr: `#${pr.number}`, mode, result: 'saved', ms: Date.now() - started });
      } catch (error) {
        summary.push({ pr: `#${pr.number}`, mode, result: `error: ${error.message}`, ms: Date.now() - started });
      }
    }
  }

  console.table(summary);
  const failures = summary.filter((row) => row.result !== 'saved').length;
  console.log(`Saved ${summary.length - failures}/${summary.length} replay cards to data/replay/.`);
  if (failures) process.exitCode = 1;
}
