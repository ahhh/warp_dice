/**
 * The item generator: Fortress loot and enclave stock. Availability caps rise
 * with the party's power, Craftsmanship is weighted Poor/Common/Good/Best as
 * in the Warrant of Trade generator, and better tiers fit upgrades and
 * special ammunition. Valuables are the treasure the enclave trades for.
 */
import type { Craft, ZoneId, ItemInstance } from '../engine/types.ts';
import type { Rng } from '../engine/rng.ts';
import { ITEMS, MODS, CRAFTS, modFits, type ItemDef } from '../content/items.ts';
import { makeItem } from '../rules/character.ts';

/** Tier 0..4 by power level. */
export function lootTier(level: number): number {
  return level >= 17 ? 4 : level >= 11 ? 3 : level >= 7 ? 2 : level >= 3 ? 1 : 0;
}

/** Highest Availability that can turn up at a tier (Average → Near Unique). */
export function availCap(tier: number): number {
  return Math.min(9, 5 + Math.ceil(tier * 1.1));
}

const ZONE_GROUPS: Record<ZoneId, string[]> = {
  docks: ['sp', 'las', 'primitive', 'chain'],
  gardens: ['primitive', 'exotic', 'flame', 'las'],
  reliquary: ['plasma', 'melta', 'las', 'power'],
  labyrinth: ['exotic', 'power', 'las', 'shock'],
  core: ['bolt', 'plasma', 'power', 'melta'],
};

export function rollCraft(rng: Rng, tier: number, boost = 0): Craft {
  const w: Record<Craft, number> = {
    poor: Math.max(2, CRAFTS.poor.weight - tier * 4 - boost * 6),
    common: CRAFTS.common.weight,
    good: CRAFTS.good.weight + tier * 3 + boost * 6,
    best: CRAFTS.best.weight + tier * 3 + boost * 6,
  };
  return rng.weighted(['poor', 'common', 'good', 'best'] as Craft[], (c) => w[c]);
}

function rollMods(rng: Rng, def: ItemDef, tier: number, boost: number): string[] {
  const fits = Object.values(MODS).filter((m) => modFits(m, def) && m.minTier <= tier);
  if (!fits.length) return [];
  const n = rng.chance(0.3 + tier * 0.1 + boost * 0.15) ? 1 + (tier >= 3 && rng.chance(0.3) ? 1 : 0) : 0;
  return rng.sample(fits, n).map((m) => m.id);
}

export function rollValuable(rng: Rng, tier: number): ItemInstance {
  const pool = Object.values(ITEMS).filter((d) => d.kind === 'valuable' && d.avail <= availCap(tier) + 1);
  const def = rng.weighted(pool, (d) => 1 + Math.max(0, 6 - Math.abs(d.avail - (4 + tier))));
  return makeItem(rng, def.id, 'common', [], def.value! < 60 && rng.chance(0.4) ? 2 : undefined);
}

export function rollItem(rng: Rng, level: number, biome: ZoneId, opts: { boost?: number } = {}): ItemInstance {
  const boost = opts.boost ?? 0;
  const tier = Math.min(4, lootTier(level) + boost);
  const cap = availCap(tier);
  const r = rng.next();
  if (r < 0.3) {
    const pool = Object.values(ITEMS).filter((d) => d.kind === 'consumable' && d.avail <= cap && (d.shopTier ?? 0) <= tier + 1);
    const def = rng.pick(pool);
    return makeItem(rng, def.id, 'common', [], def.consumable?.effect === 'heal' || def.consumable?.effect === 'bomb' ? rng.int(1, 2) : 1);
  }
  if (r < 0.55) return rollValuable(rng, tier);
  if (r < 0.68) {
    const pool = Object.values(ITEMS).filter((d) => d.kind === 'gear' && d.avail <= cap);
    return makeItem(rng, rng.pick(pool).id, 'common');
  }
  const groups = ZONE_GROUPS[biome];
  const gear = Object.values(ITEMS).filter((d) => (d.kind === 'weapon' || d.kind === 'armor') && d.avail <= cap && !d.heirloom);
  const def = rng.weighted(gear, (d) => (d.weapon && groups.includes(d.weapon.group) ? 3 : 1));
  return makeItem(rng, def.id, rollCraft(rng, tier, boost), def.kind === 'weapon' ? rollMods(rng, def, tier, boost) : []);
}

/** The region lord's hoard: three distinct non-consumables, at least one valuable. */
export function bossLootChoice(rng: Rng, level: number, biome: ZoneId): ItemInstance[] {
  const out: ItemInstance[] = [rollValuable(rng, Math.min(4, lootTier(level) + 1))];
  let guard = 0;
  while (out.length < 3 && guard++ < 40) {
    const it = rollItem(rng, level, biome, { boost: 1 });
    const def = ITEMS[it.defId];
    if (def.kind === 'consumable' || def.kind === 'valuable') continue;
    if (out.some((o) => o.defId === it.defId)) continue;
    out.push(it);
  }
  return out;
}

/** Enclave market stock for a day: weapons, armour, gear and consumables. */
export function rollMarket(rng: Rng, facility: { armory: number; apothecary: number }, pf: number): ItemInstance[] {
  const out: ItemInstance[] = [];
  const cap = Math.min(9, 4 + facility.armory + Math.floor(pf / 15));
  const kinds: [ItemDef['kind'], number][] = [['weapon', 6 + facility.armory], ['armor', 3 + Math.ceil(facility.armory / 2)], ['gear', 3 + facility.armory], ['consumable', 5 + facility.apothecary]];
  for (const [kind, n] of kinds) {
    const pool = Object.values(ITEMS).filter((d) => d.kind === kind && !d.lootOnly && d.avail <= (kind === 'consumable' ? cap - 1 + facility.apothecary : cap));
    for (const def of rng.sample(pool, n)) {
      const craft: Craft = kind === 'weapon' || kind === 'armor' ? rng.weighted(['poor', 'common', 'good', 'best'] as Craft[], (c) => ({ poor: 10, common: 50, good: 20 + facility.armory * 4, best: 4 + facility.armory * 3 })[c]) : 'common';
      out.push(makeItem(rng, def.id, craft, kind === 'weapon' && rng.chance(0.15 * facility.armory) ? rollMods(rng, def, facility.armory - 1, 0) : []));
    }
  }
  return out;
}
