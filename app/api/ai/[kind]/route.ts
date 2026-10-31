import { NextResponse } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { requireUser } from '@/lib/auth';
import { getCtx, getRules, type Ctx } from '@/lib/view';
import { evaluateDay } from '@/lib/rules';
import type { DayPlan } from '@/lib/plan';
import { loadJournal, loadPlan, loadPlans } from '@/lib/data';
import { addDays, weekdayOf } from '@/lib/time';
import { DEEP, FAST, generate, ndjson, saveNote, systemPrompt } from '@/lib/ai/run';
import { TOOLS, dayContext, planContext, profile, runTool, tradeContext, weekContext } from '@/lib/ai/context';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function rulesText(ctx: Ctx, day: string, plan: DayPlan | null) {
  const { rules } = await getRules(ctx);
  const st = evaluateDay(rules, ctx.trips, day, plan, (t) => t.realized, ctx.tradeCcy);
  const mark = { kept: 'KEPT', broken: 'BROKEN', idle: 'not tested yet', manual: 'reminder' } as const;
  return `MY RULES (built from my own history) and their status on ${day}:\n${st.map((r) => `- ${r.title}: ${mark[r.status]}${r.status === 'broken' ? ` (${r.detail})` : ''}`).join('\n')}${rules.focus.length ? `\nMy best tickers: ${rules.focus.join(', ')}.` : ''}${rules.blacklist.length ? ` My no-trade list: ${rules.blacklist.join(', ')}.` : ''}`;
}

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

const PROMPTS = {
  debrief: `Write my end-of-day debrief in at most 220 words, with exactly these sections:
## Verdict
One sentence: was this a good, okay or bad day for my *process* (not just P&L)? Include the discipline score if there is one.
## What went well
1-3 bullets with evidence.
## What hurt
1-3 bullets, biggest cost first, each with the amount and the trade(s).
## Plan vs reality
Did I follow my plan and MY RULES? Name each rule I broke with the trade(s) and what it cost, and any unplanned trades.
## Tomorrow's rule
One specific, checkable rule for tomorrow based on today.
If I didn't trade, judge my plan and discipline instead and keep it short.`,
  plan: `Check this pre-market plan before the open, in at most 180 words.
Start with "## Ready" or "## Not ready yet" and one line why.
Then "## Fix before the open": prioritized bullets (most important first) for concrete problems only, e.g. missing stop or target, risk-to-reward below 1.5, levels that contradict the bias (stop above entry on a long, below entry on a short), more tickers than my max trades, no max daily loss, unticked checklist items, tickers on my no-trade list, anything that conflicts with MY RULES, and tickers, weekdays or hours where my history loses money (quote the numbers).
Then "## Watch out": at most 2 bullets on my known patterns that matter today.
Don't praise what's fine. If the plan is empty, tell me the 3 things to fill in first.`,
  trade: `Coach me on this single trade in at most 200 words.
"## Grade: X": a letter A-F for the execution against my plan and my own rules (not the P&L), plus one line why.
"## What happened": 2-3 bullets reading the fills (entry, adds, exits, timing, size).
"## Do again": 1-2 bullets.
"## Avoid": 1-2 bullets with what it cost.
Compare with my history on this symbol or setup when it's relevant.`,
  weekly: `Write my weekly review in at most 350 words:
## Week in one line
## Numbers
This week vs my previous 4 weeks.
## Best decisions
## Costliest mistakes
With amounts and trades.
## Patterns
What keeps repeating, with evidence.
## Focus for next week
At most 3 specific, checkable rules or goals.`,
};

export async function POST(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  try { await requireUser(); } catch { return NextResponse.json({ error: 'Not signed in' }, { status: 401 }); }
  const { kind } = await params;
  const body = await req.json().catch(() => ({}));

  return ndjson(async (emit) => {
    const ctx = await getCtx();
    const prof = profile(ctx);

    if (kind === 'debrief') {
      if (!isDate(body.day)) throw new Error('Bad date');
      const [plan, journal] = await Promise.all([loadPlan(body.day), loadJournal()]);
      const text = await generate({
        kind, model: FAST, effort: 'low', emit, system: systemPrompt(ctx.ccy, prof),
        messages: [{ role: 'user', content: `${dayContext(ctx, body.day, plan, journal.get(body.day))}\n\n${await rulesText(ctx, body.day, plan)}\n\n${PROMPTS.debrief}` }],
      });
      if (text) await saveNote('debrief', body.day, text, FAST);
      return;
    }

    if (kind === 'plan') {
      if (!isDate(body.day)) throw new Error('Bad date');
      const plan = await loadPlan(body.day);
      if (!plan) throw new Error('Save a plan first (add a ticker or tick an item), then run the check.');
      const text = await generate({
        kind, model: FAST, effort: 'low', emit, system: systemPrompt(ctx.ccy, prof),
        messages: [{ role: 'user', content: `${planContext(ctx, plan)}\n\n${await rulesText(ctx, body.day, plan)}\n\n${PROMPTS.plan}` }],
      });
      if (text) await saveNote('plan', body.day, text, FAST);
      return;
    }

    if (kind === 'trade') {
      const t = ctx.trips.find((x) => x.key === body.key);
      if (!t) throw new Error('Trade not found');
      const plan = await loadPlan(t.openDate);
      const text = await generate({
        kind, model: FAST, effort: 'low', emit, system: systemPrompt(ctx.ccy, prof),
        messages: [{ role: 'user', content: `${tradeContext(ctx, t, plan)}\n\n${PROMPTS.trade}` }],
      });
      if (text) await saveNote('trade', t.key, text, FAST);
      return;
    }

    if (kind === 'weekly') {
      if (!isDate(body.monday) || weekdayOf(body.monday) !== 1) throw new Error('Pick a week starting on Monday');
      const [plans, journal] = await Promise.all([loadPlans(), loadJournal()]);
      const text = await generate({
        kind, model: DEEP, effort: 'medium', emit, system: systemPrompt(ctx.ccy, prof),
        messages: [{ role: 'user', content: `${weekContext(ctx, body.monday, plans.filter((p) => p.day >= body.monday && p.day <= addDays(body.monday, 6)), journal)}\n\n${PROMPTS.weekly}` }],
      });
      if (text) await saveNote('weekly', body.monday, text, DEEP);
      return;
    }

    if (kind === 'chat') {
      const history: Anthropic.MessageParam[] = (Array.isArray(body.messages) ? body.messages : [])
        .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .slice(-12)
        .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
      if (!history.length || history[history.length - 1].role !== 'user') throw new Error('Ask a question');
      while (history[0]?.role !== 'user') history.shift();
      const [plans, journal] = await Promise.all([loadPlans(), loadJournal()]);
      const today = new Date().toISOString().slice(0, 10);
      await generate({
        kind, model: FAST, effort: 'medium', emit,
        system: systemPrompt(ctx.ccy, prof, `- Today is ${today}. Use your tools to look up facts before answering questions about performance; call several in one go when useful.
- Answer the question first in one or two sentences, then the evidence, then (if useful) one concrete suggestion. Under 200 words unless asked for more.`),
        messages: history,
        tools: TOOLS as unknown as Anthropic.Tool[],
        runTool: (name, input) => runTool(ctx, plans, journal, name, input),
      });
      return;
    }

    throw new Error('Unknown AI feature');
  });
}
