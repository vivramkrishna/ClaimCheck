import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CardSchema } from '../../server/schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function jsonFiles(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(directory, entry.name));
}

test('all fixture and replay cards satisfy CardSchema', async () => {
  const files = [
    ...await jsonFiles(path.join(root, 'data', 'fixtures')),
    ...await jsonFiles(path.join(root, 'data', 'replay')),
  ];
  assert.ok(files.length > 0, 'expected at least one card fixture');
  for (const file of files) {
    const card = JSON.parse(await readFile(file, 'utf8'));
    const parsed = CardSchema.safeParse(card);
    assert.equal(parsed.success, true, `${path.relative(root, file)}: ${parsed.error?.message ?? ''}`);
  }
});
