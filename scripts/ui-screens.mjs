// Screenshot the enclave tabs and overlays from a pre-built Dynasty (dev server).
import { chromium } from 'playwright';
const OUT = process.env.SHOTS ?? 'test-results';
const url = process.env.URL ?? 'http://localhost:5181/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', (d) => d.accept());
await page.goto(url);
await page.waitForFunction(() => window.__wd);
await page.evaluate(() => {
  const { newGame, quickDynasty, setGame, render, app } = window.__wd;
  const g = newGame(3, 'legacy', 'SHOTS');
  quickDynasty(g, ['astropath', 'navigator', 'explorator']);
  g.tutorial = null;
  g.profile.bankedGold = 2000;
  g.vault.push({ uid: 'v1', defId: 'blackstoneShard', craft: 'common', mods: [] }, { uid: 'v2', defId: 'xenosIdol', craft: 'common', mods: [] }, { uid: 'w1', defId: 'boltgun', craft: 'good', mods: ['redDot'] });
  setGame(g); app.ui.townTab = 'guild'; render();
});
const shot = async (n, full = false) => { await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}/s-${n}.png`, fullPage: full }); };
for (const t of ['armory', 'exchange', 'enchanter', 'training', 'chronicle', 'codex']) { await page.locator(`[data-key="tab-${t}"]`).click(); await shot(t, true); }
await page.locator('[data-key="tab-guild"]').click();
await page.locator('.hero-card').nth(1).click();
await shot('sheet', true);
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Advance' }).first().click();
await shot('advance');
await page.keyboard.press('Escape');
// A venture, driven to its first event or fight, then to the end by the autoplayer.
await page.evaluate(() => {
  const { app, dispatch, render } = window.__wd;
  const g = app.game;
  dispatch(g, { type: 'startExpedition', partyIds: g.roster.map((h) => h.id), biome: 'docks', difficulty: 'standard', seed: 'SHOT-3' });
  render();
});
await shot('explore');
await page.evaluate(() => {
  const { app, auto, render } = window.__wd;
  const g = app.game;
  for (let i = 0; i < 400 && g.expedition && !g.expedition.event && !(g.expedition.combat?.status === 'active'); i++) auto.autoExploreStep(g);
  render();
});
await shot('event-or-fight');
// Psyker powers menu if in combat.
if (await page.locator('[data-key="menu-magic"]').count()) {
  await page.evaluate(() => { const { app, render } = window.__wd; const g = app.game; while (g.expedition?.combat?.status === 'active' && !['astropath', 'navigator'].includes(g.roster.find((h) => h.id === g.expedition.combat.turn?.actorId)?.careerId)) { window.__wd.auto.autoCombatStep(g); } render(); });
  if (await page.locator('[data-key="menu-magic"]').count() && await page.locator('[data-key="menu-magic"]').isEnabled()) { await page.keyboard.press('c'); await shot('powers'); }
}
await page.evaluate(() => { const { app, auto, render } = window.__wd; auto.autoExpedition(app.game); render(); });
await shot('result');
await page.evaluate(() => { const { app, render } = window.__wd; const g = app.game; g.lastResult = undefined; g.phase = 'over'; g.ending = { captain: 'Lucan Vantorre', cause: 'fell to a Rak’Gol Warlord in The Drowned Reliquary', day: 9, clears: 3 }; render(); });
await shot('gameover');
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
