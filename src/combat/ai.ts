/**
 * Transparent priority AI: finish a kill → heal an ally in danger → fire a
 * telegraphed boss move → otherwise a weighted legal action by role.
 *
 * Foes attack with a percentile Test against WS or BS. The explorer may react
 * once per round (Defensive Stance grants a second): Dodge with Agility, or
 * Parry with Weapon Skill and a melee weapon. A force field then gets its
 * roll, and armour soaks what is left.
 */
import type { Combatant, MonsterAction } from '../engine/types.ts';
import { test, hitLocation, LOC_NAME } from '../engine/dice.ts';
import {
  type Ctx, log, fx, livingHeroes, livingEnemies, has, cond, addCondition, applyDamage, heal, heroOf, removeCondition, scaledMonster, enemies, charTest, testMods, gainInsanity,
} from './core.ts';
import { applyHex, handSize } from '../fortune/tray.ts';
import { derive } from '../rules/character.ts';
import { MONSTERS } from '../content/monsters.ts';
import { CURSES } from '../fortune/curses.ts';

function usable(c: Combatant, a: MonsterAction): boolean {
  return !(a.phase && c.mon!.phase < a.phase);
}

function threat(ctx: Ctx, h: Combatant): number {
  let w = 1;
  if (has(h, 'guarding')) w += 2;
  if (h.hp / h.maxHp < 0.35) w += 1.2;
  if (has(h, 'allOut') || has(h, 'frenzied')) w += 0.8;
  if (h.sustain) w += 0.6;
  const hero = heroOf(ctx, h);
  if (hero?.talents.includes('unremarkable')) w *= 0.5;
  if (has(h, 'hidden')) w *= 0.2;
  return w;
}

function pickTarget(ctx: Ctx, c: Combatant, a: MonsterAction): Combatant | undefined {
  const heroes = livingHeroes(ctx);
  if (!heroes.length) return undefined;
  let pool = heroes;
  if (a.kind === 'attack' && !a.ranged) {
    const front = heroes.filter((h) => h.rank === 'front');
    if (front.length) pool = front;
  }
  return ctx.aiRng.weighted(pool, (h) => threat(ctx, h));
}

export function enemyTurn(ctx: Ctx, c: Combatant) {
  const m = c.mon!;
  // Dominated: it turns on its own side.
  if (has(c, 'dominated')) {
    const other = livingEnemies(ctx).filter((e) => e.id !== c.id && !has(e, 'dominated'))[0];
    if (other) {
      log(ctx, `${c.name}, dominated, turns on ${other.name}!`, 'hit');
      applyDamage(ctx, other, [{ type: 'impact', amount: m.dmgBase * (0.75 + ctx.aiRng.next() * 0.5) }], { source: c.name, attacker: c, pen: 2 });
    }
    return;
  }
  if (has(c, 'frightened') && ctx.aiRng.chance(0.25)) { log(ctx, `${c.name} hesitates, afraid.`, 'info'); return; }
  const actions = m.actions.filter((a) => usable(c, a));
  if (m.telegraphed) {
    const a = actions.find((x) => x.id === m.telegraphed);
    m.telegraphed = undefined;
    if (a) { perform(ctx, c, a); return; }
  }
  const hurt = livingEnemies(ctx).filter((e) => e.hp / e.maxHp < 0.5);
  const healAct = actions.find((a) => a.kind === 'heal');
  if (healAct && hurt.length && ctx.aiRng.chance(0.75)) { perform(ctx, c, healAct); return; }
  const tele = actions.filter((a) => a.telegraph);
  if (m.boss && tele.length && ctx.aiRng.chance(0.4)) {
    const t = ctx.aiRng.pick(tele);
    m.telegraphed = t.id;
    log(ctx, `⚠ ${c.name} prepares ${t.name}! (next turn)`, 'warn');
    fx(ctx, { kind: 'text', target: c.id, text: `${t.name}!` });
    const basic = actions.filter((a) => a.kind === 'attack' && !a.telegraph);
    if (basic.length) perform(ctx, c, ctx.aiRng.pick(basic));
    return;
  }
  const pool = actions.filter((a) => !a.telegraph && (a.kind !== 'heal' || hurt.length) && (a.kind !== 'summon' || livingEnemies(ctx).length < 5));
  const a = ctx.aiRng.weighted(pool.length ? pool : actions, (x) => x.weight * (has(c, 'pinned') && x.kind === 'attack' && !x.ranged ? 0.3 : 1));
  perform(ctx, c, a);
  if (m.boss && m.phase >= 2 && ctx.aiRng.chance(0.35) && livingHeroes(ctx).length) {
    const extra = actions.filter((x) => x.kind === 'attack' && !x.telegraph);
    if (extra.length) { log(ctx, `${c.name} strikes again!`, 'warn'); perform(ctx, c, ctx.aiRng.pick(extra)); }
  }
}

function dmgRoll(ctx: Ctx, c: Combatant, a: MonsterAction, crit = false): number {
  const base = c.mon!.dmgBase * (a.dmg ?? 1);
  let v = base * (0.75 + ctx.aiRng.next() * 0.5);
  if (crit) v *= 1.5;
  if (has(c, 'weakened')) { v *= 0.75; removeCondition(c, 'weakened'); }
  if (has(c, 'frightened')) v *= 0.85;
  if (has(c, 'slowed')) v *= 0.85;
  if (has(c, 'frenzied')) v *= 1.15;
  return Math.max(1, Math.round(v));
}

const penOf = (c: Combatant, a: MonsterAction) => a.pen ?? Math.floor(c.level / 4);

/** Heroes Test a Characteristic to dive clear of a blast or shrug off a toxin. */
function saveMod(c: Combatant): number {
  return c.mon!.boss ? -20 : c.mon!.elite ? -15 : -10;
}

function perform(ctx: Ctx, c: Combatant, a: MonsterAction) {
  const m = c.mon!;
  switch (a.kind) {
    case 'attack': {
      const targets = a.target === 'front' ? livingHeroes(ctx).filter((h) => h.rank === 'front') : [pickTarget(ctx, c, a)].filter(Boolean) as Combatant[];
      for (const t of targets.length ? targets : livingHeroes(ctx).slice(0, 1)) attack(ctx, c, t, a);
      return;
    }
    case 'save': {
      const list = a.target === 'all' ? livingHeroes(ctx) : a.target === 'front' ? livingHeroes(ctx).filter((h) => h.rank === 'front') : a.target === 'back' ? livingHeroes(ctx).filter((h) => h.rank === 'back') : [pickTarget(ctx, c, a)!].filter(Boolean);
      log(ctx, `${c.name} unleashes ${a.name}!`, 'enemy');
      const dmg = dmgRoll(ctx, c, a);
      for (const t of list.length ? list : livingHeroes(ctx)) {
        const h = heroOf(ctx, t)!;
        const d = derive(h);
        const ch = a.save ?? 'Ag';
        // Diving clear uses Dodge; Willpower is helped by faith.
        let target = (ch === 'Ag' ? d.dodge : d.chars[ch]) + saveMod(c) + testMods(t) + (cond(t, 'foreseen')?.value ?? 0) * (ch === 'Ag' ? 1 : 0);
        if (ch === 'WP' && h.talents.includes('unshakeableFaith')) target += 10;
        const r = test(ctx.rng, target);
        const amt = r.success ? (a.halfOnSave ? dmg / 2 : 0) : dmg;
        if (amt > 0 && has(t, 'warded')) { removeCondition(t, 'warded'); log(ctx, `${t.name}'s ward holds!`, 'miss'); continue; }
        if (amt > 0) applyDamage(ctx, t, [{ type: a.damageType ?? 'impact', amount: amt }], { source: a.name, attacker: c, pen: penOf(c, a), loc: hitLocation(ctx.rng.int(1, 100)) });
        else log(ctx, `${t.name} avoids it! (${r.roll} vs ${r.target})`, 'miss');
        if (!r.success && a.condition && !t.dead && !t.downed) addCondition(ctx, t, { id: a.condition.id, rounds: a.condition.rounds, value: a.condition.value, save: a.condition.saveEnds ? { char: ch, mod: saveMod(c) } : undefined });
      }
      return;
    }
    case 'condition': {
      const t = pickTarget(ctx, c, a);
      if (!t) return;
      log(ctx, `${c.name} uses ${a.name} on ${t.name}.`, 'enemy');
      if (a.save) {
        if (charTest(ctx, t, a.save, saveMod(c)).success) { log(ctx, `${t.name} resists.`, 'miss'); return; }
      } else if (!landHit(ctx, c, t, a)) return;
      if (a.dmg) applyDamage(ctx, t, [{ type: a.damageType ?? 'impact', amount: dmgRoll(ctx, c, a) }], { source: a.name, attacker: c, pen: penOf(c, a) });
      if (!t.dead && !t.downed && a.condition) {
        addCondition(ctx, t, { id: a.condition.id, rounds: a.condition.rounds, value: a.condition.value ? Math.round(a.condition.value * 2.5) : undefined, save: a.condition.saveEnds ? { char: a.save ?? 'S', mod: saveMod(c) } : undefined });
        log(ctx, `${t.name} is ${a.condition.id}!`, 'warn');
        if (a.condition.id === 'frightened') gainInsanity(ctx, heroOf(ctx, t)!, 1);
      }
      return;
    }
    case 'heal': {
      const list = a.target === 'self' ? [c] : livingEnemies(ctx).sort((p, q) => p.hp / p.maxHp - q.hp / q.maxHp);
      const t = list[0];
      if (!t) return;
      log(ctx, `${c.name} uses ${a.name}.`, 'enemy');
      heal(ctx, t, m.dmgBase * (a.dmg ?? 1) * 1.6, a.name);
      return;
    }
    case 'buff': {
      const list = a.target === 'self' ? [c] : livingEnemies(ctx);
      log(ctx, `${c.name} uses ${a.name}.`, 'enemy');
      for (const t of list) if (a.condition) addCondition(ctx, t, { id: a.condition.id, rounds: a.condition.rounds, value: a.condition.value });
      return;
    }
    case 'hex': {
      const run = ctx.exp.fortune;
      const maxLevel = Math.max(...livingHeroes(ctx).map((h) => h.level), 1);
      const curse = ctx.combat.curse ? CURSES[ctx.combat.curse] : undefined;
      const msg = applyHex(run, ctx.fortuneRng, a.hex!, handSize(run, maxLevel, curse?.handSizeDelta ?? 0));
      if (msg) {
        log(ctx, `${c.name} ${msg}`, 'warn');
        fx(ctx, { kind: 'hex', target: c.id, text: a.name });
      } else {
        const atk = m.actions.find((x) => x.kind === 'attack');
        if (atk) perform(ctx, c, atk);
      }
      return;
    }
    case 'summon': {
      const n = Object.keys(ctx.combat.combatants).length;
      const def = MONSTERS[a.summon!];
      if (!def || livingEnemies(ctx).length >= 5) return;
      const s = scaledMonster(ctx, a.summon!, n + 10);
      s.id = `s${n}${Math.floor(ctx.aiRng.next() * 1000)}`;
      s.hp = s.maxHp = Math.round(s.maxHp * 0.6);
      s.initiative = c.initiative - 0.5;
      ctx.combat.combatants[s.id] = s;
      ctx.combat.order.splice(ctx.combat.order.indexOf(c.id) + 1, 0, s.id);
      log(ctx, `${c.name} calls forth a ${def.name}!`, 'warn');
      return;
    }
  }
}

/**
 * The foe's attack Test, then the explorer's Reaction and force field.
 * Returns true if a hit lands.
 */
function landHit(ctx: Ctx, c: Combatant, t: Combatant, a: MonsterAction): boolean {
  const m = c.mon!;
  const th = heroOf(ctx, t)!;
  const d = derive(th);
  let target = (a.ranged ? m.bs : m.ws) + testMods(c);
  if (has(t, 'stunned') || has(t, 'helpless')) target += 20;
  if (has(t, 'prone')) target += a.ranged ? -10 : 10;
  if (has(t, 'guarding') && !a.ranged) target -= 20;
  if (has(t, 'cloaked')) target -= 20;
  if (has(t, 'hidden')) target -= 30;
  if (has(c, 'blinded')) target -= 30;
  if (has(c, 'pinned')) target -= 10;
  if (a.ranged && t.rank === 'back') target -= 10;
  const r = test(ctx.aiRng, target);
  if (!r.success) {
    log(ctx, `${c.name}'s ${a.name} misses ${t.name}.`, 'miss');
    fx(ctx, { kind: 'miss', target: t.id, actor: c.id });
    return false;
  }
  // Reaction: Dodge or Parry, once per round (twice in Defensive Stance).
  const reactions = 1 + (has(t, 'guarding') ? 1 : 0) + (th.talents.includes('wallOfSteel') ? 1 : 0);
  const usedR = Number(t.used.reaction) + (t.resUsed ?? 0);
  const cannot = has(t, 'allOut') || has(t, 'frenzied') || has(t, 'stunned') || has(t, 'helpless') || t.downed;
  if (!cannot && usedR < reactions) {
    const bonus = (cond(t, 'foreseen')?.value ?? 0) + (has(t, 'guarding') && d.features.has('hardTarget') ? 10 : 0) + testMods(t);
    const dodgeT = d.dodge + bonus;
    const parryT = !a.ranged && !d.main.ranged && !d.main.qualities.includes('unwieldy') ? d.parry + bonus : -1;
    const useParry = parryT > dodgeT;
    const rr = test(ctx.rng, useParry ? parryT : dodgeT);
    if (t.used.reaction) t.resUsed = (t.resUsed ?? 0) + 1; else t.used.reaction = true;
    if (rr.success) {
      log(ctx, `${t.name} ${useParry ? 'parries' : 'dodges'} ${c.name}'s ${a.name}! (${rr.roll} vs ${rr.target})`, 'miss');
      fx(ctx, { kind: 'miss', target: t.id, actor: c.id });
      if (useParry && th.talents.includes('counterAttack') && !c.dead) {
        const w = d.main;
        const amt = (ctx.rng.die(10) + w.bonus) * 3;
        log(ctx, `${t.name} counter-attacks!`, 'hit');
        applyDamage(ctx, c, [{ type: w.type, amount: amt }], { source: 'Counter Attack', attacker: t, pen: w.pen });
      }
      return false;
    }
  }
  if (d.field > 0) {
    const fr = test(ctx.rng, d.field);
    if (fr.success) { log(ctx, `${t.name}'s force field flares and turns the hit!`, 'miss'); fx(ctx, { kind: 'text', target: t.id, text: 'Field!' }); return false; }
  }
  if (has(t, 'warded')) { removeCondition(t, 'warded'); log(ctx, `${t.name}'s ward turns the blow.`, 'miss'); return false; }
  return true;
}

function attack(ctx: Ctx, c: Combatant, t: Combatant, a: MonsterAction) {
  if (!landHit(ctx, c, t, a)) return;
  const r100 = ctx.aiRng.int(1, 100);
  const loc = hitLocation(r100);
  const crit = ctx.aiRng.chance(0.08 + (c.mon!.boss ? 0.04 : 0));
  const dmg = dmgRoll(ctx, c, a, crit);
  log(ctx, `${c.name}'s ${a.name} ${crit ? 'CRITS' : 'hits'} ${t.name} in the ${LOC_NAME[loc]}!`, crit ? 'crit' : 'enemy');
  applyDamage(ctx, t, [{ type: a.damageType ?? 'impact', amount: dmg }], { source: c.name, attacker: c, crit, melee: !a.ranged, pen: penOf(c, a), loc });
}

export { enemies };
