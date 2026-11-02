/**
 * The single stat resolver: explorer state in, derived numbers out. UI never
 * hand-computes a Characteristic or Armour; it calls derive().
 * Also character creation: the Origin Path, rolled Characteristics, Wounds,
 * Fate, starting kit.
 */
import type { CareerId, Char, Craft, Hero, HitLoc, ItemInstance, OriginPath, SkillId } from '../engine/types.ts';
import { CHARS, HIT_LOCS } from '../engine/types.ts';
import type { Rng } from '../engine/rng.ts';
import { bonus, roll } from '../engine/dice.ts';
import { CAREERS, featuresUpTo, rankFromXp, levelFromXp, START_XP, START_SPENT } from '../content/careers.ts';
import { ITEMS, MODS, type Quality, type WeaponClass, type WeaponGroup } from '../content/items.ts';
import { SKILLS, SKILL_IDS } from '../content/skills.ts';
import { TALENTS, psyRatingOf } from '../content/talents.ts';
import { ORIGIN_BY_ID, randomPath, crewName, lookFor, type OriginEffect } from '../content/origins.ts';
import { ASTROPATH_STARTING, NAVIGATOR_STARTING } from '../content/powers.ts';
import { VITALITY, VITALITY_GROWTH } from './balance.ts';
import { portraitFor } from '../content/portraits.ts';

export const CHAR_NAMES: Record<Char, string> = {
  WS: 'Weapon Skill', BS: 'Ballistic Skill', S: 'Strength', T: 'Toughness', Ag: 'Agility',
  Int: 'Intelligence', Per: 'Perception', WP: 'Willpower', Fel: 'Fellowship',
};

export interface WeaponProfile {
  name: string;
  cls: WeaponClass;
  group: WeaponGroup;
  ranged: boolean;
  dice: string;
  /** Flat bonus added to the damage roll (SB for melee, talents, craftsmanship). */
  bonus: number;
  type: import('../engine/types.ts').DamageType;
  pen: number;
  rof: [number, number, number];
  qualities: Quality[];
  /** Bonus to the attack Test (craftsmanship, mods, training). */
  hit: number;
  /** d100 result at or above which the weapon jams; 101 = never. */
  jamOn: number;
  trained: boolean;
  twoHanded: boolean;
}

export interface Derived {
  chars: Record<Char, number>;
  bonuses: Record<Char, number>;
  rank: number;
  level: number;
  rawWounds: number;
  maxHp: number;
  ap: Record<HitLoc, number>;
  field: number;
  init: number;
  /** Test target per skill; null if an untrained Advanced skill. */
  skills: Record<SkillId, number | null>;
  dodge: number;
  parry: number;
  main: WeaponProfile;
  offhand?: WeaponProfile;
  meleeAttacks: number;
  psyRating: number;
  focusBonus: number;
  rerollBonus: number;
  furyMin: number;
  fateMax: number;
  features: Set<string>;
  talents: Set<string>;
  hasShield: boolean;
  freeRank: boolean;
  pfBonus: number;
}

function equipped(hero: Hero): ItemInstance[] {
  return Object.values(hero.equipment).filter(Boolean) as ItemInstance[];
}

export function effectiveChars(hero: Hero): Record<Char, number> {
  const c = {} as Record<Char, number>;
  for (const k of CHARS) c[k] = hero.base[k] + 5 * (hero.advances[k] ?? 0);
  for (const inst of equipped(hero)) {
    const g = ITEMS[inst.defId]?.gear;
    if (g?.chars) for (const [k, v] of Object.entries(g.chars)) c[k as Char] += v!;
  }
  const feats = new Set(featuresUpTo(hero.careerId, rankFromXp(hero.xp)).map((f) => f.id));
  if (feats.has('legend')) c.Fel += 10;
  return c;
}

export function hasTalent(hero: Hero, id: string) {
  return hero.talents.includes(id);
}

export function derive(hero: Hero): Derived {
  const career = CAREERS[hero.careerId];
  const chars = effectiveChars(hero);
  const bonuses = Object.fromEntries(CHARS.map((k) => [k, bonus(chars[k])])) as Record<Char, number>;
  const rank = rankFromXp(hero.xp);
  const level = levelFromXp(hero.xp);
  const features = new Set(featuresUpTo(hero.careerId, rank).map((f) => f.id));
  const talents = new Set(hero.talents);
  const items = equipped(hero);

  // Wounds: 2×TB + origin roll + Sound Constitution, scaled for the Fortune game.
  const sc = hero.talents.filter((t) => t === 'soundConstitution').length;
  const rawWounds = 2 * bonuses.T + hero.woundRoll + sc + (hero.lordCaptain ? 4 : 0);
  let hpPct = 0;
  for (const inst of items) hpPct += ITEMS[inst.defId]?.gear?.hpPct ?? 0;
  const maxHp = Math.max(1, Math.round(rawWounds * VITALITY * (1 + VITALITY_GROWTH * (level - 1)) * (1 + hpPct)));

  // Armour by location.
  const ap = Object.fromEntries(HIT_LOCS.map((l) => [l, 0])) as Record<HitLoc, number>;
  const armorInst = hero.equipment.armor;
  const armor = armorInst ? ITEMS[armorInst.defId]?.armor : undefined;
  if (armor) {
    const craftAp = armorInst!.craft === 'good' || armorInst!.craft === 'best' ? 1 : 0;
    for (const l of armor.locs) ap[l] = armor.ap + craftAp;
  }
  let apAll = 0;
  let field = 0;
  let rerollBonus = 0;
  let init = bonuses.Ag;
  let focusBonus = 0;
  let dodgeMod = 0;
  let fateBonus = 0;
  let freeRank = false;
  let pfBonus = 0;
  for (const inst of items) {
    const g = ITEMS[inst.defId]?.gear;
    if (!g) continue;
    apAll += g.apAll ?? 0;
    field = Math.max(field, g.field ?? 0);
    rerollBonus += g.rerolls ?? 0;
    init += g.init ?? 0;
    focusBonus += g.focus ?? 0;
    dodgeMod += g.dodgeMod ?? 0;
    fateBonus += g.fate ?? 0;
    pfBonus += g.pf ?? 0;
    if (g.freeRank) freeRank = true;
  }
  if (features.has('implants')) apAll += 1;
  const shieldInst = hero.equipment.offHand && ITEMS[hero.equipment.offHand.defId]?.weapon?.qualities.includes('defensive') ? hero.equipment.offHand : undefined;
  for (const l of HIT_LOCS) ap[l] += apAll;
  if (shieldInst) { ap.body += 2; ap.lArm += 2; }

  // Skills.
  const skills = {} as Record<SkillId, number | null>;
  for (const id of SKILL_IDS) {
    const def = SKILLS[id];
    const lvl = hero.skills[id];
    let t: number | null = lvl === undefined ? (def.basic ? Math.floor(chars[def.char] / 2) : null) : chars[def.char] + lvl;
    if (t !== null) {
      for (const inst of items) t += ITEMS[inst.defId]?.gear?.skills?.[id] ?? 0;
      if (id === 'commerce' && talents.has('talented')) t += 10;
      if (id === 'awareness' && talents.has('heightenedSenses')) t += 10;
      if ((id === 'logic' || id === 'techUse') && talents.has('logisImplant')) t += 10;
      if (id === 'techUse' && talents.has('electroGraftUse')) t += 10;
      if ((id === 'forbiddenLore' || id === 'navigation') && talents.has('totalRecall')) t += 10;
      if ((id === 'commerce' || id === 'charm') && talents.has('peer')) t += 10;
    }
    skills[id] = t;
  }
  const dodge = (skills.dodge ?? Math.floor(chars.Ag / 2)) + dodgeMod - (armorInst?.craft === 'poor' ? 10 : 0);
  if (talents.has('rapidReaction')) init += 2;
  if (hero.origin.homeWorld === 'hiveWorld') init += 1;

  const main = weaponProfile(hero, hero.equipment.mainHand, chars, bonuses, talents, features, false);
  const offInst = hero.equipment.offHand && ITEMS[hero.equipment.offHand.defId]?.weapon && !shieldInst ? hero.equipment.offHand : undefined;
  const offhand = offInst ? weaponProfile(hero, offInst, chars, bonuses, talents, features, true) : undefined;
  const parry = chars.WS + (main.qualities.includes('balanced') ? 10 : 0) - (main.qualities.includes('unbalanced') ? 10 : 0) - (main.qualities.includes('unwieldy') ? 20 : 0) + (shieldInst ? 10 : 0) + (hero.equipment.mainHand?.defId === 'ghostSword' ? 15 : 0);

  let meleeAttacks = 1;
  if (talents.has('swiftAttack')) meleeAttacks = 2;
  if (talents.has('lightningAttack')) meleeAttacks = 3;

  let furyMin = 10;
  if (hero.careerId === 'seneschal') rerollBonus += 1;
  if (talents.has('mechadendriteUse')) rerollBonus += 1;

  let fateMax = hero.fateMax + fateBonus;
  for (const f of features) if (f.startsWith('hardened')) fateMax += 1;
  if (hero.lordCaptain && features.has('lordCaptainFate')) fateMax += 1;
  if (features.has('legend')) pfBonus += 1;
  if (talents.has('renownedWarrant')) pfBonus += 1;
  if (features.has('masterPsyker')) focusBonus += 10;
  if (features.has('houseBlood')) focusBonus += 10;

  return {
    chars, bonuses, rank, level, rawWounds, maxHp, ap, field, init, skills, dodge, parry, main, offhand, meleeAttacks,
    psyRating: career.psyker ? psyRatingOf(hero.talents) : 0, focusBonus, rerollBonus, furyMin, fateMax, features, talents,
    hasShield: !!shieldInst, freeRank, pfBonus,
  };
}

function weaponProfile(hero: Hero, inst: ItemInstance | undefined, chars: Record<Char, number>, b: Record<Char, number>, talents: Set<string>, features: Set<string>, offhand: boolean): WeaponProfile {
  const def = inst ? ITEMS[inst.defId] : undefined;
  const w = def?.weapon;
  if (!w) {
    return { name: 'Unarmed', cls: 'melee', group: 'primitive', ranged: false, dice: '1d5', bonus: b.S - 3, type: 'impact', pen: 0, rof: [1, 0, 0], qualities: ['primitive'], hit: 0, jamOn: 101, trained: true, twoHanded: false };
  }
  const career = CAREERS[hero.careerId];
  const ranged = w.cls !== 'melee';
  const trained = career.training.includes(w.cls) || features.has('weaponMaster');
  const qualities = [...w.qualities];
  let hit = trained ? 0 : -20;
  let dmg = w.sb ? b.S : 0;
  let pen = w.pen;
  const craft = inst!.craft;
  if (!ranged) {
    if (craft === 'poor') hit -= 10;
    if (craft === 'good') hit += 5;
    if (craft === 'best') { hit += 10; dmg += 1; }
    if (talents.has('crushingBlow')) dmg += 2;
  } else {
    if (talents.has('mightyShot')) dmg += 2;
    if (craft === 'good' && !qualities.includes('reliable')) {
      if (qualities.includes('unreliable')) qualities.splice(qualities.indexOf('unreliable'), 1);
      else qualities.push('reliable');
    }
    if (craft === 'poor' && !qualities.includes('unreliable')) qualities.push('unreliable');
    if (features.has('augurLock')) hit += 10;
  }
  if (features.has('weaponMaster')) hit += 5;
  if (offhand && !talents.has('ambidextrous')) hit -= 20;
  for (const m of inst!.mods) {
    const md = MODS[m];
    if (!md) continue;
    hit += md.hit ?? 0;
    dmg += md.dmg ?? 0;
    pen = md.id === 'manstopper' ? Math.max(pen, 3) : pen + (md.pen ?? 0);
    if (md.quality && !qualities.includes(md.quality)) qualities.push(md.quality);
  }
  const jamOn = !ranged ? 101 : craft === 'best' ? 101 : qualities.includes('unreliable') ? 91 : qualities.includes('reliable') ? 100 : 96;
  const name = `${craft === 'common' ? '' : `${craft[0].toUpperCase()}${craft.slice(1)} `}${def!.name}`;
  return { name, cls: w.cls, group: w.group, ranged, dice: w.dmg, bonus: dmg, type: w.type, pen, rof: w.rof, qualities, hit, jamOn, trained, twoHanded: !!w.twoHanded };
}

// ── creation ────────────────────────────────────────────────────────────────

export type RollMethod = 'ordered' | 'arranged' | 'heroic' | 'points';

export function heroUid(rng: Rng): string {
  return `h${Math.floor(rng.next() * 2 ** 32).toString(36)}`;
}

export function itemUid(rng: Rng): string {
  return `i${Math.floor(rng.next() * 2 ** 32).toString(36)}${Math.floor(rng.next() * 1e6).toString(36)}`;
}

export function makeItem(rng: Rng, defId: string, craft: Craft = 'common', mods: string[] = [], qty?: number): ItemInstance {
  const inst: ItemInstance = { uid: itemUid(rng), defId, craft, mods };
  if (qty) inst.qty = qty;
  return inst;
}

/**
 * Roll the nine Characteristics (Core p.14): 2d10+25 each. 'arranged' sorts
 * the rolls into the career's priorities; 'heroic' is 3d10 drop lowest + 25;
 * 'points' spends 100 points (max +20 each) by career priority.
 */
export function rollCharacteristics(rng: Rng, careerId: CareerId, method: RollMethod = 'arranged'): Record<Char, number> {
  const pri = CAREERS[careerId].priority;
  const out = {} as Record<Char, number>;
  if (method === 'points') {
    const plan = [20, 20, 15, 15, 10, 10, 5, 5, 0];
    pri.forEach((k, i) => (out[k] = 25 + plan[i]));
    return out;
  }
  const one = () => (method === 'heroic' ? [rng.die(10), rng.die(10), rng.die(10)].sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0) : rng.die(10) + rng.die(10)) + 25;
  const rolls = CHARS.map(one);
  if (method === 'ordered') { CHARS.forEach((k, i) => (out[k] = rolls[i])); return out; }
  rolls.sort((a, b) => b - a);
  pri.forEach((k, i) => (out[k] = rolls[i]));
  return out;
}

export interface CreateOpts {
  name?: string;
  /** Origin step ids (5) and chosen option per step (-1 = none). */
  path?: string[];
  pathOpts?: number[];
  method?: RollMethod;
  /** Pre-rolled base Characteristics (before origin modifiers). */
  chars?: Record<Char, number>;
  lordCaptain?: boolean;
  /** Experience beyond the starting 5000 (veteran recruits). */
  xp?: number;
  taken?: Iterable<string>;
  portrait?: string;
}

export interface OriginOutcome { effects: OriginEffect[]; traits: [string, string][]; pf: number; heirloom: boolean }

export function originOutcome(path: string[], pathOpts: number[]): OriginOutcome {
  const effects: OriginEffect[] = [];
  const traits: [string, string][] = [];
  let pf = 0;
  let heirloom = false;
  path.forEach((id, i) => {
    const o = ORIGIN_BY_ID[id];
    if (!o) return;
    effects.push(o.effect);
    traits.push(...o.traits);
    const opt = o.options?.[pathOpts[i] ?? 0];
    if (opt) { effects.push(opt.effect); traits.push([`${o.name}: ${opt.name}`, opt.text]); }
  });
  for (const e of effects) { pf += e.pf ?? 0; if (e.heirloom) heirloom = true; }
  return { effects, traits, pf, heirloom };
}

export function createHero(rng: Rng, careerId: CareerId, opts: CreateOpts = {}): Hero {
  const career = CAREERS[careerId];
  const path = opts.path ?? randomPath(rng, career.homeWorlds).ids;
  const pathOpts = opts.pathOpts ?? path.map((id) => (ORIGIN_BY_ID[id]?.options ? rng.int(0, ORIGIN_BY_ID[id].options!.length - 1) : -1));
  const base = { ...(opts.chars ?? rollCharacteristics(rng, careerId, opts.method ?? 'arranged')) };
  const out = originOutcome(path, pathOpts);
  const skills: Hero['skills'] = {};
  const talents: string[] = [];
  let woundBonus = 0, fate = 0, insanity = 0, corruption = 0;
  for (const e of out.effects) {
    for (const [k, v] of Object.entries(e.mods ?? {})) base[k as Char] += v!;
    for (const s of e.skills ?? []) skills[s] = skills[s] === undefined ? 0 : Math.min(20, skills[s]! + 10);
    for (const t of e.talents ?? []) if (!talents.includes(t) || t === 'soundConstitution') talents.push(t);
    woundBonus += e.wounds ?? 0;
    fate += e.fate ?? 0;
    insanity += e.insanity ?? 0;
    corruption += e.corruption ?? 0;
  }
  for (const s of career.skills) if (skills[s] === undefined) skills[s] = 0;
  for (const t of career.talents) if (!talents.includes(t)) talents.push(t);
  for (const k of CHARS) base[k] = Math.max(15, Math.min(60, base[k]));
  const home = ORIGIN_BY_ID[path[0]];
  const fr = rng.die(10);
  const fateBase = (home?.fate ?? [[10, 3]]).find(([max]) => fr <= max)?.[1] ?? 3;
  const powers: Record<string, number> = {};
  if (career.psyker) for (const p of ASTROPATH_STARTING) powers[p] = 0;
  if (career.navigator) for (const p of NAVIGATOR_STARTING) powers[p] = 0;
  const xp = START_XP + (opts.xp ?? 0);
  const hero: Hero = {
    id: heroUid(rng),
    name: opts.name ?? crewName(rng, opts.taken ?? [], career.id === 'rogueTrader' || career.id === 'navigator'),
    portrait: opts.portrait ?? portraitFor(rng, careerId),
    careerId, lordCaptain: opts.lordCaptain || undefined,
    origin: { homeWorld: path[0], birthright: path[1], lure: path[2], trial: path[3], motivation: path[4] },
    base, advances: Object.fromEntries(CHARS.map((k) => [k, 0])) as Record<Char, number>,
    skills, talents, powers, xp, xpSpent: START_SPENT, boonsTaken: 0, level: levelFromXp(xp),
    woundRoll: rng.die(5) + woundBonus, hp: 1,
    fate: 0, fateMax: Math.max(1, fateBase + fate),
    insanity, corruption,
    equipment: {}, resources: {}, status: 'alive',
    history: { expeditions: 0, clears: 0, kills: 0 },
    look: lookFor(rng),
  };
  (hero as Hero & { originOpts?: number[] }).originOpts = pathOpts;
  equipKit(hero, rng);
  if (out.heirloom) grantHeirloom(hero, rng);
  fullRestore(hero);
  return hero;
}

export function originOptsOf(hero: Hero): number[] {
  return (hero as Hero & { originOpts?: number[] }).originOpts ?? [-1, -1, -1, -1, -1];
}

const HEIRLOOM_ITEMS = ['archeoLaspistol', 'angevinChainsword', 'ancestralSeal', 'saintCarapace', 'reliquary'];

export function grantHeirloom(hero: Hero, rng: Rng) {
  const id = rng.pick(HEIRLOOM_ITEMS);
  const inst = makeItem(rng, id, ITEMS[id].kind === 'gear' ? 'common' : 'best');
  equipInto(hero, inst);
}

function equipInto(hero: Hero, inst: ItemInstance): boolean {
  const def = ITEMS[inst.defId];
  if (!def) return false;
  if (def.kind === 'weapon') {
    const w = def.weapon!;
    const main = hero.equipment.mainHand;
    const mainDef = main ? ITEMS[main.defId]?.weapon : undefined;
    // Keep a ranged main hand and a one-handed off hand where possible.
    if (!main) { hero.equipment.mainHand = inst; return true; }
    if (!w.twoHanded && !mainDef?.twoHanded && !hero.equipment.offHand) { hero.equipment.offHand = inst; return true; }
    if (!w.twoHanded && mainDef && !mainDef.twoHanded) { hero.equipment.offHand = inst; return true; }
    hero.equipment.mainHand = inst;
    if (w.twoHanded && hero.equipment.offHand) delete hero.equipment.offHand;
    return true;
  }
  if (def.kind === 'armor') { hero.equipment.armor = inst; return true; }
  if (def.kind === 'gear') {
    if (!hero.equipment.gear1) hero.equipment.gear1 = inst;
    else hero.equipment.gear2 = inst;
    return true;
  }
  return false;
}

function equipKit(hero: Hero, rng: Rng) {
  const kit = CAREERS[hero.careerId].kit;
  // Ranged weapons first so they take the main hand; melee goes to the off hand.
  const sorted = kit.slice().sort((a, b) => Number(ITEMS[a[0]]?.weapon?.cls === 'melee') - Number(ITEMS[b[0]]?.weapon?.cls === 'melee'));
  for (const [id, craft] of sorted) if (ITEMS[id]) equipInto(hero, makeItem(rng, id, craft));
}

export function syncLevel(hero: Hero) {
  hero.level = levelFromXp(hero.xp);
}

export function fullRestore(hero: Hero) {
  syncLevel(hero);
  const d = derive(hero);
  hero.hp = d.maxHp;
  hero.fate = d.fateMax;
  hero.resources = {};
}

/** Rest at a camp: regain a share of Wounds (Medicae helps). */
export function restHeal(hero: Hero, rng: Rng, medicae: number | null, share = 0.5): number {
  const d = derive(hero);
  const test = medicae !== null ? roll(rng, '1d100').total <= medicae : false;
  const amt = Math.round(d.maxHp * (share + (test ? 0.2 : 0)));
  const before = hero.hp;
  hero.hp = Math.min(d.maxHp, hero.hp + amt);
  return hero.hp - before;
}

export function heroTitle(hero: Hero): string {
  return `${CAREERS[hero.careerId].name} · Rank ${rankFromXp(hero.xp)}`;
}

export function xpAvailable(hero: Hero): number {
  return hero.xp - hero.xpSpent;
}

export { rankFromXp, levelFromXp };
