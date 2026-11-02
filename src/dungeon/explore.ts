/**
 * Expedition controller: relative movement through the Fortress, room entry,
 * events (percentile Skill Tests), salvage, post-combat spoils and Fortune
 * boons, rests, and extraction. If the Lord-Captain dies, the Dynasty ends.
 */
import type { ZoneId, Difficulty, Expedition, Facing, GameState, Hero, RelDir, Room, SkillId, BoonOffer, LogEntry, Char } from '../engine/types.ts';
import { Rng, makeStreams, stream } from '../engine/rng.ts';
import { test, roll } from '../engine/dice.ts';
import { generateDungeon, tierFor, DIRS, DELTA, rollEncounter, key, parseKey, OPPOSITE } from './generator.ts';
import { BIOMES, BIOME_ORDER } from '../content/biomes.ts';
import { EVENTS, type Outcome, type Helper } from '../content/events.ts';
import { MONSTERS, biomeMonsters } from '../content/monsters.ts';
import { ITEMS, itemName } from '../content/items.ts';
import { SKILLS } from '../content/skills.ts';
import { POWERS } from '../content/powers.ts';
import { newFortuneRun, interest, endCombatTray } from '../fortune/tray.ts';
import { rollBoons, rollShop, applyOffer, makeOffer, offerTitle, TOKENS } from '../fortune/boons.ts';
import { CHARMS, CHARM_BY_ID, newCharm } from '../fortune/charms.ts';
import { HANDS } from '../fortune/hands.ts';
import { startCombat, makeCtx, syncHeroes, hooks, heroOf, heroes as combatHeroes, gainCorruption, gainInsanity } from '../combat/core.ts';
import { derive, fullRestore, restHeal, syncLevel, CHAR_NAMES } from '../rules/character.ts';
import { goldReward, DOUBLOONS_PER_COMBAT, DIFFICULTY_MOD, XP_PER_FIGHT, XP_PER_CLEAR } from '../rules/balance.ts';
import { rollItem, rollValuable, bossLootChoice, lootTier } from '../meta/loot.ts';
import { buildTutorialMap, TUTORIAL_SEED } from './tutorial.ts';
import { FINALE, CHAPTERS, EPILOGUE, finaleBlocked, storyOf } from '../content/story.ts';

export function xlog(exp: Expedition, t: string, kind?: LogEntry['kind']) {
  exp.log.push({ t, kind });
  if (exp.log.length > 120) exp.log.splice(0, exp.log.length - 120);
}

const party = (g: GameState) => g.expedition!.partyIds.map((id) => g.roster.find((h) => h.id === id)!).filter(Boolean);
const living = (g: GameState) => party(g).filter((h) => h.status === 'alive');

export const PARTY_MIN = 2;
export const PARTY_MAX = 4;

// ── start ───────────────────────────────────────────────────────────────────

export interface StartOpts { partyIds: string[]; biome: ZoneId; difficulty: Difficulty; seed: string; size?: 'short' | 'normal' | 'long'; tutorial?: boolean; finale?: boolean }

export function startExpedition(g: GameState, o: StartOpts): string | null {
  if (g.phase !== 'play') return 'The Dynasty is not ready to venture out.';
  if (o.partyIds.length < PARTY_MIN || o.partyIds.length > PARTY_MAX) return `Take ${PARTY_MIN}–${PARTY_MAX} explorers (the Lord-Captain and up to three retainers).`;
  const heroes = o.partyIds.map((id) => g.roster.find((h) => h.id === id));
  if (heroes.some((h) => !h || h.status !== 'alive')) return 'Only living explorers can join.';
  if (!heroes.some((h) => h!.lordCaptain)) return 'The Lord-Captain must lead every venture.';
  if (o.tutorial && o.finale) return 'Pick one: the tutorial or the finale.';
  if (o.tutorial) o = { ...o, biome: 'docks', difficulty: 'explorer', seed: TUTORIAL_SEED, size: 'short' };
  if (o.finale) {
    const blocked = finaleBlocked(g, heroes as Hero[]);
    if (blocked) return blocked;
    o = { ...o, biome: 'core', size: 'long' };
  } else if (!o.tutorial && !g.profile.unlockedBiomes.includes(o.biome)) return 'That region of the Fortress is still sealed.';
  const levels = heroes.map((h) => h!.level).sort((a, b) => a - b);
  // Weight the strongest explorers, but never ignore the weakest link.
  const weights = levels.map((_, i) => (i === 0 ? 1 : 1.5));
  const partyLevel = Math.max(1, Math.round(levels.reduce((a, l, i) => a + l * weights[i], 0) / weights.reduce((a, b) => a + b, 0)));
  const rng = makeStreams(o.seed);
  const layout = new Rng(rng.layout);
  const map = o.tutorial ? buildTutorialMap() : generateDungeon(layout, { seed: o.seed, biome: o.biome, level: partyLevel, difficulty: o.difficulty, size: o.size });
  if (o.finale) {
    const throne = map.rooms[map.bossKey];
    throne.name = FINALE.bossRoom;
    throne.text = FINALE.bossText;
    throne.encounter!.monsters[0] = 'usurper';
  }
  const narr = new Rng(rng.narrative);
  const b = BIOMES[o.biome];
  const bossRoom = map.rooms[map.bossKey];
  const bossDef = MONSTERS[bossRoom.encounter!.monsters[0]];
  const fortune = newFortuneRun(new Rng(rng.fortune), heroes.map((h) => h!.careerId));
  for (const h of heroes) {
    // Fate refreshes for every venture (Core p.233).
    syncLevel(h!);
    h!.fate = derive(h!).fateMax + (g.mode === 'story' && h!.lordCaptain ? 1 : 0);
    h!.history.expeditions += 1;
  }
  const exp: Expedition = {
    seed: o.seed, biome: o.biome, difficulty: o.difficulty, tier: tierFor(partyLevel), partyLevel, partyIds: o.partyIds.slice(),
    map, pos: map.start, facing: 'N', visited: [map.start], seen: [map.start], fortune, log: [], depth: 0, status: 'active', rng,
    carriedGold: 0, carriedItems: [], keys: [], flags: {}, meter: o.biome === 'reliquary' ? 1 : 0, steps: 0, shortRests: 0, longRestUsed: false,
    theme: {
      name: o.finale ? FINALE.name : o.tutorial ? 'The Nursery' : b.name, anomaly: narr.pick(b.anomalies), faction: narr.pick(b.factions),
      objective: o.finale ? 'take back the Warrant of Trade' : o.tutorial ? 'take the warp-key and beat the Nursery\'s keeper' : narr.pick(b.objectives),
      boss: o.finale ? 'Lord-Captain Rathbone, the Usurper' : bossDef.name, hook: narr.pick(b.hooks),
    },
    fallen: [], bossDefeated: false, journal: [], searched: [], xpEarned: 0,
  };
  if (o.tutorial) exp.tutorial = true;
  if (o.finale) exp.finale = true;
  for (const inst of g.vault.filter((i) => ITEMS[i.defId]?.kind === 'consumable').slice(0, 6)) exp.carriedItems.push(inst);
  g.vault = g.vault.filter((i) => !exp.carriedItems.includes(i));
  g.expedition = exp;
  revealAround(g);
  if (o.tutorial) xlog(exp, 'The Nursery: a short spur of the Fortress where the enclave blooded every crew. Your goal: take the warp-key and beat the keeper.', 'info');
  else if (o.finale) xlog(exp, `${FINALE.name}: ${FINALE.premise}`, 'warn');
  else xlog(exp, `${b.name}: ${exp.theme.anomaly}. The Fortress has shifted since anyone last came here. Your goal: ${exp.theme.objective}.`, 'info');
  xlog(exp, `The enclave says ${exp.theme.boss} rules the deepest chamber.`, 'info');
  g.profile.stats.expeditions += 1;
  const start = map.rooms[map.start];
  exp.facing = (DIRS.find((d) => start.exits[d]) ?? 'N') as Facing;
  return null;
}

// ── movement ────────────────────────────────────────────────────────────────

const ROT = (f: Facing, n: number): Facing => DIRS[(DIRS.indexOf(f) + n + 4) % 4];

function partyHas(g: GameState, pred: (h: Hero) => boolean): boolean {
  return !!g.expedition && living(g).some(pred);
}

/** Void-born and Void-masters never lose their bearings when gravity turns. */
export function voidAccustomed(g: GameState): boolean {
  return partyHas(g, (h) => h.origin.homeWorld === 'voidBorn' || h.origin.homeWorld === 'battlefleet' || derive(h).features.has('voidAccustomed'));
}

export function absoluteDir(exp: Expedition, rel: RelDir, steady = false): Facing {
  let r = rel;
  const room = exp.map.rooms[exp.pos];
  if (exp.biome === 'labyrinth' && room.tags.includes('mirror')) r = rel === 'left' ? 'right' : rel === 'right' ? 'left' : rel;
  const turn = { forward: 0, right: 1, back: 2, left: 3 }[r];
  const gravity = exp.biome === 'core' && !steady ? exp.meter : 0;
  return ROT(exp.facing, turn + gravity);
}

export function dirFor(g: GameState, rel: RelDir): Facing {
  return absoluteDir(g.expedition!, rel, voidAccustomed(g));
}

export interface ExitView { rel: RelDir; dir: Facing; state: 'open' | 'locked' | 'wall' | 'hidden'; lock?: string; to?: string; visited?: boolean; label: string }

export function exitsView(g: GameState): ExitView[] {
  const exp = g.expedition!;
  const room = exp.map.rooms[exp.pos];
  return (['forward', 'left', 'right', 'back'] as RelDir[]).map((rel) => {
    const dir = dirFor(g, rel);
    const e = room.exits[dir];
    if (!e || (e.hidden && !exp.searched.includes(`${room.key}:${dir}`))) return { rel, dir, state: 'wall', label: 'Wall' };
    const lockReason = doorBlocked(exp, e.lock);
    if (lockReason) return { rel, dir, state: 'locked', lock: e.lock, to: e.to, label: lockReason };
    return { rel, dir, state: 'open', to: e.to, visited: exp.visited.includes(e.to), label: exp.visited.includes(e.to) ? exp.map.rooms[e.to].name : 'Unexplored' };
  });
}

function doorBlocked(exp: Expedition, lock?: string): string | null {
  if (!lock) return null;
  if (lock === 'sigil' && !exp.keys.includes('sigil')) return 'Sealed — needs the warp-key';
  if (lock === 'water' && exp.meter >= 1) return 'Flooded — lower the coolant';
  if (lock === 'mirror' && !exp.flags.mirrorOpen) return 'A phase-door that exists only in reflection';
  return null;
}

export function canAct(g: GameState): string | null {
  const exp = g.expedition;
  if (!exp || exp.status !== 'active') return 'No active expedition';
  if (exp.combat && exp.combat.status === 'active') return 'In combat';
  if (exp.spoils || exp.boons || exp.lootChoice) return 'Claim your spoils first';
  if (exp.event && exp.event.stage !== 'result') return 'Resolve the event first';
  return null;
}

export function move(g: GameState, rel: RelDir): string | null {
  const err = canAct(g);
  if (err) return err;
  const exp = g.expedition!;
  const room = exp.map.rooms[exp.pos];
  const dir = dirFor(g, rel);
  const e = room.exits[dir];
  if (!e || (e.hidden && !exp.searched.includes(`${room.key}:${dir}`))) return 'A wall blocks the way.';
  const blocked = doorBlocked(exp, e.lock);
  if (blocked) return blocked;
  exp.event = undefined;
  exp.shop = undefined;
  exp.prev = exp.pos;
  exp.pos = e.to;
  exp.facing = dir;
  exp.steps += 1;
  if (!exp.visited.includes(e.to)) exp.visited.push(e.to);
  revealAround(g);
  biomeStep(g);
  enterRoom(g);
  return null;
}

/** Navigators and augur-linked Void-masters see one room further. */
function revealAround(g: GameState) {
  const exp = g.expedition!;
  const far = partyHas(g, (h) => { const f = derive(h).features; return f.has('fortressSense') || f.has('augurLock'); });
  const room = exp.map.rooms[exp.pos];
  if (!exp.seen.includes(room.key)) exp.seen.push(room.key);
  for (const d of DIRS) {
    const e = room.exits[d];
    if (!e || e.hidden) continue;
    if (!exp.seen.includes(e.to)) exp.seen.push(e.to);
    if (far) {
      const r2 = exp.map.rooms[e.to];
      for (const d2 of DIRS) { const e2 = r2.exits[d2]; if (e2 && !e2.hidden && !exp.seen.includes(e2.to)) exp.seen.push(e2.to); }
    }
  }
}

function biomeStep(g: GameState) {
  const exp = g.expedition!;
  const room = exp.map.rooms[exp.pos];
  const b = BIOMES[exp.biome];
  const before = exp.meter;
  switch (exp.biome) {
    case 'docks':
      if (room.tags.includes('breach')) exp.meter = Math.min(b.meter.max, exp.meter + 1);
      if (room.tags.includes('sealed')) exp.meter = 0;
      break;
    case 'gardens':
      if (room.tags.includes('spore') || exp.steps % 3 === 0) exp.meter = Math.min(b.meter.max, exp.meter + 1);
      if (room.tags.includes('deadAir')) exp.meter = 0;
      break;
    case 'labyrinth':
      if (room.tags.includes('mirror') && !exp.visited.slice(0, -1).includes(room.key)) exp.meter = Math.min(b.meter.max, exp.meter + 1);
      if (exp.meter >= 3 && !exp.flags.mirrorOpen) { exp.flags.mirrorOpen = 1; xlog(exp, '◈ Your reflections step aside: hidden phase-doors shimmer into being!', 'loot'); }
      break;
    case 'core':
      if (room.tags.includes('anchor')) exp.meter = 0;
      else if (exp.steps % 4 === 0) exp.meter = (exp.meter + 1) % 4;
      break;
  }
  if (exp.meter !== before) {
    xlog(exp, `${b.meter.icon} ${b.meter.name} ${exp.meter > before ? '▲' : '▼'} ${exp.meter}`, exp.meter > before ? 'warn' : 'info');
    if (exp.biome === 'core' && exp.meter !== 0) xlog(exp, voidAccustomed(g) ? 'Gravity turns — your void-born keep their bearings.' : 'Gravity turns — your directions rotate!', 'warn');
  }
}

function enterRoom(g: GameState) {
  const exp = g.expedition!;
  const room = exp.map.rooms[exp.pos];
  xlog(exp, `${room.name}. ${room.text}`);
  if (room.encounter && !room.encounter.cleared) {
    const kind = room.encounter.kind;
    if (kind === 'ambush') { xlog(exp, 'Ambush!', 'warn'); exp.flags.surprise = 1; }
    if (kind === 'boss') xlog(exp, `The air thickens. ${exp.theme.boss} awaits.`, 'warn');
    startCombat(g, room.key, room.encounter.monsters, kind);
    delete exp.flags.surprise;
    return;
  }
  openRoomFeature(g, room);
}

function openRoomFeature(g: GameState, room: Room) {
  const exp = g.expedition!;
  if (room.eventId && !room.eventDone) exp.event = { roomKey: room.key, eventId: room.eventId, stage: 'choose' };
  if (room.type === 'peddler' && (!exp.shop || exp.shop.roomKey !== room.key)) {
    exp.shop = exp.shops?.[room.key] ?? { roomKey: room.key, offers: rollShop(stream(exp.rng, 'loot'), exp.fortune), rerollCost: 2 };
    persistShop(exp);
  }
}

// ── checks ──────────────────────────────────────────────────────────────────

/** The best living explorer for a Skill (or bare Characteristic) and their Test target. */
export function bestCheck(g: GameState, check: { skill?: SkillId; char?: Char }): { hero: Hero; target: number } {
  let best: { hero: Hero; target: number } | null = null;
  for (const h of living(g)) {
    const d = derive(h);
    const t = check.skill ? d.skills[check.skill] ?? -1 : d.chars[check.char ?? 'WP'];
    if (!best || t > best.target) best = { hero: h, target: t };
  }
  return best ?? { hero: party(g)[0], target: 0 };
}

const tierPenalty = (exp: Expedition) => (exp.tier === 'mythic' ? 15 : exp.tier === 'heroic' ? 10 : exp.tier === 'veteran' ? 5 : 0);

export function search(g: GameState): string | null {
  const err = canAct(g);
  if (err) return err;
  const exp = g.expedition!;
  const room = exp.map.rooms[exp.pos];
  const flag = `searched:${room.key}`;
  if (exp.flags[flag]) return 'You have already searched here.';
  exp.flags[flag] = 1;
  const a = bestCheck(g, { skill: 'search' });
  const b2 = bestCheck(g, { skill: 'awareness' });
  const { hero, target: t0 } = a.target >= b2.target ? a : b2;
  const target = t0 - tierPenalty(exp) + (exp.flags.guidance ? 10 : 0);
  delete exp.flags.guidance;
  const r = test(stream(exp.rng, 'narrative'), target);
  let found = false;
  if (r.success) found = revealSecrets(exp, room);
  if (found) xlog(exp, `${hero.name} finds a hidden passage! (${r.roll} vs ${r.target})`, 'loot');
  else if (r.success && r.degrees >= 1 && stream(exp.rng, 'loot').chance(0.4)) {
    const gold = Math.round(goldReward(exp.partyLevel, 'normal') * 0.4);
    exp.carriedGold += gold;
    xlog(exp, `${hero.name} spots a loose deck plate hiding ${gold} Thrones. (${r.roll} vs ${r.target})`, 'loot');
  } else xlog(exp, `${hero.name} searches carefully but finds nothing. (${r.roll} vs ${r.target})`);
  return null;
}

function revealSecrets(exp: Expedition, room: Room): boolean {
  let found = false;
  for (const d of DIRS) {
    const e = room.exits[d];
    if (!e?.hidden) continue;
    exp.searched.push(`${room.key}:${d}`);
    if (e.lock === 'mirror') e.lock = undefined;
    const back = exp.map.rooms[e.to].exits[OPPOSITE[d]];
    if (back) { exp.searched.push(`${e.to}:${OPPOSITE[d]}`); if (back.lock === 'mirror') back.lock = undefined; }
    found = true;
  }
  return found;
}

// ── events ──────────────────────────────────────────────────────────────────

/** Who in the party can turn this check into a sure thing. */
function helperFor(g: GameState, helper?: Helper): { hero: Hero; how: string } | null {
  if (!helper) return null;
  for (const h of living(g)) {
    const gear = Object.values(h.equipment).map((i) => i?.defId);
    switch (helper) {
      case 'tech': if (h.careerId === 'explorator') return { hero: h, how: 'the rites of the Machine' }; if (gear.includes('combiTool') || gear.includes('multikey')) return { hero: h, how: gear.includes('combiTool') ? 'a Combi-tool' : 'a Multikey' }; break;
      case 'warp': if (h.careerId === 'astropath' || h.careerId === 'navigator') return { hero: h, how: h.careerId === 'navigator' ? 'the warp eye' : 'the Emperor\'s sight' }; break;
      case 'medicae': if (h.careerId === 'missionary') return { hero: h, how: 'field medicae' }; if (gear.includes('medikit')) return { hero: h, how: 'a Medikit' }; break;
      case 'auspex': if (gear.includes('auspex')) return { hero: h, how: 'an Auspex' }; if (derive(h).features.has('augurLock')) return { hero: h, how: 'the ship\'s augurs' }; break;
      case 'command': if (h.lordCaptain) return { hero: h, how: 'the family name' }; break;
      case 'faith': if (h.careerId === 'missionary' || h.talents.includes('pureFaith')) return { hero: h, how: 'unshakeable faith' }; break;
    }
  }
  return null;
}

export function eventOptions(g: GameState) {
  const exp = g.expedition!;
  if (!exp.event) return [];
  const ev = EVENTS[exp.event.eventId];
  return ev.options.map((o) => {
    let usable = true;
    let reason = '';
    if (o.cost?.gold && exp.carriedGold < o.cost.gold) { usable = false; reason = `Needs ${o.cost.gold} carried Thrones`; }
    if (o.cost?.doubloons && exp.fortune.doubloons < o.cost.doubloons) { usable = false; reason = `Needs ${o.cost.doubloons} scrip`; }
    const helper = helperFor(g, o.helper);
    const best = o.check ? bestCheck(g, o.check) : null;
    const target = o.check && best ? Math.max(0, best.target + o.check.mod - tierPenalty(exp) + (exp.flags.guidance ? 10 : 0)) : 0;
    const checkName = o.check ? (o.check.skill ? SKILLS[o.check.skill].name : CHAR_NAMES[o.check.char!]) : '';
    return { ...o, usable, reason, helper, best, target, checkName };
  });
}

export function chooseEvent(g: GameState, idx: number, useHelper = false): string | null {
  const exp = g.expedition!;
  if (!exp.event || exp.event.stage !== 'choose') return 'No event';
  const o = eventOptions(g)[idx];
  if (!o) return 'Invalid choice';
  if (!o.usable) return o.reason;
  if (o.cost?.gold) exp.carriedGold -= o.cost.gold;
  if (o.cost?.doubloons) exp.fortune.doubloons -= o.cost.doubloons;
  const lines: string[] = [];
  let success = true;
  if (o.check) {
    if (useHelper && o.helper) {
      lines.push(`${o.helper.hero.name} uses ${o.helper.how} — automatic success.`);
    } else {
      const r = test(stream(exp.rng, 'narrative'), o.target);
      delete exp.flags.guidance;
      success = r.success;
      lines.push(`${o.best!.hero.name} tests ${o.checkName}: ${r.roll} vs ${r.target} — ${success ? `success (${r.degrees} DoS)` : 'failure'}.`);
    }
  }
  for (const out of success ? o.success : o.failure ?? []) {
    const t = applyOutcome(g, out);
    if (t) lines.push(t);
    if (g.expedition!.combat?.status === 'active') break;
  }
  const room = exp.map.rooms[exp.event.roomKey];
  room.eventDone = true;
  if (exp.event.stage === 'choose') exp.event.stage = 'result';
  exp.event.result = lines;
  for (const l of lines) xlog(exp, l, 'info');
  return null;
}

function victimsOf(g: GameState, who: 'party' | 'one', rng: Rng): Hero[] {
  return who === 'party' ? living(g) : [rng.pick(living(g))];
}

function applyOutcome(g: GameState, o: Outcome): string | null {
  const exp = g.expedition!;
  const loot = stream(exp.rng, 'loot');
  const L = exp.partyLevel;
  switch (o.type) {
    case 'text': return o.t;
    case 'gold': { const n = Math.round(goldReward(L, 'normal') * (0.8 + loot.next()) * o.amount); exp.carriedGold += n; return `+${n} Thrones.`; }
    case 'doubloons': exp.fortune.doubloons = Math.max(0, exp.fortune.doubloons + o.n); return o.n >= 0 ? `+${o.n} scrip.` : `${o.n} scrip.`;
    case 'item': { const it = rollItem(loot, L, exp.biome, { boost: o.tier }); exp.carriedItems.push(it); return `Found: ${itemName(it)}.`; }
    case 'valuable': { const it = rollValuable(loot, Math.min(4, lootTier(L) + o.tier)); exp.carriedItems.push(it); return `Salvaged: ${itemName(it)}.`; }
    case 'heal': for (const h of living(g)) h.hp = Math.min(derive(h).maxHp, h.hp + Math.round(derive(h).maxHp * o.pct)); return `The party recovers ${Math.round(o.pct * 100)}% of their Wounds.`;
    case 'damage': {
      const v = victimsOf(g, o.who, loot);
      for (const h of v) h.hp = Math.max(1, h.hp - Math.round(derive(h).maxHp * o.pct));
      return o.who === 'party' ? 'The party is hurt.' : `${v[0].name} is hurt.`;
    }
    case 'insanity': { const v = victimsOf(g, o.who, loot); for (const h of v) gainInsanity(g, h, o.n); return `${o.who === 'party' ? 'The party' : v[0].name} gains ${o.n} Insanity.`; }
    case 'corruption': { const v = victimsOf(g, o.who, loot); for (const h of v) gainCorruption(g, h, o.n); return `${o.who === 'party' ? 'The party' : v[0].name} gains ${o.n} Corruption.`; }
    case 'fate': for (const h of living(g)) h.fate += o.n; return `Every explorer gains ${o.n} Fate Point${o.n > 1 ? 's' : ''} for this venture.`;
    case 'pf': g.profile.profitFactor += o.n; return `Profit Factor +${o.n}: word of your deeds reaches the enclave.`;
    case 'combat': {
      const room = exp.map.rooms[exp.pos];
      const mons = rollEncounter(stream(exp.rng, 'encounter'), exp.biome, L, o.elite ? 'elite' : 'normal', exp.difficulty);
      room.encounter = { monsters: mons, kind: o.elite ? 'elite' : 'normal', cleared: false };
      startCombat(g, room.key, mons, o.elite ? 'elite' : 'normal');
      return 'Combat!';
    }
    case 'meter': {
      const b = BIOMES[exp.biome];
      if (o.set !== undefined) {
        if (exp.biome === 'reliquary') { exp.meter = exp.meter >= 1 ? 0 : 1; return exp.meter ? '🌊 The coolant rises.' : '🌊 The coolant drains away — flooded passages open.'; }
        exp.meter = o.set;
      } else exp.meter = Math.max(0, Math.min(b.meter.max, exp.meter + o.delta));
      return `${b.meter.icon} ${b.meter.name}: ${exp.meter}.`;
    }
    case 'reveal':
      for (const k of exp.map.criticalPath) if (!exp.seen.includes(k)) exp.seen.push(k);
      return 'The path to the region\'s lord is revealed on your auspex.';
    case 'key':
      if (!exp.keys.includes('sigil')) exp.keys.push('sigil');
      return '⚿ You hold the warp-key.';
    case 'omen': {
      const h = loot.pick(HANDS.slice(1, 8));
      exp.fortune.omens[h.id] = (exp.fortune.omens[h.id] ?? 0) + 1;
      return `Tarot: ${h.name} levels up!`;
    }
    case 'die': {
      const o2 = makeOffer(loot, exp.fortune, 'die', new Set());
      if (o2?.die) { exp.fortune.bag.push(o2.die); return `${o2.die.name} joins your dice bag.`; }
      return null;
    }
    case 'token': {
      const id = o.id ?? loot.pick(Object.keys(TOKENS));
      if (exp.fortune.tokens.length >= 3) return 'Your token pouch is full.';
      exp.fortune.tokens.push(id);
      return `Gained a ${TOKENS[id].name}.`;
    }
    case 'charm': {
      const pool = CHARMS.filter((c) => (!o.rarity || c.rarity === o.rarity) && !exp.fortune.charms.some((x) => x.id === c.id));
      const c = loot.pick(pool.length ? pool : CHARMS);
      exp.boons = { offers: [{ kind: 'charm', id: c.id }], source: 'event', picks: 1 };
      return `A relic: ${c.name}!`;
    }
    case 'boons':
      exp.boons = { offers: rollBoons(loot, exp.fortune, o.source), source: o.source, picks: 1 };
      return 'Fortune smiles — choose a boon.';
    case 'resources':
      for (const h of living(g)) h.fate = Math.max(h.fate, derive(h).fateMax);
      return 'The party feels its luck return.';
    case 'condition':
      for (const h of living(g)) exp.flags[`${o.id}:${h.id}`] = 1;
      return o.id === 'blessed' ? 'The party feels blessed (next fight).' : o.id === 'poisoned' ? 'The party feels sick (next fight).' : 'Dread follows you (next fight).';
    case 'wheel': return spinWheel(g);
    case 'gamble': {
      const a = roll(loot, '1d10').total, b = roll(loot, '1d10').total;
      if (a > b) { exp.fortune.doubloons += 10; return `You roll ${a}, the ghost rolls ${b}. You win 10 scrip!`; }
      if (a === b) { exp.fortune.doubloons += 5; return `You both roll ${a}. Your wager is returned.`; }
      return `You roll ${a}, the ghost rolls ${b}. The ghost cackles and pockets your scrip.`;
    }
    case 'sacrifice':
      exp.event!.stage = 'pickDie';
      return 'Choose a die to give to the altar.';
  }
  return null;
}

function spinWheel(g: GameState): string {
  const exp = g.expedition!;
  const loot = stream(exp.rng, 'loot');
  const r = loot.next();
  if (r < 0.28) { exp.fortune.doubloons += 8; return '🪙 The THRONE: +8 scrip!'; }
  if (r < 0.48) { applyOutcome(g, { type: 'charm', rarity: loot.chance(0.3) ? 'rare' : 'uncommon' }); return '♛ The AQUILA: a relic appears!'; }
  if (r < 0.63) return `✶ The STAR: ${applyOutcome(g, { type: 'omen' })}`;
  if (r < 0.75) return `◆ The DIE: ${applyOutcome(g, { type: 'die' })}`;
  if (r < 0.85) { applyOutcome(g, { type: 'heal', pct: 0.4 }); return '✚ The CHIRURGEON: the party is healed.'; }
  if (r < 0.96) { applyOutcome(g, { type: 'damage', pct: 0.15, who: 'party' }); return '☠ The SKULL: the warp lashes the party!'; }
  applyOutcome(g, { type: 'charm', rarity: 'legendary' });
  return '👁 The EYE: a legendary relic!';
}

export function sacrificeDie(g: GameState, dieUid: string): string | null {
  const exp = g.expedition!;
  if (exp.event?.stage !== 'pickDie') return 'Nothing to sacrifice to.';
  if (exp.fortune.bag.length <= 8) return 'Your bag must keep at least 8 dice.';
  const die = exp.fortune.bag.find((d) => d.uid === dieUid);
  if (!die) return 'Pick a die.';
  exp.fortune.bag = exp.fortune.bag.filter((d) => d.uid !== dieUid);
  const fav = (Object.entries(exp.fortune.handsPlayed).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ?? 'pair') as keyof typeof exp.fortune.omens;
  exp.fortune.omens[fav] = (exp.fortune.omens[fav] ?? 0) + 1;
  exp.fortune.doubloons += 2;
  exp.event.stage = 'result';
  exp.event.result = [`The black altar accepts your ${die.name ?? `${die.material} die`}. Your favourite hand grows stronger (+1 level), and 2 scrip glint in the bowl.`];
  return null;
}

export function closeEvent(g: GameState) {
  const exp = g.expedition!;
  if (exp.event?.stage === 'result') exp.event = undefined;
  else if (exp.event?.stage === 'choose') { exp.map.rooms[exp.event.roomKey].eventDone = false; exp.event = undefined; }
}

export function reopenEvent(g: GameState): string | null {
  const exp = g.expedition!;
  const room = exp.map.rooms[exp.pos];
  if (!room.eventId || room.eventDone) return 'Nothing here.';
  exp.event = { roomKey: room.key, eventId: room.eventId, stage: 'choose' };
  return null;
}

// ── salvage ─────────────────────────────────────────────────────────────────

export function takeLoot(g: GameState): string | null {
  const err = canAct(g);
  if (err) return err;
  const exp = g.expedition!;
  const room = exp.map.rooms[exp.pos];
  if (!room.loot || room.loot.taken) return 'Nothing to take.';
  if (room.encounter && !room.encounter.cleared) return 'Deal with the guardians first.';
  const loot = stream(exp.rng, 'loot');
  room.loot.taken = true;
  if (room.loot.gold) {
    const n = Math.round(goldReward(exp.partyLevel, 'elite') * (0.7 + loot.next() * 0.6) * DIFFICULTY_MOD[exp.difficulty].gold);
    exp.carriedGold += n;
    xlog(exp, `+${n} Thrones.`, 'loot');
  }
  for (const _ of room.loot.items) {
    const it = rollItem(loot, exp.partyLevel, exp.biome, { boost: room.secret ? 1 : 0 });
    exp.carriedItems.push(it);
    xlog(exp, `Found ${itemName(it)}.`, 'loot');
  }
  if (room.secret || loot.chance(0.5)) {
    const v = rollValuable(loot, lootTier(exp.partyLevel) + (room.secret ? 1 : 0));
    exp.carriedItems.push(v);
    xlog(exp, `Salvaged ${itemName(v)}.`, 'loot');
  }
  if (room.loot.charm) exp.boons = { offers: rollBoons(loot, exp.fortune, 'treasure'), source: 'treasure', picks: 1 };
  return null;
}

// ── combat outcomes ─────────────────────────────────────────────────────────

hooks.victory = () => {};

export function afterCombat(g: GameState) {
  const exp = g.expedition!;
  const combat = exp.combat;
  if (!combat) return;
  const ctx = makeCtx(g);
  syncHeroes(ctx);
  if (exp.flags.captainDead) {
    endCombatTray(exp.fortune);
    finishExpedition(g, 'wiped');
    return;
  }
  if (combat.status === 'victory' && !combat.rewarded) {
    combat.rewarded = true;
    grantSpoils(g);
  }
  if (combat.status === 'defeat') {
    endCombatTray(exp.fortune);
    if (g.mode === 'story' || exp.tutorial) {
      for (const h of party(g)) if ((h.status === 'alive' || combat.diedThisFight.includes(h.id)) && !h.lordCaptain) { h.status = 'alive'; h.hp = 1; }
      for (const h of party(g)) if (h.lordCaptain && h.status === 'alive') h.hp = 1;
      exp.carriedGold = 0;
      exp.carriedItems = [];
      xlog(exp, exp.tutorial ? 'The enclave\'s wardens drag you out of the Nursery. Nobody dies in practice.' : 'Your crew drags the party back to the ship, empty-handed.', 'warn');
      finishExpedition(g, 'wiped');
    } else {
      // Everyone left on the field is lost — and with them, the Lord-Captain.
      for (const h of party(g)) if (h.status === 'alive') { h.status = 'dead'; h.history.deathCause = `fell in ${BIOMES[exp.biome].name}`; if (h.lordCaptain) exp.flags.captainDead = 1; }
      finishExpedition(g, 'wiped');
    }
    return;
  }
  if (combat.status === 'fled') {
    endCombatTray(exp.fortune);
    exp.combat = undefined;
    if (exp.prev) { exp.pos = exp.prev; xlog(exp, 'You fall back to the previous chamber.', 'warn'); }
  }
}

function grantSpoils(g: GameState) {
  const exp = g.expedition!;
  const combat = exp.combat!;
  const loot = stream(exp.rng, 'loot');
  const room = exp.map.rooms[combat.roomKey];
  if (room.encounter) room.encounter.cleared = true;
  const kind = combat.kind;
  const gold = Math.round(goldReward(exp.partyLevel, kind) * DIFFICULTY_MOD[exp.difficulty].gold * (0.85 + loot.next() * 0.3));
  exp.carriedGold += gold;
  const xp = XP_PER_FIGHT[kind];
  exp.xpEarned += xp;
  const intr = interest(exp.fortune);
  let charmBonus = 0;
  for (const ch of exp.fortune.charms) {
    const v = CHARM_BY_ID[ch.id]?.onCombatEnd?.(ch, exp.fortune);
    if (typeof v === 'number') charmBonus += v;
    if (ch.id === 'avalanche' && combat.diedThisFight.length === 0 && !combatHeroes(makeCtx(g)).some((h) => h.downed)) ch.counter = Math.round((ch.counter + 0.25) * 100) / 100;
  }
  const base = DOUBLOONS_PER_COMBAT[kind];
  exp.fortune.doubloons += base + intr + charmBonus;
  const items: string[] = [];
  const dropChance = kind === 'elite' ? 0.75 : kind === 'boss' ? 0 : 0.3;
  if (loot.chance(dropChance)) {
    const it = rollItem(loot, exp.partyLevel, exp.biome, { boost: kind === 'elite' ? 1 : 0 });
    exp.carriedItems.push(it);
    items.push(itemName(it));
  }
  exp.depth += 1;
  exp.fortune.rank += 1;
  const ctx = makeCtx(g);
  for (const c of combatHeroes(ctx)) {
    const h = heroOf(ctx, c)!;
    if (h.status === 'alive' && (c.downed || c.hp <= 0)) h.hp = 1;
  }
  for (const id of combat.diedThisFight) if (!exp.fallen.includes(id)) exp.fallen.push(id);
  exp.spoils = { gold, doubloons: base, interest: intr, items, kind, rank: exp.fortune.rank, charmBonus, xp };
  // The Fortune run ends with the expedition, so a boon after the region's lord falls
  // would be spent on nothing: the boss pays out in loot (the item choice) instead.
  if (kind !== 'boss') exp.boons = { offers: rollBoons(loot, exp.fortune, kind === 'elite' ? 'elite' : 'normal'), source: kind, picks: 1 };
  if (kind === 'boss') {
    exp.flags.bossRounds = combat.round;
    exp.bossDefeated = true;
    exp.lootChoice = { items: bossLootChoice(loot, exp.partyLevel, exp.biome) };
    xlog(exp, `${exp.theme.boss} is defeated! The Fortress shudders and begins to shift.`, 'loot');
  }
  endCombatTray(exp.fortune);
}

export function closeSpoils(g: GameState) {
  const exp = g.expedition!;
  exp.spoils = undefined;
  if (exp.combat && exp.combat.status !== 'active') exp.combat = undefined;
  const room = exp.map.rooms[exp.pos];
  if (room.type === 'elite' && room.loot && !room.loot.taken) room.loot.taken = true;
  if (room.eventId && !room.eventDone && !exp.boons) openRoomFeature(g, room);
}

export function pickBoon(g: GameState, idx: number, target?: { dieUid?: string; face?: number; replaceCharm?: number }): string | null {
  const exp = g.expedition!;
  if (!exp.boons) return 'No boons to pick.';
  const o = exp.boons.offers[idx];
  if (!o || o.sold) return 'Invalid boon.';
  const r = applyOffer(exp.fortune, o, target);
  if (!r.ok) return r.reason;
  if (o.kind === 'charm' && !g.profile.codex.charms.includes(o.id)) g.profile.codex.charms.push(o.id);
  xlog(exp, r.text, 'fortune');
  o.sold = true;
  exp.boons.picks -= 1;
  if (exp.boons.picks <= 0) finishBoons(g);
  return null;
}

export function skipBoon(g: GameState): string | null {
  const exp = g.expedition!;
  if (!exp.boons) return null;
  exp.fortune.doubloons += 2;
  xlog(exp, 'You skip the boon and pocket 2 scrip.', 'fortune');
  finishBoons(g);
  return null;
}

function finishBoons(g: GameState) {
  const exp = g.expedition!;
  exp.boons = undefined;
  const room = exp.map.rooms[exp.pos];
  if (room.eventId && !room.eventDone && !exp.event && !exp.spoils) openRoomFeature(g, room);
}

export function pickLoot(g: GameState, idx: number): string | null {
  const exp = g.expedition!;
  if (!exp.lootChoice) return 'Nothing to choose.';
  const it = exp.lootChoice.items[idx];
  if (!it) return 'Invalid choice.';
  exp.carriedItems.push(it);
  xlog(exp, `You claim ${itemName(it)}.`, 'loot');
  exp.lootChoice = undefined;
  return null;
}

// ── the Fortress trader ─────────────────────────────────────────────────────

export function shopBuy(g: GameState, idx: number, target?: { dieUid?: string; face?: number; replaceCharm?: number }): string | null {
  const exp = g.expedition!;
  const shop = exp.shop;
  if (!shop) return 'No trader here.';
  const o = shop.offers[idx];
  if (!o || o.sold) return 'Sold out.';
  if ((o.price ?? 0) > exp.fortune.doubloons) return 'Not enough scrip.';
  const r = applyOffer(exp.fortune, o, target);
  if (!r.ok) return r.reason;
  exp.fortune.doubloons -= o.price ?? 0;
  o.sold = true;
  if (o.kind === 'charm' && !g.profile.codex.charms.includes(o.id)) g.profile.codex.charms.push(o.id);
  xlog(exp, `Bought ${offerTitle(o)}. ${r.text}`, 'fortune');
  persistShop(exp);
  return null;
}

export function shopReroll(g: GameState): string | null {
  const exp = g.expedition!;
  const shop = exp.shop;
  if (!shop) return 'No trader here.';
  if (exp.fortune.doubloons < shop.rerollCost) return 'Not enough scrip.';
  exp.fortune.doubloons -= shop.rerollCost;
  shop.offers = rollShop(stream(exp.rng, 'loot'), exp.fortune);
  shop.rerollCost += 1;
  persistShop(exp);
  return null;
}

export function sellCharm(g: GameState, idx: number): string | null {
  const exp = g.expedition!;
  const ch = exp.fortune.charms[idx];
  if (!ch) return 'No such relic.';
  const def = CHARM_BY_ID[ch.id];
  const value = Math.max(1, Math.floor(({ common: 4, uncommon: 6, rare: 8, legendary: 12 }[def.rarity]) / 2));
  exp.fortune.charms.splice(idx, 1);
  exp.fortune.doubloons += value;
  xlog(exp, `Sold ${def.name} for ${value} scrip.`, 'fortune');
  return null;
}

export function moveCharm(g: GameState, from: number, to: number): string | null {
  const run = g.expedition!.fortune;
  if (from < 0 || from >= run.charms.length || to < 0 || to >= run.charms.length) return null;
  const [c] = run.charms.splice(from, 1);
  run.charms.splice(to, 0, c);
  return null;
}

function persistShop(exp: Expedition) {
  exp.shops = exp.shops ?? {};
  if (exp.shop) exp.shops[exp.shop.roomKey] = exp.shop;
}

// ── rest, items and powers out of combat ────────────────────────────────────

export function rest(g: GameState, kind: 'short' | 'long'): string | null {
  const err = canAct(g);
  if (err) return err;
  const exp = g.expedition!;
  const room = exp.map.rooms[exp.pos];
  const rations = exp.carriedItems.findIndex((i) => i.defId === 'rations');
  if (room.type !== 'camp' && !(kind === 'short' && rations >= 0)) return 'You can only rest in a safe chamber.';
  if (room.encounter && !room.encounter.cleared) return 'Not while enemies remain.';
  const flag = `rested:${room.key}`;
  const medic = living(g).reduce((best, h) => Math.max(best, derive(h).skills.medicae ?? -1), -1);
  const rng = stream(exp.rng, 'narrative');
  if (kind === 'short') {
    if (room.type === 'camp' && exp.flags[flag] && rations < 0) return 'You have already rested here.';
    if (room.type !== 'camp' || exp.flags[flag]) {
      const s = exp.carriedItems[rations];
      if ((s.qty ?? 1) > 1) s.qty! -= 1; else exp.carriedItems.splice(rations, 1);
    }
    exp.flags[flag] = 1;
    for (const h of living(g)) restHeal(h, rng, medic >= 0 ? medic : null, 0.35);
    exp.shortRests += 1;
    xlog(exp, `The party binds its wounds${medic >= 0 ? ' (Medicae helps)' : ''}.`, 'heal');
    return null;
  }
  if (exp.longRestUsed) return 'You have already made camp for the night this venture.';
  if (room.type !== 'camp') return 'Making camp needs a safe chamber.';
  exp.longRestUsed = true;
  for (const h of living(g)) h.hp = derive(h).maxHp;
  exp.depth += 1;
  xlog(exp, 'The party sleeps in shifts. Fully healed — but the Fortress shifts in the night, and its denizens grow bolder.', 'warn');
  return null;
}

export function useItemExplore(g: GameState, uid: string, heroId: string): string | null {
  const err = canAct(g);
  if (err) return err;
  const exp = g.expedition!;
  const idx = exp.carriedItems.findIndex((i) => i.uid === uid);
  if (idx < 0) return 'No such item.';
  const inst = exp.carriedItems[idx];
  const def = ITEMS[inst.defId];
  const target = g.roster.find((h) => h.id === heroId);
  if (!def.consumable?.explore || !target) return 'Cannot use that here.';
  const consume = () => { if ((inst.qty ?? 1) > 1) inst.qty! -= 1; else exp.carriedItems.splice(idx, 1); };
  const rng = stream(exp.rng, 'narrative');
  const d = derive(target);
  switch (def.consumable.effect) {
    case 'heal': {
      if (target.status !== 'alive') return 'They are beyond medicine.';
      const amt = roll(rng, def.consumable.dice!).total * 2.5 * (1 + 0.3 * (target.level - 1));
      target.hp = Math.min(d.maxHp, Math.round(target.hp + amt));
      consume();
      xlog(exp, `${target.name} uses ${def.name}.`, 'heal');
      return null;
    }
    case 'cleanse':
      target.hp = Math.min(d.maxHp, target.hp + Math.round(d.maxHp * 0.15));
      consume();
      return null;
    case 'camp':
      return rest(g, 'short');
    case 'revive': {
      if (target.status !== 'dead' || !exp.partyIds.includes(target.id)) return 'Choose a fallen party member.';
      if (target.lordCaptain) return 'The Lord-Captain is beyond saving.';
      if (exp.map.rooms[exp.pos].type !== 'camp') return 'The stasis pod needs a safe chamber.';
      target.status = 'alive';
      target.hp = 1;
      delete target.history.deathCause;
      consume();
      xlog(exp, `${target.name} draws breath again!`, 'heal');
      return null;
    }
  }
  return 'Nothing happens.';
}

/** Exploration uses of psychic techniques and Navigator powers. */
export function usePowerExplore(g: GameState, heroId: string, powerId: string): string | null {
  const err = canAct(g);
  if (err) return err;
  const exp = g.expedition!;
  const h = g.roster.find((x) => x.id === heroId);
  const p = POWERS[powerId];
  if (!h || !p || h.status !== 'alive' || h.powers[powerId] === undefined || !p.explore) return 'Cannot use that here.';
  const flag = `explorePower:${h.id}:${exp.pos}`;
  if (exp.flags[flag]) return 'Already used in this chamber.';
  const d = derive(h);
  const target = p.discipline === 'Navigator' ? d.chars[p.char ?? 'WP'] + 10 * (h.powers[powerId] ?? 0) + d.focusBonus : d.chars.WP + 5 * Math.ceil(d.psyRating / 2) + d.focusBonus;
  const r = test(stream(exp.rng, 'narrative'), target);
  exp.flags[flag] = 1;
  if (!r.success) { xlog(exp, `${h.name} reaches for ${p.name} but the warp is murky. (${r.roll} vs ${r.target})`, 'info'); return null; }
  switch (p.explore) {
    case 'reveal':
      for (const k of exp.map.criticalPath) if (!exp.seen.includes(k)) exp.seen.push(k);
      xlog(exp, `${h.name} uses ${p.name}: the way to the region's lord is clear.`, 'loot');
      return null;
    case 'secrets': {
      const found = revealSecrets(exp, exp.map.rooms[exp.pos]);
      xlog(exp, found ? `${h.name}'s warp eye finds a hidden passage!` : `${h.name} sees no hidden ways here.`, found ? 'loot' : 'info');
      return null;
    }
    case 'guidance':
      exp.flags.guidance = 1;
      xlog(exp, `${h.name} reads the minds nearby: +10 to the next check.`, 'info');
      return null;
  }
  return null;
}

// ── leaving ─────────────────────────────────────────────────────────────────

export function retreat(g: GameState): string | null {
  const err = canAct(g);
  if (err) return err;
  const exp = g.expedition!;
  if (exp.pos !== exp.map.start) return 'You can only withdraw from the entrance.';
  finishExpedition(g, 'retreated');
  return null;
}

export function exitDungeon(g: GameState): string | null {
  const err = canAct(g);
  if (err) return err;
  const exp = g.expedition!;
  if (!exp.bossDefeated) return 'The region\'s lord still stands.';
  finishExpedition(g, 'won');
  return null;
}

export function finishExpedition(g: GameState, kind: 'won' | 'retreated' | 'wiped') {
  const exp = g.expedition!;
  exp.status = kind;
  const members = party(g);
  const captain = members.find((h) => h.lordCaptain);
  const captainLost = !!exp.flags.captainDead || (!!captain && captain.status === 'dead');
  const result: NonNullable<GameState['lastResult']> = {
    kind, gold: 0, items: [], fallen: [], xp: 0, biome: exp.biome, score: exp.fortune.bestScore, fights: exp.fortune.rank, rank: exp.fortune.rank,
    charms: exp.fortune.charms.map((c) => c.id), bossRounds: exp.flags.bossRounds ?? 0,
  };
  if (exp.tutorial) result.tutorial = true;
  if (exp.finale) result.finale = true;
  if (kind === 'won' || kind === 'retreated') {
    const gold = kind === 'won' ? exp.carriedGold : Math.floor(exp.carriedGold * 0.5);
    g.profile.bankedGold += gold;
    result.gold = gold;
    for (const it of exp.carriedItems) { g.vault.push(it); result.items.push(itemName(it)); }
  }
  const xp = kind === 'won' ? exp.xpEarned + (exp.tutorial ? 500 : XP_PER_CLEAR) : kind === 'retreated' ? exp.xpEarned : 0;
  result.xp = xp;
  for (const h of members) {
    if (h.status === 'dead') { result.fallen.push(h.name); continue; }
    h.xp += xp;
    if (kind === 'won') h.history.clears += 1;
    syncLevel(h);
    h.hp = derive(h).maxHp;
  }
  for (const h of members.filter((x) => x.status === 'dead')) {
    if (kind !== 'wiped') {
      for (const slot of Object.keys(h.equipment) as (keyof Hero['equipment'])[]) {
        const it = h.equipment[slot];
        if (it) { g.vault.push(it); delete h.equipment[slot]; }
      }
    }
  }
  const story = storyOf(g);
  if (kind === 'won' && exp.finale) {
    g.profile.stats.clears += 1;
    story.warrant += 1;
    g.profile.profitFactor += 10;
    result.chapter = EPILOGUE.id;
  } else if (kind === 'won' && !exp.tutorial) {
    g.profile.stats.clears += 1;
    g.profile.sigils[exp.biome] = (g.profile.sigils[exp.biome] ?? 0) + 1;
    g.profile.profitFactor += 1;
    result.pf = 1;
    const next = BIOME_ORDER[BIOME_ORDER.indexOf(exp.biome) + 1];
    if (next && !g.profile.unlockedBiomes.includes(next)) g.profile.unlockedBiomes.push(next);
    if (!story.seen.includes(exp.biome)) { story.seen.push(exp.biome); result.chapter = CHAPTERS[exp.biome].id; }
  }
  if (kind === 'wiped') g.profile.stats.wipes += 1;
  if (kind === 'retreated') g.profile.stats.retreats += 1;
  g.profile.stats.deaths += result.fallen.length;
  if (exp.fortune.bestScore > g.profile.stats.bestScore) g.profile.stats.bestScore = exp.fortune.bestScore;
  if (captainLost && captain) {
    result.captainLost = true;
    g.phase = 'over';
    g.ending = { captain: captain.name, cause: captain.history.deathCause ?? `fell in ${BIOMES[exp.biome].name}`, day: g.profile.townDay, clears: g.profile.stats.clears };
  }
  g.lastResult = result;
  g.expedition = undefined;
  g.profile.townDay += 1;
}

export function mapView(exp: Expedition) {
  const cells: { x: number; y: number; room?: Room; seen: boolean; visited: boolean; here: boolean }[] = [];
  for (let y = 0; y < exp.map.height; y++) for (let x = 0; x < exp.map.width; x++) {
    const k = key(x, y);
    const room = exp.map.rooms[k];
    cells.push({ x, y, room, seen: exp.seen.includes(k), visited: exp.visited.includes(k), here: exp.pos === k });
  }
  return cells;
}

export { parseKey, DELTA, biomeMonsters, newCharm };
export type { BoonOffer };
