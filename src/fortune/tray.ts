/** Fortune run lifecycle and tray operations (draw, reroll, play, hexes). */
import type { CareerId, FortuneRun, HexId, TrayDie } from '../engine/types.ts';
import type { Rng } from '../engine/rng.ts';
import { buildStartingBag, rollFace, makeDie } from './materials.ts';
import { charmPassives, CHARM_BY_ID } from './charms.ts';

export const PLAY_LIMIT = 5;
export const BASE_HAND_SIZE = 7;
export const BASE_REROLLS = 2;
export const BASE_CHARM_SLOTS = 5;
export const MAX_TOKENS = 3;
export const INTEREST_STEP = 5;
export const INTEREST_CAP = 5;

export function newFortuneRun(rng: Rng, careers: CareerId[]): FortuneRun {
  return {
    bag: buildStartingBag(rng, careers),
    drawPile: [],
    discard: [],
    tray: [],
    charms: [],
    charmSlots: BASE_CHARM_SLOTS,
    omens: {},
    doubloons: 4,
    rank: 0,
    rerollsLeft: BASE_REROLLS,
    bonusHandSize: 0,
    bonusRerolls: 0,
    handsPlayed: {},
    bestScore: 0,
    tokens: ['mulligan'],
    seenCharms: [],
  };
}

/** Party level adds tray capacity: the persistent hero progression feeds the dice. */
export function levelHandBonus(maxLevel: number): number {
  return (maxLevel >= 5 ? 1 : 0) + (maxLevel >= 11 ? 1 : 0) + (maxLevel >= 17 ? 1 : 0);
}

export function handSize(run: FortuneRun, maxLevel: number, curseDelta = 0): number {
  return Math.max(3, BASE_HAND_SIZE + run.bonusHandSize + charmPassives(run).handSize + levelHandBonus(maxLevel) + curseDelta);
}

export function charmSlots(run: FortuneRun): number {
  return run.charmSlots + charmPassives(run).charmSlots;
}

export function rerollsPerTurn(run: FortuneRun, heroBonus: number, curseDelta = 0): number {
  return Math.max(0, BASE_REROLLS + run.bonusRerolls + charmPassives(run).rerolls + heroBonus + curseDelta);
}

function dieOf(run: FortuneRun, uid: string) {
  return run.bag.find((d) => d.uid === uid);
}

export function rollTrayDie(run: FortuneRun, rng: Rng, td: TrayDie): void {
  const die = dieOf(run, td.dieUid);
  if (!die) return;
  td.face = rollFace(rng, die);
  td.jinxed = false;
}

/** Shuffle the whole bag into the draw pile and deal a fresh tray. */
export function startCombatTray(run: FortuneRun, rng: Rng, size: number): void {
  run.tray = [];
  run.discard = [];
  run.drawPile = rng.shuffle(run.bag.map((d) => d.uid));
  refill(run, rng, size);
}

export function drawOne(run: FortuneRun, rng: Rng): string | null {
  if (run.drawPile.length === 0) {
    if (run.discard.length === 0) return null;
    run.drawPile = rng.shuffle(run.discard.slice());
    run.discard = [];
  }
  return run.drawPile.pop() ?? null;
}

export function refill(run: FortuneRun, rng: Rng, size: number): void {
  let guard = 0;
  while (run.tray.length < size && guard++ < 50) {
    const uid = drawOne(run, rng);
    if (!uid) break;
    const td: TrayDie = { dieUid: uid, face: 0 };
    rollTrayDie(run, rng, td);
    run.tray.push(td);
  }
}

export function reroll(run: FortuneRun, rng: Rng, indices: number[]): boolean {
  if (run.rerollsLeft <= 0 || indices.length === 0) return false;
  for (const i of indices) {
    const td = run.tray[i];
    if (td) rollTrayDie(run, rng, td);
  }
  run.rerollsLeft -= 1;
  for (const c of run.charms) CHARM_BY_ID[c.id]?.onReroll?.(c, run);
  return true;
}

/** Remove played dice from the tray, discard them, and refill. */
export function spendDice(run: FortuneRun, rng: Rng, indices: number[], size: number, shattered: string[] = []): void {
  const set = new Set(indices);
  const kept: TrayDie[] = [];
  run.tray.forEach((td, i) => {
    if (!set.has(i)) { kept.push(td); return; }
    if (td.ghost) {
      run.bag = run.bag.filter((d) => d.uid !== td.dieUid);
      return;
    }
    if (shattered.includes(td.dieUid)) {
      run.bag = run.bag.filter((d) => d.uid !== td.dieUid);
      return;
    }
    run.discard.push(td.dieUid);
  });
  run.tray = kept;
  refill(run, rng, size);
}

/** After combat: clear ghosts, recall all dice. */
export function endCombatTray(run: FortuneRun): void {
  const ghosts = new Set(run.tray.filter((t) => t.ghost).map((t) => t.dieUid));
  run.bag = run.bag.filter((d) => !ghosts.has(d.uid) && !d.uid.startsWith('ghost'));
  // Combat-only cursed faces wear off.
  for (const d of run.bag) d.faces = d.faces.map((f) => (f.mod === 'cursed' ? { v: f.v } : f));
  run.tray = [];
  run.drawPile = [];
  run.discard = [];
}

export function interest(run: FortuneRun): number {
  const cap = INTEREST_CAP + charmPassives(run).interestCap;
  return Math.min(cap, Math.floor(run.doubloons / INTEREST_STEP));
}

/** Add a temporary die straight onto the tray (Sanctify, Fabricate, Master & Commander). */
export function addGhostDie(run: FortuneRun, rng: Rng, material: FortuneRun['bag'][number]['material'], value: number): void {
  const die = makeDie(rng, material, Array.from({ length: 10 }, () => ({ v: value })), 'Conjured');
  die.uid = `ghost${die.uid}`;
  run.bag.push(die);
  run.tray.push({ dieUid: die.uid, face: 0, ghost: true });
}

export interface HexResult { text: string }

/** Enemy hexes that bend the tray. Returns a log line, or null if nothing happened. */
export function applyHex(run: FortuneRun, rng: Rng, hex: HexId, size: number): string | null {
  const faceVal = (td: TrayDie) => dieOf(run, td.dieUid)?.faces[td.face]?.v ?? 0;
  switch (hex) {
    case 'jinx': {
      const cands = run.tray.filter((t) => !t.jinxed);
      if (!cands.length) return null;
      const best = cands.reduce((a, b) => (faceVal(b) > faceVal(a) ? b : a));
      best.jinxed = true;
      return `jinxes your ${faceVal(best)} — it can't be played until rerolled!`;
    }
    case 'pilfer': {
      if (run.tray.length <= 2) return null;
      const i = rng.int(0, run.tray.length - 1);
      const [td] = run.tray.splice(i, 1);
      if (td.ghost) run.bag = run.bag.filter((d) => d.uid !== td.dieUid);
      else run.discard.push(td.dieUid);
      refill(run, rng, size - 1);
      return `snatches a die from your tray!`;
    }
    case 'curseFace': {
      const die = rng.pick(run.bag.filter((d) => !d.uid.startsWith('ghost')));
      if (!die) return null;
      const fi = rng.int(0, die.faces.length - 1);
      die.faces[fi] = { v: die.faces[fi].v, mod: 'cursed' };
      return `curses a face of one of your dice for this fight.`;
    }
    case 'invert': {
      for (const td of run.tray) {
        const die = dieOf(run, td.dieUid);
        if (!die) continue;
        const target = 11 - (die.faces[td.face]?.v ?? 1);
        const idx = die.faces.findIndex((f) => f.v === target);
        if (idx >= 0) td.face = idx;
      }
      return `turns your dice upside-down!`;
    }
    case 'drain':
      run.rerollsLeft = Math.max(0, run.rerollsLeft - 1);
      return `drains your luck — one fewer reroll.`;
    case 'snuff': {
      const lost = Math.min(2, run.doubloons);
      if (!lost) return null;
      run.doubloons -= lost;
      return `pinches ${lost} scrip!`;
    }
  }
}

export function faceValue(run: FortuneRun, td: TrayDie): number {
  return dieOf(run, td.dieUid)?.faces[td.face]?.v ?? 0;
}

/** Nudge a tray die to an adjacent face value (Arch-militant's Steady Aim). */
export function nudge(run: FortuneRun, i: number, delta: 1 | -1): boolean {
  const td = run.tray[i];
  const die = td && dieOf(run, td.dieUid);
  if (!die) return false;
  const cur = die.faces[td.face].v;
  const want = cur + delta;
  const idx = die.faces.findIndex((f) => f.v === want);
  if (idx >= 0) { td.face = idx; td.jinxed = false; return true; }
  return false;
}

/** Set a die to show a given value if it has such a face; otherwise a face is rewritten for this combat. */
export function forceValue(run: FortuneRun, i: number, value: number): boolean {
  const td = run.tray[i];
  const die = td && dieOf(run, td.dieUid);
  if (!die) return false;
  const idx = die.faces.findIndex((f) => f.v === value);
  if (idx >= 0) { td.face = idx; td.jinxed = false; return true; }
  // Ghost copy so the bag die isn't permanently changed.
  return false;
}

export function flip(run: FortuneRun, i: number): boolean {
  const td = run.tray[i];
  const die = td && dieOf(run, td.dieUid);
  if (!die) return false;
  const target = 11 - die.faces[td.face].v;
  const idx = die.faces.findIndex((f) => f.v === target);
  if (idx < 0) return false;
  td.face = idx;
  td.jinxed = false;
  return true;
}
