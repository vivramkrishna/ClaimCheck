import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;

const pass = (message) => console.log(`PASS  ${message}`);
const warn = (message) => console.log(`WARN  ${message}`);
const fail = (message) => { failures += 1; console.error(`FAIL  ${message}`); };
const exists = async (relativePath) => {
  try { await access(path.join(root, relativePath), constants.R_OK); return true; } catch { return false; }
};

const major = Number(process.versions.node.split('.')[0]);
if (major >= 20) pass(`Node ${process.versions.node} satisfies >=20`);
else fail(`Node ${process.versions.node} is unsupported; use Node 20+`);

for (const file of [
  'package-lock.json', '.github/workflows/ci.yml', 'LICENSE', 'SECURITY.md',
  'data/graph.json', 'data/graph.html', 'data/manifest.json'
]) {
  if (await exists(file)) pass(`${file} is present`);
  else fail(`${file} is missing`);
}

const example = await readFile(path.join(root, '.env.example'), 'utf8');
for (const name of ['GITHUB_TOKEN', 'GEMINI_API_KEY']) {
  if (new RegExp(`^${name}=$`, 'm').test(example)) pass(`${name} is a blank placeholder in .env.example`);
  else fail(`${name} must stay blank in .env.example`);
}

const ignored = await readFile(path.join(root, '.gitignore'), 'utf8');
if (/^\.env$/m.test(ignored)) pass('.env is ignored by Git');
else fail('.env must be listed in .gitignore');

try {
  const trackedEnv = execFileSync('git', ['ls-files', '--error-unmatch', '.env'], { cwd: root, stdio: 'ignore' });
  if (trackedEnv) fail('.env is tracked by Git');
} catch {
  pass('.env is not tracked by Git');
}

try {
  const graph = JSON.parse(await readFile(path.join(root, 'data', 'graph.json'), 'utf8'));
  const nodes = Array.isArray(graph.nodes) ? graph.nodes.length : 0;
  const edges = Array.isArray(graph.links) ? graph.links.length : Array.isArray(graph.edges) ? graph.edges.length : 0;
  if (nodes > 0 && edges > 0) pass(`graph contains ${nodes} nodes and ${edges} edges`);
  else fail('graph must contain nodes and edges');
} catch (error) {
  fail(`graph is not valid JSON: ${error.message}`);
}

try {
  const manifest = JSON.parse(await readFile(path.join(root, 'data', 'manifest.json'), 'utf8'));
  if (manifest.repo?.owner && manifest.repo.owner !== 'CHANGE_ME') pass(`graph owner is ${manifest.repo.owner}`);
  else fail('graph manifest owner is not configured');
  if (/^[a-f0-9]{40}$/i.test(manifest.graphCommit ?? '')) pass('graph manifest is pinned to a commit');
  else fail('graph manifest needs a 40-character commit SHA');
} catch (error) {
  fail(`manifest is not valid JSON: ${error.message}`);
}

if (await exists('.env')) {
  const env = await readFile(path.join(root, '.env'), 'utf8');
  for (const name of ['GITHUB_TOKEN', 'GEMINI_API_KEY']) {
    const configured = new RegExp(`^${name}=.+$`, 'm').test(env);
    if (configured) pass(`${name} is configured locally`);
    else warn(`${name} is not configured locally; fallback/replay behavior will be used`);
  }
} else {
  warn('.env is absent; copy .env.example to .env for live GitHub and Gemma calls');
}

if (failures) {
  console.error(`\nPreflight failed with ${failures} blocking issue(s).`);
  process.exitCode = 1;
} else {
  console.log('\nPreflight passed. The repository is ready for tests and deployment configuration.');
}
