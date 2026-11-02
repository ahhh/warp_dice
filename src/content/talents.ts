/**
 * Talents (Core Rulebook ch. IV, paraphrased). Only Talents with an effect in
 * this game are listed; each records how it is translated:
 *   exact    — same math as the tabletop rule
 *   adapted  — translated to ranks, menus or the Fortune tray
 *   narrative— flavour; shows on the sheet and helps events
 */
import type { Char } from '../engine/types.ts';

export type Impl = 'exact' | 'adapted' | 'narrative';

export interface TalentDef {
  id: string;
  name: string;
  text: string;
  impl: Impl;
  cost: number;
  /** Characteristic prerequisites. */
  req?: Partial<Record<Char, number>>;
  /** Other talents required. */
  needs?: string[];
}

const T = (id: string, name: string, cost: number, impl: Impl, text: string, req?: Partial<Record<Char, number>>, needs?: string[]): TalentDef => ({ id, name, cost, impl, text, req, needs });

export const TALENTS: Record<string, TalentDef> = Object.fromEntries([
  // Command and presence
  T('airOfAuthority', 'Air of Authority', 200, 'adapted', 'Command reaches the whole party: your Rally order affects every ally.', { Fel: 30 }),
  T('masterAndCommander', 'Master & Commander', 500, 'adapted', 'Once per combat, conjure a copy of any tray die (your orders reshape the battle).', { Fel: 40 }, ['airOfAuthority']),
  T('intoTheJaws', 'Into the Jaws of Hell', 500, 'adapted', 'You and your allies are immune to Fear while you stand.', { WP: 50 }, ['ironDiscipline']),
  T('ironDiscipline', 'Iron Discipline', 200, 'adapted', 'Allies gain +10 to Willpower Tests against Fear.', { WP: 30 }),
  T('renownedWarrant', 'Renowned Warrant', 300, 'adapted', '+1 Profit Factor while you lead; the enclave trades more freely with you.', { Fel: 35 }),
  T('peer', 'Peer (Traders)', 100, 'narrative', '+10 to Commerce and Charm in the enclave and at fortress traders.', { Fel: 30 }),
  T('decadence', 'Decadence', 100, 'narrative', 'Immune to the worst of the fortress\'s strange vapours (resist poison).', { T: 30 }),
  // Combat: melee
  T('swiftAttack', 'Swift Attack', 400, 'exact', 'Attack twice in melee with the Multiple Attacks action.', { WS: 35 }),
  T('lightningAttack', 'Lightning Attack', 600, 'exact', 'Attack three times in melee with the Multiple Attacks action.', { WS: 45 }, ['swiftAttack']),
  T('crushingBlow', 'Crushing Blow', 400, 'exact', '+2 Damage with melee weapons.', { WS: 40 }),
  T('counterAttack', 'Counter Attack', 300, 'adapted', 'After a successful Parry, strike back immediately.', { WS: 40 }),
  T('wallOfSteel', 'Wall of Steel', 300, 'exact', 'An extra Parry each round.', { Ag: 35 }),
  T('blademaster', 'Blademaster', 400, 'adapted', 'Re-roll one missed melee attack Test each turn.', { WS: 30 }),
  T('frenzy', 'Frenzy', 300, 'exact', 'Enter Frenzy: +10 WS, S and T, cannot Parry, Dodge or retreat.', {}),
  T('hatred', 'Hatred (Xenos)', 200, 'exact', '+10 WS against xenos foes.', {}),
  // Combat: ranged
  T('mightyShot', 'Mighty Shot', 400, 'exact', '+2 Damage with ranged weapons.', { BS: 40 }),
  T('deadeyeShot', 'Deadeye Shot', 300, 'exact', 'Called Shots suffer only -10 instead of -20.', { BS: 30 }),
  T('sureStrike', 'Sure Strike', 300, 'exact', 'Called Shots in melee suffer only -10.', { WS: 30 }),
  T('gunslinger', 'Gunslinger', 500, 'exact', 'Fire a pistol in each hand without penalty as one attack.', { BS: 40 }, ['twoWeaponWielder']),
  T('twoWeaponWielder', 'Two-Weapon Wielder', 200, 'adapted', 'Your off-hand weapon adds a second attack to the Multiple Attacks action.', { WS: 35, BS: 35 }),
  T('rapidReload', 'Rapid Reload', 200, 'adapted', 'Clearing a jam is a Half Action instead of a Full.', {}),
  T('marksman', 'Marksman', 300, 'adapted', 'No penalty for shooting at the back rank.', { BS: 35 }),
  T('quickDraw', 'Quick Draw', 100, 'adapted', 'Your first attack each combat is a free Half Action.', {}),
  // Defence and endurance
  T('soundConstitution', 'Sound Constitution', 100, 'exact', '+1 Wound (scaled). May be taken repeatedly.', {}),
  T('trueGrit', 'True Grit', 300, 'exact', 'Halve Critical Damage taken (rounding up).', { T: 40 }),
  T('dieHard', 'Die Hard', 200, 'exact', 'Re-roll failed Toughness Tests against Blood Loss (bleeding stops more easily).', { WP: 40 }),
  T('nervesOfSteel', 'Nerves of Steel', 200, 'exact', 'Re-roll failed Willpower Tests to avoid Pinning.', {}),
  T('resistanceFear', 'Resistance (Fear)', 100, 'exact', '+10 to Willpower Tests against Fear.', {}),
  T('jaded', 'Jaded', 200, 'exact', 'Mundane horrors cause no Insanity.', { WP: 30 }),
  T('leapUp', 'Leap Up', 100, 'exact', 'Stand from prone as a Free Action.', { Ag: 30 }),
  T('rapidReaction', 'Rapid Reaction', 200, 'exact', '+2 Initiative.', { Ag: 40 }),
  T('lightningReflexes', 'Lightning Reflexes', 300, 'exact', 'Roll Initiative twice and take the higher.', {}),
  T('catfall', 'Catfall', 100, 'narrative', 'Halve falling damage; +10 to Acrobatics.', { Ag: 30 }),
  T('lightSleeper', 'Light Sleeper', 100, 'adapted', 'Ambushes never catch you unaware (no surprise round).', { Per: 30 }),
  // Faith
  T('pureFaith', 'Pure Faith', 200, 'exact', 'Once per combat, spend a Fate Point to ignore a hit entirely.', { WP: 35 }),
  T('unshakeableFaith', 'Unshakeable Faith', 100, 'exact', 'Re-roll failed Tests against Fear.', { WP: 30 }),
  T('divineMinistration', 'Divine Ministration', 400, 'adapted', 'Your Exhortation heals allies as well as inspiring them.', { WP: 35 }, ['pureFaith']),
  T('inspireWrath', 'Inspire Wrath', 300, 'adapted', 'Your Exhortation grants allies Frenzy (+10 WS) instead of Inspired.', { Fel: 35 }),
  T('armourOfContempt', 'Armour of Contempt', 300, 'exact', 'Halve Corruption gained (rounding down).', { WP: 40 }),
  T('cleanseAndPurify', 'Cleanse and Purify', 300, 'adapted', 'Flame weapons ignite every foe they hit.', { BS: 30 }),
  // Tech
  T('logisImplant', 'Logis Implant', 200, 'adapted', '+10 to Logic and Tech-Use; analyse foes for +10 to hit.', {}),
  T('technicalKnock', 'Technical Knock', 100, 'adapted', 'Clear a jam with a Free Action once per turn.', { Int: 30 }),
  T('electroGraftUse', 'Electro Graft Use', 200, 'narrative', 'Interface with fortress data-ports: +10 Tech-Use.', {}),
  T('luminenCharge', 'Luminen Charge', 300, 'adapted', 'Discharge stored power as a Shocking melee strike.', { T: 35 }),
  T('prosanguine', 'Prosanguine', 300, 'adapted', 'Once per combat, Tech-Use Test to heal Wounds.', { T: 35 }),
  T('mechadendriteUse', 'Mechadendrite Use (Utility)', 400, 'adapted', 'A third arm: +1 reroll on your turns.', {}),
  // Psychic and warp
  T('psyRating2', 'Psy Rating 2', 0, 'exact', 'Psychic strength 2.', {}),
  T('psyRating3', 'Psy Rating 3', 400, 'exact', 'Psychic strength 3.', {}, ['psyRating2']),
  T('psyRating4', 'Psy Rating 4', 600, 'exact', 'Psychic strength 4.', {}, ['psyRating3']),
  T('psyRating5', 'Psy Rating 5', 800, 'exact', 'Psychic strength 5.', {}, ['psyRating4']),
  T('psychicTechnique', 'Psychic Technique', 200, 'adapted', 'Learn one further psychic technique (choose in the Advancement screen).', {}),
  T('warpSense', 'Warp Sense', 200, 'adapted', 'Sense warp entities: +10 to Focus Power Tests against daemons and psykers.', { Per: 30 }),
  T('warpAffinity', 'Warp Affinity', 400, 'adapted', '+5 to Focus Power Tests; Psychic Phenomena table rolls -10.', { WP: 40 }),
  T('navigator', 'Navigator', 0, 'exact', 'A third eye that sees the warp. Unlocks Navigator Powers.', {}),
  T('navigatorPower', 'Navigator Power', 300, 'adapted', 'Learn another Navigator Power, or raise one to Adept/Master.', {}),
  T('darkSoul', 'Dark Soul', 200, 'adapted', 'Halve Insanity from Malignancy (resist Corruption fallout).', { T: 30 }),
  // Insight
  T('foresight', 'Foresight', 200, 'adapted', 'See the next die in the bag; +10 to Logic and Scrutiny.', { Int: 30 }),
  T('totalRecall', 'Total Recall', 100, 'narrative', '+10 to Forbidden Lore and Navigation.', { Int: 30 }),
  T('unremarkable', 'Unremarkable', 100, 'adapted', 'Foes are less likely to target you (lower threat).', {}),
  T('talented', 'Talented (Commerce)', 100, 'exact', '+10 to Commerce.', {}),
  T('heightenedSenses', 'Heightened Senses', 100, 'exact', '+10 to Awareness.', {}),
  T('ambidextrous', 'Ambidextrous', 100, 'exact', 'No -20 off-hand penalty.', { Ag: 30 }),
  T('bloodtracker', 'Bloodtracker', 200, 'adapted', '+20 to hit foes below half Wounds.', {}),
].map((t) => [t.id, t]));

/** The Psy Rating a set of talents grants. */
export function psyRatingOf(talents: string[]): number {
  for (const n of [5, 4, 3, 2]) if (talents.includes(`psyRating${n}`)) return n;
  return 0;
}
