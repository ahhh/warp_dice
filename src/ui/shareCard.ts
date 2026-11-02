/**
 * Shareable progress card: the Dynasty's three best explorers, the regions
 * cleared, whether the Warrant is reclaimed, and the lifetime record, drawn on a canvas and
 * offered as a PNG to save or share. Higher achievements earn richer frames.
 */
import type { GameState, Hero } from '../engine/types.ts';
import { h, btn } from './dom.ts';
import { app, render, persist, toast } from './app.ts';
import { artUrl, hasArt } from './art.ts';
import { CAREERS, rankFromXp } from '../content/careers.ts';
import { ORIGIN_BY_ID } from '../content/origins.ts';
import { BIOMES, BIOME_ORDER } from '../content/biomes.ts';
import { FINALE_LEVEL, storyOf } from '../content/story.ts';

export const W = 1080, H = 1350;
const HEAD = '"UI Digits", "Pixelify Sans", system-ui, sans-serif';
const BODY = 'Alegreya, Georgia, serif';
const SITE = 'WARP DICE · A ROGUE TRADER ROGUELITE';
const PRISM = ['#e4643a', '#5aa9ff', '#5fae5b', '#dfe8f5', '#9b7bff', '#e4643a'];

interface RankDef { n: string; sub: string; a: string; b: string }
const RANKS: RankDef[] = [
  { n: 'Fallen House', sub: 'A name, a derelict, and a debt', a: '#c9a24a', b: '#7a5a1a' },
  { n: 'Fortress-Diver', sub: 'The enclave has started to talk', a: '#8fd3ff', b: '#3d6bff' },
  { n: 'Void Captain', sub: 'Doors are opening again', a: '#c8e070', b: '#3f8f4a' },
  { n: 'Merchant Prince', sub: 'Legends of the Expanse in the making', a: '#ffb347', b: '#e2403a' },
  { n: 'Heir to the Warrant', sub: 'Ready to storm the Heart', a: '#f2c14e', b: '#b3233a' },
  { n: 'Rogue Trader', sub: 'The Warrant is reclaimed', a: '#ffe08a', b: '#ff6bd5' },
];

/** The Keep's three best heroes: living first, by level, clears and kills. */
export function topThree(g: GameState): Hero[] {
  const score = (x: Hero) => (x.lordCaptain ? 1e7 : 0) + x.level * 10000 + x.history.clears * 100 + x.history.kills;
  const alive = g.roster.filter((x) => x.status === 'alive').sort((a, b) => score(b) - score(a));
  const fallen = g.roster.filter((x) => x.status === 'dead').sort((a, b) => score(b) - score(a));
  return [...alive, ...fallen].slice(0, 3);
}

export function rankOf(g: GameState): number {
  if (storyOf(g).warrant > 0) return 5;
  const best = g.roster.filter((x) => x.status === 'alive' && x.lordCaptain).reduce((m, x) => Math.max(m, x.level), 0);
  return best >= FINALE_LEVEL ? 4 : best >= 17 ? 3 : best >= 11 ? 2 : best >= 5 ? 1 : 0;
}

const rgba = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
const loadImg = (src: string) => new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

function grad(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, cols: string[]) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  cols.forEach((c, i) => gr.addColorStop(i / (cols.length - 1), c));
  return gr;
}

interface TextOpts { font: string; fill?: string | CanvasGradient; align?: CanvasTextAlign; spacing?: number; alpha?: number; glow?: string; blur?: number; maxW?: number }
function text(g: CanvasRenderingContext2D, str: string, x: number, y: number, o: TextOpts) {
  g.save();
  g.font = o.font;
  g.textAlign = o.align ?? 'center';
  g.globalAlpha = o.alpha ?? 1;
  if ('letterSpacing' in g) (g as unknown as { letterSpacing: string }).letterSpacing = `${o.spacing ?? 0}px`;
  if (o.maxW) {
    const w = g.measureText(str).width;
    if (w > o.maxW) g.font = o.font.replace(/(\d+)px/, (_, n) => `${Math.floor((Number(n) * o.maxW!) / w)}px`);
  }
  if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = o.blur ?? 0; }
  g.fillStyle = o.fill ?? '#e9e1cf';
  g.fillText(str, x, y);
  g.restore();
}

function sparkle(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  g.save();
  g.fillStyle = col;
  g.shadowColor = col;
  g.shadowBlur = r * 3;
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y);
  g.quadraticCurveTo(x, y, x, y - r);
  g.fill();
  g.restore();
}

function frame(g: CanvasRenderingContext2D, tier: number, R: RankDef) {
  const i = 24;
  g.save();
  const cols = tier >= 5 ? PRISM : [R.a, R.b, R.a, R.b];
  g.strokeStyle = tier === 0 ? 'rgba(233,225,207,.35)' : grad(g, 0, 0, W, H, cols);
  g.shadowColor = R.b;
  g.shadowBlur = tier >= 3 ? 30 : tier ? 12 : 0;
  g.lineWidth = tier >= 3 ? 6 : tier ? 4 : 2;
  g.beginPath(); g.roundRect(i, i, W - 2 * i, H - 2 * i, 28); g.stroke();
  g.shadowBlur = 0;
  if (tier >= 2) {
    // Dice-pip corners.
    const o = i + 26;
    for (const [x, y] of [[o, o], [W - o, o], [o, H - o], [W - o, H - o]]) {
      g.fillStyle = R.a;
      for (const [dx, dy] of [[-8, -8], [8, 8], [0, 0]]) { g.beginPath(); g.arc(x + dx, y + dy, 4, 0, Math.PI * 2); g.fill(); }
    }
  }
  if (tier >= 4) {
    g.globalAlpha = 0.5;
    g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(i + 14, i + 14, W - 2 * i - 28, H - 2 * i - 28, 20); g.stroke();
  }
  g.restore();
}

async function heroPanel(g: CanvasRenderingContext2D, hero: Hero, x: number, y: number, w: number, place: number) {
  const cls = CAREERS[hero.careerId];
  const col = cls.color;
  const dead = hero.status === 'dead';
  const ph = 560;
  // Card.
  g.save();
  g.fillStyle = 'rgba(8,12,28,.78)';
  g.strokeStyle = rgba(col, dead ? 0.35 : 0.9);
  g.lineWidth = place === 0 ? 4 : 3;
  if (!dead) { g.shadowColor = col; g.shadowBlur = place === 0 ? 26 : 14; }
  g.beginPath(); g.roundRect(x, y, w, ph, 18); g.fill(); g.stroke();
  g.restore();
  // Portrait.
  const pw = w - 28, px = x + 14, py = y + 14;
  const img = hasArt(hero.portrait) ? await loadImg(artUrl(hero.portrait)) : null;
  g.save();
  g.beginPath(); g.roundRect(px, py, pw, pw, 12); g.clip();
  g.fillStyle = grad(g, px, py, px, py + pw, [rgba(col, 0.9), '#0b1230']);
  g.fillRect(px, py, pw, pw);
  if (img) {
    const s = Math.max(pw / img.width, pw / img.height);
    g.drawImage(img, px + (pw - img.width * s) / 2, py, img.width * s, img.height * s);
  } else {
    const initials = hero.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
    text(g, initials, px + pw / 2, py + pw / 2 + 40, { font: `600 120px ${HEAD}`, fill: 'rgba(255,255,255,.85)' });
  }
  if (dead) { g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(px, py, pw, pw); }
  g.fillStyle = grad(g, 0, py + pw * 0.6, 0, py + pw, ['rgba(8,12,28,0)', 'rgba(8,12,28,.9)']);
  g.fillRect(px, py, pw, pw);
  g.restore();
  // Level badge.
  const bx = x + w - 54, by = y + 54;
  g.save();
  g.beginPath(); g.arc(bx, by, 38, 0, Math.PI * 2);
  g.fillStyle = hero.level >= FINALE_LEVEL ? grad(g, bx - 38, by - 38, bx + 38, by + 38, ['#ffe08a', '#c9a24a']) : '#0b1230';
  g.fill();
  g.lineWidth = 4; g.strokeStyle = hero.level >= FINALE_LEVEL ? '#fff2c0' : col; g.stroke();
  g.restore();
  text(g, 'RANK', bx, by - 8, { font: `600 16px ${HEAD}`, fill: hero.level >= FINALE_LEVEL ? '#3a2208' : '#c9cfe6' });
  text(g, String(rankFromXp(hero.xp)), bx, by + 24, { font: `600 34px ${HEAD}`, fill: hero.level >= FINALE_LEVEL ? '#3a2208' : '#ffffff' });
  // Place ribbon.
  text(g, ['I', 'II', 'III'][place], px + 24, py + 42, { font: `600 30px ${HEAD}`, fill: '#f2c14e', align: 'left', glow: '#000', blur: 10 });
  // Name and class.
  const ty = py + pw + 46;
  text(g, hero.name, x + w / 2, ty, { font: `700 34px ${BODY}`, fill: dead ? '#9aa0b8' : '#ffffff', maxW: w - 30 });
  text(g, `${hero.lordCaptain ? 'Lord-Captain · ' : ''}${cls.name}`, x + w / 2, ty + 34, { font: `600 22px ${HEAD}`, fill: col === '#000000' ? '#c9cfe6' : lighten(col), maxW: w - 30 });
  text(g, dead ? `Fallen · ${hero.history.deathCause ?? ''}` : `${ORIGIN_BY_ID[hero.origin.homeWorld]?.name ?? ''}`, x + w / 2, ty + 64, { font: `italic 20px ${BODY}`, fill: dead ? '#ff8a80' : '#b8bfd8', maxW: w - 30 });
  // Stats.
  const sy = ty + 100;
  const stats: [number, string][] = [[hero.history.clears, 'clears'], [hero.history.kills, 'kills'], [hero.history.expeditions, 'ventures']];
  stats.forEach(([v, l], i) => {
    const sx = x + (w / 3) * (i + 0.5);
    text(g, String(v), sx, sy, { font: `600 30px ${HEAD}`, fill: '#ffffff' });
    text(g, l.toUpperCase(), sx, sy + 22, { font: `600 14px ${HEAD}`, fill: '#8a93b8', spacing: 2 });
  });
}

function lighten(hex: string): string {
  const n = (i: number) => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.5 + 128));
  return `rgb(${n(1)},${n(3)},${n(5)})`;
}

/** Draws the card for `game` onto `canvas` and returns it. */
export async function renderShareCard(game: GameState, canvas: HTMLCanvasElement = document.createElement('canvas')): Promise<HTMLCanvasElement> {
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const tier = rankOf(game);
  const R = RANKS[tier];
  const story = storyOf(game);
  await Promise.all([
    document.fonts.load(`600 40px "Pixelify Sans"`),
    document.fonts.load('600 40px "UI Digits"', '0123456789'), // unicode-range face: must request digits or nothing loads
    ...['700 20px Alegreya', 'italic 20px Alegreya'].map((f) => document.fonts.load(f)),
  ]).catch(() => undefined);

  // Backdrop.
  g.fillStyle = '#070b1a';
  g.fillRect(0, 0, W, H);
  const bgKey = story.warrant ? 'monsters/core_usurper' : 'town/fortress';
  const bg = hasArt(bgKey) ? await loadImg(artUrl(bgKey)) : null;
  if (bg) {
    const s = Math.max(W / bg.width, H / bg.height);
    g.globalAlpha = 0.55;
    g.drawImage(bg, (W - bg.width * s) / 2, 0, bg.width * s, bg.height * s);
    g.globalAlpha = 1;
  }
  g.fillStyle = grad(g, 0, 0, 0, H, ['rgba(7,11,26,.55)', 'rgba(7,11,26,.25)', 'rgba(7,11,26,.85)', 'rgba(7,11,26,.97)']);
  g.fillRect(0, 0, W, H);
  const rg = g.createRadialGradient(W / 2, 260, 40, W / 2, 260, 640);
  rg.addColorStop(0, rgba(R.b, 0.12 + 0.04 * tier));
  rg.addColorStop(1, rgba(R.b, 0));
  g.fillStyle = rg;
  g.fillRect(0, 0, W, H);
  if (tier >= 3) {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < (tier >= 5 ? 40 : 16); n++) sparkle(g, 60 + rnd() * (W - 120), 60 + rnd() * 260, 3 + rnd() * (tier >= 5 ? 9 : 5), tier >= 5 ? PRISM[n % 5] : R.a);
  }
  frame(g, tier, R);

  // Header.
  text(g, 'WARP DICE', W / 2, 112, { font: `600 70px ${HEAD}`, spacing: 6, fill: grad(g, 0, 60, 0, 120, ['#ffe9a8', '#c9a24a']), glow: '#000', blur: 16 });
  text(g, `THE BLACKSTONE VENTURE · HOUSE ${game.profile.dynastyName.toUpperCase()}`, W / 2, 150, { font: `600 20px ${HEAD}`, spacing: 4, fill: R.a });
  if (game.profile.keeperName) text(g, game.profile.keeperName.toUpperCase(), W / 2, 210, { font: `700 30px ${BODY}`, spacing: 4, fill: '#ffffff', maxW: 900 });
  const rankFill = tier >= 5 ? grad(g, 160, 0, W - 160, 0, PRISM) : grad(g, 0, 220, 0, 280, [R.a, R.b]);
  text(g, R.n.toUpperCase(), W / 2, 272, { font: `600 64px ${HEAD}`, spacing: 3, fill: rankFill, glow: tier ? R.b : '#000', blur: 8 + tier * 5, maxW: 960 });
  text(g, R.sub, W / 2, 308, { font: `italic 26px ${BODY}`, fill: '#c9cfe6', maxW: 900 });

  // The three best.
  const heroes = topThree(game);
  const pw = 312, gap = 24, x0 = (W - (pw * 3 + gap * 2)) / 2, y0 = 340;
  for (let i = 0; i < 3; i++) {
    const x = x0 + i * (pw + gap);
    if (heroes[i]) await heroPanel(g, heroes[i], x, y0, pw, i);
    else {
      g.save(); g.strokeStyle = 'rgba(233,225,207,.18)'; g.setLineDash([10, 8]); g.lineWidth = 2;
      g.beginPath(); g.roundRect(x, y0, pw, 560, 18); g.stroke(); g.restore();
      text(g, 'An empty seat', x + pw / 2, y0 + 290, { font: `italic 24px ${BODY}`, fill: '#5d6684' });
    }
  }

  // One seal per region of the Fortress cleared.
  const hy = 990;
  text(g, 'REGIONS CLEARED', W / 2, hy - 44, { font: `600 18px ${HEAD}`, spacing: 4, fill: '#8a93b8' });
  BIOME_ORDER.forEach((b, i) => {
    const x = W / 2 + (i - 2) * 150, n = game.profile.sigils[b] ?? 0, col = BIOMES[b].color;
    g.save();
    g.beginPath(); g.arc(x, hy, 30, 0, Math.PI * 2);
    g.fillStyle = n ? rgba(col, 0.3) : 'rgba(255,255,255,.04)';
    g.fill();
    g.lineWidth = n ? 4 : 2;
    g.strokeStyle = n ? col : 'rgba(255,255,255,.16)';
    if (n) { g.shadowColor = col; g.shadowBlur = 16; }
    g.stroke();
    g.restore();
    text(g, n ? '✦' : '·', x, hy + 11, { font: `600 30px ${HEAD}`, fill: n ? '#ffffff' : '#5d6684' });
    text(g, BIOMES[b].name.replace(/^The /, '').toUpperCase() + (n > 1 ? ` ×${n}` : ''), x, hy + 56, { font: `600 14px ${HEAD}`, spacing: 1, fill: n ? lighten(col) : '#5d6684', maxW: 144 });
  });

  // Record.
  const px = 70, py = 1080, pwid = W - 140, phh = 140;
  g.save();
  g.fillStyle = 'rgba(8,12,28,.7)';
  g.strokeStyle = rgba(R.a, 0.3);
  g.lineWidth = 2;
  g.beginPath(); g.roundRect(px, py, pwid, phh, 18); g.fill(); g.stroke();
  g.restore();
  const s = game.profile.stats;
  const cells: [string, string][] = [
    [String(s.expeditions), 'Ventures'], [String(game.profile.profitFactor), 'Profit Factor'], [s.bestScore >= 1e6 ? `${(s.bestScore / 1e6).toFixed(1)}M` : s.bestScore.toLocaleString(), 'Best hand'], [story.warrant ? '⚜' : '—', 'Warrant reclaimed'],
  ];
  cells.forEach(([v, l], i) => {
    const x = px + (pwid / 4) * (i + 0.5);
    text(g, v, x, py + 72, { font: `600 46px ${HEAD}`, fill: v === '—' || v === '0' ? '#5d6684' : '#ffffff', maxW: pwid / 4 - 20 });
    text(g, l.toUpperCase(), x, py + 106, { font: `600 15px ${HEAD}`, spacing: 2, fill: '#8a93b8', maxW: pwid / 4 - 20 });
  });

  // Footer.
  text(g, `${game.mode === 'legacy' ? 'Legacy' : 'Story'} mode · Day ${game.profile.townDay} · ${game.roster.filter((x) => x.status === 'dead').length} fallen`, W / 2, 1268, { font: `italic 22px ${BODY}`, fill: '#c9cfe6' });
  text(g, SITE, W / 2, 1300, { font: `600 16px ${HEAD}`, spacing: 4, fill: R.a, alpha: 0.8 });
  return canvas;
}

const blobOf = (canvas: HTMLCanvasElement) => new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));

export function openShareCard(g: GameState) {
  void g;
  app.ui.modal = { kind: 'share' };
  render();
}

let canvasEl: HTMLCanvasElement | null = null;

/** The share sheet: preview, optional Keeper name, save and share. */
export function shareModal(): HTMLElement {
  const game = app.game!;
  const close = () => { app.ui.modal = undefined; canvasEl = null; render(); };
  // Keep one canvas across re-renders so typing a name doesn't flash the preview.
  const canvas = canvasEl ?? (canvasEl = h('canvas', { class: 'share-card', width: W, height: H, 'aria-label': 'Share card preview' }));
  if (!canvas.dataset.drawn) { canvas.dataset.drawn = '1'; void renderShareCard(game, canvas); }
  const file = async () => {
    const blob = await blobOf(canvas);
    return new File([blob!], `warp-dice-${RANKS[rankOf(game)].n.toLowerCase().replace(/\W+/g, '-')}.png`, { type: 'image/png' });
  };
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] }));
  let timer = 0;
  const top = topThree(game);
  return h('div', { class: 'modal-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Share card', on: { click: (e: Event) => { if (e.target === e.currentTarget) close(); } } },
    h('div', { class: 'win modal narrow share-sheet' },
      h('h2', null, '🖼 Share your legend'),
      canvas,
      h('input', { class: 'field', placeholder: 'Player name (optional)', maxlength: 24, value: game.profile.keeperName ?? '', 'aria-label': 'Player name',
        on: { input: (e: Event) => { game.profile.keeperName = (e.target as HTMLInputElement).value.trim() || undefined; persist(); clearTimeout(timer); timer = window.setTimeout(() => void renderShareCard(game, canvas), 250); } } }),
      h('p', { class: 'small muted' }, top.length ? `Featuring ${top.map((x) => `${x.name} (Rank ${rankFromXp(x.xp)})`).join(', ')}. Clear regions and reclaim the Warrant to upgrade your card.` : 'Found a Dynasty first.'),
      h('div', { class: 'row', style: 'margin-top:8px' },
        h('span', { class: 'spacer' }),
        btn('⬇ Save image', async () => {
          const f = await file();
          const a = h('a', { href: URL.createObjectURL(f), download: f.name });
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        }, { cls: canShare ? '' : 'primary', key: 'share-save' }),
        canShare ? btn('📤 Share', async () => {
          try { await navigator.share({ files: [await file()], title: 'Warp Dice', text: `House ${game.profile.dynastyName}, ${RANKS[rankOf(game)].n}: ${SITE}` }); } catch (e) { if ((e as Error).name !== 'AbortError') toast('Sharing failed. Try Save image instead.'); }
        }, { cls: 'primary', key: 'share-go' }) : null,
        btn('Close', close, { key: 'share-close' }))));
}
