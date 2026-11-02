/**
 * The guided tour: coach marks over the enclave, then the hand-built Nursery
 * venture (movement, one fight, salvage, the warp-key and a gentle keeper),
 * then advancement. Progress lives in GameState.tutorial so it survives saves;
 * it is null once finished or skipped. A step either blocks the screen and
 * waits for Next, or parks a reminder in the corner and advances when `done`
 * holds.
 */
import type { GameState } from '../engine/types.ts';
import { h } from './dom.ts';
import { app, render, persist, postRender } from './app.ts';

type Where = 'town' | 'dungeon' | 'combat' | 'result' | 'any';

interface Step {
  where: Where;
  title: string;
  text: string;
  target?: string;
  next?: boolean;
  done?: (g: GameState) => boolean;
  tab?: string;
}

function where(g: GameState): Where {
  if (g.lastResult) return 'result';
  const exp = g.expedition;
  if (exp?.combat && exp.combat.status === 'active') return 'combat';
  if (exp) return 'dungeon';
  return 'town';
}

const STEPS: Step[] = [
  { where: 'town', next: true, title: 'Welcome to the enclave', text: 'Survivors camp at the mouth of the Blackstone Fortress. Here you bank Thrones, trade treasure, buy gear and spend experience. Everything you need to rebuild your House starts with one venture.' },
  { where: 'town', next: true, tab: 'guild', target: '[data-tut="roster"]', title: 'Your crew', text: 'The Lord-Captain (⚜) and their retainers. Click anyone for their full sheet: Characteristics, armour by location, weapons, skills, Origin Path and career features. If the Lord-Captain dies with no Fate left to burn, the Dynasty ends.' },
  { where: 'town', tab: 'cartographer', target: '[data-key="tab-cartographer"]', title: 'Go to the Fortress Approach', text: 'Open the Fortress Approach tab to choose a party and a region.', done: () => app.ui.townTab === 'cartographer' },
  { where: 'town', tab: 'cartographer', target: '[data-key="start-tutorial"]', title: 'The Nursery', text: 'The enclave blooded every crew in this short spur of the Fortress. Nobody dies there. Enter it with your whole crew.', done: (g) => !!g.expedition?.tutorial },
  { where: 'dungeon', target: '.dpad', title: 'Moving', text: 'Use Forward, Left, Right and Back (or the arrow keys). Directions are relative to the way you face. The auspex map fills in as you go. Head Forward.', done: (g) => !!g.expedition?.combat || (g.expedition?.visited.length ?? 0) > 2 },
  { where: 'combat', next: true, target: '.felt', title: 'The Fortune tray', text: 'Every fight deals d10s onto this shared tray. Select dice (click, or keys 1–9) and Reroll the ones you don\'t want. Pairs, straights and five of one colour are poker hands; matching dice multiply your damage. Every scored 10 is a Righteous Fury.' },
  { where: 'combat', next: true, target: '.command', title: 'Acting', text: 'Choose an action from the menu with your dice selected. A Standard Attack is a Half Action: you get two per turn, or one Full Action like a burst. Your attack is a d100 Test against BS or WS — the chance is shown. Dice you don\'t play stay for the next explorer.' },
  { where: 'any', title: 'Win the fight', text: 'Defeat the gretchin. Afterwards, claim the spoils and pick a boon: relics, tarot cards and dice last for this venture only.', done: (g) => !!g.expedition && !g.expedition.combat && (g.expedition.depth ?? 0) >= 1 },
  { where: 'any', title: 'Salvage, key, keeper', text: 'Salvage the locker to the West, take the warp-key to the North, then beat the Nursery\'s keeper behind the sealed hatch.', done: (g) => !!g.lastResult },
  { where: 'result', next: true, title: 'Blooded', text: 'Everyone who walks out earns experience. Back in the enclave, the Muster Hall shows who can Advance: Characteristics, skills, talents, powers. Sell valuables at the Exchange; rare gear needs an Acquisition Test against your Profit Factor. Good hunting, Lord-Captain.' },
];

let lastStep = -1;

export function coachBlocking(): boolean {
  const g = app.game;
  const t = g?.tutorial;
  if (!g || !t || g.phase !== 'play') return false;
  const s = STEPS[t.step];
  return !!s?.next && (s.where === where(g) || s.where === 'any');
}

function finish(g: GameState) {
  g.tutorial = null;
  persist();
  document.querySelectorAll('.coach').forEach((x) => x.remove());
  render();
}

function advanceStep(g: GameState) {
  if (!g.tutorial) return;
  g.tutorial.step += 1;
  if (g.tutorial.step >= STEPS.length) { finish(g); return; }
  persist();
  render();
}

function draw() {
  document.querySelectorAll('.coach, .coach-hl').forEach((x) => x.classList.contains('coach-hl') ? x.classList.remove('coach-hl') : x.remove());
  const g = app.game;
  const t = g?.tutorial;
  if (!g || !t || g.phase !== 'play') return;
  let s = STEPS[t.step];
  if (!s) { g.tutorial = null; return; }
  // Advance through finished steps.
  let guard = 0;
  while (s && s.done && s.done(g) && guard++ < 10) { t.step += 1; s = STEPS[t.step]; persist(); }
  if (!s) { finish(g); return; }
  const here = where(g);
  if (s.where !== 'any' && s.where !== here) return;
  if (t.step !== lastStep) { lastStep = t.step; }
  const target = s.target ? document.querySelector(s.target) as HTMLElement | null : null;
  if (target) target.classList.add('coach-hl');
  const blocking = !!s.next;
  const bubble = h('div', { class: `coach ${blocking ? 'blocking' : 'free'}`, role: 'dialog', 'aria-label': s.title },
    h('div', { class: 'coach-step small muted' }, `Guided tour ${t.step + 1}/${STEPS.length}`),
    h('b', null, s.title),
    h('p', null, s.text),
    h('div', { class: 'row' },
      h('button', { class: 'btn small', on: { click: () => { if (confirm('Skip the guided tour? You can restart it from How to play.')) finish(g); } } }, 'Skip tour'),
      h('span', { class: 'spacer' }),
      blocking ? h('button', { class: 'btn small primary', 'data-key': 'coach-next', on: { click: () => advanceStep(g) } }, s.where === 'result' ? 'Finish' : 'Next') : null));
  document.body.appendChild(bubble);
  if (s.tab && here === 'town' && app.ui.townTab !== s.tab && blocking) { app.ui.townTab = s.tab; queueMicrotask(render); }
}

export function installTutorial() {
  postRender.push(draw);
}

export function restartTutorial(g: GameState) {
  g.tutorial = { step: 0, tips: [] };
  lastStep = -1;
  persist();
  render();
}
