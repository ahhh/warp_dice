/**
 * Portrait variants: four per career, each with a look for the art pipeline.
 * Keys are art paths; missing art falls back to a drawn placeholder.
 */
import type { CareerId } from '../engine/types.ts';
import type { Rng } from '../engine/rng.ts';

export interface PortraitDef { key: string; careerId: CareerId; look: string }

const P = (careerId: CareerId, n: number, look: string): PortraitDef => ({ key: `heroes/${careerId}_${n}`, careerId, look });

export const PORTRAITS: PortraitDef[] = [
  P('rogueTrader', 1, 'a weathered noble captain in a moth-eaten brocade greatcoat, a best-crafted laspistol and a mono-sword, defiant eyes'),
  P('rogueTrader', 2, 'a sharp-featured noblewoman captain with a tricorne, purity seals and a duelling pistol'),
  P('rogueTrader', 3, 'an older dynast with augmetic jaw and gilded epaulettes gone green with age'),
  P('rogueTrader', 4, 'a young heir in a too-large captain\'s coat with a signet ring and a hard stare'),
  P('archMilitant', 1, 'a scarred mercenary in enforcer carapace with a hellgun and a mono-knife'),
  P('archMilitant', 2, 'a death-world huntress with braided hair, furs over flak and a chainsword'),
  P('archMilitant', 3, 'a towering ex-guardsman with a heavy stubber and a battered helmet'),
  P('archMilitant', 4, 'a lean duellist bounty hunter with two bolt pistols and a bounty slate'),
  P('astropath', 1, 'a blind soul-bound astropath in green robes with empty eye sockets and a staff'),
  P('astropath', 2, 'a gaunt astropath woman with a shaven head, psy-focus pendant and pale skin'),
  P('astropath', 3, 'an elderly astropath with wired skull and a hood, hands glowing faintly'),
  P('astropath', 4, 'a young astropath with bandaged eyes and a choir collar'),
  P('explorator', 1, 'a Mechanicus magos in red robes with mechadendrites and a glowing optic'),
  P('explorator', 2, 'a tech-priestess with brass augmetics, a servo-skull and an axe-staff'),
  P('explorator', 3, 'a hunched explorator with a respirator mask and cabled spine'),
  P('explorator', 4, 'a towering magos with a power axe and many-lensed eyes'),
  P('missionary', 1, 'a zealous missionary in ecclesiarchal robes with a chainsword and censer'),
  P('missionary', 2, 'a scarred preacher with a flamer, aquila pendant and fierce beard'),
  P('missionary', 3, 'a sister of the creed with a book of litanies chained to her belt'),
  P('missionary', 4, 'an old confessor with a staff, rosarius and burning eyes'),
  P('navigator', 1, 'a pale Navis Nobilite with a silk headscarf over the third eye and fine robes'),
  P('navigator', 2, 'a haughty navigator woman with elongated fingers and a jewelled bandana'),
  P('navigator', 3, 'a mutated old navigator with dark eyes and a hellpistol'),
  P('navigator', 4, 'a young navigator scion with an ornate staff and nervous hands'),
  P('seneschal', 1, 'a smiling seneschal in fine robes with a data-slate and a hidden hellpistol'),
  P('seneschal', 2, 'a cool-eyed factotum woman in a cameleoline cloak'),
  P('seneschal', 3, 'a bookish accountant with augmetic lenses and ink-stained fingers'),
  P('seneschal', 4, 'a slick underhive fixer with rings on every finger'),
  P('voidMaster', 1, 'a void-born pilot with void-pallor, flight jacket and a hand cannon'),
  P('voidMaster', 2, 'a naval gunnery officer woman with a cutlass and naval uniform'),
  P('voidMaster', 3, 'a grizzled helmsman with a vox-bead and a power sword'),
  P('voidMaster', 4, 'a lanky void-born with a rebreather and twin pistols'),
];

export function portraitsFor(careerId: CareerId): PortraitDef[] {
  return PORTRAITS.filter((p) => p.careerId === careerId);
}

export function portraitFor(rng: Rng, careerId: CareerId): string {
  return rng.pick(portraitsFor(careerId)).key;
}
