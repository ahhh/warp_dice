/**
 * Domain types. Every game-state object is plain JSON, so a save is just
 * JSON.stringify(state) and every engine function can mutate state in place
 * behind the command dispatcher.
 *
 * The rules kernel is Rogue Trader's percentile system: nine Characteristics,
 * d100 Tests with Degrees of Success, hit locations, Armour Points against
 * Penetration, Toughness Bonus, Wounds and Critical Damage, Fate Points,
 * Insanity and Corruption.
 */
import type { RngStreams } from './rng.ts';
import type { CurseId } from '../fortune/curses.ts';

export type Char = 'WS' | 'BS' | 'S' | 'T' | 'Ag' | 'Int' | 'Per' | 'WP' | 'Fel';
export const CHARS: Char[] = ['WS', 'BS', 'S', 'T', 'Ag', 'Int', 'Per', 'WP', 'Fel'];

export type SkillId =
  | 'awareness' | 'dodge' | 'command' | 'commerce' | 'charm' | 'deceive' | 'intimidate'
  | 'inquiry' | 'scrutiny' | 'search' | 'security' | 'techUse' | 'medicae' | 'forbiddenLore'
  | 'evaluate' | 'navigation' | 'psyniscience' | 'invocation' | 'climb' | 'silentMove'
  | 'survival' | 'logic' | 'acrobatics';

/** Energy, Impact, Rending, Explosive (the four printed types) plus raw warp force. */
export type DamageType = 'energy' | 'impact' | 'rending' | 'explosive' | 'warp';

export type CareerId =
  | 'rogueTrader' | 'archMilitant' | 'astropath' | 'explorator'
  | 'missionary' | 'navigator' | 'seneschal' | 'voidMaster';

/** The five regions of the Blackstone Fortress. */
export type ZoneId = 'docks' | 'gardens' | 'reliquary' | 'labyrinth' | 'core';

export type Rank = 'front' | 'back';

export type HitLoc = 'head' | 'rArm' | 'lArm' | 'body' | 'rLeg' | 'lLeg';
export const HIT_LOCS: HitLoc[] = ['head', 'rArm', 'lArm', 'body', 'rLeg', 'lLeg'];

export type ConditionId =
  // Rogue Trader states
  | 'stunned' | 'prone' | 'pinned' | 'blinded' | 'frightened' | 'bleeding' | 'onFire'
  | 'snared' | 'poisoned' | 'helpless' | 'fatigued'
  // game statuses (documented adaptations)
  | 'aiming' | 'guarding' | 'inspired' | 'marked' | 'hidden' | 'frenzied' | 'shielded'
  | 'regenerating' | 'weakened' | 'slowed' | 'vulnerable' | 'staggered' | 'fortified'
  | 'dominated' | 'cloaked' | 'foreseen' | 'allOut' | 'warded' | 'blessed' | 'feinted' | 'quickened' | 'braced';

export interface Condition {
  id: ConditionId;
  /** Rounds remaining; decremented at the end of the owner's turn. -1 = until removed. */
  rounds: number;
  sourceId?: string;
  /** Characteristic Test to shake it off at end of turn (target number). */
  save?: { char: Char; mod: number };
  /** Generic magnitude: aim bonus, bleed damage, shield rating… */
  value?: number;
  /** Sustained psychic power link: ending the power strips it. */
  sustainOf?: string;
  /** Expires at the start of the owner's next turn. */
  untilTurnStart?: boolean;
}

export type Difficulty = 'explorer' | 'standard' | 'perilous';
export type Tier = 'novice' | 'veteran' | 'heroic' | 'mythic';

// ── items ────────────────────────────────────────────────────────────────────

export type ItemKind = 'weapon' | 'armor' | 'gear' | 'consumable' | 'valuable';
export type Craft = 'poor' | 'common' | 'good' | 'best';

export interface ItemInstance {
  uid: string;
  defId: string;
  craft: Craft;
  /** Weapon upgrades and special ammunition fitted to this item. */
  mods: string[];
  qty?: number;
}

// ── explorers (heroes) ───────────────────────────────────────────────────────

export interface OriginPath {
  homeWorld: string;
  birthright: string;
  lure: string;
  trial: string;
  motivation: string;
}

export interface Hero {
  id: string;
  name: string;
  portrait: string;
  careerId: CareerId;
  /** The dynasty's head. If the Lord-Captain dies, the game is lost. */
  lordCaptain?: boolean;
  origin: OriginPath;
  /** Rolled Characteristics including origin modifiers (before advances). */
  base: Record<Char, number>;
  /** Purchased Characteristic advances, 0..4 (+5 each). */
  advances: Record<Char, number>;
  /** Trained skills: 0 = trained, 10 = +10, 20 = +20. */
  skills: Partial<Record<SkillId, number>>;
  talents: string[];
  /** Psychic techniques / Navigator powers known (power id → mastery 0..2). */
  powers: Record<string, number>;
  /** Total experience earned and spent. Rank and power level derive from xp. */
  xp: number;
  xpSpent: number;
  /** Rank Boons already claimed (one per boon feature reached). */
  boonsTaken: number;
  /** Power level 1..20 derived from xp (kept in sync for scaling). */
  level: number;
  /** Rolled wounds before Toughness (origin formula). */
  woundRoll: number;
  hp: number;
  fate: number;
  fateMax: number;
  insanity: number;
  corruption: number;
  equipment: Partial<Record<EquipSlot, ItemInstance>>;
  resources: Record<string, number>;
  status: 'alive' | 'dead' | 'retired';
  history: { expeditions: number; clears: number; kills: number; deathCause?: string };
  /** Short personal colour from the generator. */
  look?: string;
}

export type EquipSlot = 'mainHand' | 'offHand' | 'armor' | 'gear1' | 'gear2';
export const EQUIP_SLOTS: EquipSlot[] = ['mainHand', 'offHand', 'armor', 'gear1', 'gear2'];

// ── fortune (the run-only dice layer) ────────────────────────────────────────

export type Material =
  | 'iron' | 'aquila' | 'adamant' | 'warp' | 'cog' | 'creed' | 'eye' | 'ledger' | 'void'
  | 'throne' | 'crystal' | 'xenos' | 'loaded' | 'cryo';

export type FaceMod =
  | 'gilded'    // +1 scrip when scored
  | 'keen'      // +6 chips when scored
  | 'fierce'    // +2 mult when scored
  | 'savage'    // ×1.5 mult when scored
  | 'wild'      // counts as any value
  | 'blessed'   // 1 in 3: +6 mult
  | 'cursed';   // scores 0 pips, -1 mult (enemy-applied)

export interface Face { v: number; mod?: FaceMod }

export interface FortuneDie {
  uid: string;
  material: Material;
  faces: Face[];
  name?: string;
}

export interface TrayDie {
  dieUid: string;
  face: number;
  jinxed?: boolean;
  ghost?: boolean;
}

export type HandType =
  | 'high' | 'pair' | 'twoPair' | 'three' | 'straight' | 'set' | 'fullHouse'
  | 'four' | 'straightSet' | 'five' | 'fullSet' | 'hoard';

export interface CharmInstance {
  id: string;
  counter: number;
}

export interface FortuneRun {
  bag: FortuneDie[];
  drawPile: string[];
  discard: string[];
  tray: TrayDie[];
  charms: CharmInstance[];
  charmSlots: number;
  omens: Partial<Record<HandType, number>>;
  /** Run-only coin of the fortress (void-scrip). */
  doubloons: number;
  rank: number;
  rerollsLeft: number;
  bonusHandSize: number;
  bonusRerolls: number;
  handsPlayed: Partial<Record<HandType, number>>;
  bestScore: number;
  tokens: string[];
  seenCharms: string[];
  lastHand?: HandType;
}

// ── combat ───────────────────────────────────────────────────────────────────

export interface MonsterAction {
  id: string;
  name: string;
  kind: 'attack' | 'save' | 'heal' | 'buff' | 'hex' | 'summon' | 'condition';
  dmg?: number;
  damageType?: DamageType;
  pen?: number;
  target: 'single' | 'front' | 'back' | 'all' | 'self' | 'ally' | 'allies';
  /** Characteristic heroes Test against for 'save' and 'condition' kinds. */
  save?: Char;
  halfOnSave?: boolean;
  condition?: { id: ConditionId; rounds: number; saveEnds?: boolean; value?: number };
  hex?: HexId;
  summon?: string;
  weight: number;
  ranged?: boolean;
  telegraph?: boolean;
  phase?: number;
  /** Fear rating: heroes test Willpower or are frightened and gain Insanity. */
  fear?: number;
  text?: string;
}

export type HexId = 'jinx' | 'pilfer' | 'curseFace' | 'invert' | 'drain' | 'snuff';

export interface Combatant {
  id: string;
  side: 'hero' | 'enemy';
  refId: string;
  name: string;
  art: string;
  rank: Rank;
  level: number;
  hp: number;
  maxHp: number;
  tempHp: number;
  /** Agility bonus for Initiative. */
  agB: number;
  initiative: number;
  conditions: Condition[];
  /** Wounds exhausted: taking Critical Damage. Heroes may still be saved. */
  downed: boolean;
  dead: boolean;
  /** Critical damage accumulated while downed (death at 10). */
  crit: number;
  /** Blood Loss Tests passed while downed (stable at 3). */
  deathPass?: number;
  /** Extra Reactions used this round (Defensive Stance, Wall of Steel). */
  resUsed?: number;
  stable: boolean;
  sustain?: { powerId: string; targets: string[] };
  /** Half Actions remaining this turn (a Full Action costs 2). */
  used: { half: number; reaction: boolean; fortune: boolean };
  mon?: {
    role: string;
    /** WS/BS used for attacks, WP for resisting powers, Ag for dodging. */
    ws: number;
    bs: number;
    wp: number;
    ag: number;
    tb: number;
    ap: number;
    dmgBase: number;
    resist: DamageType[];
    immune: DamageType[];
    vuln: DamageType[];
    actions: MonsterAction[];
    tags: string[];
    boss?: boolean;
    phase: number;
    phases?: number;
    elite?: boolean;
    telegraphed?: string;
    fear?: number;
    dodge: number;
  };
  ownerId?: string;
}

export interface LogEntry {
  t: string;
  kind?: 'hit' | 'miss' | 'heal' | 'crit' | 'info' | 'fortune' | 'death' | 'enemy' | 'loot' | 'warn';
}

export interface Combat {
  id: string;
  kind: 'normal' | 'elite' | 'boss' | 'ambush';
  round: number;
  order: string[];
  turnIndex: number;
  combatants: Record<string, Combatant>;
  log: LogEntry[];
  status: 'active' | 'victory' | 'defeat' | 'fled';
  curse?: CurseId;
  roomKey: string;
  rewarded: boolean;
  lastScore?: ScoreReport;
  kills: number;
  handsThisCombat: number;
  rerollsUsed: number;
  turn?: HeroTurn;
  fx: Fx[];
  once: Record<string, boolean>;
  diedThisFight: string[];
  legendary: Record<string, number>;
  biomeNote?: string;
  /** Fear tests already made against each fearsome foe. */
  feared: string[];
}

export interface HeroTurn {
  actorId: string;
  plays: number;
  playsUsed: number;
  playLimit: number;
  flags: Record<string, boolean>;
  /** Next attack Test auto-succeeds with 3 DoS (Loaded Coin → "Emperor's Favour"). */
  loaded?: boolean;
}

export interface Fx {
  kind: 'dmg' | 'heal' | 'miss' | 'text' | 'crit' | 'ward' | 'hex' | 'kill' | 'down';
  target?: string;
  amount?: number;
  text?: string;
  actor?: string;
}

export interface ScoreStep {
  label: string;
  chips?: number;
  mult?: number;
  xmult?: number;
  dieIndex?: number;
  charm?: string;
  doubloons?: number;
}

export interface ScoreReport {
  hand: HandType;
  handLevel: number;
  scoringDice: number[];
  chips: number;
  mult: number;
  base: number;
  total: number;
  steps: ScoreStep[];
  doubloons: number;
  crit?: boolean;
  /** Scored 10s: each one triggers Righteous Fury on the action. */
  fury?: number;
}

// ── the fortress map ────────────────────────────────────────────────────────

export type Facing = 'N' | 'E' | 'S' | 'W';
export type RelDir = 'forward' | 'left' | 'right' | 'back';

export type RoomType =
  | 'entrance' | 'corridor' | 'combat' | 'elite' | 'treasure' | 'peddler'
  | 'shrine' | 'event' | 'camp' | 'boss' | 'key' | 'mechanism' | 'exit';

export interface Room {
  key: string;
  x: number;
  y: number;
  type: RoomType;
  name: string;
  text: string;
  exits: Partial<Record<Facing, Door>>;
  encounter?: { monsters: string[]; kind: Combat['kind']; cleared: boolean };
  eventId?: string;
  eventDone?: boolean;
  loot?: { gold: number; items: string[]; charm?: boolean; taken: boolean };
  tags: string[];
  secret?: boolean;
  art?: string;
}

export interface Door {
  to: string;
  lock?: 'sigil' | 'gate' | 'water' | 'mirror';
  open?: boolean;
  hidden?: boolean;
}

export interface DungeonMap {
  width: number;
  height: number;
  rooms: Record<string, Room>;
  start: string;
  bossKey: string;
  criticalPath: string[];
}

export interface Expedition {
  seed: string;
  biome: ZoneId;
  difficulty: Difficulty;
  tier: Tier;
  partyLevel: number;
  partyIds: string[];
  map: DungeonMap;
  pos: string;
  prev?: string;
  facing: Facing;
  visited: string[];
  seen: string[];
  fortune: FortuneRun;
  combat?: Combat;
  event?: { roomKey: string; eventId: string; stage: 'choose' | 'result' | 'pickDie'; result?: string[] };
  spoils?: { gold: number; doubloons: number; interest: number; items: string[]; kind: string; rank: number; charmBonus: number; xp: number };
  lootChoice?: { items: ItemInstance[] };
  searched: string[];
  shop?: { roomKey: string; offers: BoonOffer[]; rerollCost: number };
  shops?: Record<string, { roomKey: string; offers: BoonOffer[]; rerollCost: number }>;
  boons?: { offers: BoonOffer[]; source: string; picks: number };
  log: LogEntry[];
  depth: number;
  status: 'active' | 'won' | 'retreated' | 'wiped';
  rng: RngStreams;
  /** Thrones carried: banked only if the party gets out. */
  carriedGold: number;
  carriedItems: ItemInstance[];
  keys: string[];
  flags: Record<string, number>;
  meter: number;
  steps: number;
  shortRests: number;
  longRestUsed: boolean;
  theme: { name: string; anomaly: string; faction: string; objective: string; boss: string; hook: string };
  fallen: string[];
  bossDefeated: boolean;
  journal: string[];
  /** XP earned this expedition (awarded on return). */
  xpEarned: number;
  tutorial?: boolean;
  finale?: boolean;
}

export interface BoonOffer {
  kind: 'charm' | 'die' | 'omen' | 'face' | 'token' | 'upgrade' | 'heal' | 'gold' | 'remove';
  id: string;
  price?: number;
  sold?: boolean;
  die?: FortuneDie;
  face?: FaceMod;
  hand?: HandType;
}

// ── profile / save ───────────────────────────────────────────────────────────

export interface Profile {
  bankedGold: number;
  /** Profit Factor: the dynasty's standing. Drives Acquisition Tests. */
  profitFactor: number;
  unlockedBiomes: ZoneId[];
  sigils: Partial<Record<ZoneId, number>>;
  facility: Record<string, number>;
  codex: { charms: string[]; monsters: string[]; hands: HandType[] };
  stats: { expeditions: number; clears: number; wipes: number; deaths: number; bestScore: number; retreats: number; thronesTraded: number };
  townDay: number;
  story?: { seen: string[]; warrant: number };
  dynastyName: string;
  shipName: string;
  keeperName?: string;
}

export interface TutorialState {
  step: number;
  entered?: number;
  mark?: string;
  tips: string[];
}

export interface GameState {
  schemaVersion: number;
  contentRevision: string;
  slot: number;
  mode: 'legacy' | 'story';
  createdAt: number;
  savedAt: number;
  /** 'create' while the dynasty is being founded; 'over' once the Lord-Captain falls. */
  phase: 'create' | 'play' | 'over';
  profile: Profile;
  roster: Hero[];
  vault: ItemInstance[];
  recruits: Hero[];
  /** Enclave market stock (item instances, pre-rolled) and failed acquisitions today. */
  market: { stock: ItemInstance[]; failed: string[]; day: number };
  townRng: RngStreams['town'];
  expedition?: Expedition;
  lastResult?: {
    kind: 'won' | 'retreated' | 'wiped'; gold: number; items: string[]; fallen: string[]; xp: number;
    biome: ZoneId; score: number; fights: number; rank: number; charms: string[]; bossRounds?: number;
    tutorial?: boolean; finale?: boolean; chapter?: string; captainLost?: boolean; pf?: number;
  };
  /** Epitaph shown on the game-over screen. */
  ending?: { captain: string; cause: string; day: number; clears: number };
  uidCounter: number;
  settings: { fast: boolean; sound: boolean };
  tutorial?: TutorialState | null;
}
