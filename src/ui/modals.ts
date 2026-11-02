/** Overlays: explorer sheet, advancement, spoils, boons, trader, events, bag, results, game over, rules. */
import type { EquipSlot, BoonOffer } from '../engine/types.ts';
import { EQUIP_SLOTS, HIT_LOCS } from '../engine/types.ts';
import { h, btn, fmt } from './dom.ts';
import { app, run, render, toast, setGame } from './app.ts';
import { art, bgStyle } from './art.ts';
import { heroPortrait, heroLine, hpBar, boonCard, bagView, itemIcon, doubloons, charmEl, dieFace, charGrid } from './widgets.ts';
import { CAREERS, featuresUpTo, RANK_XP } from '../content/careers.ts';
import { itemName, ITEMS } from '../content/items.ts';
import { ORIGIN_BY_ID, ROW_NAMES } from '../content/origins.ts';
import { SKILLS } from '../content/skills.ts';
import { TALENTS } from '../content/talents.ts';
import { POWERS, MASTERY } from '../content/powers.ts';
import { derive, xpAvailable, originOutcome, originOptsOf } from '../rules/character.ts';
import { listAdvances, boonOptions, boonsAvailable } from '../rules/advance.ts';
import { canEquip } from '../meta/town.ts';
import { offerNeedsTarget } from '../fortune/boons.ts';
import { charmSlots } from '../fortune/tray.ts';
import { CHARM_BY_ID } from '../fortune/charms.ts';
import { HANDS } from '../fortune/hands.ts';
import { EVENTS } from '../content/events.ts';
import { eventOptions } from '../dungeon/explore.ts';
import { BIOMES } from '../content/biomes.ts';
import { itemSummary, SLOT_NAMES } from './town.ts';
import { sfx } from './audio.ts';
import { CHAPTERS, EPILOGUE, type Chapter } from '../content/story.ts';
import { openShareCard } from './shareCard.ts';
import { restartTutorial } from './tutorial.ts';
import { LOC_NAME } from '../engine/dice.ts';
import { deleteSlot } from '../persistence/save.ts';
import { start, refreshSlots } from './title.ts';

function modal(content: (HTMLElement | null)[], opts: { narrow?: boolean; onClose?: () => void; label: string }): HTMLElement {
  return h('div', { class: 'modal-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.label, on: { click: (e: Event) => { if (e.target === e.currentTarget && opts.onClose) opts.onClose(); } } },
    h('div', { class: `win modal ${opts.narrow ? 'narrow' : ''}` }, ...content));
}

// ── explorer sheet ──────────────────────────────────────────────────────────

export function heroSheet(id: string): HTMLElement {
  const g = app.game!;
  const recruit = id.startsWith('recruit:');
  const hero = recruit ? g.recruits[Number(id.split(':')[1])] : g.roster.find((x) => x.id === id)!;
  const close = () => { app.ui.heroSheet = undefined; render(); };
  if (!hero) { app.ui.heroSheet = undefined; return h('div'); }
  const d = derive(hero);
  const career = CAREERS[hero.careerId];
  const inDungeon = !!g.expedition;
  const editable = !recruit && !inDungeon && hero.status === 'alive';
  const feats = featuresUpTo(hero.careerId, d.rank);
  const vaultFor = (slot: EquipSlot) => g.vault.filter((it) => !canEquip(hero, it, slot));
  const path = [hero.origin.homeWorld, hero.origin.birthright, hero.origin.lure, hero.origin.trial, hero.origin.motivation];
  const traits = originOutcome(path, originOptsOf(hero)).traits;
  const nextRank = RANK_XP[d.rank + 1];
  const w = d.main;
  return modal([
    h('div', { class: 'sheet' },
      h('div', { class: 'col' }, heroPortrait(hero, 'lg'), h('b', null, hero.name), h('span', { class: 'small muted' }, heroLine(hero)),
        h('span', { class: 'small' }, career.tagline),
        h('span', { class: 'small muted' }, `${hero.xp.toLocaleString()} xp · ${xpAvailable(hero)} to spend${nextRank ? ` · Rank ${d.rank + 1} at ${nextRank.toLocaleString()}` : ''}`),
        h('span', { class: 'small muted' }, hero.look ?? '')),
      h('div', { class: 'col' },
        h('div', { class: 'row' }, h('span', null, `Wounds ${hero.hp}/${d.maxHp}`), h('span', null, `Fate ${hero.fate}/${d.fateMax}`), h('span', null, `Insanity ${hero.insanity}`), h('span', null, `Corruption ${hero.corruption}`), h('span', null, `Initiative +${d.init}`),
          d.psyRating ? h('span', null, `Psy Rating ${d.psyRating}`) : null),
        hpBar(hero.hp, d.maxHp),
        charGrid(d.chars, { base: hero.base }),
        h('div', { class: 'small' }, h('b', null, 'Armour: '), HIT_LOCS.map((l) => `${LOC_NAME[l]} ${d.ap[l]}`).join(', '), d.field ? ` · force field ${d.field}` : ''),
        h('div', { class: 'small' }, h('b', null, 'Attack: '), `${w.name} — ${w.ranged ? 'BS' : 'WS'} ${w.ranged ? d.chars.BS : d.chars.WS}${w.hit ? ` ${w.hit > 0 ? '+' : ''}${w.hit}` : ''}, ${w.dice}${w.bonus ? `${w.bonus > 0 ? '+' : ''}${w.bonus}` : ''} ${w.type}, Pen ${w.pen}${w.ranged ? `, RoF ${w.rof.map((x, i) => (x ? (i === 0 ? 'S' : x) : '–')).join('/')}` : ''}${w.qualities.length ? ` (${w.qualities.join(', ')})` : ''}${w.trained ? '' : ' — untrained, -20'}${d.meleeAttacks > 1 ? ` · ${d.meleeAttacks} melee attacks` : ''}`),
        h('div', { class: 'small' }, h('b', null, 'Reactions: '), `Dodge ${d.dodge}% · Parry ${d.parry}%`),
        h('div', { class: 'small' }, h('b', null, 'Fortune talent: '), `${career.fortuneTalent.name} — ${career.fortuneTalent.text}`, h('span', { class: 'impl adapted' }, 'adapted')),
        h('div', { class: 'small' }, h('b', null, 'Skills: '), Object.entries(hero.skills).map(([k, v]) => `${SKILLS[k as keyof typeof SKILLS].name}${v ? ` +${v}` : ''} (${d.skills[k as keyof typeof SKILLS]}%)`).join(', ')),
        h('div', { class: 'small' }, h('b', null, 'Talents: '), [...new Set(hero.talents)].map((t) => `${TALENTS[t]?.name ?? t}${t === 'soundConstitution' ? ` ×${hero.talents.filter((x) => x === t).length}` : ''}`).join(', ')),
        Object.keys(hero.powers).length ? h('div', { class: 'small' }, h('b', null, 'Powers: '), Object.entries(hero.powers).map(([p, m]) => `${POWERS[p]?.name}${POWERS[p]?.discipline === 'Navigator' ? ` (${MASTERY[m]})` : ''}`).join(', ')) : null,
      )),
    h('h3', { style: 'margin-top:12px' }, 'Origin Path'),
    h('div', { class: 'small' }, ...path.map((pid, i) => h('div', null, h('b', null, `${ROW_NAMES[i]}: `), ORIGIN_BY_ID[pid]?.name ?? pid))),
    traits.length ? h('div', { class: 'small muted', style: 'margin-top:4px' }, traits.map(([n, t]) => `${n} — ${t}`).join(' · ')) : null,
    h('h3', { style: 'margin-top:12px' }, 'Equipment'),
    h('div', { class: 'list' }, ...EQUIP_SLOTS.map((slot) => {
      const it = hero.equipment[slot];
      const opts = editable ? vaultFor(slot) : [];
      return h('div', { class: 'item-row' }, it ? itemIcon(it.defId) : h('div', { class: 'icon' }),
        h('div', { class: 'grow' }, h('span', { class: 'small muted' }, SLOT_NAMES[slot]), h('div', null, it ? itemName(it) : '—'), it ? h('div', { class: 'small muted' }, itemSummary(it.defId, it)) : null),
        editable && opts.length ? h('select', { class: 'sel-in', 'aria-label': `Equip ${SLOT_NAMES[slot]}`, on: { change: (e: Event) => { const v = (e.target as HTMLSelectElement).value; if (v) run({ type: 'equip', heroId: hero.id, uid: v, slot }); } } },
          h('option', { value: '' }, 'Equip…'), ...opts.map((o) => h('option', { value: o.uid }, itemName(o)))) : null,
        editable && it ? btn('Remove', () => run({ type: 'unequip', heroId: hero.id, slot }), { cls: 'small' }) : null);
    })),
    h('h3', { style: 'margin-top:12px' }, 'Career features'),
    h('div', null, ...feats.filter((f) => f.id !== 'rankBoon').map((f) => h('div', { class: 'feat' }, h('b', null, f.name), h('span', { class: `impl ${f.impl}` }, f.impl), ' — ', f.text))),
    h('div', { class: 'row', style: 'margin-top:12px' },
      editable ? btn('Advance', () => { app.ui.heroSheet = undefined; app.ui.advance = hero.id; render(); }, { cls: 'primary' }) : null,
      editable && !hero.lordCaptain ? btn('Dismiss', () => { if (confirm(`Dismiss ${hero.name}? Their gear goes to the Hold.`)) { run({ type: 'retire', heroId: hero.id }); close(); } }, { cls: 'small danger' }) : null,
      h('span', { class: 'spacer' }), btn('Close', close, { key: 'close-sheet' })),
  ], { label: `${hero.name}'s sheet`, onClose: close });
}

// ── advancement ─────────────────────────────────────────────────────────────

let advTab = 'char';

export function advanceModal(id: string): HTMLElement {
  const g = app.game!;
  const hero = g.roster.find((x) => x.id === id);
  const close = () => { app.ui.advance = undefined; render(); };
  if (!hero) { app.ui.advance = undefined; return h('div'); }
  const d = derive(hero);
  const opts = listAdvances(hero);
  const boons = boonsAvailable(hero);
  const kinds: [string, string][] = [['char', 'Characteristics'], ['skill', 'Skills'], ['talent', 'Talents'], ['power', CAREERS[hero.careerId].psyker || CAREERS[hero.careerId].navigator ? 'Powers' : '']];
  const shown = opts.filter((o) => (advTab === 'power' ? o.kind === 'power' || o.kind === 'mastery' : o.kind === advTab));
  const buy = (advId: string, boon = false) => { const r = run({ type: 'advance', heroId: hero.id, advId, boon }); if (r.ok) sfx.coin(); };
  return modal([
    h('div', { class: 'row' }, heroPortrait(hero, 'lg'), h('div', { class: 'grow' }, h('h2', null, `${hero.name} — Advancement`),
      h('p', { class: 'small muted' }, `${heroLine(hero)} · ${xpAvailable(hero)} xp to spend · power level ${hero.level}`),
      charGrid(d.chars, { compact: true }))),
    boons ? h('div', { class: 'win', style: 'margin-top:8px' }, h('h3', null, `Rank Boon: choose a free Talent (${boons})`),
      h('div', { class: 'col' }, ...boonOptions(hero).map((o) => btn([h('b', null, o.label), h('span', { class: 'small muted' }, ` — ${o.text}`)], () => buy(o.id, true), { cls: 'small' })))) : null,
    h('div', { class: 'row', style: 'margin-top:8px' }, ...kinds.filter(([, n]) => n).map(([k, n]) => btn(n, () => { advTab = k; render(); }, { cls: `small ${advTab === k ? 'on' : ''}` })),
      h('span', { class: 'spacer' }), btn('Spend as recommended', () => { run({ type: 'autoAdvance', heroId: hero.id }); sfx.fanfare(); }, { cls: 'small' })),
    h('div', { class: 'list', style: 'margin-top:8px' }, ...shown.map((o) => h('div', { class: 'item-row' },
      h('div', { class: 'grow' }, h('b', null, o.label), h('div', { class: 'small muted' }, o.text)),
      h('span', { class: 'small gold' }, `${o.cost} xp`),
      btn('Buy', () => buy(o.id), { cls: 'small primary', disabled: !o.ok, title: o.reason }))),
      shown.length ? null : h('p', { class: 'muted' }, 'Nothing more to learn here.')),
    h('div', { class: 'row', style: 'margin-top:12px' }, h('span', { class: 'spacer' }), btn('Done', close, { cls: 'primary', key: 'adv-done' })),
  ], { label: 'Advancement', onClose: close });
}

// ── Fortress overlays ───────────────────────────────────────────────────────

export function spoilsModal(): HTMLElement {
  const exp = app.game!.expedition!;
  const s = exp.spoils!;
  return modal([
    h('h2', { class: 'result-big gold' }, s.kind === 'boss' ? 'The region\'s lord is dead!' : 'Victory!'),
    h('div', { class: 'col', style: 'align-items:center;margin:10px 0' },
      h('div', { class: 'row' }, h('span', { class: 'coin' }), h('b', { class: 'gold' }, `+${s.gold} Thrones`), h('span', { class: 'small muted' }, '(carried — bank it by getting out alive)')),
      h('div', { class: 'row' }, 'Scrip: ', h('b', { class: 'gold' }, `+${s.doubloons}`), ' + interest ', h('b', { class: 'gold' }, `+${s.interest}`), s.charmBonus ? [' + relics ', h('b', { class: 'gold' }, `+${s.charmBonus}`)] : null),
      h('div', { class: 'small' }, `+${s.xp} xp toward the venture`),
      ...s.items.map((i) => h('div', null, 'Found: ', h('b', null, i))),
      h('div', { class: 'result-big', style: 'font-size:28px;margin-top:8px' }, `Fortune Rank ${s.rank}`),
      h('p', { class: 'small muted' }, s.rank % 3 === 0 ? 'A milestone rank: choose a permanent upgrade for this venture.' : 'Choose a boon for this venture.')),
    h('div', { class: 'row', style: 'justify-content:center' }, btn('Claim', () => { sfx.coin(); run({ type: 'closeSpoils' }); }, { cls: 'primary big', key: 'claim' })),
  ], { narrow: true, label: 'Victory' });
}

let replacing: { purpose: 'boon' | 'shop'; idx: number } | null = null;

export function boonsModal(): HTMLElement {
  const exp = app.game!.expedition!;
  const b = exp.boons!;
  if (app.ui.bagPick?.purpose === 'boon') return bagPickModal();
  if (replacing?.purpose === 'boon') return replaceModal();
  return modal([
    h('h2', null, b.picks > 1 ? `Choose ${b.picks} boons` : 'Choose a boon'),
    h('div', { class: 'row small muted' }, `Relics ${exp.fortune.charms.length}/${charmSlots(exp.fortune)}`, doubloons(exp.fortune.doubloons)),
    h('div', { class: 'boons', style: 'margin:10px 0' }, ...b.offers.map((o, i) => boonCard(o, () => pickOffer('boon', o, i)))),
    h('div', { class: 'row' }, h('span', { class: 'spacer' }), btn('Skip (+2 scrip)', () => run({ type: 'skipBoon' }))),
  ], { label: 'Choose a boon' });
}

function pickOffer(purpose: 'boon' | 'shop', o: BoonOffer, i: number) {
  const exp = app.game!.expedition!;
  if (o.kind === 'charm' && exp.fortune.charms.length >= charmSlots(exp.fortune)) { replacing = { purpose, idx: i }; render(); return; }
  if (offerNeedsTarget(o)) { app.ui.bagPick = { purpose, idx: i }; render(); return; }
  const r = run(purpose === 'boon' ? { type: 'pickBoon', idx: i } : { type: 'shopBuy', idx: i });
  if (r.ok) sfx.coin();
}

function replaceModal(): HTMLElement {
  const exp = app.game!.expedition!;
  const rp = replacing!;
  const cancel = () => { replacing = null; render(); };
  return modal([
    h('h2', null, 'Your relic slots are full'),
    h('p', { class: 'prose' }, 'Choose a relic to discard for the new one.'),
    h('div', { class: 'charm-bar' }, ...exp.fortune.charms.map((c, i) => h('button', { class: 'btn', on: { click: () => {
      const r = run(rp.purpose === 'boon' ? { type: 'pickBoon', idx: rp.idx, replaceCharm: i } : { type: 'shopBuy', idx: rp.idx, replaceCharm: i });
      if (r.ok) { replacing = null; render(); }
    } } }, charmEl(c.id, c.counter), h('div', { class: 'small' }, CHARM_BY_ID[c.id]?.name)))),
    h('div', { class: 'row' }, h('span', { class: 'spacer' }), btn('Cancel', cancel)),
  ], { narrow: true, label: 'Replace a relic', onClose: cancel });
}

function bagPickModal(): HTMLElement {
  const exp = app.game!.expedition!;
  const bp = app.ui.bagPick!;
  const offers = bp.purpose === 'boon' ? exp.boons?.offers : bp.purpose === 'shop' ? exp.shop?.offers : undefined;
  const o = offers?.[bp.idx];
  const needFace = !!o && offerNeedsTarget(o) === 'face';
  const cancel = () => { app.ui.bagPick = undefined; render(); };
  const commit = (uid: string, face?: number) => {
    if (bp.purpose === 'sacrifice') { const r = run({ type: 'sacrifice', dieUid: uid }); if (r.ok) cancel(); return; }
    if (needFace && face === undefined) { app.ui.bagPick = { ...bp, die: uid }; render(); return; }
    const r = run(bp.purpose === 'boon' ? { type: 'pickBoon', idx: bp.idx, dieUid: uid, face } : { type: 'shopBuy', idx: bp.idx, dieUid: uid, face });
    if (r.ok) { sfx.coin(); app.ui.bagPick = undefined; render(); }
  };
  return modal([
    h('h2', null, bp.purpose === 'sacrifice' ? 'Offer a die to the black altar' : needFace ? 'Choose a face to sanctify' : 'Choose a die'),
    h('p', { class: 'small muted' }, needFace ? 'Click a face on any die.' : 'Click a die.'),
    bagView(exp.fortune, commit, { pickFace: needFace, sel: bp.die }),
    h('div', { class: 'row', style: 'margin-top:10px' }, h('span', { class: 'spacer' }), btn('Cancel', cancel)),
  ], { label: 'Pick a die', onClose: cancel });
}

export function lootChoiceModal(): HTMLElement {
  const exp = app.game!.expedition!;
  return modal([
    h('h2', null, 'The lord\'s hoard — take one'),
    h('div', { class: 'list' }, ...exp.lootChoice!.items.map((it, i) => h('div', { class: 'item-row' }, itemIcon(it.defId),
      h('div', { class: 'grow' }, h('b', null, itemName(it)), h('div', { class: 'small muted' }, itemSummary(it.defId, it))),
      btn('Take', () => { sfx.coin(); run({ type: 'pickLoot', idx: i }); }, { cls: 'primary small' })))),
  ], { label: 'Choose loot' });
}

export function shopModal(): HTMLElement {
  const exp = app.game!.expedition!;
  const shop = exp.shop!;
  if (app.ui.bagPick?.purpose === 'shop') return bagPickModal();
  if (replacing?.purpose === 'shop') return replaceModal();
  return modal([
    h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'The Scavenger'), doubloons(exp.fortune.doubloons)),
    h('p', { class: 'prose' }, '"Relics, dice, tarot — all of it lucky, most of it not stolen. Scrip only. Thrones are no good in here."'),
    h('div', { class: 'boons', style: 'margin:10px 0' }, ...shop.offers.map((o, i) => boonCard(o, () => pickOffer('shop', o, i), { price: o.price, afford: (o.price ?? 0) <= exp.fortune.doubloons, disabled: (o.price ?? 0) > exp.fortune.doubloons }))),
    h('h3', null, 'Sell a relic (half price)'),
    h('div', { class: 'charm-bar' }, ...exp.fortune.charms.map((c, i) => h('button', { class: 'btn small', on: { click: () => { if (confirm(`Sell ${CHARM_BY_ID[c.id]?.name}?`)) run({ type: 'sellCharm', idx: i }); } } }, charmEl(c.id, c.counter)))),
    h('div', { class: 'row', style: 'margin-top:10px' }, btn(`New stock (${shop.rerollCost})`, () => run({ type: 'shopReroll' }), { disabled: exp.fortune.doubloons < shop.rerollCost }), h('span', { class: 'spacer' }), btn('Leave', () => run({ type: 'shopClose' }), { cls: 'primary', key: 'leave-shop' })),
  ], { label: 'Scavenger', onClose: () => run({ type: 'shopClose' }) });
}

export function eventModal(): HTMLElement {
  const exp = app.game!.expedition!;
  const ev = EVENTS[exp.event!.eventId];
  if (exp.event!.stage === 'pickDie') {
    app.ui.bagPick = { purpose: 'sacrifice', idx: 0 };
    return bagPickModal();
  }
  if (exp.event!.stage === 'result') {
    return modal([h('h2', null, ev.title), h('div', { class: 'col prose' }, ...(exp.event!.result ?? []).map((l) => h('p', { style: 'margin:0' }, l))),
      h('div', { class: 'row', style: 'margin-top:10px' }, h('span', { class: 'spacer' }), btn('Continue', () => run({ type: 'eventClose' }), { cls: 'primary', key: 'ev-continue' }))], { narrow: true, label: ev.title });
  }
  const opts = eventOptions(app.game!);
  return modal([
    h('h2', null, ev.title),
    h('p', { class: 'prose' }, ev.text),
    h('div', { class: 'menu' }, ...opts.map((o, i) => {
      let detail = '';
      if (o.check && o.best) detail = `${o.checkName} Test${o.check.mod ? ` (${o.check.mod > 0 ? '+' : ''}${o.check.mod})` : ''} — ${o.best.hero.name}, ${Math.max(0, Math.min(99, o.target))}% chance`;
      if (o.cost?.gold) detail += ` · costs ${o.cost.gold} Thrones`;
      if (o.cost?.doubloons) detail += ` · costs ${o.cost.doubloons} scrip`;
      return h('div', { class: 'col', style: 'gap:2px' },
        btn([o.label, detail ? h('div', { class: 'small muted' }, detail) : null, !o.usable ? h('div', { class: 'small danger' }, o.reason) : null], () => { sfx.select(); run({ type: 'eventChoice', idx: i }); }, { disabled: !o.usable, key: `ev${i}` }),
        o.helper && o.check ? btn(`…or ${o.helper.hero.name} uses ${o.helper.how} (automatic success)`, () => run({ type: 'eventChoice', idx: i, useHelper: true }), { cls: 'small', disabled: !o.usable }) : null);
    })),
    h('div', { class: 'row', style: 'margin-top:10px' }, h('span', { class: 'spacer' }), btn('Decide later', () => run({ type: 'eventClose' }), { cls: 'small' })),
  ], { label: ev.title, onClose: () => run({ type: 'eventClose' }) });
}

export function bagModal(): HTMLElement {
  const exp = app.game!.expedition!;
  const f = exp.fortune;
  const close = () => { app.ui.modal = undefined; render(); };
  return modal([
    h('div', { class: 'row' }, h('h2', { class: 'grow' }, `Dice bag (${f.bag.filter((d) => !d.uid.startsWith('ghost')).length} d10s)`), doubloons(f.doubloons)),
    bagView(f, () => {}),
    h('h3', { style: 'margin-top:12px' }, `Relics ${f.charms.length}/${charmSlots(f)} — order matters: they score left to right`),
    h('div', { class: 'charm-bar' }, ...f.charms.map((c, i) => h('div', { class: 'col', style: 'align-items:center;gap:2px' }, charmEl(c.id, c.counter),
      h('div', { class: 'row', style: 'gap:2px' }, btn('◀', () => run({ type: 'moveCharm', from: i, to: i - 1 }), { cls: 'small', disabled: i === 0 }), btn('▶', () => run({ type: 'moveCharm', from: i, to: i + 1 }), { cls: 'small', disabled: i === f.charms.length - 1 }))))),
    h('h3', { style: 'margin-top:12px' }, 'Hand levels'),
    h('table', { class: 'mini' }, h('tr', null, h('th', null, 'Hand'), h('th', null, 'Lv'), h('th', null, 'Chips'), h('th', null, 'Mult'), h('th', null, 'Played')),
      ...HANDS.map((x) => { const lv = f.omens[x.id] ?? 0; return h('tr', null, h('td', null, x.name), h('td', null, 1 + lv), h('td', { class: 'chipc' }, x.chips + lv * x.lvChips), h('td', { class: 'multc' }, `×${x.mult + lv * x.lvMult}`), h('td', { class: 'muted' }, f.handsPlayed[x.id] ?? 0)); })),
    h('p', { class: 'small muted' }, `Tokens: ${f.tokens.length ? f.tokens.join(', ') : 'none'}. Best hand this venture: ${fmt(f.bestScore)}.`),
    h('div', { class: 'row' }, h('span', { class: 'spacer' }), btn('Close', close, { key: 'close-bag' })),
  ], { label: 'Dice bag', onClose: close });
}

// ── results ─────────────────────────────────────────────────────────────────

export function resultScreen(): HTMLElement {
  const g = app.game!;
  const r = g.lastResult!;
  const title = r.captainLost ? 'The Lord-Captain is dead' : r.finale && r.kind === 'won' ? 'The Warrant is yours again!' : r.tutorial && r.kind === 'won' ? 'Blooded' : r.kind === 'won' ? 'The region is cleared' : r.kind === 'retreated' ? 'A tactical withdrawal' : 'The party has fallen';
  const chapter: Chapter | undefined = r.chapter === EPILOGUE.id ? EPILOGUE : r.chapter ? CHAPTERS[r.chapter as keyof typeof CHAPTERS] : undefined;
  return h('div', { class: 'title-screen', style: bgStyle(r.kind === 'won' ? `scenes/${r.biome}_boss` : 'town/fortress', '#0a0a10') + ';background-size:cover;background-position:center' },
    h('div', { class: 'title-inner' },
      h('div', { class: 'win', style: 'width:min(640px,100%)' },
        h('h1', { class: `result-big ${r.kind === 'wiped' ? 'danger' : 'gold'}` }, title),
        h('p', { class: 'prose', style: 'text-align:center;margin:8px auto' }, `${r.finale ? 'The Heart of the Fortress' : r.tutorial ? 'The Nursery' : BIOMES[r.biome].name} — ${r.fights} fights, best hand ${fmt(r.score)}.`),
        chapter ? h('div', { class: 'chronicle story-beat' }, h('div', { class: 'chapter-head' }, chapter.head), h('h2', null, chapter.title), ...chapter.text.map((t) => h('p', { class: 'prose' }, t))) : null,
        h('table', { class: 'mini' },
          h('tr', null, h('th', null, 'Thrones banked'), h('td', { class: 'gold' }, r.gold)),
          h('tr', null, h('th', null, 'Experience each'), h('td', null, `+${r.xp} xp`)),
          r.pf ? h('tr', null, h('th', null, 'Profit Factor'), h('td', { class: 'gold' }, `+${r.pf}`)) : null,
          r.items.length ? h('tr', null, h('th', null, 'Brought out'), h('td', null, r.items.join(', '))) : null,
          r.fallen.length ? h('tr', null, h('th', null, 'Fallen'), h('td', { class: 'danger' }, r.fallen.join(', '))) : null),
        r.charms.length ? h('div', { style: 'margin-top:10px' }, h('div', { class: 'small muted' }, 'This venture\'s relics, lost as the Fortress shifts:'), h('div', { class: 'charm-bar' }, ...r.charms.map((c) => charmEl(c)))) : null,
        h('div', { class: 'row', style: 'justify-content:center;margin-top:14px' },
          r.kind === 'won' && !r.tutorial && !r.captainLost ? btn('🖼 Share card', () => openShareCard(g), { key: 'result-share' }) : null,
          btn(r.captainLost ? 'Continue' : 'Return to the enclave', () => { app.ui.townTab = r.xp ? 'guild' : 'cartographer'; run({ type: 'ackResult' }); }, { cls: 'primary big', key: 'ack' })))));
}

export function gameOverScreen(): HTMLElement {
  const g = app.game!;
  const e = g.ending ?? { captain: 'The Lord-Captain', cause: 'lost in the Fortress', day: g.profile.townDay, clears: g.profile.stats.clears };
  const newDynasty = async () => {
    if (!confirm('Found a new Dynasty in this slot? The fallen House is gone for good.')) return;
    const slot = g.slot, mode = g.mode;
    await deleteSlot(slot);
    setGame(null);
    await start(slot, mode);
    void refreshSlots();
  };
  return h('div', { class: 'title-screen gameover', style: 'background:radial-gradient(ellipse at 50% 30%, #2a0a0e, #050508 70%)' },
    h('div', { class: 'title-inner' },
      h('div', { class: 'win', style: 'width:min(640px,100%)' },
        h('h1', { class: 'result-big danger' }, `House ${g.profile.dynastyName} is ended`),
        h('p', { class: 'prose', style: 'text-align:center' }, `${e.captain} ${e.cause}. With no Lord-Captain to hold the name, the retainers scatter into the enclave and the derelict trader is stripped for parts within the week.`),
        h('p', { class: 'prose', style: 'text-align:center' }, `The Dynasty lasted ${e.day} days, cleared ${e.clears} region${e.clears === 1 ? '' : 's'} of the Fortress, and traded ${fmt(g.profile.stats.thronesTraded)} Thrones. Somewhere inside, the Warrant waits for someone else.`),
        h('div', { class: 'row', style: 'justify-content:center;margin-top:14px' },
          btn('Found a new Dynasty', () => void newDynasty(), { cls: 'primary big', key: 'new-dynasty' }),
          btn('Title screen', () => { setGame(null); render(); }, { cls: 'small' })))));
}

export { art, dieFace };

// ── how to play: the rules ──────────────────────────────────────────────────

export function helpModal(): HTMLElement {
  const close = () => { app.ui.modal = undefined; render(); };
  const p = (t: string) => h('p', { class: 'prose', style: 'margin:6px 0' }, t);
  return modal([
    h('h2', null, 'How to play'),
    h('h3', null, 'The loop'),
    p('Your Lord-Captain and up to three retainers venture into the Blackstone Fortress from the enclave at its mouth. Explore with Forward, Left, Right and Back. Find the warp-key, kill the region\'s lord, and walk out alive with Thrones, valuables and experience. The Fortress shifts between ventures: every seed is a new layout. If the Lord-Captain dies, the Dynasty ends and you must start again.'),
    h('h3', null, 'Tests'),
    p('Rogue Trader rules: every Test is a d100 roll equal to or under a Characteristic (WS, BS, S, T, Ag, Int, Per, WP, Fel) or Skill, plus modifiers. Each full 10 under is a Degree of Success. Untrained basic skills test at half the Characteristic.'),
    h('h3', null, 'Combat'),
    p('Each turn holds a Full Action or two Half Actions. Attacks Test WS or BS: Standard (Half, +0), Semi-Auto (Full, +10, an extra hit per two Degrees), Full-Auto (Full, +20, an extra hit per Degree), Called Shot (Full, -20, a guaranteed Righteous Fury), All Out Attack and Charge. Hits land at a location (reverse the d100), and Armour minus Penetration plus Toughness soak them. A damage die showing 10 may become Righteous Fury: test again to confirm and add another d10. Foes may Dodge; you may Dodge or Parry once a round. Weapons can jam; plasma can overheat.'),
    p('At 0 Wounds an explorer falls and tests Toughness each turn against Blood Loss. Fate Points refresh each venture: spend one for two extra rerolls or to recover Wounds. If an explorer would die and has Fate left, they BURN a Fate Point (lost for good) and survive. Fear forces Willpower Tests and costs Insanity; the warp costs Corruption.'),
    h('h3', null, 'The Fortune tray'),
    h('div', { class: 'row', style: 'gap:6px' }, dieFace(10, 'aquila'), dieFace(10, 'aquila'), dieFace(7, 'iron'), dieFace(4, 'warp'), dieFace(3, 'void')),
    p('Each fight deals d10s from your bag onto a shared tray. On an explorer\'s turn, select dice and reroll them, then choose an action. Up to five selected dice ride along as a poker-dice hand: Pair, Straight, Colours (five of one material), Full House… Damage = (the action\'s damage + hand chips + pips) × mult. Dice matching the actor\'s career add +1 mult. Every scored 10 is a Righteous Fury: another d10 of damage before the multiplier. Unplayed dice stay for the next explorer; if you miss, your dice come back.'),
    h('h3', null, 'Getting lucky'),
    p('After every fight your Fortune Rank rises: choose a relic, a tarot (levels a hand), a die, a sanctified face or a token. Relics score left to right. Scrip earns interest and buys from Fortress scavengers. All of it vanishes when the venture ends.'),
    h('h3', null, 'Psykers and Navigators'),
    p('Astropaths make Focus Power Tests (Willpower +5 per effective Psy Rating). Fettered halves Psy Rating and is safe; Unfettered risks Psychic Phenomena on doubles; Push adds +3 and always does. Perils of the Warp can stun, burn, or let something through. Navigators use the warp eye: Willpower or Perception, +10 at Adept, +20 at Master, never Phenomena.'),
    h('h3', null, 'The enclave'),
    p('Bank Thrones, sell or present valuables (presenting raises Profit Factor), buy gear with Thrones plus an Acquisition Test for rare goods (Profit Factor + availability + craftsmanship), re-craft gear at the Tech-Shrine, sign on retainers, and spend experience: Characteristic advances, skills, talents and powers by career, with a free Rank Boon every second Rank.'),
    h('p', { class: 'small muted' }, 'Keys: 1–9, 0 select dice · R reroll · A/B/C/D/G menus · E end turn · Esc back · arrows/WASD to explore. Full rules: docs/RULES.md.'),
    h('div', { class: 'row' },
      app.game && !app.game.expedition && !app.game.tutorial && app.game.phase === 'play' ? btn('Restart the guided tour', () => { restartTutorial(app.game!); app.ui.townTab = 'guild'; close(); }, { cls: 'small' }) : null,
      h('span', { class: 'spacer' }), btn('Got it', close, { cls: 'primary', key: 'help-ok' })),
  ], { label: 'How to play', onClose: close });
}

void toast;
void ITEMS;
