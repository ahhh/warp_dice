/**
 * Every state change goes through dispatch(state, cmd). The UI, the keyboard,
 * tests and the simulator all speak this language.
 */
import type { ZoneId, Difficulty, EquipSlot, GameState, RelDir } from '../engine/types.ts';
import { combatDispatch, type CombatCmd } from '../combat/index.ts';
import * as X from '../dungeon/explore.ts';
import * as T from '../meta/town.ts';

export type GameCmd =
  | { type: 'combat'; cmd: CombatCmd }
  | { type: 'move'; dir: RelDir }
  | { type: 'search' }
  | { type: 'eventChoice'; idx: number; useHelper?: boolean }
  | { type: 'eventClose' }
  | { type: 'eventOpen' }
  | { type: 'sacrifice'; dieUid: string }
  | { type: 'takeLoot' }
  | { type: 'closeSpoils' }
  | { type: 'pickBoon'; idx: number; dieUid?: string; face?: number; replaceCharm?: number }
  | { type: 'skipBoon' }
  | { type: 'pickLoot'; idx: number }
  | { type: 'shopBuy'; idx: number; dieUid?: string; face?: number; replaceCharm?: number }
  | { type: 'shopReroll' }
  | { type: 'shopClose' }
  | { type: 'shopOpen' }
  | { type: 'sellCharm'; idx: number }
  | { type: 'moveCharm'; from: number; to: number }
  | { type: 'rest'; kind: 'short' | 'long' }
  | { type: 'useItem'; uid: string; heroId: string }
  | { type: 'usePower'; heroId: string; powerId: string }
  | { type: 'retreat' }
  | { type: 'exitDungeon' }
  | { type: 'startExpedition'; partyIds: string[]; biome: ZoneId; difficulty: Difficulty; seed: string; size?: 'short' | 'normal' | 'long'; tutorial?: boolean; finale?: boolean }
  | { type: 'foundDynasty'; dynastyName?: string; shipName?: string; captain: T.CreateSpec; retinue: T.CreateSpec[] }
  | { type: 'hire'; idx: number }
  | { type: 'rerollRecruits' }
  | { type: 'retire'; heroId: string }
  | { type: 'acquire'; uid: string }
  | { type: 'sell'; uid: string }
  | { type: 'present'; uid: string }
  | { type: 'equip'; heroId: string; uid: string; slot: EquipSlot }
  | { type: 'unequip'; heroId: string; slot: EquipSlot }
  | { type: 'enchant'; uid: string }
  | { type: 'fitMod'; uid: string; modId: string }
  | { type: 'upgrade'; id: string }
  | { type: 'train'; heroId: string }
  | { type: 'treat'; heroId: string }
  | { type: 'advance'; heroId: string; advId: string; boon?: boolean }
  | { type: 'autoAdvance'; heroId: string }
  | { type: 'ackResult' };

export interface DispatchResult { ok: boolean; error?: string; score?: import('../engine/types.ts').ScoreReport }

const DUNGEON_CMDS = new Set(['combat', 'move', 'search', 'eventChoice', 'eventClose', 'eventOpen', 'sacrifice', 'takeLoot', 'closeSpoils', 'pickBoon', 'skipBoon', 'pickLoot', 'shopBuy', 'shopReroll', 'shopClose', 'shopOpen', 'sellCharm', 'moveCharm', 'rest', 'useItem', 'usePower', 'retreat', 'exitDungeon']);
const TOWN_CMDS = new Set(['hire', 'rerollRecruits', 'retire', 'acquire', 'sell', 'present', 'equip', 'unequip', 'enchant', 'fitMod', 'upgrade', 'train', 'treat', 'advance', 'autoAdvance']);

/** Never throws: a bug in one command must not take down the session. */
export function dispatch(g: GameState, cmd: GameCmd): DispatchResult {
  if (DUNGEON_CMDS.has(cmd.type) && !g.expedition) return { ok: false, error: 'You are not in the Fortress.' };
  if (TOWN_CMDS.has(cmd.type) && g.expedition) return { ok: false, error: 'That can only be done in the enclave.' };
  if (TOWN_CMDS.has(cmd.type) && g.phase !== 'play') return { ok: false, error: 'The Dynasty is not ready.' };
  try {
    return dispatchInner(g, cmd);
  } catch (e) {
    console.error('dispatch failed', cmd, e);
    return { ok: false, error: `Something went wrong (${(e as Error).message}). Your last save is intact.` };
  }
}

function dispatchInner(g: GameState, cmd: GameCmd): DispatchResult {
  const err = (e: string | null | undefined): DispatchResult => (e ? { ok: false, error: e } : { ok: true });
  switch (cmd.type) {
    case 'combat': {
      const r = combatDispatch(g, cmd.cmd);
      return { ok: r.ok, error: r.error, score: r.score };
    }
    case 'move': return err(X.move(g, cmd.dir));
    case 'search': return err(X.search(g));
    case 'eventChoice': return err(X.chooseEvent(g, cmd.idx, cmd.useHelper));
    case 'eventClose': X.closeEvent(g); return { ok: true };
    case 'eventOpen': return err(X.reopenEvent(g));
    case 'sacrifice': return err(X.sacrificeDie(g, cmd.dieUid));
    case 'takeLoot': return err(X.takeLoot(g));
    case 'closeSpoils': X.closeSpoils(g); return { ok: true };
    case 'pickBoon': return err(X.pickBoon(g, cmd.idx, { dieUid: cmd.dieUid, face: cmd.face, replaceCharm: cmd.replaceCharm }));
    case 'skipBoon': return err(X.skipBoon(g));
    case 'pickLoot': return err(X.pickLoot(g, cmd.idx));
    case 'shopBuy': return err(X.shopBuy(g, cmd.idx, { dieUid: cmd.dieUid, face: cmd.face, replaceCharm: cmd.replaceCharm }));
    case 'shopReroll': return err(X.shopReroll(g));
    case 'shopClose': if (g.expedition) g.expedition.shop = undefined; return { ok: true };
    case 'shopOpen': {
      const exp = g.expedition;
      const s = exp?.shops?.[exp.pos];
      if (!exp || !s) return { ok: false, error: 'No trader here.' };
      exp.shop = s;
      return { ok: true };
    }
    case 'sellCharm': return err(X.sellCharm(g, cmd.idx));
    case 'moveCharm': return err(X.moveCharm(g, cmd.from, cmd.to));
    case 'rest': return err(X.rest(g, cmd.kind));
    case 'useItem': return err(X.useItemExplore(g, cmd.uid, cmd.heroId));
    case 'usePower': return err(X.usePowerExplore(g, cmd.heroId, cmd.powerId));
    case 'retreat': return err(X.retreat(g));
    case 'exitDungeon': return err(X.exitDungeon(g));
    case 'startExpedition':
      if (g.expedition) return { ok: false, error: 'Already in the Fortress.' };
      return err(X.startExpedition(g, cmd));
    case 'foundDynasty': return err(T.foundDynasty(g, cmd));
    case 'hire': return err(T.hire(g, cmd.idx));
    case 'rerollRecruits': return err(T.rerollRecruits(g));
    case 'retire': return err(T.retire(g, cmd.heroId));
    case 'acquire': return err(T.acquire(g, cmd.uid));
    case 'sell': return err(T.sell(g, cmd.uid));
    case 'present': return err(T.presentValuable(g, cmd.uid));
    case 'equip': return err(T.equip(g, cmd.heroId, cmd.uid, cmd.slot));
    case 'unequip': return err(T.unequip(g, cmd.heroId, cmd.slot));
    case 'enchant': return err(T.enchant(g, cmd.uid));
    case 'fitMod': return err(T.fitMod(g, cmd.uid, cmd.modId));
    case 'upgrade': return err(T.upgradeFacility(g, cmd.id));
    case 'train': return err(T.train(g, cmd.heroId));
    case 'treat': return err(T.treatInsanity(g, cmd.heroId));
    case 'advance': return err(T.advance(g, cmd.heroId, cmd.advId, cmd.boon));
    case 'autoAdvance': return err(T.autoAdvance(g, cmd.heroId));
    case 'ackResult':
      g.lastResult = undefined;
      if (g.phase === 'play') { T.refreshRecruits(g); T.refreshMarket(g); }
      return { ok: true };
  }
}
