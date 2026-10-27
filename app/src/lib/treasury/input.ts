export type TreasuryInput = {
  invoiceNumber: string;
  supplierId: string;
  poNumber: string;
  amountUsdc: string;
  discountBps: number;
  daysEarly: number;
  payoutAddress: `0x${string}`;
  notes?: string;
};

export function parseTreasuryInput(value: unknown): TreasuryInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON invoice object');
  const v = value as Record<string, unknown>;
  for (const key of ['invoiceNumber', 'supplierId', 'poNumber']) {
    if (typeof v[key] !== 'string' || !/^[A-Za-z0-9_.:-]{1,100}$/.test(v[key])) throw new Error(`${key} must contain 1–100 letters, numbers, dots, colons, underscores or hyphens`);
  }
  if (typeof v.amountUsdc !== 'string' || !/^(0|[1-9]\d{0,9})(\.\d{1,6})?$/.test(v.amountUsdc) || Number(v.amountUsdc) <= 0) throw new Error('amountUsdc must be a positive decimal string with at most 6 decimals');
  if (!Number.isInteger(v.discountBps) || Number(v.discountBps) < 0 || Number(v.discountBps) > 5000) throw new Error('discountBps must be an integer from 0 to 5000');
  if (!Number.isInteger(v.daysEarly) || Number(v.daysEarly) < 0 || Number(v.daysEarly) > 365) throw new Error('daysEarly must be an integer from 0 to 365');
  if (typeof v.payoutAddress !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(v.payoutAddress)) throw new Error('payoutAddress must be an EVM address');
  if (v.notes !== undefined && (typeof v.notes !== 'string' || v.notes.length > 4000)) throw new Error('notes must be text up to 4000 characters');
  return Object.fromEntries(['invoiceNumber', 'supplierId', 'poNumber', 'amountUsdc', 'discountBps', 'daysEarly', 'payoutAddress', 'notes'].filter(k => v[k] !== undefined).map(k => [k, v[k]])) as TreasuryInput;
}

export function units(decimal: string): bigint {
  if (!/^(0|[1-9]\d{0,12})(\.\d{1,6})?$/.test(decimal)) throw new Error('Invalid USDC amount in evidence');
  const [whole, fraction = ''] = decimal.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}
