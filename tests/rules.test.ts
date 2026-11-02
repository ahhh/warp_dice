import { describe, it, expect } from 'vitest';
import { test as d100Test, hitLocation, roll, bonus } from '../src/engine/dice.ts';
import { Rng, seedState } from '../src/engine/rng.ts';
import { createHero, derive, fullRestore, rollCharacteristics } from '../src/rules/character.ts';
import { listAdvances, buyAdvance, autoSpend, boonsAvailable } from '../src/rules/advance.ts';
import { CAREERS, CAREER_IDS, rankFromXp, levelFromXp, START_XP } from '../src/content/careers.ts';
import { ORIGINS, ORIGIN_BY_ID, legalAt, randomPath, validPath } from '../src/content/origins.ts';
import { TEMPLATES } from '../src/meta/town.ts';
import { ITEMS } from '../src/content/items.ts';
import { TALENTS } from '../src/content/talents.ts';
import { SKILLS } from '../src/content/skills.ts';
import { POWERS } from '../src/content/powers.ts';
import { soakFraction } from '../src/rules/balance.ts';
import { CHARS } from '../src/engine/types.ts';

describe('percentile Tests (Core p.230)', () => {
  const rng = new Rng(seedState('t'));
  it('counts Degrees of Success and Failure by full tens', () => {
    expect(d100Test(rng, 45, 12)).toMatchObject({ success: true, degrees: 3 });
    expect(d100Test(rng, 45, 45)).toMatchObject({ success: true, degrees: 0 });
    expect(d100Test(rng, 45, 46)).toMatchObject({ success: false, degrees: 0 });
    expect(d100Test(rng, 45, 78)).toMatchObject({ success: false, degrees: 3 });
    expect(d100Test(rng, 5, 1).success).toBe(true);
    expect(d100Test(rng, 120, 100).success).toBe(false);
    expect(d100Test(rng, 50, 33).doubles).toBe(true);
  });
  it('reads hit locations from the reversed roll (Table 9-6)', () => {
    expect(hitLocation(10)).toBe('head');   // 01
    expect(hitLocation(41)).toBe('rArm');   // 41 reversed is 14
    expect(hitLocation(14)).toBe('body');   // 41
    expect(hitLocation(28)).toBe('rLeg');   // 82
    expect(hitLocation(9)).toBe('lLeg');    // 90
    expect(hitLocation(52)).toBe('lArm');   // 25
  });
  it('characteristic bonus is the tens digit', () => {
    expect(bonus(37)).toBe(3);
    expect(bonus(40)).toBe(4);
  });
  it('flags natural 10s on d10s for Righteous Fury', () => {
    const r = roll(new Rng([1, 2, 3, 4]), '1d10+3', { maximize: true });
    expect(r.total).toBe(13);
    expect(r.fury).toBe(1);
  });
  it('Penetration cuts through armour', () => {
    expect(soakFraction(6, 0, 3)).toBeCloseTo(0.315);
    expect(soakFraction(6, 13, 3)).toBeCloseTo(0.075);
    expect(soakFraction(20, 0, 9)).toBe(0.6);
  });
});

describe('the Origin Path', () => {
  it('every row has six columns and every template is a legal path', () => {
    for (let row = 0; row < 5; row++) for (let slot = 0; slot < 6; slot++) expect(ORIGINS.some((o) => o.row === row && o.slot === slot)).toBe(true);
    for (const t of Object.values(TEMPLATES)) expect(validPath(t.path)).toBeNull();
  });
  it('enforces adjacency (Core p.15)', () => {
    expect(legalAt(1, 5).every((o) => o.slot >= 4)).toBe(true);
    expect(validPath(['deathWorld', 'vaunted', 'tainted', 'handOfWar', 'endurance'])).toMatch(/not reachable/);
    for (let i = 0; i < 200; i++) expect(validPath(randomPath(new Rng(seedState(`p${i}`))).ids)).toBeNull();
  });
  it('origin effects reference real skills and talents', () => {
    for (const o of ORIGINS) for (const e of [o.effect, ...(o.options ?? []).map((x) => x.effect)]) {
      for (const s of e.skills ?? []) expect(SKILLS[s], `${o.id} skill ${s}`).toBeTruthy();
      for (const t of e.talents ?? []) expect(TALENTS[t], `${o.id} talent ${t}`).toBeTruthy();
    }
  });
});

describe('careers and explorers', () => {
  it('every career builds with legal stats, kit, skills and powers', () => {
    for (const c of CAREER_IDS) {
      const rng = new Rng(seedState(c));
      const def = CAREERS[c];
      for (const s of [...def.skills, ...def.careerSkills]) expect(SKILLS[s], `${c} ${s}`).toBeTruthy();
      for (const t of [...def.talents, ...def.careerTalents.map((x) => x[0])]) expect(TALENTS[t], `${c} ${t}`).toBeTruthy();
      for (const [id] of def.kit) expect(ITEMS[id], `${c} kit ${id}`).toBeTruthy();
      for (const method of ['ordered', 'arranged', 'heroic', 'points'] as const) {
        const ch = rollCharacteristics(rng, c, method);
        for (const k of CHARS) { expect(ch[k]).toBeGreaterThanOrEqual(25); expect(ch[k]).toBeLessThanOrEqual(55); }
      }
      const h = createHero(rng, c, { lordCaptain: c === 'rogueTrader' });
      const d = derive(h);
      expect(d.maxHp).toBeGreaterThan(0);
      expect(h.fate).toBeGreaterThanOrEqual(1);
      expect(h.equipment.mainHand).toBeTruthy();
      if (def.psyker) expect(d.psyRating).toBe(2);
      if (def.psyker || def.navigator) expect(Object.keys(h.powers).every((p) => POWERS[p])).toBe(true);
    }
  });
  it('xp maps to Rank and power level (Core p.37)', () => {
    expect(rankFromXp(START_XP)).toBe(1);
    expect(rankFromXp(7000)).toBe(2);
    expect(rankFromXp(30000)).toBe(8);
    expect(levelFromXp(START_XP)).toBe(1);
    expect(levelFromXp(START_XP + 1250 * 19)).toBe(20);
  });
  it('advances cost the career scheme and respect Rank, prerequisites and caps', () => {
    const rng = new Rng(seedState('adv'));
    const h = createHero(rng, 'archMilitant');
    const ws = listAdvances(h).find((o) => o.id === 'char:BS')!;
    expect(ws.cost).toBe(100);
    expect(buyAdvance(h, 'char:BS')).toBeNull();
    expect(h.advances.BS).toBe(1);
    expect(listAdvances(h).find((o) => o.id === 'char:BS')!.cost).toBe(250);
    expect(listAdvances(h).find((o) => o.id === 'talent:lightningAttack')!.ok).toBe(false);
    h.xp += 30000;
    fullRestore(h);
    expect(boonsAvailable(h)).toBe(4);
    autoSpend(h, rng);
    expect(h.xp - h.xpSpent).toBeLessThan(2600);
    expect(boonsAvailable(h)).toBe(0);
    for (const k of CHARS) expect(h.advances[k]).toBeLessThanOrEqual(4);
  });
});
