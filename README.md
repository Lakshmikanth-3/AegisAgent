# AegisAgent

**Live app:** https://aegisagent-ai.vercel.app · [Treasury review](https://aegisagent-ai.vercel.app/treasury) (sample mode on the hosted site; live Zetaris + Nightshift locally) · [Owner console](https://aegisagent-ai.vercel.app/arc) · [Public repository](https://github.com/Lakshmikanth-3/AegisAgent)

**Autonomous Enterprise Treasury & Policy Guardrail Agent**

Open Agent Hackathon 2026 · Wildcard [Tinkerer]

AegisAgent reconciles invoices against independent supplier, ERP and treasury exports through **Zetaris**, shares evidence through the **Meterless World Model**, and asks **NVIDIA Nemotron through Nightshift** to reason inside a deterministic payment ceiling. The policy critic can request another lookup before allowing a decision.

## Run without credentials

Requires Node.js 22 and pnpm 9.15.9. From a fresh clone:

```sh
cd app
pnpm install --frozen-lockfile
npm run treasury:sample -- ../input_examples/example_1.json
npm run treasury:sample -- ../input_examples/example_2.json
npm run treasury:sample -- ../input_examples/example_3.json
npm run treasury:sample -- ../input_examples/example_4.json
```

These produce PAY_EARLY, HOLD, REJECT and ESCALATE respectively. Outputs are recomputed from raw cached records; the workflow never reads output_examples/. Try changing the amount or PO number. Sample mode makes no sponsor requests and never submits a transaction.

For the UI, copy app/.env.example to app/.env.local (the template defaults SAMPLE_MODE=true), then run `npm run dev -- -p 3001` from app/ and open [Treasury review](http://localhost:3001/treasury). Port 3000 belongs to the local Zetaris UI.

## Structured API

With the app running, from the repository root:

```sh
curl -X POST http://localhost:3001/api/treasury/run -H "Content-Type: application/json" --data-binary @input_examples/example_1.json
```

The API accepts invoiceNumber, supplierId, poNumber, amountUsdc (decimal string), discountBps, daysEarly, payoutAddress, and optional notes. Mode comes from server-side SAMPLE_MODE; clients cannot choose a live or cached data source. Results include the decision, structured audit, query evidence, real role handoffs, World Model audit, run ID and input hash. Validation errors return HTTP 400. Missing live evidence returns HTTP 503 with ESCALATE. No transaction is sent by this endpoint.

## Live sponsor setup

1. Start Zetaris using the [official installation guide](https://github.com/zetaris/getting-started) or the HackOS Participant Setup Guide. Its API normally listens at http://localhost:8888/api/v1.0 and its UI at http://localhost:3000.
2. Start Nightshift. Put your NVIDIA provider key in Nightshift Providers. Copy the Runtime token into the git-ignored app/.env.local, not into source. Set METERLESS_BASE_URL=http://127.0.0.1:8088/v1, METERLESS_RUNTIME_TOKEN and METERLESS_MODEL to a model discovered in your runtime. This machine successfully served **nvidia/nemotron-3.5-lightning-30b-a3b**. The original Nemotron-4 target was replaced by the model actually available and verified here.
3. Configure ZETARIS_REST_URL, ZETARIS_ORG_ID and either ZETARIS_API_KEY or ZETARIS_USERNAME + ZETARIS_PASSWORD. Username/password allow the adapter to renew expired login tokens. Settings stay server-only. Discover your actual organization ID in Zetaris; do not assume every installation uses 1.
4. Set SAMPLE_MODE=false. From app/, run `npm run treasury:bootstrap`. It copies the supplied exports into the configured driver's shared data path and idempotently registers four file-store tables across AEGIS_REGISTRY, AEGIS_ERP and AEGIS_TREASURY. Default container: zetaris-driver-1. Override ZETARIS_DRIVER_CONTAINER and ZETARIS_DATA_PATH for your deployment. `-- --skip-copy` uses data already provisioned at that path.
5. Run `npm run treasury:run -- ../input_examples/example_1.json` or use the same API/UI. Inspect actual returned model IDs and query records. Nightshift model discovery is available at /v1/models with the Runtime bearer token; meterless/auto alone does not prove a Nemotron request.

The data sources are small **synthetic enterprise exports**, not real customer systems. Live mode executes real Zetaris queries over those exports; sample mode reads the same raw data locally. This distinction appears in the UI, audit and logs. Zetaris is required in the live assessment path: an outage escalates rather than silently substituting cached evidence.

### Agent roles and feedback

PlannerAgent assigns reconciliation. ReconcilerAgent retrieves registry, PO, invoice-history and treasury evidence, then writes typed entities and facts to the World Model. PolicyCriticAgent reads that shared state, checks consistency, and requests a broader PO lookup when scoped evidence is missing. TreasuryReasonerAgent calls Nemotron through Nightshift with precomputed math and an allowed decision set. The critic independently validates the final decision against that ceiling. Retrieval and critique roles use deterministic code; the reasoning role uses the LLM in live mode. They are distinct workflow roles, not four independent model calls.

### Meterless Engine

The actual Apache-2.0 [World Model reference](https://github.com/Meterless/Meterless/tree/1742dec56a66e58eef9dda2d2b865823758ca8cd/engines/world-model/reference) is vendored with attribution in app/src/lib/treasury/world-model/. Each assessment uses a private persistent namespace; the reconciliation, critique and reasoning roles write/read evidence and risk facts through it. Its event log and provenance are returned in the review. **All eight official conformance checks pass** via `npm run world-model:test`. The reference uses a single writer and local JSON storage, suitable for a local prototype rather than a distributed production store.

### Traces and examples

Every run creates app/logs/run-<id>.jsonl and writes events to stdout. Traces include the input hash, roles, handoffs, query SQL/results, Engine activity, model request/response and policy validation. State lives under app/.data/.world/. AEGIS_LOG_DIR and AEGIS_STATE_DIR select other writable directories. Runtime traces/state are git-ignored. Sanitized, generated synthetic-data examples live in output_examples/ and logs/ for reviewers; they are evidence, never runtime inputs.

### Settlement boundary

Treasury review is an **assessment endpoint**: it returns a decision with evidence and never verifies chain signatures or moves funds. Missing metadata, unavailable sources or conflicting evidence always prevent an autonomous approval.

## Verify

From app/:

```sh
npm run treasury:test
npm run world-model:test
npm run earlypay:test
npm run typecheck
npm run build
```

The workflow and adapter tests cover all four decisions, changed inputs, cross-supplier PO discovery, source outages, input validation and hostile-model overrides. The existing EVM suites exercise real contracts locally, including randomized attacks. See [the readiness report](docs/HACKATHON_READINESS.md) for recorded results and remaining submission actions.

## Docker

From the repository root:

```sh
docker build -t aegis-agent .
docker run --rm -p 3001:3001 -e SAMPLE_MODE=true aegis-agent
```

For live mode use `--env-file app/.env.local` and set METERLESS_BASE_URL / ZETARIS_REST_URL to host.docker.internal instead of localhost on Docker Desktop. Docker does not install anything when the app starts. Provider tokens and local env/state are excluded from the image context.

## Submission and provenance

The on-chain settlement layer (vault contracts, signatures, SDK, supplier/buyer flow and early-payment maths) was built before the build window and is declared as pre-existing work in the submission form. New work includes live Zetaris reconciliation, Nightshift provider, World Model integration, role feedback, structured assessment API/UI, cached-data judging mode, generated traces/examples, Docker packaging and submission materials. [Submission text](docs/SUBMISSION.md) and [demo script](docs/HACKATHON_DEMO_SCRIPT.md) describe the new work.


---

## License

MIT
