/** Combat: battlefield, the felt Fortune Tray, command menu, scoring animation. */
import type { Combatant, ScoreReport } from '../engine/types.ts';
import { h, btn, fmt } from './dom.ts';
import { app, run, render, toast, afterRender, wait, resetCombatUi } from './app.ts';
import { bgStyle } from './art.ts';
import { trayDie, charmEl, hpBar, conds, combatantArt, doubloons, TOKEN_GLYPH } from './widgets.ts';
import { makeCtx, current, has } from '../combat/core.ts';
import { listActions, listTalents, legalTargets, type ActionOption, nextBagDie, STRENGTH_NAMES } from '../combat/hero.ts';
import { previewHand } from '../fortune/scoring.ts';
import { HAND_BY_ID } from '../fortune/hands.ts';
import { CLASS_MATERIAL, MATERIALS } from '../fortune/materials.ts';
import { charmSlots } from '../fortune/tray.ts';
import { CURSES } from '../fortune/curses.ts';
import { TOKENS } from '../fortune/boons.ts';
import { MONSTERS, tierIndex } from '../content/monsters.ts';
import { BIOMES } from '../content/biomes.ts';
import { Rng } from '../engine/rng.ts';
import { sfx } from './audio.ts';

const MENU: [string, string][] = [['attack', 'Attack'], ['skill', 'Career'], ['magic', 'Powers'], ['item', 'Items'], ['guard', 'Stance / Move']];

function ctxOrNull() {
  const g = app.game!;
  return g.expedition?.combat ? makeCtx(g) : null;
}

export function toggleDie(i: number) {
  const ctx = ctxOrNull();
  if (!ctx?.combat.turn) return;
  const sel = app.ui.selected;
  const at = sel.indexOf(i);
  if (at >= 0) sel.splice(at, 1);
  else {
    sel.push(i);
    if (sel.length > 7) sel.shift();
  }
  sfx.select();
  render();
}

export function doReroll() {
  const sel = app.ui.selected.slice();
  if (!sel.length) { toast('Select the dice you want to reroll.'); return; }
  const r = run({ type: 'combat', cmd: { type: 'reroll', dice: sel } });
  if (r.ok) {
    sfx.roll(sel.length);
    app.ui.rolling = new Set(sel);
    app.ui.selected = [];
    render();
  }
}

function endTurn() {
  resetCombatUi();
  run({ type: 'combat', cmd: { type: 'endTurn' } });
}

function act(opt: ActionOption, targets: string[]) {
  const p = app.ui.pending;
  const dice = opt.fortune === 'none' ? [] : app.ui.selected.slice();
  const r = run({ type: 'combat', cmd: { type: 'act', key: opt.key, targets, dice, slot: p?.slot, meta: p?.meta ?? [] } });
  if (r.ok) {
    const missed = !r.score && dice.length > 0;
    if (!r.score) sfx.select();
    const keep = missed ? app.ui.selected.slice() : [];
    resetCombatUi();
    app.ui.selected = keep;
    render();
  }
}

function chooseOption(opt: ActionOption) {
  if (!opt.usable) { toast(opt.reason ?? 'Not available'); return; }
  const slots = opt.slots ?? [];
  app.ui.pending = { key: opt.key, slot: slots.length ? slots[0] : undefined, meta: [] };
  const needsTarget = ['enemy', 'ally', 'rank', 'fallenAlly'].includes(opt.target);
  const ctx = ctxOrNull()!;
  const legal = legalTargets(ctx, opt.target, !!opt.melee);
  if (slots.length) app.ui.pending.slot = 2;
  if (!needsTarget && slots.length <= 1) { act(opt, []); return; }
  if (needsTarget && legal.length === 1 && slots.length <= 1) { act(opt, [legal[0].id]); return; }
  render();
}


function pendingOpt(): ActionOption | undefined {
  const ctx = ctxOrNull();
  if (!ctx || !app.ui.pending) return undefined;
  return listActions(ctx).find((o) => o.key === app.ui.pending!.key);
}

function clickTarget(c: Combatant) {
  const opt = pendingOpt();
  if (!opt) return;
  const ctx = ctxOrNull()!;
  if (!legalTargets(ctx, opt.target, !!opt.melee).some((x) => x.id === c.id)) { toast('Not a legal target.'); return; }
  act(opt, [c.id]);
}

// ── battlefield ─────────────────────────────────────────────────────────────

function enemyEl(c: Combatant, targetable: boolean): HTMLElement {
  const def = MONSTERS[c.refId];
  const tier = tierIndex(c.level);
  const tele = c.mon?.telegraphed ? c.mon.actions.find((a) => a.id === c.mon!.telegraphed)?.name : undefined;
  return h('div', {
    class: `enemy ${c.mon?.boss ? 'boss' : ''} ${c.mon?.elite ? 'elite' : ''} tier${tier} ${targetable ? 'targetable' : ''} ${c.dead ? 'dead' : ''}`,
    'data-cid': c.id, tabindex: targetable ? 0 : -1, role: targetable ? 'button' : undefined,
    'aria-label': `${c.name}, ${c.hp} of ${c.maxHp} HP${targetable ? ' — target' : ''}`,
    title: `${c.name} — WS/BS ${c.mon?.ws}, WP ${c.mon?.wp}, Armour ${c.mon?.ap}, TB ${c.mon?.tb}${c.mon?.dodge ? `, Dodge ${c.mon.dodge}` : ''}. ${def?.flavor ?? ''}${c.mon?.resist.length ? ` Resists ${c.mon.resist.join(', ')}.` : ''}${c.mon?.vuln.length ? ` Weak to ${c.mon.vuln.join(', ')}.` : ''}${c.mon?.fear ? ` Fear ${c.mon.fear}.` : ''}`,
    on: targetable ? { click: () => clickTarget(c), keydown: (e: Event) => { if ((e as KeyboardEvent).key === 'Enter') clickTarget(c); } } : undefined,
  },
    tele ? h('span', { class: 'tele' }, `⚠ ${tele}`) : null,
    h('div', { class: 'sprite' }, combatantArt(c)),
    h('div', { class: 'ename' }, c.name),
    hpBar(c.hp, c.maxHp, c.tempHp),
    h('span', { class: 'hpnum' }, `${fmt(c.hp)} / ${fmt(c.maxHp)}`),
    conds(c.conditions, 'enemy'));
}

function heroEl(c: Combatant, active: boolean, targetable: boolean): HTMLElement {
  const g = app.game!;
  const hero = g.roster.find((x) => x.id === c.refId)!;
  return h('div', {
    class: `hero-slot ${active ? 'active' : ''} ${c.rank} ${c.downed || c.dead ? 'down' : ''} ${targetable ? 'targetable' : ''}`,
    'data-cid': c.id, tabindex: targetable ? 0 : -1,
    on: { click: () => (targetable ? clickTarget(c) : (app.ui.heroSheet = hero.id, render())) },
  },
    h('span', { class: 'rank-tag' }, c.rank === 'front' ? 'Front' : 'Back'),
    h('div', { class: 'portrait' }, combatantArt(c)),
    h('div', { class: 'grow col', style: 'gap:2px;min-width:0' },
      h('b', { class: 'small', style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.name),
      hpBar(c.hp, c.maxHp, c.tempHp),
      h('span', { class: 'hpnum' }, c.dead ? 'DEAD' : c.downed ? (c.stable ? 'Down · stable' : `Down · Blood loss ${c.crit}/3`) : `${c.hp}/${c.maxHp}${c.tempHp ? ` +${c.tempHp} ward` : ''}`),
      slotsLine(hero.id),
      conds(c.conditions, 'hero')));
}

function slotsLine(heroId: string): HTMLElement | null {
  const hero = app.game!.roster.find((x) => x.id === heroId)!;
  return h('span', { class: 'small muted', style: 'font-size:11px' }, `Fate ${hero.fate}${hero.lordCaptain ? ' · ⚜ Lord-Captain' : ''}`);
}

// ── the felt ────────────────────────────────────────────────────────────────

function trayEl(): HTMLElement {
  const g = app.game!;
  const exp = g.expedition!;
  const ctx = ctxOrNull()!;
  const f = exp.fortune;
  const turn = ctx.combat.turn;
  const actor = current(ctx);
  const hero = actor && g.roster.find((x) => x.id === actor.refId);
  // A selection belongs to the hero who made it: never hand it to the next actor.
  if (app.ui.selFor !== actor?.id) { app.ui.selected = []; app.ui.selFor = actor?.id; }
  const sel = app.ui.selected.filter((i) => f.tray[i]);
  // The roll animation is one-shot: consume it so later renders (a die click,
  // a menu change) don't replay it on dice that were rolled earlier.
  const rolling = app.ui.rolling;
  app.ui.rolling = new Set();
  let preview: ReturnType<typeof previewHand> | null = null;
  if (sel.length && hero) {
    preview = previewHand({ run: f, trayIndices: sel.slice(0, 5), actor: { careerId: hero.careerId, level: hero.level, hpFrac: actor!.hp / actor!.maxHp, affinity: CLASS_MATERIAL[hero.careerId] }, action: 'attack', base: 0, baseLabel: 'Action', rng: new Rng([1, 2, 3, 4]), firstHand: ctx.combat.handsThisCombat === 0, marked: false, enemiesAlive: 2, curse: ctx.combat.curse });
  }
  const talents = turn ? listTalents(ctx) : [];
  const playsLeft = turn ? turn.plays - turn.playsUsed : 0;
  const nb = hero?.careerId === 'astropath' || hero?.talents.includes('foresight') ? nextBagDie(ctx) : undefined;
  const nbDie = nb ? f.bag.find((d) => d.uid === nb) : undefined;
  const talentBtn = (t: (typeof talents)[number]) => {
    const one = sel.length === 1 ? sel[0] : undefined;
    const go = (extra: { value?: number; delta?: 1 | -1 } = {}) => {
      const r = run({ type: 'combat', cmd: { type: 'talent', id: t.id, die: one, ...extra } });
      if (r.ok) { sfx.roll(1); app.ui.selected = []; app.ui.talent = undefined; render(); }
    };
    if (t.needs === 'dieDelta') return h('span', { class: 'row', style: 'gap:2px' }, btn(`${t.name} −1`, () => (one === undefined ? toast('Select one die.') : go({ delta: -1 })), { cls: 'small', disabled: !t.usable, title: t.reason ?? t.text }), btn('+1', () => (one === undefined ? toast('Select one die.') : go({ delta: 1 })), { cls: 'small', disabled: !t.usable }));
    if (t.needs === 'dieValue') {
      if (app.ui.talent?.id === t.id) return h('span', { class: 'row', style: 'gap:2px' }, h('span', { class: 'small' }, 'Value:'), ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => btn(String(v), () => (one === undefined ? toast('Select one die.') : go({ value: v })), { cls: 'small' })), btn('✕', () => { app.ui.talent = undefined; render(); }, { cls: 'small' }));
      return btn(t.name, () => { app.ui.talent = { id: t.id, needs: t.needs }; render(); }, { cls: 'small', disabled: !t.usable, title: t.reason ?? t.text });
    }
    return btn(t.name, () => (t.needs === 'die' && one === undefined ? toast('Select one die.') : go()), { cls: 'small', disabled: !t.usable, title: t.reason ?? t.text });
  };
  const tokenBtn = (id: string) => {
    const one = sel.length === 1 ? sel[0] : undefined;
    if (id === 'fateCoin' && app.ui.talent?.id === 'token:fateCoin') {
      return h('span', { class: 'row', style: 'gap:2px' }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => btn(String(v), () => { if (one === undefined) { toast('Select one die.'); return; } const r = run({ type: 'combat', cmd: { type: 'token', id, die: one, value: v } }); if (r.ok) { app.ui.talent = undefined; app.ui.selected = []; sfx.coin(); render(); } }, { cls: 'small' })));
    }
    return h('button', { class: 'token', title: `${TOKENS[id].name}: ${TOKENS[id].text}`, 'aria-label': TOKENS[id].name, on: { click: () => {
      if (!turn) return;
      if (id === 'fateCoin') { app.ui.talent = { id: 'token:fateCoin', needs: 'dieValue' }; render(); return; }
      const r = run({ type: 'combat', cmd: { type: 'token', id } });
      if (r.ok) { sfx.coin(); if (id === 'mulligan') { app.ui.rolling = new Set(f.tray.map((_, i) => i)); sfx.roll(7); } render(); }
    } } }, TOKEN_GLYPH[id] ?? '¤');
  };
  const curse = ctx.combat.curse ? CURSES[ctx.combat.curse] : undefined;
  return h('div', { class: 'felt', 'aria-label': 'Fortune tray' },
    h('div', { class: 'felt-head' },
      h('div', { class: 'hand-name' }, preview ? HAND_BY_ID[preview.hand].name : sel.length ? '' : 'Select dice', h('small', null, preview ? `Lv ${preview.handLevel} · ${preview.scoringDice.length} scoring${preview.fury ? ` · ${preview.fury}× Righteous Fury` : ''}` : `Play up to ${turn?.playLimit ?? 5} with an action`)),
      h('div', { class: 'score-box', 'aria-live': 'polite' },
        h('span', { class: 'chips-box', title: 'Chips: your action\'s base damage is added here' }, preview ? `+${preview.chips}` : '—'),
        h('span', { class: 'score-x' }, '×'),
        h('span', { class: 'mult-box', title: 'Mult' }, preview ? preview.mult : '—')),
      h('span', { class: 'spacer' }),
      h('span', { class: 'rerolls' }, 'Rerolls ', h('b', null, f.rerollsLeft)),
      h('span', { class: 'rerolls' }, 'Plays ', h('b', null, playsLeft)),
      doubloons(f.doubloons)),
    h('div', { class: 'dice-row' }, ...f.tray.map((td, i) => trayDie(f, td, i, sel.includes(i), rolling.has(i), () => toggleDie(i)))),
    h('div', { class: 'tray-actions' },
      btn(['Reroll selected ', h('span', { class: 'kbd' }, 'R')], doReroll, { disabled: !turn || !sel.length || f.rerollsLeft <= 0, key: 'reroll' }),
      btn('Clear', () => { app.ui.selected = []; render(); }, { cls: 'small', disabled: !sel.length }),
      ...talents.map(talentBtn),
      ...f.tokens.map(tokenBtn),
      nbDie ? h('span', { class: 'small', style: 'color:#b9e2cc' }, `Next in bag: ${MATERIALS[nbDie.material].name} [${nbDie.faces.map((x) => x.v).join(' ')}]`) : null,
      curse ? h('span', { class: 'small', style: 'color:#ffb3ad' }, `Curse: ${curse.text}`) : null),
    h('div', { class: 'charm-bar', style: 'margin-top:10px' },
      ...f.charms.map((c) => charmEl(c.id, c.counter)),
      ...Array.from({ length: Math.max(0, charmSlots(f) - f.charms.length) }, () => h('div', { class: 'charm empty', title: 'Empty relic slot' }))));
}

// ── command panel ───────────────────────────────────────────────────────────

function commandEl(): HTMLElement {
  const g = app.game!;
  const ctx = ctxOrNull()!;
  const actor = current(ctx);
  const turn = ctx.combat.turn;
  const timeline = h('div', { class: 'timeline', 'aria-label': 'Turn order' }, ...ctx.combat.order.map((id) => ctx.combat.combatants[id]).filter((c) => !c.dead).map((c) =>
    h('div', { class: `tl ${c.id === actor?.id ? 'now' : ''} ${c.side === 'enemy' ? 'enemy-t' : ''}`, title: c.name }, combatantArt(c))));
  if (!turn || !actor || actor.side !== 'hero') {
    return h('div', { class: 'command' }, h('div', { class: 'win' }, timeline, h('p', { class: 'muted' }, ctx.combat.status === 'active' ? 'The enemy acts…' : '')), logWin());
  }
  const opts = listActions(ctx);
  const pending = pendingOpt();
  const menu = app.ui.menu;
  let body: HTMLElement;
  if (pending) {
    const slots = pending.slots ?? [];
    const needsTarget = ['enemy', 'ally', 'rank', 'fallenAlly'].includes(pending.target);
    body = h('div', { class: 'col' },
      h('b', null, pending.name),
      h('div', { class: 'opt-detail' }, pending.text, pending.chance !== undefined ? ` (${pending.chance}% at Unfettered)` : ''),
      slots.length > 1 ? h('div', { class: 'row' }, h('span', { class: 'small' }, 'Psychic strength:'), ...slots.map((s) => btn(STRENGTH_NAMES[s], () => { app.ui.pending!.slot = s; render(); }, { cls: `small ${app.ui.pending!.slot === s ? 'on' : ''}`, title: s === 1 ? 'Half Psy Rating; never causes Phenomena.' : s === 2 ? 'Full Psy Rating; doubles on the Test cause Phenomena.' : '+3 Psy Rating; always causes Phenomena.' }))) : null,
      pending.fortune !== 'none' ? h('div', { class: 'small', style: 'color:#b9e2cc' }, app.ui.selected.length ? `Playing ${app.ui.selected.length} dice with this.` : 'No dice selected — base effect only.') : null,
      needsTarget ? h('div', { class: 'target-hint' }, pending.target === 'rank' ? 'Click a foe to strike its whole rank.' : pending.target === 'enemy' ? 'Click a foe.' : 'Click an ally.')
        : btn(pending.group === 'magic' ? 'Manifest' : 'Confirm', () => act(pending, []), { cls: 'primary', key: 'confirm-act' }),
      btn('Back', () => { app.ui.pending = undefined; render(); }, { cls: 'small' }));
  } else if (menu === 'root') {
    body = h('div', { class: 'cmd-tabs', role: 'menu' }, ...MENU.map(([id, name], i) => {
      const n = opts.filter((o) => o.group === id && o.usable).length;
      return btn([name, ' ', h('span', { class: 'kbd' }, 'ABCDG'[i]), n ? '' : h('span', { class: 'small muted' }, ' —')], () => { app.ui.menu = id; render(); }, { key: `menu-${id}`, disabled: !opts.some((o) => o.group === id) });
    }), btn(['End turn ', h('span', { class: 'kbd' }, 'E')], endTurn, { key: 'end-turn' }));
  } else {
    const list = opts.filter((o) => o.group === menu);
    body = h('div', { class: 'col' },
      h('div', { class: 'opt-list', role: 'menu' }, ...list.map((o) => btn([h('span', null, o.name), h('span', { class: 'cost' }, `${o.cost}${o.chance !== undefined ? ` · ${o.chance}%` : ''}${o.fortune !== 'none' ? ' · 🎲' : ''}`)], () => chooseOption(o), { disabled: !o.usable, title: o.usable ? o.text : `${o.reason} — ${o.text}`, key: `opt-${o.key}` }))),
      h('div', { class: 'opt-detail' }, list.length ? 'Hover an option for details. 🎲 = uses your selected dice.' : 'Nothing here.'),
      btn('Back', () => { app.ui.menu = 'root'; render(); }, { cls: 'small', key: 'menu-back' }));
  }
  const used = actor.used.half >= 2 ? 'Full Action or two Half Actions ready' : actor.used.half === 1 ? 'One Half Action left' : 'No actions left';
  return h('div', { class: 'command' },
    h('div', { class: 'win' }, timeline,
      h('h2', { style: 'margin-top:8px' }, actor.name), h('div', { class: 'small muted' }, used), h('div', { style: 'margin-top:8px' }, body)),
    logWin());
}

function logWin(): HTMLElement {
  const ctx = ctxOrNull()!;
  const el = h('div', { class: 'log', role: 'log', 'aria-live': 'polite', style: 'max-height:240px' }, ...ctx.combat.log.slice(-60).map((l) => h('div', { class: l.kind ?? '' }, l.t)));
  afterRender.push(() => { el.scrollTop = el.scrollHeight; });
  return h('div', { class: 'win' }, h('h3', null, 'Battle log'), el);
}

export function combatScreen(): HTMLElement {
  const g = app.game!;
  const exp = g.expedition!;
  const ctx = ctxOrNull()!;
  const combat = ctx.combat;
  const room = exp.map.rooms[combat.roomKey];
  const pending = pendingOpt();
  const legal = pending ? new Set(legalTargets(ctx, pending.target, !!pending.melee).map((c) => c.id)) : new Set<string>();
  const targetEnemies = pending && ['enemy', 'rank'].includes(pending.target);
  const targetAllies = pending && ['ally', 'fallenAlly'].includes(pending.target);
  const enemies = Object.values(combat.combatants).filter((c) => c.side === 'enemy');
  const heroes = exp.partyIds.map((id) => combat.combatants[id]).filter(Boolean);
  const actor = current(ctx);
  const curse = combat.curse ? CURSES[combat.curse] : undefined;
  const field = h('div', { class: 'battlefield', style: bgStyle(room?.art ?? '', `linear-gradient(160deg, ${BIOMES[exp.biome].color}44, #0b1230)`) },
    h('div', { class: 'col', style: 'align-items:center;gap:4px' },
      curse ? h('div', { class: 'curse-banner' }, `☠ ${curse.name}: ${curse.text}`) : null,
      combat.biomeNote ? h('div', { class: 'biome-note' }, combat.biomeNote) : null),
    h('div', { class: 'rank-row back' }, ...enemies.filter((e) => e.rank === 'back' && !e.dead).map((e) => enemyEl(e, !!targetEnemies && legal.has(e.id)))),
    h('div', { class: 'rank-row front' }, ...enemies.filter((e) => e.rank === 'front' && !e.dead).map((e) => enemyEl(e, !!targetEnemies && legal.has(e.id)))),
    h('div', { class: 'heroes-row' }, ...heroes.map((c) => heroEl(c, c.id === actor?.id, !!targetAllies && legal.has(c.id)))));
  afterRender.push(playFx);
  if (app.scoreQueue.length && !app.animating) afterRender.push(() => void playScores());
  return h('div', null,
    h('div', { class: 'topbar' },
      h('span', { class: 'title' }, combat.kind === 'boss' ? `${MONSTERS[enemies.find((e) => e.mon?.boss)?.refId ?? '']?.name ?? 'The region\'s lord'}` : combat.kind === 'elite' ? 'Elite fight' : combat.kind === 'ambush' ? 'Ambush!' : 'Combat'),
      h('span', { class: 'stat' }, `Round ${combat.round}`),
      h('span', { class: 'stat muted' }, `Depth ${exp.depth} · Rank ${exp.fortune.rank}`),
      h('span', { class: 'spacer' }),
      btn(g.settings.fast ? 'Fast: on' : 'Fast: off', () => { g.settings.fast = !g.settings.fast; render(); }, { cls: 'small' }),
      btn('How to play', () => { app.ui.modal = { kind: 'help' }; render(); }, { cls: 'small' }),
      btn('Dice bag', () => { app.ui.modal = { kind: 'bag' }; render(); }, { cls: 'small' })),
    h('div', { class: 'combat' }, field, h('div', { class: 'tray-wrap' }, trayEl()), commandEl()));
}

// ── effects ─────────────────────────────────────────────────────────────────

function playFx() {
  const exp = app.game?.expedition;
  const fxList = exp?.combat?.fx ?? [];
  if (!fxList.length) return;
  const step = app.game!.settings.fast ? 60 : 170;
  fxList.forEach((f, i) => {
    setTimeout(() => {
      const el = f.target ? document.querySelector(`[data-cid="${f.target}"]`) as HTMLElement | null : null;
      if (!el) return;
      const text = f.kind === 'miss' ? 'Miss' : f.kind === 'kill' ? '✖' : f.kind === 'down' ? 'Down!' : f.kind === 'hex' ? `Hex: ${f.text}` : f.kind === 'text' ? f.text ?? '' : fmt(f.amount ?? 0);
      const cls = f.kind === 'crit' ? 'crit' : f.kind === 'heal' ? 'heal' : f.kind === 'miss' ? 'miss' : f.kind === 'ward' ? 'ward' : f.kind === 'dmg' ? 'dmg' : 'text';
      const fl = h('div', { class: `floater ${cls}` }, f.kind === 'heal' ? `+${text}` : f.kind === 'ward' ? `+${text} ward` : text);
      el.appendChild(fl);
      if (f.kind === 'dmg' || f.kind === 'crit') { el.classList.add('shake'); sfx.hit(); }
      if (f.kind === 'miss') sfx.miss();
      if (f.kind === 'heal') sfx.heal();
      if (f.actor) document.querySelector(`[data-cid="${f.actor}"]`)?.classList.add('acting');
      setTimeout(() => fl.remove(), 1200);
    }, i * step);
  });
  exp!.combat!.fx = [];
}

async function playScores() {
  app.animating = true;
  while (app.scoreQueue.length) {
    const s = app.scoreQueue.shift()!;
    await animateScore(s);
  }
  app.animating = false;
}

async function animateScore(s: ScoreReport) {
  const chips = h('span', { class: 'chips-box' }, '0');
  const mult = h('span', { class: 'mult-box' }, '0');
  const step = h('div', { class: 'step' }, '');
  const total = h('div', { class: 'total' }, '');
  const card = h('div', { class: 'score-card' }, h('div', { class: 'hand-title' }, `${HAND_BY_ID[s.hand].name}${s.handLevel > 1 ? ` Lv ${s.handLevel}` : ''}`), h('div', { class: 'score-box' }, chips, h('span', { class: 'score-x' }, '×'), mult), step, total);
  const overlay = h('div', { class: 'score-overlay', 'aria-live': 'assertive' }, card);
  document.body.appendChild(overlay);
  let c = 0, m = 0;
  const bump = (el: HTMLElement) => { el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 90); };
  const per = Math.max(45, Math.min(130, 1300 / Math.max(1, s.steps.length)));
  let i = 0;
  for (const st of s.steps) {
    if (st.chips) { c += st.chips; chips.textContent = fmt(c); bump(chips); sfx.chip(i); }
    if (st.mult) { m += st.mult; mult.textContent = String(Math.round(m * 100) / 100); bump(mult); sfx.mult(i); }
    if (st.xmult) { m *= st.xmult; mult.textContent = String(Math.round(m * 100) / 100); bump(mult); sfx.xmult(); }
    if (st.doubloons) sfx.coin();
    step.textContent = `${st.label}${st.chips ? ` +${st.chips}` : ''}${st.mult ? ` +${st.mult} mult` : ''}${st.xmult ? ` ×${st.xmult} mult` : ''}${st.doubloons ? ` +${st.doubloons}¤` : ''}`;
    if (st.charm) document.querySelectorAll(`[data-charm="${st.charm}"]`).forEach((el) => { el.classList.remove('trig'); void (el as HTMLElement).offsetWidth; el.classList.add('trig'); });
    i++;
    await wait(per);
  }
  chips.textContent = fmt(s.chips);
  mult.textContent = String(s.mult);
  total.textContent = fmt(s.total);
  sfx.total();
  await wait(650);
  overlay.remove();
}

export function combatKeys(e: KeyboardEvent): boolean {
  const ctx = ctxOrNull();
  if (!ctx || ctx.combat.status !== 'active' || !ctx.combat.turn) return false;
  const k = e.key.toLowerCase();
  if (/^[0-9]$/.test(k)) { const i = k === '0' ? 9 : Number(k) - 1; if (ctx.exp.fortune.tray[i]) toggleDie(i); return true; }
  if (k === 'r') { doReroll(); return true; }
  if (k === 'e' && !app.ui.pending) { endTurn(); return true; }
  if (k === 'escape') { if (app.ui.pending) app.ui.pending = undefined; else app.ui.menu = 'root'; render(); return true; }
  const idx = 'abcdg'.indexOf(k);
  if (idx >= 0 && idx < MENU.length && !app.ui.pending) { app.ui.menu = MENU[idx][0]; render(); return true; }
  return false;
}
