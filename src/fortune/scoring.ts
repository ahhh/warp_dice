/**
 * The Fortune scoring pipeline:  (base + chips) × mult
 *
 *   1. hand type from played dice   → hand chips & mult (levelled by Omens)
 *   2. each scoring die, left→right → pips, material, face mod, per-die charms
 *   3. each charm, left→right       → hand-level effects
 *
 * Every increment is recorded as a ScoreStep so the UI can animate the count
 * the way a Balatro hand ticks up.
 */
import type { CurseId } from './curses.ts';
import type { FortuneRun, HandType, Material, ScoreReport, ScoreStep, TrayDie } from '../engine/types.ts';
import type { Rng } from '../engine/rng.ts';
import { evaluateHand, handBase, handLevel, HAND_BY_ID, type EvalDie } from './hands.ts';
import { charmPassives, effectiveCharms, CHARM_BY_ID, type PlayedDie, type ScoreCtx, type Effect } from './charms.ts';
import { CURSES } from './curses.ts';

export interface ScoreInput {
  run: FortuneRun;
  trayIndices: number[];
  actor: ScoreCtx['actor'];
  action: ScoreCtx['action'];
  base: number;
  baseLabel: string;
  rng: Rng;
  firstHand: boolean;
  marked: boolean;
  enemiesAlive: number;
  curse?: CurseId;
  /** Preview mode: no side effects, no random charms resolved. */
  preview?: boolean;
  /** Extra per-die effects (biome rules). */
  extraDie?: (d: PlayedDie) => Effect | null;
  /** Extra hand effects (class talents, metamagic, smite). */
  extraHand?: (hand: HandType) => { label: string; effect: Effect }[];
}

export interface ScoreOutput extends ScoreReport {
  shattered: string[];
}

export function trayFace(run: FortuneRun, td: TrayDie) {
  const die = run.bag.find((d) => d.uid === td.dieUid);
  if (!die) return { v: 0, material: 'iron' as Material, mod: undefined };
  const f = die.faces[td.face] ?? die.faces[0];
  return { v: f.v, material: die.material, mod: f.mod };
}

export function playedDice(run: FortuneRun, trayIndices: number[]): PlayedDie[] {
  return trayIndices
    .slice()
    .sort((a, b) => a - b)
    .map((ti) => {
      const td = run.tray[ti];
      const f = trayFace(run, td);
      return { value: f.v, material: f.material, mod: f.mod, trayIndex: ti };
    });
}

export function evalPlayed(run: FortuneRun, played: PlayedDie[], curse?: CurseId) {
  const rules = charmPassives(run).rules;
  const debuffed = played.map((d) => isDebuffed(d, curse));
  const evalDice: EvalDie[] = played.map((d, i) => ({
    value: debuffed[i] ? 0 : d.value,
    wild: d.mod === 'wild' && !debuffed[i],
    material: debuffed[i] ? ('iron' as Material) : d.material,
  }));
  // Debuffed dice cannot help form a hand — give them unique impossible values.
  evalDice.forEach((d, i) => { if (debuffed[i]) { d.value = -10 - i; d.material = 'loaded'; } });
  const res = evaluateHand(evalDice, rules);
  res.scoring = res.scoring.filter((i) => !debuffed[i]);
  return { res, debuffed };
}

export function isDebuffed(d: PlayedDie, curse?: CurseId): boolean {
  if (!curse) return false;
  const c = CURSES[curse];
  return c.debuff ? c.debuff(d) : false;
}

export function scoreHand(inp: ScoreInput): ScoreOutput {
  const { run } = inp;
  const played = playedDice(run, inp.trayIndices);
  const { res } = evalPlayed(run, played, inp.curse);
  // Wild faces adopt their assigned values for scoring.
  played.forEach((d, i) => { if (d.mod === 'wild' && res.values[i] > 0) d.value = res.values[i]; });

  const hand: HandType = res.hand;
  const steps: ScoreStep[] = [];
  const omens = inp.curse && CURSES[inp.curse].ignoreOmens ? {} : run.omens;
  const hb = handBase(omens, hand);
  let chips = inp.base;
  let mult = hb.mult;
  let doubloons = 0;
  const shattered: string[] = [];

  steps.push({ label: inp.baseLabel, chips: inp.base });
  chips += hb.chips;
  steps.push({ label: `${HAND_BY_ID[hand].name} Lv.${handLevel(omens, hand)}`, chips: hb.chips, mult: hb.mult });

  const ctx: ScoreCtx = {
    run, hand, played, scoring: res.scoring, actor: inp.actor, action: inp.action,
    rerollsLeft: run.rerollsLeft, firstHand: inp.firstHand, rng: inp.rng, marked: inp.marked,
    enemiesAlive: inp.enemiesAlive,
  };
  const charms = effectiveCharms(run);

  const apply = (e: Effect, label: string, extra: Partial<ScoreStep> = {}) => {
    if (e.chips) chips += e.chips;
    if (e.mult) mult += e.mult;
    if (e.xmult) mult *= e.xmult;
    if (e.doubloons) doubloons += e.doubloons;
    if (e.chips || e.mult || e.xmult || e.doubloons) {
      steps.push({ label: e.note ?? label, chips: e.chips, mult: e.mult, xmult: e.xmult, doubloons: e.doubloons, ...extra });
    }
  };

  const scoreDie = (d: PlayedDie, allowRetrigger: boolean) => {
    const di = d.trayIndex;
    if (d.mod === 'cursed') {
      apply({ mult: -1 }, 'Cursed face', { dieIndex: di });
      return;
    }
    apply({ chips: d.value }, `${d.value}`, { dieIndex: di });
    // Material.
    if (d.material === inp.actor.affinity || d.material === 'xenos') apply({ mult: 1 }, 'Affinity', { dieIndex: di });
    if (d.material === 'cryo') apply({ chips: 8 }, 'Cryo', { dieIndex: di });
    if (d.material === 'throne') apply({ doubloons: 1 }, 'Throne', { dieIndex: di });
    if (d.material === 'crystal') {
      apply({ xmult: 2 }, 'Blackstone', { dieIndex: di });
      if (!inp.preview && inp.rng.chance(0.25)) {
        const td = run.tray[di];
        if (td && !shattered.includes(td.dieUid)) shattered.push(td.dieUid);
      }
    }
    // Face mods.
    switch (d.mod) {
      case 'gilded': apply({ doubloons: 1 }, 'Gilded', { dieIndex: di }); break;
      case 'keen': apply({ chips: 6 }, 'Keen', { dieIndex: di }); break;
      case 'fierce': apply({ mult: 2 }, 'Fierce', { dieIndex: di }); break;
      case 'savage': apply({ xmult: 1.5 }, 'Savage', { dieIndex: di }); break;
      case 'blessed':
        if (!inp.preview && inp.rng.chance(1 / 3)) apply({ mult: 6 }, 'Blessed!', { dieIndex: di });
        break;
    }
    let retrigger = false;
    for (const { inst, def } of charms) {
      if (!def.onDie) continue;
      if (inp.preview && def.id === 'fortuneWheel') continue;
      const e = def.onDie(ctx, d, inst);
      if (!e) continue;
      if (e.retrigger) retrigger = true;
      apply(e, def.name, { dieIndex: di, charm: def.id });
    }
    if (inp.extraDie) {
      const e = inp.extraDie(d);
      if (e) apply(e, e.note ?? 'Biome', { dieIndex: di });
    }
    if (retrigger && allowRetrigger) {
      steps.push({ label: 'Again!', dieIndex: di });
      scoreDie(d, false);
    }
  };

  for (const si of res.scoring.slice().sort((a, b) => played[a].trayIndex - played[b].trayIndex)) {
    scoreDie(played[si], true);
  }

  for (const { inst, def } of charms) {
    if (!def.onHand) continue;
    if (inp.preview && def.id === 'fortuneWheel') continue;
    const e = def.onHand(ctx, inst);
    if (e) apply(e, def.name, { charm: def.id });
  }

  if (inp.extraHand) {
    for (const x of inp.extraHand(hand)) apply(x.effect, x.label);
  }

  if (inp.curse) {
    const c = CURSES[inp.curse];
    if (c.multFactor && c.multFactor !== 1) {
      mult *= c.multFactor;
      steps.push({ label: c.name, xmult: c.multFactor });
    }
    if (c.repeatPenalty && run.lastHand === hand) {
      mult *= 0.5;
      steps.push({ label: c.name, xmult: 0.5 });
    }
  }

  mult = Math.max(1, Math.round(mult * 100) / 100);
  chips = Math.max(0, chips);
  const total = Math.floor(chips * mult);

  if (!inp.preview) {
    for (const inst of run.charms) {
      const def = CHARM_BY_ID[inst.id];
      def?.onPlayed?.(ctx, inst);
    }
  }

  // Scored 10s call down the Emperor's wrath: each is a Righteous Fury on the action.
  const fury = res.scoring.filter((i) => played[i].value === 10 && played[i].mod !== 'cursed').length;
  return {
    hand, handLevel: handLevel(omens, hand), scoringDice: res.scoring.map((i) => played[i].trayIndex),
    chips, mult, base: inp.base, total, steps, doubloons, shattered, fury,
  };
}

/** Cheap preview for the tray UI: hand name + chips × mult before charms that roll. */
export function previewHand(inp: Omit<ScoreInput, 'preview'>): ScoreOutput {
  return scoreHand({ ...inp, preview: true });
}
