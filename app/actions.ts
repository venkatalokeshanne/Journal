'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import * as data from '@/lib/data';
import { supabaseServer, isAllowed, authEnabled, requireUser } from '@/lib/auth';
import { sanitizePlan, sanitizeDefaults } from '@/lib/plan';
import { sanitizeRules, suggestRules } from '@/lib/rules';
import { buildTrips } from '@/lib/engine';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const numOrNull = (v: string) => {
  if (!v) return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const intIn = (v: string, lo: number, hi: number) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};
const list = (v: string) => [...new Set(v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean))];

export async function saveTradeNote(_: unknown, f: FormData) {
  await requireUser();
  const key = s(f, 'key');
  if (!key) return { ok: false, msg: 'Missing trade' };
  await data.saveNote({
    tradeKey: key,
    setupId: intIn(s(f, 'setupId'), 1, Number.MAX_SAFE_INTEGER),
    tags: list(s(f, 'tags')),
    mistakes: list(s(f, 'mistakes')),
    rating: intIn(s(f, 'rating'), 1, 5),
    stopPrice: numOrNull(s(f, 'stop')),
    targetPrice: numOrNull(s(f, 'target')),
    notes: s(f, 'notes'),
    screenshots: list(s(f, 'screenshots')).filter((u) => /^https?:\/\//i.test(u)),
  });
  revalidatePath('/', 'layout');
  return { ok: true, msg: 'Saved' };
}

export async function saveJournal(_: unknown, f: FormData) {
  await requireUser();
  const day = s(f, 'day');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, msg: 'Bad date' };
  await data.saveJournalDay({
    day,
    plan: s(f, 'plan'),
    review: s(f, 'review'),
    lessons: s(f, 'lessons'),
    mood: intIn(s(f, 'mood'), 1, 5),
    discipline: intIn(s(f, 'discipline'), 1, 5),
  });
  revalidatePath('/journal', 'layout');
  return { ok: true, msg: 'Saved' };
}

export async function saveSetupAction(_: unknown, f: FormData) {
  await requireUser();
  const name = s(f, 'name');
  if (!name) return { ok: false, msg: 'Give the setup a name' };
  try {
    await data.saveSetup({
      id: intIn(s(f, 'id'), 1, Number.MAX_SAFE_INTEGER),
      name,
      description: s(f, 'description'),
      rules: s(f, 'rules'),
      archived: f.get('archived') === 'on',
    });
  } catch (e) {
    return { ok: false, msg: String(e).includes('unique') ? 'A setup with that name already exists' : 'Could not save' };
  }
  revalidatePath('/playbook');
  return { ok: true, msg: 'Saved' };
}

export async function deleteSetupAction(f: FormData) {
  await requireUser();
  const id = intIn(s(f, 'id'), 1, Number.MAX_SAFE_INTEGER);
  if (id) await data.deleteSetup(id);
  revalidatePath('/playbook');
}

export async function savePlanAction(raw: unknown) {
  await requireUser();
  const plan = sanitizePlan(raw);
  if (!plan) return { ok: false, msg: 'Invalid plan' };
  try {
    await data.savePlan(plan);
  } catch {
    return { ok: false, msg: 'Could not save' };
  }
  revalidatePath('/calendar');
  revalidatePath('/reports');
  return { ok: true, msg: 'Saved' };
}

export async function savePlanDefaultsAction(raw: unknown) {
  await requireUser();
  await data.savePlanDefaults(sanitizeDefaults(raw));
  return { ok: true, msg: 'Saved as your default' };
}

export async function appendReviewAction(day: string, text: string) {
  await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !text.trim()) return { ok: false, msg: 'Nothing to save' };
  const j = (await data.loadJournal()).get(day) ?? { day, plan: '', review: '', lessons: '', mood: null, discipline: null };
  const clean = text.replace(/^#{1,4}\s+/gm, '').trim();
  await data.saveJournalDay({ ...j, review: j.review.trim() ? `${j.review.trim()}\n\n${clean}` : clean });
  revalidatePath('/journal', 'layout');
  return { ok: true, msg: 'Saved to your review' };
}

export async function saveRulesAction(raw: unknown) {
  await requireUser();
  const fallback = suggestRules(buildTrips(await data.loadExecutions()), (t) => t.realized);
  await data.saveRules(sanitizeRules(raw, fallback));
  revalidatePath('/rules');
  revalidatePath('/plan', 'layout');
  return { ok: true, msg: 'Saved' };
}

export async function login(_: unknown, f: FormData) {
  if (!authEnabled()) redirect('/');
  const email = s(f, 'email').toLowerCase();
  const password = String(f.get('password') ?? '');
  if (!email || !password) return { ok: false, msg: 'Enter your email and password' };
  if (!isAllowed(email)) return { ok: false, msg: 'This email is not allowed to use this journal' };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, msg: error.message === 'Invalid login credentials' ? 'Wrong email or password' : error.message };
  redirect('/');
}

export async function logout() {
  if (authEnabled()) await (await supabaseServer()).auth.signOut();
  redirect('/login');
}
