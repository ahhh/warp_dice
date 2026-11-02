/**
 * Poker-dice hand evaluation for the Fortune Tray.
 *
 * Up to five dice are played. The best pattern decides the hand type, and only
 * the dice that form the pattern score their pips (the Balatro "scoring cards"
 * rule). Wild faces may take any value; xenos dice count as every material.
 */
import type { HandType, Material } from '../engine/types.ts';

export interface HandInfo {
  id: HandType;
  name: string;
  chips: number;
  mult: number;
  /** Per Omen level. */
  lvChips: number;
  lvMult: number;
  blurb: string;
}

/** Ordered weakest → strongest. */
export const HANDS: HandInfo[] = [
  { id: 'high', name: 'High Die', chips: 2, mult: 1, lvChips: 3, lvMult: 1, blurb: 'Your single best die.' },
  { id: 'pair', name: 'Pair', chips: 4, mult: 2, lvChips: 3, lvMult: 1, blurb: 'Two dice showing the same value.' },
  { id: 'twoPair', name: 'Two Pair', chips: 6, mult: 2, lvChips: 4, lvMult: 1, blurb: 'Two different pairs.' },
  { id: 'three', name: 'Three of a Kind', chips: 8, mult: 3, lvChips: 4, lvMult: 2, blurb: 'Three dice showing the same value.' },
  { id: 'straight', name: 'Straight', chips: 12, mult: 4, lvChips: 5, lvMult: 2, blurb: 'Five dice in an unbroken run.' },
  { id: 'set', name: 'Colours', chips: 10, mult: 4, lvChips: 5, lvMult: 2, blurb: 'Five dice of the same material: a house flying its colours.' },
  { id: 'fullHouse', name: 'Full House', chips: 12, mult: 4, lvChips: 5, lvMult: 2, blurb: 'A Three of a Kind and a Pair.' },
  { id: 'four', name: 'Four of a Kind', chips: 16, mult: 6, lvChips: 6, lvMult: 3, blurb: 'Four dice showing the same value.' },
  { id: 'straightSet', name: 'Straight Colours', chips: 24, mult: 8, lvChips: 8, lvMult: 3, blurb: 'A Straight made of one material.' },
  { id: 'five', name: 'Five of a Kind', chips: 30, mult: 10, lvChips: 8, lvMult: 3, blurb: 'All five dice the same. The Throne smiles.' },
  { id: 'fullSet', name: 'Full Colours', chips: 34, mult: 12, lvChips: 8, lvMult: 4, blurb: 'A Full House of one material.' },
  { id: 'hoard', name: "Emperor's Hand", chips: 40, mult: 14, lvChips: 10, lvMult: 4, blurb: 'Five of a Kind of one material.' },
];

export const HAND_BY_ID: Record<HandType, HandInfo> = Object.fromEntries(HANDS.map((h) => [h.id, h])) as Record<HandType, HandInfo>;
export const HAND_RANK: Record<HandType, number> = Object.fromEntries(HANDS.map((h, i) => [h.id, i])) as Record<HandType, number>;

/** Hands that "contain" another (Balatro semantics for "if hand contains a Pair"). */
export const CONTAINS: Record<HandType, HandType[]> = {
  high: ['high'],
  pair: ['pair', 'high'],
  twoPair: ['twoPair', 'pair', 'high'],
  three: ['three', 'pair', 'high'],
  straight: ['straight', 'high'],
  set: ['set', 'high'],
  fullHouse: ['fullHouse', 'three', 'twoPair', 'pair', 'high'],
  four: ['four', 'three', 'twoPair', 'pair', 'high'],
  straightSet: ['straightSet', 'straight', 'set', 'high'],
  five: ['five', 'four', 'three', 'twoPair', 'pair', 'high'],
  fullSet: ['fullSet', 'fullHouse', 'set', 'three', 'twoPair', 'pair', 'high'],
  hoard: ['hoard', 'five', 'set', 'four', 'three', 'twoPair', 'pair', 'high'],
};

export function handContains(hand: HandType, target: HandType): boolean {
  return CONTAINS[hand].includes(target);
}

export interface EvalDie {
  value: number;
  wild: boolean;
  material: Material;
}

export interface EvalRules {
  /** Straights/Sets may be formed from 4 dice. */
  fourFingers?: boolean;
  /** Straights may skip one value. */
  gapStraight?: boolean;
  /** All materials match (prism lens). */
  allPrism?: boolean;
  /** A single played die scores as Three of a Kind. */
  monolith?: boolean;
}

export interface EvalResult {
  hand: HandType;
  /** Indices (into the input array) of the dice that score. */
  scoring: number[];
  /** Effective values after wild assignment, aligned with input. */
  values: number[];
}

const MAX_FACE = 10;

function isStraight(vals: number[], need: number, gap: boolean): boolean {
  const s = [...new Set(vals)].sort((a, b) => a - b);
  if (s.length < need) return false;
  // Look for `need` distinct values with consecutive steps (one step of 2 allowed with gap).
  for (let start = 0; start + need <= s.length; start++) {
    let gaps = 0;
    let ok = true;
    for (let i = start + 1; i < start + need; i++) {
      const d = s[i] - s[i - 1];
      if (d === 1) continue;
      if (d === 2 && gap && gaps === 0) { gaps++; continue; }
      ok = false;
      break;
    }
    if (ok) return true;
  }
  return false;
}

function straightIndices(vals: number[], need: number, gap: boolean): number[] | null {
  // Choose a straight subset of indices of size `need` (distinct values).
  const byVal = new Map<number, number>();
  vals.forEach((v, i) => { if (!byVal.has(v)) byVal.set(v, i); });
  const s = [...byVal.keys()].sort((a, b) => a - b);
  for (let start = s.length - need; start >= 0; start--) {
    let gaps = 0;
    let ok = true;
    for (let i = start + 1; i < start + need; i++) {
      const d = s[i] - s[i - 1];
      if (d === 1) continue;
      if (d === 2 && gap && gaps === 0) { gaps++; continue; }
      ok = false;
      break;
    }
    if (ok) return s.slice(start, start + need).map((v) => byVal.get(v)!);
  }
  return null;
}

/** Evaluate with concrete values (no wilds). */
function evalConcrete(dice: EvalDie[], vals: number[], rules: EvalRules): EvalResult {
  const n = dice.length;
  const all = dice.map((_, i) => i);
  if (n === 0) return { hand: 'high', scoring: [], values: vals };

  // Count values.
  const groups = new Map<number, number[]>();
  vals.forEach((v, i) => {
    const g = groups.get(v) ?? [];
    g.push(i);
    groups.set(v, g);
  });
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || b[0] - a[0]);
  const counts = sorted.map(([, g]) => g.length);

  const need = rules.fourFingers ? 4 : 5;
  const mats = dice.map((d) => (rules.allPrism ? 'xenos' : d.material));
  const setIdx = findSet(mats, need);
  const straightIdx = n >= need ? straightIndices(vals, need, !!rules.gapStraight) : null;

  // Strongest first.
  if (counts[0] >= 5) {
    const idx = sorted[0][1].slice(0, 5);
    if (sameMaterial(idx.map((i) => mats[i]))) return { hand: 'hoard', scoring: idx, values: vals };
    return { hand: 'five', scoring: idx, values: vals };
  }
  if (counts[0] === 3 && counts[1] >= 2) {
    const idx = [...sorted[0][1], ...sorted[1][1].slice(0, 2)];
    if (sameMaterial(idx.map((i) => mats[i]))) return { hand: 'fullSet', scoring: idx, values: vals };
  }
  if (straightIdx && sameMaterial(straightIdx.map((i) => mats[i]))) {
    return { hand: 'straightSet', scoring: straightIdx, values: vals };
  }
  if (counts[0] >= 4) return { hand: 'four', scoring: sorted[0][1].slice(0, 4), values: vals };
  if (counts[0] === 3 && counts[1] >= 2) {
    return { hand: 'fullHouse', scoring: [...sorted[0][1], ...sorted[1][1].slice(0, 2)], values: vals };
  }
  if (setIdx) return { hand: 'set', scoring: setIdx, values: vals };
  if (straightIdx) return { hand: 'straight', scoring: straightIdx, values: vals };
  if (counts[0] === 3) return { hand: 'three', scoring: sorted[0][1], values: vals };
  if (counts[0] === 2 && counts[1] === 2) {
    return { hand: 'twoPair', scoring: [...sorted[0][1], ...sorted[1][1]], values: vals };
  }
  if (counts[0] === 2) return { hand: 'pair', scoring: sorted[0][1], values: vals };
  if (rules.monolith && n === 1) return { hand: 'three', scoring: [0], values: vals };
  // High die: the single highest.
  let best = 0;
  for (const i of all) if (vals[i] > vals[best]) best = i;
  return { hand: 'high', scoring: [best], values: vals };
}

/** Iron (and loaded) dice are colourless: they never form a Set. */
const COLOURLESS = new Set<Material>(['iron', 'loaded']);

function sameMaterial(mats: Material[]): boolean {
  if (mats.some((m) => COLOURLESS.has(m))) return false;
  const real = mats.filter((m) => m !== 'xenos');
  return real.every((m) => m === real[0]);
}

function findSet(mats: Material[], need: number): number[] | null {
  if (mats.length < need) return null;
  const candidates = new Set(mats.filter((m) => m !== 'xenos' && !COLOURLESS.has(m)));
  if (candidates.size === 0) {
    const prisms = mats.map((m, i) => (m === 'xenos' ? i : -1)).filter((i) => i >= 0);
    return prisms.length >= need ? prisms.slice(0, 5) : null;
  }
  for (const c of candidates) {
    const idx = mats.map((m, i) => (m === c || m === 'xenos' ? i : -1)).filter((i) => i >= 0);
    if (idx.length >= need) return idx.slice(0, 5);
  }
  return null;
}

/**
 * Evaluate the best hand for these dice, trying every assignment of wild
 * values. Ties broken by total scoring pips so a wild picks the bigger number.
 */
export function evaluateHand(dice: EvalDie[], rules: EvalRules = {}): EvalResult {
  const wildIdx = dice.map((d, i) => (d.wild ? i : -1)).filter((i) => i >= 0);
  const base = dice.map((d) => d.value);
  if (wildIdx.length === 0) return evalConcrete(dice, base, rules);

  // Candidate values for wilds: present values, plus neighbours that extend runs, plus max.
  const cand = new Set<number>([MAX_FACE, 9]);
  for (const v of base) for (const d of [-2, -1, 0, 1, 2]) if (v + d >= 1 && v + d <= MAX_FACE) cand.add(v + d);
  const cands = [...cand];

  let best: EvalResult | null = null;
  let bestKey = -1;
  const vals = base.slice();
  const rec = (k: number) => {
    if (k === wildIdx.length) {
      const r = evalConcrete(dice, vals.slice(), rules);
      const pips = r.scoring.reduce((a, i) => a + r.values[i], 0);
      const key = HAND_RANK[r.hand] * 1000 + pips;
      if (key > bestKey) { bestKey = key; best = r; }
      return;
    }
    for (const c of cands) {
      vals[wildIdx[k]] = c;
      rec(k + 1);
    }
  };
  rec(0);
  return best!;
}

export function handLevel(omens: Partial<Record<HandType, number>>, hand: HandType): number {
  return 1 + (omens[hand] ?? 0);
}

export function handBase(omens: Partial<Record<HandType, number>>, hand: HandType): { chips: number; mult: number } {
  const info = HAND_BY_ID[hand];
  const lv = omens[hand] ?? 0;
  return { chips: info.chips + info.lvChips * lv, mult: info.mult + info.lvMult * lv };
}

export { isStraight };
