/**
 * Skills (Core Rulebook ch. III, condensed). A trained Skill tests against its
 * full Characteristic (+10/+20 with mastery). An untrained Basic Skill tests
 * against half the Characteristic; an untrained Advanced Skill cannot be used.
 * Lore skills are folded into a single Forbidden Lore skill.
 */
import type { Char, SkillId } from '../engine/types.ts';

export interface SkillDef { id: SkillId; name: string; char: Char; basic: boolean; text: string }

export const SKILLS: Record<SkillId, SkillDef> = {
  awareness: { id: 'awareness', name: 'Awareness', char: 'Per', basic: true, text: 'Notice hidden things, ambushes and secret doors.' },
  dodge: { id: 'dodge', name: 'Dodge', char: 'Ag', basic: true, text: 'Reaction: Test to negate a hit.' },
  command: { id: 'command', name: 'Command', char: 'Fel', basic: true, text: 'Give orders that are obeyed; rally allies.' },
  commerce: { id: 'commerce', name: 'Commerce', char: 'Fel', basic: false, text: 'Trade, value and haggle. Drives Acquisition Tests.' },
  charm: { id: 'charm', name: 'Charm', char: 'Fel', basic: true, text: 'Win people over.' },
  deceive: { id: 'deceive', name: 'Deceive', char: 'Fel', basic: true, text: 'Lie convincingly.' },
  intimidate: { id: 'intimidate', name: 'Intimidate', char: 'S', basic: true, text: 'Frighten others into compliance.' },
  inquiry: { id: 'inquiry', name: 'Inquiry', char: 'Fel', basic: true, text: 'Ask the right questions of the right people.' },
  scrutiny: { id: 'scrutiny', name: 'Scrutiny', char: 'Per', basic: true, text: 'See through lies and read intent.' },
  search: { id: 'search', name: 'Search', char: 'Per', basic: true, text: 'Comb a room for hidden things.' },
  security: { id: 'security', name: 'Security', char: 'Ag', basic: false, text: 'Open locks and bypass wards.' },
  techUse: { id: 'techUse', name: 'Tech-Use', char: 'Int', basic: false, text: 'Placate machine spirits and work mechanisms.' },
  medicae: { id: 'medicae', name: 'Medicae', char: 'Int', basic: false, text: 'Treat wounds and poisons.' },
  forbiddenLore: { id: 'forbiddenLore', name: 'Forbidden Lore', char: 'Int', basic: false, text: 'Archeotech, xenos and the warp.' },
  evaluate: { id: 'evaluate', name: 'Evaluate', char: 'Int', basic: true, text: 'Judge the worth of goods and relics.' },
  navigation: { id: 'navigation', name: 'Navigation', char: 'Int', basic: false, text: 'Find the way through the Fortress.' },
  psyniscience: { id: 'psyniscience', name: 'Psyniscience', char: 'Per', basic: false, text: 'Sense the warp and its creatures.' },
  invocation: { id: 'invocation', name: 'Invocation', char: 'WP', basic: false, text: 'Focus the mind before a psychic technique.' },
  climb: { id: 'climb', name: 'Climb', char: 'S', basic: true, text: 'Scale walls and shafts.' },
  silentMove: { id: 'silentMove', name: 'Silent Move', char: 'Ag', basic: true, text: 'Move unheard.' },
  survival: { id: 'survival', name: 'Survival', char: 'Int', basic: true, text: 'Endure hostile places; find food and shelter.' },
  logic: { id: 'logic', name: 'Logic', char: 'Int', basic: true, text: 'Solve puzzles and ciphers.' },
  acrobatics: { id: 'acrobatics', name: 'Acrobatics', char: 'Ag', basic: false, text: 'Tumble, leap and keep your feet.' },
};

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

/** XP cost to train a skill to the next level (trained → +10 → +20). */
export function skillCost(next: number): number {
  return next === 0 ? 100 : next === 10 ? 200 : 300;
}
