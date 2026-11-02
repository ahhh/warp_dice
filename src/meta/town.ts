/**
 * The Threshold enclave: survivors camped at the mouth of the Blackstone
 * Fortress. Found a Dynasty, recruit retainers, buy gear (Thrones plus an
 * Acquisition Test for rare goods), trade valuables, upgrade craftsmanship at
 * the Tech-Shrine, and spend experience.
 */
import type { CareerId, Char, EquipSlot, GameState, Hero, ItemInstance } from '../engine/types.ts';
import { Rng, makeStreams } from '../engine/rng.ts';
import { test } from '../engine/dice.ts';
import { CAREERS, CAREER_IDS, START_XP, levelFromXp } from '../content/careers.ts';
import { ITEMS, MODS, CRAFTS, CRAFT_ORDER, AVAIL_MOD, sellValue, itemValue, isTwoHanded, itemName, modFits } from '../content/items.ts';
import { NAMES } from '../content/origins.ts';
import { createHero, derive, fullRestore, syncLevel, originOutcome, originOptsOf, type RollMethod } from '../rules/character.ts';
import { autoSpend, buyAdvance } from '../rules/advance.ts';
import { rollMarket } from './loot.ts';

export const SCHEMA_VERSION = 1;
export const CONTENT_REVISION = 'wd-1.0';
/** What is left of the family fortune. */
export const STARTING_GOLD = 120;
/** A fallen Dynasty's standing: the name still carries weight. */
export const STARTING_PF = 12;

export const FACILITIES: Record<string, { name: string; text: string; max: number }> = {
  guild: { name: 'Muster Hall', text: 'More would-be retainers to choose from and room for a bigger crew.', max: 4 },
  armory: { name: 'Armsmonger\'s Row', text: 'Rarer weapons, armour and gear in the market.', max: 4 },
  apothecary: { name: 'Chirurgeon\'s Tent', text: 'Better medicae and chems; cheaper treatment of Insanity.', max: 4 },
  enchanter: { name: 'Tech-Shrine', text: 'Higher Craftsmanship upgrades and weapon modifications.', max: 3 },
  training: { name: 'Drill Deck', text: 'Cheaper drill for benched retainers.', max: 3 },
};

export function facilityCost(_id: string, level: number): { gold: number; sigils: number } {
  return { gold: 200 * level * level, sigils: Math.max(0, level - 1) };
}

function townRng(g: GameState): Rng {
  return new Rng(g.townRng);
}

// ── a new Dynasty ───────────────────────────────────────────────────────────

export function newGame(slot: number, mode: 'legacy' | 'story', seed = `DYNASTY-${Date.now()}`): GameState {
  const rng = new Rng(makeStreams(seed).town);
  const g: GameState = {
    schemaVersion: SCHEMA_VERSION, contentRevision: CONTENT_REVISION, slot, mode, createdAt: Date.now(), savedAt: Date.now(), phase: 'create',
    profile: {
      bankedGold: STARTING_GOLD, profitFactor: STARTING_PF, unlockedBiomes: ['docks'], sigils: {},
      facility: { guild: 1, armory: 1, apothecary: 1, enchanter: 1, training: 1 },
      codex: { charms: [], monsters: [], hands: [] }, stats: { expeditions: 0, clears: 0, wipes: 0, deaths: 0, bestScore: 0, retreats: 0, thronesTraded: 0 }, townDay: 1,
      story: { seen: [], warrant: 0 }, dynastyName: rng.pick(NAMES.dynasty), shipName: rng.pick(NAMES.ships),
    },
    roster: [], vault: [], recruits: [], market: { stock: [], failed: [], day: 0 }, townRng: rng.state, uidCounter: 0,
    settings: { fast: false, sound: true }, tutorial: { step: 0, tips: [] },
  };
  return g;
}

export interface CreateSpec {
  careerId: CareerId;
  name?: string;
  path?: string[];
  pathOpts?: number[];
  method?: RollMethod;
  chars?: Record<Char, number>;
  portrait?: string;
}

/** Pre-built quick-start templates: a sensible Origin Path per career. */
export const TEMPLATES: Record<CareerId, { path: string[]; pathOpts: number[]; blurb: string }> = {
  rogueTrader: { path: ['nobleBorn', 'savant', 'dutyBound', 'shipLorn', 'renown'], pathOpts: [-1, 1, 2, 0, 0], blurb: 'Noble-born heir, bound to the Dynasty, robbed of the flagship and determined to be remembered.' },
  archMilitant: { path: ['deathWorld', 'scapegrace', 'criminal', 'handOfWar', 'endurance'], pathOpts: [-1, 1, 1, 1, -1], blurb: 'A death-world killer with a price on their head and a war they never left.' },
  astropath: { path: ['imperialWorld', 'savant', 'dutyBound', 'darkVoyage', 'prestige'], pathOpts: [-1, 0, 0, 1, 1], blurb: 'Soul-bound, dutiful, and haunted by what the warp has shown them.' },
  explorator: { path: ['forgeWorld', 'childOfCreed', 'dutyBound', 'darkVoyage', 'pride'], pathOpts: [2, 0, 0, 0, 0], blurb: 'A forge-world Magos who will open any vault, consequences later.' },
  missionary: { path: ['imperialWorld', 'childOfCreed', 'zealot', 'darkVoyage', 'pride'], pathOpts: [-1, 0, 1, 1, 1], blurb: 'A firebrand of the Creed who has seen the bulkheads bleed.' },
  navigator: { path: ['nobleBorn', 'vaunted', 'chosenByDestiny', 'highVendetta', 'pride'], pathOpts: [-1, 0, 2, 0, 0], blurb: 'Navis Nobilite of a minor house, fated for greatness and nursing a feud.' },
  seneschal: { path: ['hiveWorld', 'savant', 'dutyBound', 'shipLorn', 'renown'], pathOpts: [-1, 0, 2, 0, 1], blurb: 'A hive-born factotum who has kept the family\'s books through the worst of it.' },
  voidMaster: { path: ['voidBorn', 'scapegrace', 'renegade', 'shipLorn', 'renown'], pathOpts: [-1, 1, 1, 0, 1], blurb: 'Void-born pilot who went down with the flagship and walked away.' },
};

export function buildHero(g: GameState, spec: CreateSpec, opts: { lordCaptain?: boolean; xp?: number } = {}): Hero {
  const rng = townRng(g);
  const tpl = TEMPLATES[spec.careerId];
  const h = createHero(rng, spec.careerId, {
    name: spec.name?.trim() || undefined, path: spec.path ?? tpl.path, pathOpts: spec.pathOpts ?? tpl.pathOpts, method: spec.method, chars: spec.chars,
    lordCaptain: opts.lordCaptain, xp: opts.xp, taken: g.roster.map((x) => x.name), portrait: spec.portrait,
  });
  g.townRng = rng.state;
  return h;
}

export function foundDynasty(g: GameState, o: { dynastyName?: string; shipName?: string; captain: CreateSpec; retinue: CreateSpec[] }): string | null {
  if (g.phase !== 'create') return 'The Dynasty is already founded.';
  if (o.captain.careerId !== 'rogueTrader') return 'The Lord-Captain must be a Rogue Trader.';
  if (o.retinue.length < 2 || o.retinue.length > 3) return 'Choose two or three retainers.';
  if (o.retinue.some((r) => r.careerId === 'rogueTrader')) return 'A Dynasty has only one Rogue Trader.';
  if (o.dynastyName?.trim()) g.profile.dynastyName = o.dynastyName.trim();
  if (o.shipName?.trim()) g.profile.shipName = o.shipName.trim();
  const captain = buildHero(g, o.captain, { lordCaptain: true });
  if (!o.captain.name?.trim()) captain.name = `${captain.name.split(' ')[0]} ${g.profile.dynastyName}`;
  g.roster.push(captain);
  for (const r of o.retinue) g.roster.push(buildHero(g, r));
  for (const h of g.roster) fullRestore(h);
  // Origin Path effects on the group's Profit Factor (Noble Born, Calamity…).
  const pf = g.roster.reduce((acc, h) => acc + originOutcome([h.origin.homeWorld, h.origin.birthright, h.origin.lure, h.origin.trial, h.origin.motivation], originOptsOf(h)).pf, 0);
  g.profile.profitFactor = Math.max(5, STARTING_PF + pf);
  g.phase = 'play';
  refreshRecruits(g);
  refreshMarket(g, true);
  return null;
}

/** A fully random crew (used by tests, the simulator and "Randomise all"). */
export function quickDynasty(g: GameState, careers: CareerId[] = ['archMilitant', 'missionary', 'voidMaster']): string | null {
  return foundDynasty(g, { captain: { careerId: 'rogueTrader' }, retinue: careers.map((c) => ({ careerId: c })) });
}

// ── roster and recruits ─────────────────────────────────────────────────────

export function rosterCap(g: GameState): number {
  return 6 + 2 * (g.profile.facility.guild - 1);
}

/** Retainers turn up a little behind your best crew. */
export function recruitXp(g: GameState): number {
  const alive = g.roster.filter((h) => h.status === 'alive').map((h) => h.xp).sort((a, b) => a - b);
  if (!alive.length) return 0;
  const median = alive[Math.floor(alive.length / 2)];
  return Math.max(0, median - START_XP - 2500);
}

export function refreshRecruits(g: GameState) {
  const rng = townRng(g);
  const n = 2 + g.profile.facility.guild;
  const owned = new Set(g.roster.filter((h) => h.status === 'alive').map((h) => h.careerId));
  const pool = CAREER_IDS.filter((c) => c !== 'rogueTrader');
  const careers = rng.shuffle(pool.slice()).sort((a, b) => Number(owned.has(a)) - Number(owned.has(b)));
  const taken = g.roster.map((h) => h.name);
  const xp = recruitXp(g);
  g.recruits = [];
  for (const c of careers.slice(0, n)) {
    const r = createHero(rng, c, { method: 'arranged', taken, xp: Math.round(xp * (rng.chance(0.3) ? 0.8 : 1)) });
    autoSpend(r, rng);
    fullRestore(r);
    taken.push(r.name);
    g.recruits.push(r);
  }
  g.townRng = rng.state;
}

export function recruitCost(h: Hero, g?: GameState): number {
  if (g && g.roster.filter((x) => x.status === 'alive').length < 3) return 0;
  return 30 + Math.round((h.xp - START_XP) / 25);
}

export function hire(g: GameState, idx: number): string | null {
  const h = g.recruits[idx];
  if (!h) return 'No such recruit.';
  if (g.roster.filter((x) => x.status === 'alive').length >= rosterCap(g)) return 'Your crew quarters are full.';
  const cost = recruitCost(h, g);
  if (g.profile.bankedGold < cost) return `Signing them on costs ${cost} Thrones.`;
  g.profile.bankedGold -= cost;
  g.roster.push(h);
  g.recruits.splice(idx, 1);
  return null;
}

export function rerollRecruits(g: GameState): string | null {
  const cost = 20;
  if (g.profile.bankedGold < cost) return `Needs ${cost} Thrones.`;
  g.profile.bankedGold -= cost;
  refreshRecruits(g);
  return null;
}

export function retire(g: GameState, heroId: string): string | null {
  const h = g.roster.find((x) => x.id === heroId);
  if (!h || h.status !== 'alive') return 'Not available.';
  if (h.lordCaptain) return 'The Lord-Captain does not retire.';
  for (const slot of Object.keys(h.equipment) as EquipSlot[]) {
    const it = h.equipment[slot];
    if (it) g.vault.push(it);
  }
  h.equipment = {};
  h.status = 'retired';
  return null;
}

// ── the market (Acquisition) ────────────────────────────────────────────────

export function refreshMarket(g: GameState, force = false) {
  if (!force && g.market.day === g.profile.townDay) return;
  const rng = townRng(g);
  g.market = { stock: rollMarket(rng, { armory: g.profile.facility.armory, apothecary: g.profile.facility.apothecary }, effectivePf(g)), failed: [], day: g.profile.townDay };
  g.townRng = rng.state;
}

export function effectivePf(g: GameState): number {
  const lc = g.roster.find((h) => h.lordCaptain && h.status === 'alive');
  return g.profile.profitFactor + (lc ? derive(lc).pfBonus : 0);
}

/** The crew's best trader: Commerce if trained, else half Fellowship. */
export function bestTrader(g: GameState): { hero?: Hero; target: number } {
  let best: { hero?: Hero; target: number } = { target: 0 };
  for (const h of g.roster.filter((x) => x.status === 'alive')) {
    const d = derive(h);
    const t = d.skills.commerce ?? Math.floor(d.chars.Fel / 2);
    if (t > best.target) best = { hero: h, target: t };
  }
  return best;
}

/**
 * Acquisition Test (Core p.274, adapted): Profit Factor + Availability
 * modifier + Craftsmanship modifier + 30 for a single personal item, with a
 * bonus from the crew's best trader. Common goods need no Test.
 */
export function acquisitionTarget(g: GameState, inst: ItemInstance): number | null {
  const def = ITEMS[inst.defId];
  if (!def || def.avail <= 3) return null;
  const craft = { poor: 10, common: 0, good: -10, best: -30 }[inst.craft];
  const trader = Math.floor(bestTrader(g).target / 5);
  return Math.max(1, Math.min(99, effectivePf(g) + AVAIL_MOD[def.avail] + craft + 30 + trader));
}

export function marketPrice(inst: ItemInstance): number {
  return itemValue(inst);
}

export function acquire(g: GameState, uid: string): string | null {
  refreshMarket(g);
  const idx = g.market.stock.findIndex((i) => i.uid === uid);
  if (idx < 0) return 'No longer for sale.';
  const inst = g.market.stock[idx];
  if (g.market.failed.includes(uid)) return 'The seller will not deal with you again today.';
  let price = marketPrice(inst);
  if (g.profile.bankedGold < price) return `Costs ${price} Thrones.`;
  const target = acquisitionTarget(g, inst);
  if (target !== null) {
    const rng = townRng(g);
    const r = test(rng, target);
    g.townRng = rng.state;
    if (!r.success) {
      g.market.failed.push(uid);
      return `Acquisition failed (${r.roll} vs ${target}). The seller wants someone with a better name. Try again another day.`;
    }
    price = Math.round(price * Math.max(0.7, 1 - 0.05 * r.degrees));
  }
  g.profile.bankedGold -= price;
  g.market.stock.splice(idx, 1);
  const def = ITEMS[inst.defId];
  const existing = def.kind === 'consumable' ? g.vault.find((i) => i.defId === inst.defId) : undefined;
  if (existing) existing.qty = (existing.qty ?? 1) + (inst.qty ?? 1);
  else g.vault.push(inst);
  return null;
}

export function appraiser(g: GameState): boolean {
  return g.roster.some((h) => h.status === 'alive' && derive(h).features.has('appraiser'));
}

export function exchangeValue(g: GameState, inst: ItemInstance): number {
  const unit = { ...inst, qty: 1 };
  const def = ITEMS[inst.defId];
  return Math.round(sellValue(unit) * (def?.kind === 'valuable' && appraiser(g) ? 1.15 : 1));
}

export function sell(g: GameState, uid: string): string | null {
  const idx = g.vault.findIndex((i) => i.uid === uid);
  if (idx < 0) return 'Not in the hold.';
  const it = g.vault[idx];
  const v = exchangeValue(g, it);
  g.profile.bankedGold += v;
  g.profile.stats.thronesTraded += v;
  if ((it.qty ?? 1) > 1) it.qty! -= 1;
  else g.vault.splice(idx, 1);
  return null;
}

/** Present a valuable to the enclave's elders: renown instead of coin. */
export function presentValuable(g: GameState, uid: string): string | null {
  const idx = g.vault.findIndex((i) => i.uid === uid);
  if (idx < 0) return 'Not in the hold.';
  const it = g.vault[idx];
  const def = ITEMS[it.defId];
  if (def?.kind !== 'valuable') return 'Only valuables impress the enclave.';
  if ((def.value ?? 0) < 150) return 'Too small a gift to be talked about.';
  const pf = Math.max(1, Math.floor((def.value ?? 0) / 300));
  g.profile.profitFactor += pf;
  if ((it.qty ?? 1) > 1) it.qty! -= 1; else g.vault.splice(idx, 1);
  return null;
}

// ── equipment ───────────────────────────────────────────────────────────────

export function canEquip(h: Hero, inst: ItemInstance, slot: EquipSlot): string | null {
  const def = ITEMS[inst.defId];
  if (!def) return 'Unknown item.';
  switch (slot) {
    case 'mainHand':
      return def.kind === 'weapon' ? null : 'Not a weapon.';
    case 'offHand':
      if (def.kind !== 'weapon') return 'Not an off-hand item.';
      if (def.weapon!.twoHanded) return 'Needs both hands.';
      if (isTwoHanded(h.equipment.mainHand)) return 'Your main weapon needs both hands.';
      return null;
    case 'armor':
      return def.kind === 'armor' ? null : 'Not armour.';
    case 'gear1': case 'gear2':
      return def.kind === 'gear' ? null : 'Not gear.';
  }
}

export function equip(g: GameState, heroId: string, uid: string, slot: EquipSlot): string | null {
  const h = g.roster.find((x) => x.id === heroId);
  if (!h) return 'No explorer.';
  const idx = g.vault.findIndex((i) => i.uid === uid);
  if (idx < 0) return 'Not in the hold.';
  const inst = g.vault[idx];
  const err = canEquip(h, inst, slot);
  if (err) return err;
  const frac = h.hp / derive(h).maxHp;
  g.vault.splice(idx, 1);
  const old = h.equipment[slot];
  if (old) g.vault.push(old);
  h.equipment[slot] = inst;
  if (slot === 'mainHand' && isTwoHanded(inst) && h.equipment.offHand) { g.vault.push(h.equipment.offHand); delete h.equipment.offHand; }
  h.hp = Math.max(1, Math.round(derive(h).maxHp * frac));
  return null;
}

export function unequip(g: GameState, heroId: string, slot: EquipSlot): string | null {
  const h = g.roster.find((x) => x.id === heroId);
  if (!h || !h.equipment[slot]) return 'Nothing there.';
  g.vault.push(h.equipment[slot]!);
  delete h.equipment[slot];
  h.hp = Math.min(h.hp, derive(h).maxHp);
  return null;
}

// ── the Tech-Shrine ─────────────────────────────────────────────────────────

function findOwned(g: GameState, uid: string): ItemInstance | undefined {
  return g.vault.find((i) => i.uid === uid) ?? g.roster.flatMap((h) => Object.values(h.equipment)).find((i) => i?.uid === uid);
}

export function craftCost(inst: ItemInstance): number {
  const def = ITEMS[inst.defId];
  const next = CRAFT_ORDER[CRAFT_ORDER.indexOf(inst.craft) + 1];
  if (!def || !next) return Infinity;
  return Math.round(def.price * (CRAFTS[next].price - CRAFTS[inst.craft].price) * 1.1 + 40);
}

export function enchant(g: GameState, uid: string): string | null {
  const inst = findOwned(g, uid);
  if (!inst) return 'Item not found.';
  const def = ITEMS[inst.defId];
  if (!def || (def.kind !== 'weapon' && def.kind !== 'armor')) return 'Only weapons and armour can be re-crafted.';
  const i = CRAFT_ORDER.indexOf(inst.craft);
  if (i >= 3) return 'Already Best-Craftsmanship.';
  if (i + 1 > g.profile.facility.enchanter) return 'The Tech-Shrine cannot do finer work yet.';
  const cost = craftCost(inst);
  if (g.profile.bankedGold < cost) return `Needs ${cost} Thrones.`;
  g.profile.bankedGold -= cost;
  inst.craft = CRAFT_ORDER[i + 1];
  return null;
}

export function fitMod(g: GameState, uid: string, modId: string): string | null {
  const inst = findOwned(g, uid);
  const m = MODS[modId];
  if (!inst || !m) return 'Not found.';
  const def = ITEMS[inst.defId];
  if (!modFits(m, def)) return `${m.name} does not fit a ${def.name}.`;
  if (inst.mods.includes(modId)) return 'Already fitted.';
  if (inst.mods.length >= 2) return 'No room for another modification.';
  if (m.minTier > g.profile.facility.enchanter) return 'The Tech-Shrine cannot do that work yet.';
  if (g.profile.bankedGold < m.price) return `Needs ${m.price} Thrones.`;
  g.profile.bankedGold -= m.price;
  inst.mods.push(modId);
  return null;
}

export function upgradeFacility(g: GameState, id: string): string | null {
  const f = FACILITIES[id];
  if (!f) return 'Unknown facility.';
  const lvl = g.profile.facility[id];
  if (lvl >= f.max) return 'Already at maximum.';
  const { gold, sigils } = facilityCost(id, lvl);
  const total = Object.values(g.profile.sigils).reduce((a, b) => a + (b ?? 0), 0);
  if (total < sigils) return `Needs ${sigils} warp-keystones (you have ${total}).`;
  if (g.profile.bankedGold < gold) return `Needs ${gold} Thrones.`;
  g.profile.bankedGold -= gold;
  g.profile.facility[id] = lvl + 1;
  if (id === 'guild') refreshRecruits(g);
  if (id === 'armory' || id === 'apothecary') refreshMarket(g, true);
  return null;
}

// ── the Chirurgeon ──────────────────────────────────────────────────────────

export function treatCost(g: GameState): number {
  return Math.round(150 * (1 - 0.15 * (g.profile.facility.apothecary - 1)));
}

export function treatInsanity(g: GameState, heroId: string): string | null {
  const h = g.roster.find((x) => x.id === heroId);
  if (!h || h.status !== 'alive') return 'Not available.';
  if (h.insanity < 1) return 'Their mind is (relatively) sound.';
  const cost = treatCost(g);
  if (g.profile.bankedGold < cost) return `Needs ${cost} Thrones.`;
  g.profile.bankedGold -= cost;
  h.insanity = Math.max(0, h.insanity - 10);
  return null;
}

// ── the Drill Deck and advancement ──────────────────────────────────────────

export function trainingCap(g: GameState): number {
  const xps = g.roster.filter((h) => h.status === 'alive').map((h) => h.xp).sort((a, b) => b - a);
  const top = xps.slice(0, 4);
  const median = top.length ? top[Math.floor(top.length / 2)] : START_XP;
  return Math.max(START_XP, median - 1500);
}

export const DRILL_XP = 250;

export function trainingCost(g: GameState, h: Hero): number {
  return Math.round(60 * levelFromXp(h.xp) * (1 - 0.15 * (g.profile.facility.training - 1)));
}

export function train(g: GameState, heroId: string): string | null {
  const h = g.roster.find((x) => x.id === heroId);
  if (!h || h.status !== 'alive') return 'Not available.';
  if (h.xp + DRILL_XP > trainingCap(g)) return 'They have nothing left to learn from drill — only the Fortress can teach them now.';
  const cost = trainingCost(g, h);
  if (g.profile.bankedGold < cost) return `Needs ${cost} Thrones.`;
  g.profile.bankedGold -= cost;
  h.xp += DRILL_XP;
  syncLevel(h);
  return null;
}

const ADVANCE_IN_TOWN = 'Experience is spent in the enclave, between ventures.';

export function advance(g: GameState, heroId: string, advId: string, boon = false): string | null {
  const h = g.roster.find((x) => x.id === heroId);
  if (g.expedition) return ADVANCE_IN_TOWN;
  if (!h || h.status !== 'alive') return 'No explorer.';
  return buyAdvance(h, advId, { boon });
}

export function autoAdvance(g: GameState, heroId: string): string | null {
  const h = g.roster.find((x) => x.id === heroId);
  if (g.expedition) return ADVANCE_IN_TOWN;
  if (!h || h.status !== 'alive') return 'No explorer.';
  autoSpend(h);
  return null;
}

export function partySuggestion(g: GameState): string[] {
  const alive = g.roster.filter((h) => h.status === 'alive').sort((a, b) => b.xp - a.xp);
  const lc = alive.find((h) => h.lordCaptain);
  const out = lc ? [lc] : [];
  for (const h of alive) if (out.length < 4 && !out.includes(h)) out.push(h);
  return out.map((h) => h.id);
}

export function heroValueText(h: Hero): string {
  return `${h.name} — ${CAREERS[h.careerId].name}`;
}

export { itemName, itemValue };
