import { randomUUID } from 'node:crypto';
import cached from './sample-data.json';
import type { TreasuryInput } from './input';

export type Row = Record<string, string>;
export type QueryEvidence = { source: 'zetaris' | 'sample-cache'; sql: string; rows: Row[]; requestId: string; durationMs: number };
export type Evidence = { supplier: Row[]; purchaseOrder: Row[]; priorInvoices: Row[]; treasury: Row[]; queries: QueryEvidence[] };

export class ZetarisClient {
  private token = process.env.ZETARIS_API_KEY;
  private base = (process.env.ZETARIS_REST_URL || 'http://127.0.0.1:8888/api/v1.0').replace(/\/$/, '');
  private org = process.env.ZETARIS_ORG_ID || '1';
  private async login() {
    const username = process.env.ZETARIS_USERNAME, password = process.env.ZETARIS_PASSWORD;
    if (!username || !password) throw new Error('Zetaris rejected authentication; configure an API key or username/password');
    const r = await fetch(this.base + '/auth/login', { headers: { authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'), 'X-Org-ID': this.org, 'X-Request-ID': randomUUID() }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`Zetaris login HTTP ${r.status}`);
    const b = await r.json() as { idToken?: string };
    if (!b.idToken) throw new Error('Zetaris login returned no idToken');
    this.token = b.idToken;
  }
  private async request(route: string, init: RequestInit = {}, requestId = randomUUID()) {
    // Zetaris can report an expired login JWT as HTTP 400. Renew before sending
    // it rather than treating that response as a SQL error. Opaque API keys remain valid.
    let expired = false;
    if (this.token?.split('.').length === 3) {
      try { const claims = JSON.parse(Buffer.from(this.token.split('.')[1], 'base64url').toString()) as { exp?: number }; expired = typeof claims.exp === 'number' && claims.exp * 1000 <= Date.now() + 30_000; } catch { expired = true; }
    }
    if (!this.token || expired) await this.login();
    const send = () => fetch(this.base + route, { ...init, headers: { authorization: 'Bearer ' + this.token, 'X-Org-ID': this.org, 'X-Request-ID': requestId, 'content-type': 'application/json' }, signal: AbortSignal.timeout(30_000) });
    let r = await send();
    if (r.status === 401 || r.status === 403) { await this.login(); r = await send(); }
    if (!r.ok) throw new Error(`Zetaris HTTP ${r.status} while ${init.method === 'DELETE' ? 'closing' : 'running'} a query`);
    return r;
  }
  async query(sql: string): Promise<QueryEvidence> {
    const started = Date.now(), requestId = randomUUID();
    const r = await this.request('/query/sql/start', { method: 'POST', body: JSON.stringify({ select: sql, pageLimit: 100 }) }, requestId);
    const b = await r.json() as { records?: Row[]; queryToken?: string; totalPages?: number; error?: unknown };
    try {
      if (!Array.isArray(b.records)) throw new Error('Zetaris returned no record set');
      if ((b.totalPages ?? 1) > 1) throw new Error('Evidence query exceeded 100 rows; refine the source rather than truncate evidence');
      return { source: 'zetaris', sql, rows: b.records, requestId, durationMs: Date.now() - started };
    } finally {
      if (b.queryToken) await this.request('/query/sql/close/' + encodeURIComponent(b.queryToken), { method: 'DELETE' }).catch(() => undefined);
    }
  }
  /** Administrative SQL used only by the explicit bootstrap command. */
  async execute(sql: string): Promise<unknown> {
    const r = await this.request('/sql-editor/sqls/run', { method: 'POST', body: JSON.stringify({ sql, queryId: randomUUID(), source: 'SqlEditor', limit: 100 }) });
    return r.json();
  }
}

// Input identifiers have a strict grammar and are still escaped at the SQL boundary.
const literal = (s: string) => "'" + s.replaceAll("'", "''") + "'";
export async function retrieveEvidence(input: TreasuryInput, sample: boolean, client = new ZetarisClient()): Promise<Evidence> {
  const specs = [
    { key: 'supplier', sql: `SELECT * FROM AEGIS_REGISTRY.suppliers WHERE lower(supplier_id) = lower(${literal(input.supplierId)})`, rows: cached.suppliers.filter(r => r.supplier_id.toLowerCase() === input.supplierId.toLowerCase()) },
    { key: 'purchaseOrder', sql: `SELECT * FROM AEGIS_ERP.purchase_orders WHERE po_number = ${literal(input.poNumber)} AND lower(supplier_id) = lower(${literal(input.supplierId)})`, rows: cached.purchaseOrders.filter(r => r.po_number === input.poNumber && r.supplier_id.toLowerCase() === input.supplierId.toLowerCase()) },
    { key: 'priorInvoices', sql: `SELECT * FROM AEGIS_ERP.invoices WHERE invoice_number = ${literal(input.invoiceNumber)}`, rows: cached.invoices.filter(r => r.invoice_number === input.invoiceNumber) },
    { key: 'treasury', sql: "SELECT * FROM AEGIS_TREASURY.balances WHERE treasury_id = 'main'", rows: cached.treasury },
  ] as const;
  const queries: QueryEvidence[] = [];
  for (const spec of specs) queries.push(sample ? { source: 'sample-cache', sql: spec.sql, rows: spec.rows, requestId: randomUUID(), durationMs: 0 } : await client.query(spec.sql));
  return { supplier: queries[0].rows, purchaseOrder: queries[1].rows, priorInvoices: queries[2].rows, treasury: queries[3].rows, queries };
}
