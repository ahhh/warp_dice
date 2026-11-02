/**
 * The story: a Rogue Trader who lost everything. A prologue, one chapter per
 * region of the Fortress cleared, a gate to the heart of the Fortress, and an
 * epilogue. Chapters are keyed by region so progress derives from the
 * keystones a Dynasty has already earned.
 */
import type { ZoneId, GameState, Hero } from '../engine/types.ts';

export interface Chapter { id: string; title: string; head: string; text: string[] }

export function prologue(g: GameState): Chapter {
  const d = g.profile.dynastyName, s = g.profile.shipName;
  return {
    id: 'prologue', head: 'Prologue', title: 'A Warrant Lost',
    text: [
      `For eleven generations House ${d} held a Warrant of Trade, sealed by the High Lords of Terra. It went down with the flagship when the ${s} was betrayed at the edge of the Koronus Expanse — boarded by a rival Dynasty, scuttled, and dragged into the dark.`,
      'You are what is left: a Lord-Captain with a famous name, an empty treasury, and a derelict trader that leaks air on three decks. Few outside your crew know the Warrant is gone. Keep it that way.',
      'Your Navigator followed the wreck\'s death-cry to a Blackstone Fortress drifting in the void — a xenos vault older than the Imperium, its halls shifting with every venture. Survivors have built an enclave at its threshold. They trade with anyone who comes back alive.',
      'Somewhere inside is the wreck of the flagship, and with it, your Warrant. Go in. Bring back Thrones and treasure. Rebuild your legacy one venture at a time — and if the Lord-Captain falls, the Dynasty falls with them.',
    ],
  };
}

export const CHAPTERS: Record<ZoneId, Chapter> = {
  docks: { id: 'docks', head: 'Chapter I', title: 'Salvage Rights',
    text: ['Among the wrecks of the Shattered Quays you find a lifeboat bearing your family\'s crest. Its log ends mid-sentence: "They are taking her deeper. Toward the heart."', 'The enclave hears you came back from the Quays with treasure. Doors open that were shut yesterday.'] },
  gardens: { id: 'gardens', head: 'Chapter II', title: 'The Hunter\'s Bargain',
    text: ['The Bloom-Heart withers. A Kroot guide who watched you fight approaches the enclave fire and offers a trade: the location of a second wreck, for the right to eat whatever killed your crew.', 'The wreck is a rival vessel, flying the colours of House Rathbone.'] },
  reliquary: { id: 'reliquary', head: 'Chapter III', title: 'The Catalogue',
    text: ['The Reliquary\'s machine-mind catalogued everything that ever entered the Fortress. In its last flooded vault you find an entry: your flagship, logged, and a Warrant of Trade "in the keeping of Lord-Captain Rathbone."', 'He did not merely sink your ship. He followed it here.'] },
  labyrinth: { id: 'labyrinth', head: 'Chapter IV', title: 'What the Mirror Kept',
    text: ['The black glass shatters. In every falling shard you see the same thing: Rathbone, standing on the bridge of your flagship, his hand sunk into the stone of the Fortress\'s heart.', 'He sees you too. He smiles.'] },
  core: { id: 'core', head: 'Chapter V', title: 'The Engine Wakes',
    text: ['The Gravitic Heart falls still. For one moment you can feel where the Fortress is taking you — and who is steering.', 'The way to the heart stands open. Only a Lord-Captain at the height of their renown could hope to take back what was stolen.'] },
};

export const FINALE = {
  id: 'finale',
  name: 'The Heart of the Fortress',
  tagline: 'Your flagship\'s wreck, your Warrant, and the man who took them.',
  premise: 'At the heart of the Blackstone Fortress lies the wreck of your flagship, fused into the black stone. Rathbone the Usurper has bound himself to the Fortress, and the Warrant of Trade is in his hand. Every die in his presence answers to him.',
  bossRoom: 'The Bridge of the Lost Flagship',
  bossText: 'Your family\'s bridge, overgrown with blackstone. Rathbone stands at the captain\'s throne, the Warrant in his fist, the Fortress breathing through his skin.',
};

export const EPILOGUE: Chapter = {
  id: 'epilogue', head: 'Epilogue', title: 'The Warrant Restored',
  text: [
    'Rathbone falls, and the Fortress lets go of him. The Warrant of Trade lies on the deck of your old bridge, its seals unbroken.',
    'You carry it out through the enclave, and every survivor who ever doubted you watches it pass. By the time your derelict trader limps back into the Expanse, the story is already ahead of you.',
    'The Fortress still drifts in the void. It still shifts. There are still treasures inside. Your Dynasty will be back.',
  ],
};

/** The finale needs the Lord-Captain in the party at this power level. */
export const FINALE_LEVEL = 18;

export function finaleBlocked(g: GameState, party: Hero[]): string | null {
  const cleared = (Object.keys(CHAPTERS) as ZoneId[]).filter((b) => (g.profile.sigils[b] ?? 0) > 0).length;
  if (cleared < 5) return `Clear all five regions first (${cleared}/5).`;
  const lc = party.find((h) => h.lordCaptain);
  if (!lc) return 'The Lord-Captain must lead the assault.';
  if (lc.level < FINALE_LEVEL) return `The Lord-Captain must reach power level ${FINALE_LEVEL} (Rank 7). Now: ${lc.level}.`;
  return null;
}

export function earnedChapters(g: GameState): Chapter[] {
  return (Object.keys(CHAPTERS) as ZoneId[]).filter((b) => (g.profile.sigils[b] ?? 0) > 0).map((b) => CHAPTERS[b]);
}

export function storyOf(g: GameState) {
  return (g.profile.story ??= { seen: [], warrant: 0 });
}
