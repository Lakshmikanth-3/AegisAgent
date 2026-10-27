import fs from 'node:fs';
import path from 'node:path';
import { runTreasury } from '../src/lib/treasury/workflow';

async function main() {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith('--')) || '../input_examples/example_1.json';
  const result = await runTreasury(JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')), { sample: args.includes('--sample') || process.env.SAMPLE_MODE === 'true' });
  const outputIndex = args.indexOf('--output');
  if (outputIndex >= 0) fs.writeFileSync(path.resolve(args[outputIndex + 1]), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}
main().catch(error => { console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid request' })); process.exitCode = 1; });
