/**
 * Export every image the game wants as art/spec.json for an image pipeline.
 * Each entry names its `group` (the house-style family it must match) and a
 * subject. Missing art falls back to drawn placeholders, so this is optional.
 *   node scripts/export-art-spec.ts
 */
import { writeFileSync } from 'node:fs';
import { CAREERS } from '../src/content/careers.ts';
import { PORTRAITS } from '../src/content/portraits.ts';
import { MONSTER_LIST } from '../src/content/monsters.ts';
import { BIOMES } from '../src/content/biomes.ts';
import { CHARMS } from '../src/fortune/charms.ts';
import { ITEMS } from '../src/content/items.ts';
import { EVENT_LIST } from '../src/content/events.ts';

interface Entry { key: string; kind: 'portrait' | 'sprite' | 'icon' | 'scene' | 'vignette'; group: string; name: string; subject: string; anchor?: boolean }
const out: Entry[] = [];
const STYLE = 'grimdark gothic far-future, brass and void-black, candlelit, painterly';

for (const p of PORTRAITS) {
  const c = CAREERS[p.careerId];
  out.push({ key: p.key, kind: 'portrait', group: `career:${p.careerId}`, name: c.name, subject: `${p.look}. A ${c.name} — ${c.tagline} ${STYLE}.`, anchor: p.key.endsWith('_1') });
}
const seenZone = new Set<string>();
for (const m of MONSTER_LIST) {
  const anchor = !seenZone.has(m.biome) && m.role !== 'boss';
  if (anchor) seenZone.add(m.biome);
  out.push({ key: `monsters/${m.biome}_${m.id}`, kind: 'sprite', group: `zone:${m.biome}`, name: m.name, subject: `${m.look}. ${m.flavor}${m.role === 'boss' ? ' A towering BOSS, filling the frame.' : ''}`, anchor });
}
const seenRarity = new Set<string>();
for (const c of CHARMS) {
  const anchor = !seenRarity.has(c.rarity);
  seenRarity.add(c.rarity);
  out.push({ key: `charms/${c.id}`, kind: 'icon', group: `relic:${c.rarity}`, name: c.name, subject: `a single small relic or curio called "${c.name}" — paint the literal object the name suggests, salvaged from a derelict black-stone xenos fortress. ${STYLE}.`, anchor });
}
const seenCat = new Set<string>();
for (const d of Object.values(ITEMS)) {
  const anchor = !seenCat.has(d.kind);
  seenCat.add(d.kind);
  out.push({ key: d.art, kind: 'icon', group: `item:${d.kind}`, name: d.name, subject: `${d.name}${d.text ? ` — ${d.text}` : ''}, Rogue Trader era Imperial equipment. ${STYLE}.`, anchor });
}
const SCENES: Record<string, Record<string, string>> = {
  docks: { corridor: 'a frost-rimed docking spine inside a black-stone xenos fortress, wrecked ships moored to it', hold: 'a breached cargo hold venting to the void, crates and corpses drifting', vault: 'a purser\'s strongroom on a wrecked ship, gilded chests', boss: 'a throne of salvage built from a hundred wrecked ships' },
  gardens: { corridor: 'an alien jungle grown through black-stone corridors, glowing pods', grove: 'a carnivorous flower grove with Kroot totems', cache: 'an overgrown reliquary of explorer packs', boss: 'a cathedral-sized carnivorous flower heart breathing spores' },
  reliquary: { corridor: 'flooded relic stacks, black coolant, stasis fields holding artefacts', vault: 'a drowned vault of stasis coffins', pumps: 'a brass pump station over black coolant', boss: 'a cathedral of cogitators half-submerged in coolant' },
  labyrinth: { corridor: 'an obsidian glass corridor reflecting impossible rooms', chapel: 'a chamber of floating black glass shards and prismatic light', lenses: 'a vault of giant obsidian lenses', boss: 'a vast black-glass nave with a cracked colossal mirror' },
  core: { corridor: 'a floating causeway between engines larger than cathedrals', engine: 'a gravitic engine hall with debris orbiting slowly', vault: 'a warp-sealed reliquary', boss: 'the Engine of Ages: a colossal black-stone engine leaking warp-light' },
};
for (const [b, scenes] of Object.entries(SCENES)) for (const [s, text] of Object.entries(scenes)) out.push({ key: `scenes/${b}_${s}`, kind: 'scene', group: `scene:${b}`, name: `${BIOMES[b as keyof typeof BIOMES].name} — ${s}`, subject: `${text}. ${STYLE}.`, anchor: s === 'corridor' });
const TOWN: Record<string, string> = {
  fortress: 'a vast, ancient black-stone xenos fortress drifting in the void, a tiny derelict trader beside it, the enclave\'s lights at its mouth',
  guild: 'a muster hall in a survivor enclave of salvaged bulkheads and hanging lumens',
  chronicle: 'a Rogue Trader\'s ledger and a broken Warrant of Trade seal by candlelight',
  market: 'a crowded void-port market of stalls selling guns, armour and chems',
  exchange: 'a trader\'s counter weighing xenos relics against Thrones',
  shrine: 'a Mechanicus tech-shrine with an anvil, cogs and incense',
  drill: 'an armsmen drill deck with targets and sparring rings',
  hold: 'the cargo hold of a derelict trader, sparse and patched',
  codex: 'a cogitator archive of records and bestiary data-slates',
};
for (const [k, t] of Object.entries(TOWN)) out.push({ key: `town/${k}`, kind: 'scene', group: 'scene:town', name: k, subject: `${t}. ${STYLE}.`, anchor: k === 'fortress' });

// ── vignettes: illustrated banners over events, popups and story beats ─────
// The player's own explorers never show their faces (helmets, hoods, shadow), so
// the art never contradicts the portraits they chose.
// Rotating camera directions, so neighbouring events in a region never share a
// layout. (Without them every vignette came out as the same centred tableau.)
const SHOTS = [
  'Camera: a low angle looking up at the subject, which towers over the viewer.',
  'Camera: a close, intimate shot; the subject fills the frame in rich texture and detail.',
  'Camera: a high angle looking down into the space, the subject small within a vast setting.',
  'Camera: a side-on view along strong diagonal lines, the subject off-centre to one side.',
  'Camera: a wide, symmetrical, cathedral-like composition, the subject framed by architecture.',
  'Camera: a dramatic close-up on the key object or face, the background melting into shadow.',
  'Camera: a tilted, dynamic angle, as if frozen mid-action.',
  'Camera: a three-quarter view from slightly above, the subject lit by its own light source.',
];
const seenVig = new Map<string, number>();
for (const e of EVENT_LIST) {
  const group = `vignette:${e.biome}`;
  const n = seenVig.get(group) ?? 0;
  seenVig.set(group, n + 1);
  out.push({ key: `events/${e.id}`, kind: 'vignette', group, name: e.title, subject: `${e.look}. ${SHOTS[n % SHOTS.length]}`, anchor: n === 0 });
}

// Moments and chapters each carry their own framing and colour, written out.
const MOMENTS: Record<string, string> = {
  victory: 'close-up of an armoured gauntlet lifting a blood-spattered bone die from the chest of a slain xenos, gun smoke curling through a shaft of hot white light, brass shell casings scattered on black stone. Warm, triumphant gold and red',
  lordSlain: 'high angle looking down on the crowned helm of a slain colossal warlord rolling across a cracked black-stone floor, its vast armoured body sprawled in the background, fires burning, embers rising. Blazing orange firelight',
  boons: 'top-down view of a gambler\'s green felt cloth spread with bone dice showing pips, face-up tarot cards painted with a skull and an eagle, and a few strange relics, lit by a single candle. Deep green felt and candle gold',
  hoard: 'low angle up a mountain of plundered treasure: gilded armour, jewelled weapons, open chests spilling coins and glowing xenos relics around a broken throne, glinting in torchlight. Rich gold and jewel tones',
  scavenger: 'side view of a hunched scavenger-trader leaning over a cluttered stall wedged into a fortress alcove, lenses for eyes, bony fingers holding up a charm, hundreds of dice and relics hanging on strings around them, a swinging green lumen. Sickly green and rust',
  retreat: 'wide high view of a narrow gantry over an abyss, three tiny explorers running toward the warm lights of a ramshackle enclave, carrying a wounded comrade, the vast black-stone fortress mouth erupting with pursuing shadows behind them. Cold blue night, amber enclave lights',
  wiped: 'overhead view of a dented helmet and a dropped lumen lying in spreading blood on black stone, long claw marks gouged into the floor beside them, the lumen\'s beam pointing into darkness. Cold dead blue-grey light, blood red',
  captainLost: 'a captain\'s body lying in state on a stone bier draped in a noble house banner, a sword laid on the chest, rows of tall candles, a single beam of pale light falling from a high window in a dark chapel, mourners kneeling at the far edge. Pale silver light and candle gold',
  blooded: 'side view of a crowded enclave tavern of salvaged bulkheads, survivors cheering and raising tankards to a young explorer with a bandaged head, hanging lumens, steam and warmth. Festive amber and copper',
  dynastyEnded: 'close-up of a noble signet ring and a torn house banner drifting weightless in the void, behind them a gutted derelict starship being cut apart by scavenger torches, sparks streaming into the dark. Cold void black, scattered sparks',
};
for (const [id, subject] of Object.entries(MOMENTS)) out.push({ key: `moments/${id}`, kind: 'vignette', group: 'vignette:moments', name: id, subject: `${subject}.`, anchor: id === 'victory' });

const STORY: Record<string, string> = {
  prologue: 'wide space battle: a vast ornate noble flagship being boarded and scuttled by a sleek rival warship, broadsides of fire between them, boarding torpedoes, debris and escape pods, the flagship listing toward a blood-red nebula. Red and gold',
  docks: 'close interior view inside a frost-covered lifeboat: a frozen pilot slumped over the controls, an open log-book on their lap, a noble crest painted on the bulkhead, frozen wrecks visible through the cracked viewport. Icy blue and white',
  gardens: 'night by an enclave campfire: a tall feathered xenos hunter with a long rifle crouches across the fire, offering a bone carving with one clawed hand, sparks rising between them. Warm firelight against teal jungle dark',
  reliquary: 'low angle in a flooded cogitator vault: one towering screen glowing green above black water, showing the outline of a starship beside a wax seal, cables hanging like vines, reflections rippling. Green glow on black water',
  labyrinth: 'black glass exploding into a thousand falling shards, in the largest shard the reflection of a cruel lord on a starship bridge, his hand sunk into black stone, rainbows of refracted light everywhere. Prismatic and violet',
  core: 'a colossal ring-shaped engine of black stone, larger than a city, falling still, warp-light dimming in its cracks, a narrow causeway leading across the void toward a distant glowing heart. Magenta warp-light fading to cold dark',
  finale: 'low angle up at a captain\'s throne on the overgrown bridge of a lost flagship fused into black stone, a cruel lord seated on it with a sealed parchment warrant in his fist, glowing veins of the fortress pulsing through his skin. Sickly green and gold',
  epilogue: 'close-up of a sealed parchment warrant resting on a brass lectern on a ship\'s bridge, golden dawn light pouring through the viewport beyond it, where a vast black-stone fortress dwindles among the stars. Golden dawn',
};
for (const [id, subject] of Object.entries(STORY)) out.push({ key: `story/${id}`, kind: 'vignette', group: 'vignette:story', name: id, subject: `${subject}.`, anchor: id === 'prologue' });
writeFileSync('art/spec.json', JSON.stringify({ game: 'warp_dice', count: out.length, entries: out }, null, 1));
console.log(`${out.length} art entries`);
