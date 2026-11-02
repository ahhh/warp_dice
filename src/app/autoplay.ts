/**
 * A reasonable headless player, used by tests and the balance simulator.
 * It plays through the same dispatch() commands as the UI.
 */
import type { GameState, RelDir, Facing } from '../engine/types.ts';
import { dispatch } from './commands.ts';
import { makeCtx, current, livingEnemies, livingHeroes, heroOf } from '../combat/core.ts';
import { listActions, legalTargets, listTalents, type ActionOption } from '../combat/hero.ts';
import { previewHand } from '../fortune/scoring.ts';
import { HAND_RANK } from '../fortune/hands.ts';
import { CLASS_MATERIAL } from '../fortune/materials.ts';
import { exitsView, eventOptions, dirFor } from '../dungeon/explore.ts';
import { DIRS } from '../dungeon/generator.ts';
import { derive } from '../rules/character.ts';
import { autoSpend } from '../rules/advance.ts';
import { offerNeedsTarget } from '../fortune/boons.ts';
import { ITEMS } from '../content/items.ts';
import { Rng } from '../engine/rng.ts';

const DEBUG = !!(globalThis as { process?: { env?: Record<string, string> } }).process?.env?.TD_DEBUG;

/** Best subset of up to `limit` tray dice by previewed score. */
export function bestDice(g: GameState, limit = 5, base = 8): { dice: number[]; score: number; rank: number } {
  const exp = g.expedition!;
  const run = exp.fortune;
  const ctx = makeCtx(g);
  const actor = current(ctx);
  const h = actor ? heroOf(ctx, actor) : undefined;
  const n = run.tray.length;
  let best = { dice: [] as number[], score: 0, rank: -1 };
  const idx = [...Array(n).keys()].filter((i) => !run.tray[i].jinxed);
  const rng = new Rng([1, 2, 3, 4]);
  const subsets = (arr: number[], k: number): number[][] => {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const [first, ...rest] = arr;
    return [...subsets(rest, k - 1).map((s) => [first, ...s]), ...subsets(rest, k)];
  };
  for (let k = 1; k <= Math.min(limit, idx.length); k++) {
    for (const s of subsets(idx, k)) {
      const p = previewHand({ run, trayIndices: s, actor: { careerId: h?.careerId ?? 'archMilitant', level: h?.level ?? 1, hpFrac: 1, affinity: CLASS_MATERIAL[h?.careerId ?? 'archMilitant'] }, action: 'attack', base, baseLabel: '', rng, firstHand: false, marked: false, enemiesAlive: 2, curse: exp.combat?.curse });
      const scoringOnly = p.scoringDice.length === s.length;
      const val = p.total + (p.fury ?? 0) * 5 * p.mult - (scoringOnly ? 0 : 1);
      if (val > best.score) best = { dice: s, score: val, rank: HAND_RANK[p.hand] };
    }
  }
  return best;
}

function pickAction(g: GameState): { opt: ActionOption; targets: string[]; slot?: number } | null {
  const ctx = makeCtx(g);
  const c = current(ctx)!;
  const opts = listActions(ctx).filter((o) => o.usable);
  const enemies = livingEnemies(ctx);
  const allies = livingHeroes(ctx);
  const weakest = allies.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  const downed = ctx.combat.order.map((id) => ctx.combat.combatants[id]).find((x) => x.side === 'hero' && x.downed && !x.dead);
  const pickEnemy = (o: ActionOption) => legalTargets(ctx, o.target, !!o.melee).slice().sort((a, b) => a.hp - b.hp)[0];
  const byKey = (k: string) => opts.find((o) => o.key === k);
  const boss = ctx.combat.kind === 'boss' || ctx.combat.kind === 'elite';
  if (downed) {
    const m = byKey('feat:miracle');
    if (m) return { opt: m, targets: [downed.id] };
  }
  if (downed || (weakest && weakest.hp / weakest.maxHp < 0.35)) {
    const tgt = downed ?? weakest;
    const heals = opts.filter((o) => o.fortune === 'heal' && (o.target === 'ally' || o.target === 'allies' || (o.target === 'self' && tgt.id === c.id)));
    const hw = heals.find((o) => o.key === 'feat:medicae') ?? heals.find((o) => o.group === 'item') ?? heals[0];
    if (hw) return { opt: hw, targets: [tgt.id] };
  }
  if (ctx.combat.round <= 2) {
    for (const k of ['feat:rally', 'feat:exhort', 'power:foreshadow', 'feat:evasive', 'feat:frenzy']) {
      const o = byKey(k);
      if (o && ctx.combat.round <= 1) return { opt: o, targets: [] };
    }
    for (const k of ['feat:mark', 'feat:analyse', 'power:gazeIntoTheAbyss']) {
      const o = byKey(k);
      if (o && boss && enemies.length) return { opt: o, targets: [enemies.find((e) => e.mon?.boss)?.id ?? enemies[0].id] };
    }
  }
  if (byKey('feat:masterStroke') && boss) return { opt: byKey('feat:masterStroke')!, targets: [] };
  const dmg = opts.filter((o) => (o.fortune === 'attack' || o.fortune === 'spell') && o.group !== 'item');
  if (!dmg.length) {
    const guard = byKey('guard') ?? byKey('aim');
    const jam = byKey('clearJam');
    if (jam) return { opt: jam, targets: [] };
    return guard ? { opt: guard, targets: [] } : null;
  }
  const scoreOpt = (o: ActionOption) => {
    const aoe = o.target === 'enemies' ? enemies.length : o.target === 'rank' ? Math.max(1, enemies.filter((e) => e.rank === 'front').length) : 1;
    let v = 20;
    if (o.key === 'full') v = 34;
    else if (o.key === 'semi') v = 30;
    else if (o.key === 'multi') v = 32;
    else if (o.key === 'allOut' || o.key === 'charge') v = 26;
    else if (o.key === 'called') v = 18;
    else if (o.key.startsWith('power:')) v = 26;
    else if (o.key === 'feat:ship') v = boss ? 60 : 10;
    else if (o.key === 'feat:suppress') v = 24;
    if (o.chance !== undefined) v *= Math.max(0.2, o.chance / 60);
    return v * aoe;
  };
  const best = dmg.sort((a, b) => scoreOpt(b) - scoreOpt(a))[0];
  const tgt = best.target === 'enemy' || best.target === 'rank' ? pickEnemy(best) : undefined;
  return { opt: best, targets: tgt ? [tgt.id] : [], slot: best.slots ? 2 : undefined };
}

export function autoCombatStep(g: GameState): boolean {
  const exp = g.expedition!;
  const ctx = makeCtx(g);
  const c = current(ctx);
  if (!c || c.side !== 'hero' || !ctx.combat.turn) return false;
  const run = exp.fortune;
  // Shape the tray: reroll the non-scoring dice while the hand is weak.
  let guard = 0;
  while (run.rerollsLeft > 0 && guard++ < 4) {
    if (g.expedition?.combat?.status !== 'active') return true;
    const b = bestDice(g);
    if (b.rank >= HAND_RANK.three) break;
    const keep = new Set(b.dice);
    const toss = run.tray.map((_, i) => i).filter((i) => !keep.has(i) || run.tray[i].jinxed);
    if (!toss.length) break;
    if (!dispatch(g, { type: 'combat', cmd: { type: 'reroll', dice: toss } }).ok) break;
  }
  if (g.expedition?.combat?.status !== 'active') return true;
  // Free tray talents that need no die.
  for (const t of listTalents(makeCtx(g))) if (t.usable && t.needs === 'none' && t.id === 'speculate' && run.rerollsLeft === 0) dispatch(g, { type: 'combat', cmd: { type: 'talent', id: t.id } });
  const turnStamp = `${ctx.combat.round}:${ctx.combat.turnIndex}`;
  for (let step = 0; step < 4; step++) {
    const cx = g.expedition?.combat ? makeCtx(g) : null;
    if (!cx || cx.combat.status !== 'active' || cx.combat.turn?.actorId !== c.id || `${cx.combat.round}:${cx.combat.turnIndex}` !== turnStamp) return true;
    const pick = pickAction(g);
    if (!pick) break;
    const t = cx.combat.turn;
    const dice = pick.opt.fortune !== 'none' && t.playsUsed < t.plays ? bestDice(g, t.playLimit).dice : [];
    const r = dispatch(g, { type: 'combat', cmd: { type: 'act', key: pick.opt.key, targets: pick.targets, dice, slot: pick.slot } });
    if (DEBUG) console.log('AUTOPLAY', c.name, pick.opt.key, dice, r.ok ? '' : r.error);
    if (!r.ok) break;
  }
  const cx = g.expedition?.combat ? makeCtx(g) : null;
  if (cx && cx.combat.status === 'active' && cx.combat.turn?.actorId === c.id && `${cx.combat.round}:${cx.combat.turnIndex}` === turnStamp) dispatch(g, { type: 'combat', cmd: { type: 'endTurn' } });
  return true;
}

function pathTo(g: GameState, goal: (k: string) => boolean): Facing | null {
  const exp = g.expedition!;
  const start = exp.pos;
  const prev = new Map<string, { from: string; dir: Facing }>();
  const q = [start];
  const seen = new Set([start]);
  while (q.length) {
    const k = q.shift()!;
    if (k !== start && goal(k)) {
      let cur = k;
      while (prev.get(cur)!.from !== start) cur = prev.get(cur)!.from;
      return prev.get(cur)!.dir;
    }
    const room = exp.map.rooms[k];
    for (const d of DIRS) {
      const e = room.exits[d];
      if (!e || seen.has(e.to)) continue;
      if (e.hidden && !exp.searched.includes(`${k}:${d}`)) continue;
      if (e.lock === 'sigil' && !exp.keys.includes('sigil')) continue;
      if (e.lock === 'water' && exp.meter >= 1) continue;
      if (e.lock === 'mirror' && !exp.flags.mirrorOpen) continue;
      seen.add(e.to);
      prev.set(e.to, { from: k, dir: d });
      q.push(e.to);
    }
  }
  return null;
}

function relFor(g: GameState, dir: Facing): RelDir | null {
  for (const r of ['forward', 'left', 'right', 'back'] as RelDir[]) if (dirFor(g, r) === dir) return r;
  return null;
}

export function autoExploreStep(g: GameState): boolean {
  const exp = g.expedition!;
  if (exp.spoils) { dispatch(g, { type: 'closeSpoils' }); return true; }
  if (exp.lootChoice) { dispatch(g, { type: 'pickLoot', idx: 0 }); return true; }
  if (exp.boons) {
    const i = exp.boons.offers.findIndex((o) => !o.sold && !offerNeedsTarget(o));
    if (i >= 0) {
      const r = dispatch(g, { type: 'pickBoon', idx: i, replaceCharm: exp.fortune.charms.length >= 5 ? 0 : undefined });
      if (!r.ok) dispatch(g, { type: 'skipBoon' });
    } else {
      const j = exp.boons.offers.findIndex((o) => !o.sold);
      const o = exp.boons.offers[j];
      const need = offerNeedsTarget(o);
      const die = exp.fortune.bag.find((d) => d.material === 'iron') ?? exp.fortune.bag[0];
      const r = dispatch(g, { type: 'pickBoon', idx: j, dieUid: die.uid, face: need === 'face' ? 9 : undefined });
      if (!r.ok) dispatch(g, { type: 'skipBoon' });
    }
    return true;
  }
  if (exp.event) {
    if (exp.event.stage === 'choose') {
      const opts = eventOptions(g);
      const i = opts.findIndex((o) => o.usable && !o.success.some((s) => s.type === 'combat') && !o.label.startsWith('Leave') && !o.label.startsWith('Walk') && !o.success.some((s) => s.type === 'corruption'));
      // Fall back to the last option it can actually afford; if a choice still
      // fails, close the event rather than retrying the same command forever.
      const fallback = opts.map((o, k) => (o.usable ? k : -1)).filter((k) => k >= 0).pop() ?? -1;
      const pick = i >= 0 ? i : fallback;
      if (pick < 0 || !dispatch(g, { type: 'eventChoice', idx: pick, useHelper: true }).ok) dispatch(g, { type: 'eventClose' });
    } else if (exp.event.stage === 'pickDie') {
      const die = exp.fortune.bag.find((d) => d.material === 'iron') ?? exp.fortune.bag[0];
      dispatch(g, { type: 'sacrifice', dieUid: die.uid });
    } else dispatch(g, { type: 'eventClose' });
    return true;
  }
  if (exp.shop) {
    const i = exp.shop.offers.findIndex((o) => !o.sold && (o.price ?? 0) <= exp.fortune.doubloons && o.kind === 'charm' && exp.fortune.charms.length < 5);
    if (i >= 0 && dispatch(g, { type: 'shopBuy', idx: i }).ok) return true;
    const j = exp.shop.offers.findIndex((o) => !o.sold && (o.price ?? 0) <= exp.fortune.doubloons && o.kind === 'omen');
    if (j >= 0 && dispatch(g, { type: 'shopBuy', idx: j }).ok) return true;
    dispatch(g, { type: 'shopClose' });
    return true;
  }
  const room = exp.map.rooms[exp.pos];
  if (room.loot && !room.loot.taken && (!room.encounter || room.encounter.cleared)) { dispatch(g, { type: 'takeLoot' }); return true; }
  const members = exp.partyIds.map((id) => g.roster.find((h) => h.id === id)!).filter((h) => h.status === 'alive');
  if (room.type === 'camp') {
    const frac = members.reduce((a, h) => a + h.hp / derive(h).maxHp, 0) / members.length;
    if (frac < 0.5 && !exp.longRestUsed) { dispatch(g, { type: 'rest', kind: 'long' }); return true; }
    if (frac < 0.85 && !exp.flags[`rested:${room.key}`]) { dispatch(g, { type: 'rest', kind: 'short' }); return true; }
  }
  for (const h of members) {
    if (h.hp < derive(h).maxHp * 0.35) {
      const pot = exp.carriedItems.find((i) => ITEMS[i.defId]?.consumable?.effect === 'heal');
      if (pot && dispatch(g, { type: 'useItem', uid: pot.uid, heroId: h.id }).ok) return true;
    }
  }
  if (exp.bossDefeated) { dispatch(g, { type: 'exitDungeon' }); return true; }
  const wantKey = !exp.keys.includes('sigil');
  let dir = wantKey ? pathTo(g, (k) => exp.map.rooms[k].type === 'key' && !exp.visited.includes(k)) : null;
  if (!dir) dir = pathTo(g, (k) => !exp.visited.includes(k) && exp.map.rooms[k].type !== 'boss');
  if (!dir && !wantKey) dir = pathTo(g, (k) => k === exp.map.bossKey);
  if (!dir) {
    if (!exp.flags[`searched:${exp.pos}`]) { dispatch(g, { type: 'search' }); return true; }
    dir = pathTo(g, (k) => !exp.flags[`searched:${k}`]);
    if (!dir) return false;
  }
  void exitsView;
  const rel = relFor(g, dir);
  if (!rel) return false;
  return dispatch(g, { type: 'move', dir: rel }).ok;
}

export interface RunReport { result: 'won' | 'retreated' | 'wiped' | 'stuck'; combats: number; steps: number; bestScore: number; rank: number; charms: number; turns: number }

export function autoExpedition(g: GameState, maxSteps = 5000): RunReport {
  let steps = 0;
  let turns = 0;
  let stuck = 0;
  while (g.expedition && steps++ < maxSteps) {
    const exp = g.expedition;
    if (exp.combat && exp.combat.status === 'active') {
      if (!autoCombatStep(g)) { stuck++; if (stuck > 5) break; } else { stuck = 0; turns++; }
      continue;
    }
    if (!autoExploreStep(g)) { stuck++; if (stuck > 3) break; } else stuck = 0;
  }
  const r = g.lastResult;
  return {
    result: g.expedition ? 'stuck' : r?.kind ?? 'stuck', combats: r?.fights ?? 0, steps, bestScore: r?.score ?? 0, rank: r?.rank ?? 0, charms: r?.charms.length ?? 0, turns,
  };
}

/** Spend every explorer's xp the way the recommended button would. */
export function autoAdvanceAll(g: GameState) {
  for (const h of g.roster.filter((x) => x.status === 'alive')) autoSpend(h);
}
