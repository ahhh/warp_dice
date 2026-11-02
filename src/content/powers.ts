/**
 * Psychic Techniques (Core ch. VI) and Navigator Powers (Core ch. VII),
 * paraphrased and condensed to combat and exploration effects.
 *
 * Focus Power Test (psykers): Willpower + 5 × effective Psy Rating. Fettered
 * halves Psy Rating and cannot cause Phenomena; Unfettered risks Phenomena
 * on doubles; Push adds +3 Psy Rating and always causes Phenomena.
 * Navigator Powers test Willpower or Perception with +0/+10/+20 for Novice,
 * Adept and Master, and never cause Phenomena.
 */
import type { Char, ConditionId, DamageType } from '../engine/types.ts';
import type { Impl } from './talents.ts';

export type PowerTarget = 'enemy' | 'enemies' | 'rank' | 'ally' | 'allies' | 'self';
export type PowerKind = 'damage' | 'debuff' | 'buff' | 'heal' | 'special';

export interface PowerDef {
  id: string;
  name: string;
  discipline: 'Telepathy' | 'Divination' | 'Telekinesis' | 'Navigator';
  src: string;
  cost: number;
  needs?: string[];
  action: 'half' | 'full';
  target: PowerTarget;
  kind: PowerKind;
  text: string;
  impl: Impl;
  /** Navigator powers test this Characteristic; psychic techniques test WP. */
  char?: Char;
  /** Damage expression from effective strength (Psy Rating, or 1+mastery) and WP bonus. */
  dmg?: (strength: number, wpb: number) => string;
  damageType?: DamageType;
  pen?: (strength: number) => number;
  /** Ignores Armour and Toughness. */
  pure?: boolean;
  /** Target resists with an opposed Willpower Test. */
  opposed?: boolean;
  condition?: { id: ConditionId; rounds: number; value?: number };
  sustain?: boolean;
  /** Use outside combat: a map effect. */
  explore?: 'reveal' | 'secrets' | 'heal' | 'guidance';
  /** Unliving foes (constructs, daemons) shrug it off. */
  living?: boolean;
}

const P = (d: PowerDef) => d;

export const POWERS: Record<string, PowerDef> = Object.fromEntries([
  // ── Telekinesis ─────────────────────────────────────────────────────────
  P({ id: 'forceBolt', name: 'Force Bolt', discipline: 'Telekinesis', src: 'Core p.172', cost: 100, action: 'half', target: 'enemy', kind: 'damage', impl: 'exact',
    text: 'A bolt of telekinetic force: 1d10 + 2×PR Impact, Penetration equal to PR.', dmg: (pr) => `1d10+${pr * 2}`, damageType: 'impact', pen: (pr) => pr }),
  P({ id: 'telekineticCrush', name: 'Telekinetic Crush', discipline: 'Telekinesis', src: 'Core p.172', cost: 200, action: 'full', target: 'enemy', kind: 'damage', impl: 'adapted',
    text: 'Grip and crush a foe: 2d10 + 2×PR Impact; the target is Snared for a round.', dmg: (pr) => `2d10+${pr * 2}`, damageType: 'impact', pen: () => 0, condition: { id: 'snared', rounds: 1 } }),
  P({ id: 'telekineticShield', name: 'Telekinetic Shield', discipline: 'Telekinesis', src: 'Core p.173', cost: 200, needs: ['forceBolt'], action: 'half', target: 'ally', kind: 'buff', impl: 'adapted', sustain: true,
    text: 'Sustained: an ally gains Armour Points equal to your Psy Rating everywhere.', condition: { id: 'shielded', rounds: -1 } }),
  P({ id: 'stormOfForce', name: 'Storm of Force', discipline: 'Telekinesis', src: 'Core p.173', cost: 500, needs: ['telekineticCrush'], action: 'full', target: 'enemies', kind: 'damage', impl: 'adapted',
    text: 'Every foe is battered: 1d10 + 2×PR Impact, Penetration PR.', dmg: (pr) => `1d10+${pr * 2}`, damageType: 'impact', pen: (pr) => pr }),
  // ── Telepathy ───────────────────────────────────────────────────────────
  P({ id: 'compel', name: 'Compel', discipline: 'Telepathy', src: 'Core p.166', cost: 100, action: 'half', target: 'enemy', kind: 'debuff', impl: 'adapted', opposed: true, living: true,
    text: 'Opposed Willpower: the target obeys a one-word command and loses its next turn (Stunned).', condition: { id: 'stunned', rounds: 1 } }),
  P({ id: 'dominate', name: 'Dominate', discipline: 'Telepathy', src: 'Core p.166', cost: 300, needs: ['compel'], action: 'full', target: 'enemy', kind: 'debuff', impl: 'adapted', opposed: true, living: true, sustain: true,
    text: 'Sustained, opposed Willpower: the target turns on its own allies.', condition: { id: 'dominated', rounds: -1 } }),
  P({ id: 'terrify', name: 'Terrify', discipline: 'Telepathy', src: 'Core p.165', cost: 200, action: 'half', target: 'rank', kind: 'debuff', impl: 'adapted', opposed: true, living: true,
    text: 'Opposed Willpower against a rank: those who fail are Frightened (−10 to hit, weaker blows) for 3 rounds.', condition: { id: 'frightened', rounds: 3 } }),
  P({ id: 'psychicScream', name: 'Psychic Scream', discipline: 'Telepathy', src: 'Core p.165', cost: 300, needs: ['terrify'], action: 'full', target: 'enemies', kind: 'damage', impl: 'adapted', opposed: true, living: true, pure: true,
    text: 'A shriek in the warp: every living foe failing opposed Willpower takes 1d10 + PR, ignoring armour, and is Stunned.', dmg: (pr) => `1d10+${pr}`, damageType: 'warp', condition: { id: 'stunned', rounds: 1 } }),
  P({ id: 'inspire', name: 'Inspire', discipline: 'Telepathy', src: 'Core p.166', cost: 100, action: 'half', target: 'allies', kind: 'buff', impl: 'adapted',
    text: 'Allies are Inspired (+10 to all Tests) for 3 rounds and freed from Fear.', condition: { id: 'inspired', rounds: 3 } }),
  P({ id: 'mindProbe', name: 'Mind Probe', discipline: 'Telepathy', src: 'Core p.164', cost: 200, action: 'half', target: 'enemy', kind: 'debuff', impl: 'adapted', opposed: true, living: true,
    text: 'Rifle a foe\'s mind: it is Marked (allies +10 to hit) and its next move is revealed.', condition: { id: 'marked', rounds: 3 }, explore: 'guidance' }),
  // ── Divination ──────────────────────────────────────────────────────────
  P({ id: 'foreshadow', name: 'Foreshadow', discipline: 'Divination', src: 'Core p.169', cost: 100, action: 'half', target: 'allies', kind: 'buff', impl: 'adapted',
    text: 'Glimpse the next moments: allies are Foreseen (+5×PR to Dodge and Parry) for 2 rounds.', condition: { id: 'foreseen', rounds: 2 } }),
  P({ id: 'inHarmsWay', name: 'In Harm\'s Way', discipline: 'Divination', src: 'Core p.169', cost: 200, action: 'half', target: 'ally', kind: 'buff', impl: 'adapted',
    text: 'Foresee every blow aimed at an ally: the next hit against them is ignored.', condition: { id: 'warded', rounds: 3 } }),
  P({ id: 'augury', name: 'Augury', discipline: 'Divination', src: 'Core p.168', cost: 200, action: 'full', target: 'self', kind: 'special', impl: 'adapted', explore: 'reveal',
    text: 'Read the Emperor\'s Tarot. In combat: +2 rerolls this turn. Exploring: reveal the path to the Fortress lord.' }),
  // ── Navigator powers ────────────────────────────────────────────────────
  P({ id: 'lidlessStare', name: 'The Lidless Stare', discipline: 'Navigator', src: 'Core p.181', cost: 0, action: 'full', target: 'enemies', kind: 'damage', impl: 'exact', char: 'WP', opposed: true, living: true, pure: true,
    text: 'Open the warp eye. Opposed Willpower against every living foe: 1d10 + WPB Energy (2d10 at Adept) ignoring armour and Toughness, and Stunned. Costs you Fatigue.',
    dmg: (m, wpb) => `${m >= 1 ? 2 : 1}d10+${wpb}`, damageType: 'energy', condition: { id: 'stunned', rounds: 1 } }),
  P({ id: 'heldInMyGaze', name: 'Held in My Gaze', discipline: 'Navigator', src: 'Core p.180', cost: 200, action: 'half', target: 'enemy', kind: 'debuff', impl: 'adapted', char: 'WP', opposed: true, living: true, sustain: true,
    text: 'Sustained, opposed Willpower: the target cannot act while you hold it in your gaze.', condition: { id: 'helpless', rounds: -1 } }),
  P({ id: 'foreshadowing', name: 'Foreshadowing', discipline: 'Navigator', src: 'Core p.180', cost: 200, action: 'half', target: 'allies', kind: 'buff', impl: 'adapted', char: 'Per',
    text: 'You see the shape of the next blows: allies are Foreseen (+10 to Dodge and Parry, +10 per mastery) for 2 rounds.', condition: { id: 'foreseen', rounds: 2 } }),
  P({ id: 'cloudInTheWarp', name: 'A Cloud in the Warp', discipline: 'Navigator', src: 'Core p.179', cost: 200, action: 'half', target: 'allies', kind: 'buff', impl: 'adapted', char: 'WP',
    text: 'Hide the party\'s presence: foes suffer −20 to hit them for a round.', condition: { id: 'cloaked', rounds: 1 } }),
  P({ id: 'gazeIntoTheAbyss', name: 'Gaze into the Abyss', discipline: 'Navigator', src: 'Core p.180', cost: 300, action: 'half', target: 'enemy', kind: 'debuff', impl: 'adapted', char: 'Per', explore: 'secrets',
    text: 'See the warp-stain on all things. In combat the target is Marked and Vulnerable. Exploring: reveal hidden passages in this room.', condition: { id: 'vulnerable', rounds: 3 } }),
  P({ id: 'courseUntravelled', name: 'The Course Untravelled', discipline: 'Navigator', src: 'Core p.180', cost: 300, action: 'full', target: 'self', kind: 'special', impl: 'adapted', char: 'Per', explore: 'reveal',
    text: 'The Fortress\'s halls are a warp-route. Exploring: reveal the path to its lord. In combat: the party gains +2 rerolls this turn.' }),
  P({ id: 'tidesOfTime', name: 'Tides of Time and Space', discipline: 'Navigator', src: 'Core p.181', cost: 400, needs: ['foreshadowing'], action: 'full', target: 'ally', kind: 'buff', impl: 'adapted', char: 'WP',
    text: 'Fold a moment: an ally gains an extra Fortune play on their next turn.', condition: { id: 'quickened', rounds: 2 } }),
].map((p) => [p.id, p]));

export const ASTROPATH_STARTING = ['forceBolt', 'compel', 'foreshadow'];
export const NAVIGATOR_STARTING = ['lidlessStare'];

export const MASTERY = ['Novice', 'Adept', 'Master'];

// ── Psychic Phenomena and Perils of the Warp (Core p.160, condensed) ─────────

export interface PhenomenonDef { max: number; name: string; text: string; effect: 'none' | 'insanity' | 'corruption' | 'drain' | 'flicker' | 'fear' | 'perils' }

export const PHENOMENA: PhenomenonDef[] = [
  { max: 25, name: 'Dark Foreboding', text: 'A faint breeze, a far-off scream. Nothing more.', effect: 'none' },
  { max: 40, name: 'Hoarfrost', text: 'Frost creeps across the deck plates. The psyker\'s mind recoils (+1 Insanity).', effect: 'insanity' },
  { max: 52, name: 'Unnatural Aura', text: 'The air tastes of iron and old prayers (+1 Corruption).', effect: 'corruption' },
  { max: 62, name: 'Psychic Drain', text: 'The power bleeds the psyker (loses 10% of Wounds).', effect: 'drain' },
  { max: 70, name: 'Warp Echo', text: 'Every die on the tray flickers to its opposite face.', effect: 'flicker' },
  { max: 76, name: 'Ghostly Voices', text: 'The dead whisper. Allies who fail Willpower are Frightened.', effect: 'fear' },
  { max: 999, name: 'Perils of the Warp', text: 'The warp answers too eagerly.', effect: 'perils' },
];

export interface PerilDef { max: number; name: string; text: string; effect: 'stun' | 'wound' | 'daemon' | 'burnout' }

export const PERILS: PerilDef[] = [
  { max: 40, name: 'The Gibbering', text: 'The psyker is Stunned for a round and gains 1d10 Insanity.', effect: 'stun' },
  { max: 70, name: 'Warp Burn', text: 'Raw warp-fire: 2d10 damage ignoring armour, and 1d5 Corruption.', effect: 'wound' },
  { max: 90, name: 'Psychic Backlash', text: 'The psyker\'s Psy Rating counts as 0 for the rest of the fight.', effect: 'burnout' },
  { max: 999, name: 'Daemonic Incursion', text: 'Something comes through. A warp entity joins the fight.', effect: 'daemon' },
];
