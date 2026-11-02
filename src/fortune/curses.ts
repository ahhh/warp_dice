/**
 * Curses: boss and elite rules that bend the Fortune Tray for one fight —
 * this game's answer to boss blinds. Shown up front so players can adapt.
 */
import type { PlayedDie } from './charms.ts';

export type CurseId =
  | 'ashen' | 'molten' | 'thorns' | 'barren' | 'tide' | 'oddDrown' | 'evenMirror'
  | 'void' | 'gravity' | 'hunger' | 'silence' | 'judgement' | 'chromatic';

export interface CurseDef {
  id: CurseId;
  name: string;
  text: string;
  debuff?: (d: PlayedDie) => boolean;
  multFactor?: number;
  rerollDelta?: number;
  handSizeDelta?: number;
  ignoreOmens?: boolean;
  rerollHpCost?: number;
  repeatPenalty?: boolean;
}

export const CURSES: Record<CurseId, CurseDef> = {
  ashen: { id: 'ashen', name: 'Dead Signal', text: 'Dice showing 1, 2 or 3 are debuffed (score nothing).', debuff: (d) => d.value <= 3 },
  molten: { id: 'molten', name: 'Machine Heresy', text: 'Cog and Adamant dice are debuffed.', debuff: (d) => d.material === 'cog' || d.material === 'adamant' },
  thorns: { id: 'thorns', name: 'Bleeding Hull', text: 'Each reroll costs the acting explorer 4% of max Wounds.', rerollHpCost: 0.04 },
  barren: { id: 'barren', name: 'Rusted Iron', text: 'Iron dice are debuffed.', debuff: (d) => d.material === 'iron' },
  tide: { id: 'tide', name: 'Gellar Failure', text: 'All Mult is halved.', multFactor: 0.5 },
  oddDrown: { id: 'oddDrown', name: 'Odd Tithe', text: 'Odd dice are debuffed.', debuff: (d) => d.value % 2 === 1 },
  evenMirror: { id: 'evenMirror', name: 'Even Tithe', text: 'Even dice are debuffed.', debuff: (d) => d.value % 2 === 0 },
  void: { id: 'void', name: 'Null Field', text: 'Omens are ignored: every hand scores at Lv.1.', ignoreOmens: true },
  gravity: { id: 'gravity', name: 'Crushing Gravity', text: 'Dice showing 8 or more are debuffed.', debuff: (d) => d.value >= 8 },
  hunger: { id: 'hunger', name: 'Starved Augurs', text: 'Tray size -2.', handSizeDelta: -2 },
  silence: { id: 'silence', name: 'Vox Silence', text: '-1 reroll every turn.', rerollDelta: -1 },
  chromatic: { id: 'chromatic', name: 'Blackstone Dominion', text: 'Warp, Eye, Creed, Ledger and Void dice are debuffed, and Mult is ×0.75.', debuff: (d) => ['warp', 'eye', 'creed', 'ledger', 'void'].includes(d.material), multFactor: 0.75 },
  judgement: { id: 'judgement', name: 'Inquisition', text: 'Playing the same hand type twice in a row scores ×0.5.', repeatPenalty: true },
};
