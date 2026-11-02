import { describe, it, expect } from 'vitest';
import { newGame, quickDynasty } from '../src/meta/town.ts';
import { dispatch } from '../src/app/commands.ts';
import { autoCombatStep, autoExploreStep } from '../src/app/autoplay.ts';
import { fullRestore } from '../src/rules/character.ts';
import { autoSpend } from '../src/rules/advance.ts';
import { START_XP, XP_PER_LEVEL } from '../src/content/careers.ts';
import { makeCtx, current } from '../src/combat/core.ts';
import { listActions, legalTargets } from '../src/combat/hero.ts';
import type { CareerId, GameState } from '../src/engine/types.ts';

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }
const ids = (g: GameState) => g.roster.filter((h) => h.status === 'alive').map((h) => h.id);

/** Where the action economy stands for whoever is acting. */
function turnState(g: GameState) {
  const exp = g.expedition;
  if (!exp?.combat || exp.combat.status !== 'active' || !exp.combat.turn) return null;
  const c = exp.combat.combatants[exp.combat.turn.actorId];
  return { id: c.id, stamp: `${exp.combat.round}:${exp.combat.turnIndex}`, half: c.used.half };
}

/**
 * At the start of an explorer's turn, try every usable Full and Half Action on a
 * copy of the game. A Full Action must end the turn; a Half Action must leave
 * exactly one Half Action (Quick Draw's free first attack is the one exception).
 */
function sweepTurn(g: GameState, seen: { full: Set<string>; half: Set<string> }) {
  const ctx = makeCtx(g);
  const c = current(ctx)!;
  const opts = listActions(ctx).filter((o) => o.usable && o.cost !== 'free');
  const before = turnState(g)!;
  expect(before.half).toBe(2);
  for (const o of opts) {
    const copy = clone(g);
    const cctx = makeCtx(copy);
    const targets = legalTargets(cctx, o.target, !!o.melee).slice(0, 1).map((x) => x.id);
    const r = dispatch(copy, { type: 'combat', cmd: { type: 'act', key: o.key, targets, dice: [], slot: o.slots ? 2 : undefined } });
    if (!r.ok) continue;
    const after = turnState(copy);
    const sameTurn = !!after && after.id === c.id && after.stamp === before.stamp;
    const what = `${c.name} ${o.cost} "${o.name}"`;
    const quickDraw = g.roster.find((h) => h.id === c.id)!.talents.includes('quickDraw') && !ctx.combat.once[`${c.id}:quickDraw`];
    if (o.cost === 'full') {
      seen.full.add(o.key.split(':')[0] === 'feat' || o.key.startsWith('power') ? o.key : o.name.split(' (')[0].split(' —')[0]);
      expect(sameTurn ? after!.half : 0, `${what} should end the turn`).toBe(0);
    } else {
      seen.half.add(o.key);
      if (copy.expedition?.combat?.status !== 'active' || !sameTurn) continue; // the fight ended or the actor fell
      const freeAttack = quickDraw && ['std', 'semi', 'full', 'called', 'allOut', 'charge', 'multi'].includes(o.key); // weapon attacks only
      expect(after!.half, `${what} should leave ${freeAttack ? 'two' : 'one'} Half Action`).toBe(freeAttack ? 2 : 1);
    }
  }
}

describe('action economy', () => {
  it('every Full Action ends the turn and every Half Action leaves exactly one more', () => {
    // quickDynasty adds the Rogue Trader captain to each retinue.
    const comps: CareerId[][] = [
      ['archMilitant', 'missionary', 'voidMaster'],
      ['astropath', 'explorator', 'seneschal'],
      ['navigator', 'archMilitant', 'explorator'],
    ];
    const seen = { full: new Set<string>(), half: new Set<string>() };
    for (const lvl of [1, 10, 20]) comps.forEach((comp, i) => {
      const g = newGame(1, 'legacy', `ACT-${lvl}-${i}`);
      quickDynasty(g, comp);
      g.profile.unlockedBiomes = ['docks', 'gardens', 'reliquary', 'labyrinth', 'core'];
      for (const h of g.roster) {
        h.xp = START_XP + (lvl - 1) * XP_PER_LEVEL; autoSpend(h); fullRestore(h);
        // Quick Draw is the talent that used to leak a Half Action after a Full one.
        if (!h.talents.includes('quickDraw')) h.talents.push('quickDraw');
      }
      expect(dispatch(g, { type: 'startExpedition', partyIds: ids(g).slice(0, 4), biome: 'docks', difficulty: 'standard', seed: `ACT-${lvl}-${i}` }).ok).toBe(true);
      let turns = 0;
      let guard = 0;
      let last = '';
      while (g.expedition && turns < 24 && guard++ < 600) {
        const t = turnState(g);
        if (t && `${t.id}@${t.stamp}` !== last) {
          last = `${t.id}@${t.stamp}`;
          sweepTurn(g, seen);
          turns++;
        }
        if (g.expedition?.combat?.status === 'active') { if (!autoCombatStep(g)) break; }
        else autoExploreStep(g);
      }
    });
    // Make sure the sweep actually exercised a broad set of actions.
    expect(seen.full.size).toBeGreaterThan(5);
    expect(seen.half.size).toBeGreaterThan(5);
  }, 120000);

  it('Quick Draw makes a Half Action attack free, once per combat', () => {
    const g = newGame(1, 'legacy', 'QD');
    quickDynasty(g, ['archMilitant', 'missionary', 'voidMaster']);
    for (const h of g.roster) if (!h.talents.includes('quickDraw')) h.talents.push('quickDraw');
    dispatch(g, { type: 'startExpedition', partyIds: ids(g), biome: 'docks', difficulty: 'standard', seed: 'QD-1' });
    let guard = 0;
    while (g.expedition && !(g.expedition.combat?.status === 'active' && turnState(g)) && guard++ < 300) autoExploreStep(g);
    const ctx = makeCtx(g);
    const std = listActions(ctx).find((o) => o.key === 'std' && o.usable)!;
    expect(std).toBeTruthy();
    const target = legalTargets(ctx, 'enemy', !!std.melee)[0].id;
    const before = turnState(g)!;
    dispatch(g, { type: 'combat', cmd: { type: 'act', key: 'std', targets: [target], dice: [] } });
    const mid = turnState(g);
    if (g.expedition?.combat?.status === 'active' && mid?.id === before.id) {
      expect(mid.half).toBe(2);
      dispatch(g, { type: 'combat', cmd: { type: 'act', key: 'std', targets: [legalTargets(makeCtx(g), 'enemy', !!std.melee)[0]?.id ?? target], dice: [] } });
      const end = turnState(g);
      if (end?.id === before.id && end.stamp === before.stamp) expect(end.half).toBe(1);
    }
  });
});

describe('boss rewards', () => {
  it('the region\'s lord offers loot, not boons that would vanish on the way home', () => {
    const g = newGame(1, 'legacy', 'BOSS');
    quickDynasty(g);
    for (const h of g.roster) { h.xp = START_XP + 9 * XP_PER_LEVEL; autoSpend(h); fullRestore(h); }
    dispatch(g, { type: 'startExpedition', partyIds: ids(g).slice(0, 4), biome: 'docks', difficulty: 'standard', seed: 'BOSS-1' });
    let guard = 0;
    while (g.expedition && !g.expedition.bossDefeated && guard++ < 4000) {
      if (g.expedition.combat?.status === 'active') { if (!autoCombatStep(g)) break; }
      else autoExploreStep(g);
    }
    expect(g.expedition?.bossDefeated).toBe(true);
    expect(g.expedition!.spoils?.kind).toBe('boss');
    expect(g.expedition!.boons).toBeUndefined();
    expect(g.expedition!.lootChoice?.items.length).toBeGreaterThan(0);
  });
});
