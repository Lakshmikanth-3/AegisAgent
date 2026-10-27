import fs from 'node:fs';
import path from 'node:path';
import { runTreasury } from '../src/lib/treasury/workflow';

async function main() {
  const live = process.argv.includes('--live');
  const names = live ? [1, 2, 3, 4] : [1, 2, 3, 4];
  const directory = path.resolve('../logs');
  for (const i of names) {
    const result = await runTreasury(JSON.parse(fs.readFileSync(`../input_examples/example_${i}.json`, 'utf8')), { sample: !live, stdout: false, logDirectory: directory });
    fs.writeFileSync(`../output_examples/${live ? 'live-' : ''}example_${i}.json`, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ input: `example_${i}`, mode: result.mode, decision: result.decision, ok: result.ok, runId: result.runId }));
    if (!result.ok) process.exitCode = 1;
  }
}
main().catch(() => { console.error('Evidence generation failed; inspect the generated trace.'); process.exitCode = 1; });
