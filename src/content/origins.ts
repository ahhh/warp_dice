/**
 * The Origin Path (Core Rulebook pp.16–31; Into the Storm pp.9–26), condensed.
 * Five rows: Home World → Birthright → Lure of the Void → Trials and
 * Travails → Motivation. Each row is six slots wide. A choice must sit
 * directly below the previous one or diagonally beside it (Core p.15), so
 * from slot s the next row allows s-1, s, s+1.
 *
 * Effects are mechanical where the game has a use for them; the rest show on
 * the character sheet as traits.
 */
import type { Char, SkillId } from '../engine/types.ts';
import type { Rng } from '../engine/rng.ts';

export interface OriginEffect {
  mods?: Partial<Record<Char, number>>;
  skills?: SkillId[];
  talents?: string[];
  /** Added to starting Wounds (beyond 2×TB + 1d5). */
  wounds?: number;
  fate?: number;
  pf?: number;
  insanity?: number;
  corruption?: number;
  heirloom?: boolean;
}

export interface OriginOption { name: string; text: string; effect: OriginEffect }

export interface OriginEntry {
  id: string;
  row: 0 | 1 | 2 | 3 | 4;
  slot: number;
  name: string;
  src: string;
  blurb: string;
  effect: OriginEffect;
  /** Pick one (Lure of the Void branches, "+3 WP or +3 Ag"…). */
  options?: OriginOption[];
  traits: [string, string][];
  /** Home worlds only: starting Fate by d10 (≤ roll → points). */
  fate?: [number, number][];
  its?: boolean;
}

export const ROW_NAMES = ['Home World', 'Birthright', 'Lure of the Void', 'Trials and Travails', 'Motivation'];

const O = (e: OriginEntry) => e;
const mods = (m: Partial<Record<Char, number>>): OriginEffect => ({ mods: m });
const pick = (...opts: [string, OriginEffect][]): OriginOption[] => opts.map(([name, effect]) => ({ name, text: name, effect }));

export const ORIGINS: OriginEntry[] = [
  // ── Row 1: Home World ────────────────────────────────────────────────────
  O({ id: 'deathWorld', row: 0, slot: 0, name: 'Death World', src: 'Core p.18', blurb: 'Peril and violence have always been part of your life, and you are stronger because of it.',
    effect: { mods: { S: 5, T: 5, WP: -5, Fel: -5 }, skills: ['survival'], talents: ['jaded'], wounds: 2 },
    traits: [['Paranoid', '-10 to Interaction Tests in formal surroundings.'], ['Survivor', '+10 to resist Pinning and Shock.']], fate: [[5, 2], [9, 3], [10, 4]] }),
  O({ id: 'voidBorn', row: 0, slot: 1, name: 'Void Born', src: 'Core p.19', blurb: 'Born in the deep dark between worlds. What other men fear is commonplace to you.',
    effect: { mods: { S: -5, WP: 5 }, skills: ['navigation'] },
    traits: [['Charmed', 'When you spend a Fate Point, roll 1d10: on a 9 it is not lost.'], ['Ill-omened', '-5 Fellowship with non-void born.'], ['Void Accustomed', 'Immune to void sickness; gravity shifts never disorient you.']], fate: [[5, 3], [10, 4]] }),
  O({ id: 'forgeWorld', row: 0, slot: 2, name: 'Forge World', src: 'Core p.21', blurb: 'Raised among the cerasteel spires and taught that power is knowledge incarnate.',
    effect: { mods: { WS: -5, Int: 5 }, skills: ['techUse'], talents: ['technicalKnock'], wounds: 1 },
    options: pick(['Fit for Purpose: +3 BS', { mods: { BS: 3 } }], ['Fit for Purpose: +3 T', { mods: { T: 3 } }], ['Fit for Purpose: +3 Int', { mods: { Int: 3 } }], ['Fit for Purpose: +3 Ag', { mods: { Ag: 3 } }]),
    traits: [['Fit for Purpose', '+3 to one Characteristic.'], ['Stranger to the Cult', '-10 on Tests of Imperial Creed lore.']], fate: [[5, 2], [9, 3], [10, 4]] }),
  O({ id: 'hiveWorld', row: 0, slot: 3, name: 'Hive World', src: 'Core p.22', blurb: 'A young adventurer out of the teeming spires, willing to chance all for a taste of wealth.',
    effect: { mods: { T: -5, Fel: 5 }, skills: ['techUse'], wounds: 1 },
    traits: [['Accustomed to Crowds', 'Crowds are no obstacle.'], ['Caves of Steel', 'Tech-Use is a basic skill for you.'], ['Hivebound', '-10 to Survival.'], ['Wary', '+1 to Initiative.']], fate: [[5, 2], [8, 3], [10, 4]] }),
  O({ id: 'imperialWorld', row: 0, slot: 4, name: 'Imperial World', src: 'Core p.23', blurb: 'You have seen conflict, madness or heresy, and now embark in the God-Emperor\'s name.',
    effect: { mods: { WP: 3 }, skills: ['inquiry'] },
    traits: [['Blessed Ignorance', '-5 to Forbidden Lore.'], ['Hagiography', 'Wide, shallow knowledge of the Imperium.'], ['Liturgical Familiarity', 'Raised in the tutelage of the Ecclesiarchy.']], fate: [[8, 3], [10, 4]] }),
  O({ id: 'nobleBorn', row: 0, slot: 5, name: 'Noble Born', src: 'Core p.24', blurb: 'An honourable soul aware of your duties — or a dissolute rakehell. Either way, the Warrant beckons.',
    effect: { mods: { WP: -5, Fel: 5 }, talents: ['peer'], pf: 1 },
    traits: [['Etiquette', '+10 on Interaction Tests with high authority.'], ['Legacy of Wealth', '+1 starting Profit Factor.'], ['Vendetta', 'A rival house wants you ruined.']], fate: [[5, 2], [9, 3], [10, 4]] }),
  // Into the Storm alternates
  O({ id: 'frontierWorld', row: 0, slot: 0, its: true, name: 'Frontier World', src: 'Into the Storm p.9', blurb: 'Lawless edge-of-the-map worlds where the only justice is the sort you hand out yourself.',
    effect: { mods: { S: 5, Int: -5 }, skills: ['survival'], wounds: 3 },
    traits: [['Tough as Grox-Hide', 'One additional Wound.'], ['Leery of Outsiders', '-10 Fellowship with strangers.'], ['Tenacious Survivalist', 'Re-roll Initiative.']], fate: [[5, 2], [9, 3], [10, 4]] }),
  O({ id: 'footfallen', row: 0, slot: 1, its: true, name: 'Footfallen', src: 'Into the Storm p.10', blurb: 'Raised in the crooked warrens of Footfall, where the Expanse comes to trade, drink and disappear.',
    effect: { mods: { BS: -5, T: -5, Ag: 5, Fel: 5 }, skills: ['psyniscience', 'commerce'], talents: ['peer'] },
    traits: [['Street Knowledge', 'Knows the Expanse, not the Imperium.'], ['Sixth Sense', 'Psyniscience without being a psyker.']], fate: [[5, 2], [9, 3], [10, 4]] }),
  O({ id: 'fortressWorld', row: 0, slot: 2, its: true, name: 'Fortress World', src: 'Into the Storm p.11', blurb: 'Every child raised in the shadow of the enemy and taught to kill on sight.',
    effect: { mods: { BS: 5, WP: 5, Int: -5, Fel: -5 }, talents: ['nervesOfSteel', 'hatred'], wounds: 1 },
    traits: [['Constant Combat Training', '-5 on non-combat social Tests.']], fate: [[9, 3], [10, 4]] }),
  O({ id: 'battlefleet', row: 0, slot: 3, its: true, name: 'Battlefleet', src: 'Into the Storm p.12', blurb: 'Descended from a long line of naval officers. The deck is the only ground you trust.',
    effect: { mods: { WP: 5, Fel: 3, Per: -5 }, skills: ['navigation', 'command'] },
    traits: [['Officer on Deck', '+5 to Command aboard ship.'], ['Void-Born Ancestry', 'Void Accustomed.']], fate: [[5, 2], [9, 3], [10, 4]] }),
  O({ id: 'penalWorld', row: 0, slot: 4, its: true, name: 'Penal World', src: 'Into the Storm p.13', blurb: 'You survived a prison world; the ship that came for new crew was salvation.',
    effect: { mods: { WP: -5, Per: 5, T: 5, Fel: -5 }, skills: ['security', 'intimidate'], talents: ['lightSleeper'], insanity: 3 },
    traits: [['Criminal', '-20 with the Arbites and Ecclesiarchy if found out.'], ['Nightmares', 'You never sleep well unaided.']], fate: [[8, 3], [10, 4]] }),
  O({ id: 'childOfDynasty', row: 0, slot: 5, its: true, name: 'Child of Dynasty', src: 'Into the Storm p.14', blurb: 'Born to a Rogue Trader bloodline. Every scrap of ingenuity goes to keeping the name alive.',
    effect: { mods: { T: -3, Int: 3, WP: -5, Fel: 5 }, skills: ['commerce'], pf: 1 },
    traits: [['Dynastic Warrant', 'Your name still opens doors.'], ['Honour Among Peers', '+5 Fellowship with nobility.'], ['Unseen Enemy', 'Someone covets your position.']], fate: [[5, 2], [9, 3], [10, 4]] }),

  // ── Row 2: Birthright ────────────────────────────────────────────────────
  O({ id: 'scavenger', row: 1, slot: 0, name: 'Scavenger', src: 'Core p.25', blurb: 'One soul among countless underhivers and bonepickers.',
    effect: { talents: ['resistanceFear'], corruption: 3 }, options: pick(['+3 Willpower', mods({ WP: 3 })], ['+3 Agility', mods({ Ag: 3 })]), traits: [] }),
  O({ id: 'scapegrace', row: 1, slot: 1, name: 'Scapegrace', src: 'Core p.25', blurb: 'Years lived by your wits amid entertainers, gangers and reclaimators.',
    effect: { skills: ['deceive'], insanity: 3 }, options: pick(['+3 Intelligence', mods({ Int: 3 })], ['+3 Perception', mods({ Per: 3 })]), traits: [['Sleight of Hand', 'Light fingers.']] }),
  O({ id: 'stubjack', row: 1, slot: 2, name: 'Stubjack', src: 'Core p.25', blurb: 'Born to violence, with a weapon in reach since you could grip one.',
    effect: { mods: { Fel: -5 }, talents: ['quickDraw'], skills: ['intimidate'], insanity: 3 }, options: pick(['+5 Weapon Skill', mods({ WS: 5 })], ['+5 Ballistic Skill', mods({ BS: 5 })]), traits: [] }),
  O({ id: 'childOfCreed', row: 1, slot: 3, name: 'Child of the Creed', src: 'Core p.25', blurb: 'Scripture and ritual rise unbidden in every quiet moment.',
    effect: { mods: { WS: -3 }, talents: ['unshakeableFaith'] }, options: pick(['+3 Willpower', mods({ WP: 3 })], ['+3 Fellowship', mods({ Fel: 3 })]), traits: [] }),
  O({ id: 'savant', row: 1, slot: 4, name: 'Savant', src: 'Core p.25', blurb: 'The murmuring of savants and the scent of ink and dust.',
    effect: { mods: { T: -3 }, skills: ['logic'] }, options: pick(['+3 Intelligence', mods({ Int: 3 })], ['+3 Fellowship', mods({ Fel: 3 })]), traits: [] }),
  O({ id: 'vaunted', row: 1, slot: 5, name: 'Vaunted', src: 'Core p.25', blurb: 'Fantastical exhibitions, sordid entanglements, strange drugs and hidden violence.',
    effect: { mods: { Per: -3 }, talents: ['decadence'], corruption: 3 }, options: pick(['+3 Agility', mods({ Ag: 3 })], ['+3 Fellowship', mods({ Fel: 3 })]), traits: [] }),
  O({ id: 'voidWanderer', row: 1, slot: 0, its: true, name: 'Fringe Survivor: Void Wanderer', src: 'Into the Storm p.18', blurb: 'You have been to places man was not meant to go.',
    effect: { skills: ['survival'], fate: 1, insanity: 4 }, options: pick(['+3 Toughness', mods({ T: 3 })], ['+3 Perception', mods({ Per: 3 })]), traits: [] }),
  O({ id: 'heretek', row: 1, slot: 1, its: true, name: 'Fringe Survivor: Heretek', src: 'Into the Storm p.18', blurb: 'Versed in forbidden technology, hunted for it by the Mechanicus.',
    effect: { mods: { Int: 3 }, skills: ['techUse', 'forbiddenLore'], corruption: 3 }, traits: [] }),
  O({ id: 'pitFighter', row: 1, slot: 2, its: true, name: 'Fringe Survivor: Pit-Fighter', src: 'Into the Storm p.19', blurb: 'Blood-sport arenas where gladiators fight for the masses.',
    effect: { mods: { WS: 3 }, corruption: 1 }, options: pick(['+3 Toughness', mods({ T: 3 })], ['+3 Strength', mods({ S: 3 })]), traits: [['Rival (Underworld)', 'Old arena debts.']] }),
  O({ id: 'bornToLead', row: 1, slot: 3, its: true, name: 'Born to Lead', src: 'Into the Storm p.20', blurb: 'Taken from home and taught to command.',
    effect: { skills: ['command'] }, options: pick(['+3 Willpower', mods({ WP: 3 })], ['+3 Ballistic Skill', mods({ BS: 3 })]), traits: [] }),

  // ── Row 3: Lure of the Void ──────────────────────────────────────────────
  O({ id: 'tainted', row: 2, slot: 0, name: 'Tainted', src: 'Core p.26', blurb: 'Declared vile by the holy — and yet your soul burns for greatness.', effect: {},
    options: [
      { name: 'Mutant', text: 'A minor mutation: +5 Toughness, 5 Corruption.', effect: { mods: { T: 5 }, corruption: 5 } },
      { name: 'Insane', text: '+3 Toughness, -3 Fellowship, 2d10 Insanity.', effect: { mods: { T: 3, Fel: -3 }, insanity: 11 } },
      { name: 'Deviant Philosophy', text: '+3 Willpower.', effect: { mods: { WP: 3 } } },
    ], traits: [] }),
  O({ id: 'criminal', row: 2, slot: 1, name: 'Criminal', src: 'Core p.26', blurb: 'Guilty by Imperial law, or outcast by the crime baron you once served.', effect: {},
    options: [
      { name: 'Wanted Fugitive', text: 'Peer (Underworld): +10 Commerce with traders.', effect: { talents: ['peer'] } },
      { name: 'Hunted by a Crime Baron', text: '+3 Perception.', effect: { mods: { Per: 3 } } },
      { name: 'Judged and Found Wanting', text: '-5 Fellowship; a crude bionic arm (+5 Strength).', effect: { mods: { Fel: -5, S: 5 } } },
    ], traits: [] }),
  O({ id: 'renegade', row: 2, slot: 2, name: 'Renegade', src: 'Core p.26', blurb: 'A rebellious mind that could not be constrained.', effect: {},
    options: [
      { name: 'Recidivist', text: 'Trained Silent Move.', effect: { skills: ['silentMove'] } },
      { name: 'Free-thinker', text: '+3 Intelligence, -3 Willpower.', effect: { mods: { Int: 3, WP: -3 } } },
      { name: 'Dark Visionary', text: 'Dark Soul and Forbidden Lore; 3 Corruption.', effect: { talents: ['darkSoul'], skills: ['forbiddenLore'], corruption: 3 } },
    ], traits: [] }),
  O({ id: 'dutyBound', row: 2, slot: 3, name: 'Duty Bound', src: 'Core p.27', blurb: 'A call to service that should be neither shirked nor denied.', effect: {},
    options: [
      { name: 'Duty to the Throne', text: '+3 Willpower.', effect: { mods: { WP: 3 } } },
      { name: 'Duty to Humanity', text: '+3 Perception, -1 Profit Factor.', effect: { mods: { Per: 3 }, pf: -1 } },
      { name: 'Duty to Your Dynasty', text: '-3 Toughness, +1 Profit Factor.', effect: { mods: { T: -3 }, pf: 1 } },
    ], traits: [] }),
  O({ id: 'zealot', row: 2, slot: 4, name: 'Zealot', src: 'Core p.27', blurb: 'Where others merely believe, you have certainty.', effect: {},
    options: [
      { name: 'Blessed Scars', text: 'Trained Intimidate.', effect: { skills: ['intimidate'] } },
      { name: 'Unnerving Clarity', text: '+5 Willpower, -5 Fellowship.', effect: { mods: { WP: 5, Fel: -5 } } },
      { name: 'Favoured of the Faithful', text: '+5 Fellowship, -5 Toughness.', effect: { mods: { Fel: 5, T: -5 } } },
    ], traits: [] }),
  O({ id: 'chosenByDestiny', row: 2, slot: 5, name: 'Chosen by Destiny', src: 'Core p.27', blurb: 'A grand destiny awaits you. You have always known it.', effect: {},
    options: [
      { name: 'Seeker of Truth', text: 'Foresight; -3 Willpower.', effect: { talents: ['foresight'], mods: { WP: -3 } } },
      { name: 'Xenophile', text: '+10 with xenos (trained Forbidden Lore).', effect: { skills: ['forbiddenLore'] } },
      { name: 'Fated for Greatness', text: '+1 Fate Point, 6 Insanity.', effect: { fate: 1, insanity: 6 } },
    ], traits: [] }),
  O({ id: 'hunter', row: 2, slot: 0, its: true, name: 'Hunter', src: 'Into the Storm p.21', blurb: 'Some hunt beasts, some hunt xenos, some hunt men.', effect: {},
    options: [
      { name: 'Bounty Hunter', text: '+3 WP, +3 Fel, Bloodtracker; 3 Insanity.', effect: { mods: { WP: 3, Fel: 3 }, talents: ['bloodtracker'], insanity: 3 } },
      { name: 'Xenos Hunter', text: '+3 BS and Hatred (Xenos).', effect: { mods: { BS: 3 }, talents: ['hatred'] } },
      { name: 'Hunted', text: '+3 Perception and Light Sleeper.', effect: { mods: { Per: 3 }, talents: ['lightSleeper'] } },
    ], traits: [] }),
  O({ id: 'newHorizons', row: 2, slot: 5, its: true, name: 'New Horizons', src: 'Into the Storm p.22', blurb: 'A galaxy full of the unknown, and something driving you onward.', effect: {},
    options: [
      { name: 'Seeker of Lore', text: '+3 Intelligence, Forbidden Lore; 1 Corruption.', effect: { mods: { Int: 3 }, skills: ['forbiddenLore'], corruption: 1 } },
      { name: 'Xeno-Arcanist', text: '+3 Willpower, Forbidden Lore.', effect: { mods: { WP: 3 }, skills: ['forbiddenLore'] } },
      { name: 'Archeotechnologist', text: '+3 Perception and an heirloom relic.', effect: { mods: { Per: 3 }, heirloom: true } },
    ], traits: [] }),

  // ── Row 4: Trials and Travails ───────────────────────────────────────────
  O({ id: 'handOfWar', row: 3, slot: 0, name: 'The Hand of War', src: 'Core p.27', blurb: 'Burning hulks and blasted cities. The faces of the dead haunt you still.',
    effect: { talents: ['hatred'] }, options: pick(['Ashes of War: Leap Up', { talents: ['leapUp'] }], ['Ashes of War: Quick Draw', { talents: ['quickDraw'] }]), traits: [['The Face of the Enemy', '-10 Fellowship with your sworn enemy.']] }),
  O({ id: 'pressGanged', row: 3, slot: 1, name: 'Press-ganged', src: 'Core p.28', blurb: 'You were taken and made to serve. One day your captors will regret it.',
    effect: {}, options: pick(['Unwilling Accomplice: Climb', { skills: ['climb'] }], ['Unwilling Accomplice: Dodge', { skills: ['dodge'] }], ['Unwilling Accomplice: Search', { skills: ['search'] }]), traits: [['Jealous Freedom', 'You react violently to imprisonment.']] }),
  O({ id: 'calamity', row: 3, slot: 2, name: 'Calamity', src: 'Core p.28', blurb: 'Famine, plague, disaster. A starving man cannot eat gold.',
    effect: { talents: ['lightSleeper'], pf: -1 }, options: pick(['Hardy: Sound Constitution', { talents: ['soundConstitution'] }], ['Nerves of Steel', { talents: ['nervesOfSteel'] }]), traits: [['Echo of Hard Times', '-1 starting Profit Factor.']] }),
  O({ id: 'shipLorn', row: 3, slot: 3, name: 'Ship-Lorn', src: 'Core p.28', blurb: 'Robbed of your ship and cast away. Ill-luck follows you, they whisper.',
    effect: { fate: -1 }, options: pick(['Against All Odds: Survival', { skills: ['survival'] }], ['Against All Odds: Dark Soul', { talents: ['darkSoul'] }]), traits: [['Ill-starred', '-1 Fate Point; voidfarers mistrust you.']] }),
  O({ id: 'darkVoyage', row: 3, slot: 4, name: 'Dark Voyage', src: 'Core p.28', blurb: 'You have seen the dead walk and the bulkheads bleed.',
    effect: { insanity: 3 }, options: pick(['Forbidden Lore', { skills: ['forbiddenLore'] }], ['Resistance (Fear)', { talents: ['resistanceFear'] }]), traits: [['Marked by Darkness', '1d5 Insanity.']] }),
  O({ id: 'highVendetta', row: 3, slot: 5, name: 'High Vendetta', src: 'Core p.29', blurb: 'A murderous feud consumed your life. You would fight it again.',
    effect: { skills: ['inquiry'] }, options: pick(['Die Hard', { talents: ['dieHard'] }], ['Paranoia: Light Sleeper', { talents: ['lightSleeper'] }]), traits: [['Brook No Insult', 'No offence goes unchallenged.']] }),
  O({ id: 'lostClaim', row: 3, slot: 2, its: true, name: 'Lost Worlds: A Lost Claim', src: 'Into the Storm p.24', blurb: 'You found a lost dynasty\'s world and seized it for your family.',
    effect: { pf: 1, fate: 1 }, traits: [] }),
  O({ id: 'darkSecret', row: 3, slot: 5, its: true, name: 'Dark Secret', src: 'Into the Storm p.24', blurb: 'Something terrible gave you a great advantage — and a secret that could ruin you.',
    effect: { insanity: 3 }, options: pick(['+6 Weapon Skill', mods({ WS: 6 })], ['+6 Ballistic Skill', mods({ BS: 6 })], ['+6 Willpower', mods({ WP: 6 })], ['+6 Fellowship', mods({ Fel: 6 })]), traits: [['Dark Secret', 'Something rare and dangerous could free you of it.']] }),

  // ── Row 5: Motivation ────────────────────────────────────────────────────
  O({ id: 'endurance', row: 4, slot: 0, name: 'Endurance', src: 'Core p.29', blurb: 'Opposition, risk and pain are old friends.', effect: { wounds: 1 }, traits: [] }),
  O({ id: 'fortune', row: 4, slot: 1, name: 'Fortune', src: 'Core p.29', blurb: 'Everything comes down to Thrones. You must have them.', effect: { fate: 1 }, traits: [] }),
  O({ id: 'vengeance', row: 4, slot: 2, name: 'Vengeance', src: 'Core p.29', blurb: 'Revenge gnaws at you and shadows your every action.', effect: { talents: ['hatred'] }, traits: [] }),
  O({ id: 'renown', row: 4, slot: 3, name: 'Renown', src: 'Core p.29', blurb: 'Your name will be spoken by multitudes yet unborn.', effect: {},
    options: pick(['Air of Authority', { talents: ['airOfAuthority'] }], ['Peer (Traders)', { talents: ['peer'] }]), traits: [] }),
  O({ id: 'pride', row: 4, slot: 4, name: 'Pride', src: 'Core p.29', blurb: 'No insult to your honour goes unchallenged.', effect: {},
    options: pick(['An heirloom', { heirloom: true }], ['+3 Toughness', mods({ T: 3 })]), traits: [] }),
  O({ id: 'prestige', row: 4, slot: 5, name: 'Prestige', src: 'Core p.30', blurb: 'You climb the ladder of the Imperium\'s grand hierarchy.', effect: {},
    options: pick(['Talented (Commerce)', { talents: ['talented'] }], ['Peer (Traders)', { talents: ['peer'] }]), traits: [] }),
  O({ id: 'devotionCreed', row: 4, slot: 0, its: true, name: 'Devotion: Creed', src: 'Into the Storm p.26', blurb: 'Faith is your shield and your sword.', effect: { skills: ['charm'], talents: ['inspireWrath'] }, traits: [] }),
  O({ id: 'devotionDuty', row: 4, slot: 3, its: true, name: 'Devotion: Duty', src: 'Into the Storm p.26', blurb: 'To labour is human, to serve divine. You fear only failure.',
    effect: { mods: { WP: 3 } }, options: pick(['Armour of Contempt', { talents: ['armourOfContempt'] }], ['Unshakeable Faith', { talents: ['unshakeableFaith'] }]), traits: [] }),
];

export const ORIGIN_BY_ID: Record<string, OriginEntry> = Object.fromEntries(ORIGINS.map((o) => [o.id, o]));

export function rowEntries(row: number): OriginEntry[] {
  return ORIGINS.filter((o) => o.row === row);
}

/** Legal choices in `row` given the previous row's slot (none for row 0). */
export function legalAt(row: number, prevSlot?: number): OriginEntry[] {
  return rowEntries(row).filter((o) => prevSlot === undefined || Math.abs(o.slot - prevSlot) <= 1);
}

/** A whole legal path, chosen at random (with option indices). */
export function randomPath(rng: Rng, prefer?: string[]): { ids: string[]; opts: number[] } {
  const ids: string[] = [];
  const opts: number[] = [];
  let slot: number | undefined;
  for (let row = 0; row < 5; row++) {
    const legal = legalAt(row, slot);
    const want = legal.filter((o) => prefer?.includes(o.id));
    const pick = want.length ? rng.pick(want) : rng.pick(legal);
    ids.push(pick.id);
    opts.push(pick.options ? rng.int(0, pick.options.length - 1) : -1);
    slot = pick.slot;
  }
  return { ids, opts };
}

export function validPath(ids: string[]): string | null {
  if (ids.length !== 5) return 'An Origin Path has five steps.';
  let slot: number | undefined;
  for (let row = 0; row < 5; row++) {
    const o = ORIGIN_BY_ID[ids[row]];
    if (!o || o.row !== row) return `Step ${row + 1} must be a ${ROW_NAMES[row]}.`;
    if (slot !== undefined && Math.abs(o.slot - slot) > 1) return `${o.name} is not reachable from the previous step (move at most one column).`;
    slot = o.slot;
  }
  return null;
}

// ── Heirlooms (Core Table 1–2) ──────────────────────────────────────────────

export const HEIRLOOMS = [
  { id: 'heirloomLaspistol', name: 'Archeotech Laspistol', text: 'A weapon of unknown origin and great antiquity.' },
  { id: 'heirloomChainsword', name: 'Angevin Era Chainsword', text: 'Crusade purity seals and kill-marks from the cleansing of the Drusus Marches.' },
  { id: 'ancestralSeal', name: 'Ancestral Seal', text: '+10 to Interaction Tests with Imperial citizens.' },
  { id: 'heirloomCarapace', name: 'Saint-blessed Carapace', text: 'Armour of a saint\'s honour-guard, anointed and inscribed.' },
  { id: 'reliquary', name: 'Reliquary of Saint Drusus', text: 'A void-steel canister holding a true relic of the saint.' },
];

// ── Names and colour (generator tables; constructed High Gothic names) ─────

export const NAMES = {
  fore: ['Anselm', 'Bastian', 'Caspar', 'Corvin', 'Dorn', 'Ederick', 'Fabricius', 'Gaius', 'Halric', 'Idris', 'Jaraz', 'Kaltos', 'Lucan', 'Maximilian', 'Nikolus', 'Orlem', 'Piers', 'Quintus', 'Ravan', 'Solomon', 'Tiber', 'Urias', 'Valen', 'Wolfram', 'Yorick', 'Zephran', 'Aurelian', 'Cassian', 'Erastus', 'Faustus', 'Ignatius', 'Konrad', 'Leontius', 'Marek', 'Octavian', 'Sevren', 'Theodric',
    'Adriana', 'Beatrix', 'Calliope', 'Damaris', 'Eleusa', 'Fortuna', 'Gessa', 'Helewise', 'Ilyana', 'Kestria', 'Lucrezia', 'Malika', 'Noctua', 'Oriane', 'Persis', 'Quilla', 'Rosamund', 'Thessaly', 'Verity', 'Xanthe', 'Yevgenia', 'Zelia', 'Constanza', 'Dagmar', 'Elspeth', 'Hypatia', 'Isaura', 'Jocasta', 'Lisbet', 'Morrigan', 'Perpetua', 'Ravenna', 'Seraphine', 'Ulrike', 'Vasilisa',
    'Aran', 'Cassiel', 'Hesper', 'Lark', 'Nix', 'Perren', 'Quill', 'Rune', 'Sable', 'Tallis', 'Vale', 'Wren'],
  dynasty: ['Aramanth', 'Baudolino', 'Chorda', 'Dellascour', 'Ehrlend', 'Haarlock', 'Ixaneth', 'Jarnovar', 'Locque', 'Malegant', 'Orleans', 'Pelagius', 'Quarnhollow', 'Rathbone', 'Saphrax', 'Tybalt', 'Ulvenwald', 'Vantorre', 'Xerxine', 'Ythan', 'Brekhov', 'Casimir', 'Draque', 'Erkhart', 'Farvenne', 'Hexley', 'Jaeggen', 'Lermentov', 'Ostrovia', 'Perrault', 'Rusteau', 'Sarvus', 'Thalassa', 'Verrault', 'Wrothe'],
  lowborn: ['Ash', 'Bilge', 'Cinder', 'Drege', 'Ember', 'Flint', 'Grit', 'Hob', 'Ink', 'Jack', 'Knock', 'Lock', 'Mott', 'Nub', 'Ore', 'Pitch', 'Quench', 'Rust', 'Slag', 'Tar', 'Umber', 'Vent', 'Wick', 'Yarn', 'Zed'],
  lowSurname: ['Grimm', 'Vasker', 'Odum', 'Pell', 'Thresh', 'Vane', 'Karrow', 'Bex', 'Durn', 'Speight', 'Loom', 'Crane', 'Ferric', 'Aldwych', 'Prine', 'Skarr', 'Halloway', 'Bunt', 'Reeve', 'Tolliver', 'Nack', 'Culp', 'Drexel', 'Marrow', 'Stoke', 'Venn', 'Wrack'],
  ships: ['Gilded Penitence', 'Vigil of Saint Drusus', 'Unbowed Ledger', 'Argent Promise', 'Covenant of Thrones', 'Last Light of Vantorre', 'Remembrancer\'s Debt', 'Aurum Tenebrae'],
  derelicts: ['Rust-Saint', 'Sorrowful Margin', 'Bilge Psalm', 'Lady Pennywise', 'Creaking Tithe', 'Ninth Mortgage', 'Hollow Ledger'],
};

export const APPEARANCE = {
  build: ['gaunt and wire-thin', 'broad and slab-shouldered', 'stooped', 'unnaturally tall', 'compact and heavy-set', 'rangy', 'corpulent and unhurried', 'whip-lean'],
  mark: ['ritual scarification across both forearms', 'a chem-burn down one cheek', 'purity seals wax-stamped to the collar', 'a hive gang tattoo, half-erased', 'void-pallor no sun has touched', 'cogitator ports along the spine', 'a livery coat two centuries out of fashion', 'fingers stained with counting-ink', 'one eye replaced with a brass augmetic'],
  manner: ['speaks slowly, and only once', 'laughs at the wrong moments', 'never sits with their back to a door', 'quotes scripture as punctuation', 'counts things aloud without noticing', 'addresses everyone by rank', 'goes very quiet before violence', 'keeps touching the bulkheads'],
};

/** Names for anyone not of a Warrant-holding line. */
export function crewName(rng: Rng, taken: Iterable<string>, noble = false): string {
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  for (let i = 0; i < 200; i++) {
    const n = noble || rng.chance(0.55) ? `${rng.pick(NAMES.fore)} ${rng.pick(noble ? NAMES.dynasty : NAMES.lowSurname)}` : `${rng.pick(NAMES.lowborn)} ${rng.pick(NAMES.lowSurname)}`;
    if (!used.has(n.toLowerCase())) return n;
  }
  let k = 2;
  const base = `${rng.pick(NAMES.fore)} ${rng.pick(NAMES.lowSurname)}`;
  while (used.has(`${base} ${k}`.toLowerCase())) k++;
  return `${base} ${k}`;
}

export function lookFor(rng: Rng): string {
  return `${rng.pick(APPEARANCE.build)}, ${rng.pick(APPEARANCE.mark)}; ${rng.pick(APPEARANCE.manner)}`;
}
