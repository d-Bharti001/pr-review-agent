# PR Review Agent

[![CI/CD](https://github.com/d-Bharti001/pr-review-agent/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/d-Bharti001/pr-review-agent/actions/workflows/ci.yml)

A GitHub App that reviews pull requests with LLM agents. It reads the relevant parts of the codebase as needed, and posts **one comment per PR**, edited in place on every update, with findings grouped by severity and permalinks to the exact lines.

**Stack:** TypeScript, Node.js, Express, BullMQ, Redis, MySQL, db-migrate, LangGraph.js, LangChain.js, LangSmith, Octokit, zod, Docker Compose.

### Example run

Model used: `nvidia/nemotron-3-super-120b-a12b:free`
Provider: `openrouter`

**Each review is traced end to end in LangSmith:**

<figure style="text-align: center;">
  <img src="docs/images/langsmith-trace.png" alt="langsmith trace" width="90%" style="border: 1px solid #ddd; padding: 4px;">
  <figcaption style="font-size: 0.85em;">LangSmith trace of a review</figcaption>
</figure>

**Comment on a GitHub PR:**

<figure style="text-align: center;">
  <img src="docs/images/review-comment.png" alt="review comment" width="80%" style="border: 1px solid #ddd; padding: 4px;">
  <figcaption style="font-size: 0.85em;">A review comment on a pull request</figcaption>
</figure>

**Every review, finding and model call is saved in the database:**

<figure style="text-align: center;">
  <img src="docs/images/pr-review-database.png" alt="database tables" width="90%" style="border: 1px solid #ddd; padding: 4px;">
  <figcaption style="font-size: 0.85em;">The <code>reviews</code>, <code>findings</code> and <code>llm_usage</code> tables</figcaption>
</figure>

## How it works

```
GitHub --webhook--> server --> Redis (BullMQ) --> worker --> review graph --> PR comment
                                                                 |
                                                                 +--> MySQL (reviews, findings, llm_usage)
```

The webhook server verifies the signature and enqueues a job, so GitHub always gets a fast `200`. The worker runs the review as a LangGraph workflow:

- **Lens selection.** Rules pick the required lenses (quality always, security for source or config files). The LLM can only add optional ones, so a diff cannot switch off a review.
- **Lens agents.** Each lens is a small agent with a tool loop (`read_file`, `search_code`) that checks the diff against the real codebase, with limits on calls and tokens.
- **Merge, then post.** Findings are deduplicated and sorted by severity, then the single PR comment is created or edited.

```mermaid
flowchart TD
    A["GitHub PR event: opened, synchronize, reopened, edited"] --> B["Express /webhook<br/>verify signature, enqueue, return 200"]
    B --> C["BullMQ queue<br/>job: repo, PR number, headSha, delivery ID"]
    C --> D["prepare<br/>diff, base and head checkout, skip rules, PR title and description"]
    D -- "head SHA moved: stale" --> X["END: discard result"]
    D --> E["chunk<br/>token estimate, fits budget: one batch, otherwise several"]
    E -- "Send: one per batch" --> R["lensRouter<br/>rules pick required lenses, LLM adds optional ones"]
    E -- "no files left to review" --> H
    R -- "Send: one per chosen lens" --> G1["security worker"]
    R -- "Send" --> G2["quality worker"]
    R -- "Send" --> G3["tests worker"]
    G1 -- "findings reducer" --> H["merge<br/>LLM groups duplicates, sort by severity"]
    G2 -- "findings reducer" --> H
    G3 -- "findings reducer" --> H
    H --> I{"stale check<br/>head SHA unchanged?"}
    I -- "no" --> J["END: discard result"]
    I -- "yes" --> K["post<br/>create or edit the single comment"]
    K --> L["save<br/>reviews, findings, llm usage to MySQL"]
    L --> M["END"]
```

Each lens run is its own small graph:

```mermaid
flowchart TD
    S["Input: lens prompt + shared rules, PR header, diff batch"] --> I["initMessages<br/>system and user messages"]
    I --> L["llmCall<br/>model with tools bound"]
    L --> F{"model call failed?"}
    F -- yes --> Z["END: the worker records the lens as failed"]
    F -- no --> T{"tool calls, and under the step and token limits?"}
    T -- yes --> R["toolNode<br/>search_code, read_file"]
    R --> L
    T -- no --> O["report<br/>structured output with the zod findings schema"]
    O --> V{"valid?"}
    V -- "no, first time" --> O
    V -- "no, second time" --> X["return no findings"]
    V -- yes --> D["return findings"]
```

## Design highlights

- **Reliable webhooks.** The job ID is the GitHub delivery ID, so redeliveries are ignored, and `save` replaces earlier results of the same delivery. A crashed worker's job is picked up again.
- **Stale runs are dropped.** The PR head is checked at the start and again before posting, because a newer push has its own review.
- **Graceful degradation.** A failing lens is reported in the comment instead of failing the review. If the router fails, all optional lenses run.
- **Large diffs** are split into batches under a token budget, and findings are merged afterwards.
- **Any LLM provider** (Anthropic, Gemini, OpenAI, OpenRouter, Ollama) through one `ChatModel` class. Every call is recorded in `llm_usage`, and findings store the model that produced them.

## Documentation

- [Architecture](docs/architecture.md): pipeline, lenses, agent loop, findings, state and failure handling.
- [Setup](docs/setup.md): GitHub App, configuration, Docker Compose, a server with systemd, and the CI/CD pipeline.
- [Tests](docs/tests.md): what each test checks.

## Quick start

```bash
cp .env.example .env     # fill in the GitHub App and LLM values
docker compose up --build
```

The model must support tool calling and structured output; small local models may fail on this. Free-tier API quotas can be too low for a full review, and failed lenses are reported in the GitHub comment.
