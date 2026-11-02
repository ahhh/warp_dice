/**
 * Tuning knobs. The Rogue Trader kernel runs on a bigger number scale so the
 * Fortune multiplier has room to breathe:
 *   explorer Wounds and healing  × VITALITY, growing with power level
 *   foe Wounds                   × the curve below, then × Fortress depth
 * Armour and Toughness turn into a percentage soak at this scale (see
 * soakFraction), so Penetration still decides what bites.
 * Values were calibrated with scripts/sim.ts.
 */
export const VITALITY = 2.5;
/** Explorer Wounds grow with power level (Rogue Trader wounds barely do). */
export const VITALITY_GROWTH = 0.3;
/** Veterans hit harder: explorer damage before the Fortune hand grows with power level. */
export const POWER_GROWTH = 0.08;
export const powerScale = (level: number) => 1 + POWER_GROWTH * (level - 1);

/** Echo factor for damage that doesn't pass through a Fortune hand (riders, bleeding, explosions). */
export const ECHO = 5;

export const HEAL_MULT_SLOPE = 0.5;

/** Foe stat curves by effective level (1–20). */
export function monsterHp(level: number): number {
  return Math.round(220 * (1 + 0.15 * (level - 1)));
}
export function monsterDamage(level: number): number {
  return Math.round(8.2 + 2.45 * (level - 1));
}
/** Foe WS/BS: 30 at level 1 up to ~65. */
export function monsterSkill(level: number): number {
  return Math.round(30 + level * 1.8);
}
export function monsterWp(level: number): number {
  return Math.round(28 + level * 1.6);
}
export function monsterAp(level: number): number {
  return 2 + Math.floor(level / 4);
}
export function monsterTb(level: number): number {
  return 3 + Math.floor(level / 6);
}

/**
 * Fraction of a hit that armour and Toughness absorb at this scale:
 * 4% per point of AP that the weapon fails to penetrate, plus 2.5% per point
 * of Toughness Bonus, capped at 60%. Warp damage ignores it.
 */
export function soakFraction(ap: number, pen: number, tb: number): number {
  return Math.min(0.6, Math.max(0, ap - pen) * 0.04 + tb * 0.025);
}

export function depthScale(depth: number, level = 1): number {
  const base = level >= 11 ? 1.11 : level >= 5 ? 1.16 : 1.22;
  return Math.pow(base, depth);
}

export const DIFFICULTY_MOD = {
  explorer: { hp: 0.8, dmg: 0.8, gold: 0.8, enemies: 0 },
  standard: { hp: 1, dmg: 1, gold: 1, enemies: 0 },
  perilous: { hp: 1.12, dmg: 1.12, gold: 1.5, enemies: 1 },
} as const;

export const ROLE_MOD: Record<string, { hp: number; dmg: number; ap: number; skill: number }> = {
  brute: { hp: 1.35, dmg: 1.25, ap: 0, skill: 0 },
  skirmisher: { hp: 0.8, dmg: 1.0, ap: -1, skill: 5 },
  controller: { hp: 0.9, dmg: 0.8, ap: 0, skill: 0 },
  artillery: { hp: 0.75, dmg: 1.1, ap: -1, skill: 5 },
  healer: { hp: 0.85, dmg: 0.7, ap: 0, skill: 0 },
  defender: { hp: 1.6, dmg: 0.8, ap: 3, skill: -5 },
  minion: { hp: 0.45, dmg: 0.7, ap: -1, skill: 0 },
  boss: { hp: 6.2, dmg: 1.45, ap: 2, skill: 10 },
};

export const ELITE_MOD = { hp: 1.8, dmg: 1.25, ap: 1, skill: 5 };

/** Thrones per combat, scaled by level. */
export function goldReward(level: number, kind: string): number {
  const base = 10 + level * 6;
  return Math.round(base * (kind === 'boss' ? 6 : kind === 'elite' ? 2.5 : 1));
}

export const DOUBLOONS_PER_COMBAT = { normal: 3, ambush: 3, elite: 5, boss: 8 } as const;

/** Experience: per fight, and for walking out alive with the Fortress lord dead. */
export const XP_PER_FIGHT = { normal: 40, ambush: 40, elite: 80, boss: 150 } as const;
export const XP_PER_CLEAR = 900;
