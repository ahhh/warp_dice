// Browser smoke test: new Dynasty -> creation wizard -> enclave -> Nursery -> combat -> score.
import { chromium } from 'playwright';
const OUT = process.env.SHOTS ?? 'test-results';
const url = process.env.URL ?? 'http://localhost:5181/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1400), height: Number(process.env.H ?? 950) } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: !!process.env.FULL });
await page.goto(url);
await page.waitForTimeout(800);
await shot('01-title');
await page.locator('[data-key="new1"]').click();
await page.waitForTimeout(400);
await shot('02-house');
await page.locator('[data-key="create-next"]').click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/03-captain.png`, fullPage: true });
await page.locator('[data-key="create-next"]').click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/04-retinue.png`, fullPage: true });
await page.locator('[data-key="create-next"]').click();
await page.waitForTimeout(300);
await shot('05-review');
await page.locator('[data-key="found"]').click();
await page.waitForTimeout(500);
await shot('06-enclave');
// Skip the tour bubble if it blocks.
page.on('dialog', (d) => d.accept());
if (process.env.TOUR) {
  for (let i = 0; i < 2; i++) { await page.locator('[data-key="coach-next"]').click(); await page.waitForTimeout(200); }
  await shot('06b-tour');
}
await page.locator('[data-key="tab-cartographer"]').click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/07-approach.png`, fullPage: true });
await page.locator('[data-key="start-tutorial"]').click();
await page.waitForTimeout(500);
await shot('08-explore');
for (let i = 0; i < 20; i++) {
  if (await page.locator('.felt .dice-row').count()) break;
  const b = page.locator('[data-key="mv-forward"]');
  if (await b.count() && await b.isEnabled()) await b.click();
  await page.waitForTimeout(250);
}
for (let i = 0; i < 4; i++) if (await page.locator('[data-key="coach-next"]').count()) await page.locator('[data-key="coach-next"]').click();
await page.waitForTimeout(300);
await shot('09-combat');
for (const k of ['1', '2', '3']) await page.keyboard.press(k);
await page.waitForTimeout(200);
await shot('10-selected');
await page.keyboard.press('a');
await page.waitForTimeout(200);
await shot('11-attack-menu');
const opt = page.locator('[data-key="opt-std"]');
if (await opt.isEnabled()) await opt.click();
await page.waitForTimeout(300);
const tgt = page.locator('.enemy.targetable').first();
if (await tgt.count()) await tgt.click();
await page.waitForTimeout(2500);
await shot('12-after-attack');
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
