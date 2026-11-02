/**
 * Denizens of the Blackstone Fortress. Profiles are role templates scaled by
 * level (rules/balance.ts) rather than fixed stat blocks, so every region
 * works from Rank 1 to Rank 8 with a tiered title. Factions are drawn from
 * the Koronus Expanse: Orks, renegade Kroot, Rak'Gol, Eldar corsairs, the
 * Yu'Vath's leftovers, warp-spawn, and the Fortress's own sentinels.
 *
 * 'save' actions make explorers Test a Characteristic (Agility to dive clear,
 * Toughness against toxins, Willpower against the warp) at the listed
 * difficulty; 'fear' makes them Test Willpower or be Frightened.
 */
import type { Char, DamageType, HexId, MonsterAction, ZoneId } from '../engine/types.ts';
import type { CurseId } from '../fortune/curses.ts';

export type Role = 'brute' | 'skirmisher' | 'controller' | 'artillery' | 'healer' | 'defender' | 'minion' | 'boss';

export interface MonsterDef {
  id: string;
  name: string;
  biome: ZoneId;
  role: Role;
  rank: 'front' | 'back';
  tags: string[];
  resist?: DamageType[];
  immune?: DamageType[];
  vuln?: DamageType[];
  actions: MonsterAction[];
  boss?: { curse: CurseId; phases: number; title: string; intro: string; hpMult?: number };
  finale?: boolean;
  /** Fear rating (1–4): heroes Test Willpower at -0/-10/-20/-30 on first sight. */
  fear?: number;
  flavor: string;
  look: string;
}

const atk = (id: string, name: string, dmg: number, type: DamageType, weight = 3, extra: Partial<MonsterAction> = {}): MonsterAction => ({ id, name, kind: 'attack', dmg, damageType: type, target: 'single', weight, ...extra });
const save = (id: string, name: string, dmg: number, type: DamageType, char: Char, target: MonsterAction['target'], weight = 2, extra: Partial<MonsterAction> = {}): MonsterAction => ({ id, name, kind: 'save', dmg, damageType: type, save: char, halfOnSave: true, target, weight, ...extra });
const hex = (id: string, name: string, h: HexId, weight = 1.5, text?: string): MonsterAction => ({ id, name, kind: 'hex', hex: h, target: 'self', weight, text });
const heal = (id: string, name: string, dmg: number, weight = 2): MonsterAction => ({ id, name, kind: 'heal', dmg, target: 'ally', weight });
const cond = (id: string, name: string, dmg: number, type: DamageType, c: MonsterAction['condition'], weight = 1.5, extra: Partial<MonsterAction> = {}): MonsterAction => ({ id, name, kind: 'condition', dmg, damageType: type, target: 'single', weight, condition: c, ...extra });

export const MONSTERS: Record<string, MonsterDef> = {};
const M = (d: MonsterDef) => { MONSTERS[d.id] = d; };

// ── 1. The Shattered Quays ──────────────────────────────────────────────────
M({ id: 'gretchin', name: 'Gretchin Looter', biome: 'docks', role: 'skirmisher', rank: 'front', tags: ['xenos', 'ork'],
  actions: [atk('stab', 'Grot Blasta', 1, 'impact', 3, { ranged: true }), hex('pilfer', 'Sticky Fingers', 'pilfer', 1.2)],
  flavor: 'Small, green, and very interested in your dice.', look: 'a scrawny green gretchin with huge ears, a rusty blasta and a sack bulging with stolen dice' });
M({ id: 'orkBoy', name: 'Ork Freeboota', biome: 'docks', role: 'brute', rank: 'front', tags: ['xenos', 'ork'],
  actions: [atk('choppa', 'Choppa', 1.2, 'rending', 3), atk('slugga', 'Slugga', 0.9, 'impact', 1.5, { ranged: true })],
  flavor: 'A pirate Ork in a stolen naval coat, delighted to see you.', look: 'a hulking green Ork freebooter in a stolen Imperial navy greatcoat with a choppa and slugga, grinning' });
M({ id: 'reaverGunner', name: 'Reaver Gunner', biome: 'docks', role: 'artillery', rank: 'back', tags: ['human', 'renegade'],
  actions: [atk('autogun', 'Autogun Burst', 1.1, 'impact', 3, { ranged: true }), hex('jinx', 'Covering Fire', 'jinx', 1)],
  flavor: 'Void-scum with a rifle and nothing left to lose.', look: 'a gaunt void-pirate in patched flak with an autogun and a rebreather' });
M({ id: 'rogueServitor', name: 'Rogue Servitor', biome: 'docks', role: 'defender', rank: 'front', tags: ['construct', 'servitor'], resist: ['impact'], vuln: ['energy'],
  actions: [atk('claw', 'Hydraulic Claw', 1, 'impact', 3), { id: 'brace', name: 'Lockdown Protocol', kind: 'buff', target: 'allies', weight: 1, condition: { id: 'shielded', rounds: 1, value: 2 } }],
  flavor: 'Still following orders from a captain dead three centuries.', look: 'a lobotomised cargo-servitor with a hydraulic claw arm and flickering optic' });
M({ id: 'voidPriest', name: 'Heretek Void-Priest', biome: 'docks', role: 'healer', rank: 'back', tags: ['human', 'renegade'],
  actions: [atk('arc', 'Arc Lash', 0.8, 'energy', 2, { ranged: true }), heal('mend', 'Unholy Rite of Repair', 1.5), hex('curse', 'Scrapcode', 'curseFace', 1)],
  flavor: 'He prays to the machine, and the machine prays back wrong.', look: 'a hooded heretek in black robes with tangled mechadendrites and a sparking staff' });
M({ id: 'scavGang', name: 'Scavenger Gang', biome: 'docks', role: 'minion', rank: 'front', tags: ['human'],
  actions: [atk('shiv', 'Shiv and Stub', 1, 'rending', 3), hex('snuff', 'Shakedown', 'snuff', 1)],
  flavor: 'Last month they were survivors in the enclave. Now they are hungry.', look: 'a pack of ragged scavengers with knives and stub revolvers, faces wrapped against the cold' });
M({ id: 'kaptinGitsnik', name: 'Kaptin Gitsnik', biome: 'docks', role: 'boss', rank: 'front', tags: ['xenos', 'ork'], fear: 1,
  actions: [atk('powerKlaw', 'Power Klaw', 1.2, 'energy', 3, { pen: 9 }), save('broadside', 'Kustom Broadside', 0.9, 'explosive', 'Ag', 'all', 2, { telegraph: true }), { id: 'waaagh', name: 'WAAAGH!', kind: 'buff', target: 'allies', weight: 1, condition: { id: 'frenzied', rounds: 2 } }, hex('loot', 'Mine Now', 'pilfer', 1)],
  boss: { curse: 'molten', phases: 2, title: 'Freeboota Kaptin of the Quays', intro: '"OI! Dat\'s MY Fortress!" A mountain of green muscle in a captain\'s hat raises a klaw.' },
  flavor: 'He found a Fortress. He is keeping it.', look: 'a massive Ork kaptin with a bicorne hat, a power klaw, gold teef and a pet squig' });
M({ id: 'reaverLord', name: 'Vassarine the Undrowned', biome: 'docks', role: 'boss', rank: 'back', tags: ['human', 'renegade'], fear: 1,
  actions: [atk('bolt', 'Bolt Pistol', 1.1, 'explosive', 3, { ranged: true, pen: 4 }), save('grenade', 'Krak Volley', 1, 'explosive', 'Ag', 'front', 2, { telegraph: true }), hex('silence', 'Jam the Vox', 'drain', 1.5)],
  boss: { curse: 'silence', phases: 2, title: 'Reaver-Lord of the Wreck-Throne', intro: 'A woman in a void-suit of stolen Dynasty colours rises from a throne of salvage.' },
  flavor: 'She took the Quays from a dozen crews. She would like your ship next.', look: 'a scarred renegade captain woman in a stolen ornate void-suit with a bolt pistol on a salvage throne' });
M({ id: 'hullbreaker', name: 'The Hullbreaker', biome: 'docks', role: 'boss', rank: 'front', tags: ['construct'], resist: ['impact', 'rending'], vuln: ['energy'], fear: 2,
  actions: [atk('drill', 'Boarding Drill', 1.15, 'rending', 3, { pen: 6 }), save('vent', 'Plasma Vent', 0.95, 'energy', 'Ag', 'all', 2, { telegraph: true }), { id: 'weld', name: 'Self-Repair', kind: 'heal', dmg: 2, target: 'self', weight: 1, phase: 2 }],
  boss: { curse: 'barren', phases: 2, title: 'Boarding Engine of a Dead Fleet', intro: 'A boarding torpedo the size of a hab-block uncurls on spider legs.' },
  flavor: 'Built to eat ships. The Fortress fed it.', look: 'a colossal spider-legged boarding machine with a drill prow and plasma vents' });

// ── 2. The Xenos Arboretum ──────────────────────────────────────────────────
M({ id: 'sporeThrall', name: 'Spore-Thrall', biome: 'gardens', role: 'minion', rank: 'front', tags: ['human', 'plant'], resist: ['impact'],
  actions: [atk('flail', 'Flailing Limbs', 1, 'impact', 3), cond('puff', 'Spore Burst', 0.4, 'impact', { id: 'poisoned', rounds: 2 }, 1.5, { save: 'T' })],
  flavor: 'Explorers who breathed too deep. They grow mushrooms now.', look: 'a shambling human corpse sprouting glowing fungal growths from eyes and mouth' });
M({ id: 'krootHunter', name: 'Renegade Kroot', biome: 'gardens', role: 'skirmisher', rank: 'front', tags: ['xenos', 'kroot'],
  actions: [atk('rifle', 'Kroot Rifle', 1.1, 'rending', 3), cond('pounce', 'Ambush Pounce', 0.8, 'rending', { id: 'prone', rounds: 1 }, 1.2)],
  flavor: 'It has tasted Ork. It wants to know what you taste like.', look: 'a lean avian Kroot warrior with quills, a long bladed rifle and feather totems' });
M({ id: 'krootHound', name: 'Kroot Hound', biome: 'gardens', role: 'brute', rank: 'front', tags: ['xenos', 'beast'],
  actions: [atk('bite', 'Beaked Bite', 1.2, 'rending', 3), cond('maul', 'Maul', 0.8, 'rending', { id: 'bleeding', rounds: 2, value: 3 }, 1.5)],
  flavor: 'Fast, beaked, and always in pairs.', look: 'a snarling beaked Kroot hound with quills and a long tail' });
M({ id: 'stranglevine', name: 'Stranglevine', biome: 'gardens', role: 'controller', rank: 'front', tags: ['plant'], vuln: ['energy'],
  actions: [cond('grab', 'Constrict', 0.8, 'impact', { id: 'snared', rounds: 2, saveEnds: true }, 2.5, { save: 'S' }), atk('lash', 'Thorn Lash', 1, 'rending', 2)],
  flavor: 'The corridor is the predator.', look: 'a writhing mass of thorned carnivorous vines with a gaping flower mouth' });
M({ id: 'venomwing', name: 'Venomwing', biome: 'gardens', role: 'artillery', rank: 'back', tags: ['xenos', 'beast'],
  actions: [atk('spit', 'Venom Spit', 1.1, 'impact', 3, { ranged: true }), hex('jinx', 'Hypnotic Wings', 'jinx', 1.2)],
  flavor: 'Its wings are patterned to make you look away from your dice.', look: 'a bat-winged xenos insect with iridescent hypnotic wing patterns, dripping venom' });
M({ id: 'mycelicHerald', name: 'Mycelic Herald', biome: 'gardens', role: 'healer', rank: 'back', tags: ['plant'],
  actions: [atk('spore', 'Spore Lance', 0.8, 'impact', 2, { ranged: true }), heal('rot', 'Regrowth', 1.5), hex('curse', 'Rot the Bones', 'curseFace', 1)],
  flavor: 'It speaks for the garden. The garden is hungry.', look: 'a tall mushroom-headed humanoid with a cloak of mycelium and a staff of living root' });
M({ id: 'bloomQueen', name: 'The Bloom Queen', biome: 'gardens', role: 'boss', rank: 'back', tags: ['plant'], resist: ['impact'], vuln: ['energy'], fear: 2,
  actions: [atk('tendril', 'Tendril Lash', 1, 'rending', 3, { ranged: true }), save('pollen', 'Choking Pollen', 0.9, 'impact', 'T', 'all', 2, { telegraph: true, condition: { id: 'poisoned', rounds: 2 } }), { id: 'regrow', name: 'Regrow', kind: 'heal', dmg: 1.6, target: 'self', weight: 1, phase: 2 }, { id: 'thralls', name: 'Call the Thralls', kind: 'summon', summon: 'sporeThrall', target: 'self', weight: 1 }],
  boss: { curse: 'barren', phases: 2, title: 'Heart of the Arboretum', intro: 'The whole chamber breathes spores. A flower the size of a frigate opens.' },
  flavor: 'The garden has a mind, and it has noticed you.', look: 'a vast carnivorous flower-queen with a humanoid figure grown into its pistil, surrounded by pollen' });
M({ id: 'krootShaper', name: 'Shaper Kh\'rrak', biome: 'gardens', role: 'boss', rank: 'front', tags: ['xenos', 'kroot'], fear: 1,
  actions: [atk('blade', 'Ritual Blade', 1.1, 'rending', 3), atk('rifle', 'Shaper\'s Rifle', 1, 'energy', 2, { ranged: true }), save('hunt', 'The Great Hunt', 1, 'rending', 'Ag', 'back', 2, { telegraph: true }), hex('pilfer', 'Taste of Fortune', 'pilfer', 1)],
  boss: { curse: 'thorns', phases: 2, title: 'Shaper of the Devouring Kindred', intro: 'An ancient Kroot, quilled with trophies, sniffs the air and smiles with its beak.' },
  flavor: 'He has eaten a Rogue Trader before. He remembers the taste.', look: 'an ancient Kroot shaper with long quills, ritual scars and trophies from many species' });
M({ id: 'gardener', name: 'The Gardener', biome: 'gardens', role: 'boss', rank: 'front', tags: ['construct', 'xenos'], resist: ['rending'], vuln: ['explosive'], fear: 2,
  actions: [atk('shears', 'Pruning Shears', 1.15, 'rending', 3, { pen: 4 }), save('mist', 'Growth Mist', 0.9, 'impact', 'T', 'all', 2, { telegraph: true }), hex('hunger', 'Root Out', 'drain', 1.2)],
  boss: { curse: 'hunger', phases: 2, title: 'Yu\'Vath Bio-Engine', intro: 'A thing of chitin and brass straightens up from its work and regards you as a weed.' },
  flavor: 'A leftover of the Yu\'Vath, still tending a garden for masters long gone.', look: 'a tall insectile xenos bio-construct of chitin and brass with shear-like arms tending alien plants' });

// ── 3. The Drowned Reliquary ────────────────────────────────────────────────
M({ id: 'rakgolMarauder', name: 'Rak\'Gol Marauder', biome: 'reliquary', role: 'brute', rank: 'front', tags: ['xenos', 'rakgol'], fear: 1,
  actions: [atk('cleaver', 'Cleaver-Arm', 1.25, 'rending', 3, { pen: 2 }), atk('rad', 'Rad-Cannon', 1, 'energy', 1.5, { ranged: true })],
  flavor: 'More machine than meat, and all of it hates you.', look: 'a towering reptilian Rak\'Gol cyborg with crude bionic cleaver arms and rad-cannon' });
M({ id: 'rakgolSniper', name: 'Rak\'Gol Dead-Eye', biome: 'reliquary', role: 'artillery', rank: 'back', tags: ['xenos', 'rakgol'],
  actions: [atk('rail', 'Rail Rifle', 1.2, 'impact', 3, { ranged: true, pen: 5 }), hex('jinx', 'Target Lock', 'jinx', 1)],
  flavor: 'Its eyes were replaced with targeting arrays long ago.', look: 'a lean Rak\'Gol with a long crude rail rifle and multiple augmetic lenses' });
M({ id: 'drownedServitor', name: 'Drowned Servitor', biome: 'reliquary', role: 'defender', rank: 'front', tags: ['construct', 'servitor'], resist: ['impact'], vuln: ['energy'],
  actions: [atk('arm', 'Piston Arm', 1, 'impact', 3), { id: 'guard', name: 'Curator Protocol', kind: 'buff', target: 'allies', weight: 1, condition: { id: 'shielded', rounds: 1, value: 2 } }],
  flavor: 'It guards the relics. It does not know they are drowned.', look: 'a waterlogged curator servitor dripping coolant with a piston arm and stasis lamp' });
M({ id: 'coolantEel', name: 'Coolant Eel', biome: 'reliquary', role: 'skirmisher', rank: 'front', tags: ['beast'],
  actions: [atk('bite', 'Freezing Bite', 1, 'rending', 3), cond('coil', 'Coil', 0.6, 'impact', { id: 'snared', rounds: 1 }, 1.2)],
  flavor: 'Something evolved in the coolant. It glows.', look: 'a pale bioluminescent eel thick as a man, with frost on its fangs' });
M({ id: 'heretekAdept', name: 'Heretek Adept', biome: 'reliquary', role: 'healer', rank: 'back', tags: ['human', 'renegade'],
  actions: [atk('las', 'Las-Mechadendrite', 0.8, 'energy', 2, { ranged: true }), heal('rite', 'Rite of Reanimation', 1.5), hex('invert', 'Reverse Polarity', 'invert', 1)],
  flavor: 'He came for the relics and stayed for the voices.', look: 'a renegade tech-adept with red robes stained black, multiple arms and a bundle of stolen relics' });
M({ id: 'cryoWraith', name: 'Cryo-Wraith', biome: 'reliquary', role: 'controller', rank: 'back', tags: ['daemon', 'warp'], resist: ['impact', 'rending'], fear: 2,
  actions: [save('chill', 'Soul-Chill', 0.9, 'warp', 'WP', 'single', 2.5, { condition: { id: 'stunned', rounds: 1 } }), hex('drain', 'Drain Hope', 'drain', 1.2)],
  flavor: 'A ghost of the warp, wearing the frost of the vaults.', look: 'a translucent screaming wraith of frost and warp-light rising from black coolant' });
M({ id: 'rakgolWarlord', name: 'Rak\'Gol Warlord', biome: 'reliquary', role: 'boss', rank: 'front', tags: ['xenos', 'rakgol'], fear: 2,
  actions: [atk('crusher', 'Crusher-Arm', 1.2, 'impact', 3, { pen: 4 }), save('rad', 'Rad-Purge', 0.9, 'energy', 'T', 'all', 2, { telegraph: true }), { id: 'frenzy', name: 'Killing Frenzy', kind: 'buff', target: 'self', weight: 1, phase: 2, condition: { id: 'frenzied', rounds: 3 } }],
  boss: { curse: 'tide', phases: 2, title: 'Marauder King of the Vaults', intro: 'A Rak\'Gol twice the size of the others, bristling with weapon-limbs, screams a war-code.' },
  flavor: 'It has collected forty Imperial skulls. It needs four more for a set.', look: 'a massive Rak\'Gol warlord cyborg covered in weapon-limbs and Imperial skulls' });
M({ id: 'archiveMind', name: 'The Archive-Mind', biome: 'reliquary', role: 'boss', rank: 'back', tags: ['construct'], resist: ['impact', 'rending'], vuln: ['explosive'], fear: 1,
  actions: [atk('arc', 'Data-Arc', 1, 'energy', 3, { ranged: true }), save('purge', 'Memory Purge', 1, 'warp', 'WP', 'all', 2, { telegraph: true }), hex('void', 'Erase', 'curseFace', 1.2)],
  boss: { curse: 'void', phases: 2, title: 'Keeper of Unwritten Things', intro: 'A cathedral of cogitators wakes. Every screen shows your face, then your death.' },
  flavor: 'The Reliquary\'s machine-mind. It catalogues everything, including you.', look: 'a vast cathedral of cogitators and data-cables with a single giant optic' });
M({ id: 'drownedConfessor', name: 'The Drowned Confessor', biome: 'reliquary', role: 'boss', rank: 'back', tags: ['human', 'daemon'], resist: ['energy'], fear: 3,
  actions: [atk('censer', 'Black Censer', 1.1, 'warp', 3, { ranged: true }), save('sermon', 'Drowning Sermon', 0.95, 'warp', 'WP', 'all', 2, { telegraph: true }), hex('odd', 'Heretic\'s Tithe', 'drain', 1)],
  boss: { curse: 'oddDrown', phases: 2, title: 'Voice of the Black Tide', intro: 'A priest rises from the coolant, still preaching, mouth full of water.' },
  flavor: 'He came to bless the relics. Something in the deep blessed him back.', look: 'a drowned undead preacher in rotted ecclesiarchal robes swinging a black censer, eyes glowing warp-blue' });

// ── 4. The Obsidian Labyrinth ───────────────────────────────────────────────
M({ id: 'corsairReaver', name: 'Eldar Corsair', biome: 'labyrinth', role: 'skirmisher', rank: 'front', tags: ['xenos', 'eldar'],
  actions: [atk('blade', 'Power Blade', 1.1, 'energy', 3, { pen: 4 }), atk('shuriken', 'Shuriken Pistol', 0.9, 'rending', 2, { ranged: true })],
  flavor: 'Fast as thought, and it thinks you are slow.', look: 'a lithe Eldar corsair in mismatched armour with a power blade and shuriken pistol' });
M({ id: 'corsairSniper', name: 'Corsair Void-Sniper', biome: 'labyrinth', role: 'artillery', rank: 'back', tags: ['xenos', 'eldar'],
  actions: [atk('needle', 'Long Rifle', 1.2, 'energy', 3, { ranged: true, pen: 3 }), hex('jinx', 'Marked for Death', 'jinx', 1)],
  flavor: 'You will not see it. You will see the flash.', look: 'an Eldar sniper in a shimmering cloak with a long elegant rifle' });
M({ id: 'shadeDouble', name: 'Shade-Double', biome: 'labyrinth', role: 'controller', rank: 'front', tags: ['warp', 'shapechanger'], fear: 1,
  actions: [atk('mimic', 'Stolen Strike', 1, 'rending', 3), hex('invert', 'Mirror Reversal', 'invert', 1.4)],
  flavor: 'It is you, from the wrong side of the glass.', look: 'a dark featureless reflection of a Rogue Trader stepping out of an obsidian mirror' });
M({ id: 'labyrinthWarden', name: 'Labyrinth Warden', biome: 'labyrinth', role: 'defender', rank: 'front', tags: ['construct', 'blackstone'], resist: ['energy', 'rending'], vuln: ['explosive'],
  actions: [atk('fist', 'Obsidian Fist', 1, 'impact', 3), { id: 'refract', name: 'Refract', kind: 'buff', target: 'allies', weight: 1, condition: { id: 'shielded', rounds: 1, value: 2 } }],
  flavor: 'The Fortress grows them like crystals.', look: 'a faceless humanoid construct of black obsidian glass with glowing seams' });
M({ id: 'whisperShade', name: 'Whispering Shade', biome: 'labyrinth', role: 'minion', rank: 'back', tags: ['warp'], resist: ['impact'],
  actions: [atk('touch', 'Chill Touch', 1, 'warp', 3, { ranged: true }), hex('snuff', 'Whisper of Debt', 'snuff', 1)],
  flavor: 'It whispers what you owe. It is always right.', look: 'a wispy smoke-figure with too many mouths whispering in the black glass' });
M({ id: 'corsairWitch', name: 'Corsair Witch', biome: 'labyrinth', role: 'healer', rank: 'back', tags: ['xenos', 'eldar', 'psyker'],
  actions: [atk('bolt', 'Witch-Bolt', 0.9, 'warp', 2, { ranged: true }), heal('rune', 'Rune of Mending', 1.5), hex('curse', 'Doom', 'curseFace', 1)],
  flavor: 'Her runes spin around her like moons.', look: 'an Eldar witch in a bone-white mask with spinning psychic runes and a singing spear' });
M({ id: 'corsairPrince', name: 'Prince Ilyrath', biome: 'labyrinth', role: 'boss', rank: 'front', tags: ['xenos', 'eldar'], fear: 1,
  actions: [atk('blade', 'Star-Blade', 1.15, 'energy', 3, { pen: 6 }), save('dance', 'Blade Dance', 1, 'rending', 'Ag', 'front', 2, { telegraph: true }), hex('judge', 'Contempt', 'jinx', 1.2)],
  boss: { curse: 'judgement', phases: 2, title: 'Corsair Prince of the Shattered Sun', intro: '"Mon-keigh. You are standing on my Fortress." The Prince does not bother to draw yet.' },
  flavor: 'He has raided the Expanse for three centuries and thinks it all rather dull.', look: 'an arrogant Eldar corsair prince in ornate jewelled armour with a star-blade and a cloak of stars' });
M({ id: 'theUnmade', name: 'The Unmade', biome: 'labyrinth', role: 'boss', rank: 'front', tags: ['warp', 'shapechanger'], fear: 3,
  actions: [atk('steal', 'Your Own Blade', 1.1, 'rending', 3), save('shatter', 'Shatter', 1, 'rending', 'Ag', 'all', 2, { telegraph: true }), hex('invert', 'Reverse Reflection', 'invert', 1.2)],
  boss: { curse: 'evenMirror', phases: 2, title: 'What the Mirror Kept', intro: 'Your Lord-Captain\'s reflection steps out of the glass, wearing the Warrant you lost.' },
  flavor: 'It knows every hand you have played. It knows what you lost.', look: 'a cracked obsidian reflection of a Rogue Trader captain wearing a ghostly Warrant of Trade' });
M({ id: 'obsidianSeraph', name: 'The Obsidian Seraph', biome: 'labyrinth', role: 'boss', rank: 'back', tags: ['construct', 'blackstone'], resist: ['energy'], vuln: ['explosive'], fear: 2,
  actions: [atk('beam', 'Prism Beam', 1.1, 'energy', 3, { ranged: true, pen: 5 }), save('flare', 'Black Flare', 1, 'energy', 'Ag', 'all', 2, { telegraph: true }), hex('silence', 'Silence', 'drain', 1.5)],
  boss: { curse: 'silence', phases: 2, title: 'The Cracked Halo', intro: 'Six wings of black glass unfold. The light dies.' },
  flavor: 'A sentinel the Fortress made in the image of something it once saw.', look: 'a six-winged angelic construct of black obsidian glass with a cracked halo of light' });

// ── 5. The Gravitic Heart ───────────────────────────────────────────────────
M({ id: 'blackstoneSentinel', name: 'Blackstone Sentinel', biome: 'core', role: 'defender', rank: 'front', tags: ['construct', 'blackstone'], resist: ['energy', 'impact'], vuln: ['explosive'],
  actions: [atk('slam', 'Graviton Slam', 1, 'impact', 3, { pen: 4 }), { id: 'field', name: 'Gravity Field', kind: 'buff', target: 'allies', weight: 1, condition: { id: 'shielded', rounds: 1, value: 3 } }],
  flavor: 'The Fortress\'s immune system.', look: 'a hovering black monolith construct with glowing runes and gravity-warped edges' });
M({ id: 'warpSpawn', name: 'Warp-Spawn', biome: 'core', role: 'minion', rank: 'front', tags: ['daemon', 'warp'], fear: 1,
  actions: [atk('claw', 'Unmaking Claw', 1, 'warp', 3), hex('curse', 'Warp-Taint', 'curseFace', 0.8)],
  flavor: 'It leaked through a crack in the Gellar of the world.', look: 'a twisting mass of warp-flesh with too many eyes and claws' });
M({ id: 'gravDrone', name: 'Graviton Drone', biome: 'core', role: 'artillery', rank: 'back', tags: ['construct', 'blackstone'],
  actions: [atk('crush', 'Gravity Spike', 1.1, 'impact', 3, { ranged: true, pen: 3 }), cond('pin', 'Grav-Pin', 0.6, 'impact', { id: 'prone', rounds: 1 }, 1.2)],
  flavor: 'It weighs you, and finds you too light.', look: 'a floating black drone with gravitic emitters bending the light around it' });
M({ id: 'warpHound', name: 'Warp-Hound', biome: 'core', role: 'skirmisher', rank: 'front', tags: ['daemon', 'warp'], fear: 2,
  actions: [atk('maw', 'Soul-Maw', 1.1, 'warp', 3), cond('howl', 'Howl', 0.5, 'warp', { id: 'frightened', rounds: 2 }, 1.2, { save: 'WP' })],
  flavor: 'It hunts by the smell of your soul.', look: 'a skinless daemonic hound with a collar of brass and burning eyes' });
M({ id: 'chaosCultist', name: 'Chaos Cultist', biome: 'core', role: 'healer', rank: 'back', tags: ['human', 'renegade'],
  actions: [atk('stub', 'Autopistol', 0.8, 'impact', 2, { ranged: true }), heal('dark', 'Dark Blessing', 1.5), hex('drain', 'Blasphemy', 'drain', 1)],
  flavor: 'They came to worship the Fortress. It did not notice.', look: 'a robed chaos cultist with a ritual knife, autopistol and a mutated hand' });
M({ id: 'renegadePsyker', name: 'Renegade Psyker', biome: 'core', role: 'controller', rank: 'back', tags: ['human', 'psyker'], fear: 1,
  actions: [save('blast', 'Warp Blast', 0.9, 'warp', 'WP', 'front', 2.5), cond('dom', 'Mind Grip', 0.4, 'warp', { id: 'stunned', rounds: 1 }, 1.4, { save: 'WP' })],
  flavor: 'Unsanctioned and unhinged. The warp sings through him.', look: 'an emaciated renegade psyker with burning eyes and crackling warp lightning' });
M({ id: 'gravitarch', name: 'The Gravitarch', biome: 'core', role: 'boss', rank: 'front', tags: ['construct', 'blackstone'], resist: ['energy', 'impact'], fear: 2,
  actions: [atk('crush', 'Gravity Crush', 1.2, 'impact', 3, { pen: 6 }), save('well', 'Singularity', 1, 'impact', 'S', 'all', 2, { telegraph: true }), hex('gravity', 'Weight of Ages', 'jinx', 1)],
  boss: { curse: 'gravity', phases: 2, title: 'Warden of the Engine', intro: 'The floor tilts. A monolith of black stone unfolds into a giant.' },
  flavor: 'The Fortress built it to keep the engine turning, and visitors flattened.', look: 'a giant humanoid construct of black stone with gravity distortion warping the air around it' });
M({ id: 'hollowSaint', name: 'The Hollow Saint', biome: 'core', role: 'boss', rank: 'back', tags: ['daemon', 'warp'], resist: ['energy', 'impact'], fear: 3,
  actions: [atk('lash', 'Warp Lash', 1.1, 'warp', 3, { ranged: true }), save('miracle', 'False Miracle', 1, 'warp', 'WP', 'all', 2, { telegraph: true }), { id: 'spawn', name: 'Open the Seam', kind: 'summon', summon: 'warpSpawn', target: 'self', weight: 1 }],
  boss: { curse: 'judgement', phases: 2, title: 'The Daemon Wearing a Halo', intro: 'A saint descends, haloed and beautiful. Behind the halo there is nothing at all.' },
  flavor: 'It wears the shape of what you pray to.', look: 'a beautiful haloed saint figure with an empty hollow behind its face, warp-light pouring out' });
M({ id: 'sorcererLord', name: 'Sorcerer-Lord Xaphan', biome: 'core', role: 'boss', rank: 'back', tags: ['human', 'psyker', 'renegade'], fear: 2,
  actions: [atk('bolt', 'Doombolt', 1.1, 'warp', 3, { ranged: true }), save('storm', 'Warp Storm', 1, 'warp', 'WP', 'all', 2, { telegraph: true }), hex('void', 'Unweave Fate', 'curseFace', 1.2)],
  boss: { curse: 'void', phases: 2, title: 'Seeker of the Engine', intro: 'A sorcerer in ancient power armour turns from the engine. "Ah. More fuel."' },
  flavor: 'He wants the Fortress for his masters. He has been here a very long time.', look: 'a chaos sorcerer in ancient horned power armour wreathed in warp fire' });

// ── The finale: the heart of the Fortress ────────────────────────────────────
M({ id: 'usurper', name: 'Lord-Captain Rathbone', biome: 'core', role: 'boss', rank: 'front', tags: ['human', 'blackstone'], finale: true, fear: 3,
  resist: ['energy'],
  actions: [
    atk('blade', 'Stolen Power Sword', 1, 'energy', 3, { pen: 5 }),
    atk('pistol', 'Plasma Pistol', 1.1, 'energy', 2, { ranged: true, pen: 6 }),
    save('gravity', 'Command the Fortress', 1, 'impact', 'S', 'all', 1.4, { telegraph: true }),
    save('obsidian', 'Obsidian Storm', 1.1, 'rending', 'Ag', 'back', 1.2, { telegraph: true }),
    save('warp', 'The Fortress Wakes', 1.15, 'warp', 'WP', 'all', 1.4, { phase: 3, telegraph: true }),
    { id: 'sentinels', name: 'Summon Sentinels', kind: 'summon', summon: 'blackstoneSentinel', target: 'self', weight: 0.5, phase: 2 },
    hex('dominion', 'Blackstone Dominion', 'curseFace', 1),
    hex('warrant', 'My Warrant Now', 'pilfer', 1),
    hex('glare', 'Usurper\'s Contempt', 'jinx', 0.8),
  ],
  boss: { curse: 'chromatic', phases: 3, hpMult: 1.15, title: 'the Usurper, Bound to the Fortress', intro: 'Your family\'s rival stands on the wreck of your flagship, your Warrant in one hand and the Fortress\'s heart in the other.' },
  flavor: 'He broke your Dynasty, took your Warrant, and came here to make himself a god.',
  look: 'a Rogue Trader usurper in black-and-gold armour fused with blackstone, holding a glowing Warrant of Trade atop a wrecked flagship' });

// Summons only.
M({ id: 'warpEcho', name: 'Warp Entity', biome: 'core', role: 'minion', rank: 'front', tags: ['daemon', 'warp'], finale: true, fear: 2,
  actions: [atk('claw', 'Warp Claw', 1.1, 'warp', 3)],
  flavor: 'Called through by a psyker\'s mistake.', look: 'a half-formed daemon pouring out of a crack in reality' });

export const MONSTER_LIST = Object.values(MONSTERS);

export function biomeMonsters(biome: ZoneId, bosses = false): MonsterDef[] {
  return MONSTER_LIST.filter((m) => m.biome === biome && !m.finale && (bosses ? m.role === 'boss' : m.role !== 'boss'));
}

export const TIER_TITLES = ['', 'Veteran ', 'Dread ', 'Legendary '];
export function tierIndex(level: number): number {
  return level >= 17 ? 3 : level >= 11 ? 2 : level >= 5 ? 1 : 0;
}
