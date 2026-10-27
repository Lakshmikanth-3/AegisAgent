import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

async function main() {
  const directory = path.resolve('../submission');
  fs.mkdirSync(directory, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, recordVideo: { dir: path.join(directory, 'raw'), size: { width: 1600, height: 1000 } } });
  const page = await context.newPage();
  const started = Date.now();
  const events: { seconds: number; caption: string }[] = [];
  const results: unknown[] = [];
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  async function caption(text: string) {
    events.push({ seconds: (Date.now() - started) / 1000, caption: text });
    console.log(text);
    await page.evaluate(text => {
      let el = document.getElementById('demo-commentary');
      if (!el) { el = document.createElement('div'); el.id = 'demo-commentary'; el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#06110ef5;border-top:1px solid #5a8667;color:#e8eee9;font:21px/1.5 Arial;padding:18px 55px;box-sizing:border-box;pointer-events:none'; document.body.append(el); }
      el.textContent = text;
    }, text);
  }
  async function review(label: string, expected: string) {
    await page.getByRole('button', { name: label, exact: true }).click();
    const pending = page.waitForResponse(r => r.url().includes('/api/treasury/run') && r.request().method() === 'POST', { timeout: 120_000 });
    await page.getByRole('button', { name: 'Review invoice', exact: true }).click();
    const response = await pending;
    const result = await response.json(); results.push(result);
    if (!result.ok || result.mode !== 'live' || result.decision !== expected) throw new Error(`Live ${label} review did not return ${expected}`);
    await page.locator('.tr-grid').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    return result;
  }
  try {
    await page.goto(process.env.AEGIS_DEMO_URL || 'http://127.0.0.1:3001/treasury');
    await caption('AegisAgent reviews early-payment offers for treasury operators. This is the running product using synthetic enterprise exports.');
    await page.waitForTimeout(12_000);
    await caption('A $1,000 invoice offers 2% off for payment 60 days early. The agents now retrieve live Zetaris evidence and reason through Nightshift.');
    await review('Good discount', 'PAY_EARLY');
    await caption('The decision is PAY EARLY. Code checks yield and reserve; the model can only choose within that ceiling. Any model failure uses a visibly flagged policy fallback. No funds move here.');
    await page.waitForTimeout(12_000);
    await page.screenshot({ path: path.join(directory, 'treasury-approved.png'), fullPage: false });
    await page.getByRole('tab', { name: 'Source records', exact: true }).click();
    await caption('These are actual Zetaris query results from the supplier registry, purchase-order export, invoice history and treasury balance.');
    await page.waitForTimeout(10_000);
    await page.getByRole('tab', { name: 'Agent activity', exact: true }).click();
    await caption('The Meterless World Model shares evidence between roles. Each request records its returned model, tokens and policy validation.');
    await page.locator('.tr-trace article').last().scrollIntoViewIfNeeded();
    await page.waitForTimeout(10_000);
    await caption('Now a previously paid invoice requests a different payout address. The same live workflow checks both independent records.');
    await review('Duplicate + redirection', 'REJECT');
    await page.getByRole('tab', { name: 'Explain why', exact: true }).click();
    await caption('REJECT: the ERP already marks the invoice paid, and the requested address conflicts with the registry. The model cannot turn rejection into payment.');
    await page.waitForTimeout(12_000);
    await page.screenshot({ path: path.join(directory, 'treasury-rejected.png'), fullPage: false });
    await caption('A missing purchase order triggers a feedback loop: the critic requests another lookup before escalating unresolved evidence.');
    await review('Missing purchase order', 'ESCALATE');
    await page.getByRole('tab', { name: 'Agent activity', exact: true }).click();
    await page.getByText('request revision', { exact: false }).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(12_000);
    await caption('The result is ESCALATE. All examples also run without credentials in sample mode, with generated JSONL traces and real deterministic decisions.');
    await page.locator('.tr-grid').scrollIntoViewIfNeeded();
    await page.waitForTimeout(9_000);
    const remaining = 125_000 - (Date.now() - started);
    if (remaining > 0) await page.waitForTimeout(Math.min(remaining, 45_000));
    if (errors.length) throw new Error('Browser errors: ' + errors.join('; '));
    fs.writeFileSync(path.join(directory, 'browser-evidence.json'), JSON.stringify({ capturedAt: new Date().toISOString(), events, results, errors }, null, 2));
    const video = page.video()!;
    await context.close();
    const raw = await video.path();
    await browser.close();
    execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-i', raw, '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(directory, 'AegisAgent-demo.mp4')], { stdio: 'ignore' });
    console.log(JSON.stringify({ video: 'submission/AegisAgent-demo.mp4', durationSeconds: (Date.now() - started) / 1000 }));
  } catch (error) { await browser.close(); throw error; }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Demo failed'); process.exitCode = 1; });
