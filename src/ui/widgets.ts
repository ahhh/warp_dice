/** Shared widgets: d10 dice, relics, explorer portraits, Wounds bars, bag picker. */
import type { Combatant, Condition, FortuneDie, FortuneRun, Hero, TrayDie, BoonOffer, Char } from '../engine/types.ts';
import { CHARS } from '../engine/types.ts';
import { h, fmt } from './dom.ts';
import { art } from './art.ts';
import { MATERIALS, FACE_MODS, SPECIAL_BY_ID } from '../fortune/materials.ts';
import { CHARM_BY_ID, charmText } from '../fortune/charms.ts';
import { offerTitle, offerText, TOKENS } from '../fortune/boons.ts';
import { CAREERS, rankFromXp } from '../content/careers.ts';
import { derive, CHAR_NAMES } from '../rules/character.ts';
import { ITEMS } from '../content/items.ts';

/** Pip layout on a 3×3 grid for 1–9; 10 shows as a bold numeral (Righteous Fury). */
const PIP_LAYOUT: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
  7: [0, 2, 3, 4, 5, 6, 8], 8: [0, 1, 2, 3, 5, 6, 7, 8], 9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};

export function dieFace(value: number, material: FortuneDie['material'], mod?: string, opts: { cls?: string; onClick?: () => void; label?: string; key?: string } = {}): HTMLElement {
  const m = MATERIALS[material];
  const pips = PIP_LAYOUT[value];
  const body = value === 10 ? h('span', { class: 'ten' }, '10') : pips && value > 0
    ? h('div', { class: 'pips' }, ...Array.from({ length: 9 }, (_, i) => (pips.includes(i) ? h('span', { class: 'pip' }) : h('span'))))
    : String(value);
  const fm = mod ? FACE_MODS[mod as keyof typeof FACE_MODS] : undefined;
  return h('button', {
    class: `die ${material} ${value === 10 ? 'fury' : ''} ${opts.cls ?? ''}`, style: `--dc:${m.color};--di:${m.ink}`, 'data-key': opts.key,
    'aria-label': opts.label ?? `${m.name} die showing ${value}${mod ? `, ${mod}` : ''}`,
    title: `${m.name} d10${fm ? ` · ${fm.name}: ${fm.text}` : ''} — ${m.text}${value === 10 ? ' A scored 10 is a Righteous Fury.' : ''}`,
    on: opts.onClick ? { click: (e: Event) => { e.stopPropagation(); opts.onClick!(); } } : undefined,
  }, body, fm ? h('span', { class: 'mod' }, fm.glyph) : null);
}

export function trayDie(run: FortuneRun, td: TrayDie, i: number, selected: boolean, rolling: boolean, onClick: () => void): HTMLElement {
  const die = run.bag.find((d) => d.uid === td.dieUid);
  const f = die?.faces[td.face] ?? { v: 0 };
  return dieFace(f.v, die?.material ?? 'iron', f.mod, {
    cls: `${selected ? 'sel' : ''} ${td.jinxed ? 'jinx' : ''} ${td.ghost ? 'ghost' : ''} ${rolling ? 'rolling' : ''}`,
    onClick, key: `die${i}`,
    label: `Die ${i + 1}: ${MATERIALS[die?.material ?? 'iron'].name} ${f.v}${td.jinxed ? ' (jinxed)' : ''}${selected ? ' (selected)' : ''}`,
  });
}

export function charmEl(id: string, counter?: number, extra = ''): HTMLElement {
  const def = CHARM_BY_ID[id];
  const text = def ? charmText(def, counter !== undefined ? { id, counter } : undefined) : id;
  return h('div', { class: `charm ${def?.rarity ?? ''} ${extra}`, title: `${def?.name} (${def?.rarity} relic) — ${text}`, tabindex: 0, 'data-charm': id },
    art(`charms/${id}`, def?.name ?? id, '', '#5a4a1a'),
    def?.showCounter && counter !== undefined ? h('span', { class: 'cnt' }, id === 'ouroboros' || id === 'avalanche' ? `×${counter}` : `+${counter}`) : null);
}

export function hpBar(hp: number, max: number, ward = 0): HTMLElement {
  const pct = Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100));
  const wp = Math.min(100, (ward / Math.max(1, max)) * 100);
  return h('div', { class: `bar ${pct < 30 ? 'low' : ''}`, role: 'meter', 'aria-valuenow': hp, 'aria-valuemax': max, 'aria-label': `Wounds ${hp} of ${max}` },
    h('span', { style: `width:${pct}%` }), ward > 0 ? h('div', { class: 'ward', style: `width:${wp}%` }) : null);
}

const BAD = new Set(['stunned', 'prone', 'pinned', 'blinded', 'frightened', 'bleeding', 'onFire', 'snared', 'poisoned', 'helpless', 'fatigued', 'marked', 'weakened', 'slowed', 'vulnerable', 'staggered', 'dominated', 'feinted']);
const COND_LABEL: Record<string, string> = { onFire: 'on fire', allOut: 'all out', foreseen: 'foreseen', warded: 'warded', quickened: 'quickened' };

export function conds(list: Condition[], side: 'hero' | 'enemy'): HTMLElement {
  return h('div', { class: 'conds' }, ...list.map((c) => {
    const bad = BAD.has(c.id);
    const cls = side === 'hero' ? (bad ? 'bad' : 'good') : bad ? 'good' : 'bad';
    return h('span', { class: `cond ${cls}`, title: c.id }, COND_LABEL[c.id] ?? c.id, c.rounds > 0 && c.rounds < 50 ? ` ${c.rounds}` : '');
  }));
}

export function heroPortrait(hero: Hero, size = ''): HTMLElement {
  return h('div', { class: `portrait ${size} ${hero.status === 'dead' ? 'dead' : ''} ${hero.lordCaptain ? 'captain' : ''}` }, art(hero.portrait, hero.name, '', CAREERS[hero.careerId].color));
}

export function heroLine(hero: Hero): string {
  return `${hero.lordCaptain ? 'Lord-Captain · ' : ''}${CAREERS[hero.careerId].name} · Rank ${rankFromXp(hero.xp)}`;
}

export function combatantArt(c: Combatant, cls = ''): HTMLElement {
  return art(c.art, c.name, cls, c.side === 'hero' ? '#3a4f94' : '#6b2b2b');
}

export function hpText(h0: Hero) {
  return `${h0.hp}/${derive(h0).maxHp}`;
}

export function doubloons(n: number): HTMLElement {
  return h('span', { class: 'doubloons', title: 'Scrip — the Fortress\'s run-only barter coin. Interest: +1 per 5 held after each fight.' }, h('span', { class: 'coin scrip' }), fmt(n));
}

export function thrones(n: number): HTMLElement {
  return h('span', { class: 'stat', title: 'Thrones — banked coin of the Imperium' }, h('span', { class: 'coin' }), h('b', { class: 'gold' }, fmt(n)), 'Thrones');
}

/** Nine-Characteristic strip with bonuses. */
export function charGrid(chars: Record<Char, number>, opts: { base?: Record<Char, number>; compact?: boolean } = {}): HTMLElement {
  return h('div', { class: `abil ${opts.compact ? 'compact' : ''}` }, ...CHARS.map((k) => h('div', { title: CHAR_NAMES[k] }, k,
    h('b', null, chars[k]),
    opts.compact ? null : h('span', { class: 'small muted' }, `bonus ${Math.floor(chars[k] / 10)}${opts.base && opts.base[k] !== chars[k] ? ` · base ${opts.base[k]}` : ''}`))));
}

export function offerIcon(o: BoonOffer): HTMLElement {
  if (o.kind === 'charm') return art(`charms/${o.id}`, offerTitle(o), '', '#5a4a1a');
  if (o.kind === 'die' && o.die) {
    const sp = SPECIAL_BY_ID[o.id];
    const f = sp?.faces.find((x) => x.mod) ?? sp?.faces[sp.faces.length - 1];
    return h('div', { class: 'row', style: 'justify-content:center' }, dieFace(f?.v ?? 10, o.die.material, f?.mod));
  }
  if (o.kind === 'face') return h('div', { class: 'row', style: 'justify-content:center' }, dieFace(10, 'iron', o.face));
  if (o.kind === 'omen') return h('div', { class: 'token', style: 'width:64px;height:64px;font-size:30px;background:radial-gradient(circle at 35% 30%,#e4d9ff,#6b4fd0 60%,#2b1a6a);border-color:#cbbcff;color:#fff' }, '✶');
  if (o.kind === 'token') return h('div', { class: 'token', style: 'width:56px;height:56px;font-size:22px' }, TOKEN_GLYPH[o.id] ?? '¤');
  if (o.kind === 'remove') return h('div', { class: 'token', style: 'width:56px;height:56px;font-size:24px;background:#3a0d12;border-color:var(--mult);color:#fff' }, '✖');
  return h('div', { class: 'token', style: 'width:56px;height:56px;font-size:24px;background:radial-gradient(circle at 35% 30%,#d9f7ff,#2a7fb0 60%,#0b2a40);color:#fff' }, '▲');
}

export const TOKEN_GLYPH: Record<string, string> = { mulligan: '↻', fateCoin: '🂠', loadedCoin: '✠', encore: '+1', tonic: '✚' };

export function boonCard(o: BoonOffer, onPick: () => void, opts: { price?: number; afford?: boolean; disabled?: boolean } = {}): HTMLElement {
  const def = o.kind === 'charm' ? CHARM_BY_ID[o.id] : undefined;
  const kindLabel = o.kind === 'charm' ? `Relic · ${def?.rarity}` : o.kind === 'omen' ? 'Tarot' : o.kind === 'die' ? 'New die' : o.kind === 'face' ? 'Sanctified face' : o.kind === 'token' ? 'Token' : o.kind === 'remove' ? 'Bag thinning' : 'Upgrade';
  return h('button', { class: `boon ${def ? `charm-${def.rarity}` : ''}`, disabled: !!opts.disabled || o.sold, on: { click: onPick } },
    h('span', { class: 'kind' }, kindLabel),
    h('div', { class: 'icon' }, offerIcon(o)),
    h('span', { class: 'name' }, offerTitle(o)),
    h('span', { class: 'desc' }, offerText(o)),
    opts.price !== undefined ? h('span', { class: `price ${opts.afford === false ? 'danger' : 'gold'}` }, o.sold ? 'Sold' : `${opts.price} scrip`) : null);
}

export function bagView(run: FortuneRun, onPick: (uid: string, face?: number) => void, opts: { pickFace?: boolean; sel?: string } = {}): HTMLElement {
  return h('div', { class: 'bag' }, ...run.bag.filter((d) => !d.uid.startsWith('ghost')).map((d) => {
    const m = MATERIALS[d.material];
    return h('div', { class: `bag-die ${opts.sel === d.uid ? 'sel' : ''}`, tabindex: 0, on: { click: () => onPick(d.uid) } },
      h('div', { class: 'small' }, d.name ?? `${m.name} d10`),
      h('div', { class: 'faces' }, ...d.faces.map((f, i) => h('button', {
        class: 'face', style: `background:${m.color};color:${m.ink}`, title: f.mod ? FACE_MODS[f.mod].text : `${f.v}`,
        on: { click: (e: Event) => { e.stopPropagation(); onPick(d.uid, opts.pickFace ? i : undefined); } },
      }, String(f.v), f.mod ? h('sup', null, FACE_MODS[f.mod].glyph) : null))));
  }));
}

export function itemIcon(defId: string): HTMLElement {
  const d = ITEMS[defId];
  return h('div', { class: 'icon' }, art(d?.art ?? 'x', d?.name ?? defId, '', d?.kind === 'valuable' ? '#7a5d22' : '#4a4a5a'));
}

export { MATERIALS, TOKENS };
