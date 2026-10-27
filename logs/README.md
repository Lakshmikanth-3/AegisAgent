# Generated example traces

Each JSONL file is emitted by the real workflow and matches a runId in output_examples/. Four sample-mode and four successful live-mode examples are included. Input hashes identify the processed invoices. Live events include actual Zetaris records, Engine activity, role feedback and the returned Nightshift model. Diagnostic runs are retained locally under git-ignored app/logs/diagnostics.

All record values are from the supplied synthetic data. No token, credential or prompt is logged. Recreate these files from app/ with npm run treasury:evidence; add -- --live for real local Zetaris/Nightshift calls.
