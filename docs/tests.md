# Tests

The model is always replaced by a scripted fake, so no test calls an LLM or needs an API key.

```bash
npm run test:unit         # no services needed
npm run test:integration  # needs Docker (starts Redis and MySQL with Testcontainers)
npm test                  # both
```

Tests are in `tests/`. `tests/fixtures/test-key.pem` is a dummy file; the config only reads it.

## Unit tests (`tests/unit/`)

### `reviewGraph.test.ts` - the whole graph

The real graph runs (`chunk`, `lensRouter` with its fan-out, the lens agents, `merge` and the reducers). Only `prepare`, `staleCheck`, `post` and `save` are replaced, because they talk to GitHub or the database. The fake model answers by what it is asked.

| Test | What it checks |
| --- | --- |
| Full run | The router adds the `tests` lens to the required `quality` and `security`. The duplicate finding is merged to the most severe copy, and the result is sorted by severity. Findings carry the model and provider. There is one usage record each for the router, the three lenses and `merge`. `post` and `save` each run once |
| A lens fails | One lens throws. The run still finishes, `lensFailures` records it, `lensRuns` still has all runs, and `post` and `save` still run |
| Stale PR | When `staleCheck` reports the PR moved on, the run ends with `stale: true` and neither `post` nor `save` runs |

### `lensAgent.test.ts` - the agent loop

Runs the real lens agent with a scripted model and a stub `read_file` tool.

| Test | What it checks |
| --- | --- |
| Tool, then report | The requested tool runs, its result reaches the report call, findings come back, and calls and tokens are counted (3 calls, 27 tokens) |
| Invalid structured output | The report is retried once, and both report calls are counted |
| Model call throws | The run is marked `failed` and returns no findings |
| Limit reached | The loop stops at the call limit, still reports, and drops the unanswered tool call before the report |

### `webhook.test.ts` - the entry point

Mounts the real routes on an Express server, signs requests with HMAC-SHA256, and replaces the queue with a spy.

| Test | What it checks |
| --- | --- |
| Wrong signature | Returns 401 and enqueues nothing |
| Unhandled action | A correctly signed `closed` event returns 200 and enqueues nothing |
| Valid event | A correctly signed `opened` event returns 200 and enqueues the job with the delivery ID |

### `readFile.test.ts` - the `read_file` tool

| Test | What it checks |
| --- | --- |
| Numbered lines | Output is numbered and ends with a `[lines a-b of n]` footer |
| `..` path | Refused, and the file outside the checkout is not leaked |
| Absolute path | Refused in the same way |
| Symlink | A symlink pointing outside the checkout is refused |

### `chunk.test.ts` - batching

Uses a mocked config with a small token budget.

| Test | What it checks |
| --- | --- |
| Fits the budget | Files that fit end up in one batch |
| Large diff | Files are split into batches of whole files, in the original order |
| Oversized file | One huge file is split between hunks into numbered parts |

### `merge.test.ts` - the merge node

| Test | What it checks |
| --- | --- |
| Duplicates | Each group of duplicates keeps its most severe finding, and the result is sorted by severity |
| Model failure | All findings are kept, sorted, when the model call fails |

### `renderComment.test.ts` - the PR comment

| Test | What it checks |
| --- | --- |
| No findings | The comment says no issues were found |
| Grouping | Severity groups are ordered most severe first, empty groups are left out, and references are permalinks at the reviewed commit |
| Note | Skipped files and failed lenses are mentioned |

### `comments.test.ts` - one comment per PR

Uses a fake Octokit object.

| Test | What it checks |
| --- | --- |
| No comment yet | A comment is created, with the hidden marker at the start of its body |
| Existing comment | The comment posted by this app is edited, and no second comment is created |
| Someone else's comment | A comment that has the marker but was not posted by this app is never edited |

### `selectLenses.test.ts` - lens selection rules

| Test | What it checks |
| --- | --- |
| Docs only | A docs-only change requires `quality` only |
| Source or config | Source or config files also require `security` |

### `diff.test.ts` - line numbers

| Test | What it checks |
| --- | --- |
| `numberPatch` | Added and context lines get new-file line numbers (findings cite these), removed lines get none |

## Integration tests (`tests/integration/`)

### `queue.test.ts` - duplicate webhook deliveries

Starts a real Redis container with Testcontainers.

| Test | What it checks |
| --- | --- |
| Redelivery | The same delivery ID enqueued twice leaves one job. A different delivery ID for the same PR makes a second job |

### `save.test.ts` - saving a review

Starts a real MySQL container and creates the schema with the project's migrations.

| Test | What it checks |
| --- | --- |
| Stores a review | The review, its findings (with model and provider) and its usage rows are saved, with status `completed` |
| Same delivery again | A retried delivery keeps one review row, replaces the findings and usage of the first attempt instead of adding to them, and updates the status to `partial` |
| Every lens run failed | The status is `failed` |
