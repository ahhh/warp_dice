/**
 * Explorer turns: the command menu (Attack / Career / Powers / Items / Stance),
 * Fortune Tray interactions (rerolls, career talents, Fate, tokens), and
 * resolution of every action through the shared (base + chips) × mult
 * pipeline.
 *
 * Each turn holds two Half Actions; a Full Action spends both (Core p.235).
 * Attacks are percentile Tests against WS or BS. Degrees of Success add hits
 * to bursts, every damage die showing 10 may become Righteous Fury, and
 * every scored 10 on the Fortune tray is a Righteous Fury of its own.
 */
import type { Combatant, Hero, HandType, DamageType, HitLoc, Rank } from '../engine/types.ts';
import { roll, test, hitLocation, bonus, LOC_NAME, type TestResult } from '../engine/dice.ts';
import {
  type Ctx, heroOf, log, fx, livingEnemies, livingHeroes, heroes, has, cond, addCondition, removeCondition,
  applyDamage, heal, advance, incapacitated, alive, kill, enemies, charTest, charOf, testMods, endSustain,
  gainCorruption, gainInsanity, scaledMonster, trayBonus, type DmgPart,
} from './core.ts';
import { derive, type Derived, type WeaponProfile } from '../rules/character.ts';
import { ITEMS } from '../content/items.ts';
import { POWERS, PHENOMENA, PERILS, type PowerDef } from '../content/powers.ts';
import { CLASS_MATERIAL } from '../fortune/materials.ts';
import { scoreHand, previewHand, type ScoreOutput } from '../fortune/scoring.ts';
import { reroll as trayReroll, spendDice, rerollsPerTurn, handSize, nudge, flip, forceValue, addGhostDie, faceValue, rollTrayDie } from '../fortune/tray.ts';
import { charmPassives } from '../fortune/charms.ts';
import { CURSES } from '../fortune/curses.ts';
import { HAND_RANK, handContains } from '../fortune/hands.ts';
import { VITALITY, VITALITY_GROWTH, ECHO, HEAL_MULT_SLOPE, powerScale } from '../rules/balance.ts';
import type { Effect, PlayedDie } from '../fortune/charms.ts';
import { HAND_BY_ID } from '../fortune/hands.ts';

export type FortuneUse = 'attack' | 'spell' | 'heal' | 'guard' | 'dc' | 'none';
export type TargetKind = 'enemy' | 'enemies' | 'rank' | 'ally' | 'allies' | 'self' | 'fallenAlly';
export type ActionCost = 'full' | 'half' | 'free';

export interface ActionOption {
  key: string;
  group: 'attack' | 'skill' | 'magic' | 'item' | 'guard';
  name: string;
  text: string;
  cost: ActionCost;
  target: TargetKind;
  usable: boolean;
  reason?: string;
  fortune: FortuneUse;
  /** Psychic strength choices: 1 Fettered, 2 Unfettered, 3 Push. */
  slots?: number[];
  melee?: boolean;
  /** Displayed chance for the governing Test, when known. */
  chance?: number;
}

export type CombatCmd =
  | { type: 'reroll'; dice: number[] }
  | { type: 'act'; key: string; targets: string[]; dice: number[]; slot?: number; meta?: string[] }
  | { type: 'talent'; id: string; die?: number; value?: number; delta?: 1 | -1 }
  | { type: 'token'; id: string; die?: number; value?: number }
  | { type: 'rank' }
  | { type: 'endTurn' };

export interface CmdResult { ok: boolean; error?: string; score?: ScoreOutput }

export const STRENGTH_NAMES = ['', 'Fettered', 'Unfettered', 'Push'];

// ── turn start ──────────────────────────────────────────────────────────────

export function heroTurnStart(ctx: Ctx, c: Combatant) {
  const h = heroOf(ctx, c)!;
  const d = derive(h);
  const run = ctx.exp.fortune;
  const curse = ctx.combat.curse ? CURSES[ctx.combat.curse] : undefined;
  let bonusR = d.rerollBonus;
  if (ctx.exp.biome === 'core' && ctx.exp.meter > 0) bonusR += 1;
  run.rerollsLeft = rerollsPerTurn(run, bonusR, curse?.rerollDelta ?? 0);
  const quick = has(c, 'quickened');
  if (quick) removeCondition(c, 'quickened');
  ctx.combat.turn = { actorId: c.id, plays: 1 + (quick ? 1 : 0), playsUsed: 0, playLimit: 5, flags: {} };
  const size = trayLimit(ctx);
  if (run.tray.length < size) spendDice(run, ctx.fortuneRng, [], size);
  log(ctx, `${c.name}'s turn.`, 'info');
}

function trayLimit(ctx: Ctx): number {
  const curse = ctx.combat.curse ? CURSES[ctx.combat.curse] : undefined;
  const maxLevel = Math.max(...heroes(ctx).map((x) => x.level));
  return handSize(ctx.exp.fortune, maxLevel, curse?.handSizeDelta ?? 0) + trayBonus(ctx);
}

// ── helpers ─────────────────────────────────────────────────────────────────

function actor(ctx: Ctx): { c: Combatant; h: Hero; d: Derived } | null {
  const t = ctx.combat.turn;
  if (!t) return null;
  const c = ctx.combat.combatants[t.actorId];
  const h = heroOf(ctx, c);
  if (!c || !h) return null;
  return { c, h, d: derive(h) };
}

function frontEnemies(ctx: Ctx) {
  return livingEnemies(ctx).filter((e) => e.rank === 'front');
}

/** Melee reaches the front rank, or anything once the front is clear. */
export function legalTargets(ctx: Ctx, kind: TargetKind, melee: boolean): Combatant[] {
  switch (kind) {
    case 'enemy': {
      const live = livingEnemies(ctx);
      if (!melee) return live;
      const front = frontEnemies(ctx);
      return front.length ? front : live;
    }
    case 'enemies': case 'rank': return livingEnemies(ctx);
    case 'ally': return heroes(ctx).filter((x) => !x.dead);
    case 'allies': case 'self': return livingHeroes(ctx);
    case 'fallenAlly': return heroes(ctx).filter((x) => x.downed || (x.dead && ctx.combat.diedThisFight.includes(x.id)));
  }
}

function costBlocked(c: Combatant, cost: ActionCost): string | null {
  if (cost === 'full' && c.used.half < 2) return 'Needs a Full Action';
  if (cost === 'half' && c.used.half < 1) return 'No actions left';
  return null;
}

function spend(c: Combatant, cost: ActionCost) {
  if (cost === 'full') c.used.half = Math.max(0, c.used.half - 2);
  else if (cost === 'half') c.used.half = Math.max(0, c.used.half - 1);
}

const jammed = (ctx: Ctx, h: Hero, off = false) => !!ctx.combat.once[`jam:${h.id}${off ? ':off' : ''}`];

function skillTarget(d: Derived, skill: keyof Derived['skills'], fallback: number): number {
  return d.skills[skill] ?? fallback;
}

// ── option list (UI) ────────────────────────────────────────────────────────

export function listActions(ctx: Ctx): ActionOption[] {
  const a = actor(ctx);
  if (!a) return [];
  const { c, h, d } = a;
  const out: ActionOption[] = [];
  const add = (o: Omit<ActionOption, 'usable' | 'reason'>, reason?: string | null) => {
    const r = reason ?? costBlocked(c, o.cost);
    out.push({ ...o, usable: !r, reason: r ?? undefined });
  };
  const w = d.main;
  const meleeW = !w.ranged;
  const engaged = c.rank === 'front' && frontEnemies(ctx).length > 0;
  const backMelee = meleeW && c.rank === 'back';
  const jam = jammed(ctx, h) ? `${w.name} is jammed — clear it first` : null;
  const frenzied = has(c, 'frenzied');
  const wText = weaponText(w);

  // ── attacks
  add({ key: 'std', group: 'attack', name: `Standard Attack — ${w.name}`, text: `Half Action. ${wText}`, cost: 'half', target: 'enemy', fortune: 'attack', melee: meleeW },
    jam ?? (backMelee ? 'Back rank: Charge, or step forward' : frenzied && !meleeW ? 'Frenzied: melee only' : null));
  if (!meleeW && w.rof[1] > 0) add({ key: 'semi', group: 'attack', name: `Semi-Auto Burst (RoF ${w.rof[1]})`, text: `Full Action, +10 BS. One extra hit per two Degrees of Success.`, cost: 'full', target: 'enemy', fortune: 'attack' }, jam ?? (frenzied ? 'Frenzied: melee only' : null));
  if (!meleeW && w.rof[2] > 0) add({ key: 'full', group: 'attack', name: `Full-Auto Burst (RoF ${w.rof[2]})`, text: `Full Action, +20 BS. One extra hit per Degree of Success.`, cost: 'full', target: 'enemy', fortune: 'attack' }, jam ?? (frenzied ? 'Frenzied: melee only' : null));
  add({ key: 'called', group: 'attack', name: 'Called Shot', text: `Full Action, ${h.talents.includes(meleeW ? 'sureStrike' : 'deadeyeShot') ? '-10' : '-20'} to hit. Aim for the head: the hit is a guaranteed Righteous Fury.`, cost: 'full', target: 'enemy', fortune: 'attack', melee: meleeW },
    jam ?? (backMelee ? 'Back rank' : null));
  if (meleeW || d.offhand && !d.offhand.ranged) {
    add({ key: 'allOut', group: 'attack', name: 'All Out Attack', text: 'Full Action, melee, +20 WS. You cannot Dodge or Parry until your next turn.', cost: 'full', target: 'enemy', fortune: 'attack', melee: true }, backMelee ? 'Back rank: Charge instead' : null);
    add({ key: 'charge', group: 'attack', name: 'Charge', text: 'Full Action: move to the front rank and strike at +10 WS.', cost: 'full', target: 'enemy', fortune: 'attack', melee: true }, c.rank === 'front' && !backMelee ? 'Already in the fight' : null);
  }
  const multi = multiSwings(h, d);
  if (multi.length > 1) add({ key: 'multi', group: 'attack', name: `Multiple Attacks (${multi.length})`, text: 'Full Action: attack with every swing your talents and off hand allow, each a separate Test.', cost: 'full', target: 'enemy', fortune: 'attack', melee: !multi[0].ranged },
    jam ?? (!multi[0].ranged && c.rank === 'back' ? 'Back rank' : null));
  if (d.features.has('suppress') && !meleeW && (w.rof[1] > 0 || w.rof[2] > 0)) add({ key: 'feat:suppress', group: 'attack', name: 'Suppressing Fire', text: 'Full Action, -20 BS: every foe in a rank is hit once; those failing Willpower are Pinned.', cost: 'full', target: 'rank', fortune: 'attack' }, jam);
  if (h.talents.includes('luminenCharge')) add({ key: 'feat:luminen', group: 'attack', name: 'Luminen Charge', text: 'Half Action, melee: discharge stored power. 1d10 + TB Energy, Shocking.', cost: 'half', target: 'enemy', fortune: 'attack', melee: true }, c.rank === 'back' && frontEnemies(ctx).length ? 'Back rank' : null);
  if (d.features.has('coupDeGrace')) add({ key: 'feat:coup', group: 'attack', name: 'Coup de Grâce', text: 'Full Action: a non-boss foe below 25% Wounds dies outright.', cost: 'full', target: 'enemy', fortune: 'none' }, livingEnemies(ctx).some((e) => !e.mon?.boss && e.hp < e.maxHp * 0.25) ? null : 'No foe is weak enough');

  // ── career features and talents
  for (const o of featureActions(ctx, c, h, d)) add(o, o.reason);

  // ── powers
  const career = h.careerId;
  if (career === 'astropath' || career === 'navigator') {
    const burnt = !!ctx.combat.once[`${h.id}:burnout`];
    for (const id of Object.keys(h.powers)) {
      const p = POWERS[id];
      if (!p) continue;
      const nav = p.discipline === 'Navigator';
      const t = powerTarget(ctx, h, d, p, nav ? 0 : 2);
      add({
        key: `power:${id}`, group: 'magic', name: `${p.name}${nav ? ` (${['Novice', 'Adept', 'Master'][h.powers[id] ?? 0]})` : ''}`, text: p.text,
        cost: p.action, target: p.target, fortune: powerFortune(p), slots: nav ? undefined : [1, 2, 3], chance: t,
      }, burnt && !nav ? 'Psychic backlash: your powers are spent' : c.sustain?.powerId === id ? 'Already sustained' : null);
    }
  }

  // ── items
  for (const inst of ctx.exp.carriedItems) {
    const def = ITEMS[inst.defId];
    if (!def?.consumable?.combat) continue;
    const cons = def.consumable;
    const target: TargetKind = cons.target === 'party' ? 'self' : cons.target === 'rank' ? 'rank' : cons.target;
    let reason: string | null = null;
    if (cons.effect === 'smoke' && ctx.combat.kind === 'boss') reason = 'Cannot flee the region\'s lord';
    add({ key: `item:${inst.uid}`, group: 'item', name: `${def.name}${inst.qty && inst.qty > 1 ? ` ×${inst.qty}` : ''}`, text: def.text ?? '', cost: 'half', target, fortune: cons.effect === 'heal' ? 'heal' : cons.effect === 'bomb' ? 'spell' : 'none' }, reason);
  }

  // ── stance and movement
  add({ key: 'guard', group: 'guard', name: 'Defensive Stance', text: 'Full Action: an extra Reaction, foes suffer -20 WS against you, and gain Ward (temporary Wounds) scaled by your Fortune hand.', cost: 'full', target: 'self', fortune: 'guard' });
  add({ key: 'aim', group: 'guard', name: 'Aim', text: 'Half Action: +10 to your next attack (+20 if you Aim with your whole turn).', cost: 'half', target: 'self', fortune: 'none' }, has(c, 'aiming') && (cond(c, 'aiming')!.value ?? 0) >= 20 ? 'Already fully aimed' : null);
  if (jammed(ctx, h)) {
    const fast = h.talents.includes('technicalKnock') && !ctx.combat.turn!.flags.knock;
    add({ key: 'clearJam', group: 'guard', name: 'Clear Jam', text: fast ? 'Free (Technical Knock): clear the jam.' : h.talents.includes('rapidReload') ? 'Half Action: clear the jam.' : 'Full Action: clear the jam.', cost: fast ? 'free' : h.talents.includes('rapidReload') ? 'half' : 'full', target: 'self', fortune: 'none' });
  }
  const freeMove = d.freeRank;
  add({ key: 'rank', group: 'guard', name: c.rank === 'front' ? 'Fall Back' : 'Advance', text: freeMove ? 'Switch ranks (free for you).' : 'Half Action: switch ranks.', cost: freeMove ? 'free' : 'half', target: 'self', fortune: 'none' },
    ctx.combat.turn!.flags.moved ? 'Already moved this turn' : has(c, 'snared') ? 'Snared' : has(c, 'pinned') && c.rank === 'back' ? 'Pinned' : engaged && false ? '' : null);
  return out;
}

function weaponText(w: WeaponProfile): string {
  return `${w.ranged ? 'BS' : 'WS'} attack${w.hit ? ` (${w.hit > 0 ? '+' : ''}${w.hit})` : ''}: ${w.dice}${w.bonus ? `${w.bonus > 0 ? '+' : ''}${w.bonus}` : ''} ${w.type}, Pen ${w.pen}${w.qualities.length ? `, ${w.qualities.join(', ')}` : ''}.`;
}

function powerFortune(p: PowerDef): FortuneUse {
  if (p.kind === 'damage') return 'spell';
  if (p.kind === 'heal') return 'heal';
  if (p.kind === 'debuff') return 'dc';
  return 'none';
}

function multiSwings(h: Hero, d: Derived): WeaponProfile[] {
  const out: WeaponProfile[] = [];
  if (!d.main.ranged) for (let i = 0; i < d.meleeAttacks; i++) out.push(d.main);
  else out.push(d.main);
  const off = d.offhand;
  if (off && (h.talents.includes('twoWeaponWielder') || h.talents.includes('gunslinger'))) {
    if (off.ranged === d.main.ranged) out.push(off);
  }
  if (d.main.ranged && out.length === 1) return out;
  return out;
}

function featureActions(ctx: Ctx, c: Combatant, h: Hero, d: Derived): (Omit<ActionOption, 'usable' | 'reason'> & { reason?: string | null })[] {
  const out: (Omit<ActionOption, 'usable' | 'reason'> & { reason?: string | null })[] = [];
  const F = d.features;
  const once = (id: string) => !!ctx.combat.once[`${h.id}:${id}`];
  const o = (key: string, name: string, text: string, cost: ActionCost, target: TargetKind, fortune: FortuneUse, reason: string | null = null, chance?: number) =>
    out.push({ key: `feat:${key}`, group: 'skill', name, text, cost, target, fortune, reason, chance });
  const cmd = skillTarget(d, 'command', Math.floor(d.chars.Fel / 2)) + testMods(c);
  if (F.has('rally')) o('rally', 'Rally', `Command Test (${cmd}%): allies Inspired (+10) for 2 rounds, Fear lifted.`, 'half', 'allies', 'none', null, cmd);
  if (F.has('markTarget')) o('mark', 'Concentrate Fire', `Command Test (${cmd}%): mark a foe; allies +10 to hit it.`, 'half', 'enemy', 'none', null, cmd);
  if (F.has('masterStroke')) o('masterStroke', 'Master Stroke', 'Free: your next attack Test passes with 3 Degrees of Success.', 'free', 'self', 'none', once('masterStroke') ? 'Once per combat' : null);
  if (F.has('claimTheField')) o('claim', 'Claim the Field', 'Full Action: allies regain 20% Wounds; +1 reroll now.', 'full', 'allies', 'heal', once('claim') ? 'Once per combat' : null);
  const logic = skillTarget(d, 'logic', Math.floor(d.chars.Int / 2)) + testMods(c);
  if (F.has('analyse')) o('analyse', 'Analyse Foe', `Logic Test (${logic}%): the foe is Vulnerable (+25% damage) for 3 rounds.`, 'half', 'enemy', 'none', null, logic);
  const tech = skillTarget(d, 'techUse', 0) + testMods(c);
  if (F.has('blessMachine')) o('bless', 'Rite of Maintenance', `Tech-Use Test (${tech}%): clear every jam; an ally is Fortified (+2 AP).`, 'half', 'ally', 'none', null, tech);
  if (F.has('machineCurse')) o('curse', 'Machine Curse', `Tech-Use Test (${tech - 10}%): constructs Stunned, others Slowed.`, 'full', 'enemies', 'dc', null, tech - 10);
  const fel = skillTarget(d, 'charm', d.chars.Fel) + testMods(c);
  if (F.has('exhort')) o('exhort', 'Exhortation', `Fellowship Test (${Math.max(fel, d.chars.Fel)}%): allies Inspired${h.talents.includes('inspireWrath') ? ' and Frenzied' : ''}${h.talents.includes('divineMinistration') ? ', and healed' : ''}.`, 'half', 'allies', h.talents.includes('divineMinistration') ? 'heal' : 'none', null, Math.max(fel, d.chars.Fel));
  const med = skillTarget(d, 'medicae', 0) + testMods(c);
  if (F.has('layHands')) o('medicae', 'Field Medicae', `Medicae Test (${med}%): heal an ally.`, 'full', 'ally', 'heal', null, med);
  if (F.has('emperorProtects')) o('protect', 'The Emperor Protects', 'Half Action: an ally is Warded — the next hit is ignored.', 'half', 'ally', 'none', once('protect') ? 'Once per combat' : null);
  if (F.has('miracle')) o('miracle', 'Miracle', 'Full Action: a fallen ally rises with half their Wounds.', 'full', 'fallenAlly', 'none', once('miracle') ? 'Once per combat' : !legalTargets(ctx, 'fallenAlly', false).length ? 'No one has fallen' : null);
  if (F.has('feint')) o('feint', 'Feint', 'Opposed WS: win and your next attack cannot be Dodged and Exploits Weakness.', 'half', 'enemy', 'none', c.rank === 'back' && frontEnemies(ctx).length ? 'Back rank' : null);
  const sil = skillTarget(d, 'silentMove', Math.floor(d.chars.Ag / 2)) + testMods(c);
  if (F.has('shadowing')) o('shadow', 'Melt into Shadow', `Silent Move Test (${sil}%): become Hidden (+30 and Exploit Weakness on your next attack).`, 'half', 'self', 'none', has(c, 'hidden') ? 'Already hidden' : null, sil);
  if (F.has('evasive')) o('evasive', 'Evasive Manoeuvres', `Command Test (${cmd}%): the party gains +20 to Dodge until your next turn.`, 'half', 'allies', 'none', null, cmd);
  if (F.has('shipStrike')) o('ship', 'Call the Guns', 'Full Action, once per expedition: the ship fires through a breach at every foe.', 'full', 'enemies', 'spell', ctx.exp.flags[`ship:${h.id}`] ? 'Already called this expedition' : null);
  if (h.talents.includes('frenzy')) o('frenzy', 'Frenzy', 'Half Action: +10 WS, +1 TB; no Dodge, Parry or ranged attacks for the fight.', 'half', 'self', 'none', has(c, 'frenzied') ? 'Already frenzied' : null);
  if (h.talents.includes('prosanguine')) o('prosanguine', 'Prosanguine', `Tech-Use Test (${tech}%): your implants knit your wounds.`, 'half', 'self', 'heal', once('prosanguine') ? 'Once per combat' : null, tech);
  return out;
}

// ── Fortune tray commands ───────────────────────────────────────────────────

export function doReroll(ctx: Ctx, dice: number[]): CmdResult {
  const a = actor(ctx);
  if (!a) return { ok: false, error: 'No active explorer' };
  const run = ctx.exp.fortune;
  const curse = ctx.combat.curse ? CURSES[ctx.combat.curse] : undefined;
  const valid = dice.filter((i) => run.tray[i]);
  if (!valid.length) return { ok: false, error: 'Select dice to reroll' };
  if (run.rerollsLeft <= 0) return { ok: false, error: 'No rerolls left' };
  trayReroll(run, ctx.fortuneRng, valid);
  if (ctx.exp.biome === 'labyrinth' && ctx.exp.map.rooms[ctx.combat.roomKey]?.tags.includes('mirror')) {
    for (const i of valid) if (ctx.fortuneRng.chance(0.25)) flip(run, i);
  }
  ctx.combat.rerollsUsed += 1;
  if (curse?.rerollHpCost) {
    const cost = Math.max(1, Math.round(a.c.maxHp * curse.rerollHpCost));
    applyDamage(ctx, a.c, [{ type: 'warp', amount: cost }], { source: curse.name, noSoak: true });
  }
  return { ok: true };
}

/** Spending (not burning) a Fate Point. Void born roll 1d10: on a 9 it is not lost (Charmed). */
function spendFate(ctx: Ctx, h: Hero): boolean {
  if (h.fate <= 0) return false;
  if (h.origin.homeWorld === 'voidBorn' && ctx.rng.die(10) === 9) { log(ctx, `${h.name} is Charmed — the Fate Point is not lost!`, 'fortune'); return true; }
  h.fate -= 1;
  return true;
}

export function doTalent(ctx: Ctx, cmd: { id: string; die?: number; value?: number; delta?: 1 | -1 }): CmdResult {
  const a = actor(ctx);
  if (!a) return { ok: false, error: 'No active explorer' };
  const { c, h, d } = a;
  const run = ctx.exp.fortune;
  const t = ctx.combat.turn!;
  const die = cmd.die ?? -1;
  const td = run.tray[die];
  const onceKey = `${h.id}:${cmd.id}`;
  const uses = (n: number) => Number(ctx.combat.once[`${onceKey}:2`] ? 2 : ctx.combat.once[onceKey] ? 1 : 0) < n;
  const markUse = () => { if (ctx.combat.once[onceKey]) ctx.combat.once[`${onceKey}:2`] = true; else ctx.combat.once[onceKey] = true; };
  const conjure = (material: Parameters<typeof addGhostDie>[2], v: number) => addGhostDie(run, ctx.fortuneRng, material, v);
  switch (cmd.id) {
    case 'speculate':
      if (h.careerId !== 'rogueTrader') return { ok: false, error: 'Rogue Traders only' };
      if (t.flags.speculate) return { ok: false, error: 'Once per turn' };
      if (run.doubloons < 1) return { ok: false, error: 'No scrip to invest' };
      run.doubloons -= 1;
      run.rerollsLeft += 1;
      t.flags.speculate = true;
      log(ctx, `${c.name} invests a scrip in fortune: +1 reroll.`, 'fortune');
      return { ok: true };
    case 'steadyAim':
      if (h.careerId !== 'archMilitant') return { ok: false, error: 'Arch-militants only' };
      if (t.flags.steadyAim) return { ok: false, error: 'Once per turn' };
      if (!td) return { ok: false, error: 'Pick a die' };
      if (!nudge(run, die, cmd.delta ?? 1)) return { ok: false, error: 'That die has no such face' };
      t.flags.steadyAim = true;
      log(ctx, `${c.name} steadies a die to ${faceValue(run, td)}.`, 'fortune');
      return { ok: true };
    case 'astralSight': {
      if (h.careerId !== 'astropath') return { ok: false, error: 'Astropaths only' };
      if (t.flags.astral) return { ok: false, error: 'Once per turn' };
      if (!td) return { ok: false, error: 'Pick a die' };
      const next = run.drawPile[run.drawPile.length - 1];
      if (!next) return { ok: false, error: 'The bag is empty' };
      run.drawPile.pop();
      run.drawPile.push(td.dieUid);
      const nd = { dieUid: next, face: 0 };
      rollTrayDie(run, ctx.fortuneRng, nd);
      run.tray[die] = nd;
      t.flags.astral = true;
      log(ctx, `${c.name} reaches into the bag with the Emperor's sight.`, 'fortune');
      return { ok: true };
    }
    case 'fabricate': case 'masterAndCommander': {
      const ok = cmd.id === 'fabricate' ? h.careerId === 'explorator' : h.talents.includes('masterAndCommander');
      if (!ok) return { ok: false, error: 'Not your talent' };
      const limit = cmd.id === 'fabricate' && d.features.has('omnissiahWill') ? 2 : 1;
      if (!uses(limit)) return { ok: false, error: 'No uses left this combat' };
      if (!td) return { ok: false, error: 'Pick a die' };
      const src = run.bag.find((x) => x.uid === td.dieUid);
      conjure(src?.material ?? 'cog', faceValue(run, td));
      markUse();
      log(ctx, `${c.name} conjures a copy of the ${faceValue(run, td)}.`, 'fortune');
      return { ok: true };
    }
    case 'sanctify': {
      if (h.careerId !== 'missionary') return { ok: false, error: 'Missionaries only' };
      if (!uses(1)) return { ok: false, error: 'Once per combat' };
      if (!td) return { ok: false, error: 'Pick a die' };
      run.tray.splice(die, 1);
      if (!td.ghost) run.discard.push(td.dieUid); else run.bag = run.bag.filter((x) => x.uid !== td.dieUid);
      conjure('creed', 10);
      markUse();
      log(ctx, `${c.name} sanctifies a die — a blazing Creed 10!`, 'fortune');
      return { ok: true };
    }
    case 'warpSight': {
      if (h.careerId !== 'navigator') return { ok: false, error: 'Navigators only' };
      if (!uses(d.features.has('twiceSight') ? 2 : 1)) return { ok: false, error: 'No uses left this combat' };
      if (!td || cmd.value === undefined) return { ok: false, error: 'Pick a die and a value' };
      if (!forceValue(run, die, cmd.value)) {
        const src = run.bag.find((x) => x.uid === td.dieUid);
        run.tray.splice(die, 1);
        if (!td.ghost) run.discard.push(td.dieUid);
        conjure(src?.material ?? 'eye', cmd.value);
      }
      markUse();
      gainCorruption(ctx, h, 1);
      log(ctx, `${c.name} looks into the warp: a die turns to ${cmd.value}. (+1 Corruption)`, 'fortune');
      return { ok: true };
    }
    case 'firingSolution':
      if (h.careerId !== 'voidMaster') return { ok: false, error: 'Void-masters only' };
      if (t.flags.firing) return { ok: false, error: 'Once per turn' };
      if (!td) return { ok: false, error: 'Pick a die' };
      if (!flip(run, die)) return { ok: false, error: 'That die has no opposite face' };
      t.flags.firing = true;
      log(ctx, `${c.name} flips a die to ${faceValue(run, td)} (Firing Solution).`, 'fortune');
      return { ok: true };
    case 'fateReroll':
      if (!spendFate(ctx, h)) return { ok: false, error: 'No Fate Points' };
      run.rerollsLeft += 2;
      log(ctx, `${c.name} spends a Fate Point: +2 rerolls.`, 'fortune');
      return { ok: true };
    case 'fateHeal': {
      if (c.hp >= c.maxHp) return { ok: false, error: 'Unhurt' };
      if (!spendFate(ctx, h)) return { ok: false, error: 'No Fate Points' };
      const n = roll(ctx.rng, '1d5').total;
      heal(ctx, c, Math.round(n * VITALITY * (1 + VITALITY_GROWTH * (h.level - 1)) * 1.5), 'Fate');
      return { ok: true };
    }
  }
  return { ok: false, error: 'Unknown talent' };
}

export interface TalentOption { id: string; name: string; text: string; needs: 'none' | 'die' | 'dieValue' | 'dieDelta'; usable: boolean; reason?: string }

export function listTalents(ctx: Ctx): TalentOption[] {
  const a = actor(ctx);
  if (!a) return [];
  const { h, d } = a;
  const t = ctx.combat.turn!;
  const usedN = (id: string) => (ctx.combat.once[`${h.id}:${id}:2`] ? 2 : ctx.combat.once[`${h.id}:${id}`] ? 1 : 0);
  const out: TalentOption[] = [];
  const add = (id: string, name: string, text: string, needs: TalentOption['needs'], reason: string | null) => out.push({ id, name, text, needs, usable: !reason, reason: reason ?? undefined });
  switch (h.careerId) {
    case 'rogueTrader': add('speculate', 'Speculate', 'Pay 1 scrip: +1 reroll.', 'none', t.flags.speculate ? 'Used this turn' : ctx.exp.fortune.doubloons < 1 ? 'No scrip' : null); break;
    case 'archMilitant': add('steadyAim', 'Steady Aim', 'Nudge a die ±1.', 'dieDelta', t.flags.steadyAim ? 'Used this turn' : null); break;
    case 'astropath': add('astralSight', 'Astral Sight', 'Swap a die with the next in the bag.', 'die', t.flags.astral ? 'Used this turn' : null); break;
    case 'explorator': add('fabricate', 'Fabricate', 'Copy a die.', 'die', usedN('fabricate') >= (d.features.has('omnissiahWill') ? 2 : 1) ? 'Used this fight' : null); break;
    case 'missionary': add('sanctify', 'Sanctify', 'Turn a die into a Creed 10.', 'die', usedN('sanctify') >= 1 ? 'Used this fight' : null); break;
    case 'navigator': add('warpSight', 'Warp-Sight', 'Set a die to any value (+1 Corruption).', 'dieValue', usedN('warpSight') >= (d.features.has('twiceSight') ? 2 : 1) ? 'Used this fight' : null); break;
    case 'voidMaster': add('firingSolution', 'Firing Solution', 'Flip a die (11 − value).', 'die', t.flags.firing ? 'Used this turn' : null); break;
  }
  if (h.talents.includes('masterAndCommander')) add('masterAndCommander', 'Master & Commander', 'Copy a die.', 'die', usedN('masterAndCommander') >= 1 ? 'Used this fight' : null);
  add('fateReroll', `Fate: +2 rerolls (${h.fate})`, 'Spend a Fate Point for two rerolls.', 'none', h.fate < 1 ? 'No Fate Points' : null);
  add('fateHeal', `Fate: recover`, 'Spend a Fate Point to recover 1d5 Wounds (scaled).', 'none', h.fate < 1 ? 'No Fate Points' : a.c.hp >= a.c.maxHp ? 'Unhurt' : null);
  return out;
}

export function nextBagDie(ctx: Ctx): string | undefined {
  return ctx.exp.fortune.drawPile[ctx.exp.fortune.drawPile.length - 1];
}

export function doToken(ctx: Ctx, cmd: { id: string; die?: number; value?: number }): CmdResult {
  const a = actor(ctx);
  if (!a) return { ok: false, error: 'No active explorer' };
  const run = ctx.exp.fortune;
  const idx = run.tokens.indexOf(cmd.id);
  if (idx < 0) return { ok: false, error: 'You have no such token' };
  switch (cmd.id) {
    case 'mulligan':
      for (const td of run.tray) rollTrayDie(run, ctx.fortuneRng, td);
      log(ctx, 'Litany of Recalibration: the whole tray is rerolled.', 'fortune');
      break;
    case 'fateCoin': {
      const td = run.tray[cmd.die ?? -1];
      if (!td || cmd.value === undefined) return { ok: false, error: 'Pick a die and value' };
      if (!forceValue(run, cmd.die!, cmd.value)) {
        const src = run.bag.find((x) => x.uid === td.dieUid);
        run.tray.splice(cmd.die!, 1);
        if (!td.ghost) run.discard.push(td.dieUid);
        addGhostDie(run, ctx.fortuneRng, src?.material ?? 'iron', cmd.value);
      }
      log(ctx, `Tarot Card: a die turns to ${cmd.value}.`, 'fortune');
      break;
    }
    case 'loadedCoin':
      ctx.combat.turn!.loaded = true;
      log(ctx, "Emperor's Favour: the next attack Test passes with 3 Degrees of Success.", 'fortune');
      break;
    case 'encore':
      ctx.combat.turn!.plays += 1;
      log(ctx, 'Stimm Shot! Play another hand this turn.', 'fortune');
      break;
    case 'tonic':
      heal(ctx, a.c, a.c.maxHp * 0.3, 'Medi-Injector');
      break;
    default:
      return { ok: false, error: 'Unknown token' };
  }
  run.tokens.splice(idx, 1);
  return { ok: true };
}

// ── Fortune scoring for an action ───────────────────────────────────────────

interface PlayCtx { dice: number[]; use: FortuneUse; target?: Combatant; extra?: { label: string; effect: Effect }[] }

function canPlay(ctx: Ctx, dice: number[]): string | null {
  if (!dice.length) return null;
  const t = ctx.combat.turn!;
  const run = ctx.exp.fortune;
  if (t.playsUsed >= t.plays) return 'No Fortune plays left this turn';
  if (dice.length > t.playLimit) return `You may play at most ${t.playLimit} dice`;
  if (new Set(dice).size !== dice.length) return 'Duplicate dice';
  for (const i of dice) {
    if (!run.tray[i]) return 'Invalid die';
    if (run.tray[i].jinxed) return 'A jinxed die cannot be played — reroll it first';
  }
  return null;
}

function biomeDie(ctx: Ctx): ((d: PlayedDie) => Effect | null) | undefined {
  const exp = ctx.exp;
  if (exp.biome === 'docks' && exp.meter >= 3) return (d) => (d.material === 'void' || d.material === 'aquila' ? { mult: 1, note: 'Void-burn' } : null);
  if (exp.biome === 'gardens' && exp.meter >= 3) return (d) => (d.material === 'ledger' || d.material === 'eye' ? { chips: 4, note: 'Bloom' } : null);
  if (exp.biome === 'reliquary' && exp.meter >= 1) return (d) => (d.material === 'cryo' || d.material === 'void' ? { mult: 2, note: 'High coolant' } : null);
  return undefined;
}

function scoreInput(ctx: Ctx, base: number, label: string, p: PlayCtx) {
  const a = actor(ctx)!;
  const run = ctx.exp.fortune;
  const marked = !!p.target && has(p.target, 'marked');
  return {
    run, trayIndices: p.dice, base, baseLabel: label, rng: ctx.fortuneRng,
    actor: { careerId: a.h.careerId, level: a.h.level, hpFrac: a.c.hp / a.c.maxHp, affinity: CLASS_MATERIAL[a.h.careerId] },
    action: (p.use === 'attack' ? 'attack' : p.use === 'heal' ? 'heal' : p.use === 'guard' ? 'guard' : 'spell') as 'attack' | 'heal' | 'guard' | 'spell',
    firstHand: ctx.combat.handsThisCombat === 0, marked, enemiesAlive: livingEnemies(ctx).length, curse: ctx.combat.curse,
    extraDie: biomeDie(ctx),
    extraHand: () => (p.extra ?? []).slice(),
  };
}

/**
 * Score a Fortune play for an action. Scored 10s are Righteous Fury: each adds
 * a d10 (rolling again on a 10) to the action's base before the multiplier.
 */
function score(ctx: Ctx, base0: number, label: string, p: PlayCtx): ScoreOutput {
  // Damage scales with the actor's power level (heals scale in healAmount).
  const base = p.use === 'attack' || p.use === 'spell' ? Math.round(base0 * powerScale(actor(ctx)!.h.level)) : base0;
  if (!p.dice.length) {
    return { hand: 'high', handLevel: 1, scoringDice: [], chips: base, mult: 1, base, total: Math.round(base), steps: [{ label, chips: base }], doubloons: 0, shattered: [], fury: 0 };
  }
  const extra = [...(p.extra ?? [])];
  if (p.use === 'attack' || p.use === 'spell') {
    const pv = previewHand(scoreInput(ctx, base, label, p));
    for (let i = 0; i < (pv.fury ?? 0); i++) {
      let f = 0, r = 0, guard = 0;
      do { r = ctx.rng.die(10); f += r; } while (r === 10 && guard++ < 5);
      extra.push({ label: 'Righteous Fury!', effect: { chips: f } });
    }
  }
  return scoreHand({ ...scoreInput(ctx, base, label, { ...p, extra }) });
}

function commitPlay(ctx: Ctx, p: PlayCtx, s: ScoreOutput) {
  if (!p.dice.length) return;
  const run = ctx.exp.fortune;
  const t = ctx.combat.turn!;
  t.playsUsed += 1;
  ctx.combat.handsThisCombat += 1;
  run.handsPlayed[s.hand] = (run.handsPlayed[s.hand] ?? 0) + 1;
  run.lastHand = s.hand;
  if (s.total > run.bestScore) run.bestScore = s.total;
  if (!ctx.game.profile.codex.hands.includes(s.hand)) ctx.game.profile.codex.hands.push(s.hand);
  const a = actor(ctx)!;
  let scrip = s.doubloons;
  if (a.h.careerId === 'seneschal') scrip += p.dice.filter((i) => run.bag.find((x) => x.uid === run.tray[i]?.dieUid)?.material === 'throne').length;
  if (scrip) { run.doubloons += scrip; log(ctx, `+${scrip} scrip!`, 'loot'); }
  if (s.shattered.length) log(ctx, `${s.shattered.length > 1 ? 'Blackstone shards crumble' : 'A blackstone shard crumbles'}!`, 'fortune');
  spendDice(run, ctx.fortuneRng, p.dice, trayLimit(ctx), s.shattered);
  ctx.combat.lastScore = s;
  log(ctx, `${HAND_BY_ID[s.hand].name}: ${s.chips} × ${s.mult} = ${s.total.toLocaleString()}${s.fury ? ` (${s.fury} Righteous Fury)` : ''}`, 'fortune');
  if (run.charms.some((ch) => ch.id === 'glassHeart')) {
    const cost = Math.max(1, Math.round(a.c.maxHp * 0.05));
    a.c.hp = Math.max(1, a.c.hp - cost);
  }
}

function healAmount(base: number, s: ScoreOutput, ctx: Ctx, h: Hero): number {
  const hm = charmPassives(ctx.exp.fortune).healMult;
  return Math.round(base * VITALITY * (1 + VITALITY_GROWTH * (h.level - 1)) * (1 + (s.mult - 1) * HEAL_MULT_SLOPE * 0.5) * hm);
}

function dcBonus(s: ScoreOutput, played: boolean): number {
  if (!played) return 0;
  return Math.min(30, Math.max(0, Math.floor(s.mult / 2) * 5));
}

// ── attack resolution ───────────────────────────────────────────────────────

interface Hit { amount: number; type: DamageType; pen: number; loc: HitLoc; fury: boolean; weapon: WeaponProfile }

/** Total situational modifier for an explorer's attack Test against a foe. */
function attackMods(ctx: Ctx, att: Combatant, h: Hero, tgt: Combatant, w: WeaponProfile): { mod: number; notes: string[] } {
  let m = testMods(att);
  const notes: string[] = [];
  const aim = cond(att, 'aiming');
  if (aim) { m += aim.value ?? 10; notes.push(`aim +${aim.value ?? 10}`); }
  if (has(att, 'hidden')) { m += 30; notes.push('hidden +30'); }
  if (has(tgt, 'marked')) { m += 10; notes.push('marked +10'); }
  if (has(tgt, 'stunned') || has(tgt, 'snared')) m += 20;
  if (has(tgt, 'prone')) m += w.ranged ? -10 : 10;
  if (has(tgt, 'pinned') && !w.ranged) m += 10;
  if (has(tgt, 'blinded')) m += 20;
  if (has(att, 'frenzied') && !w.ranged) m += 10;
  if (h.talents.includes('hatred') && tgt.mon?.tags.includes('xenos') && !w.ranged) m += 10;
  if (h.talents.includes('bloodtracker') && tgt.hp < tgt.maxHp / 2) m += 20;
  m += charmPassives(ctx.exp.fortune).hitBonus;
  m += w.hit;
  if (w.ranged) {
    if (tgt.rank === 'back' && !h.talents.includes('marksman') && !h.equipment.mainHand?.mods.includes('telescopic')) { m -= 10; notes.push('long range -10'); }
    if (att.rank === 'front' && frontEnemies(ctx).length && (w.cls === 'basic' || w.cls === 'heavy') && !h.equipment.mainHand?.mods.includes('bayonet')) { m -= 20; notes.push('engaged -20'); }
    if (att.rank === 'front' && tgt.rank === 'front' && w.cls === 'pistol') { m += 10; notes.push('point blank +10'); }
    if (w.qualities.includes('accurate') && aim) m += 10;
    if (w.qualities.includes('scatter') && tgt.rank === 'front') m += 10;
  }
  return { mod: m, notes };
}

/** Roll one hit's damage: dice + bonus, Tearing, and Righteous Fury on natural 10s. */
function rollHit(ctx: Ctx, att: Combatant, w: WeaponProfile, tgt: Combatant, attackTarget: number, furyMin: number, forceFury: boolean, loc: HitLoc): Hit {
  const r = roll(ctx.rng, w.dice, { extraDice: w.qualities.includes('tearing') ? 1 : 0 });
  let rolls = r.rolls.slice();
  if (w.qualities.includes('tearing') && rolls.length > 1) rolls = rolls.sort((a, b) => b - a).slice(0, rolls.length - 1);
  let amount = rolls.reduce((a, b) => a + b, 0) + (r.total - r.rolls.reduce((a, b) => a + b, 0)) + w.bonus;
  if (has(tgt, 'helpless')) amount += roll(ctx.rng, w.dice).total;
  const tens = /d10/.test(w.dice) ? rolls.filter((x) => x >= furyMin).length : 0;
  let fury = false;
  if (forceFury || tens > 0) {
    // Righteous Fury: confirm by passing the attack Test again (Core p.245).
    if (forceFury || test(ctx.rng, attackTarget).success) {
      fury = true;
      let guard = 0, extra = 0, dd = 0;
      do { dd = ctx.rng.die(10); extra += dd; } while (dd === 10 && guard++ < 5);
      amount += extra;
      log(ctx, `Righteous Fury! (+${extra})`, 'crit');
    }
  }
  void att;
  return { amount: Math.max(0, amount), type: w.type, pen: w.pen, loc, fury, weapon: w };
}

interface AttackSpec {
  mode: 'std' | 'semi' | 'full' | 'called' | 'allOut' | 'charge' | 'multi';
  swings: WeaponProfile[];
  label: string;
  extraHand?: { label: string; effect: Effect }[];
}

function modeMod(mode: AttackSpec['mode'], h: Hero, melee: boolean): number {
  switch (mode) {
    case 'semi': return 10;
    case 'full': return 20;
    case 'allOut': return 20;
    case 'charge': return 10;
    case 'called': return h.talents.includes(melee ? 'sureStrike' : 'deadeyeShot') ? -10 : -20;
    default: return 0;
  }
}

/** Extra hits from Degrees of Success (Core p.240): semi per two, full per one. */
function extraHits(mode: AttackSpec['mode'], dos: number, w: WeaponProfile, d: Derived): number {
  const gunner = d.features.has('masterGunner') ? 1 : 0;
  const rhythm = d.features.has('unrelenting') ? 1 : 0;
  if (mode === 'semi') return Math.min(w.rof[1] - 1 + rhythm, Math.floor(dos / 2)) + gunner;
  if (mode === 'full') return Math.min(w.rof[2] - 1 + rhythm, dos) + gunner;
  return 0;
}

/** Make a set of attacks against one target, scoring the whole volley as one Fortune hand. */
function weaponVolley(ctx: Ctx, dice: number[], tgt: Combatant, spec: AttackSpec): CmdResult {
  const a = actor(ctx)!;
  const { c, h, d } = a;
  const t = ctx.combat.turn!;
  const hits: Hit[] = [];
  const furyMin = 10 - charmPassives(ctx.exp.fortune).critRange;
  let blademasterUsed = false;
  for (let si = 0; si < spec.swings.length; si++) {
    const w = spec.swings[si];
    if (tgt.dead) break;
    const offhand = si > 0 && w === d.offhand;
    if (jammed(ctx, h, offhand)) continue;
    // Flame weapons strike automatically; the target may try to Dodge (Core p.115).
    const flame = w.qualities.includes('flame');
    const { mod, notes } = attackMods(ctx, c, h, tgt, w);
    const base = (w.ranged ? d.chars.BS : d.chars.WS) + modeMod(spec.mode, h, !w.ranged) + mod;
    let r: TestResult;
    if (t.loaded) { r = { roll: 1, target: base, success: true, degrees: 3, doubles: false }; t.loaded = false; }
    else if (flame) r = { roll: 50, target: base, success: true, degrees: 0, doubles: false };
    else r = test(ctx.rng, base);
    // Jams and overheats (Core p.111).
    if (w.ranged && !flame && r.roll >= w.jamOn) {
      ctx.combat.once[`jam:${h.id}${offhand ? ':off' : ''}`] = true;
      log(ctx, `${c.name}'s ${w.name} JAMS! (${r.roll})`, 'miss');
      fx(ctx, { kind: 'text', target: c.id, text: 'Jammed!' });
      continue;
    }
    if (w.qualities.includes('overheat') && r.roll >= 91 && w.jamOn <= 100) {
      log(ctx, `${c.name}'s ${w.name} OVERHEATS!`, 'warn');
      applyDamage(ctx, c, [{ type: 'energy', amount: roll(ctx.rng, w.dice).total * ECHO * 0.5 }], { source: 'Overheat', loc: 'rArm' });
      continue;
    }
    if (!r.success && !w.ranged && h.talents.includes('blademaster') && !blademasterUsed) { blademasterUsed = true; r = test(ctx.rng, base); }
    if (!r.success) {
      log(ctx, `${c.name} misses ${tgt.name} (${r.roll} vs ${r.target}${notes.length ? `; ${notes.join(', ')}` : ''}).`, 'miss');
      fx(ctx, { kind: 'miss', target: tgt.id, actor: c.id });
      continue;
    }
    let n = 1 + extraHits(spec.mode, r.degrees, w, d);
    if (w.qualities.includes('storm')) n *= 2;
    // The foe's Reaction: one Dodge per round against one hit.
    const canDodge = !tgt.used.reaction && (tgt.mon?.dodge ?? 0) > 0 && !has(tgt, 'feinted') && !has(tgt, 'stunned') && !has(tgt, 'helpless') && !has(c, 'hidden');
    if (canDodge && test(ctx.aiRng, (tgt.mon!.dodge) + (tgt.level ?? 1)).success) {
      tgt.used.reaction = true;
      n -= 1;
      log(ctx, `${tgt.name} dodges${n > 0 ? ' one hit' : ''}!`, 'miss');
      if (n <= 0) { fx(ctx, { kind: 'miss', target: tgt.id, actor: c.id }); continue; }
    }
    const firstLoc = spec.mode === 'called' ? 'head' : hitLocation(r.roll);
    for (let k = 0; k < n; k++) {
      const loc = k === 0 ? firstLoc : hitLocation(ctx.rng.int(1, 100));
      hits.push(rollHit(ctx, c, w, tgt, base, furyMin, spec.mode === 'called' && k === 0, loc));
    }
    log(ctx, `${c.name} hits ${tgt.name}${n > 1 ? ` ×${n}` : ''} in the ${LOC_NAME[firstLoc]} (${r.roll} vs ${r.target}, ${r.degrees} DoS).`, 'hit');
  }
  removeCondition(c, 'aiming');
  removeCondition(c, 'hidden');
  if (!hits.length) {
    if (dice.length) log(ctx, 'Every shot missed — your dice return to the tray.', 'fortune');
    return { ok: true };
  }
  // Exploit Weakness (Seneschal feint / shadow).
  const extraHand = [...(spec.extraHand ?? [])];
  if (t.flags[`exploit:${tgt.id}`] || t.flags.exploitAny) {
    const nd = d.features.has('exploit') ? 3 : 2;
    const v = roll(ctx.rng, `${nd}d10`).total;
    hits[0].amount += v;
    log(ctx, `Exploit Weakness! (+${v})`, 'crit');
    delete t.flags[`exploit:${tgt.id}`];
    delete t.flags.exploitAny;
  }
  if (cond(c, 'inspired')?.value) hits[0].amount += cond(c, 'inspired')!.value!;
  const base = hits.reduce((x, p) => x + p.amount, 0);
  const s = score(ctx, Math.max(1, base), spec.label, { dice, use: 'attack', target: tgt, extra: extraHand });
  const anyFury = hits.some((x) => x.fury) || (s.fury ?? 0) > 0;
  if (anyFury) s.crit = true;
  dealHits(ctx, c, tgt, hits, s.total, base);
  afterHitQualities(ctx, c, tgt, hits);
  commitPlay(ctx, { dice, use: 'attack', target: tgt }, s);
  return { ok: true, score: s };
}

/** Share a scored total across the individual hits; each is soaked at its own location. */
function dealHits(ctx: Ctx, att: Combatant, tgt: Combatant, hits: Hit[], total: number, base: number) {
  const hpBefore = tgt.hp + tgt.tempHp;
  const scale = base > 0 ? total / base : 1; // includes the power-level scaling
  for (const hit of hits) {
    if (tgt.dead) break;
    if (has(tgt, 'warded')) { removeCondition(tgt, 'warded'); log(ctx, `${tgt.name}'s ward turns the blow.`, 'miss'); continue; }
    applyDamage(ctx, tgt, [{ type: hit.type, amount: hit.amount * scale }], { source: hit.weapon.name, attacker: att, crit: hit.fury, pen: hit.pen, loc: hit.loc, melee: !hit.weapon.ranged });
  }
  // Overkill spills into the next foe — big numbers should feel big.
  if (tgt.dead) {
    const over = Math.max(0, total - hpBefore);
    const next = livingEnemies(ctx).sort((a, b) => (a.rank === tgt.rank ? -1 : 1) - (b.rank === tgt.rank ? -1 : 1))[0];
    if (over > 4 && next) {
      log(ctx, `Overkill! ${Math.round(over / 2)} spills into ${next.name}.`, 'hit');
      applyDamage(ctx, next, [{ type: hits[0].type, amount: over / 2 }], { source: 'Overkill', attacker: att, pen: hits[0].pen });
    }
  }
}

function afterHitQualities(ctx: Ctx, att: Combatant, tgt: Combatant, hits: Hit[]) {
  const h = heroOf(ctx, att)!;
  const q = new Set(hits.flatMap((x) => x.weapon.qualities));
  if (!tgt.dead) {
    if (q.has('shocking') && !charTest(ctx, tgt, 'T').success) { addCondition(ctx, tgt, { id: 'stunned', rounds: 1 }); log(ctx, `${tgt.name} is Stunned by the shock!`, 'hit'); }
    if (q.has('toxic') && !charTest(ctx, tgt, 'T', -10).success) { addCondition(ctx, tgt, { id: 'poisoned', rounds: 3, value: 3 }); log(ctx, `${tgt.name} is poisoned.`, 'hit'); }
    if (q.has('snare')) addCondition(ctx, tgt, { id: 'snared', rounds: 2 });
    if (q.has('flame') && (h.talents.includes('cleanseAndPurify') || !charTest(ctx, tgt, 'Ag').success)) { addCondition(ctx, tgt, { id: 'onFire', rounds: 3, value: Math.round(roll(ctx.rng, '1d10').total * 1.5) }); log(ctx, `${tgt.name} is set on fire!`, 'hit'); }
  }
  if (q.has('blast') || q.has('flame')) {
    // Blast and flame spill onto the rest of the rank.
    for (const e of livingEnemies(ctx).filter((x) => x.rank === tgt.rank && x.id !== tgt.id).slice(0, q.has('flame') ? 3 : 1)) {
      const w = hits[0].weapon;
      const amt = (roll(ctx.rng, w.dice).total + w.bonus) * ECHO * 0.6;
      log(ctx, `The ${q.has('flame') ? 'flames' : 'blast'} engulf ${e.name}.`, 'hit');
      applyDamage(ctx, e, [{ type: w.type, amount: amt }], { source: w.name, attacker: att, pen: w.pen });
      if (q.has('flame') && !e.dead && !charTest(ctx, e, 'Ag').success) addCondition(ctx, e, { id: 'onFire', rounds: 2, value: 4 });
    }
  }
}

// ── the act command ─────────────────────────────────────────────────────────

export function doAct(ctx: Ctx, cmd: Extract<CombatCmd, { type: 'act' }>): CmdResult {
  const a = actor(ctx);
  if (!a) return { ok: false, error: 'No active explorer' };
  const { c, h, d } = a;
  const opt = listActions(ctx).find((o) => o.key === cmd.key);
  if (!opt) return { ok: false, error: 'Unknown action' };
  if (!opt.usable) return { ok: false, error: opt.reason ?? 'Not usable' };
  const dice = opt.fortune === 'none' ? [] : cmd.dice;
  const playErr = canPlay(ctx, dice);
  if (playErr) return { ok: false, error: playErr };
  const legal = legalTargets(ctx, opt.target, !!opt.melee);
  let targets = cmd.targets.map((id) => ctx.combat.combatants[id]).filter((x) => x && legal.includes(x));
  if (opt.target === 'self') targets = [c];
  if (opt.target === 'allies') targets = livingHeroes(ctx);
  if (opt.target === 'enemies') targets = livingEnemies(ctx);
  if ((opt.target === 'enemy' || opt.target === 'ally' || opt.target === 'fallenAlly' || opt.target === 'rank') && !targets.length) {
    if (legal.length === 1) targets = [legal[0]];
    else return { ok: false, error: 'Choose a target' };
  }
  if (opt.target === 'rank') targets = livingEnemies(ctx).filter((e) => e.rank === targets[0].rank);
  return resolve(ctx, opt, cmd, dice, targets, c, h, d);
}

function resolve(ctx: Ctx, opt: ActionOption, cmd: Extract<CombatCmd, { type: 'act' }>, dice: number[], targets: Combatant[], c: Combatant, h: Hero, d: Derived): CmdResult {
  const t = ctx.combat.turn!;
  const tgt = targets[0];
  const key = opt.key;
  const attackModes: Record<string, AttackSpec['mode']> = { std: 'std', semi: 'semi', full: 'full', called: 'called', allOut: 'allOut', charge: 'charge', multi: 'multi' };
  if (attackModes[key]) {
    // Quick Draw: the first attack each combat is free if it is a Half Action. A Full
    // Action attack still costs the whole turn (it used to leave a spare Half Action).
    const quickDraw = h.talents.includes('quickDraw') && !ctx.combat.once[`${h.id}:quickDraw`];
    if (quickDraw) ctx.combat.once[`${h.id}:quickDraw`] = true;
    if (quickDraw && opt.cost === 'half') log(ctx, `${c.name} draws and fires in one motion (Quick Draw).`, 'info');
    else spend(c, opt.cost);
    const mode = attackModes[key];
    let swings = [d.main];
    if (mode === 'multi') swings = multiSwings(h, d);
    if ((mode === 'allOut' || mode === 'charge') && d.main.ranged && d.offhand && !d.offhand.ranged) swings = [d.offhand];
    if (mode === 'charge') { c.rank = 'front'; ctx.exp.flags[`rank:${h.id}`] = 2; log(ctx, `${c.name} charges!`, 'info'); }
    if (mode === 'allOut') addCondition(ctx, c, { id: 'allOut', rounds: 1, untilTurnStart: true });
    const label = mode === 'std' ? swings[0].name : `${swings[0].name} — ${opt.name.split(' (')[0].split(' — ')[0]}`;
    return weaponVolley(ctx, dice, tgt, { mode, swings, label });
  }

  if (key === 'guard') {
    spend(c, 'full');
    addCondition(ctx, c, { id: 'guarding', rounds: 1, untilTurnStart: true });
    const base = 4 + h.level;
    const s = score(ctx, base, 'Defensive Stance', { dice, use: 'guard' });
    const gm = charmPassives(ctx.exp.fortune).guardMult;
    const ward = Math.round(base * VITALITY * (1 + (s.mult - 1) * 0.35) * gm + (dice.length ? (s.chips - base) * 0.5 : 0));
    c.tempHp = Math.max(c.tempHp, ward);
    log(ctx, `${c.name} takes a defensive stance (${ward} Ward).`, 'info');
    fx(ctx, { kind: 'ward', target: c.id, amount: ward });
    commitPlay(ctx, { dice, use: 'guard' }, s);
    return { ok: true, score: s };
  }
  if (key === 'aim') {
    spend(c, 'half');
    const cur = cond(c, 'aiming');
    addCondition(ctx, c, { id: 'aiming', rounds: 2, value: Math.min(20, (cur?.value ?? 0) + 10) });
    log(ctx, `${c.name} takes aim (+${cond(c, 'aiming')!.value}).`, 'info');
    return { ok: true };
  }
  if (key === 'clearJam') {
    spend(c, opt.cost);
    if (opt.cost === 'free') t.flags.knock = true;
    delete ctx.combat.once[`jam:${h.id}`];
    delete ctx.combat.once[`jam:${h.id}:off`];
    log(ctx, `${c.name} clears the jam.`, 'info');
    return { ok: true };
  }
  if (key === 'rank') {
    spend(c, opt.cost);
    t.flags.moved = true;
    c.rank = c.rank === 'front' ? 'back' : 'front';
    ctx.exp.flags[`rank:${h.id}`] = c.rank === 'back' ? 1 : 2;
    log(ctx, `${c.name} moves to the ${c.rank} rank.`, 'info');
    if (!livingHeroes(ctx).some((x) => x.rank === 'front')) { c.rank = 'front'; log(ctx, 'Someone must hold the front — the move fails.', 'warn'); }
    return { ok: true };
  }
  if (key.startsWith('power:')) return castPower(ctx, POWERS[key.slice(6)], cmd.slot ?? 2, targets, dice);
  if (key.startsWith('feat:')) return useFeature(ctx, key.slice(5), targets, dice, opt);
  if (key.startsWith('item:')) return useItem(ctx, key.slice(5), targets, dice);
  return { ok: false, error: 'Unhandled action' };
}

// ── psychic techniques and Navigator powers ─────────────────────────────────

function effectivePr(d: Derived, strength: number, ctx: Ctx, h: Hero): number {
  if (ctx.combat.once[`${h.id}:burnout`]) return 0;
  const pr = d.psyRating;
  if (strength === 1) return Math.ceil(pr / 2);
  if (strength === 3) return pr + (d.features.has('choirVoice') ? 4 : 3);
  return pr;
}

/** The Focus Power Test target for a power at a strength (0 for Navigators). */
export function powerTarget(ctx: Ctx, h: Hero, d: Derived, p: PowerDef, strength: number): number {
  const c = ctx.combat.combatants[h.id];
  const mods = c ? testMods(c) : 0;
  if (p.discipline === 'Navigator') return d.chars[p.char ?? 'WP'] + 10 * (h.powers[p.id] ?? 0) + d.focusBonus + mods;
  return d.chars.WP + 5 * effectivePr(d, strength, ctx, h) + d.focusBonus + (h.talents.includes('warpAffinity') ? 5 : 0) + mods;
}

function castPower(ctx: Ctx, p: PowerDef, strength: number, targets: Combatant[], dice: number[]): CmdResult {
  const a = actor(ctx)!;
  const { c, h, d } = a;
  if (!p) return { ok: false, error: 'Unknown power' };
  const nav = p.discipline === 'Navigator';
  spend(c, p.action);
  const mastery = h.powers[p.id] ?? 0;
  const eff = nav ? 1 + mastery : effectivePr(d, strength, ctx, h);
  // Fortune dice sharpen the Focus Power Test.
  const s0 = dice.length && powerFortune(p) === 'dc' ? score(ctx, 0, p.name, { dice, use: 'spell' }) : undefined;
  const bonusT = s0 ? dcBonus(s0, true) : 0;
  if (bonusT) log(ctx, `Fortune focuses the mind: +${bonusT}.`, 'fortune');
  const target = powerTarget(ctx, h, d, p, strength) + bonusT;
  const r = test(ctx.rng, target);
  const ok = r.success && (nav || r.roll < 91);
  const label = `${p.name}${nav ? '' : ` (${STRENGTH_NAMES[strength]})`}`;
  log(ctx, `${c.name} ${nav ? 'opens the warp eye' : 'focuses'}: ${label} — ${r.roll} vs ${target} ${ok ? `(${r.degrees} DoS)` : '— fails'}.`, ok ? 'info' : 'miss');
  // Psychic Phenomena: doubles when Unfettered, always when Pushing (Core p.158).
  if (!nav && ((strength === 2 && r.doubles) || strength === 3)) phenomena(ctx, c, h, strength === 3 ? 15 : 0);
  if (nav && p.id === 'lidlessStare') addCondition(ctx, c, { id: 'fatigued', rounds: ok && r.degrees >= 1 ? 1 : 2 });
  if (!ok || c.dead || c.downed) {
    if (s0) commitPlay(ctx, { dice, use: 'spell' }, s0);
    if (dice.length && !s0) log(ctx, 'The power fails — your dice return to the tray.', 'fortune');
    return { ok: true, score: s0 };
  }
  const resists = (x: Combatant): boolean => {
    if (p.living && x.mon?.tags.some((tg) => tg === 'construct' || tg === 'daemon')) { log(ctx, `${x.name} has no mind to touch.`, 'miss'); return true; }
    if (!p.opposed) return false;
    if (nav && d.features.has('eyeOfDynasty') && !x.mon?.boss) return false;
    const rr = charTest(ctx, x, 'WP', 0, ctx.aiRng);
    const beaten = !rr.success || r.degrees > rr.degrees;
    if (!beaten && x.mon?.boss && (ctx.combat.legendary[x.id] ?? 0) > 0) return true;
    if (!beaten) log(ctx, `${x.name} resists (${rr.roll} vs ${rr.target}).`, 'miss');
    return !beaten;
  };
  const tag = p.sustain ? `${c.id}:${p.id}` : undefined;
  if (p.sustain) { endSustain(ctx, c); c.sustain = { powerId: p.id, targets: targets.map((x) => x.id) }; }
  const wpb = d.bonuses.WP;
  switch (p.kind) {
    case 'damage': {
      const list = p.target === 'enemy' ? [targets[0]] : targets;
      const baseRoll = Math.max(1, roll(ctx.rng, p.dmg!(eff, wpb)).total);
      const s = score(ctx, baseRoll, label, { dice: s0 ? [] : dice, use: 'spell', target: list[0] });
      for (const x of list) {
        if (x.dead || resists(x)) continue;
        if (has(x, 'warded')) { removeCondition(x, 'warded'); continue; }
        applyDamage(ctx, x, [{ type: p.damageType ?? 'energy', amount: s.total }], { source: p.name, attacker: c, pen: p.pen?.(eff) ?? 0, noSoak: p.pure });
        if (p.condition && !x.dead) addCondition(ctx, x, { id: p.condition.id, rounds: p.id === 'lidlessStare' && mastery >= 1 ? 2 : p.condition.rounds });
        if (p.id === 'lidlessStare' && mastery >= 2 && !x.dead && !x.mon?.boss && !charTest(ctx, x, 'T', -10).success) { kill(ctx, x, 'The Lidless Stare', c); log(ctx, `${x.name} looks into the warp, and dies.`, 'crit'); }
      }
      if (!s0) commitPlay(ctx, { dice, use: 'spell', target: list[0] }, s);
      return { ok: true, score: s };
    }
    case 'debuff': {
      for (const x of p.target === 'enemy' ? [targets[0]] : targets) {
        if (x.dead || resists(x)) continue;
        if (p.condition!.id === 'helpless' && x.mon?.boss) { addCondition(ctx, x, { id: 'stunned', rounds: 1 }); log(ctx, `${x.name} is held for a moment.`, 'hit'); continue; }
        if (p.condition!.id === 'dominated' && x.mon?.boss) { log(ctx, `${x.name}'s will is too strong to dominate.`, 'miss'); continue; }
        addCondition(ctx, x, { id: p.condition!.id, rounds: p.condition!.rounds, sourceId: c.id, sustainOf: tag });
        if (p.id === 'mindProbe' || p.id === 'gazeIntoTheAbyss') addCondition(ctx, x, { id: 'marked', rounds: 3, sourceId: c.id });
        log(ctx, `${x.name} is ${p.condition!.id}!`, 'hit');
      }
      if (s0) commitPlay(ctx, { dice, use: 'spell' }, s0);
      return { ok: true, score: s0 };
    }
    case 'buff': {
      const list = p.target === 'allies' ? livingHeroes(ctx) : p.target === 'self' ? [c] : [targets[0]];
      for (const x of list) {
        const v = p.id === 'telekineticShield' ? eff : p.condition!.id === 'foreseen' ? (nav ? 10 + 10 * mastery : 5 * eff) : undefined;
        addCondition(ctx, x, { id: p.condition!.id, rounds: p.condition!.rounds, value: v, sustainOf: tag });
        if (p.id === 'inspire') removeCondition(x, 'frightened');
      }
      log(ctx, `${p.name} takes hold.`, 'info');
      return { ok: true };
    }
    case 'special': {
      ctx.exp.fortune.rerollsLeft += 2;
      log(ctx, `${p.name}: the Emperor's Tarot turns — +2 rerolls.`, 'fortune');
      return { ok: true };
    }
    default:
      return { ok: true };
  }
}

/** Psychic Phenomena (Core p.160) and Perils of the Warp (p.162), condensed. */
function phenomena(ctx: Ctx, c: Combatant, h: Hero, bonusRoll: number) {
  const warpAff = h.talents.includes('warpAffinity') ? -10 : 0;
  const r = ctx.rng.int(1, 100) + bonusRoll + warpAff;
  const ph = PHENOMENA.find((x) => r <= x.max)!;
  log(ctx, `Psychic Phenomena (${r}): ${ph.name} — ${ph.text}`, 'warn');
  fx(ctx, { kind: 'text', target: c.id, text: ph.name });
  switch (ph.effect) {
    case 'insanity': gainInsanity(ctx, h, 1); break;
    case 'corruption': gainCorruption(ctx, h, 1); break;
    case 'drain': applyDamage(ctx, c, [{ type: 'warp', amount: c.maxHp * 0.1 }], { source: 'Psychic drain', noSoak: true }); break;
    case 'flicker': for (let i = 0; i < ctx.exp.fortune.tray.length; i++) flip(ctx.exp.fortune, i); break;
    case 'fear': for (const x of livingHeroes(ctx)) if (!charTest(ctx, x, 'WP').success) addCondition(ctx, x, { id: 'frightened', rounds: 2 }); break;
    case 'perils': {
      const p2 = ctx.rng.int(1, 100);
      const pe = PERILS.find((x) => p2 <= x.max)!;
      log(ctx, `PERILS OF THE WARP: ${pe.name}! ${pe.text}`, 'death');
      switch (pe.effect) {
        case 'stun': addCondition(ctx, c, { id: 'stunned', rounds: 1 }); gainInsanity(ctx, h, ctx.rng.die(10)); break;
        case 'wound': applyDamage(ctx, c, [{ type: 'warp', amount: roll(ctx.rng, '2d10').total * ECHO * 0.5 }], { source: 'Perils of the Warp', noSoak: true }); gainCorruption(ctx, h, ctx.rng.die(5)); break;
        case 'burnout': ctx.combat.once[`${h.id}:burnout`] = true; break;
        case 'daemon': {
          const n = Object.keys(ctx.combat.combatants).length;
          const e = scaledMonster(ctx, 'warpEcho', n + 20);
          e.id = `w${n}${ctx.rng.int(0, 999)}`;
          e.initiative = c.initiative - 0.5;
          ctx.combat.combatants[e.id] = e;
          ctx.combat.order.splice(ctx.combat.order.indexOf(c.id) + 1, 0, e.id);
          break;
        }
      }
      break;
    }
  }
}

// ── career features ─────────────────────────────────────────────────────────

function useFeature(ctx: Ctx, id: string, targets: Combatant[], dice: number[], opt: ActionOption): CmdResult {
  const a = actor(ctx)!;
  const { c, h, d } = a;
  const t = ctx.combat.turn!;
  const tgt = targets[0];
  const onceK = (k: string) => { ctx.combat.once[`${h.id}:${k}`] = true; };
  spend(c, opt.cost);
  const skillTest = (target: number, what: string): TestResult => {
    const r = test(ctx.rng, target);
    log(ctx, `${c.name}: ${what} ${r.roll} vs ${r.target} — ${r.success ? `success (${r.degrees} DoS)` : 'failure'}.`, r.success ? 'info' : 'miss');
    return r;
  };
  const cmd = skillTarget(d, 'command', Math.floor(d.chars.Fel / 2)) + testMods(c);
  switch (id) {
    case 'suppress': {
      const w = d.main;
      const { mod } = attackMods(ctx, c, h, tgt, w);
      const r = test(ctx.rng, d.chars.BS - 20 + mod);
      if (r.roll >= w.jamOn) { ctx.combat.once[`jam:${h.id}`] = true; log(ctx, `${c.name}'s ${w.name} JAMS!`, 'miss'); return { ok: true }; }
      if (!r.success) { log(ctx, `${c.name}'s suppressing fire goes wide (${r.roll} vs ${r.target}).`, 'miss'); return { ok: true }; }
      const hits: { x: Combatant; hit: Hit }[] = targets.map((x) => ({ x, hit: rollHit(ctx, c, w, x, r.target, 10, false, hitLocation(ctx.rng.int(1, 100))) }));
      const base = hits.reduce((s2, p) => s2 + p.hit.amount, 0);
      const s = score(ctx, Math.max(1, base), 'Suppressing Fire', { dice, use: 'attack', target: tgt });
      for (const { x, hit } of hits) {
        applyDamage(ctx, x, [{ type: hit.type, amount: (hit.amount * s.total) / Math.max(1, base) }], { source: 'Suppressing Fire', attacker: c, pen: hit.pen, loc: hit.loc });
        if (!x.dead && !charTest(ctx, x, 'WP', -10).success) { addCondition(ctx, x, { id: 'pinned', rounds: 2 }); log(ctx, `${x.name} is Pinned!`, 'hit'); }
      }
      commitPlay(ctx, { dice, use: 'attack', target: tgt }, s);
      return { ok: true, score: s };
    }
    case 'luminen': {
      const w: WeaponProfile = { ...d.main, name: 'Luminen Charge', cls: 'melee', ranged: false, dice: '1d10', bonus: d.bonuses.T, type: 'energy', pen: 2, rof: [1, 0, 0], qualities: ['shocking'], hit: 0, jamOn: 101 };
      return weaponVolley(ctx, dice, tgt, { mode: 'std', swings: [w], label: 'Luminen Charge' });
    }
    case 'coup':
      if (tgt.mon?.boss || tgt.hp >= tgt.maxHp * 0.25) return { ok: false, error: 'Not weak enough' };
      log(ctx, `${c.name} delivers the coup de grâce.`, 'crit');
      kill(ctx, tgt, 'Coup de Grâce', c);
      return { ok: true };
    case 'rally': {
      const r = skillTest(cmd, 'Command');
      if (!r.success) return { ok: true };
      const list = h.talents.includes('airOfAuthority') ? livingHeroes(ctx) : livingHeroes(ctx).filter((x) => x.rank === c.rank);
      for (const x of list) { addCondition(ctx, x, { id: 'inspired', rounds: 2 }); removeCondition(x, 'frightened'); removeCondition(x, 'pinned'); }
      log(ctx, `"Hold, in the Emperor's name!" ${list.length} allies are Inspired.`, 'info');
      return { ok: true };
    }
    case 'mark': {
      const r = skillTest(cmd, 'Command');
      if (r.success) { addCondition(ctx, tgt, { id: 'marked', rounds: 3, sourceId: c.id }); log(ctx, `${tgt.name} is marked: concentrate fire!`, 'hit'); }
      return { ok: true };
    }
    case 'masterStroke':
      onceK('masterStroke');
      t.loaded = true;
      log(ctx, `${c.name} lines up the master stroke.`, 'fortune');
      return { ok: true };
    case 'claim': {
      onceK('claim');
      for (const x of livingHeroes(ctx)) heal(ctx, x, x.maxHp * 0.2, 'Claim the Field');
      ctx.exp.fortune.rerollsLeft += 1;
      log(ctx, `${c.name} claims the field for the Dynasty!`, 'crit');
      return { ok: true };
    }
    case 'analyse': {
      const r = skillTest(skillTarget(d, 'logic', Math.floor(d.chars.Int / 2)) + testMods(c), 'Logic');
      if (r.success) { addCondition(ctx, tgt, { id: 'vulnerable', rounds: 3 }); log(ctx, `${c.name} finds the weakness in ${tgt.name}.`, 'hit'); }
      return { ok: true };
    }
    case 'bless': {
      const r = skillTest(skillTarget(d, 'techUse', 0) + testMods(c), 'Tech-Use');
      if (r.success) {
        for (const k of Object.keys(ctx.combat.once)) if (k.startsWith('jam:')) delete ctx.combat.once[k];
        addCondition(ctx, tgt, { id: 'fortified', rounds: 3 });
        log(ctx, `The machine spirits are appeased.`, 'info');
      }
      return { ok: true };
    }
    case 'curse': {
      const s0 = dice.length ? score(ctx, 0, 'Machine Curse', { dice, use: 'spell' }) : undefined;
      const r = skillTest(skillTarget(d, 'techUse', 0) - 10 + testMods(c) + (s0 ? dcBonus(s0, true) : 0), 'Tech-Use');
      if (r.success) for (const x of targets) {
        if (x.mon?.tags.includes('construct')) { addCondition(ctx, x, { id: 'stunned', rounds: 1 }); log(ctx, `${x.name}'s machine spirit seizes!`, 'hit'); } else addCondition(ctx, x, { id: 'slowed', rounds: 2 });
      }
      if (s0) commitPlay(ctx, { dice, use: 'spell' }, s0);
      return { ok: true, score: s0 };
    }
    case 'exhort': {
      const r = skillTest(Math.max(skillTarget(d, 'charm', d.chars.Fel), d.chars.Fel) + testMods(c), 'Exhortation');
      if (!r.success) return { ok: true };
      const litany = d.features.has('litany') ? 2 : undefined;
      for (const x of livingHeroes(ctx)) {
        addCondition(ctx, x, { id: 'inspired', rounds: 2, value: litany });
        removeCondition(x, 'frightened');
        if (h.talents.includes('inspireWrath')) addCondition(ctx, x, { id: 'frenzied', rounds: 2 });
      }
      if (h.talents.includes('divineMinistration')) {
        const base = roll(ctx.rng, '1d10').total + d.bonuses.WP;
        const s = score(ctx, base, 'Divine Ministration', { dice, use: 'heal' });
        for (const x of livingHeroes(ctx)) heal(ctx, x, healAmount(base, s, ctx, h) * 0.5, 'Divine Ministration');
        commitPlay(ctx, { dice, use: 'heal' }, s);
        return { ok: true, score: s };
      }
      log(ctx, '"The Emperor protects!" The party is Inspired.', 'info');
      return { ok: true };
    }
    case 'medicae': {
      const r = skillTest(skillTarget(d, 'medicae', 0) + testMods(c), 'Medicae');
      const base = r.success ? roll(ctx.rng, '1d10').total + d.bonuses.Int + r.degrees * 2 : Math.floor(d.bonuses.Int / 2);
      const s = score(ctx, Math.max(1, base), 'Field Medicae', { dice, use: 'heal' });
      heal(ctx, tgt, healAmount(base, s, ctx, h), 'Field Medicae');
      if (r.success) { removeCondition(tgt, 'bleeding'); removeCondition(tgt, 'poisoned'); }
      commitPlay(ctx, { dice, use: 'heal' }, s);
      return { ok: true, score: s };
    }
    case 'protect':
      onceK('protect');
      addCondition(ctx, tgt, { id: 'warded', rounds: 3 });
      log(ctx, `The Emperor protects ${tgt.name}.`, 'info');
      return { ok: true };
    case 'miracle': {
      onceK('miracle');
      const hh = heroOf(ctx, tgt)!;
      tgt.dead = false; tgt.downed = false; tgt.crit = 0; tgt.hp = Math.round(tgt.maxHp / 2);
      if (hh.status === 'dead' && !hh.lordCaptain) hh.status = 'alive';
      delete hh.history.deathCause;
      ctx.combat.diedThisFight = ctx.combat.diedThisFight.filter((x) => x !== hh.id);
      log(ctx, `A miracle! ${tgt.name} rises!`, 'heal');
      fx(ctx, { kind: 'heal', target: tgt.id, amount: tgt.hp });
      return { ok: true };
    }
    case 'feint': {
      const mine = charTest(ctx, c, 'WS');
      const theirs = charTest(ctx, tgt, 'WS', 0, ctx.aiRng);
      if (mine.success && (!theirs.success || mine.degrees > theirs.degrees)) {
        addCondition(ctx, tgt, { id: 'feinted', rounds: 1 });
        t.flags[`exploit:${tgt.id}`] = true;
        log(ctx, `${c.name} feints — ${tgt.name} is wide open!`, 'hit');
      } else log(ctx, `${tgt.name} sees through the feint.`, 'miss');
      return { ok: true };
    }
    case 'shadow': {
      const r = skillTest(skillTarget(d, 'silentMove', Math.floor(d.chars.Ag / 2)) + testMods(c), 'Silent Move');
      if (r.success) { addCondition(ctx, c, { id: 'hidden', rounds: 2 }); t.flags.exploitAny = true; }
      return { ok: true };
    }
    case 'evasive': {
      const r = skillTest(cmd, 'Command');
      if (r.success) for (const x of livingHeroes(ctx)) addCondition(ctx, x, { id: 'foreseen', rounds: 1, value: 20 });
      return { ok: true };
    }
    case 'ship': {
      ctx.exp.flags[`ship:${h.id}`] = 1;
      const base = roll(ctx.rng, '3d10').total + h.level * 2;
      log(ctx, `${c.name} voxes the ship: "Fire on my mark!" Macrocannon shells punch through the hull.`, 'crit');
      const s = score(ctx, base, 'Call the Guns', { dice, use: 'spell', target: targets[0] });
      for (const x of targets) applyDamage(ctx, x, [{ type: 'explosive', amount: s.total }], { source: 'Macrocannon', attacker: c, pen: 6 });
      commitPlay(ctx, { dice, use: 'spell' }, s);
      return { ok: true, score: s };
    }
    case 'frenzy':
      addCondition(ctx, c, { id: 'frenzied', rounds: -1 });
      if (c.rank === 'back') { c.rank = 'front'; ctx.exp.flags[`rank:${h.id}`] = 2; }
      log(ctx, `${c.name} goes into a FRENZY!`, 'crit');
      return { ok: true };
    case 'prosanguine': {
      onceK('prosanguine');
      const r = skillTest(skillTarget(d, 'techUse', 0) + testMods(c), 'Tech-Use');
      const base = r.success ? roll(ctx.rng, '1d10').total + r.degrees * 2 : 1;
      const s = score(ctx, base, 'Prosanguine', { dice, use: 'heal' });
      heal(ctx, c, healAmount(base, s, ctx, h), 'Prosanguine');
      commitPlay(ctx, { dice, use: 'heal' }, s);
      return { ok: true, score: s };
    }
  }
  return { ok: false, error: `Unknown feature ${id}` };
}

// ── items ───────────────────────────────────────────────────────────────────

function useItem(ctx: Ctx, uid: string, targets: Combatant[], dice: number[]): CmdResult {
  const a = actor(ctx)!;
  const { c, h, d } = a;
  const idx = ctx.exp.carriedItems.findIndex((i) => i.uid === uid);
  if (idx < 0) return { ok: false, error: 'Item not found' };
  const inst = ctx.exp.carriedItems[idx];
  const def = ITEMS[inst.defId];
  const cons = def.consumable!;
  const tgt = targets[0] ?? c;
  spend(c, 'half');
  if ((inst.qty ?? 1) > 1) inst.qty! -= 1; else ctx.exp.carriedItems.splice(idx, 1);
  switch (cons.effect) {
    case 'heal': {
      const med = d.skills.medicae;
      const bonusM = med !== null && test(ctx.rng, med).success ? d.bonuses.Int : 0;
      const base = roll(ctx.rng, cons.dice!).total + bonusM;
      const s = score(ctx, base, def.name, { dice, use: 'heal' });
      heal(ctx, tgt, healAmount(base, s, ctx, h), def.name);
      removeCondition(tgt, 'bleeding');
      commitPlay(ctx, { dice, use: 'heal' }, s);
      return { ok: true, score: s };
    }
    case 'cleanse':
      tgt.conditions = tgt.conditions.filter((x) => !['poisoned', 'onFire', 'bleeding', 'fatigued'].includes(x.id));
      log(ctx, `${tgt.name} is purged.`, 'heal');
      return { ok: true };
    case 'bomb': {
      const thrown = test(ctx.rng, d.chars.BS + testMods(c));
      const base = roll(ctx.rng, cons.dice!).total;
      const s = score(ctx, base, def.name, { dice, use: 'spell', target: tgt });
      const share = thrown.success ? 1 : 0.5;
      log(ctx, thrown.success ? `${def.name} lands true.` : `${def.name} scatters.`, thrown.success ? 'hit' : 'miss');
      for (const x of targets) applyDamage(ctx, x, [{ type: cons.damageType!, amount: s.total * share }], { source: def.name, attacker: c, pen: cons.pen ?? 0 });
      commitPlay(ctx, { dice, use: 'spell', target: tgt }, s);
      return { ok: true, score: s };
    }
    case 'stimm':
      c.tempHp = Math.max(c.tempHp, Math.round(c.maxHp * 0.25));
      addCondition(ctx, c, { id: 'fortified', rounds: 5 });
      log(ctx, `${c.name} slams a stimm.`, 'info');
      return { ok: true };
    case 'frenzon':
      addCondition(ctx, c, { id: 'frenzied', rounds: -1 });
      c.tempHp = Math.max(c.tempHp, Math.round(c.maxHp * 0.15));
      log(ctx, `${c.name} injects frenzon and howls!`, 'crit');
      return { ok: true };
    case 'flash':
      for (const x of livingEnemies(ctx)) if (!x.mon?.tags.includes('construct') && !charTest(ctx, x, 'Ag', 0, ctx.aiRng).success) addCondition(ctx, x, { id: 'blinded', rounds: 2 });
      log(ctx, 'A photon flash whites out the room!', 'hit');
      return { ok: true };
    case 'smoke':
      ctx.combat.status = 'fled';
      log(ctx, 'Smoke fills the room — the party breaks contact!', 'warn');
      return { ok: true };
    case 'unguent':
      for (const k of Object.keys(ctx.combat.once)) if (k.startsWith('jam:')) delete ctx.combat.once[k];
      if (ctx.exp.fortune.tokens.length < 3) ctx.exp.fortune.tokens.push('mulligan');
      log(ctx, 'Sacred unguents placate the machine spirits.', 'fortune');
      return { ok: true };
  }
  return { ok: true };
}

// ── end turn ────────────────────────────────────────────────────────────────

export function endHeroTurn(ctx: Ctx) {
  const a = actor(ctx);
  if (a) endOfTurnHook(ctx, a.c);
  ctx.combat.turn = undefined;
  advance(ctx);
}

let endOfTurnHook: (ctx: Ctx, c: Combatant) => void = () => {};
export function setEndOfTurnHook(fn: (ctx: Ctx, c: Combatant) => void) { endOfTurnHook = fn; }

/** True once the explorer has nothing meaningful left this turn. */
export function turnExhausted(ctx: Ctx): boolean {
  const a = actor(ctx);
  if (!a) return true;
  if (a.c.used.half > 0) return false;
  return true;
}

export { alive, incapacitated, enemies, HAND_RANK, handContains, bonus, charOf };
export type { Rank, HandType };
