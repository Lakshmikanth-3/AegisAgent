# AegisAgent submission text

## Project name
AegisAgent — Autonomous Enterprise Treasury & Policy Guardrail Agent

## Primary track
Wildcard [Tinkerer]. Select exactly one track in HackOS.

## Problem and target users
Treasury operators need to capture useful early-payment discounts while checking supplier identity, purchase-order consistency, duplicate payments and cash reserves. A model explanation alone cannot authorize a safe payment.

## What it does
AegisAgent retrieves independent supplier, ERP and treasury exports through Zetaris. The reconciliation role writes its evidence into the Meterless World Model. An independent policy critic reads that shared state and requests another lookup when purchase-order evidence is missing. Nemotron, reached through Meterless Nightshift, explains a decision within the strict ceiling calculated by deterministic code. Results include the exact evidence, role handoffs, model identity, token usage and structured audit steps.

The structured assessment API and UI return PAY_EARLY, HOLD, REJECT or ESCALATE. They never send a payment. The original supplier-signed vault workflow remains available for on-chain settlement with independent signature and spending checks.

## Sponsor technology
- Zetaris is the active live data layer: four real queries across registered supplier, ERP and treasury file-store tables. Live source failure causes escalation.
- Meterless World Model is the actual vendored Apache-2.0 reference Engine, used by the roles to share evidence and risk facts with provenance. Its eight official conformance checks pass.
- Meterless Nightshift is the live reasoning provider, with runtime bearer authentication and app/scope headers.
- The verified NVIDIA model is nvidia/nemotron-3.5-lightning-30b-a3b, routed through Nightshift. Generated traces record the returned model and reported tokens, rather than assuming that an auto route used NVIDIA.

## What is new
The rebrand, live enterprise reconciliation, Nightshift transport, World Model integration, critic feedback, structured judging API and UI, credential-free sample mode, generated evidence and example outputs, Docker packaging, and new submission materials were added for this extension.

## Pre-existing work declaration
ArcSteward / Velo402 supplied the original Arc vault contracts, signatures, SDK, supplier/buyer flow, deterministic early-payment mathematics and hash-linked settlement audit. This pre-existing architecture must be declared in the submission form. Wildcard judging should assess the new work described above.

## Reproducibility
README.md contains install, sample, API, live sponsor setup, source registration, Engine conformance, tests and Docker commands. Four sample inputs produce computed outputs and generated JSONL traces without credentials. A changed amount or supplier changes the computed decision.

## Limitations and future work
Data is synthetic enterprise export data, even when queried live through Zetaris. This prototype does not connect to a real customer's ERP. The assessment API does not verify chain signatures or settle. The World Model reference has local single-writer JSON persistence. Future work includes production ERP connectors, explicit data freshness, authentication for hosted multi-tenant usage, and distributed durable state.

## Portal actions for the owner
Confirm registration and team roster before the first submission locks the team. Select Wildcard [Tinkerer], declare prior work, and upload a public repository link, the deck, and a publicly accessible 1–4 minute demo video. All account and portal actions remain with the owner until explicitly authorized.
