import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(root, 'data', 'cache');
const replayDir = path.join(root, 'data', 'replay');

let promptVersion = 'stub';
try {
  ({ PROMPT_VERSION: promptVersion } = await import('./analyze.js'));
} catch {
  ({ PROMPT_VERSION: promptVersion } = await import('./analyze.stub.js'));
}

export function cacheKey(input, options = {}) {
  const version = options.promptVersion ?? promptVersion;
  const model = options.model ?? process.env.GEMMA_MODEL ?? 'gemma-4-26b-a4b-it';
  const openSnapshot = [...(input.openPRs ?? [])]
    .map((pr) => `${pr.number}:${pr.headSha}`)
    .sort()
    .join(',');
  const material = [
    input.pr?.head?.sha ?? '',
    input.issue?.updated_at ?? '',
    openSnapshot,
    input.manifest?.graphCommit ?? '',
    version,
    model,
    input.mode
  ].join('|');
  return createHash('sha1').update(material).digest('hex');
}

function cachePath(prNumber, mode, key) {
  return path.join(cacheDir, `${prNumber}-${mode}-${key}.json`);
}

export async function get(prNumber, mode, key) {
  try {
    return JSON.parse(await readFile(cachePath(prNumber, mode, key), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function set(prNumber, mode, key, card) {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cachePath(prNumber, mode, key), `${JSON.stringify(card, null, 2)}\n`);
  return card;
}

export async function getReplay(prNumber, mode) {
  try {
    return JSON.parse(await readFile(path.join(replayDir, `${prNumber}-${mode}.json`), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/** PR summaries reconstructed from recorded replay cards (used when GitHub is unreachable). */
export async function listReplays() {
  let names;
  try {
    names = await readdir(replayDir);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const byNumber = new Map();
  for (const name of names.filter((n) => /^\d+-(graph|diffonly)\.json$/.test(n)).sort()) {
    const card = JSON.parse(await readFile(path.join(replayDir, name), 'utf8'));
    const number = card?.pr?.number;
    if (!Number.isInteger(number) || byNumber.has(number)) continue;
    byNumber.set(number, {
      number,
      title: card.pr.title ?? '',
      author: card.pr.author ?? 'unknown',
      headSha: card.pr.headSha ?? '',
      linkedIssue: card.pr.linkedIssue ?? null,
      url: null,
      source: 'replay'
    });
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

export function cachePromptVersion() {
  return promptVersion;
}
