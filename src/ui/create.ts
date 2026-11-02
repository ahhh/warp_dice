/**
 * Founding the Dynasty: name the house and its derelict ship, build the
 * Lord-Captain through the Origin Path, then sign on two or three retainers
 * from career templates (each customisable the same way).
 */
import type { CareerId, Char, GameState, Hero } from '../engine/types.ts';
import { CHARS } from '../engine/types.ts';
import { h, btn } from './dom.ts';
import { app, render, run, toast } from './app.ts';
import { Rng } from '../engine/rng.ts';
import { CAREERS, CAREER_IDS } from '../content/careers.ts';
import { ORIGINS, ORIGIN_BY_ID, ROW_NAMES, legalAt, randomPath, NAMES } from '../content/origins.ts';
import { createHero, derive, rollCharacteristics, CHAR_NAMES, type RollMethod } from '../rules/character.ts';
import { TEMPLATES, type CreateSpec } from '../meta/town.ts';
import { SKILLS } from '../content/skills.ts';
import { TALENTS } from '../content/talents.ts';
import { ITEMS, itemName } from '../content/items.ts';
import { heroPortrait, charGrid } from './widgets.ts';
import { sfx } from './audio.ts';

interface Spec extends CreateSpec { path: string[]; pathOpts: number[]; method: RollMethod; chars: Record<Char, number> }

interface Draft {
  step: 0 | 1 | 2 | 3;
  dynasty: string;
  ship: string;
  captain: Spec;
  retinue: Spec[];
  /** -1 = the captain, n = a retainer, null = nothing open. */
  editing: number | null;
}

let draft: Draft | null = null;
const rnd = () => new Rng([Math.random() * 2 ** 32 >>> 0, Math.random() * 2 ** 32 >>> 0, 7, 11]);

function specFor(careerId: CareerId, method: RollMethod = 'points'): Spec {
  const tpl = TEMPLATES[careerId];
  return { careerId, path: tpl.path.slice(), pathOpts: tpl.pathOpts.slice(), method, chars: rollCharacteristics(rnd(), careerId, method) };
}

export function resetDraft(g: GameState) {
  draft = {
    step: 0, dynasty: g.profile.dynastyName, ship: g.profile.shipName,
    captain: specFor('rogueTrader'), retinue: [specFor('archMilitant'), specFor('missionary'), specFor('voidMaster')], editing: null,
  };
}

/** A stable preview of what a spec will become. */
function preview(spec: Spec, captain = false): Hero {
  return createHero(new Rng([5, 3, 1, 9]), spec.careerId, { name: spec.name || (captain ? `Lord-Captain ${draft!.dynasty}` : 'Unnamed'), path: spec.path, pathOpts: spec.pathOpts, chars: spec.chars, lordCaptain: captain });
}

export function createScreen(): HTMLElement {
  const g = app.game!;
  if (!draft) resetDraft(g);
  const d = draft!;
  const steps = ['The House', 'The Lord-Captain', 'The Retinue', 'Set Out'];
  return h('div', { class: 'create' },
    h('div', { class: 'topbar' }, h('span', { class: 'title' }, 'Found a Dynasty'), h('span', { class: 'stat muted' }, g.mode === 'legacy' ? 'Legacy mode' : 'Story mode'),
      h('span', { class: 'spacer' }), ...steps.map((s, i) => h('span', { class: `step-pill ${d.step === i ? 'on' : ''}` }, `${i + 1}. ${s}`))),
    h('main', { class: 'create-main' },
      d.step === 0 ? houseStep(d) : d.step === 1 ? heroEditor(d, -1) : d.step === 2 ? retinueStep(d) : reviewStep(d)));
}

function nav(d: Draft, next: (() => string | null) | null, prevOk = true): HTMLElement {
  return h('div', { class: 'row', style: 'margin-top:14px' },
    d.step > 0 && prevOk ? btn('Back', () => { d.step = (d.step - 1) as Draft['step']; d.editing = null; render(); }) : null,
    h('span', { class: 'spacer' }),
    next ? btn('Next', () => { const e = next(); if (e) { toast(e); return; } d.step = (d.step + 1) as Draft['step']; d.editing = null; sfx.select(); render(); }, { cls: 'primary', key: 'create-next' }) : null);
}

function houseStep(d: Draft): HTMLElement {
  const input = (val: string, set: (v: string) => void, id: string) => h('input', { id, value: val, class: 'text-in', on: { input: (e: Event) => set((e.target as HTMLInputElement).value) } });
  return h('div', { class: 'col' },
    h('div', { class: 'win prose-win' },
      h('h2', null, 'A Warrant lost'),
      h('p', { class: 'prose' }, 'Your family held a Warrant of Trade for eleven generations. It went down with the flagship when a rival Dynasty boarded and scuttled her at the edge of the Koronus Expanse. Few know it is gone. What remains is a derelict trader, a handful of loyal souls, and a name that still opens doors.'),
      h('p', { class: 'prose' }, 'The wreck was dragged into a Blackstone Fortress — a xenos vault older than the Imperium, whose halls shift with every venture. Survivors trade at an enclave by its mouth. You will go in, come back with Thrones and treasure, and rebuild. If the Lord-Captain dies, the Dynasty dies with them.')),
    h('div', { class: 'win' },
      h('h2', null, 'Name your House'),
      h('div', { class: 'row' }, h('label', { for: 'dyn' }, 'House'), input(d.dynasty, (v) => { d.dynasty = v; }, 'dyn'), btn('Random', () => { d.dynasty = rnd().pick(NAMES.dynasty); render(); }, { cls: 'small' })),
      h('div', { class: 'row', style: 'margin-top:8px' }, h('label', { for: 'ship' }, 'Lost flagship'), input(d.ship, (v) => { d.ship = v; }, 'ship'), btn('Random', () => { d.ship = rnd().pick(NAMES.ships); render(); }, { cls: 'small' })),
      h('p', { class: 'small muted' }, 'You limp out to the Fortress aboard a derelict trader. The flagship is what you are looking for.')),
    nav(d, () => (d.dynasty.trim() ? null : 'Name your House.')));
}

// ── the explorer editor (Origin Path + Characteristics) ─────────────────────

function heroEditor(d: Draft, idx: number): HTMLElement {
  const captain = idx === -1;
  const spec = captain ? d.captain : d.retinue[idx];
  const hero = preview(spec, captain);
  const dd = derive(hero);
  const career = CAREERS[spec.careerId];
  const pick = (row: number, id: string) => {
    spec.path[row] = id;
    const o = ORIGIN_BY_ID[id];
    spec.pathOpts[row] = o.options ? 0 : -1;
    // Later rows must stay reachable (one column at most per row).
    for (let r = row + 1; r < 5; r++) {
      const legal = legalAt(r, ORIGIN_BY_ID[spec.path[r - 1]].slot);
      if (!legal.some((x) => x.id === spec.path[r])) { spec.path[r] = legal[0].id; spec.pathOpts[r] = legal[0].options ? 0 : -1; }
    }
    render();
  };
  const reroll = (method: RollMethod) => { spec.method = method; spec.chars = rollCharacteristics(rnd(), spec.careerId, method); sfx.roll(9); render(); };
  const body = h('div', { class: 'editor' },
    h('div', { class: 'win' },
      h('div', { class: 'row' }, heroPortrait(hero, 'lg'),
        h('div', { class: 'col grow', style: 'gap:4px' },
          h('div', { class: 'row' }, h('label', { for: 'hname' }, 'Name'), h('input', { id: 'hname', class: 'text-in', value: spec.name ?? '', placeholder: captain ? `(Lord-Captain ${d.dynasty})` : '(random)', on: { input: (e: Event) => { spec.name = (e.target as HTMLInputElement).value; } } })),
          h('b', null, `${captain ? 'Lord-Captain · ' : ''}${career.name}`), h('span', { class: 'small muted' }, career.tagline), h('span', { class: 'small' }, career.summary))),
      h('h3', { style: 'margin-top:10px' }, 'Characteristics'),
      h('div', { class: 'row' }, ...(['points', 'arranged', 'ordered', 'heroic'] as RollMethod[]).map((m) => btn({ points: '100 points', arranged: 'Roll 2d10+25 & arrange', ordered: 'Roll in order', heroic: 'Heroic 3d10 drop low' }[m], () => reroll(m), { cls: `small ${spec.method === m ? 'on' : ''}`, title: m === 'points' ? 'Spend 100 points (max +20 each) along the career\'s priorities.' : m === 'ordered' ? 'Core p.14: 2d10+25 for each Characteristic in order.' : m === 'arranged' ? 'Roll 2d10+25 nine times and assign them to the career\'s priorities.' : '3d10 drop the lowest, +25.' })),
        btn('🎲 Reroll', () => reroll(spec.method), { cls: 'small', disabled: spec.method === 'points' })),
      charGrid(dd.chars, { base: spec.chars }),
      h('div', { class: 'row small', style: 'margin-top:6px' }, h('span', null, `Wounds ${dd.maxHp}`), h('span', null, `Fate ${dd.fateMax}`), h('span', null, `Insanity ${hero.insanity}`), h('span', null, `Corruption ${hero.corruption}`), h('span', null, `Initiative +${dd.init}`)),
      h('div', { class: 'small', style: 'margin-top:6px' }, h('b', null, 'Skills: '), Object.entries(hero.skills).map(([k, v]) => `${SKILLS[k as keyof typeof SKILLS].name}${v ? ` +${v}` : ''}`).join(', ')),
      h('div', { class: 'small' }, h('b', null, 'Talents: '), [...new Set(hero.talents)].map((t) => TALENTS[t]?.name ?? t).join(', ')),
      h('div', { class: 'small' }, h('b', null, 'Kit: '), Object.values(hero.equipment).map((i) => (i ? itemName(i) : '')).filter(Boolean).join(', ')),
      h('div', { class: 'small' }, h('b', null, 'Fortune talent: '), `${career.fortuneTalent.name} — ${career.fortuneTalent.text}`),
      h('p', { class: 'small muted' }, hero.look ?? '')),
    h('div', { class: 'win' },
      h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'The Origin Path'), btn('Template', () => { const t = TEMPLATES[spec.careerId]; spec.path = t.path.slice(); spec.pathOpts = t.pathOpts.slice(); render(); }, { cls: 'small' }),
        btn('🎲 Random path', () => { const r = randomPath(rnd(), career.homeWorlds); spec.path = r.ids; spec.pathOpts = r.opts; render(); }, { cls: 'small' })),
      h('p', { class: 'small muted' }, 'Core p.15: each step must sit directly below the previous one, or one column to either side. Into the Storm alternates are marked ✦.'),
      ...ROW_NAMES.map((rowName, row) => {
        const prevSlot = row > 0 ? ORIGIN_BY_ID[spec.path[row - 1]].slot : undefined;
        const legal = new Set(legalAt(row, prevSlot).map((o) => o.id));
        const chosen = ORIGIN_BY_ID[spec.path[row]];
        return h('div', { class: 'origin-row' },
          h('div', { class: 'origin-label small' }, `${row + 1}. ${rowName}`),
          h('div', { class: 'origin-cells' }, ...[0, 1, 2, 3, 4, 5].map((slot) => h('div', { class: 'origin-col' }, ...ORIGINS.filter((o) => o.row === row && o.slot === slot).map((o) =>
            h('button', { class: `origin ${spec.path[row] === o.id ? 'sel' : ''} ${legal.has(o.id) ? '' : 'illegal'}`, disabled: !legal.has(o.id), title: `${o.blurb} (${o.src})`, on: { click: () => pick(row, o.id) } }, `${o.its ? '✦ ' : ''}${o.name}`))))),
          chosen?.options ? h('div', { class: 'row small' }, 'Choose:', ...chosen.options.map((op, i) => btn(op.name, () => { spec.pathOpts[row] = i; render(); }, { cls: `small ${spec.pathOpts[row] === i ? 'on' : ''}`, title: op.text }))) : null,
          chosen ? h('div', { class: 'small muted' }, chosen.blurb, chosen.traits.length ? ` Traits: ${chosen.traits.map((t) => t[0]).join(', ')}.` : '') : null);
      })));
  if (captain) return h('div', { class: 'col' }, body, nav(d, () => null));
  return h('div', { class: 'col' }, body, btn('Done', () => { d.editing = null; render(); }, { cls: 'primary' }));
}

function retinueStep(d: Draft): HTMLElement {
  if (d.editing !== null && d.editing >= 0) return heroEditor(d, d.editing);
  const chosen = new Set(d.retinue.map((r) => r.careerId));
  const pool = CAREER_IDS.filter((c) => c !== 'rogueTrader');
  return h('div', { class: 'col' },
    h('div', { class: 'win' },
      h('h2', null, `Your retinue (${d.retinue.length}/3)`),
      h('p', { class: 'prose' }, 'Two or three loyal souls followed you off the flagship. Choose their careers; each starts from a template you can customise. A party of four is the full complement for a venture.'),
      h('div', { class: 'cards' }, ...pool.map((c) => {
        const career = CAREERS[c];
        const on = chosen.has(c);
        return h('div', { class: `hero-card career ${on ? 'sel' : ''}`, style: `--cc:${career.color}`, tabindex: 0, on: { click: () => {
          if (on) d.retinue = d.retinue.filter((r) => r.careerId !== c);
          else if (d.retinue.length < 3) d.retinue.push(specFor(c));
          else { toast('Three retainers at most.'); return; }
          render();
        } } },
          h('div', { class: 'col', style: 'gap:3px' }, h('b', null, career.name), h('span', { class: 'small muted' }, career.tagline), h('span', { class: 'small' }, TEMPLATES[c].blurb),
            h('span', { class: 'small', style: 'color:#b9e2cc' }, `Fortune: ${career.fortuneTalent.name}`)));
      }))),
    d.retinue.length ? h('div', { class: 'win' }, h('h3', null, 'Signed on'),
      h('div', { class: 'list' }, ...d.retinue.map((r, i) => {
        const p = preview(r);
        return h('div', { class: 'item-row' }, heroPortrait(p), h('div', { class: 'grow' }, h('b', null, r.name || CAREERS[r.careerId].name), h('div', { class: 'small muted' }, `${p.origin.homeWorld && ORIGIN_BY_ID[p.origin.homeWorld].name} · ${CHARS.map((k) => `${k} ${derive(p).chars[k]}`).join(' ')}`)),
          btn('Customise', () => { d.editing = i; render(); }, { cls: 'small' }));
      }))) : null,
    nav(d, () => (d.retinue.length < 2 ? 'Choose at least two retainers.' : null)));
}

function reviewStep(d: Draft): HTMLElement {
  const crew = [preview(d.captain, true), ...d.retinue.map((r) => preview(r))];
  const pf = 12 + crew.reduce((a, x) => a, 0);
  void pf;
  return h('div', { class: 'col' },
    h('div', { class: 'win' }, h('h2', null, `House ${d.dynasty}`),
      h('p', { class: 'prose' }, `The derelict trader drops out of the warp beside the Blackstone Fortress. Behind you, the ${d.ship} is a memory. Ahead, the enclave's lumens flicker at the Fortress mouth.`),
      h('div', { class: 'cards' }, ...crew.map((x) => h('div', { class: 'hero-card' }, heroPortrait(x), h('div', { class: 'col grow', style: 'gap:2px' }, h('b', null, x.name), h('span', { class: 'small muted' }, `${x.lordCaptain ? 'Lord-Captain · ' : ''}${CAREERS[x.careerId].name}`), h('span', { class: 'small' }, `${derive(x).maxHp} Wounds · Fate ${derive(x).fateMax}`), h('span', { class: 'small muted' }, Object.values(x.equipment).map((i) => (i ? ITEMS[i.defId]?.name : '')).filter(Boolean).join(', '))))))),
    h('div', { class: 'row' },
      btn('Back', () => { d.step = 2; render(); }),
      h('span', { class: 'spacer' }),
      btn('Found the Dynasty', () => {
        const r = run({ type: 'foundDynasty', dynastyName: d.dynasty, shipName: d.ship, captain: strip(d.captain), retinue: d.retinue.map(strip) });
        if (r.ok) { sfx.fanfare(); draft = null; app.ui.townTab = 'cartographer'; }
      }, { cls: 'primary big', key: 'found' })));
}

function strip(s: Spec): CreateSpec {
  return { careerId: s.careerId, name: s.name, path: s.path, pathOpts: s.pathOpts, method: s.method, chars: s.chars };
}

export const createKeys = { CHAR_NAMES };
