import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { q } from '../db';

/** Cheap + fast for everyday coaching; the larger model only for the weekly review. */
export const FAST = 'claude-haiku-5-5';
export const DEEP = 'claude-sonnet-5-5';
const PRICE: Record<string, [number, number]> = { [FAST]: [0.1, 0.5], [DEEP]: [2, 10] }; // USD per 1M tokens in / out

export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY?.trim();
export const monthlyLimit = () => Number(process.env.AI_MONTHLY_LIMIT_USD) || 5;

let client: Anthropic | null = null;
const ai = () => (client ??= new Anthropic());

export async function monthSpend(): Promise<{ cost: number; calls: number }> {
  const [r] = await q(`select coalesce(sum(cost_usd), 0)::float as cost, count(*)::int as calls from ai_usage where at >= date_trunc('month', now())`);
  return { cost: Number(r.cost), calls: Number(r.calls) };
}

async function logUsage(kind: string, model: string, u: Anthropic.Usage) {
  const [pin, pout] = PRICE[model] ?? [2, 10];
  const input = u.input_tokens + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1;
  const cost = (input * pin + u.output_tokens * pout) / 1e6;
  await q(`insert into ai_usage (kind, model, input_tokens, output_tokens, cost_usd) values ($1,$2,$3,$4,$5)`, [kind, model, u.input_tokens, u.output_tokens, cost]);
  return cost;
}

// ---------- saved AI notes (debriefs, plan checks, trade coaching, weekly reviews) ----------
export interface AiNote { content: string; model: string; createdAt: string }

export async function saveNote(kind: string, ref: string, content: string, model: string) {
  await q(
    `insert into ai_notes (kind, ref, content, model, created_at) values ($1,$2,$3,$4, now())
     on conflict (kind, ref) do update set content = excluded.content, model = excluded.model, created_at = now()`,
    [kind, ref, content, model],
  );
}
export async function loadNote(kind: string, ref: string): Promise<AiNote | null> {
  const [r] = await q(`select content, model, created_at from ai_notes where kind = $1 and ref = $2`, [kind, ref]);
  return r ? { content: r.content, model: r.model, createdAt: new Date(r.created_at).toISOString() } : null;
}
export async function listNotes(kind: string, limit = 12) {
  const rows = await q(`select ref, content, model, created_at from ai_notes where kind = $1 order by ref desc limit $2`, [kind, limit]);
  return rows.map((r) => ({ ref: r.ref as string, content: r.content as string, model: r.model as string, createdAt: new Date(r.created_at).toISOString() }));
}

// ---------- streaming to the browser as newline-delimited JSON ----------
export type AiEvent = { t: 'text'; v: string } | { t: 'status'; v: string } | { t: 'error'; v: string } | { t: 'done'; cost: number };
type Emit = (e: AiEvent) => void;

function friendly(err: unknown) {
  if (err instanceof Anthropic.AuthenticationError) return 'Your Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'Your Anthropic account doesn’t have access to this model.';
  if (err instanceof Anthropic.RateLimitError) return 'Too many AI requests right now. Try again in a minute.';
  if (err instanceof Anthropic.APIConnectionError) return 'Couldn’t reach the AI service. Check your internet connection.';
  if (err instanceof Anthropic.APIError) return `The AI service returned an error (${err.status ?? '?'}). Try again shortly.`;
  return err instanceof Error ? err.message : 'Something went wrong.';
}

export function ndjson(run: (emit: Emit) => Promise<void>): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(c) {
      const emit: Emit = (e) => c.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      try { await run(emit); } catch (err) { emit({ t: 'error', v: friendly(err) }); } finally { c.close(); }
    },
  });
  return new Response(body, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
}

export function systemPrompt(ccy: string, profileText: string, extra = '') {
  return `You are the personal trading coach built into the user's own trading journal. The data comes straight from their Interactive Brokers account and is exact; P&L is realized and already net of commissions.

How to coach:
- Base every statement on the data you are given or that your tools return. Quote specific numbers, dates and symbols. Never invent trades, prices or statistics; if something is missing, say so.
- Only link a fact to one of the trader's patterns when the data shows that exact pattern. Don't do arithmetic the data already did: all P&L is final and already net of fees.
- Coach the process: planning, risk, position sizing, discipline, execution and the trader's recurring patterns. Do not tell them which securities to buy or sell and do not predict prices.
- Be direct and specific like a good coach: name the problem, show the evidence, give one concrete fix. No generic advice, filler or disclaimers.
- Write for a phone screen: short markdown with "##" headings, "-" bullets and **bold** for key numbers. Never use tables.
- Money is in ${ccy} unless stated otherwise. Times are New York time (ET).
${extra}
What we know about this trader (all their history):
${profileText}`;
}

export async function generate(opts: {
  kind: string;
  model: string;
  system: string;
  messages: Anthropic.MessageParam[];
  emit: Emit;
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  tools?: Anthropic.Tool[];
  runTool?: (name: string, input: unknown) => string;
}): Promise<string> {
  if (!aiEnabled()) throw new Error('AI is not set up yet. Add ANTHROPIC_API_KEY to .env.local and restart the app.');
  const spent = await monthSpend();
  if (spent.cost >= monthlyLimit()) {
    throw new Error(`You reached this month’s AI limit of $${monthlyLimit().toFixed(2)} (AI_MONTHLY_LIMIT_USD). It resets on the 1st.`);
  }

  const messages = [...opts.messages];
  let text = '', cost = 0, badJson = 0;
  const tools = opts.tools?.map((t) => ({ ...t, eager_input_streaming: true }));

  for (let turn = 0; turn < 8; turn++) {
    const stream = ai().messages.stream({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      messages,
      ...(tools?.length ? { tools } : {}),
      output_config: { effort: opts.effort ?? 'medium' },
    });
    stream.on('text', (d) => { text += d; opts.emit({ t: 'text', v: d }); });

    let msg: Anthropic.Message;
    try {
      msg = await stream.finalMessage();
      badJson = 0;
    } catch (err) {
      // With eager input streaming an unparseable tool input rejects here; re-issue that turn (API errors are rethrown).
      if (err instanceof Anthropic.APIError || badJson++ >= 2) throw err;
      continue;
    }
    cost += await logUsage(opts.kind, opts.model, msg.usage);

    if (msg.stop_reason === 'refusal') {
      opts.emit({ t: 'error', v: 'The AI declined to answer this one.' });
      break;
    }
    const uses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    // Only run tools on a clean tool_use stop (a max_tokens stop can leave a truncated input).
    if (msg.stop_reason !== 'tool_use' || !uses.length || !opts.runTool) break;

    messages.push({ role: 'assistant', content: msg.content });
    opts.emit({ t: 'status', v: uses.map((u) => STATUS[u.name] ?? 'Checking your journal…').join(' ') });
    const results: Anthropic.ToolResultBlockParam[] = uses.map((u) => {
      try {
        return { type: 'tool_result', tool_use_id: u.id, content: opts.runTool!(u.name, u.input) };
      } catch (e) {
        return { type: 'tool_result', tool_use_id: u.id, content: `Tool failed: ${e instanceof Error ? e.message : 'error'}`, is_error: true };
      }
    });
    messages.push({ role: 'user', content: results });
    if (text && !text.endsWith('\n')) { text += '\n\n'; opts.emit({ t: 'text', v: '\n\n' }); }
  }

  opts.emit({ t: 'done', cost });
  return text.trim();
}

const STATUS: Record<string, string> = {
  get_overview: 'Reading your performance…',
  get_breakdown: 'Breaking down your stats…',
  find_trades: 'Looking through your trades…',
  get_day: 'Opening that day…',
};
