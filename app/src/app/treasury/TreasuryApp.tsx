'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, ArrowRight, Play, FileCheck2, Database, Activity, AlertTriangle } from 'lucide-react';
import examples from '@/lib/treasury/examples.json';
const [good, hold, fraud, missing] = examples;
import type { runTreasury } from '@/lib/treasury/workflow';
import './treasury.css';
type Result = Awaited<ReturnType<typeof runTreasury>>;
const samples = [{ label: 'Good discount', value: good }, { label: 'Low yield', value: hold }, { label: 'Duplicate + redirection', value: fraud }, { label: 'Missing purchase order', value: missing }];
export default function TreasuryApp({ sample }: { sample: boolean }) {
  const [input, setInput] = useState(JSON.stringify(good, null, 2));
  const [result, setResult] = useState<Result>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'audit' | 'trace' | 'sources'>('audit');
  async function run() {
    setBusy(true); setError(''); setResult(undefined);
    try {
      const invoice = JSON.parse(input);
      const r = await fetch('/api/treasury/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(invoice) });
      const b = await r.json();
      if (b.error) throw new Error(b.error);
      setResult(b);
    } catch (e) { setError(e instanceof Error ? e.message : 'Review failed'); }
    finally { setBusy(false); }
  }
  return <div className="treasury-app">
    <header className="tr-nav"><Link className="tr-brand" href="/"><ShieldCheck size={25} /> AegisAgent</Link><div><Link href="/earlypay">EarlyPay settlement</Link><span className="tr-mode">{sample ? 'Sample mode' : 'Live connections'}</span></div></header>
    <main className="tr-main">
      <div className="tr-intro"><span className="tr-eyebrow">TREASURY REVIEW</span><h1>A good deal.<br /><em>A defensible decision.</em></h1><p>Reconcile the invoice, question the evidence, and inspect the policy before payment.</p></div>
      <div className="tr-strip"><span><Database size={16} /> {sample ? 'Cached enterprise exports' : 'Zetaris data layer'}</span><span><Activity size={16} /> Meterless World Model</span><span><ShieldCheck size={16} /> {sample ? 'Deterministic reasoning' : 'Nemotron through Nightshift'}</span></div>
      <div className="tr-grid"><section className="tr-input"><div className="tr-section-title"><span>01 / THE INVOICE</span><FileCheck2 size={20} /></div><h2>What should we do with it?</h2><p className="tr-muted">Start with an example or edit any field. Source records are synthetic enterprise exports, shared across sample and live modes.</p>
        <div className="tr-examples">{samples.map(s => <button key={s.label} onClick={() => { setInput(JSON.stringify(s.value, null, 2)); setResult(undefined); }} disabled={busy}>{s.label}</button>)}</div>
        <label htmlFor="invoice-json" className="tr-label">Invoice details · JSON</label><textarea id="invoice-json" spellCheck={false} value={input} onChange={e => setInput(e.target.value)} disabled={busy} />
        <button className="tr-run" onClick={run} disabled={busy}>{busy ? 'Reconciling and reviewing…' : 'Review invoice'}{busy ? <Activity size={19} className="tr-spin" /> : <ArrowRight size={19} />}</button>
        <p className="tr-disclosure"><ShieldCheck size={15} /> Assessment only. No funds move from this page.</p>{error && <p role="alert" className="tr-error">{error}</p>}
      </section><section className="tr-output" aria-live="polite"><div className="tr-section-title"><span>02 / THE DECISION</span><Activity size={20} /></div>
        {!result ? <div className="tr-empty"><div className="tr-empty-icon"><Play size={30} /></div><h2>Evidence before action.</h2><p>The reconciliation agent checks three source groups. The policy critic challenges missing evidence. Shared state keeps their work connected.</p><div className="tr-route"><span>Reconcile</span><ArrowRight size={14} /><span>Critique</span><ArrowRight size={14} /><span>Reason</span></div>{busy && <p className="tr-working">Working through the evidence. A live model request may take a minute.</p>}</div> : <>
          <div className={`tr-verdict tr-${result.decision.toLowerCase()}`}><span className="tr-label">{result.mode === 'sample' ? 'SAMPLE ASSESSMENT' : 'LIVE ASSESSMENT'}</span><h2>{result.decision.replaceAll('_', ' ')}</h2><p>{result.reason}</p></div>
          {!result.ok && <p className="tr-error"><AlertTriangle size={16} /> A required source is unavailable. The review escalated safely.</p>}
          <div className="tr-tabs" role="tablist" aria-label="Decision evidence">{(['audit', 'trace', 'sources'] as const).map(tab => <button key={tab} role="tab" aria-selected={view === tab} onClick={() => setView(tab)}>{tab === 'audit' ? 'Explain why' : tab === 'trace' ? 'Agent activity' : 'Source records'}</button>)}</div>
          {view === 'audit' && <ol className="tr-audit">{result.auditTrail.map((step, i) => <li key={i}><div><span className={`tr-status tr-status-${step.status.toLowerCase()}`}>{step.status}</span><strong>{step.step}</strong></div><small>{step.source}</small><p>{step.details}</p></li>)}</ol>}
          {view === 'trace' && <div className="tr-trace">{result.trace.map((event, i) => <article key={i}><span>{String(i + 1).padStart(2, '0')}</span><div><strong>{event.agent_name}</strong><p>{event.action.replaceAll('-', ' ')} {event.target_agent ? '→ ' + event.target_agent : ''}</p><small>{event.status}</small><details><summary>Event details</summary><pre>{JSON.stringify(event.details, null, 2)}</pre></details></div></article>)}</div>}
          {view === 'sources' && <div className="tr-sources">{'evidence' in result && result.evidence ? result.evidence.queries.map((q, i) => <details key={i} open><summary>{q.source === 'zetaris' ? 'Zetaris' : 'Cached source'} · {q.rows.length} records · {q.durationMs} ms</summary><code>{q.sql}</code><pre>{JSON.stringify(q.rows, null, 2)}</pre></details>) : <p>No complete source evidence was returned.</p>}</div>}
          <div className="tr-result-foot"><span>Run {result.runId.slice(0, 8)}</span><button onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })); a.download = `aegis-review-${result.runId}.json`; a.click(); URL.revokeObjectURL(a.href); }}>Download full review</button></div>
        </>}
      </section></div>
      <footer className="tr-footer"><span>AegisAgent — Autonomous Enterprise Treasury & Policy Guardrail Agent</span><Link href="/earlypay/audit">On-chain settlement audit ↗</Link></footer>
    </main>
  </div>;
}
