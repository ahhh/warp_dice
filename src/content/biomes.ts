/**
 * The five regions of the Blackstone Fortress. The Fortress shifts between
 * every venture, so each region is a fresh seeded labyrinth each time; what
 * stays the same is its character and its meter.
 */
import type { ZoneId, RoomType } from '../engine/types.ts';

export interface BiomeDef {
  id: ZoneId;
  name: string;
  tagline: string;
  premise: string;
  color: string;
  accent: string;
  meter: { name: string; max: number; text: string; icon: string };
  rooms: Partial<Record<RoomType, string[]>>;
  atmosphere: string[];
  details: string[];
  factions: string[];
  anomalies: string[];
  objectives: string[];
  hooks: string[];
  tag: { id: string; chance: number; label: string };
  resetTag: { id: string; label: string };
  scenes: string[];
}

export const BIOMES: Record<ZoneId, BiomeDef> = {
  docks: {
    id: 'docks', name: 'The Shattered Quays', tagline: 'Docking spines, breached holds and drifting wrecks.',
    premise: 'Where the Fortress swallowed a hundred ships and never let them go. Hull breaches vent to the void, and every bulkhead you seal buys a little air.',
    color: '#b86a3a', accent: '#ffb347',
    meter: { name: 'Decompression', max: 6, icon: '💨', text: 'Breached rooms raise Decompression. At 3+, fights begin with the party Bleeding from void-burn — but Void and Aquila dice score +1 Mult. Sealed bulkheads reset it.' },
    rooms: {
      corridor: ['Docking Spine', 'Cargo Gallery', 'Gantry Walk', 'Hull-Seam Crawlway', 'Loading Rails', 'Mooring Clamp'],
      combat: ['Breached Hold', 'Customs Hall', 'Wreck-Bridge', 'Torpedo Gallery'],
      elite: ['The Gun Deck', 'Reaver\'s Prize Hold'],
      treasure: ['Sealed Strongroom', 'Purser\'s Vault'],
      peddler: ['Scavenger\'s Hulk'], shrine: ['Navigator\'s Chapel'], event: ['Derelict Cockpit', 'Lifepod Bay', 'Sealed Brig'],
      camp: ['Pressurised Refuge'], boss: ['The Wreck-Throne'], key: ['Harbourmaster\'s Office'], entrance: ['Boarding Tube'], mechanism: ['Bulkhead Controls'],
    },
    atmosphere: ['Frost forms where the void leaks in.', 'A distant hull groans like a dying whale.', 'Emergency lumens pulse red.', 'The air tastes of ozone and old blood.', 'Somewhere a klaxon has sounded for a thousand years.'],
    details: ['A ship\'s name-plate, half melted: "...of Saint Kade".', 'Void-suited corpses drift against the ceiling.', 'A cargo crate of lho-sticks, still sealed.', 'Bolt-holes stitch the bulkhead in a neat line.', 'Someone has chalked a tally of days on the wall. It stops at 311.'],
    factions: ['Ork freebooterz', 'renegade reavers', 'rogue servitors', 'scavenger gangs'],
    anomalies: ['the docks are rearranging themselves', 'a ship that sank a century ago has docked again', 'the void outside the breaches is full of stars that should not be there'],
    objectives: ['recover the manifest of a lost Dynasty ship', 'salvage a working cogitator', 'kill the warlord who holds the quays'],
    hooks: ['an old crewman swears your family\'s cutter is moored here', 'the enclave needs a pressure-seal ring'],
    tag: { id: 'breach', chance: 0.4, label: 'Hull breach — the air is thin' },
    resetTag: { id: 'sealed', label: 'Sealed bulkhead' },
    scenes: ['corridor', 'hold', 'vault', 'boss'],
  },
  gardens: {
    id: 'gardens', name: 'The Xenos Arboretum', tagline: 'Grown chambers, carnivorous flora, Kroot hunting grounds.',
    premise: 'Somebody, aeons ago, grew a jungle in the Fortress. It has spread through a dozen decks and it is hungry. Every step shakes loose more spores.',
    color: '#4f8f4a', accent: '#c8e070',
    meter: { name: 'Bloom', max: 6, icon: '🍄', text: 'Every few steps raise Bloom. At 3+, foes regenerate — but Ledger and Eye dice score +4 Chips. Dead-air chambers reset it.' },
    rooms: {
      corridor: ['Root-Choked Passage', 'Fungal Gallery', 'Vine Bridge', 'Spore Vent', 'Seed Vault Corridor'],
      combat: ['Hunting Ground', 'Kroot Kill-Site', 'Strangling Grove'],
      elite: ['The Shaper\'s Clearing', 'Nest of Venomwings'],
      treasure: ['Overgrown Reliquary', 'Hunter\'s Cache'],
      peddler: ['Stryxis Caravan'], shrine: ['Xenos Altar'], event: ['Singing Flowers', 'Petrified Explorer', 'The Seed-Heart'],
      camp: ['Dead-Air Chamber'], boss: ['The Bloom-Heart'], key: ['Germination Vault'], entrance: ['Airlock of Thorns'], mechanism: ['Atmospheric Scrubber'],
    },
    atmosphere: ['Spores drift like golden snow.', 'The plants turn to follow you.', 'Something huge breathes beneath the floor.', 'It is warm and wet and smells of meat.', 'Bioluminescent pods pulse in time with your heart.'],
    details: ['A Kroot feather-totem hangs from a branch.', 'A lasgun grows out of a tree trunk.', 'Flowers bloom in the shape of faces.', 'A Mechanicus servo-skull, wrapped in roots, still blinks.', 'Bones are arranged in a deliberate spiral.'],
    factions: ['renegade Kroot', 'spore-thralls', 'carnivorous flora', 'venomwings'],
    anomalies: ['the jungle is dreaming', 'the flowers sing in High Gothic', 'the seasons change by the hour'],
    objectives: ['burn the Bloom-Heart', 'recover a Magos Biologis\'s samples', 'drive off the Kroot war-band'],
    hooks: ['the enclave\'s chirurgeon needs a rare pollen', 'a Kroot guide wants revenge on his old kindred'],
    tag: { id: 'spore', chance: 0.5, label: 'Spore-thick' },
    resetTag: { id: 'deadAir', label: 'Dead air' },
    scenes: ['corridor', 'grove', 'cache', 'boss'],
  },
  reliquary: {
    id: 'reliquary', name: 'The Drowned Reliquary', tagline: 'Flooded vaults, coolant seas and Rak\'Gol raiders.',
    premise: 'A vault-deck of relics no one can name, half-drowned in black coolant. Pump stations still move the tide between wings.',
    color: '#3a8fb8', accent: '#7fe0e0',
    meter: { name: 'Coolant', max: 1, icon: '🌊', text: 'Pump levers raise or lower the coolant. Low coolant opens flooded passages; high coolant gives Cryo and Void dice +2 Mult but foes resist Energy.' },
    rooms: {
      corridor: ['Flooded Stacks', 'Coolant Conduit', 'Relic Gallery', 'Collapsed Archive', 'Sump Stair'],
      combat: ['Drowned Vault', 'Pump Gallery', 'Sorting Hall'],
      elite: ['The Index Vault', 'Rak\'Gol Wolf-Pen'],
      treasure: ['Stasis Vault', 'Relic Cabinet'],
      peddler: ['Salvager\'s Barge'], shrine: ['Altar of the Machine'], event: ['Cogitator Shrine', 'Stasis Coffin', 'Bell of the Deep'],
      camp: ['Dry Alcove'], boss: ['The Reliquary Heart'], key: ['Curator\'s Lectern'], entrance: ['Sump Hatch'], mechanism: ['Pump Room'],
    },
    atmosphere: ['Coolant laps at your boots, black and freezing.', 'Relics hang in stasis fields like insects in amber.', 'The pumps groan like whales.', 'Data-scrolls float past like weed.', 'Blue lumen-light wavers under the surface.'],
    details: ['A Rak\'Gol trophy rack, hung with Imperial skulls.', 'A stasis field holds a single falling drop of water.', 'A cogitator mutters binary to itself.', 'A Mechanicus seal reads "INTERDICTED".', 'Something large has broken out of a vault from the inside.'],
    factions: ['Rak\'Gol marauders', 'drowned servitors', 'hereteks', 'cryo-wraiths'],
    anomalies: ['the coolant flows uphill', 'the relics are whispering', 'the vaults are opening one by one'],
    objectives: ['recover a stasis-locked artefact', 'silence the Reliquary\'s machine-mind', 'drive the Rak\'Gol from the vaults'],
    hooks: ['the enclave Magos wants a cogitator core', 'your family\'s archive was stored here, they say'],
    tag: { id: 'flooded', chance: 0.3, label: 'Waist-deep coolant' },
    resetTag: { id: 'pump', label: 'Pump lever' },
    scenes: ['corridor', 'vault', 'pumps', 'boss'],
  },
  labyrinth: {
    id: 'labyrinth', name: 'The Obsidian Labyrinth', tagline: 'Black-glass halls that move when you are not looking.',
    premise: 'The Fortress\'s own architecture laid bare: obsidian corridors that reflect things that are not there. Facing matters here: some doors exist only in the right reflection.',
    color: '#8a7cc9', accent: '#f0a8ff',
    meter: { name: 'Reflection', max: 3, icon: '◈', text: 'Mirrored halls swap Left and Right. Visiting them raises Reflection; at 3, hidden phase-doors reveal themselves.' },
    rooms: {
      corridor: ['Obsidian Hall', 'Hall of Facets', 'Shattered Nave', 'Black-Glass Walk', 'Silent Cloister'],
      combat: ['Chamber of Shards', 'Reflecting Pool', 'Lens Gallery'],
      elite: ['The Corsair\'s Court', 'Hall of Doubles'],
      treasure: ['Glass Reliquary', 'Lens Vault'],
      peddler: ['Mirror-Merchant\'s Alcove'], shrine: ['Altar of Reflections'], event: ['Talking Reflection', 'Broken Window', 'The Confessional'],
      camp: ['Dim Sanctuary'], boss: ['The Bright Heart'], key: ['Lens Altar'], entrance: ['Obsidian Gate'], mechanism: ['Light Angle Room'],
    },
    atmosphere: ['Your reflection moves a heartbeat late.', 'Light splits into colours with no names.', 'The glass hums a single note.', 'Every surface shows a different room.', 'The floor reflects a sky that is not there.'],
    details: ['A reflection waves at you. You did not wave.', 'An Eldar rune, scratched into the glass, reads "turn back".', 'Shards hang in the air, motionless.', 'A cracked mirror shows the Fortress lord\'s chamber.', 'Your Navigator refuses to look at the walls.'],
    factions: ['Eldar corsairs', 'shades', 'mirror-doubles', 'labyrinth wardens'],
    anomalies: ['reflections are trying to swap places', 'the corridors are learning your route', 'something is cracking the glass from inside'],
    objectives: ['seal the cracked heart-mirror', 'recover the Lens of the Fortress', 'free an explorer trapped in a reflection'],
    hooks: ['a crewman swears they saw your lost flagship in a mirror', 'the enclave pays for a perfect obsidian lens'],
    tag: { id: 'mirror', chance: 0.35, label: 'Mirrored — Left and Right are swapped' },
    resetTag: { id: 'dim', label: 'Dim light' },
    scenes: ['corridor', 'chapel', 'lenses', 'boss'],
  },
  core: {
    id: 'core', name: 'The Gravitic Heart', tagline: 'Silent engines, shifting gravity, the warp seeping in.',
    premise: 'The engines that move the Fortress through the void. Gravity turns as the heart beats, and the warp seeps through the seams.',
    color: '#5aa9ff', accent: '#ffd36e',
    meter: { name: 'Gravity', max: 3, icon: '🌌', text: 'Every few steps gravity turns, rotating your directions. Low gravity grants +1 reroll in fights. Anchor-plates stabilise it.' },
    rooms: {
      corridor: ['Floating Causeway', 'Engine Spine', 'Gravitic Shaft', 'Silent Turbine', 'Warp-Seam'],
      combat: ['Gravity Well', 'Reactor Gallery', 'Engine Hall'],
      elite: ['The Sentinel Ring', 'Warden\'s Orbit'],
      treasure: ['Engine Vault', 'Warp-Sealed Reliquary'],
      peddler: ['Pilgrim\'s Camp'], shrine: ['Altar of Fate'], event: ['Weighing Engine', 'Sleeping Star', 'The Daemon\'s Bargain'],
      camp: ['Anchor Shrine'], boss: ['The Engine of Ages'], key: ['Star-Key Plinth'], entrance: ['Falling Gate'], mechanism: ['Gravity Lever'],
    },
    atmosphere: ['Debris orbits slowly through the hall.', 'There is no sound at all.', 'Warp-light leaks through hairline cracks.', 'Your hair floats as gravity slips.', 'Engines larger than cathedrals turn without power.'],
    details: ['A Chaos sigil is burned into the deck plate.', 'A frozen Ork floats, mid-scream.', 'A bell rings with no clapper.', 'A body is pinned to the ceiling by its own weight.', 'A pilgrim\'s lumen still burns.'],
    factions: ['blackstone sentinels', 'warp-spawn', 'chaos cultists', 'renegade psykers'],
    anomalies: ['time leaks through the seams', 'the warp is breathing', 'the Fortress is waking'],
    objectives: ['still the Engine of Ages', 'close the warp-seam', 'learn where the Fortress is taking you'],
    hooks: ['your Navigator dreams of this place every night', 'the enclave\'s oldest survivor came back from here, once'],
    tag: { id: 'drift', chance: 0.35, label: 'Weightless' },
    resetTag: { id: 'anchor', label: 'Anchor-plate' },
    scenes: ['corridor', 'engine', 'vault', 'boss'],
  },
};

export const BIOME_ORDER: ZoneId[] = ['docks', 'gardens', 'reliquary', 'labyrinth', 'core'];
