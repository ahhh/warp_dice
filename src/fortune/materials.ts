/** Fortune dice: materials, special dice, and bag construction. Faces are d10s (1–10). */
import type { CareerId, Face, FaceMod, FortuneDie, Material } from '../engine/types.ts';
import type { Rng } from '../engine/rng.ts';

export interface MaterialInfo { id: Material; name: string; color: string; ink: string; text: string }

export const MATERIALS: Record<Material, MaterialInfo> = {
  iron: { id: 'iron', name: 'Iron', color: '#8f8c84', ink: '#14120e', text: 'Plain ship-iron. No special effect; never forms a Set.' },
  aquila: { id: 'aquila', name: 'Aquila', color: '#c08a2e', ink: '#1f1400', text: 'Rogue Trader affinity.' },
  adamant: { id: 'adamant', name: 'Adamant', color: '#9fb2c4', ink: '#0f1b26', text: 'Arch-militant affinity.' },
  warp: { id: 'warp', name: 'Warp', color: '#7a63b8', ink: '#f2efff', text: 'Astropath affinity.' },
  cog: { id: 'cog', name: 'Cog', color: '#b3332f', ink: '#fff0f0', text: 'Explorator affinity.' },
  creed: { id: 'creed', name: 'Creed', color: '#efe3c2', ink: '#3b2600', text: 'Missionary affinity.' },
  eye: { id: 'eye', name: 'Eye', color: '#2fa59a', ink: '#04201d', text: 'Navigator affinity.' },
  ledger: { id: 'ledger', name: 'Ledger', color: '#4f8f4a', ink: '#071d06', text: 'Seneschal affinity.' },
  void: { id: 'void', name: 'Void', color: '#3a6fb8', ink: '#eaf4ff', text: 'Void-master affinity.' },
  throne: { id: 'throne', name: 'Throne', color: '#f2c94c', ink: '#2d1c00', text: 'When scored: +1 scrip.' },
  crystal: { id: 'crystal', name: 'Blackstone', color: '#2a2a33', ink: '#cfd3ff', text: 'When scored: ×2 mult. 1 in 4 chance to crumble.' },
  xenos: { id: 'xenos', name: 'Xenos', color: '#ffffff', ink: '#222', text: 'Counts as every material.' },
  loaded: { id: 'loaded', name: 'Loaded', color: '#6c6f74', ink: '#f4f4f4', text: 'Rolls twice and keeps the higher face.' },
  cryo: { id: 'cryo', name: 'Cryo', color: '#9ad8f0', ink: '#082231', text: 'When scored: +8 chips.' },
};

export const CLASS_MATERIAL: Record<CareerId, Material> = {
  rogueTrader: 'aquila', archMilitant: 'adamant', astropath: 'warp', explorator: 'cog',
  missionary: 'creed', navigator: 'eye', seneschal: 'ledger', voidMaster: 'void',
};

export const FACE_MODS: Record<FaceMod, { name: string; text: string; glyph: string }> = {
  gilded: { name: 'Gilded', text: '+1 scrip when scored.', glyph: '¤' },
  keen: { name: 'Keen', text: '+6 chips when scored.', glyph: '◆' },
  fierce: { name: 'Fierce', text: '+2 mult when scored.', glyph: '✦' },
  savage: { name: 'Savage', text: '×1.5 mult when scored.', glyph: '✸' },
  wild: { name: 'Wild', text: 'Counts as any value.', glyph: '★' },
  blessed: { name: 'Blessed', text: '1 in 3 chance: +6 mult when scored.', glyph: '✠' },
  cursed: { name: 'Tainted', text: 'Scores no pips and -1 mult.', glyph: '☠' },
};

export const MAX_FACE = 10;

export function standardFaces(): Face[] {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({ v }));
}

export function newDieUid(rng: Rng): string {
  return `d${Math.floor(rng.next() * 2 ** 32).toString(36)}${Math.floor(rng.next() * 2 ** 32).toString(36)}`;
}

export function makeDie(rng: Rng, material: Material, faces?: Face[], name?: string): FortuneDie {
  return { uid: newDieUid(rng), material, faces: faces ?? standardFaces(), name };
}

export interface SpecialDie { id: string; name: string; material: Material; faces: Face[]; text: string; rarity: 'common' | 'uncommon' | 'rare' }

const F = (...v: number[]) => v.map((x) => ({ v: x }));

export const SPECIAL_DICE: SpecialDie[] = [
  { id: 'twinned', name: 'Twin-Cast Die', material: 'iron', faces: F(5, 5, 5, 5, 5, 6, 6, 6, 6, 6), text: 'Only fives and sixes. Pairs come easy.', rarity: 'common' },
  { id: 'highroller', name: "Gambler's Die", material: 'iron', faces: F(6, 7, 7, 8, 8, 9, 9, 10, 10, 10), text: 'Weighted toward big pips.', rarity: 'uncommon' },
  { id: 'snake', name: 'Heretic Die', material: 'warp', faces: F(1, 1, 1, 1, 1, 10, 10, 10, 10, 10), text: 'Ones and tens: damnation or fury.', rarity: 'common' },
  { id: 'ladder', name: 'Cogitator Die', material: 'iron', faces: [...F(3, 4, 5, 6, 7, 4, 5, 6, 7), { v: 5, mod: 'wild' }], text: 'Built for straights. One wild face.', rarity: 'uncommon' },
  { id: 'goldbug', name: 'Tithe Die', material: 'throne', faces: standardFaces().map((f, i) => (i % 2 ? { ...f, mod: 'gilded' as FaceMod } : f)), text: 'Throne die with five gilded faces.', rarity: 'uncommon' },
  { id: 'glass', name: 'Blackstone Shard', material: 'crystal', faces: standardFaces(), text: '×2 mult when scored; might crumble.', rarity: 'uncommon' },
  { id: 'prism', name: 'Xenos Die', material: 'xenos', faces: standardFaces(), text: 'Counts as every material — Sets love it.', rarity: 'rare' },
  { id: 'loaded', name: 'Loaded Die', material: 'loaded', faces: standardFaces(), text: 'Rolls twice, keeps the higher.', rarity: 'uncommon' },
  { id: 'frost', name: 'Cryo Die', material: 'cryo', faces: standardFaces(), text: '+8 chips whenever it scores.', rarity: 'common' },
  { id: 'nine', name: 'Relic Die', material: 'aquila', faces: F(6, 6, 7, 7, 8, 8, 9, 9, 10, 10), text: 'Faces from six to ten.', rarity: 'rare' },
  { id: 'starseed', name: 'Warp-Touched Die', material: 'xenos', faces: [{ v: 10, mod: 'wild' }, ...F(1, 2, 3, 4, 5, 6, 7, 8, 9)], text: 'Xenos die with a wild face.', rarity: 'rare' },
  { id: 'berserk', name: 'Frenzon Die', material: 'adamant', faces: [...F(1, 2, 3, 4, 5, 6, 7, 8), { v: 10, mod: 'fierce' }, { v: 10, mod: 'fierce' }], text: 'Two fierce tens.', rarity: 'uncommon' },
];

export const SPECIAL_BY_ID: Record<string, SpecialDie> = Object.fromEntries(SPECIAL_DICE.map((d) => [d.id, d]));

/** Six iron dice, plus two per explorer in their career's material. */
export function buildStartingBag(rng: Rng, careers: CareerId[]): FortuneDie[] {
  const bag: FortuneDie[] = [];
  for (let i = 0; i < 6; i++) bag.push(makeDie(rng, 'iron'));
  for (const c of careers) {
    bag.push(makeDie(rng, CLASS_MATERIAL[c]));
    bag.push(makeDie(rng, CLASS_MATERIAL[c]));
  }
  return bag;
}

export function rollFace(rng: Rng, die: FortuneDie): number {
  const a = rng.int(0, die.faces.length - 1);
  if (die.material !== 'loaded') return a;
  const b = rng.int(0, die.faces.length - 1);
  return die.faces[b].v > die.faces[a].v ? b : a;
}
