# Warp Dice — The Blackstone Venture

A browser roguelite on **Rogue Trader** rules. You are a Lord-Captain who has lost everything but a name. Your crew of two or three retainers ventures into a **Blackstone Fortress** that reshapes itself every time. You go in for Thrones, xenos relics and the Warrant of Trade your family lost. If the Lord-Captain dies, the Dynasty ends and you start again.

It's a sibling of [Treasure Dice](../treasure_dice). The roguelite skeleton is the same: seeded labyrinths, menu combat, and the Balatro-style Fortune tray. The fifth-edition kernel is replaced with Rogue Trader's percentile system. Static site (Vite + TypeScript, no backend), works offline.

```bash
npm install
npm run dev                            # http://localhost:5173
npm test                               # rules, origin path, fortune, 1,000-seed Fortress property test, ventures, Lord-Captain death, saves
npm run build                          # dist/ for GitHub Pages
npm run sim -- 24 1 docks standard     # Monte Carlo balance: runs, power level, region, difficulty
npm run sim -- 24 20 finale standard   # ...or the Heart of the Fortress
```

## The loop

1. **Found a Dynasty.** Name the House and the lost flagship. Build the Lord-Captain through the five-step **Origin Path** (with the column-adjacency rule), and pick a Characteristic method (100 points, 2d10+25 arranged, in order, or heroic). Then sign on two or three retainers from career templates, each customisable the same way.
2. **The enclave** (persistent): bank Thrones, buy gear (rare goods need an **Acquisition Test** against Profit Factor), sell or present valuables, re-craft gear at the Tech-Shrine, sign on retainers, and spend experience.
3. **A venture** (one seeded Fortress): the Lord-Captain and up to three retainers. Move Forward, Left, Right and Back, search, pass Skill Tests in events, trade with scavengers, find the warp-key, kill the region's lord, and walk out alive.
4. **Aftermath**: Thrones and items are banked, experience is earned, the next region unlocks, and a story chapter is revealed. Clear all five and raise the Lord-Captain to power level 18 to storm the **Heart of the Fortress** and take the Warrant back from the man who stole it.

## Rules

The full working rules are in **[docs/RULES.md](docs/RULES.md)**, also summarised under *How to play* in game:

- **Characteristics and Tests**: nine Characteristics, d100 Tests with Degrees of Success, half-Characteristic untrained Basic skills.
- **8 careers**: Rogue Trader, Arch-militant, Astropath, Explorator, Missionary, Navigator, Seneschal, Void-master. Each has the book's advance scheme, career skills and talents, a starting kit, Rank 1–8 features, and a Fortune talent that touches the dice.
- **Combat**:
  - Full and Half Actions: Standard, Semi- and Full-Auto bursts (extra hits per Degree of Success), Called Shot, All Out Attack, Charge, Aim, Defensive Stance.
  - Hit locations, Armour against Penetration, Toughness Bonus, weapon qualities, jams and overheats.
  - Righteous Fury, Dodge and Parry, force fields.
  - Blood Loss, spending and burning Fate, Fear, Insanity and Corruption.
- **Psychic techniques** (Fettered, Unfettered, Push; Psychic Phenomena and Perils of the Warp) and **Navigator Powers** (the Lidless Stare and six more, with Novice, Adept and Master).
- **Armoury and item generator**: the core and Into the Storm tables. Weapons, armour by location, force fields, gear, cybernetics, chems and grenades, Craftsmanship (Poor, Common, Good, Best), upgrades and special ammunition, Availability, and Fortress valuables. Loot and market stock are rolled with craftsmanship weights and availability caps.

Where the game changes a rule to fit (ranks instead of range bands, the Wound scale, armour as a soak percentage, Blood Loss), the change is tagged **adapted** on the sheet and in RULES.md.

## The Fortune tray

Every venture starts with a fresh bag of **d10s**: six iron, plus two per explorer in their career's material. Select and reroll dice on the shared tray, then play up to five with an action as a poker-dice hand (Pair, Straight, Colours, Full House… Emperor's Hand).

- **Damage** = (action damage + hand chips + pips) × mult.
- **Every scored 10 is a Righteous Fury.**
- 64 relics (the Jokers), tarot cards to level hands, sanctified faces, special dice, tokens, scrip with interest, enemy hexes, and curses from the region lords.
- All of it resets when the venture ends.

## Code map

| Path | What |
|---|---|
| `src/engine/` | seeded RNG streams, d100 Tests, hit locations, dice, domain types |
| `src/fortune/` | d10 hand evaluation, scoring (with Fury), relics, curses, tray, boons |
| `src/content/` | careers, Origin Path, skills, talents, powers, armoury, Fortress regions, denizens, events, story |
| `src/rules/` | `derive` (the single stat resolver), creation, advancement, balance curves |
| `src/combat/` | kernel (Fear, soak, Blood Loss, Burning Fate), explorer actions and powers, AI |
| `src/dungeon/` | Fortress generator and solvability validator, the Nursery tutorial map, venture controller |
| `src/meta/` | the enclave (founding, market and Acquisition, Exchange, Tech-Shrine, drill), loot generator |
| `src/app/` | `dispatch(state, cmd)`, headless autoplayer |
| `src/ui/` | screens, the creation wizard, the felt tray, scoring animation, tour, share card |

Every state change is a command (`src/app/commands.ts`). The UI, keyboard, tests and simulator all go through `dispatch`, and the game autosaves after each command.

## Art

None is bundled yet: every portrait, foe, relic and scene falls back to a drawn placeholder. `npm run art-spec` writes `art/spec.json` (301 entries, each with a style group and subject) for an image pipeline. Drop `.webp` files in `public/art/` and list their keys in `public/art/manifest.json`.

## Controls

- **Exploring:** arrow keys or WASD.
- **Combat:** `1`–`9` and `0` select dice, `R` rerolls, `A`/`B`/`C`/`D`/`G` open Attack, Career, Powers, Items and Stance menus, `E` ends the turn, `Esc` goes back.

See [LICENSES.md](LICENSES.md).
