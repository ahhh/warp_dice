/**
 * The Armoury (Core Rulebook ch. V, tables 5-4 to 5-16; Into the Storm).
 * Profiles are the printed ones: damage dice, type, Penetration, Rate of
 * Fire and qualities; armour Points by location; Availability tier.
 *
 * Prices in Thrones are this game's addition: the enclave survivors want
 * coin and valuables, not Profit Factor alone. Rare goods also need an
 * Acquisition Test (see meta/town.ts).
 */
import type { Char, Craft, DamageType, HitLoc, ItemInstance, ItemKind, SkillId } from '../engine/types.ts';

export const AVAIL = ['Ubiquitous', 'Abundant', 'Plentiful', 'Common', 'Average', 'Scarce', 'Rare', 'Very Rare', 'Extremely Rare', 'Near Unique', 'Unique'] as const;
/** Acquisition modifier by Availability (Core Table 5-1). */
export const AVAIL_MOD = [70, 50, 30, 20, 10, 0, -10, -20, -30, -50, -70];
const PRICE = [4, 8, 15, 25, 45, 80, 150, 300, 600, 1200, 2500];

export type WeaponClass = 'pistol' | 'basic' | 'heavy' | 'melee' | 'thrown';
export type WeaponGroup = 'las' | 'sp' | 'bolt' | 'melta' | 'plasma' | 'flame' | 'primitive' | 'exotic' | 'chain' | 'power' | 'shock';
export type Quality =
  | 'accurate' | 'reliable' | 'unreliable' | 'tearing' | 'balanced' | 'unbalanced' | 'unwieldy'
  | 'powerField' | 'shocking' | 'flame' | 'blast' | 'scatter' | 'overheat' | 'toxic' | 'storm' | 'primitive' | 'defensive' | 'snare';

export interface WeaponDef {
  cls: WeaponClass;
  group: WeaponGroup;
  dmg: string;
  type: DamageType;
  pen: number;
  /** Rate of Fire: single shot, semi-auto burst, full-auto burst (0 = not available). */
  rof: [number, number, number];
  qualities: Quality[];
  /** Melee weapons add the wielder's Strength Bonus. */
  sb?: boolean;
  twoHanded?: boolean;
}

export interface ArmorDef { ap: number; locs: HitLoc[]; group: string }

export interface GearMods {
  field?: number;
  chars?: Partial<Record<Char, number>>;
  skills?: Partial<Record<SkillId, number>>;
  apAll?: number;
  hpPct?: number;
  rerolls?: number;
  init?: number;
  fate?: number;
  focus?: number;
  dodgeMod?: number;
  freeRank?: boolean;
  pf?: number;
}

export interface ConsumableDef {
  effect: 'heal' | 'cleanse' | 'bomb' | 'stimm' | 'frenzon' | 'smoke' | 'flash' | 'camp' | 'revive' | 'fortune' | 'unguent';
  dice?: string;
  damageType?: DamageType;
  pen?: number;
  combat: boolean;
  explore: boolean;
  target: 'self' | 'ally' | 'enemy' | 'enemies' | 'rank' | 'party';
}

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  avail: number;
  price: number;
  art: string;
  text?: string;
  weapon?: WeaponDef;
  armor?: ArmorDef;
  gear?: GearMods;
  consumable?: ConsumableDef;
  /** Valuables: worth in Thrones at the Exchange. */
  value?: number;
  lootOnly?: boolean;
  /** Market facility level needed to stock it. */
  shopTier?: number;
  heirloom?: boolean;
}

export const ITEMS: Record<string, ItemDef> = {};
const add = (d: ItemDef) => { ITEMS[d.id] = d; return d; };
const av = (name: (typeof AVAIL)[number]) => AVAIL.indexOf(name);
const price = (a: number, mult = 1) => Math.round(PRICE[a] * mult);

const RW = (id: string, name: string, cls: WeaponClass, group: WeaponGroup, dmg: string, type: DamageType, pen: number, rof: [number, number, number], q: Quality[], a: (typeof AVAIL)[number], extra: Partial<ItemDef> = {}) =>
  add({ id, name, kind: 'weapon', avail: av(a), price: price(av(a), 1.2), art: `items/weapon_${id}`, weapon: { cls, group, dmg, type, pen, rof, qualities: q, twoHanded: cls === 'basic' || cls === 'heavy' }, ...extra });
const MW = (id: string, name: string, group: WeaponGroup, dmg: string, type: DamageType, pen: number, q: Quality[], a: (typeof AVAIL)[number], twoHanded = false, extra: Partial<ItemDef> = {}) =>
  add({ id, name, kind: 'weapon', avail: av(a), price: price(av(a), 1.2), art: `items/weapon_${id}`, weapon: { cls: 'melee', group, dmg, type, pen, rof: [1, 0, 0], qualities: q, sb: true, twoHanded }, ...extra });
const ALL: HitLoc[] = ['head', 'rArm', 'lArm', 'body', 'rLeg', 'lLeg'];
const ABL: HitLoc[] = ['rArm', 'lArm', 'body', 'rLeg', 'lLeg'];
const AR = (id: string, name: string, group: string, ap: number, locs: HitLoc[], a: (typeof AVAIL)[number], extra: Partial<ItemDef> = {}) =>
  add({ id, name, kind: 'armor', avail: av(a), price: price(av(a)), art: `items/armor_${id}`, armor: { ap, locs, group }, ...extra });
const G = (id: string, name: string, a: (typeof AVAIL)[number], gear: GearMods, text: string, extra: Partial<ItemDef> = {}) =>
  add({ id, name, kind: 'gear', avail: av(a), price: price(av(a)), art: `items/gear_${id}`, gear, text, ...extra });
const C = (id: string, name: string, a: (typeof AVAIL)[number], consumable: ConsumableDef, text: string, extra: Partial<ItemDef> = {}) =>
  add({ id, name, kind: 'consumable', avail: av(a), price: price(av(a), 0.6), art: `items/consumable_${id}`, consumable, text, ...extra });
const V = (id: string, name: string, a: (typeof AVAIL)[number], value: number, text: string) =>
  add({ id, name, kind: 'valuable', avail: av(a), price: value, value, art: `items/valuable_${id}`, text, lootOnly: true });

// ── Ranged weapons (Table 5-4 / 5-7) ─────────────────────────────────────────
RW('laspistol', 'Laspistol', 'pistol', 'las', '1d10+2', 'energy', 0, [1, 0, 0], ['reliable'], 'Common');
RW('lasgun', 'Lasgun', 'basic', 'las', '1d10+3', 'energy', 0, [1, 3, 0], ['reliable'], 'Common');
RW('lascarbine', 'Lascarbine', 'basic', 'las', '1d10+3', 'energy', 0, [1, 2, 0], ['reliable'], 'Scarce');
RW('longLas', 'Long-las', 'basic', 'las', '1d10+3', 'energy', 1, [1, 0, 0], ['accurate', 'reliable'], 'Scarce');
RW('hellpistol', 'Hellpistol', 'pistol', 'las', '1d10+4', 'energy', 7, [1, 2, 0], [], 'Rare');
RW('hellgun', 'Hellgun', 'basic', 'las', '1d10+4', 'energy', 7, [1, 3, 0], [], 'Rare');
RW('archeoLaspistol', 'Archeotech Laspistol', 'pistol', 'las', '1d10+3', 'energy', 2, [1, 3, 0], ['accurate', 'reliable'], 'Near Unique', { lootOnly: true, heirloom: true });
RW('belasco', 'Belasco Duelling Pistol', 'pistol', 'las', '1d10+5', 'energy', 4, [1, 0, 0], ['accurate'], 'Very Rare');
RW('autopistol', 'Autopistol', 'pistol', 'sp', '1d10+2', 'impact', 0, [1, 0, 6], [], 'Common');
RW('autogun', 'Autogun', 'basic', 'sp', '1d10+3', 'impact', 0, [1, 3, 10], [], 'Average');
RW('stubRevolver', 'Stub Revolver', 'pistol', 'sp', '1d10+3', 'impact', 0, [1, 0, 0], ['reliable'], 'Plentiful');
RW('stubAuto', 'Stub Automatic', 'pistol', 'sp', '1d10+3', 'impact', 0, [1, 3, 0], [], 'Plentiful');
RW('handCannon', 'Hand Cannon', 'pistol', 'sp', '1d10+4', 'impact', 2, [1, 0, 0], [], 'Average');
RW('navalPistol', 'Naval Pistol', 'pistol', 'sp', '1d10+4', 'impact', 0, [1, 3, 0], ['tearing'], 'Scarce');
RW('shotgun', 'Pump-Action Shotgun', 'basic', 'sp', '1d10+4', 'impact', 0, [1, 0, 0], ['scatter'], 'Average');
RW('shotcannon', 'Naval Shotcannon', 'heavy', 'sp', '2d10+4', 'impact', 0, [1, 3, 0], ['scatter', 'unreliable'], 'Scarce');
RW('heavyStubber', 'Heavy Stubber', 'heavy', 'sp', '1d10+5', 'impact', 3, [0, 0, 10], [], 'Average');
RW('boltPistol', 'Bolt Pistol', 'pistol', 'bolt', '1d10+5', 'explosive', 4, [1, 2, 0], ['tearing'], 'Rare');
RW('boltgun', 'Boltgun', 'basic', 'bolt', '1d10+5', 'explosive', 4, [1, 2, 4], ['tearing'], 'Very Rare');
RW('stormBolter', 'Storm Bolter', 'basic', 'bolt', '1d10+5', 'explosive', 4, [1, 2, 4], ['storm', 'tearing'], 'Extremely Rare', { lootOnly: true });
RW('heavyBolter', 'Heavy Bolter', 'heavy', 'bolt', '2d10+2', 'explosive', 5, [0, 0, 10], ['tearing'], 'Very Rare');
RW('infernoPistol', 'Inferno Pistol', 'pistol', 'melta', '2d10+8', 'energy', 13, [1, 0, 0], [], 'Very Rare');
RW('meltagun', 'Meltagun', 'basic', 'melta', '2d10+8', 'energy', 13, [1, 0, 0], [], 'Rare');
RW('multiMelta', 'Multi-Melta', 'heavy', 'melta', '4d10+5', 'energy', 13, [1, 0, 0], ['blast'], 'Very Rare', { lootOnly: true });
RW('plasmaPistol', 'Plasma Pistol', 'pistol', 'plasma', '1d10+6', 'energy', 6, [1, 2, 0], ['overheat'], 'Very Rare');
RW('plasmaGun', 'Plasma Gun', 'basic', 'plasma', '1d10+7', 'energy', 6, [1, 2, 0], ['overheat'], 'Very Rare');
RW('plasmaCannon', 'Plasma Cannon', 'heavy', 'plasma', '2d10+10', 'energy', 8, [1, 0, 0], ['blast', 'overheat', 'unreliable'], 'Very Rare', { lootOnly: true });
RW('handFlamer', 'Hand Flamer', 'pistol', 'flame', '1d10+4', 'energy', 2, [1, 0, 0], ['flame'], 'Rare');
RW('flamer', 'Flamer', 'basic', 'flame', '1d10+4', 'energy', 2, [1, 0, 0], ['flame'], 'Scarce');
RW('heavyFlamer', 'Heavy Flamer', 'heavy', 'flame', '2d10+4', 'energy', 4, [1, 0, 0], ['flame'], 'Rare');
RW('lascannon', 'Man-Portable Lascannon', 'heavy', 'las', '5d10+10', 'energy', 10, [1, 0, 0], [], 'Very Rare', { lootOnly: true });
RW('crossbow', 'Crossbow', 'basic', 'primitive', '1d10', 'rending', 0, [1, 0, 0], ['primitive'], 'Common');
RW('needlePistol', 'Needle Pistol', 'pistol', 'exotic', '1d10', 'rending', 0, [1, 0, 0], ['accurate', 'toxic'], 'Very Rare');
RW('needleRifle', 'Needle Rifle', 'basic', 'exotic', '1d10', 'rending', 0, [1, 0, 0], ['accurate', 'toxic'], 'Very Rare');
RW('shurikenPistol', 'Shuriken Pistol', 'pistol', 'exotic', '1d10+2', 'rending', 4, [1, 3, 5], ['reliable'], 'Very Rare', { lootOnly: true });
RW('shurikenCatapult', 'Shuriken Catapult', 'basic', 'exotic', '1d10+4', 'rending', 6, [1, 3, 10], ['reliable'], 'Very Rare', { lootOnly: true });
RW('orkShoota', 'Ork Shoota', 'basic', 'exotic', '1d10+4', 'impact', 0, [1, 3, 10], ['unreliable'], 'Scarce');
RW('krootRifle', 'Kroot Rifle', 'basic', 'exotic', '1d10+5', 'energy', 1, [1, 2, 0], [], 'Extremely Rare', { lootOnly: true });
RW('cruxBeam', 'Crux Beam Gun', 'basic', 'exotic', '2d10+5', 'energy', 6, [1, 3, 0], ['scatter'], 'Near Unique', { lootOnly: true });
RW('digiLaser', 'Digi-laser', 'pistol', 'exotic', '1d10+3', 'energy', 7, [1, 0, 0], ['reliable'], 'Extremely Rare', { lootOnly: true, text: 'A jewelled ring that hides a needle-thin las. Counts as a pistol in the off hand.' });

// ── Melee weapons (Table 5-8) ────────────────────────────────────────────────
MW('knife', 'Knife', 'primitive', '1d5', 'rending', 0, ['primitive'], 'Abundant');
MW('sword', 'Sword', 'primitive', '1d10', 'rending', 0, ['balanced', 'primitive'], 'Common');
MW('staff', 'Staff', 'primitive', '1d10', 'impact', 0, ['balanced', 'primitive'], 'Plentiful', true);
MW('warhammer', 'Warhammer', 'primitive', '1d10+2', 'impact', 1, ['primitive'], 'Scarce');
MW('greatWeapon', 'Great Weapon', 'primitive', '2d10', 'rending', 0, ['primitive', 'unbalanced'], 'Scarce', true);
MW('shield', 'Shield', 'primitive', '1d5', 'impact', 0, ['defensive', 'primitive'], 'Common', false, { text: 'Off hand: +2 AP to body and arms, and +10 to Parry.' });
MW('monoSword', 'Mono-Sword', 'primitive', '1d10', 'rending', 2, ['balanced'], 'Average');
MW('monoKnife', 'Mono-Knife', 'primitive', '1d5', 'rending', 2, [], 'Average');
MW('chainsword', 'Chainsword', 'chain', '1d10+2', 'rending', 2, ['tearing', 'balanced'], 'Average');
MW('chainAxe', 'Chain Axe', 'chain', '1d10+4', 'rending', 2, ['tearing'], 'Average', true);
MW('cutlass', "Officer's Cutlass", 'shock', '1d10', 'rending', 0, ['shocking'], 'Scarce');
MW('shockStaff', 'Shock-Staff', 'shock', '1d5+3', 'impact', 0, ['shocking'], 'Rare', true);
MW('powerSword', 'Power Sword', 'power', '1d10+5', 'energy', 5, ['powerField', 'balanced'], 'Very Rare');
MW('powerAxe', 'Power Axe', 'power', '1d10+7', 'energy', 7, ['powerField', 'unbalanced'], 'Very Rare');
MW('powerMaul', 'Power Maul', 'power', '1d10+5', 'energy', 4, ['powerField', 'shocking'], 'Very Rare');
MW('powerFist', 'Power Fist', 'power', '2d10+4', 'energy', 9, ['powerField', 'unwieldy'], 'Very Rare');
MW('omnissianAxe', 'Omnissian Axe', 'power', '2d10+4', 'energy', 6, ['powerField', 'unbalanced'], 'Extremely Rare', true, { lootOnly: true });
MW('angevinChainsword', 'Angevin Era Chainsword', 'chain', '1d10+3', 'rending', 2, ['tearing', 'balanced'], 'Near Unique', false, { lootOnly: true, heirloom: true });
MW('ghostSword', 'Ghost Sword', 'exotic', '1d10+3', 'energy', 6, ['powerField', 'balanced'], 'Extremely Rare', false, { lootOnly: true, text: 'Eldar blade: +15 to Parry.' });
MW('fractalBlade', 'Fractal Blade', 'exotic', '1d10+1', 'rending', 7, ['powerField', 'balanced'], 'Extremely Rare', false, { lootOnly: true });
MW('orkChoppa', 'Ork Choppa', 'exotic', '1d10+1', 'rending', 2, ['unbalanced'], 'Scarce');
MW('krakenTooth', 'Kraken Tooth Dagger', 'primitive', '1d5+1', 'rending', 1, ['primitive'], 'Extremely Rare', false, { lootOnly: true });

// ── Armour (Table 5-12) and fields ──────────────────────────────────────────
AR('furs', 'Heavy Leathers', 'primitive', 2, ABL, 'Common');
AR('flakCoat', 'Flak Coat', 'flak', 3, ABL, 'Average');
AR('guardFlak', 'Guard Flak Armour', 'flak', 4, ALL, 'Scarce');
AR('xenoMesh', 'Xeno Mesh', 'mesh', 3, ABL, 'Rare');
AR('meshCloak', 'Mesh Combat Cloak', 'mesh', 4, ABL, 'Very Rare');
AR('bodyglove', 'Armoured Bodyglove', 'other', 3, ABL, 'Rare');
AR('feudalPlate', 'Feudal World Plate', 'primitive', 5, ALL, 'Scarce', { text: 'Primitive: halved against non-primitive weapons (rounded up).' });
AR('lightCarapace', 'Enforcer Light Carapace', 'carapace', 5, ALL, 'Rare');
AR('carapaceChest', 'Carapace Chestplate', 'carapace', 6, ['body'], 'Rare');
AR('stormCarapace', 'Storm Trooper Carapace', 'carapace', 6, ALL, 'Very Rare');
AR('saintCarapace', 'Saint-blessed Carapace', 'carapace', 6, ALL, 'Near Unique', { lootOnly: true, heirloom: true });
AR('lightPower', 'Light Power Armour', 'power', 7, ALL, 'Extremely Rare', { lootOnly: true });
AR('powerArmour', 'Power Armour', 'power', 8, ALL, 'Extremely Rare', { lootOnly: true });
G('refractor', 'Refractor Field', 'Very Rare', { field: 30 }, 'Force field 30: a d100 roll of 30 or under negates a hit.');
G('conversion', 'Conversion Field', 'Extremely Rare', { field: 50 }, 'Force field 50.', { lootOnly: true });
G('displacer', 'Displacer Field', 'Near Unique', { field: 55, freeRank: true }, 'Force field 55; you may switch ranks freely.', { lootOnly: true });

// ── Gear, cybernetics and relics (Tables 5-13 to 5-16) ──────────────────────
G('microBead', 'Micro-bead', 'Average', { init: 1, skills: { command: 5 } }, '+1 Initiative; +5 Command.');
G('auspex', 'Auspex', 'Scarce', { skills: { awareness: 10, search: 10 } }, '+10 Awareness and Search.');
G('combiTool', 'Combi-tool', 'Rare', { skills: { techUse: 10, security: 10 } }, '+10 Tech-Use and Security.');
G('multikey', 'Multikey', 'Scarce', { skills: { security: 10 } }, '+10 Security.');
G('medikit', 'Medikit', 'Common', { skills: { medicae: 10 } }, '+10 Medicae; rests heal more.');
G('servoSkull', 'Servo-Skull', 'Scarce', { rerolls: 1 }, 'A faithful servant\'s skull, still working: +1 reroll on your turns.');
G('psyFocus', 'Psy-focus', 'Rare', { focus: 10 }, '+10 to Focus Power Tests.');
G('photoVisor', 'Photo-visors', 'Scarce', { chars: { BS: 5 } }, '+5 Ballistic Skill.');
G('recoilGloves', 'Recoil Gloves', 'Rare', { chars: { BS: 5, WS: 5 } }, '+5 BS and WS.');
G('synskin', 'Synskin', 'Extremely Rare', { apAll: 2, skills: { silentMove: 10 } }, '+2 AP everywhere; +10 Silent Move.');
G('cameleoline', 'Cameleoline Cloak', 'Rare', { dodgeMod: 10, skills: { silentMove: 10 } }, '+10 to Dodge and Silent Move.');
G('subskin', 'Subskin Armour', 'Very Rare', { apAll: 2 }, 'Cybernetic: +2 AP everywhere.');
G('bionicHeart', 'Bionic Heart', 'Rare', { hpPct: 0.1, chars: { T: 5 } }, 'Cybernetic: +5 Toughness, +10% Wounds.');
G('muscleGrafts', 'Synthetic Muscle Grafts', 'Rare', { chars: { S: 10 } }, 'Cybernetic: +10 Strength.');
G('cortexImplant', 'Cortex Implants', 'Very Rare', { chars: { Int: 5, WP: 5 } }, 'Cybernetic: +5 Intelligence and Willpower.');
G('augmentedSenses', 'Augmented Senses', 'Rare', { chars: { Per: 10 } }, 'Cybernetic: +10 Perception.');
G('mindImpulse', 'Mind Impulse Unit', 'Rare', { skills: { techUse: 10 }, rerolls: 1 }, 'Cybernetic: +10 Tech-Use, +1 reroll.');
G('jumpPack', 'Jump Pack', 'Rare', { freeRank: true, dodgeMod: 5 }, 'Switch ranks freely; +5 Dodge.');
G('charm', 'Saint\'s Charm', 'Average', { fate: 1 }, 'A bone, a casing, a saint\'s fingernail. +1 Fate Point each expedition.');
G('baton', "Lord-Captain's Baton", 'Very Rare', { skills: { command: 10 }, chars: { Fel: 5 } }, '+5 Fellowship, +10 Command.');
G('ancestralSeal', 'Ancestral Seal', 'Near Unique', { chars: { Fel: 10 }, pf: 1 }, 'Heirloom: +10 Fellowship, +1 Profit Factor.', { lootOnly: true, heirloom: true });
G('reliquary', 'Reliquary of Saint Drusus', 'Near Unique', { chars: { WP: 10 }, fate: 1 }, 'Heirloom: +10 Willpower, +1 Fate Point each expedition.', { lootOnly: true, heirloom: true });
G('blackstoneCompass', 'Blackstone Compass', 'Near Unique', { skills: { navigation: 20, awareness: 10 } }, 'A shard of the Fortress that points back to itself. +20 Navigation, +10 Awareness.', { lootOnly: true });
G('yuvathCirclet', "Yu'Vath Circlet", 'Near Unique', { focus: 15, chars: { WP: 5 } }, 'Xenos psy-circlet. +15 Focus Power, +5 Willpower. Unclean.', { lootOnly: true });

// ── Consumables (Tables 5-6, 5-14) ───────────────────────────────────────────
C('fieldDressing', 'Field Dressing', 'Plentiful', { effect: 'heal', dice: '2d5+2', combat: true, explore: true, target: 'ally' }, 'Stop the bleeding, bind the wound.');
C('medkitCharge', 'Medicae Injector', 'Average', { effect: 'heal', dice: '2d10+4', combat: true, explore: true, target: 'ally' }, 'Counterseptic, plasma, a prayer.', { shopTier: 1 });
C('advMedikit', 'Advanced Medikit', 'Rare', { effect: 'heal', dice: '4d10+6', combat: true, explore: true, target: 'ally' }, 'Clotting foam and nerve-binders.', { shopTier: 2 });
C('stimm', 'Stimm', 'Average', { effect: 'stimm', combat: true, explore: false, target: 'self' }, '+10 Toughness and temporary Wounds for the fight.');
C('frenzon', 'Frenzon', 'Very Rare', { effect: 'frenzon', combat: true, explore: false, target: 'self' }, 'Near-suicidal aggression: Frenzy for the fight.', { shopTier: 2 });
C('detox', 'De-tox', 'Rare', { effect: 'cleanse', combat: true, explore: true, target: 'ally' }, 'Purges toxins and fire, violently.');
C('fragGrenade', 'Frag Grenade', 'Common', { effect: 'bomb', dice: '2d10', damageType: 'explosive', pen: 0, combat: true, explore: false, target: 'rank' }, 'Blast (4): hits a whole rank.');
C('krakGrenade', 'Krak Grenade', 'Rare', { effect: 'bomb', dice: '2d10+4', damageType: 'explosive', pen: 6, combat: true, explore: false, target: 'enemy' }, 'Shaped charge: Pen 6 against one foe.', { shopTier: 2 });
C('plasmaGrenade', 'Plasma Grenade', 'Very Rare', { effect: 'bomb', dice: '1d10+6', damageType: 'energy', pen: 6, combat: true, explore: false, target: 'rank' }, 'A small sun, briefly.', { shopTier: 3 });
C('photonFlash', 'Photon Flash Grenade', 'Rare', { effect: 'flash', combat: true, explore: false, target: 'enemies' }, 'Blinds every foe that fails an Agility Test.');
C('smokeGrenade', 'Smoke Grenade', 'Common', { effect: 'smoke', combat: true, explore: false, target: 'self' }, 'Break contact and fall back one room (not against a boss).');
C('rations', 'Ration Packs', 'Ubiquitous', { effect: 'camp', combat: false, explore: true, target: 'party' }, 'Lets the party take a short rest anywhere.');
C('unguents', 'Sacred Unguents', 'Very Rare', { effect: 'unguent', combat: true, explore: false, target: 'self' }, 'Propitiate the machine spirit: clear jams and gain a Fortune token.', { shopTier: 2 });
C('stasisPod', 'Chirurgeon\'s Stasis Pod', 'Extremely Rare', { effect: 'revive', combat: false, explore: true, target: 'ally' }, 'At a camp: a fallen explorer is pulled back from the brink.', { shopTier: 3 });

// ── Valuables: what the enclave actually wants ──────────────────────────────
V('orkTeef', 'Sack of Ork Teef', 'Common', 25, 'Ork currency. The enclave\'s Kroot guide takes them at a fair rate.');
V('promethium', 'Promethium Cache', 'Average', 45, 'Sealed drums of refined fuel.');
V('dataCrystal', 'Star-Chart Data-Crystal', 'Scarce', 90, 'Warp routes no living Navigator has flown.');
V('saintsBone', 'Saint\'s Finger-Bone', 'Scarce', 110, 'Attested, they say. The Missionaries pay well.');
V('xenosIdol', 'Xenos Idol', 'Rare', 160, 'Carved from no stone the Imperium knows.');
V('blackstoneShard', 'Blackstone Shard', 'Rare', 200, 'A splinter of the Fortress itself. It hums when held.');
V('archeoFragment', 'Archeotech Fragment', 'Rare', 230, 'A circuit from the Dark Age of Technology. The Mechanicus covets it.');
V('rakgolCore', "Rak'Gol Power Core", 'Very Rare', 320, 'Still warm. Still dangerous.');
V('spiritStone', 'Cracked Spirit Stone', 'Very Rare', 380, 'An Eldar soul-gem. Something moves inside.');
V('navigatorJewel', 'Navigator\'s Jewel', 'Very Rare', 420, 'A house sigil-gem, lost with its ship.');
V('cogitatorCore', 'Pre-Imperial Cogitator Core', 'Extremely Rare', 650, 'It still thinks. It should not.');
V('stasisRelic', 'Stasis-locked Artefact', 'Extremely Rare', 800, 'Sealed in a field no augur can read.');
V('yuvathRelic', "Yu'Vath Relic", 'Near Unique', 1200, 'An abomination of the vanished warp-cult empire. Worth a fortune to the wrong buyer.');

// ── craftsmanship & mods ────────────────────────────────────────────────────

export const CRAFTS: Record<Craft, { name: string; price: number; weight: number; ranged: string; melee: string; armor: string }> = {
  poor: { name: 'Poor', price: 0.5, weight: 18, ranged: 'Unreliable: jams on 91+.', melee: '-10 to attack.', armor: '-10 to Dodge.' },
  common: { name: 'Common', price: 1, weight: 46, ranged: 'As printed.', melee: 'As printed.', armor: 'As printed.' },
  good: { name: 'Good', price: 2.5, weight: 26, ranged: 'Reliable.', melee: '+5 to attack.', armor: '+1 AP.' },
  best: { name: 'Best', price: 6, weight: 10, ranged: 'Never jams or overheats.', melee: '+10 to attack, +1 Damage.', armor: '+1 AP; no Agility penalty.' },
};

export interface ModDef {
  id: string;
  name: string;
  text: string;
  /** Applies to weapon groups/classes listed (empty = any weapon). */
  ranged?: boolean;
  melee?: boolean;
  groups?: WeaponGroup[];
  hit?: number;
  pen?: number;
  dmg?: number;
  quality?: Quality;
  price: number;
  minTier: number;
}

export const MODS: Record<string, ModDef> = {
  mono: { id: 'mono', name: 'Mono', text: 'Monomolecular edge: +2 Penetration.', melee: true, groups: ['primitive'], pen: 2, price: 60, minTier: 0 },
  redDot: { id: 'redDot', name: 'Red-Dot', text: '+10 to hit with single shots.', ranged: true, hit: 10, price: 80, minTier: 0 },
  telescopic: { id: 'telescopic', name: 'Scoped', text: '+10 to hit at the back rank.', ranged: true, hit: 5, price: 70, minTier: 0 },
  motionPredictor: { id: 'motionPredictor', name: 'Motion-Predicting', text: '+10 to hit with bursts.', ranged: true, hit: 10, price: 250, minTier: 2 },
  manstopper: { id: 'manstopper', name: 'Man-Stopper', text: 'Ammunition: Penetration at least 3.', ranged: true, groups: ['sp'], pen: 3, price: 60, minTier: 0 },
  inferno: { id: 'inferno', name: 'Inferno-Loaded', text: 'Ammunition: hits may set the target on fire.', ranged: true, groups: ['bolt', 'sp'], quality: 'flame', price: 200, minTier: 2 },
  tempest: { id: 'tempest', name: 'Tempest', text: 'Ammunition: Shocking; +2 Damage against machines.', ranged: true, groups: ['bolt'], quality: 'shocking', dmg: 1, price: 300, minTier: 3 },
  hotShot: { id: 'hotShot', name: 'Hot-Shot', text: 'Overcharged cells: +1 Damage, +4 Penetration.', ranged: true, groups: ['las'], dmg: 1, pen: 4, price: 180, minTier: 1 },
  bayonet: { id: 'bayonet', name: 'Bayoneted', text: 'Melee attachment: no penalty firing into melee at the front rank.', ranged: true, hit: 0, price: 30, minTier: 0 },
  blessed: { id: 'blessed', name: 'Sanctified', text: '+1 Damage; daemons take it as Warp damage.', dmg: 1, price: 150, minTier: 1 },
  serrated: { id: 'serrated', name: 'Serrated', text: 'Tearing: roll an extra damage die and drop the lowest.', melee: true, quality: 'tearing', price: 120, minTier: 1 },
  relic: { id: 'relic', name: 'Relic-Wrought', text: 'Archeotech workmanship: +5 to hit, +1 Damage, +1 Penetration.', hit: 5, dmg: 1, pen: 1, price: 400, minTier: 3 },
};

export function modFits(m: ModDef, def: ItemDef): boolean {
  const w = def.weapon;
  if (!w) return false;
  const ranged = w.cls !== 'melee';
  if (m.ranged && !ranged) return false;
  if (m.melee && ranged) return false;
  if (m.groups && !m.groups.includes(w.group)) return false;
  return true;
}

export const CRAFT_ORDER: Craft[] = ['poor', 'common', 'good', 'best'];

export function itemName(inst: ItemInstance): string {
  const def = ITEMS[inst.defId];
  if (!def) return inst.defId;
  const craft = def.kind === 'weapon' || def.kind === 'armor' ? (inst.craft === 'common' ? '' : `${CRAFTS[inst.craft].name}-Craftsmanship `) : '';
  const mods = inst.mods.map((m) => MODS[m]?.name).filter(Boolean).join(' ');
  return `${craft}${mods ? `${mods} ` : ''}${def.name}${inst.qty && inst.qty > 1 ? ` ×${inst.qty}` : ''}`;
}

export function itemValue(inst: ItemInstance): number {
  const def = ITEMS[inst.defId];
  if (!def) return 0;
  if (def.kind === 'valuable') return (def.value ?? 0) * (inst.qty ?? 1);
  const craft = def.kind === 'weapon' || def.kind === 'armor' ? CRAFTS[inst.craft].price : 1;
  const mods = inst.mods.reduce((a, m) => a + (MODS[m]?.price ?? 0), 0);
  return Math.round((def.price * craft + mods) * (inst.qty ?? 1));
}

/** Gear sells for 40%; valuables are what the enclave wants, and sell at full value. */
export function sellValue(inst: ItemInstance): number {
  const def = ITEMS[inst.defId];
  if (def?.kind === 'valuable') return itemValue(inst);
  return Math.floor(itemValue(inst) * 0.4);
}

export function isTwoHanded(inst?: ItemInstance): boolean {
  return !!inst && !!ITEMS[inst.defId]?.weapon?.twoHanded;
}

export function availName(a: number): string {
  return AVAIL[Math.max(0, Math.min(AVAIL.length - 1, a))];
}
