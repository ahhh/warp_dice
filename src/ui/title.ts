/** Title screen: save slots, new Dynasty, import/export, credits. */
import { h, btn } from './dom.ts';
import { app, render, setGame, toast } from './app.ts';
import { bgStyle } from './art.ts';
import { listSlots, loadGame, saveGame, deleteSlot, exportSave, importSave, type SlotInfo } from '../persistence/save.ts';
import { newGame } from '../meta/town.ts';
import { dieFace } from './widgets.ts';
import { sfx } from './audio.ts';
import { resetDraft } from './create.ts';

let slots: SlotInfo[] | null = null;
let showCredits = false;

export async function refreshSlots() {
  slots = await listSlots();
  render();
}

export function download(name: string, text: string) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function importInto(slot: number) {
  const input = h('input', { type: 'file', accept: '.json,application/json' }) as HTMLInputElement;
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    const r = importSave(await f.text(), slot);
    if (!r.ok) { toast(r.error); return; }
    if (!confirm(`Import House ${r.game.profile.dynastyName} into slot ${slot}? This replaces the slot.`)) return;
    await saveGame(r.game);
    toast('Save imported.', true);
    void refreshSlots();
  };
  input.click();
}

export function titleScreen(): HTMLElement {
  if (!slots) void refreshSlots();
  const seal = [10, 10, 10, 10, 10];
  return h('div', { class: 'title-screen', style: bgStyle('town/fortress', 'radial-gradient(ellipse at 50% 20%, #2a1c3a, #050508 70%)') + ';background-size:cover;background-position:center' },
    h('div', { class: 'title-inner' },
      h('div', { class: 'title-aquila', 'aria-hidden': 'true' }, '⚜ ✠ ⚜'),
      h('h1', { class: 'logo' }, 'Warp Dice', h('small', null, 'The Blackstone Venture')),
      h('p', { class: 'prose title-pitch' }, 'You are a Rogue Trader who has lost everything but a name. A Blackstone Fortress drifts at the edge of the Expanse. Somewhere inside is your Warrant.'),
      h('div', { class: 'title-dice', 'aria-hidden': 'true' }, ...seal.map((v, i) => dieFace(v, (['aquila', 'adamant', 'warp', 'cog', 'eye'] as const)[i], undefined, { cls: 'rolling' }))),
      showCredits ? credits() : h('div', { class: 'win slots' },
        h('h2', null, 'Choose a save slot'),
        ...(slots ?? []).map((s) => h('div', { class: 'slot' },
          h('div', { class: 'grow' }, h('b', null, `Slot ${s.slot}`), h('div', { class: 'small muted' }, s.exists ? `${s.summary} — saved ${new Date(s.savedAt!).toLocaleString()}` : 'Empty')),
          s.exists ? btn('Continue', async () => { const g = await loadGame(s.slot); if (g) { setGame(g); sfx.fanfare(); render(); } }, { cls: 'primary', key: `cont${s.slot}` }) : null,
          !s.exists ? btn('New Dynasty (Legacy)', () => start(s.slot, 'legacy'), { cls: 'primary', title: 'Permadeath for everyone. If the Lord-Captain dies, the Dynasty ends.', key: `new${s.slot}` }) : null,
          !s.exists ? btn('New (Story)', () => start(s.slot, 'story'), { title: 'Retainers who fall are dragged home alive; the Lord-Captain gets +1 Fate. The Lord-Captain\'s death still ends the Dynasty.' }) : null,
          s.exists ? btn('Export', async () => { const g = await loadGame(s.slot); if (g) download(`warp-dice-slot${s.slot}.json`, exportSave(g)); }, { cls: 'small' }) : null,
          btn('Import', () => importInto(s.slot), { cls: 'small' }),
          s.exists ? btn('Delete', async () => { if (confirm(`Delete slot ${s.slot}? This cannot be undone.`)) { await deleteSlot(s.slot); void refreshSlots(); } }, { cls: 'small danger' }) : null,
        )),
        h('div', { class: 'row' }, btn('Credits & sources', () => { showCredits = true; render(); }, { cls: 'small' })),
      ),
    ),
    h('div', { class: 'legal' }, 'Saves live in this browser. Export a backup now and then — clearing site data erases them.'),
  );
}

export async function start(slot: number, mode: 'legacy' | 'story') {
  const g = newGame(slot, mode);
  await saveGame(g);
  resetDraft(g);
  setGame(g);
  app.ui.townTab = 'guild';
  sfx.fanfare();
  render();
}

export function credits(): HTMLElement {
  return h('div', { class: 'win prose', style: 'max-width:720px;text-align:left' },
    h('h2', null, 'Credits & sources'),
    h('p', null, 'An unofficial fan game. Rules are paraphrased and adapted from the Rogue Trader Roleplaying Game (Core Rulebook, Into the Storm) by Fantasy Flight Games, under licence from Games Workshop. Warhammer 40,000, Rogue Trader and associated names are trademarks of Games Workshop Limited. No challenge to their status is intended.'),
    h('p', null, 'Origin Path, career advance schemes, armoury tables and names come from the Warrant of Trade generator. Every rule on a sheet is tagged exact, adapted or narrative to show how closely it follows the book.'),
    h('p', null, 'The Fortune tray, relics, curses, the Fortress regions and their denizens, the story, and all code are original to this game. Built on Treasure Dice.'),
    h('p', null, 'Fonts: Pixelify Sans, Chakra Petch and Alegreya (SIL Open Font License).'),
    btn('Back', () => { showCredits = false; render(); }),
  );
}
