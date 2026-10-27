import { runTreasury } from '@/lib/treasury/workflow';
import { parseTreasuryInput } from '@/lib/treasury/input';

export const runtime = 'nodejs';
export const maxDuration = 300;
let running = 0;
export async function POST(request: Request) {
  if (running >= 2) return Response.json({ error: 'Treasury agent is busy; retry shortly.' }, { status: 429 });
  if (Number(request.headers.get('content-length') || 0) > 16_384) return Response.json({ error: 'Invoice request exceeds 16 KB' }, { status: 413 });
  let input;
  try {
    const text = await request.text();
    if (text.length > 16_384) return Response.json({ error: 'Invoice request exceeds 16 KB' }, { status: 413 });
    input = parseTreasuryInput(JSON.parse(text));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Invalid invoice JSON' }, { status: 400 }); }
  running++;
  try {
    const result = await runTreasury(input);
    return Response.json(result, { status: result.ok ? 200 : 503 });
  } finally { running--; }
}
