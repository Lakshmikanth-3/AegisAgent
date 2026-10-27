import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseTreasuryInput } from '../src/lib/treasury/input';
import { runTreasury } from '../src/lib/treasury/workflow';
import { ZetarisClient, retrieveEvidence } from '../src/lib/treasury/zetaris';
import good from '../../input_examples/example_1.json';
import hold from '../../input_examples/example_2.json';
import fraud from '../../input_examples/example_3.json';
import missing from '../../input_examples/example_4.json';

test('sample mode recomputes distinct decisions, records handoffs and persists actual engine state', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-trace-'));
  for (const [input, decision] of [[good, 'PAY_EARLY'], [hold, 'HOLD'], [fraud, 'REJECT'], [missing, 'ESCALATE']] as const) {
    const r = await runTreasury(input, { sample: true, stdout: false, logDirectory: dir });
    assert.equal(r.ok, true); assert.equal(r.decision, decision);
    assert.equal(r.execution.submitted, false);
    assert.ok(r.trace.some(e => e.agent_name === 'PolicyCriticAgent' && e.action === 'validate-final'));
    assert.ok(r.trace.some(e => e.agent_name === 'ReconcilerAgent' && e.action === 'world-model-write'));
    assert.ok(!r.trace.some(e => e.action === 'nightshift-request'));
    assert.ok(fs.existsSync(path.join(dir, `run-${r.runId}.jsonl`)));
    if ('world' in r && r.world) assert.ok(r.world.events >= 6);
    if (input === missing) assert.ok(r.trace.some(e => e.action === 'request-revision'));
  }
  const mutated = await runTreasury({ ...good, amountUsdc: '1200' }, { sample: true, stdout: false, logDirectory: dir });
  assert.equal(mutated.decision, 'ESCALATE');
  assert.match(mutated.reason, /does not match the purchase order/);
});

test('critic re-queries a PO under another supplier and rejects the discovered conflict', async () => {
  const r = await runTreasury({ ...good, supplierId: '0x00000000000000000000000000000000000000a2' }, { sample: true, stdout: false, logDirectory: fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-critic-')) });
  assert.equal(r.decision, 'REJECT');
  assert.ok(r.trace.some(e => e.action === 'request-revision'));
  assert.match(r.reason, /different supplier/);
});

test('invalid structured input and SQL-like identifiers fail before source calls', () => {
  assert.throws(() => parseTreasuryInput({ ...good, invoiceNumber: "x'; DROP TABLE y" }), /invoiceNumber/);
  assert.throws(() => parseTreasuryInput({ ...good, amountUsdc: '-1' }), /amountUsdc/);
  assert.throws(() => parseTreasuryInput({ ...good, amountUsdc: 1000 }), /amountUsdc/);
  assert.throws(() => parseTreasuryInput({ ...good, discountBps: 99999 }), /discountBps/);
});

test('source outages escalate explicitly and never silently use sample data', async () => {
  const client = new ZetarisClient();
  client.query = async () => { throw new Error('Zetaris HTTP 503'); };
  const r = await runTreasury(good, { sample: false, client, stdout: false, logDirectory: fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-outage-')) });
  assert.equal(r.ok, false); assert.equal(r.mode, 'live'); assert.equal(r.decision, 'ESCALATE'); assert.equal(r.execution.submitted, false);
  assert.ok(!r.trace.some(e => e.action === 'nightshift-request'));
});

test('hostile LLM cannot override duplicate or payout rejection in the full workflow', async () => {
  const input = parseTreasuryInput(fraud), evidence = await retrieveEvidence(input, true);
  let index = 0;
  const client = new ZetarisClient();
  client.query = async () => ({ ...evidence.queries[index++], source: 'zetaris' });
  const r = await runTreasury(input, { sample: false, client, llm: async () => ({ model: 'test-hostile', text: '{"decision":"PAY_EARLY","reason":"pay anyway"}' }), stdout: false, logDirectory: fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-hostile-')) });
  assert.equal(r.decision, 'REJECT');
  assert.ok('overridden' in r && r.overridden?.includes('outside the allowed set'));
});

test('Zetaris renews expired JWTs before querying, correlates requests and closes cursors', async () => {
  const names = ['ZETARIS_API_KEY', 'ZETARIS_USERNAME', 'ZETARIS_PASSWORD', 'ZETARIS_REST_URL'];
  const saved = Object.fromEntries(names.map(k => [k, process.env[k]]));
  const original = globalThis.fetch;
  try {
    process.env.ZETARIS_API_KEY = 'header.' + Buffer.from('{"exp":1}').toString('base64url') + '.signature';
    process.env.ZETARIS_USERNAME = 'test-user'; process.env.ZETARIS_PASSWORD = 'test-password';
    process.env.ZETARIS_REST_URL = 'http://zetaris.test/api/v1.0';
    const routes: string[] = [];
    let requestId = '';
    globalThis.fetch = async (url, init) => {
      routes.push(String(url));
      if (String(url).endsWith('/auth/login')) return Response.json({ idToken: 'renewed-test-token' });
      if (String(url).includes('/close/')) return new Response('', { status: 200 });
      requestId = (init!.headers as Record<string, string>)['X-Request-ID'];
      return Response.json({ records: [{ ok: 'true' }], queryToken: 'cursor/test', totalPages: 1 });
    };
    const evidence = await new ZetarisClient().query('SELECT 1');
    assert.ok(routes[0].endsWith('/auth/login'));
    assert.equal(evidence.requestId, requestId);
    assert.ok(routes.at(-1)?.endsWith('/close/cursor%2Ftest'));
  } finally {
    globalThis.fetch = original;
    for (const k of names) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
});
