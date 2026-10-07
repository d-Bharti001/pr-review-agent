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
- Nodes `prepare`, `chunk`, `merge`, `post`, as plain functions that return state updates.
- Lens worker as a subgraph (the agents-with-tools pattern): `llmCall` with tools bound, `toolNode` for `search_code` and `read_file` (LangChain `tool()` with zod schemas), a conditional edge back to `llmCall`, and a `report` node that uses structured output with the findings schema. Step limit = recursion limit, token budget = a counter in the worker state. Invalid structured output is stored in state and retried once.
- Fan-out: a conditional edge from `chunk` returns one `Send` per batch and per enabled lens. A worker that fails records its lens in `lensFailures` so the others continue.
- Lenses (`security`, `quality` and `tests`), chunking, zod-validated findings (see [Review Design](./Plan.md#review-design)).

**Done when:** the agent reads extra files on its own and posts one comment with findings grouped by severity and permalinks to the cited lines.

#### Phase 3: Reliability (Days 6-8)

- Webhook handler enqueues to BullMQ and returns 200 immediately.
- Idempotency by GitHub delivery ID, plus retries with exponential backoff.
- Postgres tables: `reviews` (with the head SHA, unique on delivery ID so a retried job updates its row), `findings`, `usage` (provider, model, tokens, latency, cost).
- `retryPolicy` on `prepare`, `post` and `save`. Keep `post` and `save` as separate nodes so a failed save never posts twice.
- Stale check node: before `post`, fetch the PR's current head SHA and return `Command({ goto: END })` if it has moved.
- Deduplication: the `merge` node (LLM grouping) removes duplicate findings within a run. On `synchronize` or `edited`, review the full diff and rebuild the comment from the new findings, so findings fixed by the push disappear and nothing is duplicated.
- Edit the single comment in place instead of posting a new one per push.
- Graceful shutdown: on SIGTERM and SIGINT, stop accepting webhooks (close the HTTP server), call `worker.close()` so the active job finishes, then close the Redis and Postgres connections. Set the shutdown timeout below Docker's `stop_grace_period`. A job that does not finish in time is left for BullMQ to retry from the start.
- Tests (Vitest + Testcontainers), in the LangGraph way:
    - Whole graph: compile the graph, inject a fake `BaseChatModel`, and invoke it. Cases: same issue from two lenses merged into one, a failed lens noted in the comment but not blocking the others, invalid structured output retried then dropped, an oversized diff chunked.
    - Single nodes: invoke `compiledGraph.nodes['merge']` and `['chunk']` directly with prepared state.
    - Reliability: duplicate webhook delivery, comment edited (not duplicated) on repeated pushes, stale head SHA, a title, description or base edit triggers a re-review, path traversal rejected, a retried job re-runs without a duplicate comment or duplicate database rows, SIGTERM during an active job lets it finish.
    - Eval case where a PR leaves a README line, an old comment and a resolved TODO behind, and the `quality` lens flags them.

**Done when:** a redelivered webhook and a re-pushed PR produce no duplicate comments, the bot keeps one up-to-date comment, and stopping the service mid-review does not lose the review or post duplicates.

#### Phase 4: Ship and prove it (Days 9-10)

- Dockerfile and Docker Compose (app, worker, Redis, Postgres), with `stop_grace_period` set.
- Deploy to a DigitalOcean droplet behind Nginx and Cloudflare, with HTTPS.
- GitHub Actions: test, build and deploy on merge to main.
- LangSmith observability: enable tracing through environment variables (`LANGSMITH_TRACING`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`). Each review is one trace showing every node, model call and tool call. Tag traces with the repo, PR number, head SHA and delivery ID. Tracing is off when no key is set, including in tests.
- Eval script: replay about 10 real PRs against two or three models and print a comparison table (findings found, false positives, tokens, latency, cost).
- README: architecture diagram, setup, design decisions (why a queue, idempotency, budgets, why a graph), a demo GIF, a link to a live PR with the bot's review and a link to a sample LangSmith trace.

**Done when:** the README lets a reader see a real review and understand the design choices in 2 minutes.
