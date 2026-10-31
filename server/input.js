import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  currentRepo,
  getIssue,
  getPR,
  getPRFiles,
  listOpenPRs,
  resolveLinkedIssue
} from './github.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let graphAssetsPromise;
const fileMemo = new Map();

async function readJsonIfPresent(relativePath, fallback) {
  try {
    return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function graphAssets() {
  graphAssetsPromise ??= Promise.all([
    readJsonIfPresent('data/graph.json', { nodes: [], links: [] }),
    readJsonIfPresent('data/manifest.json', {
      repo: currentRepo(), graphCommit: null, graphifyVersion: null
    })
  ]);
  return graphAssetsPromise;
}

async function filesForOpenPR(pr) {
  const headSha = pr?.head?.sha ?? '';
  if (!fileMemo.has(headSha)) fileMemo.set(headSha, getPRFiles(pr.number));
  return fileMemo.get(headSha);
}

export async function buildInput(prNumber, mode) {
  if (!['graph', 'diffonly'].includes(mode)) {
    const error = new Error('mode must be graph or diffonly');
    error.status = 400;
    throw error;
  }

  const [pr, files, open, [graph, manifest]] = await Promise.all([
    getPR(prNumber),
    getPRFiles(prNumber),
    listOpenPRs(),
    graphAssets()
  ]);
  const linked = await resolveLinkedIssue(pr);
  const issue = linked ? await getIssue(linked.number) : null;
  const others = open.filter((candidate) => candidate.number !== pr.number).slice(0, 10);
  const openPRs = await Promise.all(others.map(async (candidate) => {
    const candidateLinked = await resolveLinkedIssue(candidate);
    return {
      number: candidate.number,
      title: candidate.title,
      author: candidate.user?.login ?? candidate.author ?? 'unknown',
      headSha: candidate.head?.sha ?? '',
      linkedIssue: candidateLinked?.number ?? null,
      files: await filesForOpenPR(candidate)
    };
  }));

  return {
    repo: currentRepo(),
    pr,
    files,
    issue,
    linkedIssueSource: linked?.source ?? null,
    openPRs,
    graph,
    manifest,
    mode
  };
}

export function clearInputMemoForTests() {
  graphAssetsPromise = undefined;
  fileMemo.clear();
}
