#### Phase 1: Foundation (Days 1-2)

- Create GitHub App (pull requests read/write, contents read) and install it on one of your own repos.
- Express `/webhook` route that verifies the signature and handles `pull_request` actions `opened`, `synchronize`, `reopened` and `edited` (title, description or base branch changed).
- `createChatModel()` factory in `src/llm/` that returns a LangChain `BaseChatModel` from `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` and `LLM_BASE_URL`. It is the only place that names a provider.
- Fetch the PR diff via Octokit, make a single model call through that interface and post one PR comment with a hidden marker (`<!-- pr-review-agent -->`) so it can be edited later.
- Local dev with ngrok.

**Done when:** opening a PR on your repo gets a bot comment.

#### Phase 2: Agentic core (Days 3-5)

Build it as a LangGraph graph (see [Orchestration flow](./Plan.md#orchestration-flow)), starting with a single lens and adding the rest once it works.

- State schema (zod) holding raw data only, with `ReducedValue` reducers for `findings` and `lensFailures`.
- Nodes `prepare`, `chunk`, `lensRouter`, `merge`, `post`, as functions that return state updates (the router returns a `Command` with `Send`s).
- Lens agent as a graph (the agents-with-tools pattern): `initMessages`, `llmCall` with tools bound, `toolNode` for `search_code` and `read_file` (LangChain `tool()` with zod schemas, built per review around its `workDir`), a conditional edge back to `llmCall`, and a `report` node that uses structured output with the findings schema. Limits are counters in the agent state (model calls and tokens). Invalid structured output is retried once. A worker node per lens runs the agent on one batch and records a failed run in `lensFailures`.
- Fan-out: a conditional edge from `chunk` returns one `Send` per batch to `lensRouter`, which returns one `Send` per chosen lens. A worker that fails records its lens in `lensFailures` so the others continue. Set `maxConcurrency` on `invoke` to respect provider rate limits.
- Lenses (`security`, `quality` and `tests`), chunking with `BATCH_TOKEN_BUDGET`, and zod-validated findings with every field required (see [Review Design](./Plan.md#review-design)).
- Lens selection (see Plan.md): rules pick the required lenses per batch, the LLM only adds optional ones, and a failed router call runs all optional lenses.

**Done when:** the agent reads extra files on its own and posts one comment with findings grouped by severity and permalinks to the cited lines.

#### Phase 3: Reliability (Days 6-8)

- Webhook handler enqueues to BullMQ and returns 200 immediately.
- Idempotency by GitHub delivery ID, plus retries with exponential backoff.
- MySQL tables: `reviews` (with the head SHA, unique on delivery ID so a retried job updates its row), `findings`, `usage` (provider, model, tokens, latency, cost).
- `retryPolicy` on `prepare`, `post` and `save`. Keep `post` and `save` as separate nodes so a failed save never posts twice.
- Stale check node: before `post`, fetch the PR's current head SHA and return `Command({ goto: END })` if it has moved.
- Deduplication: the `merge` node (LLM grouping) removes duplicate findings within a run. On `synchronize` or `edited`, review the full diff and rebuild the comment from the new findings, so findings fixed by the push disappear and nothing is duplicated.
- Edit the single comment in place instead of posting a new one per push.
- Graceful shutdown: on SIGTERM and SIGINT, stop accepting webhooks (close the HTTP server), call `worker.close()` so the active job finishes, then close the Redis and MySQL connections. Set the shutdown timeout below Docker's `stop_grace_period`. A job that does not finish in time is left for BullMQ to retry from the start.
- Tests (Vitest + Testcontainers), in the LangGraph way:
    - Whole graph: compile the graph, inject a fake `BaseChatModel`, and invoke it. Cases: same issue from two lenses merged into one, a failed lens noted in the comment but not blocking the others, invalid structured output retried then dropped, an oversized diff chunked.
    - Single nodes: invoke `compiledGraph.nodes['merge']`, `['chunk']` and `['lensRouter']` directly with prepared state.
    - Lens selection: a router failure runs all optional lenses; a PR description saying "skip security" does not remove a required lens; a docs-only batch runs `quality` only; duplicate lens ids from the router run a lens once.
    - Reliability: duplicate webhook delivery, comment edited (not duplicated) on repeated pushes, stale head SHA, a title, description or base edit triggers a re-review, path traversal rejected, a retried job re-runs without a duplicate comment or duplicate database rows, SIGTERM during an active job lets it finish.
    - Eval case where a PR leaves a README line, an old comment and a resolved TODO behind, and the `quality` lens flags them.

**Done when:** a redelivered webhook and a re-pushed PR produce no duplicate comments, the bot keeps one up-to-date comment, and stopping the service mid-review does not lose the review or post duplicates.

#### Phase 4: Ship and prove it (Days 9-10)

- Dockerfile and Docker Compose (app, worker, Redis, MySQL), with `stop_grace_period` set.
- Deploy to a DigitalOcean droplet behind Nginx and Cloudflare, with HTTPS.
- GitHub Actions: test, build and deploy on merge to main.
- LangSmith observability: enable tracing through environment variables (`LANGSMITH_TRACING`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`). Each review is one trace showing every node, model call and tool call. Tag traces with the repo, PR number, head SHA and delivery ID. Tracing is off when no key is set, including in tests.
- Eval script: replay about 10 real PRs against two or three models and print a comparison table (findings found, false positives, tokens, latency, cost).
- README: architecture diagram, setup, design decisions (why a queue, idempotency, budgets, why a graph), a demo GIF, a link to a live PR with the bot's review and a link to a sample LangSmith trace.

**Done when:** the README lets a reader see a real review and understand the design choices in 2 minutes.
