/**
 * Saves: IndexedDB per slot with a localStorage fallback, plus JSON
 * export/import with a checksum (plan §10.1). Saves are plain data — imports
 * are validated and never evaluated.
 */
import type { GameState } from '../engine/types.ts';
import { SCHEMA_VERSION } from '../meta/town.ts';

const DB = 'warp-dice';
const STORE = 'saves';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveGame(g: GameState): Promise<void> {
  g.savedAt = Date.now();
  const json = JSON.stringify(g);
  const ok = await idb('readwrite', (s) => s.put(json, `slot${g.slot}`));
  if (ok === null) {
    try { localStorage.setItem(`wd-slot${g.slot}`, json); } catch { /* storage full or blocked */ }
  }
}

export async function loadGame(slot: number): Promise<GameState | null> {
  let json = await idb<string>('readonly', (s) => s.get(`slot${slot}`));
  if (!json) {
    try { json = localStorage.getItem(`wd-slot${slot}`); } catch { json = null; }
  }
  if (!json) return null;
  try {
    return migrate(JSON.parse(json));
  } catch {
    return null;
  }
}

export async function deleteSlot(slot: number): Promise<void> {
  await idb('readwrite', (s) => s.delete(`slot${slot}`));
  try { localStorage.removeItem(`wd-slot${slot}`); } catch { /* ignore */ }
}

export interface SlotInfo { slot: number; exists: boolean; summary?: string; savedAt?: number }

export async function listSlots(): Promise<SlotInfo[]> {
  const out: SlotInfo[] = [];
  for (const slot of [1, 2, 3]) {
    const g = await loadGame(slot);
    if (!g) { out.push({ slot, exists: false }); continue; }
    const alive = g.roster.filter((h) => h.status === 'alive');
    const lc = g.roster.find((h) => h.lordCaptain);
    const state = g.phase === 'over' ? ' · THE DYNASTY HAS FALLEN' : g.phase === 'create' ? ' · founding' : g.expedition ? ' · in the Fortress' : '';
    out.push({ slot, exists: true, savedAt: g.savedAt, summary: `House ${g.profile.dynastyName} · ${g.mode === 'legacy' ? 'Legacy' : 'Story'} · Day ${g.profile.townDay} · ${lc ? lc.name : '—'} and ${Math.max(0, alive.length - 1)} retainers · ${g.profile.bankedGold} Thrones · PF ${g.profile.profitFactor}${state}` });
  }
  return out;
}

export function checksum(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

export function exportSave(g: GameState): string {
  const body = JSON.stringify(g);
  return JSON.stringify({ format: 'warp-dice-save', version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), checksum: checksum(body), body });
}

export function importSave(text: string, slot: number): { ok: true; game: GameState } | { ok: false; error: string } {
  let wrap: { format?: string; checksum?: string; body?: string };
  try { wrap = JSON.parse(text); } catch { return { ok: false, error: 'Not a JSON file.' }; }
  if (wrap.format !== 'warp-dice-save' || typeof wrap.body !== 'string') return { ok: false, error: 'Not a Warp Dice save.' };
  if (checksum(wrap.body) !== wrap.checksum) return { ok: false, error: 'Checksum mismatch — the file is corrupted or edited.' };
  let g: GameState;
  try { g = JSON.parse(wrap.body); } catch { return { ok: false, error: 'Corrupted save body.' }; }
  const v = validate(g);
  if (v) return { ok: false, error: v };
  g.slot = slot;
  return { ok: true, game: migrate(g) };
}

function validate(g: GameState): string | null {
  if (!g || typeof g !== 'object') return 'Empty save.';
  if (!Array.isArray(g.roster) || !g.profile || !Array.isArray(g.vault)) return 'Save is missing required data.';
  for (const h of g.roster) {
    if (typeof h.name !== 'string' || typeof h.xp !== 'number' || h.xp < 0 || !h.base) return 'Invalid explorer data.';
  }
  if (typeof g.profile.bankedGold !== 'number' || g.profile.bankedGold < 0) return 'Invalid Thrones.';
  return null;
}

/** Schema migrations live here as the format evolves. */
export function migrate(g: GameState): GameState {
  if (!g.schemaVersion) g.schemaVersion = 1;
  g.settings = g.settings ?? { fast: false, sound: true };
  if (g.expedition && !g.expedition.searched) g.expedition.searched = [];
  if (!g.profile.story) g.profile.story = { seen: Object.keys(g.profile.sigils).filter((b) => (g.profile.sigils[b as keyof typeof g.profile.sigils] ?? 0) > 0), warrant: 0 };
  g.phase = g.phase ?? 'play';
  g.market = g.market ?? { stock: [], failed: [], day: 0 };
  return g;
}
