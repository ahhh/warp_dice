/**
 * Combat kernel: setup, Fear, conditions, the damage pipeline (Armour against
 * Penetration, Toughness Bonus), turn order, Blood Loss, Burning Fate, and
 * victory/defeat. Pure state mutation over plain JSON + seeded RNG.
 */
import type { Char, Combat, Combatant, Condition, ConditionId, DamageType, Expedition, GameState, Hero, HitLoc, LogEntry, Rank } from '../engine/types.ts';
import { Rng } from '../engine/rng.ts';
import { test, roll, bonus, hitLocation, type TestResult } from '../engine/dice.ts';
import { MONSTERS, TIER_TITLES, tierIndex } from '../content/monsters.ts';
import { CAREERS } from '../content/careers.ts';
import { derive } from '../rules/character.ts';
import {
  monsterHp, monsterDamage, monsterSkill, monsterWp, monsterAp, monsterTb, depthScale, soakFraction, DIFFICULTY_MOD, ROLE_MOD, ELITE_MOD, VITALITY, ECHO,
} from '../rules/balance.ts';
import { monsterIdOf } from '../dungeon/generator.ts';
import { startCombatTray, handSize, endCombatTray } from '../fortune/tray.ts';
import { CHARM_BY_ID } from '../fortune/charms.ts';
import { CURSES, type CurseId } from '../fortune/curses.ts';
import { BIOMES } from '../content/biomes.ts';

export interface Ctx {
  game: GameState;
  exp: Expedition;
  combat: Combat;
  rng: Rng;
  fortuneRng: Rng;
  aiRng: Rng;
}

export function makeCtx(game: GameState): Ctx {
  const exp = game.expedition!;
  return { game, exp, combat: exp.combat!, rng: new Rng(exp.rng.combat), fortuneRng: new Rng(exp.rng.fortune), aiRng: new Rng(exp.rng.ai) };
}

export const heroOf = (ctx: Ctx, c: Combatant): Hero | undefined => (c.side === 'hero' ? ctx.game.roster.find((h) => h.id === c.refId) : undefined);

export function log(ctx: Ctx, t: string, kind?: LogEntry['kind']) {
  ctx.combat.log.push({ t, kind });
  if (ctx.combat.log.length > 200) ctx.combat.log.splice(0, ctx.combat.log.length - 200);
}

export function fx(ctx: Ctx, f: Combat['fx'][number]) {
  ctx.combat.fx.push(f);
}

export const all = (ctx: Ctx) => Object.values(ctx.combat.combatants);
export const heroes = (ctx: Ctx) => all(ctx).filter((c) => c.side === 'hero');
export const enemies = (ctx: Ctx) => all(ctx).filter((c) => c.side === 'enemy');
export const alive = (c: Combatant) => !c.dead && !c.downed;
export const livingEnemies = (ctx: Ctx) => enemies(ctx).filter(alive);
export const livingHeroes = (ctx: Ctx) => heroes(ctx).filter(alive);

export function has(c: Combatant, id: ConditionId): boolean {
  return c.conditions.some((x) => x.id === id);
}
export function cond(c: Combatant, id: ConditionId): Condition | undefined {
  return c.conditions.find((x) => x.id === id);
}

function partyFeature(ctx: Ctx, id: string): boolean {
  return livingHeroes(ctx).some((c) => { const h = heroOf(ctx, c); return !!h && derive(h).features.has(id); });
}
function partyTalent(ctx: Ctx, id: string): boolean {
  return livingHeroes(ctx).some((c) => heroOf(ctx, c)?.talents.includes(id));
}

export function addCondition(ctx: Ctx, c: Combatant, condition: Condition) {
  const h = heroOf(ctx, c);
  if (h) {
    if (condition.id === 'frightened' && partyTalent(ctx, 'intoTheJaws')) return;
    if (condition.id === 'poisoned' && (h.talents.includes('decadence') || derive(h).features.has('implants'))) return;
    if (condition.id === 'blinded' && h.careerId === 'astropath') return;
  }
  if (c.mon?.tags.includes('construct') && (condition.id === 'poisoned' || condition.id === 'frightened' || condition.id === 'bleeding' || condition.id === 'dominated')) return;
  if (c.mon?.tags.includes('daemon') && (condition.id === 'frightened' || condition.id === 'poisoned' || condition.id === 'bleeding')) return;
  const existing = cond(c, condition.id);
  if (existing) {
    existing.rounds = existing.rounds === -1 || condition.rounds === -1 ? -1 : Math.max(existing.rounds, condition.rounds);
    if ((condition.value ?? 0) > (existing.value ?? 0)) existing.value = condition.value;
    return;
  }
  c.conditions.push({ ...condition });
}

export function removeCondition(c: Combatant, id: ConditionId) {
  c.conditions = c.conditions.filter((x) => x.id !== id);
}

export function incapacitated(c: Combatant): boolean {
  return c.downed || c.dead || ['stunned', 'helpless'].some((id) => has(c, id as ConditionId));
}

// ── Characteristic Tests for any combatant ──────────────────────────────────

/** A combatant's Characteristic (foes have WS/BS/WP/Ag; everything else falls back to WP-ish). */
export function charOf(ctx: Ctx, c: Combatant, ch: Char): number {
  const h = heroOf(ctx, c);
  if (h) {
    const d = derive(h);
    let v = d.chars[ch];
    if (ch === 'WP' && partyFeature(ctx, 'inspiringPresence') && !h.lordCaptain) v += 5;
    return v;
  }
  const m = c.mon!;
  switch (ch) {
    case 'WS': return m.ws;
    case 'BS': return m.bs;
    case 'WP': return m.wp;
    case 'Ag': return m.ag;
    case 'T': return m.tb * 10 + 5;
    case 'S': return m.ws;
    default: return m.wp;
  }
}

/** Situational modifiers to every Test the combatant makes. */
export function testMods(c: Combatant): number {
  let m = 0;
  if (has(c, 'inspired') || has(c, 'blessed')) m += 10;
  if (has(c, 'frightened')) m -= 10;
  if (has(c, 'fatigued')) m -= 10;
  if (has(c, 'poisoned')) m -= 10;
  if (has(c, 'frenzied')) m += 0;
  return m;
}

/** Test a Characteristic (with skill if given) for any combatant. */
export function charTest(ctx: Ctx, c: Combatant, ch: Char, mod = 0, rng: Rng = ctx.rng): TestResult {
  return test(rng, charOf(ctx, c, ch) + mod + testMods(c));
}

// ── setup ───────────────────────────────────────────────────────────────────

export function scaledMonster(ctx: { exp: Expedition }, entry: string, idx: number): Combatant {
  const { id, elite } = monsterIdOf(entry);
  const def = MONSTERS[id];
  const L = ctx.exp.partyLevel;
  const role = ROLE_MOD[def.role] ?? ROLE_MOD.brute;
  const diff = DIFFICULTY_MOD[ctx.exp.difficulty];
  const depth = depthScale(ctx.exp.depth, L);
  let hp = monsterHp(L) * role.hp * diff.hp * depth;
  let dmg = monsterDamage(L) * role.dmg * diff.dmg * (1 + 0.04 * ctx.exp.depth);
  let skill = monsterSkill(L) + role.skill;
  let ap = Math.max(0, monsterAp(L) + role.ap);
  if (elite) { hp *= ELITE_MOD.hp; dmg *= ELITE_MOD.dmg; ap += ELITE_MOD.ap; skill += ELITE_MOD.skill; }
  if (def.role === 'boss' && L <= 2) hp *= 0.85;
  if (def.boss?.hpMult) hp *= def.boss.hpMult;
  if (ctx.exp.tutorial) { hp *= 0.6; dmg *= 0.7; skill -= 5; }
  const tier = TIER_TITLES[tierIndex(L)];
  hp = Math.round(hp);
  const dodge = def.role === 'skirmisher' ? 30 : def.tags.includes('eldar') ? 35 : def.role === 'boss' ? 20 : def.role === 'artillery' ? 10 : 0;
  return {
    id: `e${idx}`, side: 'enemy', refId: id, name: `${elite ? 'Elite ' : ''}${def.role === 'boss' ? '' : tier}${def.name}`,
    art: `monsters/${def.biome}_${def.id}`, rank: def.rank, level: L, hp, maxHp: hp, tempHp: 0,
    agB: def.role === 'skirmisher' ? 4 : def.role === 'artillery' ? 3 : 2, initiative: 0,
    conditions: [], downed: false, dead: false, crit: 0, stable: false,
    used: { half: 2, reaction: false, fortune: false },
    mon: {
      role: def.role, ws: skill, bs: skill, wp: monsterWp(L) + (def.role === 'boss' ? 10 : 0) + (def.tags.includes('psyker') ? 10 : 0), ag: skill,
      tb: monsterTb(L) + (def.role === 'brute' || def.role === 'defender' ? 1 : 0), ap,
      dmgBase: Math.max(2, Math.round(dmg)), resist: def.resist ?? [], immune: def.immune ?? [], vuln: def.vuln ?? [], actions: def.actions,
      tags: def.tags, boss: def.role === 'boss', phase: 1, phases: def.boss?.phases ?? 1, elite, fear: def.fear, dodge,
    },
  };
}

export function heroCombatant(hero: Hero, rank: Rank): Combatant {
  const d = derive(hero);
  return {
    id: hero.id, side: 'hero', refId: hero.id, name: hero.name, art: hero.portrait, rank, level: hero.level,
    hp: Math.min(hero.hp, d.maxHp), maxHp: d.maxHp, tempHp: 0, agB: d.bonuses.Ag, initiative: 0,
    conditions: [], downed: hero.hp <= 0, dead: hero.status === 'dead', crit: 0, stable: hero.hp <= 0,
    used: { half: 2, reaction: false, fortune: false },
  };
}

export function defaultRank(hero: Hero): Rank {
  const d = derive(hero);
  if (CAREERS[hero.careerId].defaultRank === 'front' && !d.main.ranged) return 'front';
  if (!d.main.ranged) return 'front';
  return CAREERS[hero.careerId].defaultRank;
}

export function startCombat(game: GameState, roomKey: string, entries: string[], kind: Combat['kind']): void {
  const exp = game.expedition!;
  const combat: Combat = {
    id: `c${exp.depth}_${roomKey}`, kind, round: 0, order: [], turnIndex: -1, combatants: {}, log: [], status: 'active',
    roomKey, rewarded: false, kills: 0, handsThisCombat: 0, rerollsUsed: 0, fx: [], once: {}, diedThisFight: [], legendary: {}, feared: [],
  };
  exp.combat = combat;
  const ctx = makeCtx(game);
  const party = exp.partyIds.map((id) => game.roster.find((h) => h.id === id)!).filter((h) => h && h.status === 'alive');
  for (const h of party) {
    const flag = exp.flags[`rank:${h.id}`];
    const rank = (flag === 1 ? 'back' : flag === 2 ? 'front' : defaultRank(h)) as Rank;
    combat.combatants[h.id] = heroCombatant(h, rank);
  }
  const hs = heroes(ctx).filter(alive);
  if (hs.length && !hs.some((c) => c.rank === 'front')) hs.sort((a, b) => b.maxHp - a.maxHp)[0].rank = 'front';

  entries.forEach((e, i) => {
    const m = scaledMonster(ctx, e, i);
    combat.combatants[m.id] = m;
  });
  if (kind === 'boss') {
    const b = enemies(ctx).find((c) => c.mon?.boss);
    if (b) {
      const def = MONSTERS[b.refId];
      combat.curse = def.boss?.curse;
      ctx.combat.legendary[b.id] = exp.partyLevel >= 11 ? 3 : 2;
      log(ctx, `${def.name}, ${def.boss?.title}! ${def.boss?.intro}`, 'warn');
    }
  } else if (kind === 'elite') {
    const pool: CurseId[] = ['hunger', 'silence', 'oddDrown', 'evenMirror', 'ashen'];
    if (exp.difficulty === 'perilous' || exp.depth >= 4) combat.curse = ctx.rng.pick(pool);
  }
  if (combat.curse) log(ctx, `Curse — ${CURSES[combat.curse].name}: ${CURSES[combat.curse].text}`, 'warn');

  // Initiative: 1d10 + Agility Bonus (Core p.236).
  const surprise = exp.flags.surprise && !partyTalent(ctx, 'lightSleeper');
  for (const c of all(ctx)) {
    const h = heroOf(ctx, c);
    let bonusInit = c.agB;
    let r = ctx.rng.die(10);
    if (h) {
      const d = derive(h);
      bonusInit = d.init;
      if (h.talents.includes('lightningReflexes')) r = Math.max(r, ctx.rng.die(10));
    }
    if (surprise && c.side === 'enemy') r += 5;
    c.initiative = r + bonusInit + (c.side === 'hero' ? 0.1 : 0) + ctx.rng.next() * 0.01;
  }
  combat.order = all(ctx).sort((a, b) => b.initiative - a.initiative).map((c) => c.id);

  // Fortune tray.
  const maxLevel = Math.max(...party.map((h) => h.level));
  const curseDelta = combat.curse ? CURSES[combat.curse].handSizeDelta ?? 0 : 0;
  startCombatTray(exp.fortune, ctx.fortuneRng, handSize(exp.fortune, maxLevel, curseDelta) + trayBonus(ctx));

  for (const c of heroes(ctx)) {
    const h = heroOf(ctx, c)!;
    if (exp.flags[`blessed:${h.id}`]) { addCondition(ctx, c, { id: 'blessed', rounds: 3 }); delete exp.flags[`blessed:${h.id}`]; }
    if (exp.flags[`frightened:${h.id}`]) { addCondition(ctx, c, { id: 'frightened', rounds: 2 }); delete exp.flags[`frightened:${h.id}`]; }
    if (exp.flags[`poisoned:${h.id}`]) { addCondition(ctx, c, { id: 'poisoned', rounds: 3 }); delete exp.flags[`poisoned:${h.id}`]; }
  }
  fearTests(ctx);
  applyBiomeAtStart(ctx);
  advance(ctx);
}

/** Party features that widen the tray (Astral Telepathy). */
export function trayBonus(ctx: Ctx): number {
  return partyFeature(ctx, 'astralTelepathy') ? 1 : 0;
}

/**
 * Fear (Core p.315, condensed): the first time a fearsome foe appears, every
 * explorer Tests Willpower at -10 per Fear rating above 1. Failure: Frightened
 * for 2 rounds and 1d5 Insanity.
 */
export function fearTests(ctx: Ctx) {
  for (const e of livingEnemies(ctx)) {
    const fear = e.mon?.fear ?? 0;
    if (!fear || ctx.combat.feared.includes(e.refId)) continue;
    ctx.combat.feared.push(e.refId);
    if (partyTalent(ctx, 'intoTheJaws')) { log(ctx, `${e.name} is terrible to behold — but you have walked into the jaws of hell before.`, 'info'); continue; }
    const discipline = partyTalent(ctx, 'ironDiscipline') ? 10 : 0;
    for (const c of livingHeroes(ctx)) {
      const h = heroOf(ctx, c)!;
      const mod = -10 * (fear - 1) + discipline + (h.talents.includes('resistanceFear') ? 10 : 0);
      let r = charTest(ctx, c, 'WP', mod);
      if (!r.success && h.talents.includes('unshakeableFaith')) r = charTest(ctx, c, 'WP', mod);
      if (r.success) continue;
      addCondition(ctx, c, { id: 'frightened', rounds: 2, save: { char: 'WP', mod } });
      const ins = roll(ctx.rng, '1d5').total;
      gainInsanity(ctx, h, ins);
      log(ctx, `${c.name} is gripped by fear of ${e.name}! (+${ins} Insanity)`, 'warn');
    }
  }
}

export function gainInsanity(_ctx: unknown, h: Hero, n: number) {
  if (n <= 0) return;
  h.insanity = Math.min(100, h.insanity + n);
}

export function gainCorruption(_ctx: unknown, h: Hero, n: number) {
  if (n <= 0) return;
  const amt = h.talents.includes('armourOfContempt') ? Math.floor(n / 2) : n;
  h.corruption = Math.min(100, h.corruption + amt);
}

function applyBiomeAtStart(ctx: Ctx) {
  const exp = ctx.exp;
  const b = BIOMES[exp.biome];
  const room = exp.map.rooms[ctx.combat.roomKey];
  switch (exp.biome) {
    case 'docks':
      if (exp.meter >= 3) {
        for (const c of livingHeroes(ctx)) addCondition(ctx, c, { id: 'bleeding', rounds: 2, value: Math.max(1, Math.round(c.maxHp * 0.025 * exp.meter)) });
        ctx.combat.biomeNote = `${b.meter.icon} Decompression ${exp.meter}: void-burn makes the party bleed — Void & Aquila dice +1 Mult.`;
      }
      break;
    case 'gardens':
      if (exp.meter >= 3) {
        for (const c of livingEnemies(ctx)) addCondition(ctx, c, { id: 'regenerating', rounds: -1, value: Math.max(2, Math.round(c.maxHp * 0.04)) });
        ctx.combat.biomeNote = `${b.meter.icon} Bloom ${exp.meter}: foes regenerate — Ledger & Eye dice +4 Chips.`;
      }
      break;
    case 'reliquary':
      if (exp.meter >= 1) {
        for (const c of livingEnemies(ctx)) if (!c.mon!.resist.includes('energy')) c.mon!.resist = [...c.mon!.resist, 'energy'];
        ctx.combat.biomeNote = `${b.meter.icon} High coolant: Cryo & Void dice +2 Mult; foes resist Energy.`;
      }
      break;
    case 'labyrinth':
      if (room?.tags.includes('mirror')) ctx.combat.biomeNote = `${b.meter.icon} Mirrored hall: rerolled dice show their opposite on a 1 in 4.`;
      break;
    case 'core':
      if (exp.meter > 0) ctx.combat.biomeNote = `${b.meter.icon} Gravity ${exp.meter}: weightless — +1 reroll every turn.`;
      break;
  }
  if (ctx.combat.biomeNote) log(ctx, ctx.combat.biomeNote, 'info');
}

// ── turn order ──────────────────────────────────────────────────────────────

export function current(ctx: Ctx): Combatant | undefined {
  const id = ctx.combat.order[ctx.combat.turnIndex];
  return id ? ctx.combat.combatants[id] : undefined;
}

export const hooks = {
  heroTurnStart: (_ctx: Ctx, _c: Combatant) => {},
  enemyTurn: (_ctx: Ctx, _c: Combatant) => {},
  victory: (_ctx: Ctx) => {},
};

export function advance(ctx: Ctx) {
  const combat = ctx.combat;
  let guard = 0;
  while (combat.status === 'active' && guard++ < 200) {
    if (checkEnd(ctx)) return;
    combat.turnIndex += 1;
    if (combat.turnIndex >= combat.order.length) combat.turnIndex = 0;
    if (combat.turnIndex === 0) {
      combat.round += 1;
      log(ctx, `— Round ${combat.round} —`, 'info');
    }
    const c = current(ctx);
    if (!c || c.dead) continue;
    c.used = { half: 2, reaction: false, fortune: false };
    c.resUsed = 0;
    c.conditions = c.conditions.filter((x) => !x.untilTurnStart);
    if (c.side === 'enemy') {
      if (c.downed) continue;
      startOfTurn(ctx, c);
      if (checkEnd(ctx)) return;
      if (!c.dead && !c.downed) {
        if (incapacitated(c)) log(ctx, `${c.name} can't act.`, 'info');
        else hooks.enemyTurn(ctx, c);
      }
      endOfTurn(ctx, c);
      continue;
    }
    if (c.downed) {
      bloodLoss(ctx, c);
      endOfTurn(ctx, c);
      continue;
    }
    startOfTurn(ctx, c);
    if (checkEnd(ctx)) return;
    if (c.downed || c.dead) { endOfTurn(ctx, c); continue; }
    if (incapacitated(c)) {
      log(ctx, `${c.name} is ${has(c, 'stunned') ? 'stunned' : 'helpless'} and loses the turn.`, 'warn');
      endOfTurn(ctx, c);
      continue;
    }
    hooks.heroTurnStart(ctx, c);
    return;
  }
}

export function startOfTurn(ctx: Ctx, c: Combatant) {
  const bleed = cond(c, 'bleeding');
  if (bleed) applyDamage(ctx, c, [{ type: 'warp', amount: bleed.value ?? 3 }], { source: 'Blood loss', noSoak: true });
  const fire = cond(c, 'onFire');
  if (fire && !c.dead) {
    applyDamage(ctx, c, [{ type: 'energy', amount: fire.value ?? 4 }], { source: 'Flames', noSoak: true });
    // On Fire: an Agility Test puts it out (Core p.260).
    if (!c.dead && charTest(ctx, c, 'Ag').success) { removeCondition(c, 'onFire'); log(ctx, `${c.name} beats out the flames.`, 'info'); }
  }
  const regen = cond(c, 'regenerating');
  if (regen && !c.dead && c.hp > 0) heal(ctx, c, regen.value ?? 3, 'regenerates');
}

export function endOfTurn(ctx: Ctx, c: Combatant) {
  const keep: Condition[] = [];
  for (const x of c.conditions) {
    if (x.save && !c.dead && !x.sustainOf) {
      if (charTest(ctx, c, x.save.char, x.save.mod).success) {
        log(ctx, `${c.name} shakes off ${x.id}.`, 'info');
        continue;
      }
    }
    if (x.rounds > 0) x.rounds -= 1;
    if (x.rounds === 0) continue;
    keep.push(x);
  }
  c.conditions = keep;
}

// ── damage & healing ────────────────────────────────────────────────────────

export interface DmgPart { type: DamageType; amount: number }
export interface DmgOpts {
  source: string;
  attacker?: Combatant;
  crit?: boolean;
  /** Skip Armour and Toughness (warp, blood loss, already-soaked totals). */
  noSoak?: boolean;
  pen?: number;
  loc?: HitLoc;
  melee?: boolean;
}

export function resistMult(ctx: Ctx, c: Combatant, type: DamageType): number {
  if (c.side === 'enemy') {
    const m = c.mon!;
    if (m.immune.includes(type)) return 0;
    let x = 1;
    if (m.resist.includes(type)) x *= 0.5;
    if (m.vuln.includes(type)) x *= 2;
    if (has(c, 'vulnerable')) x *= 1.25;
    return x;
  }
  return 1;
}

/** Armour Points and Toughness Bonus at a location, for the soak fraction. */
export function armourAt(ctx: Ctx, c: Combatant, loc: HitLoc = 'body'): { ap: number; tb: number } {
  const h = heroOf(ctx, c);
  let extra = 0;
  const sh = cond(c, 'shielded');
  if (sh) extra += sh.value ?? 2;
  if (has(c, 'fortified')) extra += 2;
  if (h) {
    const d = derive(h);
    return { ap: d.ap[loc] + extra, tb: d.bonuses.T + (has(c, 'frenzied') ? 1 : 0) };
  }
  return { ap: (c.mon?.ap ?? 0) + extra, tb: c.mon?.tb ?? 3 };
}

export function soakOf(ctx: Ctx, c: Combatant, type: DamageType, pen: number, loc?: HitLoc): number {
  if (type === 'warp') return 0;
  const { ap, tb } = armourAt(ctx, c, loc);
  return soakFraction(ap, pen, tb);
}

export function applyDamage(ctx: Ctx, target: Combatant, parts: DmgPart[], opts: DmgOpts): number {
  if (target.dead) return 0;
  let total = 0;
  for (const p of parts) {
    const soak = opts.noSoak ? 0 : soakOf(ctx, target, p.type, opts.pen ?? 0, opts.loc);
    total += Math.round(p.amount * resistMult(ctx, target, p.type) * (1 - soak));
  }
  if (total <= 0) {
    if (parts.some((p) => p.amount > 0)) log(ctx, `${target.name} is unharmed.`, 'info');
    return 0;
  }
  if (target.side === 'hero' && target.downed) {
    // Critical Damage on a downed explorer: closer to death.
    const h = heroOf(ctx, target)!;
    const add = (opts.crit ? 2 : 1);
    target.crit += h.talents.includes('trueGrit') || derive(h).features.has('unrelenting') ? Math.ceil(add / 2) : add;
    log(ctx, `${target.name} takes Critical Damage while down! (${target.crit}/3)`, 'death');
    if (target.crit >= 3) kill(ctx, target, opts.source);
    return 0;
  }
  let rem = total;
  if (target.tempHp > 0) {
    const t = Math.min(target.tempHp, rem);
    target.tempHp -= t;
    rem -= t;
  }
  const before = target.hp;
  target.hp = Math.max(0, target.hp - rem);
  const lost = before - target.hp;
  fx(ctx, { kind: opts.crit ? 'crit' : 'dmg', target: target.id, amount: total, actor: opts.attacker?.id });
  if (target.hp <= 0) dropToZero(ctx, target, opts);
  if (target.mon?.boss && !target.dead && target.mon.phases && target.mon.phases > 1) {
    const next = target.mon.phase + 1;
    const threshold = 1 - target.mon.phase / target.mon.phases;
    if (next <= target.mon.phases && target.hp / target.maxHp <= threshold) {
      target.mon.phase = next;
      log(ctx, `${target.name} enters phase ${next}! Its fury grows.`, 'warn');
      target.mon.dmgBase = Math.round(target.mon.dmgBase * 1.15);
      target.conditions = target.conditions.filter((c) => !['stunned', 'helpless', 'dominated', 'snared'].includes(c.id));
      fx(ctx, { kind: 'text', target: target.id, text: `PHASE ${next}` });
    }
  }
  return lost;
}

function dropToZero(ctx: Ctx, target: Combatant, opts: DmgOpts) {
  if (target.side === 'enemy') { kill(ctx, target, opts.source, opts.attacker); return; }
  target.downed = true;
  target.hp = 0;
  target.stable = false;
  target.crit = opts.crit ? 1 : 0;
  target.conditions = target.conditions.filter((c) => c.id === 'blessed');
  endSustain(ctx, target);
  log(ctx, `${target.name} falls, critically wounded!`, 'death');
  fx(ctx, { kind: 'down', target: target.id });
  for (const ch of ctx.exp.fortune.charms) if (ch.id === 'avalanche') ch.counter = 1;
}

/**
 * Burning Fate (Core p.233): an explorer who would die may burn a Fate Point,
 * permanently reducing their maximum, and survives — unconscious but stable.
 */
function burnFate(ctx: Ctx, target: Combatant): boolean {
  const h = heroOf(ctx, target);
  if (!h || h.fate <= 0 || h.fateMax <= 0) return false;
  h.fate -= 1;
  h.fateMax -= 1;
  target.dead = false;
  target.downed = true;
  target.stable = true;
  target.crit = 0;
  target.hp = 0;
  log(ctx, `${target.name} BURNS A FATE POINT and cheats death! (${h.fateMax} Fate left, for ever)`, 'fortune');
  fx(ctx, { kind: 'text', target: target.id, text: 'Fate burned' });
  return true;
}

export function kill(ctx: Ctx, target: Combatant, source: string, attacker?: Combatant) {
  if (target.side === 'hero' && burnFate(ctx, target)) return;
  target.dead = true;
  target.downed = false;
  target.hp = 0;
  endSustain(ctx, target);
  if (target.side === 'enemy') {
    ctx.combat.kills += 1;
    log(ctx, `${target.name} is destroyed!`, 'death');
    fx(ctx, { kind: 'kill', target: target.id });
    for (const ch of ctx.exp.fortune.charms) CHARM_BY_ID[ch.id]?.onKill?.(ch, ctx.exp.fortune);
    for (const c of all(ctx)) if (c.sustain?.targets.includes(target.id)) c.sustain.targets = c.sustain.targets.filter((x) => x !== target.id);
    if (attacker?.side === 'hero') {
      const h = heroOf(ctx, attacker)!;
      h.history.kills += 1;
      const t = ctx.combat.turn;
      if (t && t.actorId === attacker.id && derive(h).features.has('killingRhythm') && !t.flags.rhythm) { t.flags.rhythm = true; t.plays += 1; log(ctx, `${attacker.name} finds the killing rhythm — another Fortune play!`, 'fortune'); }
    }
    if (!ctx.game.profile.codex.monsters.includes(target.refId)) ctx.game.profile.codex.monsters.push(target.refId);
  } else {
    const h = heroOf(ctx, target)!;
    log(ctx, `${target.name} has died. (${source})`, 'death');
    fx(ctx, { kind: 'kill', target: target.id });
    ctx.combat.diedThisFight.push(h.id);
    if (h.lordCaptain) {
      // The Dynasty dies with its Lord-Captain, in any mode.
      h.status = 'dead';
      h.history.deathCause = `${source} in ${BIOMES[ctx.exp.biome].name}`;
      ctx.exp.flags.captainDead = 1;
    } else if (ctx.game.mode === 'legacy') {
      h.status = 'dead';
      h.history.deathCause = `${source} in ${BIOMES[ctx.exp.biome].name}`;
    }
  }
}

export function heal(ctx: Ctx, target: Combatant, amount: number, source: string): number {
  if (target.dead || amount <= 0) return 0;
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + Math.round(amount));
  if (target.downed && target.hp > 0) {
    target.downed = false;
    target.stable = false;
    target.crit = 0;
    log(ctx, `${target.name} is back on their feet!`, 'heal');
  }
  const gained = target.hp - before;
  if (gained > 0) {
    log(ctx, `${target.name} recovers ${gained} Wounds (${source}).`, 'heal');
    fx(ctx, { kind: 'heal', target: target.id, amount: gained });
  }
  return gained;
}

export function endSustain(ctx: Ctx, caster: Combatant) {
  if (!caster.sustain) return;
  const tag = `${caster.id}:${caster.sustain.powerId}`;
  for (const c of all(ctx)) c.conditions = c.conditions.filter((x) => x.sustainOf !== tag);
  caster.sustain = undefined;
}

/**
 * Blood Loss (Core p.250, condensed): a downed explorer Tests Toughness each
 * turn. Three failures and they die; three passes and they stabilise. A
 * natural 01 sees them rise with 1 Wound.
 */
export function bloodLoss(ctx: Ctx, c: Combatant) {
  if (c.stable) { log(ctx, `${c.name} is unconscious but stable.`, 'info'); return; }
  const h = heroOf(ctx, c)!;
  let r = charTest(ctx, c, 'T');
  if (!r.success && h.talents.includes('dieHard')) r = charTest(ctx, c, 'T');
  if (r.roll === 1) {
    c.downed = false;
    c.hp = 1;
    c.crit = 0;
    log(ctx, `${c.name} rolls 01 and staggers back to their feet!`, 'heal');
    return;
  }
  if (r.success) {
    c.deathPass = (c.deathPass ?? 0) + 1;
    log(ctx, `${c.name} fights the blood loss (Toughness ${r.roll} vs ${r.target}).`, 'info');
    if (c.deathPass >= 3) { c.stable = true; log(ctx, `${c.name} stabilises.`, 'info'); }
  } else {
    c.crit += 1;
    log(ctx, `${c.name} is bleeding out (Toughness ${r.roll} vs ${r.target}; ${c.crit}/3).`, 'death');
    if (c.crit >= 3) kill(ctx, c, 'blood loss');
  }
}

export function checkEnd(ctx: Ctx): boolean {
  const combat = ctx.combat;
  if (combat.status !== 'active') return true;
  if (ctx.exp.flags.captainDead) {
    combat.status = 'defeat';
    log(ctx, 'The Lord-Captain is dead. The Dynasty dies with them.', 'death');
    return true;
  }
  if (livingEnemies(ctx).filter((e) => !has(e, 'dominated')).length === 0) {
    combat.status = 'victory';
    log(ctx, 'Victory!', 'loot');
    hooks.victory(ctx);
    return true;
  }
  if (livingHeroes(ctx).length === 0) {
    combat.status = 'defeat';
    log(ctx, 'The party has fallen...', 'death');
    return true;
  }
  return false;
}

export function syncHeroes(ctx: Ctx) {
  for (const c of heroes(ctx)) {
    const h = heroOf(ctx, c);
    if (!h) continue;
    h.hp = c.dead ? 0 : c.hp;
  }
}

export function finishCombatTray(ctx: Ctx) {
  endCombatTray(ctx.exp.fortune);
}

export { bonus, VITALITY, ECHO };
