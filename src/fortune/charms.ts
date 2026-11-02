/**
 * Relics: run-only curios pried from the Fortress that bend the Fortune
 * scoring pipeline (the Jokers of this game). Internally still "charms". Order matters — charms resolve left to right — and
 * the player can rearrange them.
 */
import type { CharmInstance, FortuneRun, HandType, Material } from '../engine/types.ts';
import type { Rng } from '../engine/rng.ts';
import { handContains, type EvalRules } from './hands.ts';

export type CharmRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface PlayedDie {
  value: number;
  material: Material;
  mod?: string;
  trayIndex: number;
}

export interface ScoreCtx {
  run: FortuneRun;
  hand: HandType;
  /** All dice the player committed. */
  played: PlayedDie[];
  /** Indices into `played` that score. */
  scoring: number[];
  actor: { careerId: string; level: number; hpFrac: number; affinity: Material };
  action: 'attack' | 'spell' | 'heal' | 'guard';
  rerollsLeft: number;
  firstHand: boolean;
  rng: Rng;
  marked: boolean;
  enemiesAlive: number;
}

export interface Effect {
  chips?: number;
  mult?: number;
  xmult?: number;
  doubloons?: number;
  /** Retrigger this die once more (onDie only). */
  retrigger?: boolean;
  note?: string;
}

export interface CharmDef {
  id: string;
  name: string;
  rarity: CharmRarity;
  /** Use {n} for the live counter. */
  text: string;
  theme: 'mult' | 'chips' | 'xmult' | 'economy' | 'dice' | 'utility';
  passive?: {
    handSize?: number;
    rerolls?: number;
    interestCap?: number;
    critRange?: number;
    rules?: EvalRules;
    healMult?: number;
    guardMult?: number;
    hitBonus?: number;
    charmSlots?: number;
  };
  onDie?: (ctx: ScoreCtx, die: PlayedDie, self: CharmInstance) => Effect | null;
  onHand?: (ctx: ScoreCtx, self: CharmInstance) => Effect | null;
  onPlayed?: (ctx: ScoreCtx, self: CharmInstance) => void;
  onKill?: (self: CharmInstance, run: FortuneRun) => void;
  onCombatEnd?: (self: CharmInstance, run: FortuneRun) => number | void;
  onReroll?: (self: CharmInstance, run: FortuneRun) => void;
  /** Number shown on the charm (for scaling charms). */
  showCounter?: boolean;
  startCounter?: number;
}

export const CHARM_PRICE: Record<CharmRarity, number> = { common: 4, uncommon: 6, rare: 8, legendary: 12 };

const contains = (ctx: ScoreCtx, h: HandType) => handContains(ctx.hand, h);
const scored = (ctx: ScoreCtx) => ctx.scoring.map((i) => ctx.played[i]);

export const CHARMS: CharmDef[] = [
  // ── common: flat mult / chips ────────────────────────────────────────────
  { id: 'copperTooth', name: 'Ork Tooth', rarity: 'common', theme: 'mult', text: '+4 Mult.',
    onHand: () => ({ mult: 4 }) },
  { id: 'twinFang', name: 'Twin-Headed Aquila', rarity: 'common', theme: 'mult', text: '+6 Mult if the hand contains a Pair.',
    onHand: (c) => (contains(c, 'pair') ? { mult: 6 } : null) },
  { id: 'tripleCrown', name: 'Trinity Seal', rarity: 'common', theme: 'mult', text: '+10 Mult if the hand contains Three of a Kind.',
    onHand: (c) => (contains(c, 'three') ? { mult: 10 } : null) },
  { id: 'ladderOfBones', name: 'Cogitator Abacus', rarity: 'common', theme: 'mult', text: '+10 Mult if the hand contains a Straight.',
    onHand: (c) => (contains(c, 'straight') ? { mult: 10 } : null) },
  { id: 'guildmark', name: 'House Banner', rarity: 'common', theme: 'mult', text: '+8 Mult if the hand contains Colours.',
    onHand: (c) => (contains(c, 'set') ? { mult: 8 } : null) },
  { id: 'pebblePouch', name: 'Spent Casings', rarity: 'common', theme: 'chips', text: '+20 Chips if the hand contains Two Pair.',
    onHand: (c) => (contains(c, 'twoPair') ? { chips: 20 } : null) },
  { id: 'oddFellow', name: 'Heretical Coin', rarity: 'common', theme: 'mult', text: 'Scored odd dice give +2 Mult.',
    onDie: (_c, d) => (d.value % 2 === 1 ? { mult: 2 } : null) },
  { id: 'evenKeel', name: 'Balanced Gyroscope', rarity: 'common', theme: 'chips', text: 'Scored even dice give +5 Chips.',
    onDie: (_c, d) => (d.value % 2 === 0 ? { chips: 5 } : null) },
  { id: 'snakeEyes', name: 'Purity Seal of Ones', rarity: 'common', theme: 'mult', text: 'Scored 1s give +6 Mult.',
    onDie: (_c, d) => (d.value === 1 ? { mult: 6 } : null) },
  { id: 'hexSpur', name: 'Decimal Cog', rarity: 'common', theme: 'chips', text: 'Scored 10s give +8 Chips and +1 Mult.',
    onDie: (_c, d) => (d.value === 10 ? { chips: 8, mult: 1 } : null) },
  { id: 'whetstone', name: 'Mono-Edge Hone', rarity: 'common', theme: 'chips', text: '+25 Chips if 3 or fewer dice are played.',
    onHand: (c) => (c.played.length <= 3 ? { chips: 25 } : null) },
  { id: 'gamblersGrin', name: "Underdeck Dice-Cup", rarity: 'common', theme: 'mult', text: '+3 Mult per unused reroll.',
    onHand: (c) => (c.rerollsLeft > 0 ? { mult: 3 * c.rerollsLeft } : null) },
  { id: 'lastLaugh', name: 'Last Rites Scroll', rarity: 'common', theme: 'mult', text: '+12 Mult if the acting explorer is below half Wounds.',
    onHand: (c) => (c.actor.hpFrac < 0.5 ? { mult: 12 } : null) },
  { id: 'rustedKey', name: 'Salvage Hook', rarity: 'common', theme: 'economy', text: 'Earn 2 scrip after each combat.',
    onCombatEnd: () => 2 },
  { id: 'kinship', name: 'Dynasty Signet', rarity: 'common', theme: 'mult', text: 'Scored dice matching the explorer\'s affinity give +1 extra Mult.',
    onDie: (c, d) => (d.material === c.actor.affinity || d.material === 'xenos' ? { mult: 1 } : null) },
  { id: 'lanternMoth', name: 'Psy-Focus Crystal', rarity: 'common', theme: 'chips', text: '+15 Chips on powers and tech.',
    onHand: (c) => (c.action === 'spell' ? { chips: 15 } : null) },
  { id: 'brawlersKnuckle', name: 'Bayonet Lug', rarity: 'common', theme: 'mult', text: '+5 Mult on weapon attacks.',
    onHand: (c) => (c.action === 'attack' ? { mult: 5 } : null) },

  // ── uncommon: scaling, economy, rules ────────────────────────────────────
  { id: 'bloodstone', name: 'Kill-Marked Blade', rarity: 'uncommon', theme: 'mult', text: 'Gains +1 Mult whenever an enemy dies. (Currently +{n})',
    showCounter: true, onHand: (_c, s) => (s.counter > 0 ? { mult: s.counter } : null), onKill: (s) => { s.counter += 1; } },
  { id: 'dragonLedger', name: 'Purser\'s Ledger', rarity: 'uncommon', theme: 'mult', text: '+1 Mult for every 3 scrip you hold.',
    onHand: (c) => { const m = Math.floor(c.run.doubloons / 3); return m > 0 ? { mult: m } : null; } },
  { id: 'loadedBone', name: 'Emperor\'s Tarot Deck', rarity: 'uncommon', theme: 'dice', text: '+1 reroll every turn.', passive: { rerolls: 1 } },
  { id: 'deepPockets', name: 'Auspex Array', rarity: 'uncommon', theme: 'dice', text: '+1 tray size.', passive: { handSize: 1 } },
  { id: 'crookedLadder', name: 'Crooked Astrolabe', rarity: 'uncommon', theme: 'dice', text: 'Straights and Colours can be made with 4 dice.', passive: { rules: { fourFingers: true } } },
  { id: 'gapTooth', name: 'Warp-Route Chart', rarity: 'uncommon', theme: 'dice', text: 'Straights may skip one number.', passive: { rules: { gapStraight: true } } },
  { id: 'weightedFate', name: 'Red-Dot Reticle', rarity: 'uncommon', theme: 'utility', text: '+10 to all attack Tests.', passive: { hitBonus: 10 } },
  { id: 'hawkMonocle', name: 'Augmetic Eye', rarity: 'uncommon', theme: 'utility', text: 'Righteous Fury on 9s as well as 10s.', passive: { critRange: 1 } },
  { id: 'stoicShield', name: 'Refractor Node', rarity: 'uncommon', theme: 'utility', text: 'Guard grants double Ward.', passive: { guardMult: 2 } },
  { id: 'mendersThread', name: 'Medicae Servo-Skull', rarity: 'uncommon', theme: 'utility', text: 'Healing is 50% stronger.', passive: { healMult: 1.5 } },
  { id: 'luckySeven', name: 'Septenary Litany', rarity: 'uncommon', theme: 'xmult', text: '×3 Mult if scored pips total a multiple of 7.',
    onHand: (c) => { const p = scored(c).reduce((a, d) => a + d.value, 0); return p > 0 && p % 7 === 0 ? { xmult: 3 } : null; } },
  { id: 'snowball', name: 'Ammunition Belt', rarity: 'uncommon', theme: 'chips', text: 'Gains +3 Chips each time a Pair is played. (Currently +{n})',
    showCounter: true, onHand: (_c, s) => (s.counter > 0 ? { chips: s.counter } : null),
    onPlayed: (c, s) => { if (c.hand === 'pair') s.counter += 3; } },
  { id: 'ironPiggy', name: 'Strongbox', rarity: 'uncommon', theme: 'economy', text: 'Interest cap +5.', passive: { interestCap: 5 } },
  { id: 'paritySeal', name: 'Binary Seal', rarity: 'uncommon', theme: 'xmult', text: '×1.5 Mult if all scored dice are odd, or all even.',
    onHand: (c) => { const s = scored(c); if (s.length < 2) return null; const p = s[0].value % 2; return s.every((d) => d.value % 2 === p) ? { xmult: 1.5 } : null; } },
  { id: 'magpie', name: 'Tithe Collector', rarity: 'uncommon', theme: 'economy', text: 'Scored Throne dice give +2 more scrip.',
    onDie: (_c, d) => (d.material === 'throne' ? { doubloons: 2 } : null) },
  { id: 'echoBell', name: 'Vox Echo', rarity: 'uncommon', theme: 'dice', text: 'The first scored die triggers twice.',
    onDie: (c, d) => (c.scoring[0] !== undefined && c.played[c.scoring[0]] === d ? { retrigger: true } : null) },
  { id: 'sixfoldBell', name: 'Cathedral Bell', rarity: 'uncommon', theme: 'dice', text: 'Scored 10s trigger twice.',
    onDie: (_c, d) => (d.value === 10 ? { retrigger: true } : null) },
  { id: 'hourglass', name: 'Chronometron', rarity: 'uncommon', theme: 'xmult', text: '×2 Mult on the first hand of each combat.',
    onHand: (c) => (c.firstHand ? { xmult: 2 } : null) },
  { id: 'quarrymark', name: 'Target Designator', rarity: 'uncommon', theme: 'xmult', text: '×1.5 Mult against a Marked target.',
    onHand: (c) => (c.marked ? { xmult: 1.5 } : null) },
  { id: 'pocketSun', name: 'Ecclesiarch Censer', rarity: 'uncommon', theme: 'mult', text: '+3 Mult per scored Creed or Aquila die.',
    onDie: (_c, d) => (d.material === 'creed' || d.material === 'aquila' ? { mult: 3 } : null) },
  { id: 'nightOwl', name: 'Astropathic Choir-Bead', rarity: 'uncommon', theme: 'mult', text: '+3 Mult per scored Warp or Eye die.',
    onDie: (_c, d) => (d.material === 'warp' || d.material === 'eye' ? { mult: 3 } : null) },
  { id: 'ironRoot', name: 'Mechanicus Cog-Rosary', rarity: 'uncommon', theme: 'mult', text: '+3 Mult per scored Adamant, Cog, Ledger or Void die.',
    onDie: (_c, d) => (['adamant', 'cog', 'ledger', 'void'].includes(d.material) ? { mult: 3 } : null) },
  { id: 'boneDust', name: 'Hull Plating Scrap', rarity: 'uncommon', theme: 'chips', text: 'Scored Iron dice give +10 Chips.',
    onDie: (_c, d) => (d.material === 'iron' ? { chips: 10 } : null) },

  // ── rare: ×mult ─────────────────────────────────────────────────────────
  { id: 'tyrantCrown', name: 'Warlord\'s Trophy Rack', rarity: 'rare', theme: 'xmult', text: '×2 Mult on Four of a Kind or better.',
    onHand: (c) => (contains(c, 'four') || ['straightSet', 'fullSet', 'hoard'].includes(c.hand) ? { xmult: 2 } : null) },
  { id: 'twinSuns', name: 'Binary Star Chart', rarity: 'rare', theme: 'xmult', text: '×2 Mult if the hand contains Two Pair.',
    onHand: (c) => (contains(c, 'twoPair') ? { xmult: 2 } : null) },
  { id: 'glassHeart', name: 'Daemon-Bound Blade', rarity: 'rare', theme: 'xmult', text: '×3 Mult. The acting explorer loses 5% max Wounds per hand.',
    onHand: () => ({ xmult: 3 }) },
  { id: 'ouroboros', name: 'Eldar Spirit Stone', rarity: 'rare', theme: 'xmult', text: 'Gains ×0.1 Mult per hand played this run. (Currently ×{n})',
    showCounter: true, startCounter: 1, onHand: (_c, s) => (s.counter > 1 ? { xmult: s.counter } : null),
    onPlayed: (_c, s) => { s.counter = Math.round((s.counter + 0.1) * 10) / 10; } },
  { id: 'fortuneWheel', name: "Emperor's Tarot: The Wheel", rarity: 'rare', theme: 'xmult', text: '1 in 3 chance for ×3 Mult.',
    onHand: (c) => (c.rng.chance(1 / 3) ? { xmult: 3, note: 'The wheel lands!' } : null) },
  { id: 'paupersCrown', name: 'Disgraced Warrant', rarity: 'rare', theme: 'xmult', text: '×2.5 Mult while you hold fewer than 5 scrip.',
    onHand: (c) => (c.run.doubloons < 5 ? { xmult: 2.5 } : null) },
  { id: 'monolith', name: 'Blackstone Monolith', rarity: 'rare', theme: 'dice', text: 'A single played die scores as Three of a Kind.', passive: { rules: { monolith: true } } },
  { id: 'prismLens', name: 'Xenos Prism', rarity: 'rare', theme: 'dice', text: 'Every die counts as every material.', passive: { rules: { allPrism: true } } },
  { id: 'mimicTongue', name: 'Stryxis Mimic-Box', rarity: 'rare', theme: 'utility', text: 'Copies the charm to its right.' },
  { id: 'avalanche', name: 'Unbroken Banner', rarity: 'rare', theme: 'xmult', text: 'Gains ×0.25 Mult each combat won without an explorer falling. Resets if one falls. (Currently ×{n})',
    showCounter: true, startCounter: 1, onHand: (_c, s) => (s.counter > 1 ? { xmult: s.counter } : null) },
  { id: 'warDrum', name: 'Ork War-Drum', rarity: 'rare', theme: 'xmult', text: '×1 Mult per enemy still standing (min ×1).',
    onHand: (c) => (c.enemiesAlive > 1 ? { xmult: c.enemiesAlive } : null) },
  { id: 'cartographer', name: 'Rogue Trader\'s Sash', rarity: 'rare', theme: 'utility', text: '+1 Charm slot.', passive: { charmSlots: 1 } },

  // ── legendary ───────────────────────────────────────────────────────────
  { id: 'dragonHoard', name: 'Treasure of the Fortress', rarity: 'legendary', theme: 'xmult', text: '×0.2 Mult for every 5 scrip held (min ×1).',
    onHand: (c) => { const x = 1 + 0.2 * Math.floor(c.run.doubloons / 5); return x > 1 ? { xmult: Math.round(x * 10) / 10 } : null; } },
  { id: 'crownOfAges', name: 'Crown of the Yu\'Vath', rarity: 'legendary', theme: 'xmult', text: '×3 Mult. -1 reroll every turn.',
    passive: { rerolls: -1 }, onHand: () => ({ xmult: 3 }) },
  { id: 'fifthDoor', name: 'Lost Warrant Fragment', rarity: 'legendary', theme: 'dice', text: '+1 tray size, +1 reroll, +1 Charm slot.',
    passive: { handSize: 1, rerolls: 1, charmSlots: 1 } },
  { id: 'starEater', name: 'Fang of the Rak\'Gol', rarity: 'legendary', theme: 'xmult', text: 'Scored dice of 8 or higher give ×1.25 Mult.',
    onDie: (_c, d) => (d.value >= 8 ? { xmult: 1.25 } : null) },
];

// Material idols — one per class material (generated so the set stays even).
const IDOL_MATS: Material[] = ['aquila', 'adamant', 'warp', 'cog', 'creed', 'eye', 'ledger', 'void'];
const IDOL_NAMES: Record<string, string> = {
  aquila: 'Gilded Aquila Icon', adamant: 'Regimental Standard', warp: 'Soul-Binding Sigil', cog: 'Omnissiah Icon',
  creed: 'Saint\'s Knucklebone', eye: 'Third-Eye Talisman', ledger: 'Merchant\'s Seal', void: 'Void-Compass',
};
for (const m of IDOL_MATS) {
  CHARMS.push({
    id: `idol_${m}`, name: IDOL_NAMES[m], rarity: 'common', theme: 'mult',
    text: `Scored ${m[0].toUpperCase() + m.slice(1)} dice give +4 Chips and +2 Mult.`,
    onDie: (_c, d) => (d.material === m || d.material === 'xenos' ? { chips: 4, mult: 2 } : null),
  });
}

export const CHARM_BY_ID: Record<string, CharmDef> = Object.fromEntries(CHARMS.map((c) => [c.id, c]));

export function charmText(def: CharmDef, inst?: CharmInstance): string {
  const n = inst ? inst.counter : def.startCounter ?? 0;
  return def.text.replace('{n}', String(n));
}

export function newCharm(id: string): CharmInstance {
  const def = CHARM_BY_ID[id];
  return { id, counter: def?.startCounter ?? 0 };
}

/** Aggregate passive modifiers across owned charms (Mimic copies passives too). */
export function charmPassives(run: FortuneRun) {
  const out = { handSize: 0, rerolls: 0, interestCap: 0, critRange: 0, healMult: 1, guardMult: 1, hitBonus: 0, charmSlots: 0, rules: {} as EvalRules };
  const list = effectiveCharms(run);
  for (const { def } of list) {
    const p = def.passive;
    if (!p) continue;
    out.handSize += p.handSize ?? 0;
    out.rerolls += p.rerolls ?? 0;
    out.interestCap += p.interestCap ?? 0;
    out.critRange += p.critRange ?? 0;
    out.hitBonus += p.hitBonus ?? 0;
    out.charmSlots += p.charmSlots ?? 0;
    if (p.healMult) out.healMult *= p.healMult;
    if (p.guardMult) out.guardMult *= p.guardMult;
    if (p.rules) Object.assign(out.rules, p.rules);
  }
  return out;
}

/** Resolve Mimic Tongue: each mimic acts as the charm to its right. */
export function effectiveCharms(run: FortuneRun): { inst: CharmInstance; def: CharmDef; source: CharmInstance }[] {
  const out: { inst: CharmInstance; def: CharmDef; source: CharmInstance }[] = [];
  run.charms.forEach((inst, i) => {
    let def = CHARM_BY_ID[inst.id];
    let target = inst;
    let j = i;
    let hops = 0;
    while (def && def.id === 'mimicTongue' && hops < 5) {
      j += 1;
      const next = run.charms[j];
      if (!next) { def = undefined as unknown as CharmDef; break; }
      target = next;
      def = CHARM_BY_ID[next.id];
      hops++;
    }
    if (def && def.id !== 'mimicTongue') out.push({ inst: target, def, source: inst });
  });
  return out;
}
