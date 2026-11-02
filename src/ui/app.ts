/** App shell: owns the GameState, routes commands, autosaves, renders screens. */
import type { GameState, ScoreReport } from '../engine/types.ts';
import { dispatch, type GameCmd, type DispatchResult } from '../app/commands.ts';
import { saveGame } from '../persistence/save.ts';
import { h, clear } from './dom.ts';
import { sfx, setSound } from './audio.ts';

export interface UiState {
  townTab: string;
  party: string[];
  biome: string;
  difficulty: 'explorer' | 'standard' | 'perilous';
  size: 'short' | 'normal' | 'long';
  seed: string;
  // combat
  selected: number[];
  /** Combatant id the current selection belongs to. */
  selFor?: string;
  menu: string;
  pending?: { key: string; slot?: number; meta: string[] };
  /** Advancement screen: explorer being advanced. */
  advance?: string;
  talent?: { id: string; needs: string };
  rolling: Set<number>;
  // modals
  modal?: { kind: string; data?: unknown };
  bagPick?: { purpose: 'boon' | 'shop' | 'sacrifice'; idx: number; die?: string };
  heroSheet?: string;
  levelUp?: string;
  logOpen: boolean;
}

export const app = {
  game: null as GameState | null,
  root: null as unknown as HTMLElement,
  ui: {
    townTab: 'guild', party: [], biome: 'docks', difficulty: 'standard', size: 'normal', seed: '',
    selected: [], menu: 'root', rolling: new Set(), logOpen: false,
  } as UiState,
  renderers: {} as Record<string, () => HTMLElement>,
  scoreQueue: [] as ScoreReport[],
  animating: false,
};

export function setGame(g: GameState | null) {
  app.game = g;
  if (g) setSound(g.settings.sound);
  resetCombatUi();
}

export function resetCombatUi() {
  app.ui.selected = [];
  app.ui.menu = 'root';
  app.ui.pending = undefined;
  app.ui.talent = undefined;
}

export function toast(msg: string, ok = false) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = h('div', { class: `toast ${ok ? 'ok' : ''}`, role: 'status' }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** Debounced save of the current game (used by UI-only state like tutorial progress). */
export function persist() { autosave(); }
function autosave() {
  if (!app.game) return;
  if (saveTimer) clearTimeout(saveTimer);
  const g = app.game;
  saveTimer = setTimeout(() => void saveGame(g), 60);
}

/** Run a command, autosave, re-render. */
export function run(cmd: GameCmd, opts: { silent?: boolean } = {}): DispatchResult {
  const g = app.game;
  if (!g) return { ok: false, error: 'No game' };
  const r = dispatch(g, cmd);
  if (!r.ok) {
    if (!opts.silent && r.error) { toast(r.error); sfx.bad(); }
  } else {
    autosave();
    if (r.score) app.scoreQueue.push(r.score);
  }
  render();
  return r;
}

export function render() {
  const root = app.root;
  const scrollY = window.scrollY;
  const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.key;
  clear(root);
  let screen = 'title';
  const g = app.game;
  if (g) {
    if (g.phase === 'create') screen = 'create';
    else if (g.lastResult) screen = 'result';
    else if (g.phase === 'over') screen = 'over';
    else if (g.expedition) screen = g.expedition.combat ? 'combat' : 'explore';
    else screen = 'town';
  }
  const r = app.renderers[screen];
  if (r) root.appendChild(r());
  if (app.renderers.overlay) {
    const o = app.renderers.overlay();
    if (o) root.appendChild(o);
  }
  window.scrollTo(0, scrollY);
  if (focusKey) (root.querySelector(`[data-key="${CSS.escape(focusKey)}"]`) as HTMLElement | null)?.focus();
  afterRender.forEach((f) => f());
  afterRender.length = 0;
  for (const f of postRender) f();
}

export const afterRender: (() => void)[] = [];
/** Hooks that run after every render (the tutorial coach). */
export const postRender: (() => void)[] = [];

export function wait(ms: number) {
  return new Promise((r) => setTimeout(r, app.game?.settings.fast ? ms / 3 : ms));
}

export { sfx };
