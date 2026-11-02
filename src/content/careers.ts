/**
 * The eight Career Paths (Core Rulebook ch. II, pp.36–72), condensed to what
 * this game uses: the Characteristic Advance scheme (cost ladders straight from
 * the book), starting skills, talents and kit, the skills and talents a career
 * may buy, and one signature feature per Rank 1–8.
 *
 * Rank features translate career abilities into combat menu options and
 * passives; each is tagged exact / adapted / narrative like the talents.
 */
import type { CareerId, Char, Craft, Material, Rank, SkillId } from '../engine/types.ts';
import type { Impl } from './talents.ts';
import type { WeaponClass } from './items.ts';

export interface FeatureDef {
  id: string;
  name: string;
  text: string;
  impl: Impl;
  /** Choose one talent from the career list as a Rank Boon. */
  choice?: 'talent';
}

export interface CareerDef {
  id: CareerId;
  name: string;
  src: string;
  tagline: string;
  summary: string;
  color: string;
  material: Material;
  /** XP cost of the 1st/2nd/3rd/4th +5 advance per Characteristic. */
  adv: Record<Char, [number, number, number, number]>;
  /** Highest priority first; used to arrange rolled Characteristics. */
  priority: Char[];
  skills: SkillId[];
  talents: string[];
  /** Skills this career may buy. */
  careerSkills: SkillId[];
  /** Talents this career may buy, with the Rank they unlock at. */
  careerTalents: [string, number][];
  training: WeaponClass[];
  kit: [string, Craft][];
  /** Preferred origin home worlds (for random generation). */
  homeWorlds: string[];
  psyker?: boolean;
  navigator?: boolean;
  defaultRank: Rank;
  features: Record<number, FeatureDef[]>;
  fortuneTalent: { name: string; text: string };
  posts: string[];
}

const A = (...c: number[][]): CareerDef['adv'] => {
  const keys: Char[] = ['WS', 'BS', 'S', 'T', 'Ag', 'Int', 'Per', 'WP', 'Fel'];
  return Object.fromEntries(keys.map((k, i) => [k, c[i] as [number, number, number, number]])) as CareerDef['adv'];
};
const L1 = [100, 250, 500, 750], L2 = [250, 500, 750, 1000], L3 = [500, 750, 1000, 2500];
const boon = (): FeatureDef => ({ id: 'rankBoon', name: 'Rank Boon', text: 'Choose a free Talent from your career list.', impl: 'adapted', choice: 'talent' });
const hardened = (r: number): FeatureDef => ({ id: `hardened${r}`, name: 'Hardened', text: '+1 Fate Point (maximum).', impl: 'adapted' });

export const CAREERS: Record<CareerId, CareerDef> = {
  rogueTrader: {
    id: 'rogueTrader', name: 'Rogue Trader', src: 'Core p.40', tagline: 'Master of starships, leader, diplomat and rogue.',
    summary: 'A leader who bends the battle (and the dice) to their will. Commands, marks targets and makes the bold play.',
    color: '#c08a2e', material: 'aquila',
    adv: A(L1, L2, L3, L3, L2, L1, L2, L2, L1), priority: ['Fel', 'WS', 'BS', 'T', 'WP', 'Ag', 'Int', 'Per', 'S'],
    skills: ['command', 'commerce', 'charm', 'evaluate'],
    talents: ['airOfAuthority'],
    careerSkills: ['command', 'commerce', 'charm', 'evaluate', 'deceive', 'dodge', 'intimidate', 'scrutiny', 'search', 'security', 'navigation', 'techUse', 'forbiddenLore', 'inquiry'],
    careerTalents: [['quickDraw', 1], ['ironDiscipline', 1], ['jaded', 1], ['leapUp', 1], ['soundConstitution', 1], ['resistanceFear', 2], ['decadence', 2], ['foresight', 2], ['renownedWarrant', 2], ['rapidReaction', 3], ['crushingBlow', 3], ['swiftAttack', 3], ['twoWeaponWielder', 3], ['masterAndCommander', 4], ['gunslinger', 4], ['intoTheJaws', 5], ['blademaster', 5], ['lightningAttack', 6], ['counterAttack', 4], ['sureStrike', 5], ['lightSleeper', 2], ['peer', 1]],
    training: ['pistol', 'melee', 'basic', 'thrown'], kit: [['laspistol', 'best'], ['monoSword', 'best'], ['lightCarapace', 'common'], ['microBead', 'common']],
    homeWorlds: ['hiveWorld', 'imperialWorld', 'nobleBorn', 'voidBorn', 'childOfDynasty'], defaultRank: 'back',
    fortuneTalent: { name: 'Speculate', text: 'Once per turn, pay 1 scrip for +1 reroll. Fortune favours the investor.' },
    posts: ['Lord-Captain', 'Warrant-Holder', 'Master of the Dynasty'],
    features: {
      1: [{ id: 'rally', name: 'Command: Rally', text: 'Command Test (Half Action): allies are Inspired (+10 to all Tests) for 2 rounds and shake off Fear. With Air of Authority, every ally; otherwise allies in your rank.', impl: 'adapted' },
        { id: 'lordCaptainFate', name: 'The Warrant\'s Weight', text: 'The Lord-Captain has +4 Wounds and +1 Fate Point every venture: the Dynasty cannot afford to lose them.', impl: 'adapted' }],
      2: [{ id: 'markTarget', name: 'Command: Concentrate Fire', text: 'Command Test (Half Action): mark a foe. Allies gain +10 to hit it, and relics that favour Marked targets wake.', impl: 'adapted' }, boon()],
      3: [hardened(3)],
      4: [{ id: 'masterStroke', name: 'Master Stroke', text: 'Once per combat (Free): your next attack Test passes with 3 Degrees of Success.', impl: 'adapted' }, boon()],
      5: [{ id: 'inspiringPresence', name: 'Inspiring Presence', text: 'Allies gain +5 Willpower while you stand.', impl: 'adapted' }],
      6: [{ id: 'claimTheField', name: 'Claim the Field', text: 'Once per combat (Full Action): every ally regains 20% of their Wounds and the party gains +1 reroll this turn.', impl: 'adapted' }, boon()],
      7: [hardened(7)],
      8: [{ id: 'legend', name: 'Legend of the Expanse', text: 'Your name opens every door: +1 Profit Factor and +10 Fellowship.', impl: 'adapted' }, boon()],
    },
  },
  archMilitant: {
    id: 'archMilitant', name: 'Arch-militant', src: 'Core p.44', tagline: 'Warrior without peer, leader of soldiers.',
    summary: 'The party\'s gun and blade. Trained with everything; suppresses ranks and hits hardest.',
    color: '#9fb2c4', material: 'adamant',
    adv: A(L2, L1, L1, L2, L1, L3, L3, L3, L2), priority: ['BS', 'WS', 'T', 'Ag', 'S', 'Per', 'WP', 'Fel', 'Int'],
    skills: ['dodge', 'intimidate'],
    talents: ['soundConstitution'],
    careerSkills: ['dodge', 'intimidate', 'awareness', 'acrobatics', 'medicae', 'survival', 'climb', 'search', 'command'],
    careerTalents: [['quickDraw', 1], ['rapidReload', 1], ['leapUp', 1], ['soundConstitution', 1], ['crushingBlow', 1], ['mightyShot', 1], ['twoWeaponWielder', 1], ['deadeyeShot', 2], ['swiftAttack', 2], ['trueGrit', 2], ['marksman', 2], ['ambidextrous', 2], ['bloodtracker', 2], ['nervesOfSteel', 1], ['gunslinger', 3], ['lightningAttack', 4], ['counterAttack', 3], ['wallOfSteel', 4], ['frenzy', 3], ['dieHard', 3], ['hatred', 1], ['lightningReflexes', 4], ['rapidReaction', 2]],
    training: ['pistol', 'basic', 'melee', 'thrown', 'heavy'], kit: [['hellgun', 'good'], ['monoSword', 'good'], ['lightCarapace', 'common'], ['medikit', 'common']],
    homeWorlds: ['deathWorld', 'forgeWorld', 'hiveWorld', 'voidBorn', 'fortressWorld', 'frontierWorld'], defaultRank: 'front',
    fortuneTalent: { name: 'Steady Aim', text: 'Once per turn, nudge one tray die up or down by 1.' },
    posts: ['Master-at-Arms', 'Commander of Armsmen', 'Champion of the Dynasty'],
    features: {
      1: [{ id: 'suppress', name: 'Suppressing Fire', text: 'Full Action with a semi- or full-auto weapon: -20 BS, every foe in a rank is hit; those failing Willpower are Pinned.', impl: 'adapted' },
        { id: 'weaponMaster', name: 'Weapon Master', text: 'Trained with every weapon class; +5 to hit.', impl: 'adapted' }],
      2: [boon()],
      3: [{ id: 'hardTarget', name: 'Guarded Stance', text: 'Guard grants an extra Reaction and +10 to Dodge and Parry until your next turn.', impl: 'adapted' }],
      4: [boon(), hardened(4)],
      5: [{ id: 'killingRhythm', name: 'Killing Rhythm', text: 'Once per turn, a kill grants another Fortune play.', impl: 'adapted' }],
      6: [boon()],
      7: [{ id: 'unrelenting', name: 'Unrelenting', text: 'Bursts gain +1 Rate of Fire; Critical Damage against you is halved.', impl: 'adapted' }],
      8: [boon(), hardened(8)],
    },
  },
  astropath: {
    id: 'astropath', name: 'Astropath Transcendent', src: 'Core p.48', tagline: 'Communicator of the Imperium, soul-bound psyker.',
    summary: 'Blinded by the soul-binding and granted sight in return. A psyker whose techniques shatter minds and turn blows.',
    color: '#7a63b8', material: 'warp', psyker: true,
    adv: A(L3, L3, L2, L2, L2, L1, L2, L1, L3), priority: ['WP', 'Per', 'Int', 'T', 'Ag', 'Fel', 'BS', 'WS', 'S'],
    skills: ['awareness', 'psyniscience', 'invocation', 'forbiddenLore'],
    talents: ['psyRating2', 'heightenedSenses'],
    careerSkills: ['awareness', 'psyniscience', 'invocation', 'forbiddenLore', 'scrutiny', 'logic', 'inquiry', 'dodge'],
    careerTalents: [['psychicTechnique', 1], ['soundConstitution', 1], ['resistanceFear', 1], ['jaded', 1], ['darkSoul', 2], ['foresight', 2], ['warpSense', 2], ['psyRating3', 2], ['totalRecall', 2], ['warpAffinity', 3], ['psyRating4', 4], ['psyRating5', 6], ['unshakeableFaith', 2]],
    training: ['pistol', 'melee'], kit: [['laspistol', 'best'], ['staff', 'common'], ['guardFlak', 'common'], ['psyFocus', 'common']],
    homeWorlds: ['hiveWorld', 'imperialWorld', 'voidBorn'], defaultRank: 'back',
    fortuneTalent: { name: 'Astral Sight', text: 'Once per turn, swap a tray die with the next die in the bag (you see it before you take it).' },
    posts: ['Astropath Prime', 'Master of the Choir', 'Voice of the Warrant'],
    features: {
      1: [{ id: 'soulBound', name: 'Soul-Bound to the Emperor', text: 'A Sanctioned psyker: Fettered use never risks Phenomena; you cannot be Blinded.', impl: 'adapted' },
        { id: 'psychicTechniques', name: 'Psychic Techniques', text: 'Telepathy, Divination and Telekinesis. Focus Power: Willpower +5 per effective Psy Rating.', impl: 'exact' }],
      2: [boon()],
      3: [{ id: 'astralTelepathy', name: 'Astral Telepathy', text: 'Your sendings guide the party: +1 tray size.', impl: 'adapted' }],
      4: [boon(), hardened(4)],
      5: [{ id: 'masterPsyker', name: 'Seasoned Psyker', text: '+10 to Focus Power Tests.', impl: 'adapted' }],
      6: [boon()],
      7: [{ id: 'choirVoice', name: 'Voice of the Choir', text: 'Pushing grants +4 Psy Rating instead of +3.', impl: 'adapted' }],
      8: [boon(), hardened(8)],
    },
  },
  explorator: {
    id: 'explorator', name: 'Explorator', src: 'Core p.52', tagline: 'Master of machinery, seeker of ancient technology.',
    summary: 'A Magos of the Machine Cult. Analyses foes, fabricates dice, and keeps the party\'s weapons working.',
    color: '#b3332f', material: 'cog',
    adv: A(L2, L2, L1, L1, L3, L1, L3, L2, L3), priority: ['Int', 'T', 'S', 'BS', 'WS', 'WP', 'Per', 'Ag', 'Fel'],
    skills: ['techUse', 'logic', 'forbiddenLore'],
    talents: ['logisImplant', 'technicalKnock'],
    careerSkills: ['techUse', 'logic', 'forbiddenLore', 'awareness', 'dodge', 'medicae', 'security', 'search', 'evaluate', 'navigation'],
    careerTalents: [['electroGraftUse', 1], ['soundConstitution', 1], ['technicalKnock', 1], ['totalRecall', 1], ['luminenCharge', 2], ['prosanguine', 2], ['mechadendriteUse', 2], ['crushingBlow', 3], ['mightyShot', 3], ['trueGrit', 3], ['foresight', 2], ['ironDiscipline', 4], ['rapidReload', 1]],
    training: ['basic', 'melee', 'pistol'], kit: [['lasgun', 'best'], ['shockStaff', 'common'], ['lightCarapace', 'common'], ['combiTool', 'common'], ['servoSkull', 'common']],
    homeWorlds: ['forgeWorld', 'hiveWorld', 'imperialWorld', 'voidBorn'], defaultRank: 'front',
    fortuneTalent: { name: 'Fabricate', text: 'Once per combat, conjure an exact copy of a tray die.' },
    posts: ['Chief Enginseer', 'Magos Explorator', 'Master of the Drive'],
    features: {
      1: [{ id: 'analyse', name: 'Analyse Foe', text: 'Logic Test (Half Action): the target is Vulnerable (takes +25% damage) for 3 rounds.', impl: 'adapted' },
        { id: 'implants', name: 'Mechanicus Implants', text: '+1 Armour Point everywhere; immune to poison.', impl: 'adapted' }],
      2: [boon()],
      3: [{ id: 'blessMachine', name: 'Rite of Maintenance', text: 'Tech-Use Test (Half Action): clear any jam in the party and grant an ally Fortified (+2 AP) for 3 rounds.', impl: 'adapted' }],
      4: [boon(), hardened(4)],
      5: [{ id: 'machineCurse', name: 'Machine Curse', text: 'Tech-Use Test (Full Action): constructs and servitors are Stunned; others are Slowed.', impl: 'adapted' }],
      6: [boon()],
      7: [{ id: 'omnissiahWill', name: 'Will of the Omnissiah', text: 'Fabricate twice per combat.', impl: 'adapted' }],
      8: [boon(), hardened(8)],
    },
  },
  missionary: {
    id: 'missionary', name: 'Missionary', src: 'Core p.56', tagline: 'Emissary of the Emperor\'s word, healer and leader.',
    summary: 'Carries the Creed into the dark. Heals, exhorts the faithful, and burns what will not listen.',
    color: '#efe3c2', material: 'creed',
    adv: A(L1, L3, L2, L2, L2, L3, L2, L1, L1), priority: ['WP', 'Fel', 'WS', 'T', 'S', 'Per', 'Ag', 'BS', 'Int'],
    skills: ['medicae', 'charm', 'forbiddenLore'],
    talents: ['pureFaith', 'unshakeableFaith'],
    careerSkills: ['medicae', 'charm', 'forbiddenLore', 'awareness', 'deceive', 'dodge', 'command', 'scrutiny', 'inquiry', 'intimidate'],
    careerTalents: [['armourOfContempt', 1], ['frenzy', 1], ['soundConstitution', 1], ['hatred', 1], ['divineMinistration', 2], ['inspireWrath', 2], ['cleanseAndPurify', 2], ['crushingBlow', 3], ['nervesOfSteel', 2], ['ironDiscipline', 3], ['intoTheJaws', 5], ['swiftAttack', 4], ['resistanceFear', 1]],
    training: ['basic', 'melee', 'pistol'], kit: [['chainsword', 'good'], ['flamer', 'good'], ['guardFlak', 'best'], ['medikit', 'common']],
    homeWorlds: ['deathWorld', 'hiveWorld', 'imperialWorld', 'nobleBorn'], defaultRank: 'front',
    fortuneTalent: { name: 'Sanctify', text: 'Once per combat, turn a tray die into a blazing Creed 10 (a Righteous Fury waiting to happen).' },
    posts: ['Confessor', 'Ship\'s Preacher', 'Voice of the Creed'],
    features: {
      1: [{ id: 'exhort', name: 'Exhortation', text: 'Fellowship Test (Half Action): allies are Inspired (+10 to Tests) for 2 rounds. Divine Ministration heals them; Inspire Wrath sends them into Frenzy.', impl: 'adapted' },
        { id: 'layHands', name: 'Field Medicae', text: 'Medicae Test (Full Action): heal an ally; more on Degrees of Success. Scores a Fortune hand.', impl: 'adapted' }],
      2: [boon()],
      3: [{ id: 'emperorProtects', name: 'The Emperor Protects', text: 'Once per combat (Half Action): an ally is Warded — the next hit against them is ignored.', impl: 'adapted' }],
      4: [boon(), hardened(4)],
      5: [{ id: 'litany', name: 'Litany of Hate', text: 'Your Exhortation also grants +2 Damage to allies\' attacks.', impl: 'adapted' }],
      6: [boon()],
      7: [{ id: 'miracle', name: 'Miracle', text: 'Once per combat, burn nothing: a fallen ally rises with half their Wounds.', impl: 'adapted' }],
      8: [boon(), hardened(8)],
    },
  },
  navigator: {
    id: 'navigator', name: 'Navigator', src: 'Core p.60', tagline: 'Mutant, pilot of the warp.',
    summary: 'Of the Navis Nobilite. The warp eye sees through the Fortress\'s shifting halls — and kills whatever meets its gaze.',
    color: '#2fa59a', material: 'eye', navigator: true,
    adv: A(L3, L2, L2, L2, L3, L1, L1, L1, L3), priority: ['WP', 'Per', 'Int', 'T', 'BS', 'Ag', 'S', 'Fel', 'WS'],
    skills: ['navigation', 'psyniscience', 'forbiddenLore', 'awareness'],
    talents: ['navigator'],
    careerSkills: ['navigation', 'psyniscience', 'forbiddenLore', 'awareness', 'dodge', 'deceive', 'intimidate', 'scrutiny', 'logic'],
    careerTalents: [['navigatorPower', 1], ['jaded', 1], ['resistanceFear', 1], ['soundConstitution', 1], ['warpSense', 2], ['darkSoul', 2], ['totalRecall', 2], ['foresight', 2], ['lightSleeper', 2], ['ironDiscipline', 4], ['armourOfContempt', 3]],
    training: ['pistol', 'melee'], kit: [['hellpistol', 'best'], ['staff', 'best'], ['xenoMesh', 'best'], ['charm', 'common']],
    homeWorlds: ['hiveWorld', 'imperialWorld', 'nobleBorn', 'voidBorn'], defaultRank: 'back',
    fortuneTalent: { name: 'Warp-Sight', text: 'Once per combat, set any tray die to any value. The warp always takes its due: +1 Corruption.' },
    posts: ['Navigator Primaris', 'Master of the Warp-Path', 'Eye of the Dynasty'],
    features: {
      1: [{ id: 'warpEye', name: 'Warp Eye', text: 'You begin with The Lidless Stare. Navigator Powers test Willpower or Perception, +10 at Adept, +20 at Master. Navigators never risk Psychic Phenomena.', impl: 'exact' },
        { id: 'fortressSense', name: 'Sense the Fortress', text: 'The Fortress\'s shifting halls are a warp-route to you: you see one room further.', impl: 'adapted' }],
      2: [boon()],
      3: [hardened(3)],
      4: [boon(), { id: 'houseBlood', name: 'Blood of the House', text: '+10 to Navigator Power Tests.', impl: 'adapted' }],
      5: [{ id: 'twiceSight', name: 'Second Sight', text: 'Warp-Sight may be used twice per combat.', impl: 'adapted' }],
      6: [boon()],
      7: [hardened(7)],
      8: [boon(), { id: 'eyeOfDynasty', name: 'Eye of the Dynasty', text: 'The Lidless Stare ignores Willpower resistance from non-boss foes.', impl: 'adapted' }],
    },
  },
  seneschal: {
    id: 'seneschal', name: 'Seneschal', src: 'Core p.64', tagline: 'Keeper of secret knowledge, subtle investigator.',
    summary: 'Knows what a thing is worth and what it will cost you. Feints, exploits weaknesses, and haggles the enclave down.',
    color: '#4f8f4a', material: 'ledger',
    adv: A(L2, L2, L3, L2, L2, L1, L1, L3, L1), priority: ['Per', 'Int', 'Fel', 'BS', 'Ag', 'WS', 'T', 'WP', 'S'],
    skills: ['commerce', 'deceive', 'evaluate', 'inquiry', 'security'],
    talents: ['talented'],
    careerSkills: ['commerce', 'deceive', 'evaluate', 'inquiry', 'security', 'awareness', 'acrobatics', 'climb', 'scrutiny', 'search', 'silentMove', 'techUse', 'dodge', 'forbiddenLore'],
    careerTalents: [['soundConstitution', 1], ['unremarkable', 1], ['totalRecall', 1], ['lightSleeper', 1], ['foresight', 1], ['peer', 1], ['quickDraw', 2], ['deadeyeShot', 2], ['ambidextrous', 2], ['twoWeaponWielder', 3], ['gunslinger', 4], ['marksman', 3], ['bloodtracker', 3], ['lightningReflexes', 4]],
    training: ['pistol', 'basic', 'melee'], kit: [['hellpistol', 'best'], ['knife', 'good'], ['xenoMesh', 'common'], ['multikey', 'common'], ['cameleoline', 'common']],
    homeWorlds: ['hiveWorld', 'imperialWorld', 'nobleBorn', 'voidBorn', 'footfallen'], defaultRank: 'back',
    fortuneTalent: { name: 'Insider Trading', text: '+1 reroll on your turns. Scored Throne dice give you +1 more scrip.' },
    posts: ['High Factotum', 'Seneschal of the Warrant', 'Master of Accounts'],
    features: {
      1: [{ id: 'feint', name: 'Feint', text: 'Opposed WS (Half Action): if you win, your next attack cannot be Dodged and deals +2d10 (Exploit Weakness).', impl: 'adapted' },
        { id: 'appraiser', name: 'Appraiser', text: 'The party sells valuables for 15% more at the Exchange.', impl: 'adapted' }],
      2: [boon()],
      3: [{ id: 'shadowing', name: 'Melt into Shadow', text: 'Silent Move Test (Half Action): become Hidden. Your next attack gains +30 and Exploit Weakness.', impl: 'adapted' }],
      4: [boon(), hardened(4)],
      5: [{ id: 'exploit', name: 'Exploit Weakness', text: 'Exploit Weakness deals +3d10.', impl: 'adapted' }],
      6: [boon()],
      7: [{ id: 'coupDeGrace', name: 'Coup de Grâce', text: 'Full Action: a non-boss foe below 25% Wounds dies outright.', impl: 'adapted' }],
      8: [boon(), hardened(8)],
    },
  },
  voidMaster: {
    id: 'voidMaster', name: 'Void-master', src: 'Core p.68', tagline: 'Pilot, gunner, and master of space.',
    summary: 'Knows a ship the way a surgeon knows a body. Twin pistols, evasive manoeuvres, and a vox-line to the ship\'s guns.',
    color: '#3a6fb8', material: 'void',
    adv: A(L2, L1, L2, L2, L1, L3, L2, L1, L3), priority: ['BS', 'Ag', 'WP', 'Per', 'WS', 'T', 'S', 'Int', 'Fel'],
    skills: ['navigation', 'dodge', 'awareness'],
    talents: ['nervesOfSteel'],
    careerSkills: ['navigation', 'dodge', 'awareness', 'command', 'techUse', 'intimidate', 'scrutiny', 'acrobatics', 'forbiddenLore'],
    careerTalents: [['quickDraw', 1], ['dieHard', 1], ['soundConstitution', 1], ['hatred', 1], ['twoWeaponWielder', 1], ['deadeyeShot', 2], ['rapidReaction', 2], ['ambidextrous', 2], ['mightyShot', 3], ['gunslinger', 3], ['marksman', 3], ['lightningReflexes', 4], ['swiftAttack', 4]],
    training: ['pistol', 'melee', 'basic'], kit: [['handCannon', 'best'], ['monoSword', 'best'], ['guardFlak', 'common'], ['microBead', 'common']],
    homeWorlds: ['forgeWorld', 'hiveWorld', 'nobleBorn', 'voidBorn', 'battlefleet'], defaultRank: 'back',
    fortuneTalent: { name: 'Firing Solution', text: 'Once per turn, flip a tray die to its opposite face (11 − value).' },
    posts: ['Master of Ordnance', 'Master Helmsman', 'Master of Etherics'],
    features: {
      1: [{ id: 'evasive', name: 'Evasive Manoeuvres', text: 'Command Test (Half Action): the whole party gains +20 to Dodge until your next turn.', impl: 'adapted' },
        { id: 'voidAccustomed', name: 'Void Accustomed', text: 'Gravity shifts never turn your directions, and you are never Prone for long.', impl: 'adapted' }],
      2: [boon()],
      3: [{ id: 'augurLock', name: 'Augur Lock', text: 'Your vox reaches the ship\'s augurs: see one room further, and +10 to hit with ranged weapons.', impl: 'adapted' }],
      4: [boon(), hardened(4)],
      5: [{ id: 'shipStrike', name: 'Call the Guns', text: 'Once per expedition (Full Action): the ship fires through a breach — explosive damage to every foe, scored as a Fortune hand.', impl: 'adapted' }],
      6: [boon()],
      7: [{ id: 'masterGunner', name: 'Master Gunner', text: 'Semi- and full-auto bursts gain +1 hit.', impl: 'adapted' }],
      8: [boon(), hardened(8)],
    },
  },
};

export const CAREER_IDS = Object.keys(CAREERS) as CareerId[];

export function featuresUpTo(c: CareerId, rank: number): FeatureDef[] {
  const out: FeatureDef[] = [];
  for (let r = 1; r <= rank; r++) out.push(...(CAREERS[c].features[r] ?? []));
  return out;
}

// ── experience and Rank (Core p.37) ─────────────────────────────────────────

export const RANK_XP = [0, 5000, 7000, 10000, 13000, 17000, 21000, 25000, 30000];
export const START_XP = 5000;
export const START_SPENT = 4500;
/** Each power level is 1250 xp; power level drives Fortress scaling. */
export const XP_PER_LEVEL = 1250;

export function rankFromXp(xp: number): number {
  let r = 1;
  for (let i = 1; i < RANK_XP.length; i++) if (xp >= RANK_XP[i]) r = i;
  return r;
}

export function levelFromXp(xp: number): number {
  return Math.max(1, Math.min(20, 1 + Math.floor((xp - START_XP) / XP_PER_LEVEL)));
}

export const RANK_TITLES = ['', 'Rank 1', 'Rank 2', 'Rank 3', 'Rank 4', 'Rank 5', 'Rank 6', 'Rank 7', 'Rank 8'];
