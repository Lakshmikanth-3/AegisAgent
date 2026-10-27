import path from 'node:path';
import { keccak256, toHex } from 'viem';
import { decide, ALLOWED, type AuditStep, type Llm } from '../earlypay/decide';
import cached from './sample-data.json';
import { llmFromEnv } from '../earlypay/llm';
import { DEFAULT_POLICY, type RiskFlag, type Hex } from '../earlypay/types';
import { WorldModel } from './world-model/index';
import { parseTreasuryInput, units, type TreasuryInput } from './input';
import { retrieveEvidence, ZetarisClient, type Evidence } from './zetaris';
import { createTrace } from './trace';

export function critique(input: TreasuryInput, evidence: Evidence): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const add = (code: string, severity: RiskFlag['severity'], detail: string) => flags.push({ code, severity, detail });
  const [supplier] = evidence.supplier, [po] = evidence.purchaseOrder;
  if (evidence.supplier.length !== 1) add('SUPPLIER_EVIDENCE', 'escalate', 'Supplier registry must return exactly one supplier.');
  if (supplier && supplier.approved !== 'true') add('UNAPPROVED_SUPPLIER', 'escalate', 'Supplier is not approved in the independent registry.');
  if (supplier && supplier.payout_address.toLowerCase() !== input.payoutAddress.toLowerCase()) add('ERP_PAYOUT_MISMATCH', 'reject', 'Requested payout differs from the independent supplier registry.');
  if (evidence.purchaseOrder.length !== 1) add('MISSING_PO', 'escalate', 'Purchase-order evidence is missing or ambiguous.');
  if (po && po.supplier_id.toLowerCase() !== input.supplierId.toLowerCase()) add('PO_SUPPLIER_MISMATCH', 'reject', 'Purchase order belongs to a different supplier.');
  if (po && units(po.amount_usdc) !== units(input.amountUsdc)) add('PO_AMOUNT_MISMATCH', 'escalate', 'Invoice face amount does not match the purchase order.');
  if (po && po.status !== 'OPEN') add('PO_CLOSED', 'escalate', 'Purchase order is not open.');
  if (evidence.priorInvoices.some(r => r.status === 'PAID')) add('ERP_DUPLICATE', 'reject', 'ERP records show this invoice number has already been paid.');
  if (evidence.treasury.length !== 1) add('TREASURY_EVIDENCE', 'escalate', 'Treasury source must return exactly one current balance record.');
  return flags;
}

export async function runTreasury(value: unknown, options: { sample?: boolean; logDirectory?: string; stdout?: boolean; llm?: Llm; client?: ZetarisClient } = {}) {
  const input = parseTreasuryInput(value);
  const sample = options.sample ?? process.env.SAMPLE_MODE === 'true';
  const trace = createTrace(input, { directory: options.logDirectory, stdout: options.stdout });
  const world = new WorldModel({ namespace: trace.runId, storage: 'local', directory: process.env.AEGIS_STATE_DIR || path.resolve(process.cwd(), '.data') });
  const source = { kind: sample ? 'file' : 'api', by: 'ReconcilerAgent', at: new Date().toISOString(), runId: trace.runId };
  trace.emit('PlannerAgent', 'delegate', 'running', { task: 'Reconcile invoice against registry, ERP and treasury', mode: sample ? 'sample' : 'live' }, 'ReconcilerAgent');
  try {
    let evidence = await retrieveEvidence(input, sample, options.client);
    const invoice = await world.upsertEntity({ type: 'invoice', externalKey: { system: 'aegis', id: input.invoiceNumber }, attrs: { invoiceNumber: input.invoiceNumber }, source });
    const supplier = await world.upsertEntity({ type: 'supplier', externalKey: { system: 'registry', id: input.supplierId }, source });
    await world.relate({ from: invoice.id, type: 'payable-to', to: supplier.id, source });
    await world.assertFact({ about: invoice.id, predicate: 'evidence', value: evidence, confidence: 1, source });
    for (const query of evidence.queries) trace.emit('ReconcilerAgent', 'query', 'success', query);
    trace.emit('ReconcilerAgent', 'world-model-write', 'success', { engine: 'Meterless World Model', entityId: invoice.id, eventCount: world.events().length }, 'PolicyCriticAgent');

    // The critic consumes the shared engine state, not a parallel local evidence object.
    evidence = world.view('graph').entity(invoice.id)!.attrs.evidence as Evidence;
    let flags = critique(input, evidence);
    if (flags.some(f => f.code === 'MISSING_PO')) {
      trace.emit('PolicyCriticAgent', 'request-revision', 'needs_revision', { reason: 'Scoped PO lookup was missing or ambiguous. Reconcile by PO identifier alone to detect a supplier conflict.' }, 'ReconcilerAgent');
      const sql = `SELECT * FROM AEGIS_ERP.purchase_orders WHERE po_number = '${input.poNumber.replaceAll("'", "''")}'`;
      const retry = sample ? { source: 'sample-cache' as const, sql, rows: cached.purchaseOrders.filter(r => r.po_number === input.poNumber), requestId: trace.runId + '-retry', durationMs: 0 } : await (options.client || new ZetarisClient()).query(sql);
      evidence = { ...evidence, purchaseOrder: retry.rows, queries: [...evidence.queries, retry] };
      await world.assertFact({ about: invoice.id, predicate: 'evidence', value: evidence, confidence: 1, source: { ...source, at: new Date().toISOString() } });
      trace.emit('ReconcilerAgent', 'requery', 'success', retry, 'PolicyCriticAgent');
      evidence = world.view('graph').entity(invoice.id)!.attrs.evidence as Evidence;
      flags = critique(input, evidence);
    }
    await world.assertFact({ about: invoice.id, predicate: 'riskFlags', value: flags, confidence: 1, source: { ...source, by: 'PolicyCriticAgent', at: new Date().toISOString() } });
    trace.emit('PolicyCriticAgent', 'critique', flags.length ? 'flagged' : 'approved', { flags, engine: 'Meterless World Model', readEntity: invoice.id }, 'TreasuryReasonerAgent');
    const shared = world.view('graph').entity(invoice.id)!;
    const validatedFlags = shared.attrs.riskFlags as RiskFlag[];
    const treasury = evidence.treasury[0];
    if (!treasury) throw new Error('Treasury evidence unavailable');
    if (!/^\d{1,5}$/.test(treasury.hold_yield_bps) || Number(treasury.hold_yield_bps) > 10000) throw new Error('Treasury holding yield is invalid; owner review is required');
    const now = Math.floor(Date.now() / 1000);
    const policy = { ...DEFAULT_POLICY, liquidityBuffer: units(treasury.liquidity_buffer_usdc), holdYieldBps: Number(treasury.hold_yield_bps) };
    const audit: AuditStep = { step: 'Federated ERP Reconciliation', source: sample ? 'Cached synthetic exports (sample mode)' : 'Zetaris REST query engine', status: validatedFlags.some(f => f.severity === 'reject') ? 'FAILED' : validatedFlags.length ? 'FLAGGED' : 'PASSED', details: `${evidence.queries.length} queries across AEGIS_REGISTRY, AEGIS_ERP and AEGIS_TREASURY. ${validatedFlags.map(f => f.detail).join(' ') || 'Supplier, payout, PO ownership, amount and duplicate checks passed.'} Assessment only; chain signatures are not verified by this endpoint.` };
    let llm: Llm | undefined;
    if (!sample) {
      if (!process.env.METERLESS_BASE_URL && !options.llm) throw new Error('Live treasury assessments require Meterless Nightshift');
      const provider = options.llm || llmFromEnv();
      if (!provider) throw new Error('Nightshift is not configured');
      llm = async (system, user) => {
        trace.emit('TreasuryReasonerAgent', 'nightshift-request', 'running', { provider: 'meterless-nightshift', requestedModel: process.env.METERLESS_MODEL || 'meterless/auto' });
        try {
          const answer = await provider(system, user);
          trace.emit('TreasuryReasonerAgent', 'nightshift-response', 'success', { provider: 'meterless-nightshift', model: answer.model, tokens: answer.usage?.total_tokens ?? null, durationMs: answer.durationMs ?? null });
          return answer;
        } catch {
          trace.emit('TreasuryReasonerAgent', 'nightshift-response', 'failed', { reason: 'Provider unavailable; deterministic policy fallback applies.' });
          throw new Error('Nightshift unavailable');
        }
      };
    }
    const address = /^0x[0-9a-fA-F]{40}$/.test(input.supplierId) ? input.supplierId as Hex : '0x0000000000000000000000000000000000000001';
    const result = await decide({ vault: '0x0000000000000000000000000000000000000000', supplier: address, invoiceHash: keccak256(toHex(input.invoiceNumber)), faceAmount: units(input.amountUsdc), discountBps: input.discountBps, payout: input.payoutAddress, dueDate: BigInt(now + input.daysEarly * 86400), expiry: BigInt(now + 3600) }, { number: input.invoiceNumber, notes: input.notes }, { now, offerCheck: 'ok', registeredPayout: evidence.supplier[0]?.payout_address as Hex | undefined, vaultAllowsPayout: true, invoiceUsedInVault: false, vaultBalance: units(treasury.balance_usdc), maxPayment: units(treasury.max_payment_usdc), remainingBudget: units(treasury.remaining_budget_usdc), dailyRemaining: units(treasury.daily_remaining_usdc), agentActive: true }, policy, [], { llm, evidence: { flags: validatedFlags, audit } });
    await world.assertFact({ about: invoice.id, predicate: 'decision', value: result.decision, source: { ...source, by: 'TreasuryReasonerAgent', at: new Date().toISOString() } });
    trace.emit('TreasuryReasonerAgent', 'propose', 'success', { decision: result.decision, policyCeiling: result.policyDecision, source: result.source }, 'PolicyCriticAgent');
    if (!ALLOWED[result.policyDecision].includes(result.decision)) throw new Error('Final critic rejected a decision outside the policy ceiling');
    trace.emit('PolicyCriticAgent', 'validate-final', 'success', { decision: result.decision, override: result.overridden || null, reason: result.reason });
    return { ok: true, runId: trace.runId, mode: sample ? 'sample' : 'live', ...result, payoutUnits: result.payoutUnits.toString(), evidence, world: { engine: 'Meterless World Model', entityId: invoice.id, events: world.events().length, audit: world.audit() }, trace: trace.events, execution: { submitted: false, mode: 'assessment-only', reason: 'Use the signed EarlyPay vault workflow for settlement.' } };
  } catch (error) {
    // Live source failure cannot be disguised as a successful cached-data run.
    const message = error instanceof Error ? error.message : 'Evidence unavailable';
    trace.emit('PlannerAgent', 'escalate', 'degraded', { reason: message }, 'PolicyCriticAgent');
    return { ok: false, runId: trace.runId, mode: sample ? 'sample' : 'live', decision: 'ESCALATE', reason: message, auditTrail: [{ step: 'Evidence availability', source: 'PlannerAgent', status: 'FLAGGED', details: message }], trace: trace.events, execution: { submitted: false, mode: 'assessment-only' } };
  }
}
