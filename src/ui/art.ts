/** Art lookup with a manifest, so missing art falls back to a drawn placeholder (no 404s). */
import { h } from './dom.ts';

let keys = new Set<string>();
const BASE = import.meta.env?.BASE_URL ?? './';

export async function loadManifest() {
  try {
    const r = await fetch(`${BASE}art/manifest.json`, { cache: 'no-cache' });
    if (r.ok) keys = new Set((await r.json()).keys);
  } catch { /* offline first run: placeholders */ }
}

export function hasArt(key: string) {
  return keys.has(key);
}

export function artUrl(key: string) {
  return `${BASE}art/${key}.webp`;
}

/** An <img> if we have the art, else a lettered tile in the given colour. */
export function art(key: string, alt: string, cls = '', color = '#3a4a7a'): HTMLElement {
  if (keys.has(key)) return h('img', { class: `art ${cls}`, src: artUrl(key), alt, loading: 'lazy', draggable: 'false' });
  const initials = alt.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return h('div', { class: `art placeholder ${cls}`, role: 'img', 'aria-label': alt, style: `--ph:${color}` }, initials || '?');
}

export function bgStyle(key: string, fallback: string) {
  return keys.has(key) ? `background-image:linear-gradient(to bottom, rgba(6,10,24,.15), rgba(6,10,24,.75)), url(${artUrl(key)})` : `background:${fallback}`;
}
