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

interface Entry { key: string; kind: 'portrait' | 'sprite' | 'icon' | 'scene'; group: string; name: string; subject: string; anchor?: boolean }
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
  out.push({ key: `charms/${c.id}`, kind: 'icon', group: `relic:${c.rarity}`, name: c.name, subject: `a relic or curio called "${c.name}", found in a xenos Blackstone Fortress. ${STYLE}.`, anchor });
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
  fortress: 'a vast black Blackstone Fortress drifting in the void, a tiny derelict trader beside it, the enclave\'s lights at its mouth',
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
writeFileSync('art/spec.json', JSON.stringify({ game: 'warp_dice', count: out.length, entries: out }, null, 1));
console.log(`${out.length} art entries`);
