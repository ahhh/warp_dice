/**
 * Room events: investigation, salvage, social encounters, gambles. Checks are
 * Rogue Trader Skill Tests: the best explorer for the Skill rolls d100 under
 * Skill + difficulty (+10 Ordinary, +0 Challenging, -10 Difficult, -20 Hard).
 * Every event has an option with no check, so none can soft-lock a run.
 */
import type { Char, SkillId, ZoneId } from '../engine/types.ts';

export type Outcome =
  | { type: 'gold'; amount: number }
  | { type: 'doubloons'; n: number }
  | { type: 'boons'; source: 'normal' | 'elite' | 'treasure' }
  | { type: 'charm'; rarity?: 'common' | 'uncommon' | 'rare' | 'legendary' }
  | { type: 'heal'; pct: number }
  | { type: 'damage'; pct: number; who: 'party' | 'one' }
  | { type: 'item'; tier: number }
  | { type: 'valuable'; tier: number }
  | { type: 'combat'; elite?: boolean }
  | { type: 'meter'; delta: number; set?: number }
  | { type: 'reveal' }
  | { type: 'key' }
  | { type: 'omen' }
  | { type: 'die' }
  | { type: 'token'; id?: string }
  | { type: 'resources' }
  | { type: 'condition'; id: 'poisoned' | 'frightened' | 'blessed' }
  | { type: 'insanity'; n: number; who: 'party' | 'one' }
  | { type: 'corruption'; n: number; who: 'party' | 'one' }
  | { type: 'fate'; n: number }
  | { type: 'pf'; n: number }
  | { type: 'wheel' }
  | { type: 'gamble' }
  | { type: 'sacrifice' }
  | { type: 'text'; t: string };

/** A party asset that turns a check into an automatic success. */
export type Helper = 'tech' | 'warp' | 'medicae' | 'auspex' | 'command' | 'faith';

export interface EventOption {
  label: string;
  check?: { skill?: SkillId; char?: Char; mod: number };
  helper?: Helper;
  cost?: { gold?: number; doubloons?: number };
  success: Outcome[];
  failure?: Outcome[];
  hint?: string;
}

export interface EventDef {
  id: string;
  biome: ZoneId | 'any';
  kind: 'event' | 'shrine' | 'key' | 'mechanism';
  title: string;
  text: string;
  options: EventOption[];
}

export const EVENTS: Record<string, EventDef> = {};
const E = (e: EventDef) => { EVENTS[e.id] = e; };

// ── anywhere in the Fortress ────────────────────────────────────────────────
E({ id: 'lockedCache', biome: 'any', kind: 'event', title: 'A Sealed Cache', text: 'A Mechanicus strongbox sits bolted to the deck, its cogitator-lock still blinking amber. Scratches around the seal say someone tried before you.',
  options: [
    { label: 'Override the lock', check: { skill: 'security', mod: 0 }, helper: 'tech', success: [{ type: 'gold', amount: 1 }, { type: 'item', tier: 1 }], failure: [{ type: 'damage', pct: 0.1, who: 'one' }, { type: 'text', t: 'The lock\'s machine spirit lashes out with a spark. It holds.' }], hint: 'Explorators, a Combi-tool or a Multikey help.' },
    { label: 'Cut it open', check: { char: 'S', mod: -10 }, success: [{ type: 'gold', amount: 1 }], failure: [{ type: 'text', t: 'The casing dents but holds. Your arms ache.' }, { type: 'damage', pct: 0.05, who: 'one' }] },
    { label: 'Leave it', success: [{ type: 'text', t: 'Some treasures are bait.' }] },
  ] });
E({ id: 'woundedRival', biome: 'any', kind: 'event', title: 'A Wounded Rival', text: 'A woman in the livery of a rival Dynasty slumps against a bulkhead, bleeding. "They took everything," she gasps. "Even my dice."',
  options: [
    { label: 'Tend her wounds', check: { skill: 'medicae', mod: 0 }, helper: 'medicae', success: [{ type: 'text', t: 'She presses a strange die into your hand. "For luck. Tell no one."' }, { type: 'die' }, { type: 'pf', n: 1 }], failure: [{ type: 'text', t: 'You do what you can. She thanks you and limps away.' }, { type: 'doubloons', n: 2 }] },
    { label: 'Question her', check: { skill: 'scrutiny', mod: 10 }, success: [{ type: 'reveal' }, { type: 'text', t: 'She sketches the way to the region\'s lord on your auspex.' }], failure: [{ type: 'text', t: 'Her story makes no sense. Fever, perhaps. Or lies.' }] },
    { label: 'Take her purse', success: [{ type: 'gold', amount: 1 }, { type: 'text', t: 'You take her Thrones. The Fortress notices.' }, { type: 'corruption', n: 1, who: 'one' }] },
  ] });
E({ id: 'dicingGhost', biome: 'any', kind: 'shrine', title: 'The Gambler\'s Ghost', text: 'A translucent voidsman sits at a table of bone, rattling a cup of d10s. "One game, living ones. Double or nothing."',
  options: [
    { label: 'Wager 5 scrip', cost: { doubloons: 5 }, success: [{ type: 'gamble' }] },
    { label: 'Bluff him', check: { skill: 'deceive', mod: -10 }, success: [{ type: 'charm', rarity: 'uncommon' }, { type: 'text', t: 'You bluff the ghost into folding. He tosses you a relic with a scowl.' }], failure: [{ type: 'insanity', n: 2, who: 'party' }, { type: 'text', t: 'The ghost laughs; the cold seeps into your mind.' }] },
    { label: 'Decline politely', success: [{ type: 'text', t: '"Coward," the ghost sighs, and fades.' }] },
  ] });
E({ id: 'emperorsTarot', biome: 'any', kind: 'shrine', title: 'The Emperor\'s Tarot', text: 'A great brass wheel stands here, set with tarot plates: the Throne, the Skull, the Aquila, the Eye. A coin-slot waits.',
  options: [
    { label: 'Spin (3 scrip)', cost: { doubloons: 3 }, success: [{ type: 'wheel' }] },
    { label: 'Spin (50 Thrones)', cost: { gold: 50 }, success: [{ type: 'wheel' }] },
    { label: 'Walk away', success: [{ type: 'text', t: 'The wheel ticks once as you leave.' }] },
  ] });
E({ id: 'blackAltar', biome: 'any', kind: 'shrine', title: 'The Black Altar', text: 'A plinth of blackstone with a single carving: a hand releasing a die. Below, a bowl worn smooth by countless offerings.',
  options: [
    { label: 'Offer a die from your bag', success: [{ type: 'sacrifice' }] },
    { label: 'Pray to the God-Emperor', check: { char: 'WP', mod: 0 }, helper: 'faith', success: [{ type: 'omen' }, { type: 'text', t: 'A whisper names a hand you will play well.' }], failure: [{ type: 'text', t: 'Only silence answers.' }] },
    { label: 'Leave', success: [] },
  ] });
E({ id: 'collapsedPassage', biome: 'any', kind: 'event', title: 'Collapsed Passage', text: 'Rubble chokes the way. Beyond it, something glints.',
  options: [
    { label: 'Dig through', check: { char: 'S', mod: 0 }, success: [{ type: 'valuable', tier: 0 }, { type: 'item', tier: 0 }], failure: [{ type: 'damage', pct: 0.12, who: 'party' }, { type: 'text', t: 'The ceiling shifts. You scramble back, bruised.' }] },
    { label: 'Find a weak point', check: { skill: 'logic', mod: -10 }, success: [{ type: 'valuable', tier: 1 }], failure: [{ type: 'text', t: 'You find nothing useful.' }] },
    { label: 'Move on', success: [] },
  ] });
E({ id: 'medicaeStation', biome: 'any', kind: 'event', title: 'An Abandoned Medicae Station', text: 'A chirurgeon\'s station, still humming. Vials of something blue sit in a cooling rack.',
  options: [
    { label: 'Identify the compounds', check: { skill: 'medicae', mod: 10 }, helper: 'medicae', success: [{ type: 'heal', pct: 0.4 }, { type: 'text', t: 'Counterseptic and plasma. Everyone takes a dose.' }], failure: [{ type: 'condition', id: 'poisoned' }, { type: 'text', t: 'It was not counterseptic.' }] },
    { label: 'Just inject it', success: [{ type: 'heal', pct: 0.2 }] },
    { label: 'Pack it for later', check: { skill: 'techUse', mod: 0 }, success: [{ type: 'token', id: 'tonic' }], failure: [{ type: 'text', t: 'The vial cracks in your hand.' }] },
  ] });
E({ id: 'servitorTraps', biome: 'any', kind: 'event', title: 'Defence Turrets', text: 'Las-turrets track you from the ceiling, their machine spirits half asleep. The floor is scorched in a neat pattern.',
  options: [
    { label: 'Spot the blind arcs', check: { skill: 'awareness', mod: 0 }, helper: 'auspex', success: [{ type: 'doubloons', n: 3 }, { type: 'text', t: 'You slip through, and find scrip dropped by the less careful.' }], failure: [{ type: 'damage', pct: 0.12, who: 'party' }] },
    { label: 'Dash across', check: { skill: 'dodge', mod: 0 }, success: [{ type: 'text', t: 'Graceful. Barely.' }], failure: [{ type: 'damage', pct: 0.15, who: 'one' }] },
    { label: 'Placate the turrets', check: { skill: 'techUse', mod: -10 }, helper: 'tech', success: [{ type: 'gold', amount: 1 }, { type: 'token' }], failure: [{ type: 'damage', pct: 0.1, who: 'one' }] },
  ] });
E({ id: 'rivalCrew', biome: 'any', kind: 'event', title: 'A Rival Crew', text: 'Explorers in another Dynasty\'s colours block the gantry. "This hall is claimed by House Saphrax. Pay the toll, or turn around."',
  options: [
    { label: 'Invoke your family name', check: { skill: 'command', mod: 0 }, helper: 'command', success: [{ type: 'reveal' }, { type: 'pf', n: 1 }, { type: 'text', t: 'They recognise the name. They bow, and share their charts.' }], failure: [{ type: 'combat' }] },
    { label: 'Intimidate them', check: { skill: 'intimidate', mod: 0 }, success: [{ type: 'gold', amount: 1 }, { type: 'text', t: 'They flee, dropping a purse.' }], failure: [{ type: 'combat' }] },
    { label: 'Pay 40 Thrones', cost: { gold: 40 }, success: [{ type: 'text', t: 'They step aside, smirking.' }] },
    { label: 'Open fire', success: [{ type: 'combat' }] },
  ] });
E({ id: 'shrineOfDrusus', biome: 'any', kind: 'event', title: 'Shrine of Saint Drusus', text: 'Somebody built a shrine here: candle stubs, a cracked aquila, a picture of the saint scratched on a hull plate.',
  options: [
    { label: 'Leave an offering (25 Thrones)', cost: { gold: 25 }, success: [{ type: 'condition', id: 'blessed' }, { type: 'heal', pct: 0.2 }] },
    { label: 'Read the inscriptions', check: { skill: 'forbiddenLore', mod: 10 }, success: [{ type: 'omen' }], failure: [{ type: 'text', t: 'The words are worn smooth.' }] },
    { label: 'Pass by', success: [] },
  ] });
E({ id: 'xenosIdol', biome: 'any', kind: 'event', title: 'The Grinning Idol', text: 'A xenos idol of no material you know grins on a pedestal. The room is suspiciously clean.',
  options: [
    { label: 'Take it', success: [{ type: 'charm', rarity: 'rare' }, { type: 'corruption', n: 2, who: 'one' }, { type: 'combat', elite: true }] },
    { label: 'Check for wards', check: { skill: 'forbiddenLore', mod: -10 }, helper: 'warp', success: [{ type: 'charm', rarity: 'uncommon' }, { type: 'text', t: 'You see the ward, and step around it.' }], failure: [{ type: 'damage', pct: 0.15, who: 'party' }, { type: 'text', t: 'Warp-fire! The idol is gone in the chaos.' }] },
    { label: 'Leave it', success: [{ type: 'text', t: 'Wise. Probably.' }] },
  ] });
E({ id: 'stryxisTrader', biome: 'any', kind: 'event', title: 'A Stryxis Trader', text: 'A hunched xenos in a cloak of a hundred pockets clicks and whistles. It wants to trade. It always wants to trade.',
  options: [
    { label: 'Haggle', check: { skill: 'commerce', mod: 0 }, success: [{ type: 'valuable', tier: 1 }, { type: 'text', t: 'You come out ahead. Somehow.' }], failure: [{ type: 'doubloons', n: -3 }, { type: 'text', t: 'You come out behind. You are not sure how.' }] },
    { label: 'Trade 4 scrip for a relic', cost: { doubloons: 4 }, success: [{ type: 'charm' }] },
    { label: 'Shoo it away', success: [] },
  ] });

// ── keys & mechanisms (always solvable) ─────────────────────────────────────
E({ id: 'sigilKey', biome: 'any', kind: 'key', title: 'The Warp-Key', text: 'A key of blackstone floats above a plinth, humming. It opens the way to this region\'s lord. Warp-wards flicker around it.',
  options: [
    { label: 'Unravel the wards', check: { skill: 'psyniscience', mod: 0 }, helper: 'warp', success: [{ type: 'key' }, { type: 'text', t: 'The wards part. The key is yours.' }], failure: [{ type: 'key' }, { type: 'damage', pct: 0.12, who: 'party' }, { type: 'insanity', n: 1, who: 'party' }, { type: 'text', t: 'The wards burn your minds, but you hold on to the key.' }] },
    { label: 'Grab it and run', success: [{ type: 'key' }, { type: 'damage', pct: 0.08, who: 'one' }] },
  ] });
E({ id: 'meterReset', biome: 'any', kind: 'mechanism', title: 'Controls', text: 'A lever, worn smooth by many hands.',
  options: [
    { label: 'Pull the lever', success: [{ type: 'meter', delta: 0, set: 0 }] },
    { label: 'Leave it', success: [] },
  ] });

// ── region events ───────────────────────────────────────────────────────────
E({ id: 'derelictCockpit', biome: 'docks', kind: 'event', title: 'Derelict Cockpit', text: 'A lander\'s cockpit, fused to the deck. The pilot is still strapped in. The vox still crackles.',
  options: [
    { label: 'Read the logs', check: { skill: 'techUse', mod: 0 }, helper: 'tech', success: [{ type: 'reveal' }, { type: 'meter', delta: 0, set: 0 }], failure: [{ type: 'meter', delta: 2 }, { type: 'text', t: 'Something vents. The air grows thin.' }] },
    { label: 'Strip it for salvage', success: [{ type: 'valuable', tier: 0 }, { type: 'meter', delta: 1 }] },
  ] });
E({ id: 'sealedBrig', biome: 'docks', kind: 'event', title: 'The Sealed Brig', text: 'Someone is hammering on the inside of a brig cell. "Let me out! I know where the Kaptin keeps his loot!"',
  options: [
    { label: 'Hear them out', check: { skill: 'scrutiny', mod: 0 }, success: [{ type: 'gold', amount: 1.5 }, { type: 'text', t: 'They were telling the truth. Mostly.' }], failure: [{ type: 'combat' }] },
    { label: 'Leave them', success: [{ type: 'text', t: 'The hammering follows you down the hall.' }] },
  ] });
E({ id: 'singingFlowers', biome: 'gardens', kind: 'event', title: 'Singing Flowers', text: 'A meadow of pale flowers sings a hymn in High Gothic. It is beautiful. It is wrong.',
  options: [
    { label: 'Listen closely', check: { char: 'WP', mod: 0 }, helper: 'faith', success: [{ type: 'reveal' }, { type: 'meter', delta: 0, set: 0 }], failure: [{ type: 'meter', delta: 2 }, { type: 'insanity', n: 2, who: 'party' }, { type: 'text', t: 'The song gets inside you. Spores billow.' }] },
    { label: 'Burn them', check: { char: 'BS', mod: 10 }, success: [{ type: 'charm' }], failure: [{ type: 'combat' }] },
  ] });
E({ id: 'petrifiedExplorer', biome: 'gardens', kind: 'event', title: 'A Petrified Explorer', text: 'An explorer in old-pattern carapace, turned to wood. Their pack is still on their back.',
  options: [
    { label: 'Pry the pack loose', check: { char: 'S', mod: 0 }, success: [{ type: 'item', tier: 1 }, { type: 'gold', amount: 1 }], failure: [{ type: 'combat' }] },
    { label: 'Say a prayer', check: { char: 'Fel', mod: 10 }, success: [{ type: 'condition', id: 'blessed' }, { type: 'omen' }], failure: [{ type: 'text', t: 'The words come out wrong here.' }] },
  ] });
E({ id: 'stasisCoffin', biome: 'reliquary', kind: 'event', title: 'A Stasis Coffin', text: 'Three rings of glyphs turn on a stasis coffin. Inside, something waits, perfectly preserved.',
  options: [
    { label: 'Solve the glyph-lock', check: { skill: 'logic', mod: 0 }, helper: 'tech', success: [{ type: 'valuable', tier: 2 }, { type: 'charm' }], failure: [{ type: 'damage', pct: 0.1, who: 'party' }, { type: 'text', t: 'Coolant jets from the walls.' }] },
    { label: 'Smash the field generator', success: [{ type: 'valuable', tier: 0 }, { type: 'combat' }] },
  ] });
E({ id: 'cogitatorShrine', biome: 'reliquary', kind: 'event', title: 'Cogitator Shrine', text: 'A cogitator bank prays to itself in binary. One screen shows a map. One shows your Dynasty\'s seal.',
  options: [
    { label: 'Commune with it', check: { skill: 'techUse', mod: 0 }, helper: 'tech', success: [{ type: 'omen' }, { type: 'reveal' }], failure: [{ type: 'text', t: 'The screens go dark, offended.' }] },
    { label: 'Salvage the data-crystals', success: [{ type: 'valuable', tier: 1 }] },
  ] });
E({ id: 'talkingReflection', biome: 'labyrinth', kind: 'event', title: 'The Talking Reflection', text: '"Ask me anything," says your reflection. "But I only tell the truth backwards."',
  options: [
    { label: 'Ask where its lord waits', check: { skill: 'scrutiny', mod: 0 }, success: [{ type: 'reveal' }], failure: [{ type: 'meter', delta: 1 }, { type: 'insanity', n: 1, who: 'one' }, { type: 'text', t: 'The answer twists in your head.' }] },
    { label: 'Ask for luck', success: [{ type: 'token', id: 'fateCoin' }, { type: 'damage', pct: 0.08, who: 'one' }] },
    { label: 'Smash it', check: { char: 'S', mod: 10 }, success: [{ type: 'doubloons', n: 3 }], failure: [{ type: 'combat' }] },
  ] });
E({ id: 'confessional', biome: 'labyrinth', kind: 'event', title: 'The Confessional', text: 'A booth of black glass. A voice: "Confess one sin, receive one blessing."',
  options: [
    { label: 'Confess honestly', check: { skill: 'charm', mod: 0 }, success: [{ type: 'heal', pct: 0.3 }, { type: 'condition', id: 'blessed' }], failure: [{ type: 'text', t: '"Lies," hisses the voice.' }, { type: 'condition', id: 'frightened' }] },
    { label: 'Lie convincingly', check: { skill: 'deceive', mod: -10 }, success: [{ type: 'charm', rarity: 'uncommon' }], failure: [{ type: 'combat' }] },
  ] });
E({ id: 'weighingEngine', biome: 'core', kind: 'event', title: 'The Weighing Engine', text: 'Golden scales float in a gravity well. One pan holds a feather. The other waits for you.',
  options: [
    { label: 'Weigh your Thrones (lose 50)', cost: { gold: 50 }, success: [{ type: 'charm', rarity: 'rare' }] },
    { label: 'Weigh your soul', check: { char: 'WP', mod: -10 }, helper: 'faith', success: [{ type: 'heal', pct: 0.5 }, { type: 'fate', n: 1 }], failure: [{ type: 'damage', pct: 0.15, who: 'party' }, { type: 'corruption', n: 2, who: 'one' }] },
    { label: 'Leave the scales', success: [] },
  ] });
E({ id: 'daemonBargain', biome: 'core', kind: 'event', title: 'The Daemon\'s Bargain', text: 'A voice from a warp-seam offers you anything you want. It has a very reasonable price.',
  options: [
    { label: 'Accept', success: [{ type: 'charm', rarity: 'legendary' }, { type: 'corruption', n: 6, who: 'one' }, { type: 'insanity', n: 4, who: 'one' }] },
    { label: 'Banish it', check: { skill: 'psyniscience', mod: -10 }, helper: 'warp', success: [{ type: 'omen' }, { type: 'pf', n: 1 }, { type: 'text', t: 'It shrieks and is gone. The enclave will hear of this.' }], failure: [{ type: 'combat', elite: true }] },
    { label: 'Walk away', success: [{ type: 'insanity', n: 1, who: 'party' }] },
  ] });

export const EVENT_LIST = Object.values(EVENTS);

export function eventsFor(biome: ZoneId, kind: EventDef['kind']): EventDef[] {
  return EVENT_LIST.filter((e) => e.kind === kind && (e.biome === 'any' || e.biome === biome) && e.id !== 'meterReset' && e.id !== 'sigilKey');
}
