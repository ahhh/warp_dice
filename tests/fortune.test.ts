import { describe, it, expect } from 'vitest';
import { evaluateHand, type EvalDie } from '../src/fortune/hands.ts';
import { Rng, seedState } from '../src/engine/rng.ts';
import { newFortuneRun, startCombatTray, reroll, spendDice, flip } from '../src/fortune/tray.ts';
import { scoreHand } from '../src/fortune/scoring.ts';
import { newCharm, CHARMS } from '../src/fortune/charms.ts';
import { applyOffer, rollBoons, rollShop } from '../src/fortune/boons.ts';
import { MATERIALS, SPECIAL_DICE } from '../src/fortune/materials.ts';

const d = (value: number, material: EvalDie['material'] = 'iron', wild = false): EvalDie => ({ value, material, wild });
const actor = { careerId: 'archMilitant', level: 1, hpFrac: 1, affinity: 'adamant' as const };

describe('d10 hands', () => {
  it('detects the hands', () => {
    expect(evaluateHand([d(3)]).hand).toBe('high');
    expect(evaluateHand([d(3), d(3), d(5)]).hand).toBe('pair');
    expect(evaluateHand([d(6), d(7), d(8), d(9), d(10)]).hand).toBe('straight');
    expect(evaluateHand([d(1, 'aquila'), d(1, 'aquila'), d(3, 'aquila'), d(4, 'aquila'), d(9, 'aquila')]).hand).toBe('set');
    expect(evaluateHand([d(10, 'warp'), d(10, 'warp'), d(10, 'warp'), d(10, 'warp'), d(10, 'xenos')]).hand).toBe('hoard');
    expect(evaluateHand([d(1), d(1), d(1), d(1), d(1)]).hand).toBe('five');
  });
  it('iron dice never make Colours; wilds take the best value', () => {
    expect(evaluateHand([d(1), d(2), d(4), d(7), d(9)]).hand).toBe('high');
    expect(evaluateHand([d(7), d(8), d(9), d(10), d(1, 'iron', true)]).hand).toBe('straight');
  });
  it('every special die has ten faces in range', () => {
    for (const s of SPECIAL_DICE) { expect(s.faces.length).toBe(10); for (const f of s.faces) { expect(f.v).toBeGreaterThanOrEqual(1); expect(f.v).toBeLessThanOrEqual(10); } expect(MATERIALS[s.material]).toBeTruthy(); }
  });
});

describe('scoring', () => {
  const rng = new Rng(seedState('test'));
  it('computes (base + chips + pips) × mult and counts scored 10s as Righteous Fury', () => {
    const run = newFortuneRun(rng, ['archMilitant', 'missionary', 'voidMaster']);
    const iron = run.bag.filter((x) => x.material === 'iron');
    run.tray = [{ dieUid: iron[0].uid, face: 9 }, { dieUid: iron[1].uid, face: 9 }];
    const s = scoreHand({ run, trayIndices: [0, 1], actor, action: 'attack', base: 8, baseLabel: 'Lasgun', rng, firstHand: false, marked: false, enemiesAlive: 1 });
    expect(s.hand).toBe('pair');
    expect(s.total).toBe((8 + 4 + 10 + 10) * 2);
    expect(s.fury).toBe(2);
    run.charms.push(newCharm('copperTooth'), newCharm('twinFang'));
    expect(scoreHand({ run, trayIndices: [0, 1], actor, action: 'attack', base: 8, baseLabel: 'x', rng, firstHand: false, marked: false, enemiesAlive: 1 }).total).toBe(32 * 12);
  });
  it('curses debuff dice', () => {
    const run = newFortuneRun(rng, ['archMilitant']);
    const iron = run.bag.filter((x) => x.material === 'iron');
    run.tray = [{ dieUid: iron[0].uid, face: 0 }, { dieUid: iron[1].uid, face: 0 }];
    const r = scoreHand({ run, trayIndices: [0, 1], actor, action: 'attack', base: 5, baseLabel: 'x', rng, firstHand: false, marked: false, enemiesAlive: 1, curse: 'ashen' });
    expect(r.scoringDice.length).toBe(0);
  });
  it('has 64 relics with unique ids', () => {
    expect(CHARMS.length).toBe(64);
    expect(new Set(CHARMS.map((c) => c.id)).size).toBe(64);
  });
});

describe('tray', () => {
  it('draws, rerolls, spends, flips and refills deterministically', () => {
    const a = new Rng(seedState('tray')), b = new Rng(seedState('tray'));
    const ra = newFortuneRun(a, ['rogueTrader', 'astropath', 'navigator', 'seneschal']);
    const rb = newFortuneRun(b, ['rogueTrader', 'astropath', 'navigator', 'seneschal']);
    expect(ra.bag.length).toBe(14);
    startCombatTray(ra, a, 7); startCombatTray(rb, b, 7);
    expect(ra.tray).toEqual(rb.tray);
    reroll(ra, a, [0, 1]); reroll(rb, b, [0, 1]);
    expect(ra.tray).toEqual(rb.tray);
    const die = ra.bag.find((x) => x.uid === ra.tray[2].dieUid)!;
    const v = die.faces[ra.tray[2].face].v;
    flip(ra, 2);
    expect(die.faces[ra.tray[2].face].v).toBe(11 - v);
    spendDice(ra, a, [0, 1, 2], 7);
    expect(ra.tray.length).toBe(7);
  });
  it('boons and the scavenger apply', () => {
    const rng = new Rng(seedState('boon'));
    const run = newFortuneRun(rng, ['explorator']);
    expect(rollBoons(rng, run, 'normal').some((o) => o.kind === 'charm')).toBe(true);
    expect(rollShop(rng, run).length).toBeGreaterThan(4);
    expect(applyOffer(run, { kind: 'omen', id: 'omen_pair', hand: 'pair' }).ok).toBe(true);
  });
});
