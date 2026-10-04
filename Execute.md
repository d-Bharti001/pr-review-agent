#### Phase 1: Foundation (Days 1-2)

- Create GitHub App (pull requests read/write, contents read) and install it on one of your own repos.
- Express `/webhook` route that verifies the signature and handles `pull_request` actions `opened`, `synchronize`, `reopened` and `edited` (title, description or base branch changed).
- Fetch the PR diff via Octokit, make a single LLM call and post one PR comment with a hidden marker (`<!-- pr-review-agent -->`) so it can be edited later.
- Local dev with ngrok.

**Done when:** opening a PR on your repo gets a bot comment.

#### Phase 2: Agentic core (Days 3-5)

- Hand-written agent loop with the tools in Plan.md (Retrieval), a step limit and a per-PR token budget.
- Lenses (`security`, `quality` and `tests`), chunking, zod-validated findings with citation verification (see [Review Design](./Plan.md#review-design)). Run lenses with `Promise.allSettled` so a failed lens is logged and noted in the comment while the others still post (see [Orchestration flow](./Plan.md#orchestration-flow)).
- Post a single comment with findings grouped by severity.

**Done when:** the agent reads extra files on its own and posts one comment with findings grouped by severity and verified citations.

#### Phase 3: Reliability (Days 6-8)

- Webhook handler enqueues to BullMQ and returns 200 immediately.
- Idempotency by GitHub delivery ID, plus retries with exponential backoff.
- Postgres tables: `reviews` (with the head SHA), `findings`, `usage` (provider, model, tokens, latency, cost).
- Deduplication: the LLM merge step removes duplicate findings within a run. On `synchronize`, review the full diff and rebuild the comment from the new findings, so findings fixed by the push disappear and nothing is duplicated.
- Stale-job check: before posting, fetch the PR's current head SHA and discard the result if it has moved.
- Edit the single comment in place instead of posting a new one per push.
- Tests (Vitest + Testcontainers): duplicate webhook delivery, same issue from two lenses merged into one (scripted fake client), comment edited (not duplicated) on repeated pushes, stale head SHA, a title, description or base edit triggers a re-review, invalid LLM output, fabricated citation dropped, oversized diff chunked, path traversal rejected, eval case where a PR leaves a README line, an old comment and a resolved TODO behind, and the `quality` lens flags them.

**Done when:** a redelivered webhook and a re-pushed PR produce no duplicate comments, and the bot keeps one up-to-date comment.

#### Phase 4: Ship and prove it (Days 9-10)

- Dockerfile and Docker Compose (app, worker, Redis, Postgres).
- Deploy to a DigitalOcean droplet behind Nginx and Cloudflare, with HTTPS.
- GitHub Actions: test, build and deploy on merge to main.
- Eval script: replay about 10 real PRs against two or three models and print a comparison table (findings found, false positives, tokens, latency, cost).
- README: architecture diagram, setup, design decisions (why a queue, idempotency, budgets), a demo GIF and a link to a live PR with the bot's review.

**Done when:** the README lets a reader see a real review and understand the design choices in 2 minutes.
