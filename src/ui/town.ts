/** The Threshold enclave hub. */
import type { ZoneId, EquipSlot, Hero, ItemInstance } from '../engine/types.ts';
import { h, btn, fmt } from './dom.ts';
import { app, run, render, setGame, toast } from './app.ts';
import { bgStyle, art } from './art.ts';
import { heroPortrait, heroLine, hpBar, itemIcon, charmEl, thrones } from './widgets.ts';
import { CAREERS } from '../content/careers.ts';
import { ITEMS, MODS, CRAFTS, CRAFT_ORDER, itemName, availName, modFits, AVAIL } from '../content/items.ts';
import { BIOMES, BIOME_ORDER } from '../content/biomes.ts';
import { MONSTERS } from '../content/monsters.ts';
import { CHARMS } from '../fortune/charms.ts';
import { HANDS } from '../fortune/hands.ts';
import { derive, xpAvailable } from '../rules/character.ts';
import { boonsAvailable } from '../rules/advance.ts';
import {
  rosterCap, recruitCost, FACILITIES, facilityCost, partySuggestion, acquisitionTarget, marketPrice, exchangeValue, effectivePf,
  craftCost, trainingCap, trainingCost, DRILL_XP, treatCost, refreshMarket, bestTrader,
} from '../meta/town.ts';
import { PARTY_MIN, PARTY_MAX } from '../dungeon/explore.ts';
import { randomSeed } from '../engine/rng.ts';
import { exportSave, saveGame } from '../persistence/save.ts';
import { download } from './title.ts';
import { sfx } from './audio.ts';
import { prologue, CHAPTERS, FINALE, FINALE_LEVEL, EPILOGUE, finaleBlocked, storyOf } from '../content/story.ts';
import { openShareCard } from './shareCard.ts';

const TABS: [string, string, string][] = [
  ['guild', 'Muster Hall', 'town/guild'],
  ['chronicle', 'Chronicle', 'town/chronicle'],
  ['cartographer', 'Fortress Approach', 'town/fortress'],
  ['armory', 'Market', 'town/market'],
  ['exchange', 'Exchange', 'town/exchange'],
  ['enchanter', 'Tech-Shrine', 'town/shrine'],
  ['training', 'Drill Deck', 'town/drill'],
  ['vault', 'The Hold', 'town/hold'],
  ['codex', 'Codex', 'town/codex'],
];

export function topbar(): HTMLElement {
  const g = app.game!;
  const sig = Object.values(g.profile.sigils).reduce((a, b) => a + (b ?? 0), 0);
  return h('div', { class: 'topbar' },
    h('span', { class: 'title' }, `House ${g.profile.dynastyName}`),
    thrones(g.profile.bankedGold),
    h('span', { class: 'stat', title: 'Profit Factor — your Dynasty\'s standing. Drives Acquisition Tests.' }, 'PF ', h('b', null, effectivePf(g))),
    h('span', { class: 'stat', title: 'Warp-keystones from each region\'s lord unlock enclave upgrades' }, h('b', null, sig), 'keystones'),
    h('span', { class: 'stat muted' }, `Day ${g.profile.townDay}`),
    h('span', { class: 'stat muted' }, g.mode === 'legacy' ? 'Legacy' : 'Story'),
    h('span', { class: 'spacer' }),
    btn('How to play', () => { app.ui.modal = { kind: 'help' }; render(); }, { cls: 'small' }),
    btn(g.settings.fast ? 'Fast: on' : 'Fast: off', () => { g.settings.fast = !g.settings.fast; render(); }, { cls: 'small' }),
    btn(g.settings.sound ? 'Sound: on' : 'Sound: off', () => { g.settings.sound = !g.settings.sound; setGame(g); render(); }, { cls: 'small' }),
    btn('Save & quit', async () => { await saveGame(g); setGame(null); render(); }, { cls: 'small' }),
  );
}

export function townScreen(): HTMLElement {
  const g = app.game!;
  refreshMarket(g);
  const tab = app.ui.townTab;
  const t = TABS.find((x) => x[0] === tab) ?? TABS[0];
  const spend = g.roster.filter((x) => x.status === 'alive' && (xpAvailable(x) >= 100 || boonsAvailable(x) > 0)).length;
  return h('div', null, topbar(),
    h('div', { class: 'town' },
      h('nav', { class: 'town-nav', 'aria-label': 'Enclave' }, ...TABS.map(([id, name]) =>
        btn([name, id === 'guild' && spend ? h('span', { class: 'badge red', style: 'margin-left:6px' }, `${spend} can advance`) : null], () => { app.ui.townTab = id; render(); }, { cls: tab === id ? 'on' : '', key: `tab-${id}` }))),
      h('main', null,
        h('div', { class: 'town-banner', style: bgStyle(t[2], 'linear-gradient(135deg,#2b2233,#0a0a10)') }, h('h1', null, t[1])),
        TAB_RENDER[tab]?.() ?? null)));
}

const TAB_RENDER: Record<string, () => HTMLElement> = {
  guild: guildTab, chronicle: chronicleTab, cartographer: cartTab, armory: marketTab, exchange: exchangeTab,
  enchanter: shrineTab, training: trainingTab, vault: vaultTab, codex: codexTab,
};

export function heroCard(hero: Hero, opts: { onClick?: () => void; sel?: boolean; extra?: HTMLElement | null } = {}): HTMLElement {
  const d = derive(hero);
  return h('div', { class: `hero-card ${opts.sel ? 'sel' : ''} ${hero.status !== 'alive' ? 'dead' : ''} ${hero.lordCaptain ? 'captain' : ''}`, tabindex: 0, on: opts.onClick ? { click: opts.onClick, keydown: (e: Event) => { if ((e as KeyboardEvent).key === 'Enter') opts.onClick!(); } } : undefined, 'data-key': `hero-${hero.id}` },
    heroPortrait(hero),
    h('div', { class: 'grow col', style: 'gap:3px;min-width:0' },
      h('b', null, hero.name),
      h('span', { class: 'small muted' }, heroLine(hero)),
      hero.status === 'alive' ? hpBar(hero.hp, d.maxHp) : h('span', { class: 'small danger' }, hero.status === 'dead' ? `Fallen — ${hero.history.deathCause ?? ''}` : 'Retired'),
      h('span', { class: 'small muted' }, `Fate ${hero.status === 'alive' ? d.fateMax : '—'} · Ins ${hero.insanity} · Corr ${hero.corruption} · ${hero.history.clears} clears`),
      hero.status === 'alive' && (xpAvailable(hero) >= 100 || boonsAvailable(hero) > 0) ? h('span', { class: 'badge red' }, `${xpAvailable(hero)} xp to spend${boonsAvailable(hero) ? ' · Rank Boon' : ''}`) : null,
      opts.extra ?? null),
    h('span', { class: 'lvl', title: `Power level ${hero.level}` }, `R${d.rank}`));
}

function guildTab(): HTMLElement {
  const g = app.game!;
  const alive = g.roster.filter((x) => x.status === 'alive');
  const fallen = g.roster.filter((x) => x.status === 'dead');
  return h('div', { class: 'col' },
    h('div', { class: 'win', 'data-tut': 'roster' },
      h('h2', null, `Your crew (${alive.length}/${rosterCap(g)})`),
      h('p', { class: 'small muted' }, 'Click an explorer for their sheet, gear and advancement.'),
      h('div', { class: 'cards' }, ...alive.map((hero) => heroCard(hero, {
        onClick: () => { app.ui.heroSheet = hero.id; render(); },
        extra: xpAvailable(hero) >= 100 || boonsAvailable(hero) > 0 ? h('span', { 'data-tut': 'levelup' }, btn('Advance', () => { app.ui.advance = hero.id; render(); }, { cls: 'primary small' })) : null,
      })))),
    h('div', { class: 'win', 'data-tut': 'recruits' },
      h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'Would-be retainers'), btn('New faces (20 Thrones)', () => run({ type: 'rerollRecruits' }), { cls: 'small' })),
      h('p', { class: 'small muted' }, 'Survivors of other crews, hiding in the enclave. They sign on for coin — or for free if your crew is too thin to venture out.'),
      h('div', { class: 'cards' }, ...g.recruits.map((hero, i) => heroCard(hero, {
        onClick: () => { app.ui.heroSheet = `recruit:${i}`; render(); },
        extra: btn(recruitCost(hero, g) ? `Sign on — ${recruitCost(hero, g)} Thrones` : 'Sign on — free', () => { const r = run({ type: 'hire', idx: i }); if (r.ok) sfx.coin(); }, { cls: 'small primary', disabled: g.profile.bankedGold < recruitCost(hero, g) }),
      })))),
    fallen.length ? h('div', { class: 'win' }, h('h2', null, 'The Roll of the Fallen'), h('div', { class: 'cards' }, ...fallen.map((hero) => heroCard(hero)))) : null,
  );
}

function cartTab(): HTMLElement {
  const g = app.game!;
  const ui = app.ui;
  const alive = g.roster.filter((x) => x.status === 'alive');
  const captain = alive.find((x) => x.lordCaptain);
  if (!ui.party.length || ui.party.some((id) => !alive.some((x) => x.id === id)) || (captain && !ui.party.includes(captain.id))) ui.party = partySuggestion(g);
  if (!ui.seed) ui.seed = randomSeed();
  const toggle = (id: string) => {
    if (captain?.id === id) { toast('The Lord-Captain leads every venture.'); return; }
    if (ui.party.includes(id)) ui.party = ui.party.filter((x) => x !== id);
    else if (ui.party.length < PARTY_MAX) ui.party = [...ui.party, id];
    else { toast(`At most ${PARTY_MAX} explorers.`); return; }
    render();
  };
  const finale = ui.biome === 'finale';
  const partyHeroes = ui.party.map((id) => g.roster.find((x) => x.id === id)!).filter(Boolean);
  const finaleOpen = BIOME_ORDER.every((b) => (g.profile.sigils[b] ?? 0) > 0);
  if (finale && !finaleOpen) ui.biome = 'docks';
  const tutorialOn = !!g.tutorial;
  const zone = BIOMES[(finale ? 'core' : ui.biome) as ZoneId];
  return h('div', { class: 'col' },
    tutorialOn ? h('div', { class: 'win tutorial-call' },
      h('h2', null, 'The Nursery'),
      h('p', { class: 'prose' }, 'A short spur of the Fortress the enclave uses to blood new crews: one fight, a salvage locker, the warp-key and a gentle keeper. Nobody dies there, and everyone comes back with experience.'),
      btn('Enter the Nursery', () => {
        const r = run({ type: 'startExpedition', partyIds: ui.party, biome: 'docks', difficulty: 'explorer', seed: 'TUTORIAL', tutorial: true });
        if (r.ok) sfx.fanfare();
      }, { cls: 'primary big', disabled: ui.party.length < PARTY_MIN, key: 'start-tutorial' })) : null,
    h('div', { class: 'win', 'data-tut': 'party' },
      h('h2', null, `Choose your party (${ui.party.length}/${PARTY_MAX})`),
      h('p', { class: 'small muted' }, 'The Lord-Captain and up to three retainers. If the Lord-Captain falls and has no Fate left to burn, the Dynasty ends.'),
      h('div', { class: 'cards' }, ...alive.map((hero) => heroCard(hero, { sel: ui.party.includes(hero.id), onClick: () => toggle(hero.id) })))),
    h('div', { class: 'win' },
      h('h2', null, 'Choose a region of the Fortress'),
      h('div', { class: 'biome-pick', 'data-tut': 'biomes' }, ...BIOME_ORDER.map((b) => {
        const def = BIOMES[b];
        const open = g.profile.unlockedBiomes.includes(b);
        return h('button', { class: `biome-card ${ui.biome === b ? 'sel' : ''} ${open ? '' : 'locked'}`, style: bgStyle(`scenes/${b}_corridor`, `linear-gradient(135deg, ${def.color}, #0a0a10)`), disabled: !open, on: { click: () => { ui.biome = b; render(); } } },
          h('b', null, def.name), h('span', { class: 'small' }, open ? def.tagline : 'Sealed — clear the previous region'), open && g.profile.sigils[b] ? h('span', { class: 'small gold' }, `Cleared ×${g.profile.sigils[b]}`) : null);
      }), h('button', { class: `biome-card finale ${finale ? 'sel' : ''} ${finaleOpen ? '' : 'locked'}`, style: 'background:linear-gradient(135deg, #3a0d12, #1a0f2a 55%, #050508)', disabled: !finaleOpen, 'data-key': 'biome-finale', on: { click: () => { ui.biome = 'finale'; render(); } } },
        h('b', null, `⚜ ${FINALE.name}`), h('span', { class: 'small' }, finaleOpen ? FINALE.tagline : 'Sealed — clear all five regions'), storyOf(g).warrant ? h('span', { class: 'small gold' }, 'Warrant reclaimed') : null)),
      finale
        ? h('div', null, h('p', { class: 'prose' }, FINALE.premise), finaleBlocked(g, partyHeroes) ? h('p', { class: 'small danger' }, finaleBlocked(g, partyHeroes)) : null)
        : h('div', null, h('p', { class: 'prose' }, zone.premise), h('p', { class: 'small muted' }, `${zone.meter.icon} ${zone.meter.name}: ${zone.meter.text}`)),
      h('div', { class: 'row' },
        h('span', null, 'Difficulty'),
        ...(['explorer', 'standard', 'perilous'] as const).map((d) => btn(d[0].toUpperCase() + d.slice(1), () => { ui.difficulty = d; render(); }, { cls: `small ${ui.difficulty === d ? 'on' : ''}`, title: d === 'perilous' ? 'More foes, tougher fights, elite curses, ×1.5 Thrones' : d === 'explorer' ? 'Fewer, softer foes; fewer Thrones' : 'The intended challenge' })),
        h('span', { style: 'margin-left:12px' }, 'Length'),
        ...(['short', 'normal', 'long'] as const).map((s) => btn(s[0].toUpperCase() + s.slice(1), () => { ui.size = s; render(); }, { cls: `small ${ui.size === s ? 'on' : ''}` }))),
      h('div', { class: 'row', style: 'margin-top:8px' },
        h('label', { for: 'seed', title: 'The Fortress shifts between ventures: the seed decides this one\'s shape. Share a seed to share a layout.' }, 'Seed'),
        h('input', { id: 'seed', value: ui.seed, class: 'text-in', style: 'width:160px', on: { change: (e: Event) => { ui.seed = (e.target as HTMLInputElement).value.trim().toUpperCase() || randomSeed(); } } }),
        btn('Random', () => { ui.seed = randomSeed(); render(); }, { cls: 'small' }),
        h('span', { class: 'spacer' }),
        btn(finale ? 'Storm the Heart' : 'Enter the Fortress', () => {
          const r = run(finale
            ? { type: 'startExpedition', partyIds: ui.party, biome: 'core', difficulty: ui.difficulty, seed: ui.seed, finale: true }
            : { type: 'startExpedition', partyIds: ui.party, biome: ui.biome as ZoneId, difficulty: ui.difficulty, seed: ui.seed, size: ui.size });
          if (r.ok) { ui.seed = ''; sfx.fanfare(); }
        }, { cls: 'primary big', disabled: ui.party.length < PARTY_MIN || (finale && !!finaleBlocked(g, partyHeroes)), key: 'start-exp' })),
      h('p', { class: 'small muted' }, 'Consumables in the Hold (up to six stacks) are packed automatically. Your Fortune — dice bag, relics, tarot, scrip — starts fresh every venture, because the Fortress never lets anything out the same twice.'),
    ),
  );
}

function chronicleTab(): HTMLElement {
  const g = app.game!;
  const story = storyOf(g);
  const lc = g.roster.find((x) => x.lordCaptain);
  const para = (t: string) => h('p', { class: 'prose' }, t);
  const pro = prologue(g);
  return h('div', { class: 'col' },
    h('div', { class: 'win chronicle', 'data-tut': 'story' },
      h('div', { class: 'chapter-head' }, pro.head), h('h2', null, pro.title), ...pro.text.map(para),
      h('div', { class: 'heads' }, ...BIOME_ORDER.map((b) => {
        const done = (g.profile.sigils[b] ?? 0) > 0;
        return h('div', { class: `head ${done ? 'broken' : ''}`, style: `--hc:${BIOMES[b].color}`, title: `${BIOMES[b].name}${done ? ' — cleared' : ''}` }, h('span', { class: 'head-dot' }), h('span', { class: 'small' }, BIOMES[b].name.replace(/^The /, '')));
      }))),
    ...BIOME_ORDER.map((b) => {
      const c = CHAPTERS[b];
      const earned = (g.profile.sigils[b] ?? 0) > 0;
      return h('div', { class: `win chronicle ${earned ? '' : 'sealed'}` },
        h('div', { class: 'chapter-head' }, `${c.head} · ${BIOMES[b].name}`),
        earned ? [h('h2', null, c.title), ...c.text.map(para)] : h('p', { class: 'muted' }, `Clear ${BIOMES[b].name} to read this chapter.`));
    }),
    h('div', { class: 'win chronicle finale-win' },
      h('div', { class: 'chapter-head' }, 'The Final Venture'),
      h('h2', null, `⚜ ${FINALE.name}`),
      para(FINALE.premise),
      h('p', { class: lc && lc.level >= FINALE_LEVEL ? 'gold' : 'muted' }, `Requires all five regions cleared and the Lord-Captain at power level ${FINALE_LEVEL}. ${lc ? `${lc.name} is at ${lc.level}.` : ''}`),
      story.warrant ? [h('div', { class: 'chapter-head', style: 'margin-top:10px' }, EPILOGUE.head), h('h3', null, EPILOGUE.title), ...EPILOGUE.text.map(para)] : null),
    h('div', { class: 'win' },
      h('h2', null, 'Share your legend'),
      h('p', { class: 'small muted' }, 'A card with your best explorers, the regions you have cleared, and your record.'),
      h('span', { 'data-tut': 'share' }, btn('🖼 Make a share card', () => openShareCard(g), { cls: 'primary', key: 'share-card' }))),
  );
}

export function itemSummary(defId: string, inst?: ItemInstance): string {
  const d = ITEMS[defId];
  if (!d) return '';
  const bits: string[] = [];
  if (d.weapon) {
    const w = d.weapon;
    bits.push(`${w.cls}`, `${w.dmg}${w.sb ? '+SB' : ''} ${w.type}`, `Pen ${w.pen}`);
    if (w.cls !== 'melee') bits.push(`RoF ${w.rof.map((x, i) => (x ? (i === 0 ? 'S' : x) : '–')).join('/')}`);
    if (w.qualities.length) bits.push(w.qualities.join(', '));
  }
  if (d.armor) bits.push(`AP ${d.armor.ap}`, d.armor.locs.length === 6 ? 'all locations' : d.armor.locs.length === 1 ? d.armor.locs[0] : 'arms, body, legs');
  if (d.text) bits.push(d.text);
  if (inst && (d.kind === 'weapon' || d.kind === 'armor')) { const c = CRAFTS[inst.craft]; bits.push(`${c.name}: ${d.kind === 'armor' ? c.armor : d.weapon!.cls === 'melee' ? c.melee : c.ranged}`); }
  if (inst) for (const m of inst.mods) bits.push(MODS[m]?.text ?? m);
  bits.push(availName(d.avail));
  return bits.filter(Boolean).join(' · ');
}

function marketTab(): HTMLElement {
  const g = app.game!;
  const stock = g.market.stock;
  const groups: Record<string, ItemInstance[]> = {};
  for (const it of stock) (groups[ITEMS[it.defId].kind] ??= []).push(it);
  const trader = bestTrader(g);
  return h('div', { class: 'col' },
    h('div', { class: 'win' },
      h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'The enclave market'), h('span', { class: 'small muted' }, `Stock changes daily · Armsmonger level ${g.profile.facility.armory}`)),
      h('p', { class: 'small muted' }, `Goods rarer than Common need an Acquisition Test: Profit Factor ${effectivePf(g)} + availability + craftsmanship + 30, plus ${Math.floor(trader.target / 5)} from ${trader.hero?.name ?? 'your best trader'}'s Commerce. Each Degree of Success knocks 5% off the price. Fail, and that seller won't deal with you again today.`),
      ...['weapon', 'armor', 'gear', 'consumable'].filter((k) => groups[k]).map((k) => h('div', null, h('h3', null, { weapon: 'Weapons', armor: 'Armour', gear: 'Gear & cybernetics', consumable: 'Medicae, chems & grenades' }[k]),
        h('div', { class: 'list' }, ...groups[k].sort((a, b) => marketPrice(a) - marketPrice(b)).map((it) => {
          const t = acquisitionTarget(g, it);
          const failed = g.market.failed.includes(it.uid);
          const price = marketPrice(it);
          return h('div', { class: 'item-row' }, itemIcon(it.defId), h('div', { class: 'grow' }, h('b', null, itemName(it)), h('div', { class: 'small muted' }, itemSummary(it.defId, it))),
            h('span', { class: 'small', title: 'Acquisition Test' }, t === null ? 'no Test' : `${t}%`),
            h('span', { class: 'gold' }, `${fmt(price)} T`),
            btn(failed ? 'Refused' : 'Acquire', () => { const r = run({ type: 'acquire', uid: it.uid }); if (r.ok) { sfx.coin(); toast(`Acquired ${itemName(it)}.`, true); } }, { cls: 'small', disabled: failed || g.profile.bankedGold < price }));
        }))))),
  );
}

function exchangeTab(): HTMLElement {
  const g = app.game!;
  const valuables = g.vault.filter((i) => ITEMS[i.defId]?.kind === 'valuable');
  const alive = g.roster.filter((x) => x.status === 'alive');
  return h('div', { class: 'col' },
    h('div', { class: 'win' },
      h('h2', null, 'Trade your treasure'),
      h('p', { class: 'prose' }, 'The enclave runs on what comes out of the Fortress. Sell valuables for Thrones at full worth — or present the finest to the enclave\'s elders, and let the story of your House grow (Profit Factor).'),
      valuables.length === 0 ? h('p', { class: 'muted' }, 'No valuables in the Hold. Salvage them in the Fortress.') : null,
      h('div', { class: 'list' }, ...valuables.map((it) => h('div', { class: 'item-row' }, itemIcon(it.defId),
        h('div', { class: 'grow' }, h('b', null, itemName(it)), h('div', { class: 'small muted' }, ITEMS[it.defId].text ?? '')),
        btn(`Sell ${exchangeValue(g, it)} T`, () => { if (run({ type: 'sell', uid: it.uid }).ok) sfx.coin(); }, { cls: 'small' }),
        (ITEMS[it.defId].value ?? 0) >= 150 ? btn(`Present (+${Math.max(1, Math.floor((ITEMS[it.defId].value ?? 0) / 300))} PF)`, () => { if (run({ type: 'present', uid: it.uid }).ok) sfx.fanfare(); }, { cls: 'small primary' }) : null)))),
    h('div', { class: 'win' },
      h('h2', null, 'The Chirurgeon\'s tent'),
      h('p', { class: 'small muted' }, `Treatment, sedation and long talks: remove 10 Insanity for ${treatCost(g)} Thrones.`),
      h('div', { class: 'list' }, ...alive.filter((x) => x.insanity > 0).map((x) => h('div', { class: 'item-row' }, heroPortrait(x), h('div', { class: 'grow' }, h('b', null, x.name), h('div', { class: 'small muted' }, `Insanity ${x.insanity} · Corruption ${x.corruption}`)),
        btn('Treat', () => run({ type: 'treat', heroId: x.id }), { cls: 'small', disabled: g.profile.bankedGold < treatCost(g) })))),
      alive.every((x) => x.insanity === 0) ? h('p', { class: 'muted small' }, 'Everyone is (relatively) sane.') : null),
    facilityWin(),
  );
}

function vaultTab(): HTMLElement {
  const g = app.game!;
  return h('div', { class: 'col' },
    h('div', { class: 'win' },
      h('h2', null, `The Hold (${g.vault.length} items)`),
      h('p', { class: 'small muted' }, 'Equip gear from an explorer\'s sheet in the Muster Hall. Gear sells for 40%; valuables trade at the Exchange.'),
      g.vault.length === 0 ? h('p', { class: 'muted' }, 'Empty. What you carry out of the Fortress lands here.') : null,
      h('div', { class: 'list' }, ...g.vault.map((it) => h('div', { class: 'item-row' }, itemIcon(it.defId),
        h('div', { class: 'grow' }, h('b', null, itemName(it)), h('div', { class: 'small muted' }, itemSummary(it.defId, it))),
        btn(`Sell ${exchangeValue(g, it)} T`, () => { if (run({ type: 'sell', uid: it.uid }).ok) sfx.coin(); }, { cls: 'small' }))))),
    h('div', { class: 'win' }, h('h2', null, 'Backups'),
      h('p', { class: 'small muted' }, 'Browser storage can be cleared. Export a backup file now and then.'),
      btn('Export save file', () => download(`warp-dice-slot${g.slot}.json`, exportSave(g)))),
  );
}

function shrineTab(): HTMLElement {
  const g = app.game!;
  const cap = g.profile.facility.enchanter;
  const gear: { it: ItemInstance; owner?: string }[] = [
    ...g.vault.map((it) => ({ it })),
    ...g.roster.filter((x) => x.status === 'alive').flatMap((x) => Object.values(x.equipment).filter(Boolean).map((it) => ({ it: it!, owner: x.name }))),
  ].filter(({ it }) => ['weapon', 'armor'].includes(ITEMS[it.defId]?.kind));
  return h('div', { class: 'col' },
    h('div', { class: 'win' }, h('h2', null, `Re-craft (up to ${CRAFTS[CRAFT_ORDER[Math.min(3, cap)]].name})`),
      h('p', { class: 'small muted' }, 'The Tech-Shrine\'s acolytes rework weapons and armour to a finer Craftsmanship, and fit upgrades and special ammunition.'),
      h('div', { class: 'list' }, ...gear.map(({ it, owner }) => {
        const def = ITEMS[it.defId];
        const i = CRAFT_ORDER.indexOf(it.craft);
        const fits = Object.values(MODS).filter((m) => modFits(m, def) && !it.mods.includes(m.id) && m.minTier <= cap);
        return h('div', { class: 'item-row' }, itemIcon(it.defId),
          h('div', { class: 'grow' }, h('b', null, itemName(it)), h('div', { class: 'small muted' }, owner ? `Carried by ${owner}` : 'In the Hold')),
          i >= 3 ? h('span', { class: 'small muted' }, 'Best') : i + 1 > cap ? h('span', { class: 'small muted' }, 'Needs a better shrine') : btn(`${CRAFTS[CRAFT_ORDER[i + 1]].name}: ${craftCost(it)} T`, () => { if (run({ type: 'enchant', uid: it.uid }).ok) sfx.coin(); }, { cls: 'small', disabled: g.profile.bankedGold < craftCost(it) }),
          fits.length && it.mods.length < 2 ? h('select', { class: 'sel-in', 'aria-label': 'Fit an upgrade', on: { change: (e: Event) => { const v = (e.target as HTMLSelectElement).value; if (v) run({ type: 'fitMod', uid: it.uid, modId: v }); } } },
            h('option', { value: '' }, 'Fit upgrade…'), ...fits.map((m) => h('option', { value: m.id }, `${m.name} (${m.price} T) — ${m.text}`))) : null);
      }))),
    facilityWin(),
  );
}

function facilityWin(): HTMLElement {
  const g = app.game!;
  const sig = Object.values(g.profile.sigils).reduce((a, b) => a + (b ?? 0), 0);
  return h('div', { class: 'win' }, h('h2', null, 'Enclave upgrades'),
    h('p', { class: 'small muted' }, 'Pay the survivors to build — with Thrones and the warp-keystones only region lords carry.'),
    h('div', { class: 'list' }, ...Object.entries(FACILITIES).map(([id, f]) => {
      const lvl = g.profile.facility[id];
      const cost = facilityCost(id, lvl);
      return h('div', { class: 'item-row' }, h('div', { class: 'grow' }, h('b', null, `${f.name} — level ${lvl}`), h('div', { class: 'small muted' }, f.text)),
        lvl >= f.max ? h('span', { class: 'small muted' }, 'Maxed') : btn(`Upgrade: ${cost.gold} T${cost.sigils ? `, ${cost.sigils} keystones` : ''}`, () => { if (run({ type: 'upgrade', id }).ok) sfx.fanfare(); }, { cls: 'small', disabled: g.profile.bankedGold < cost.gold || sig < cost.sigils }));
    })));
}

function trainingTab(): HTMLElement {
  const g = app.game!;
  const cap = trainingCap(g);
  const alive = g.roster.filter((x) => x.status === 'alive');
  return h('div', { class: 'col' },
    h('div', { class: 'win' }, h('h2', null, 'Advancement'),
      h('p', { class: 'prose' }, 'Experience buys Characteristic advances (+5, priced by career), skills, talents and powers. Rank rises with total experience; every second Rank grants a free Rank Boon talent.'),
      h('div', { class: 'cards' }, ...alive.map((hero) => heroCard(hero, { extra: btn('Advance', () => { app.ui.advance = hero.id; render(); }, { cls: 'small primary' }) })))),
    h('div', { class: 'win' }, h('h2', null, 'Drill for benched retainers'),
      h('p', { class: 'small muted' }, `Drill grants ${DRILL_XP} xp, up to ${fmt(cap)} total experience (a little behind your best crew). Only the Fortress teaches more.`),
      h('div', { class: 'cards' }, ...alive.map((hero) => heroCard(hero, {
        extra: hero.xp + DRILL_XP <= cap ? btn(`Drill — ${trainingCost(g, hero)} T`, () => { if (run({ type: 'train', heroId: hero.id }).ok) sfx.coin(); }, { cls: 'small', disabled: g.profile.bankedGold < trainingCost(g, hero) }) : null,
      })))),
    facilityWin(),
  );
}

function codexTab(): HTMLElement {
  const g = app.game!;
  const s = g.profile.stats;
  return h('div', { class: 'col' },
    h('div', { class: 'win' }, h('h2', null, 'Records'),
      h('table', { class: 'mini' }, ...[
        ['Ventures', s.expeditions], ['Regions cleared', s.clears], ['Withdrawals', s.retreats], ['Disasters', s.wipes], ['Crew lost', s.deaths], ['Thrones traded', fmt(s.thronesTraded)], ['Best single hand', fmt(s.bestScore)], ['Profit Factor', effectivePf(g)],
      ].map(([k, v]) => h('tr', null, h('th', null, String(k)), h('td', null, String(v)))))),
    h('div', { class: 'win' }, h('h2', null, `Relics found (${g.profile.codex.charms.length}/${CHARMS.length})`),
      h('div', { class: 'charm-bar' }, ...CHARMS.map((c) => (g.profile.codex.charms.includes(c.id) ? charmEl(c.id) : h('div', { class: 'charm empty', title: 'Undiscovered' }))))),
    h('div', { class: 'win' }, h('h2', null, `Bestiary (${g.profile.codex.monsters.length})`),
      h('div', { class: 'cards' }, ...g.profile.codex.monsters.map((id) => MONSTERS[id]).filter(Boolean).map((m) => h('div', { class: 'item-row' },
        h('div', { class: 'icon', style: 'width:56px;height:56px' }, art(`monsters/${m.biome}_${m.id}`, m.name)), h('div', null, h('b', null, m.name), h('div', { class: 'small muted' }, m.flavor)))))),
    h('div', { class: 'win' }, h('h2', null, 'Hands'),
      h('table', { class: 'mini' }, h('tr', null, h('th', null, 'Hand'), h('th', null, 'Chips'), h('th', null, 'Mult'), h('th', null, 'Per Tarot')),
        ...HANDS.map((x) => h('tr', null, h('td', null, x.name, g.profile.codex.hands.includes(x.id) ? '' : ' ?'), h('td', { class: 'chipc' }, x.chips), h('td', { class: 'multc' }, `×${x.mult}`), h('td', { class: 'small muted' }, `+${x.lvChips} / +${x.lvMult}`))))),
    h('div', { class: 'win' }, h('h2', null, 'Availability'), h('p', { class: 'small muted' }, AVAIL.join(' · '))),
  );
}

export const SLOT_NAMES: Record<EquipSlot, string> = { mainHand: 'Main hand', offHand: 'Off hand', armor: 'Armour', gear1: 'Gear', gear2: 'Gear' };

export { CAREERS };
