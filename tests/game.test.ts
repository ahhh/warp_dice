import { describe, it, expect } from 'vitest';
import { newGame, quickDynasty, foundDynasty, acquisitionTarget } from '../src/meta/town.ts';
import { dispatch } from '../src/app/commands.ts';
import { autoExpedition, autoCombatStep, autoExploreStep, autoAdvanceAll } from '../src/app/autoplay.ts';
import { fullRestore } from '../src/rules/character.ts';
import { autoSpend } from '../src/rules/advance.ts';
import { START_XP, XP_PER_LEVEL } from '../src/content/careers.ts';
import type { CareerId, GameState } from '../src/engine/types.ts';
import { exportSave, importSave, migrate } from '../src/persistence/save.ts';
import { makeCtx, kill, current } from '../src/combat/core.ts';

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }
const ids = (g: GameState) => g.roster.filter((h) => h.status === 'alive').map((h) => h.id);

describe('founding a Dynasty', () => {
  it('needs a Rogue Trader Lord-Captain and two or three retainers', () => {
    const g = newGame(1, 'legacy', 'F');
    expect(foundDynasty(g, { captain: { careerId: 'archMilitant' }, retinue: [{ careerId: 'missionary' }, { careerId: 'seneschal' }] })).toMatch(/Rogue Trader/);
    expect(foundDynasty(g, { captain: { careerId: 'rogueTrader' }, retinue: [{ careerId: 'missionary' }] })).toMatch(/two or three/);
    expect(foundDynasty(g, { captain: { careerId: 'rogueTrader' }, retinue: [{ careerId: 'rogueTrader' }, { careerId: 'missionary' }] })).toMatch(/only one/);
    expect(foundDynasty(g, { captain: { careerId: 'rogueTrader', name: 'Lucan Vantorre' }, retinue: [{ careerId: 'missionary' }, { careerId: 'navigator' }, { careerId: 'explorator' }] })).toBeNull();
    expect(g.phase).toBe('play');
    expect(g.roster.length).toBe(4);
    expect(g.roster.filter((h) => h.lordCaptain).length).toBe(1);
    expect(g.market.stock.length).toBeGreaterThan(0);
  });
});

describe('ventures', () => {
  it('headless runs end in a valid state; the Lord-Captain must lead; parties are 2–4', () => {
    const g = newGame(1, 'legacy', 'R');
    quickDynasty(g);
    const captain = g.roster.find((h) => h.lordCaptain)!;
    expect(dispatch(g, { type: 'startExpedition', partyIds: ids(g).filter((x) => x !== captain.id), biome: 'docks', difficulty: 'standard', seed: 'X' }).ok).toBe(false);
    expect(dispatch(g, { type: 'startExpedition', partyIds: [captain.id], biome: 'docks', difficulty: 'standard', seed: 'X' }).ok).toBe(false);
    expect(dispatch(g, { type: 'startExpedition', partyIds: ids(g), biome: 'core', difficulty: 'standard', seed: 'X' }).ok).toBe(false);
    let wins = 0;
    for (let i = 0; i < 8 && g.phase === 'play'; i++) {
      const before = g.profile.bankedGold;
      expect(dispatch(g, { type: 'startExpedition', partyIds: ids(g).slice(0, 4), biome: 'docks', difficulty: 'standard', seed: `RUN-${i}` }).ok).toBe(true);
      expect(autoExpedition(g).result).not.toBe('stuck');
      expect(g.expedition).toBeUndefined();
      if (g.lastResult!.kind === 'won') { wins++; expect(g.profile.bankedGold).toBe(before + g.lastResult!.gold); expect(g.profile.unlockedBiomes).toContain('gardens'); }
      dispatch(g, { type: 'ackResult' });
      autoAdvanceAll(g);
      while (g.roster.filter((h) => h.status === 'alive').length < 3 && g.recruits.length) dispatch(g, { type: 'hire', idx: 0 });
    }
    expect(wins).toBeGreaterThan(3);
  });

  it('saving and reloading mid-combat reproduces the same next outcome', () => {
    const g = newGame(1, 'legacy', 'DET');
    quickDynasty(g);
    dispatch(g, { type: 'startExpedition', partyIds: ids(g), biome: 'docks', difficulty: 'standard', seed: 'DET-1' });
    let guard = 0;
    while (g.expedition && !(g.expedition.combat?.status === 'active') && guard++ < 300) autoExploreStep(g);
    expect(g.expedition?.combat?.status).toBe('active');
    const b = clone(g);
    for (let i = 0; i < 6; i++) { if (g.expedition?.combat?.status === 'active') autoCombatStep(g); if (b.expedition?.combat?.status === 'active') autoCombatStep(b); }
    expect(JSON.stringify(g)).toBe(JSON.stringify(b));
  });

  it('the Lord-Captain\'s death ends the Dynasty unless a Fate Point is burned', () => {
    const g = newGame(1, 'legacy', 'DEATH');
    quickDynasty(g);
    dispatch(g, { type: 'startExpedition', partyIds: ids(g), biome: 'docks', difficulty: 'standard', seed: 'D-1' });
    let guard = 0;
    while (g.expedition && !(g.expedition.combat?.status === 'active') && guard++ < 300) autoExploreStep(g);
    const ctx = makeCtx(g);
    const cap = ctx.combat.combatants[g.roster.find((h) => h.lordCaptain)!.id];
    const hero = g.roster.find((h) => h.lordCaptain)!;
    const fateMax = hero.fateMax;
    kill(ctx, cap, 'test');
    expect(cap.dead).toBe(false);
    expect(hero.fateMax).toBe(fateMax - 1);
    hero.fate = 0;
    kill(ctx, cap, 'test');
    expect(cap.dead).toBe(true);
    guard = 0;
    while (g.expedition?.combat?.status === 'active' && guard++ < 50) { if (!current(makeCtx(g)) || !autoCombatStep(g)) break; }
    expect(g.expedition).toBeUndefined();
    expect(g.phase).toBe('over');
    expect(g.lastResult?.captainLost).toBe(true);
    expect(dispatch(g, { type: 'startExpedition', partyIds: ids(g), biome: 'docks', difficulty: 'standard', seed: 'D-2' }).ok).toBe(false);
  });

  it('every career completes runs at power levels 1, 8, 15 and 20 without getting stuck', () => {
    const comps: CareerId[][] = [['archMilitant', 'missionary', 'voidMaster'], ['astropath', 'explorator', 'seneschal'], ['navigator', 'archMilitant', 'missionary']];
    for (const lvl of [1, 8, 15, 20]) comps.forEach((comp, i) => {
      const g = newGame(1, 'legacy', `ALL-${lvl}-${i}`);
      quickDynasty(g, comp);
      g.profile.unlockedBiomes = ['docks', 'gardens', 'reliquary', 'labyrinth', 'core'];
      for (const h of g.roster) { h.xp = START_XP + (lvl - 1) * XP_PER_LEVEL; autoSpend(h); fullRestore(h); }
      const biome = (['docks', 'gardens', 'reliquary', 'labyrinth', 'core'] as const)[(i + lvl) % 5];
      expect(dispatch(g, { type: 'startExpedition', partyIds: ids(g), biome, difficulty: 'standard', seed: `ALL-${lvl}-${i}` }).ok).toBe(true);
      expect(autoExpedition(g, 8000).result, `L${lvl} ${comp.join('/')} in ${biome}`).not.toBe('stuck');
    });
  }, 120000);
});

describe('the enclave', () => {
  it('acquisition tests scale with Profit Factor and availability; valuables trade', () => {
    const g = newGame(1, 'legacy', 'MKT');
    quickDynasty(g);
    const rare = { uid: 'x', defId: 'boltgun', craft: 'common' as const, mods: [] };
    const common = { uid: 'y', defId: 'laspistol', craft: 'common' as const, mods: [] };
    expect(acquisitionTarget(g, common)).toBeNull();
    const t1 = acquisitionTarget(g, rare)!;
    g.profile.profitFactor += 10;
    expect(acquisitionTarget(g, rare)).toBe(t1 + 10);
    g.vault.push({ uid: 'v1', defId: 'blackstoneShard', craft: 'common', mods: [] });
    const gold = g.profile.bankedGold;
    expect(dispatch(g, { type: 'sell', uid: 'v1' }).ok).toBe(true);
    expect(g.profile.bankedGold).toBeGreaterThanOrEqual(gold + 200);
    g.vault.push({ uid: 'v2', defId: 'xenosIdol', craft: 'common', mods: [] });
    const pf = g.profile.profitFactor;
    expect(dispatch(g, { type: 'present', uid: 'v2' }).ok).toBe(true);
    expect(g.profile.profitFactor).toBe(pf + 1);
  });
});

describe('saves', () => {
  it('export/import round-trips and rejects tampering', () => {
    const g = newGame(2, 'story', 'SAVE');
    quickDynasty(g);
    const text = exportSave(g);
    const r = importSave(text, 3);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.game.roster.length).toBe(4);
    const bad = text.replace(/\\"bankedGold\\":\d+/, '\\"bankedGold\\":999999');
    expect(bad).not.toBe(text);
    expect(importSave(bad, 3).ok).toBe(false);
    expect(migrate(clone(g)).schemaVersion).toBe(1);
  });
});
