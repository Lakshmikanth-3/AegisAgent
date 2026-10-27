import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export type TraceEvent = { timestamp: string; runId: string; inputHash: string; agent_name: string; action: string; target_agent?: string; status: string; details: unknown };
export function createTrace(input: unknown, options: { directory?: string; stdout?: boolean } = {}) {
  const runId = randomUUID();
  const inputHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const events: TraceEvent[] = [];
  const directory = options.directory || process.env.AEGIS_LOG_DIR || path.resolve(process.cwd(), 'logs');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `run-${runId}.jsonl`);
  function emit(agent_name: string, action: string, status: string, details: unknown, target_agent?: string) {
    const event = { timestamp: new Date().toISOString(), runId, inputHash, agent_name, action, target_agent, status, details };
    events.push(event);
    fs.appendFileSync(file, JSON.stringify(event) + '\n');
    if (options.stdout !== false) console.info(JSON.stringify(event));
  }
  return { runId, inputHash, file, events, emit };
}
