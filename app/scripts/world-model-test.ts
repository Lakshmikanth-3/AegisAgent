import path from 'node:path';
import { pathToFileURL } from 'node:url';
process.env.WORLD_MODEL_IMPL = path.resolve('src/lib/treasury/world-model/index.ts');
void import(pathToFileURL(path.resolve('scripts/world-model-conformance/runner.ts')).href);
