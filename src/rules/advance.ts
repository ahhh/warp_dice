/**
 * Advancement (Core p.37): experience buys Characteristic advances (+5 each,
 * four per Characteristic, priced by the career's scheme), Skills on the
 * career list (trained, +10, +20), career Talents unlocked by Rank, and
 * psychic techniques or Navigator Powers. Rank Boons grant a career Talent for
 * free at Ranks 2, 4, 6 and 8.
 */
import type { Char, Hero, SkillId } from '../engine/types.ts';
import { CHARS } from '../engine/types.ts';
import type { Rng } from '../engine/rng.ts';
import { CAREERS, featuresUpTo, rankFromXp } from '../content/careers.ts';
import { TALENTS } from '../content/talents.ts';
import { SKILLS, skillCost } from '../content/skills.ts';
import { POWERS } from '../content/powers.ts';
import { derive, effectiveChars, syncLevel, CHAR_NAMES } from './character.ts';

export interface AdvanceOption {
  id: string;
  kind: 'char' | 'skill' | 'talent' | 'power' | 'mastery';
  label: string;
  text: string;
  cost: number;
  ok: boolean;
  reason?: string;
}

const MASTERY_COST = [0, 300, 500];

export function boonsAvailable(hero: Hero): number {
  const n = featuresUpTo(hero.careerId, rankFromXp(hero.xp)).filter((f) => f.choice === 'talent').length;
  return Math.max(0, n - (hero.boonsTaken ?? 0));
}

function talentBlocked(hero: Hero, id: string): string | null {
  const def = TALENTS[id];
  if (!def) return 'Unknown talent';
  if (hero.talents.includes(id) && id !== 'soundConstitution') return 'Already known';
  if (id === 'soundConstitution' && hero.talents.filter((t) => t === 'soundConstitution').length >= rankFromXp(hero.xp)) return 'Once per Rank';
  const chars = effectiveChars(hero);
  for (const [k, v] of Object.entries(def.req ?? {})) if (chars[k as Char] < v!) return `Needs ${k} ${v}`;
  for (const n of def.needs ?? []) if (!hero.talents.includes(n)) return `Needs ${TALENTS[n]?.name ?? n}`;
  return null;
}

export function listAdvances(hero: Hero): AdvanceOption[] {
  const career = CAREERS[hero.careerId];
  const rank = rankFromXp(hero.xp);
  const avail = hero.xp - hero.xpSpent;
  const out: AdvanceOption[] = [];
  const add = (o: Omit<AdvanceOption, 'ok'>, block: string | null = null) => {
    const reason = block ?? (o.cost > avail ? `Needs ${o.cost} xp` : null);
    out.push({ ...o, ok: !reason, reason: reason ?? undefined });
  };
  for (const k of CHARS) {
    const n = hero.advances[k] ?? 0;
    if (n >= 4) continue;
    const tier = ['Simple', 'Intermediate', 'Trained', 'Expert'][n];
    add({ id: `char:${k}`, kind: 'char', label: `${CHAR_NAMES[k]} +5 (${tier})`, text: `${k} ${effectiveChars(hero)[k]} → ${effectiveChars(hero)[k] + 5}.`, cost: career.adv[k][n] });
  }
  for (const s of career.careerSkills) {
    const cur = hero.skills[s];
    if (cur !== undefined && cur >= 20) continue;
    const next = cur === undefined ? 0 : cur + 10;
    add({ id: `skill:${s}`, kind: 'skill', label: `${SKILLS[s].name}${next ? ` +${next}` : ''}`, text: SKILLS[s].text, cost: skillCost(next) });
  }
  for (const [t, r] of career.careerTalents) {
    const def = TALENTS[t];
    if (!def) continue;
    if (hero.talents.includes(t) && t !== 'soundConstitution') continue;
    add({ id: `talent:${t}`, kind: 'talent', label: def.name, text: def.text, cost: def.cost }, r > rank ? `Rank ${r}` : talentBlocked(hero, t));
  }
  if (career.psyker || career.navigator) {
    for (const p of Object.values(POWERS)) {
      if (career.psyker && p.discipline === 'Navigator') continue;
      if (career.navigator && p.discipline !== 'Navigator') continue;
      const known = hero.powers[p.id];
      if (known === undefined) {
        const need = (p.needs ?? []).find((n) => hero.powers[n] === undefined);
        add({ id: `power:${p.id}`, kind: 'power', label: `${p.discipline === 'Navigator' ? 'Navigator Power' : p.discipline}: ${p.name}`, text: p.text, cost: Math.max(100, p.cost) }, need ? `Needs ${POWERS[need].name}` : null);
      } else if (career.navigator && known < 2) {
        add({ id: `mastery:${p.id}`, kind: 'mastery', label: `${p.name}: ${known === 0 ? 'Adept' : 'Master'}`, text: `+10 to Tests with ${p.name} and stronger effects.`, cost: MASTERY_COST[known + 1] }, known + 1 > Math.ceil(rank / 2) ? `Rank ${(known + 1) * 2 - 1}` : null);
      }
    }
  }
  return out;
}

/** Talents a Rank Boon may take right now. */
export function boonOptions(hero: Hero): AdvanceOption[] {
  const rank = rankFromXp(hero.xp);
  return CAREERS[hero.careerId].careerTalents
    .filter(([t, r]) => r <= rank && TALENTS[t] && !talentBlocked(hero, t))
    .map(([t]) => ({ id: `talent:${t}`, kind: 'talent' as const, label: TALENTS[t].name, text: TALENTS[t].text, cost: 0, ok: true }));
}

export function buyAdvance(hero: Hero, id: string, opts: { boon?: boolean } = {}): string | null {
  if (opts.boon) {
    if (boonsAvailable(hero) < 1) return 'No Rank Boon to spend.';
    const o = boonOptions(hero).find((x) => x.id === id);
    if (!o) return 'Not a legal boon.';
    hero.talents.push(id.slice(7));
    hero.boonsTaken = (hero.boonsTaken ?? 0) + 1;
    afterChange(hero);
    return null;
  }
  const o = listAdvances(hero).find((x) => x.id === id);
  if (!o) return 'Not available.';
  if (!o.ok) return o.reason ?? 'Not available.';
  const [kind, key] = id.split(':');
  switch (kind) {
    case 'char': hero.advances[key as Char] = (hero.advances[key as Char] ?? 0) + 1; break;
    case 'skill': { const cur = hero.skills[key as SkillId]; hero.skills[key as SkillId] = cur === undefined ? 0 : cur + 10; break; }
    case 'talent': hero.talents.push(key); break;
    case 'power': hero.powers[key] = 0; break;
    case 'mastery': hero.powers[key] = (hero.powers[key] ?? 0) + 1; break;
  }
  hero.xpSpent += o.cost;
  afterChange(hero);
  return null;
}

function afterChange(hero: Hero) {
  const before = derive(hero).maxHp;
  syncLevel(hero);
  const after = derive(hero).maxHp;
  hero.hp = Math.max(1, Math.min(after, hero.hp + Math.max(0, after - before)));
}

/** Spend xp sensibly (recruits, the "recommended" button, autoplay). */
export function autoSpend(hero: Hero, rng?: Rng) {
  const career = CAREERS[hero.careerId];
  let guard = 0;
  while (boonsAvailable(hero) > 0 && guard++ < 10) {
    const opts = boonOptions(hero);
    if (!opts.length) break;
    const pick = rng ? rng.pick(opts) : opts[0];
    buyAdvance(hero, pick.id, { boon: true });
  }
  guard = 0;
  while (guard++ < 400) {
    const opts = listAdvances(hero).filter((o) => o.ok);
    if (!opts.length) return;
    const score = (o: AdvanceOption) => {
      if (o.kind === 'char') {
        const k = o.id.slice(5) as Char;
        const p = career.priority.indexOf(k);
        return 60 - p * 7 - o.cost / 40;
      }
      if (o.kind === 'power' || o.kind === 'mastery') return 55 - o.cost / 40;
      if (o.kind === 'talent') return ['swiftAttack', 'mightyShot', 'crushingBlow', 'psyRating3', 'psyRating4', 'soundConstitution', 'lightningAttack', 'pureFaith', 'trueGrit', 'divineMinistration'].includes(o.id.slice(7)) ? 58 - o.cost / 50 : 30 - o.cost / 50;
      return o.id === 'skill:dodge' || o.id === 'skill:command' || o.id === 'skill:medicae' ? 45 : 20 - o.cost / 50;
    };
    const best = opts.sort((a, b) => score(b) - score(a))[0];
    buyAdvance(hero, best.id);
  }
}
