/**
 * Tabletop dice: XdY+Z expressions (d5 and d10 included), percentile Tests
 * with Degrees of Success, hit locations by reversed digits, and Righteous
 * Fury on natural 10s.
 */
import type { Rng } from './rng.ts';
import type { HitLoc } from './types.ts';

export interface DiceExpr { count: number; sides: number; bonus: number }

const RE = /^\s*(\d*)d(\d+)\s*(?:([+-])\s*(\d+))?\s*$/i;

export function parseDice(expr: string): DiceExpr {
  const flat = /^\s*([+-]?\d+)\s*$/.exec(expr);
  if (flat) return { count: 0, sides: 0, bonus: Number(flat[1]) };
  const m = RE.exec(expr);
  if (!m) throw new Error(`bad dice expression: ${expr}`);
  return { count: m[1] === '' ? 1 : Number(m[1]), sides: Number(m[2]), bonus: m[3] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0 };
}

export function formatDice(d: DiceExpr): string {
  if (d.count === 0) return String(d.bonus);
  const b = d.bonus === 0 ? '' : d.bonus > 0 ? `+${d.bonus}` : `${d.bonus}`;
  return `${d.count}d${d.sides}${b}`;
}

export interface RollResult { total: number; rolls: number[]; fury: number }

/**
 * Roll an expression. Every natural 10 on a d10 counts toward Righteous Fury
 * (the caller decides whether a fury is confirmed).
 */
export function roll(rng: Rng, expr: string | DiceExpr, opts: { maximize?: boolean; minDie?: number; extraDice?: number } = {}): RollResult {
  const d = typeof expr === 'string' ? parseDice(expr) : expr;
  const rolls: number[] = [];
  const n = d.count + (opts.extraDice ?? 0);
  for (let i = 0; i < n; i++) {
    let r = opts.maximize ? d.sides : rng.die(d.sides);
    if (opts.minDie && r < opts.minDie) r = opts.minDie;
    rolls.push(r);
  }
  return { total: rolls.reduce((a, b) => a + b, 0) + d.bonus, rolls, fury: d.sides === 10 ? rolls.filter((r) => r === 10).length : 0 };
}

export function average(expr: string | DiceExpr): number {
  const d = typeof expr === 'string' ? parseDice(expr) : expr;
  return d.count * (d.sides + 1) / 2 + d.bonus;
}

// ── percentile tests ────────────────────────────────────────────────────────

export interface TestResult {
  roll: number;
  target: number;
  success: boolean;
  /** Degrees of Success (≥0) on a pass, Degrees of Failure (≥0) on a fail. */
  degrees: number;
  /** Doubles on the d100 (11, 22, …): Psychic Phenomena for unfettered psykers. */
  doubles: boolean;
}

export function d100(rng: Rng): number {
  return rng.int(1, 100);
}

/**
 * A Characteristic or Skill Test: roll d100 equal or under the target.
 * Degrees are counted per full 10 points of margin. 01 always passes and
 * 00 (100) always fails, as at most tables.
 */
export function test(rng: Rng, target: number, forced?: number): TestResult {
  const r = forced ?? d100(rng);
  const t = Math.max(1, Math.min(100, Math.round(target)));
  const success = r === 1 || (r !== 100 && r <= t);
  const degrees = success ? Math.max(0, Math.floor((t - r) / 10)) : Math.max(0, Math.floor((r - t) / 10));
  const doubles = r < 100 && r % 11 === 0;
  return { roll: r, target: t, success, degrees, doubles };
}

/** Chance (0..100) that a test against `target` passes. */
export function testChance(target: number): number {
  return Math.max(1, Math.min(99, Math.round(target)));
}

/** Reverse the digits of a percentile roll and read Table 9-6. */
export function hitLocation(rollValue: number): HitLoc {
  const s = String(rollValue % 100).padStart(2, '0');
  const r = Number(s[1] + s[0]) || 100;
  if (r <= 10) return 'head';
  if (r <= 20) return 'rArm';
  if (r <= 30) return 'lArm';
  if (r <= 70) return 'body';
  if (r <= 85) return 'rLeg';
  return 'lLeg';
}

export const LOC_NAME: Record<HitLoc, string> = {
  head: 'head', rArm: 'right arm', lArm: 'left arm', body: 'body', rLeg: 'right leg', lLeg: 'left leg',
};

/** Characteristic Bonus: the tens digit. */
export const bonus = (score: number) => Math.floor(Math.max(0, score) / 10);
