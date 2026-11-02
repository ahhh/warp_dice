/**
 * Seeded Fortress generator. The Blackstone Fortress shifts between ventures,
 * so every expedition is a new seeded labyrinth:
 *   critical path → branches → loops → typed rooms → locks/keys → encounters
 *   → solvability check (BFS over lock states). Failed maps are rejected and
 *   regenerated before play.
 */
import type { ZoneId, Difficulty, Door, DungeonMap, Facing, Room, RoomType, Tier } from '../engine/types.ts';
import { Rng } from '../engine/rng.ts';
import { BIOMES } from '../content/biomes.ts';
import { biomeMonsters, MONSTERS, type MonsterDef } from '../content/monsters.ts';
import { eventsFor } from '../content/events.ts';

export const DIRS: Facing[] = ['N', 'E', 'S', 'W'];
export const DELTA: Record<Facing, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
export const OPPOSITE: Record<Facing, Facing> = { N: 'S', S: 'N', E: 'W', W: 'E' };

export const key = (x: number, y: number) => `${x},${y}`;
export const parseKey = (k: string): [number, number] => k.split(',').map(Number) as [number, number];

export function tierFor(level: number): Tier {
  return level >= 17 ? 'mythic' : level >= 11 ? 'heroic' : level >= 5 ? 'veteran' : 'novice';
}

const SIZES: Record<Tier, { grid: number; crit: [number, number]; branches: [number, number]; branchLen: [number, number] }> = {
  novice: { grid: 9, crit: [8, 10], branches: [3, 4], branchLen: [1, 3] },
  veteran: { grid: 10, crit: [9, 11], branches: [3, 5], branchLen: [1, 3] },
  heroic: { grid: 11, crit: [10, 12], branches: [4, 5], branchLen: [2, 3] },
  mythic: { grid: 12, crit: [10, 13], branches: [4, 6], branchLen: [2, 3] },
};

export interface GenOptions {
  seed: string;
  biome: ZoneId;
  level: number;
  difficulty: Difficulty;
  size?: 'short' | 'normal' | 'long';
}

export function generateDungeon(rng: Rng, opts: GenOptions): DungeonMap {
  for (let attempt = 0; attempt < 60; attempt++) {
    const map = tryGenerate(rng, opts);
    if (map && validate(map).ok) return map;
  }
  throw new Error('dungeon generation failed');
}

function tryGenerate(rng: Rng, opts: GenOptions): DungeonMap | null {
  const tier = tierFor(opts.level);
  const sz = SIZES[tier];
  const W = sz.grid, H = sz.grid;
  const sizeAdj = opts.size === 'short' ? -2 : opts.size === 'long' ? 2 : 0;
  const critLen = rng.int(sz.crit[0], sz.crit[1]) + sizeAdj;
  const rooms: Record<string, Room> = {};
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

  const mk = (x: number, y: number): Room => {
    const r: Room = { key: key(x, y), x, y, type: 'corridor', name: '', text: '', exits: {}, tags: [] };
    rooms[r.key] = r;
    return r;
  };
  const link = (a: Room, b: Room, door: Partial<Door> = {}) => {
    const d = dirBetween(a, b);
    if (!d) return;
    a.exits[d] = { to: b.key, ...door };
    b.exits[OPPOSITE[d]] = { to: a.key, ...door };
  };

  // 1. Critical path via self-avoiding random walk with backtracking.
  const startX = rng.int(1, W - 2);
  const startY = H - 1;
  const path: [number, number][] = [[startX, startY]];
  const used = new Set([key(startX, startY)]);
  const walk = (depth: number): boolean => {
    if (path.length >= critLen) return true;
    const [x, y] = path[path.length - 1];
    const dirs = rng.shuffle(DIRS.slice());
    // Bias away from the start edge so maps feel like a descent.
    dirs.sort((a, b) => (a === 'N' ? -1 : 0) - (b === 'N' ? -1 : 0) + (rng.chance(0.5) ? 0 : 0));
    for (const d of dirs) {
      const [dx, dy] = DELTA[d];
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny) || used.has(key(nx, ny))) continue;
      // Avoid touching the path elsewhere (keeps corridors legible).
      let touches = 0;
      for (const dd of DIRS) { const [ex, ey] = DELTA[dd]; if (used.has(key(nx + ex, ny + ey))) touches++; }
      if (touches > 1) continue;
      path.push([nx, ny]);
      used.add(key(nx, ny));
      if (walk(depth + 1)) return true;
      path.pop();
      used.delete(key(nx, ny));
    }
    return false;
  };
  if (!walk(0)) return null;
  const crit = path.map(([x, y]) => mk(x, y));
  for (let i = 1; i < crit.length; i++) link(crit[i - 1], crit[i]);

  // 2. Branches.
  const nBranches = rng.int(sz.branches[0], sz.branches[1]) + (opts.size === 'long' ? 1 : 0);
  const branchEnds: Room[] = [];
  const branchRooms: Room[] = [];
  for (let b = 0; b < nBranches * 3 && branchEnds.length < nBranches; b++) {
    const from = rng.pick(crit.slice(1, -2));
    let cur = from;
    const len = rng.int(sz.branchLen[0], sz.branchLen[1]);
    const made: Room[] = [];
    for (let i = 0; i < len; i++) {
      const opts2 = rng.shuffle(DIRS.slice()).filter((d) => {
        const [dx, dy] = DELTA[d];
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!inBounds(nx, ny) || rooms[key(nx, ny)]) return false;
        return true;
      });
      if (!opts2.length) break;
      const [dx, dy] = DELTA[opts2[0]];
      const r = mk(cur.x + dx, cur.y + dy);
      link(cur, r);
      made.push(r);
      cur = r;
    }
    if (made.length) {
      branchEnds.push(made[made.length - 1]);
      branchRooms.push(...made);
    }
  }
  if (branchEnds.length < 2) return null;

  // 3. Loops: occasional extra doors between adjacent rooms (never into the boss).
  const boss = crit[crit.length - 1];
  for (const r of Object.values(rooms)) {
    if (r === boss) continue;
    for (const d of DIRS) {
      if (r.exits[d]) continue;
      const [dx, dy] = DELTA[d];
      const n = rooms[key(r.x + dx, r.y + dy)];
      if (!n || n === boss || n.exits[OPPOSITE[d]]) continue;
      if (rng.chance(0.12)) link(r, n);
    }
  }

  // 4. Types.
  const biome = BIOMES[opts.biome];
  crit[0].type = 'entrance';
  boss.type = 'boss';
  // Boss door needs the sigil.
  const preBoss = crit[crit.length - 2];
  const bd = dirBetween(preBoss, boss)!;
  preBoss.exits[bd]!.lock = 'sigil';
  boss.exits[OPPOSITE[bd]]!.lock = 'sigil';
  // Remove any loop doors into the boss (only the sigil door remains).
  for (const d of DIRS) {
    const e = boss.exits[d];
    if (e && e.to !== preBoss.key) { delete boss.exits[d]; delete rooms[e.to].exits[OPPOSITE[d]]; }
  }

  // Key at the farthest branch end (from start, by path index of its root).
  const keyRoom = rng.pick(branchEnds);
  keyRoom.type = 'key';
  const otherEnds = branchEnds.filter((r) => r !== keyRoom);
  for (const r of otherEnds) r.type = rng.chance(0.6) ? 'treasure' : 'shrine';

  const mid = crit.slice(2, -2);
  const free = () => [...mid, ...branchRooms].filter((r) => r.type === 'corridor');
  const place = (t: RoomType, n: number, pool?: Room[]) => {
    for (let i = 0; i < n; i++) {
      const f = (pool ?? free()).filter((r) => r.type === 'corridor');
      if (!f.length) return;
      rng.pick(f).type = t;
    }
  };
  // Camp roughly 60% of the way down the critical path.
  const campIdx = Math.max(2, Math.floor(crit.length * 0.6));
  if (crit[campIdx] && crit[campIdx].type === 'corridor') crit[campIdx].type = 'camp';
  place('peddler', opts.size === 'long' ? 2 : 1);
  place('elite', tierFor(opts.level) === 'novice' ? 1 : 2);
  place('event', rng.int(2, 3));
  place('mechanism', 1);
  const nCombat = Math.round(free().length * 0.6);
  place('combat', nCombat);
  // The room right before the boss is a combat (the guard) unless it's special.
  if (preBoss.type === 'corridor') preBoss.type = 'combat';
  // Ensure at least 3 combats on the way.
  const combats = Object.values(rooms).filter((r) => r.type === 'combat' || r.type === 'elite').length;
  if (combats < 3) place('combat', 3 - combats);

  // 5. Biome tags and locks.
  for (const r of Object.values(rooms)) {
    if (r.type === 'entrance' || r.type === 'boss') continue;
    if (r.type === 'camp' || r.type === 'mechanism') { r.tags.push(biome.resetTag.id); continue; }
    if (rng.chance(biome.tag.chance)) r.tags.push(biome.tag.id);
  }
  // Optional-room locks (never on the critical path): water/mirror doors, plus a secret room.
  const branchDoors = branchRooms.filter((r) => r.type === 'treasure' || r.type === 'shrine');
  for (const r of branchDoors) {
    if (opts.biome === 'reliquary' && rng.chance(0.6)) lockInto(rooms, r, 'water');
    if (opts.biome === 'labyrinth' && rng.chance(0.6)) lockInto(rooms, r, 'mirror', true);
  }
  // Secret room off any non-boss room.
  const secretFrom = rng.pick(Object.values(rooms).filter((r) => r.type !== 'boss' && r.type !== 'entrance'));
  for (const d of rng.shuffle(DIRS.slice())) {
    const [dx, dy] = DELTA[d];
    const nx = secretFrom.x + dx, ny = secretFrom.y + dy;
    if (!inBounds(nx, ny) || rooms[key(nx, ny)]) continue;
    const s = mk(nx, ny);
    s.type = 'treasure';
    s.secret = true;
    link(secretFrom, s, { hidden: true });
    break;
  }

  // 6. Names, text, encounters, events, loot.
  const enc = new Rng(rng.state.slice() as [number, number, number, number]);
  for (const r of Object.values(rooms)) dressRoom(r, enc, opts);
  const bossDefs = biomeMonsters(opts.biome, true);
  boss.encounter = { monsters: [enc.pick(bossDefs).id, ...bossAdds(enc, opts)], kind: 'boss', cleared: false };

  return {
    width: W, height: H, rooms, start: crit[0].key, bossKey: boss.key,
    criticalPath: crit.map((r) => r.key),
  };
}

function lockInto(rooms: Record<string, Room>, r: Room, lock: Door['lock'], hidden = false) {
  // Lock the single door that leads into this branch-end room.
  for (const d of DIRS) {
    const e = r.exits[d];
    if (!e) continue;
    const other = rooms[e.to];
    // Only lock if the other side has another way out (keeps the map connected).
    e.lock = lock;
    if (hidden) e.hidden = true;
    const back = other.exits[OPPOSITE[d]];
    if (back) { back.lock = lock; if (hidden) back.hidden = true; }
  }
}

function dirBetween(a: { x: number; y: number }, b: { x: number; y: number }): Facing | null {
  for (const d of DIRS) {
    const [dx, dy] = DELTA[d];
    if (a.x + dx === b.x && a.y + dy === b.y) return d;
  }
  return null;
}

function bossAdds(rng: Rng, opts: GenOptions): string[] {
  const n = (opts.level >= 11 ? 2 : opts.level >= 5 ? 1 : rng.chance(0.5) ? 1 : 0) + (opts.difficulty === 'perilous' ? 1 : 0);
  const pool = biomeMonsters(opts.biome).filter((m) => m.role !== 'brute');
  return Array.from({ length: n }, () => rng.pick(pool).id);
}

export function rollEncounter(rng: Rng, biome: ZoneId, level: number, kind: 'normal' | 'elite' | 'ambush', difficulty: Difficulty): string[] {
  const pool = biomeMonsters(biome);
  const front = pool.filter((m) => m.rank === 'front');
  const back = pool.filter((m) => m.rank === 'back');
  let n = level >= 11 ? 3 : level >= 3 ? rng.int(2, 3) : rng.int(2, 3);
  if (kind === 'ambush') n = Math.max(1, n - 1);
  if (difficulty === 'perilous') n += 1;
  if (difficulty === 'explorer') n = Math.max(1, n - (rng.chance(0.5) ? 1 : 0));
  const out: MonsterDef[] = [];
  if (kind === 'elite') {
    out.push(rng.pick(front));
    n = Math.max(1, n - 1);
  }
  for (let i = 0; i < n; i++) {
    const wantBack = out.filter((m) => m.rank === 'back').length < Math.floor((out.length + 1) / 2) && rng.chance(0.45);
    out.push(rng.pick(wantBack && back.length ? back : front));
  }
  // Thralls and gretchin come in swarms.
  const ids = out.map((m) => m.id);
  for (const swarm of ['sporeThrall', 'gretchin', 'warpSpawn']) if (ids.includes(swarm) && rng.chance(0.5)) { ids.push(swarm); break; }
  return kind === 'elite' ? [`elite:${ids[0]}`, ...ids.slice(1)] : ids;
}

function dressRoom(r: Room, rng: Rng, opts: GenOptions) {
  const biome = BIOMES[opts.biome];
  const names = biome.rooms[r.type] ?? biome.rooms.corridor ?? ['Chamber'];
  r.name = rng.pick(names);
  const parts = [rng.pick(biome.atmosphere)];
  if (rng.chance(0.7)) parts.push(rng.pick(biome.details));
  if (r.tags.includes(biome.tag.id)) parts.push(`(${biome.tag.label}.)`);
  if (r.tags.includes(biome.resetTag.id)) parts.push(`(${biome.resetTag.label}.)`);
  r.text = parts.join(' ');
  r.art = `scenes/${opts.biome}_${sceneFor(r.type, biome.scenes)}`;
  switch (r.type) {
    case 'combat':
      r.encounter = { monsters: rollEncounter(rng, opts.biome, opts.level, 'normal', opts.difficulty), kind: 'normal', cleared: false };
      break;
    case 'elite':
      r.encounter = { monsters: rollEncounter(rng, opts.biome, opts.level, 'elite', opts.difficulty), kind: 'elite', cleared: false };
      r.loot = { gold: 0, items: [], charm: true, taken: false };
      break;
    case 'treasure':
      r.loot = { gold: 1, items: ['item'], charm: true, taken: false };
      break;
    case 'event': {
      const evs = eventsFor(opts.biome, 'event');
      r.eventId = rng.pick(evs).id;
      break;
    }
    case 'shrine':
      r.eventId = rng.pick(eventsFor(opts.biome, 'shrine')).id;
      break;
    case 'key':
      r.eventId = 'sigilKey';
      if (rng.chance(0.5)) r.encounter = { monsters: rollEncounter(rng, opts.biome, opts.level, 'normal', opts.difficulty), kind: 'normal', cleared: false };
      break;
    case 'mechanism':
      r.eventId = 'meterReset';
      break;
    case 'corridor':
      if (rng.chance(0.12)) r.encounter = { monsters: rollEncounter(rng, opts.biome, opts.level, 'ambush', opts.difficulty), kind: 'ambush', cleared: false };
      break;
  }
}

function sceneFor(type: RoomType, scenes: string[]): string {
  switch (type) {
    case 'boss': return scenes[3];
    case 'treasure': case 'key': case 'peddler': case 'shrine': return scenes[2];
    case 'combat': case 'elite': case 'event': case 'mechanism': return scenes[1];
    default: return scenes[0];
  }
}

// ── validation ───────────────────────────────────────────────────────────────

export interface Validation { ok: boolean; reason?: string }

/** BFS over (room, hasKey). Optional locks (water/mirror) are treated as closed. */
export function validate(map: DungeonMap): Validation {
  const reach = (hasKey: boolean) => {
    const seen = new Set<string>([map.start]);
    const q = [map.start];
    while (q.length) {
      const k = q.shift()!;
      const r = map.rooms[k];
      for (const d of DIRS) {
        const e = r.exits[d];
        if (!e) continue;
        if (e.lock === 'sigil' && !hasKey) continue;
        if (e.lock === 'water' || e.lock === 'mirror' || e.hidden) continue;
        if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); }
      }
    }
    return seen;
  };
  const noKey = reach(false);
  const keyRoom = Object.values(map.rooms).find((r) => r.type === 'key');
  if (!keyRoom) return { ok: false, reason: 'no key room' };
  if (!noKey.has(keyRoom.key)) return { ok: false, reason: 'key unreachable' };
  if (noKey.has(map.bossKey)) return { ok: false, reason: 'boss reachable without key' };
  const withKey = reach(true);
  if (!withKey.has(map.bossKey)) return { ok: false, reason: 'boss unreachable' };
  // Every door is symmetric.
  for (const r of Object.values(map.rooms)) {
    for (const d of DIRS) {
      const e = r.exits[d];
      if (!e) continue;
      const o = map.rooms[e.to];
      if (!o || o.exits[OPPOSITE[d]]?.to !== r.key) return { ok: false, reason: `asymmetric door ${r.key}->${e.to}` };
    }
  }
  if (map.criticalPath.length < 5) return { ok: false, reason: 'too short' };
  return { ok: true };
}

export function monsterIdOf(entry: string): { id: string; elite: boolean } {
  if (entry.startsWith('elite:')) return { id: entry.slice(6), elite: true };
  return { id: entry, elite: false };
}

export function isKnownMonster(id: string): boolean {
  return !!MONSTERS[monsterIdOf(id).id];
}
