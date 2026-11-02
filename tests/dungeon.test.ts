import { describe, it, expect } from 'vitest';
import { generateDungeon, validate, DIRS, OPPOSITE } from '../src/dungeon/generator.ts';
import { Rng, seedState } from '../src/engine/rng.ts';
import type { ZoneId } from '../src/engine/types.ts';
import { MONSTERS } from '../src/content/monsters.ts';
import { EVENTS } from '../src/content/events.ts';
import { SKILLS } from '../src/content/skills.ts';
import { rollItem, bossLootChoice, rollMarket } from '../src/meta/loot.ts';
import { ITEMS, MODS } from '../src/content/items.ts';

const ZONES: ZoneId[] = ['docks', 'gardens', 'reliquary', 'labyrinth', 'core'];

describe('the shifting Fortress (property)', () => {
  it('produces solvable, symmetric maps across 1000 seeds and all tiers', () => {
    for (let i = 0; i < 1000; i++) {
      const biome = ZONES[i % 5];
      const level = 1 + (i % 20);
      const map = generateDungeon(new Rng(seedState(`P-${i}`)), { seed: `P-${i}`, biome, level, difficulty: 'standard' });
      expect(validate(map).ok).toBe(true);
      const rooms = Object.values(map.rooms);
      expect(rooms.filter((r) => r.type === 'boss').length).toBe(1);
      expect(rooms.filter((r) => r.type === 'key').length).toBe(1);
      for (const r of rooms) {
        for (const dd of DIRS) { const e = r.exits[dd]; if (e) expect(map.rooms[e.to].exits[OPPOSITE[dd]]?.to).toBe(r.key); }
        for (const m of r.encounter?.monsters ?? []) expect(MONSTERS[m.replace('elite:', '')], m).toBeTruthy();
        if (r.eventId) expect(EVENTS[r.eventId]).toBeTruthy();
      }
    }
  });
  it('the same seed gives the same Fortress; a new seed gives a new one', () => {
    const a = generateDungeon(new Rng(seedState('SAME')), { seed: 'SAME', biome: 'labyrinth', level: 4, difficulty: 'perilous' });
    const b = generateDungeon(new Rng(seedState('SAME')), { seed: 'SAME', biome: 'labyrinth', level: 4, difficulty: 'perilous' });
    const c = generateDungeon(new Rng(seedState('OTHER')), { seed: 'OTHER', biome: 'labyrinth', level: 4, difficulty: 'perilous' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });
});

describe('item generator', () => {
  it('rolls legal items, craftsmanship and mods at every tier', () => {
    const rng = new Rng(seedState('loot'));
    for (let i = 0; i < 500; i++) {
      const it = rollItem(rng, 1 + (i % 20), ZONES[i % 5], { boost: i % 3 === 0 ? 1 : 0 });
      const def = ITEMS[it.defId];
      expect(def).toBeTruthy();
      expect(['poor', 'common', 'good', 'best']).toContain(it.craft);
      for (const m of it.mods) expect(MODS[m]).toBeTruthy();
    }
    const hoard = bossLootChoice(rng, 10, 'core');
    expect(hoard.length).toBe(3);
    expect(hoard.some((x) => ITEMS[x.defId].kind === 'valuable')).toBe(true);
    const market = rollMarket(rng, { armory: 1, apothecary: 1 }, 12);
    expect(market.length).toBeGreaterThan(10);
    expect(market.every((x) => !ITEMS[x.defId].lootOnly)).toBe(true);
  });
});

describe('Fortress events', () => {
  const list = Object.values(EVENTS);
  it('every event has a no-check option, art, and only real Skills', () => {
    for (const e of list) {
      expect(e.options.some((o) => !o.check && !o.cost), `${e.id} needs a free, no-check option`).toBe(true);
      expect(e.look.length, `${e.id} needs an art subject`).toBeGreaterThan(20);
      for (const o of e.options) if (o.check?.skill) expect(SKILLS[o.check.skill], `${e.id}: ${o.check.skill}`).toBeTruthy();
    }
  });
  it('every region has at least ten events of its own, and every Skill has a use', () => {
    for (const z of ZONES) expect(list.filter((e) => e.biome === z && e.kind === 'event').length, z).toBeGreaterThanOrEqual(10);
    const used = new Set(list.flatMap((e) => e.options.map((o) => o.check?.skill).filter(Boolean)));
    const combatOnly = new Set(['dodge', 'invocation']);
    for (const s of Object.keys(SKILLS)) if (!combatOnly.has(s) || used.has(s as never)) expect(used.has(s as never), s).toBe(true);
  });
  it('generated Fortresses actually place the new regional events', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const biome = ZONES[i % 5];
      const map = generateDungeon(new Rng(seedState(`EV-${i}`)), { seed: `EV-${i}`, biome, level: 1 + (i % 20), difficulty: 'standard' });
      for (const r of Object.values(map.rooms)) if (r.eventId) seen.add(r.eventId);
    }
    for (const e of list.filter((x) => x.biome !== 'any' && x.kind === 'event')) expect(seen.has(e.id), e.id).toBe(true);
  });
});
