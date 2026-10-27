import { test } from 'node:test';
import assert from 'node:assert/strict';
import { llmFromEnv } from '../src/lib/earlypay/llm';

test('provider routing, real model identity, metering and failures', async () => {
  const envNames = ['METERLESS_BASE_URL', 'METERLESS_RUNTIME_TOKEN', 'METERLESS_MODEL', 'NVIDIA_API_KEY', 'NVIDIA_MODEL', 'GROQ_API_KEY', 'LLM_BASE_URL', 'LLM_MODEL', 'LLM_API_KEYS', 'LLM_API_KEY'];
  const saved = Object.fromEntries(envNames.map(k => [k, process.env[k]]));
  const originalFetch = globalThis.fetch, originalInfo = console.info;
  const logs: Record<string, unknown>[] = [];
  try {
    envNames.forEach(k => delete process.env[k]);
    console.info = (_label, event) => logs.push(event);
    assert.equal(llmFromEnv(), undefined);
    process.env.METERLESS_BASE_URL = 'http://127.0.0.1:8088/v1/';
    assert.throws(() => llmFromEnv(), /RUNTIME_TOKEN/);
    process.env.METERLESS_RUNTIME_TOKEN = 'runtime-test';
    process.env.NVIDIA_API_KEY = 'direct-test';
    process.env.METERLESS_MODEL = 'meterless/auto';
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'http://127.0.0.1:8088/v1/chat/completions');
      assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer runtime-test');
      assert.equal(JSON.parse(String(init?.body)).model, 'meterless/auto');
      return Response.json({ model: 'nvidia/nemotron-actual', choices: [{ message: { content: '{"decision":"HOLD"}' } }], usage: { total_tokens: 42 } });
    };
    const answer = await llmFromEnv()!('system', 'sensitive invoice');
    assert.equal(answer.model, 'nvidia/nemotron-actual');
    assert.equal(logs.at(-1)?.tokens, 42);
    assert.equal(logs.at(-1)?.provider, 'meterless-nightshift');
    assert.ok(!JSON.stringify(logs).includes('runtime-test'));
    assert.ok(!JSON.stringify(logs).includes('sensitive invoice'));
    delete process.env.METERLESS_BASE_URL; delete process.env.METERLESS_RUNTIME_TOKEN;
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'https://integrate.api.nvidia.com/v1/chat/completions');
      assert.equal(JSON.parse(String(init?.body)).model, 'nvidia/nemotron-4-340b-instruct');
      return Response.json({ choices: [{ message: { content: '{}' } }] });
    };
    await llmFromEnv()!('s', 'u');
    assert.equal(logs.at(-1)?.tokens, null);
    assert.equal(logs.at(-1)?.modelUsed, null);
    delete process.env.NVIDIA_API_KEY;
    process.env.LLM_API_KEYS = 'key-one,key-two';
    let count = 0;
    globalThis.fetch = async () => ++count === 1 ? new Response('', { status: 429 }) : Response.json({ choices: [{ message: { content: '{}' } }] });
    await llmFromEnv()!('s', 'u');
    assert.equal(count, 2);
    assert.equal(logs.at(-2)?.outcome, 'failed');
    globalThis.fetch = async () => { throw new Error('network unavailable'); };
    await assert.rejects(llmFromEnv()!('s', 'u'), /network unavailable/);
    assert.equal(logs.at(-1)?.outcome, 'failed');
    globalThis.fetch = async () => Response.json({ choices: [] });
    await assert.rejects(llmFromEnv()!('s', 'u'), /no decision text/);
  } finally {
    globalThis.fetch = originalFetch; console.info = originalInfo;
    for (const k of envNames) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
});
