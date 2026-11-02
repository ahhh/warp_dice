/** Combat command entry point: wires hooks and routes CombatCmd. */
import type { GameState } from '../engine/types.ts';
import { hooks, makeCtx, endOfTurn, current, syncHeroes, type Ctx } from './core.ts';
import { heroTurnStart, doReroll, doAct, doTalent, doToken, endHeroTurn, setEndOfTurnHook, turnExhausted, type CombatCmd, type CmdResult } from './hero.ts';
import { enemyTurn } from './ai.ts';
import { afterCombat } from '../dungeon/explore.ts';

hooks.heroTurnStart = heroTurnStart;
hooks.enemyTurn = enemyTurn;
setEndOfTurnHook(endOfTurn);

export function combatDispatch(g: GameState, cmd: CombatCmd): CmdResult {
  const exp = g.expedition;
  if (!exp?.combat || exp.combat.status !== 'active') return { ok: false, error: 'No active combat' };
  const ctx: Ctx = makeCtx(g);
  ctx.combat.fx = [];
  const actor = current(ctx);
  if (!actor || actor.side !== 'hero' || !ctx.combat.turn) return { ok: false, error: 'Not your turn' };
  let r: CmdResult;
  switch (cmd.type) {
    case 'reroll': r = doReroll(ctx, cmd.dice); break;
    case 'act': {
      r = doAct(ctx, cmd);
      if (r.ok && ctx.combat.status === 'active' && ctx.combat.turn && turnExhausted(ctx)) endHeroTurn(ctx);
      break;
    }
    case 'talent': r = doTalent(ctx, cmd); break;
    case 'token': r = doToken(ctx, cmd); break;
    case 'rank': r = doAct(ctx, { type: 'act', key: 'rank', targets: [], dice: [] }); break;
    case 'endTurn': endHeroTurn(ctx); r = { ok: true }; break;
  }
  if (ctx.combat.status === 'active' && ctx.combat.turn) {
    const a = ctx.combat.combatants[ctx.combat.turn.actorId];
    if (a.downed || a.dead) endHeroTurn(ctx);
  }
  syncHeroes(ctx);
  if (ctx.combat.status !== 'active') afterCombat(g);
  return r;
}

export { makeCtx };
export type { CombatCmd, CmdResult };
