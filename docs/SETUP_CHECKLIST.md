# Setup checklist — what only you can do

Everything in this repo is merged and tested (branch `integrate` = Codex app shell + Claude core engine).
`npm test` passes; `npm run dev:offline` runs the full app on synthetic fixtures with no keys.
What is left needs your accounts, keys or network. Do it in this order.

## 1. Keys and accounts (5 min)

| What | Where | Goes in |
|---|---|---|
| **Gemini API key** (for Gemma 4) | https://aistudio.google.com/apikey → Create API key. Check the quota page for `gemma-4-26b-a4b-it`. | `GEMINI_API_KEY` |
| **GitHub fine-grained PAT** | GitHub → Settings → Developer settings → Fine-grained tokens → *Only select repositories*: `pr-reality-check-demo`. Repository permissions: **Contents: Read, Issues: Read, Pull requests: Read, Metadata: Read**. Nothing with write. | `GITHUB_TOKEN` |
| **Your GitHub username** | — | `DEMO_REPO_OWNER` |
| **Cloudways Velocity account** | Sign up, coupon **CWFEST20**, connect GitHub | — |
| (optional) 2nd GitHub account | Opens PR C so the "possible duplicate" story has a different author | — |

```bash
cp .env.example .env     # fill GITHUB_TOKEN, GEMINI_API_KEY, DEMO_REPO_OWNER
```

## 2. Demo repo on GitHub (10 min)

The demo repo Codex prepared lives at `../pr-reality-check-demo` (main `c94cfc3` + 3 branches).

```bash
cd ../pr-reality-check-demo
gh repo create pr-reality-check-demo --public --source . --remote origin   # or create it on github.com and `git remote add origin ...`
git push -u origin main
```

## 3. Graph from Graphify (5 min) — must be from the pushed `main`

```bash
cd ../mlh_hack_comms
uv tool install graphifyy          # once; then `uv tool update-shell` if `graphify` is not found
scripts/import-graph.sh ../pr-reality-check-demo
```

Read the `--inspect` output it prints:
- `[1] Line numbers ... OK` → good. `NONE` → still works, cards will say precision "file".
- `[2] ... source = CALLEE` → set `EDGE_SOURCE_IS_CALLER=false` in `.env` **and** in Cloudways.
- `[3] ABSOLUTE paths` → the script must be run from the app folder with the demo path as shown.
- `Unknown relations` → tell Claude the names; one alias line in `server/graph.js`.

## 4. Issue + PRs (5 min) — after the graph, never push demo `main` again

Use `../pr-reality-check-demo/GITHUB_TEXT.md` (it has the exact text and `gh` commands):
1. Issue #1 "Users are logged out a few seconds after logging in".
2. Push and open PR A `fix/session-ttl-ms`, PR B `fix/login-timeout`, PR C `fix-expiry-units` (expect numbers #2, #3, #4).

## 5. Local check with real data (5 min)

```bash
npm start                                   # http://localhost:3000
curl localhost:3000/api/health              # graphLoaded, githubTokenSet, geminiKeySet must all be true
npm run check -- 3 --no-llm                 # PR B -> RULE PRIORITY likely_off_target
npm run check -- 2 --no-llm                 # PR A -> review_first
npm run check -- 4 --no-llm                 # PR C -> overlap possible_duplicate with #2
npm run check -- 3                          # live Gemma -> "Card (assessment: model)"
```

If the last one says `assessment: fallback`, the reason is in `assessment.limitations` (bad key, 429 quota, timeout).

## 6. Commit and deploy (15 min)

```bash
git add data/graph.json data/graph.html data/manifest.json
git commit -m "data: graph for demo main"
git checkout main && git merge --ff-only integrate && git push origin main
```

Cloudways Velocity: new app → this GitHub repo, branch `main` → framework preset chosen **manually** (Node.js) → Node 22, root `/`, build command `npm install` (or `npm ci` once a lockfile is committed), start `npm start` → env vars as **Sensitive**: `GITHUB_TOKEN`, `GEMINI_API_KEY`, `GEMMA_MODEL=gemma-4-26b-a4b-it`, `DEMO_REPO_OWNER`, `DEMO_REPO_NAME=pr-reality-check-demo` (+ `EDGE_SOURCE_IS_CALLER=false` only if step 3 said so). Do not set `PORT`.

Then: open `https://<app>/api/health`, open the UI on your phone, and put the URL in `README.md` and `skills/pr-reality-check/SKILL.md` (`<cloudways-url>`).

## 7. Replay backup (5 min, before lunch and again at 3:05)

```bash
node scripts/warm-cache.js https://<app>
git add data/replay && git commit -m "data: replay cards" && git push
```

Check each saved card has `"assessmentSource": "model"` before you rely on it. Record the 2-minute backup video after this.

## Known limits (honest list)
- Tailwind is loaded from `cdn.tailwindcss.com`. If venue Wi-Fi blocks it the page still works but is unstyled; use your phone hotspot.
- No `package-lock.json` yet: run `npm install` once with network and commit the lockfile for reproducible Cloudways builds.
- Live Gemma has been verified only through the real `@google/genai` SDK with a mocked HTTP response; the first real call is step 5.
