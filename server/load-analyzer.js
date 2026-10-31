// Loads the real analyzer (server/analyze.js). Falls back to the synthetic stub ONLY when
// analyze.js does not exist. Any other load error (syntax error, missing dependency) is
// rethrown so a broken deploy fails loudly instead of quietly serving synthetic cards.
import { access } from 'node:fs/promises';

const realPath = new URL('./analyze.js', import.meta.url);

export async function loadAnalyzer() {
  try {
    await access(realPath);
  } catch {
    return { analyzer: await import('./analyze.stub.js'), kind: 'stub' };
  }
  return { analyzer: await import('./analyze.js'), kind: 'real' };
}
