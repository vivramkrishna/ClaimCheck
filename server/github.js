const API_ROOT = 'https://api.github.com';
const GRAPHQL_URL = 'https://api.github.com/graphql';

function repoConfig() {
  return {
    owner: process.env.DEMO_REPO_OWNER ?? '',
    name: process.env.DEMO_REPO_NAME ?? 'pr-reality-check-demo'
  };
}

function headers() {
  const result = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'pr-reality-check'
  };
  // An empty "Bearer " header makes GitHub answer 401; without a token, public repos still work (60 req/h).
  if (process.env.GITHUB_TOKEN) result.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return result;
}

function apiError(status, responseBody, responseHeaders) {
  const remaining = responseHeaders?.get?.('x-ratelimit-remaining');
  const reset = responseHeaders?.get?.('x-ratelimit-reset');
  const detail = typeof responseBody === 'object' && responseBody?.message
    ? responseBody.message
    : `GitHub request failed with status ${status}`;
  let message = detail;
  if (status === 401) message = 'GitHub authentication failed (401). Check GITHUB_TOKEN.';
  if (status === 403 && remaining === '0') {
    const resetText = reset ? ` Reset at ${new Date(Number(reset) * 1000).toISOString()}.` : '';
    message = `GitHub rate limit exceeded (403).${resetText}`;
  } else if (status === 403) message = `GitHub access forbidden (403): ${detail}`;
  if (status === 404) message = `GitHub resource not found (404): ${detail}`;
  const error = new Error(message);
  error.status = status;
  return error;
}

async function request(url, options = {}, attempt = 0) {
  const response = await fetch(url, {
    ...options,
    headers: { ...headers(), ...(options.headers ?? {}) }
  });

  let body = null;
  const text = await response.text();
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }

  if (response.ok) return { body, headers: response.headers };
  if (response.status >= 500 && attempt === 0) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return request(url, options, 1);
  }
  throw apiError(response.status, body, response.headers);
}

function restUrl(path) {
  const { owner, name } = repoConfig();
  if (!owner) {
    const error = new Error('DEMO_REPO_OWNER is required.');
    error.status = 500;
    throw error;
  }
  return `${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${path}`;
}

export async function getPR(number) {
  return (await request(restUrl(`/pulls/${number}`))).body;
}

export async function getPRFiles(number) {
  const files = [];
  for (let page = 1; ; page += 1) {
    const { body } = await request(restUrl(`/pulls/${number}/files?per_page=100&page=${page}`));
    files.push(...body);
    if (body.length < 100) return files;
  }
}

export async function getIssue(number) {
  return (await request(restUrl(`/issues/${number}`))).body;
}

export async function listOpenPRs() {
  return (await request(restUrl('/pulls?state=open&per_page=10'))).body;
}

export function linkedIssueFromBody(body) {
  const match = String(body ?? '').match(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

export async function resolveLinkedIssue(pr) {
  const bodyMatch = linkedIssueFromBody(pr?.body);
  if (bodyMatch) return { number: bodyMatch, source: 'body_regex' };

  // Do not use pr.issue_url: it points to the pull request's own issue record,
  // not to an issue that the pull request closes.
  // GraphQL always needs a token; without one, only the body regex is available.
  if (!process.env.GITHUB_TOKEN) return null;
  const { owner, name } = repoConfig();
  const query = `query($owner:String!,$name:String!,$n:Int!){
    repository(owner:$owner,name:$name){
      pullRequest(number:$n){closingIssuesReferences(first:5){nodes{number}}}
    }
  }`;
  const { body } = await request(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { owner, name, n: pr.number } })
  });
  if (body?.errors?.length) {
    const error = new Error(`GitHub GraphQL error: ${body.errors[0].message}`);
    error.status = 502;
    throw error;
  }
  const number = body?.data?.repository?.pullRequest?.closingIssuesReferences?.nodes?.[0]?.number;
  return number ? { number, source: 'graphql' } : null;
}

export function currentRepo() {
  return repoConfig();
}
