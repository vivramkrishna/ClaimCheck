import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const PROMPT_VERSION = 'stub';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function analyze(input) {
  const fixtureName = input.mode === 'diffonly'
    ? 'card.diffonly.sample.json'
    : 'card.graph.sample.json';
  const fixture = JSON.parse(await readFile(path.join(root, 'data', 'fixtures', fixtureName), 'utf8'));
  fixture.mode = input.mode;
  fixture.pr = {
    number: input.pr.number,
    title: input.pr.title,
    author: input.pr.user?.login ?? input.pr.author ?? 'unknown',
    headSha: input.pr.head?.sha ?? '',
    linkedIssue: input.issue?.number ?? null
  };
  fixture.provenance = {
    ...fixture.provenance,
    mode: 'live',
    model: 'stub',
    graphCommit: input.manifest?.graphCommit ?? null,
    graphifyVersion: input.manifest?.graphifyVersion ?? null,
    generatedAt: new Date().toISOString()
  };
  return fixture;
}
