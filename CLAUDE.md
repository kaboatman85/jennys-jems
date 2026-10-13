# Jenny's Jems: project handoff

You're picking up a match-3 gem game that was started in a Claude chat session. Milestone 1 is done and
tested. Read this whole file first; it holds the decisions already made so you don't re-ask them.

## What we're building

**Jenny's Jems**: a Bejeweled-style match-3 game.

- Phone/tablet first, touch swipe. The owner will most likely play on an **Amazon Fire tablet** (Silk browser).
  Mouse works too.
- Static site, no backend, hosted on **GitHub Pages**. Repo: `kaboatman85/jennys-jems`.
- **100 levels**, generated from tunable parameters (not hand-built), getting gradually harder.
- **Mixed objectives** per level (score, clear tiles, drop items, collect colors).
- **Special pieces** (see the Milestone 2 spec below).
- **Look and feel:** bright and fun, floral designs built into the pages. Gems look 3D (faceted, lit from the top-left).
- **Sound effects** with an on/off toggle that persists.
- Progress saved in **localStorage** only (no accounts, no sync).

## Status

| Milestone | State |
|---|---|
| 1. Board engine, 3D gems, swipe/tap input, cascades, sound + mute, best score, floral UI | **Done, tested** |
| 2. Special pieces and combos | **Done, tested** |
| 3. Level system and mixed objectives | **Done, tested** |
| 4. 100 generated levels and difficulty curve | **Done, tested** |
| 5. Level map, progress save, PWA/offline, polish | **Done, tested** |

**Live on GitHub Pages** at `https://kaboatman85.github.io/jennys-jems/`, deployed via
`.github/workflows/deploy.yml` (Settings > Pages > Source: GitHub Actions) on every push to `main`.

## Commands

```bash
npm install
npm run dev        # vite dev server, --host so a phone/tablet on the same Wi-Fi can open it
npm test           # node --test tests/*.test.ts  (engine unit tests; Node 22 type-stripping, no extra deps)
npm run build      # tsc --noEmit && vite build -> dist/
python3 tools/playtest.py          # end-to-end browser playtest (run `npm run build` first)
node tools/render-gems.ts out.png  # renders a gem contact sheet PNG, no browser needed
```

Versions in use: Node 22, TypeScript ^7.0.2, Vite ^8.3.4, @napi-rs/canvas ^1.0.11 (dev only, for the gem sheet).
No runtime dependencies at all.

## Architecture

```
src/
  board.ts            Pure game logic. No DOM. grid[row][col], gems are {id, type, special?,
                       obstacle?, dropItem?}. Match finding, swap checks, move finding, mask-aware
                       gravity/refill (collapse), shuffle, seeded RNG.
  specials.ts         Pure special-piece logic: planSpecials() (what a match shape creates),
                       expandActivation() (chain/flood resolution incl. obstacle damage),
                       comboActivation() (special+special swaps).
  level.ts            Pure level state: objectives, move limit, win/loss (LevelConfig/LevelState).
  levelgen.ts         generateLevel(n) -- deterministically builds all 100 LevelConfigs from
                       tunable difficulty parameters, seeded per level.
  levels-progress.ts  Pure, localStorage-backed star ratings and unlock progression.
  gems.ts             Procedural 3D gem drawing (drawGem) + sprite caches (gem/special/obstacle/
                       drop-item overlays). Behind the GemArt/OverlayArt/ObstacleArt interfaces.
  game.ts             The Game class: layout, pre-rendered frame, tween/animation engine, resolve
                       loop (match > clear > fall > refill > repeat), particles, rendering, plus
                       newGame() (endless) and startLevel(config) (level mode) entry points.
  board-input.ts      Pointer/swipe input -> swap intents, gated by an isPlayable() callback.
  board-render.ts      Board frame pre-render + per-frame draw, mask-aware.
  deco.ts             Canvas flower/leaf painters. Currently unused (the owner's artwork replaced the
                       procedural decoration); safe to delete.
  bg.ts               Page background: the owner's artwork (public/bg-mockup.jpg), cover-fit, gradient fallback.
  blocks.ts           Pure block-puzzle engine (see "Block puzzle" below).
  blocks-game.ts      Canvas front-end for the block puzzle: drag-and-drop, preview, clear effects.
  audio.ts            WebAudio synthesized sound effects (no audio files). Mute persists.
  storage.ts          Guarded localStorage wrappers (loadJSON / saveJSON).
  main.ts             Wires DOM: level-select screen, game screen (endless + level mode), HUD,
                       level complete/failed overlay, ?debug and ?level=N hooks, SW registration.
  style.css           Page styling.
tests/*.test.ts            Engine/level/specials/progress unit tests (61).
tools/render-gems.ts       Gem + special-overlay contact sheet renderer.
tools/render-icons.ts      Renders the PWA app icons from the procedural gem art.
tools/solve-levels.ts      Headless random/greedy bot solver -- win-rate estimates per level,
                           used to tune the difficulty curve in levelgen.ts.
tools/playtest.py          Playwright end-to-end playtest.
public/manifest.webmanifest, public/icons/, public/sw.js   PWA: installable + offline app shell.
```

### Key design points (don't undo these without a reason)

- **Engine is pure and separate from rendering.** Keep it that way. New rules go in `board.ts` (or new pure
  modules) with unit tests; `game.ts` only animates the results.
- **`findRuns()` returns runs with direction and type**, not just cells. This is deliberate: Milestone 2
  needs run length and shape (4-line, 5-line, L/T) to decide which special piece to create.
- **Sprites are keyed by `gem.id`.** Game state (`grid`) and visuals (`sprites` Map) are separate; animation
  tweens move sprites, then the logic grid is updated. `collapse()` returns `falls` (existing gems) and
  `spawns` (new gems starting above the board at negative rows).
- **`gen` counter pattern.** Every async flow captures `const gen = this.gen` and bails if it changed. `newGame()`
  bumps `gen` and flushes all tweens, so New Game mid-animation can't wedge the game. Use the same pattern
  for any new async flow (level start, level quit).
- **`busy` flag** blocks input during animations. It's reset in `finally` blocks (only if `gen` still matches).
- **Gem art is swappable** via the `GemArt` interface (`get(type, px)`). Sprite images can replace the
  procedural art without touching game logic. The owner offered to find free gem images if the procedural
  look disappoints; if so, CC0 only (Kenney.nl, OpenGameArt CC0), transparent PNGs, 128px+, one consistent
  style.
- **Layout:** the canvas is sized from the `#stage` container; the frame (pink floral band, plum board,
  checker cells, flowers) is pre-rendered once per layout into an offscreen canvas. Gems are drawn from
  per-size cached sprites at device-pixel resolution.
- **TS config is strict and "erasable only"** (`erasableSyntaxOnly`): no enums, no namespaces, no constructor
  parameter properties. Imports use explicit `.ts` extensions and `import type` for types. This is so
  `node --test` can run the TypeScript tests directly.
- `roundRectPath()` uses `arcTo` instead of `ctx.roundRect()` for older-browser (Silk) safety.
- Gem types: 0 Ruby (round, red), 1 Emerald (octagon, green), 2 Sapphire (hexagon, blue), 3 Citrine
  (diamond, yellow), 4 Amethyst (triangle, purple), 5 Rose Quartz (cushion, pink), 6 Topaz (pentagon,
  orange). Shapes are distinct on purpose (color-blind friendly). `nTypes` is per-level now (4-7,
  ramping with difficulty), not a fixed constant -- `TYPES` in `board.ts` is just the endless-mode default.
- **Levels are generated, not hand-built.** `levelgen.ts`'s `generateLevel(n)` is pure and deterministic
  (seeded `mulberry32(n)`); tune difficulty by editing its parameter functions (`rowsColsFor`, `nTypesFor`,
  `obstaclesFor`, `dropItemsFor`, `moveLimitFor`, etc.), then re-run `node tools/solve-levels.ts` to check
  the win-rate curve before committing a change. A drop item only advances when a match clears a cell
  *below it in its own column* -- that's why drop items spawn close to the bottom rather than at the top.
- **The live game only ever plays through `game.ts`'s `newGame()` (endless) or `startLevel(config)` (level
  mode).** `main.ts` is the only caller; it owns screen switching (level-select vs. game), the HUD (pills +
  objectives bar), and the win/loss overlay. Keep that separation -- game.ts has no knowledge of screens/DOM
  beyond its own canvas and hooks.

### Test hooks

Open the app with `?debug` and it exposes `window.__game`, plus `window.__launchLevel(id)` and
`window.__generateLevel(id)`. `isBusy`, `getHint()` (a random valid move as client coordinates), and
`level` (current `LevelState | null`) exist for testing; `getHint()` is also the basis for a future
in-game hint button. `?level=N` (no `?debug` required) launches straight into that level, handy for
linking to or screenshotting a specific one.

**Automation note:** native `requestAnimationFrame` is throttled/stalled under CDP browser automation
(Claude-in-Chrome, headless, etc.), so `await`ing an async `Game` method (e.g. `startLevel`) can hang past
a tool's timeout. Fire it without awaiting (`void game.startLevel(config)`), then pump frames manually:
`g.loop(performance.now())` in a `setTimeout` loop until `!g.busy`. This is a testing-environment quirk
only -- real browsers run rAF normally.

### localStorage keys

`jj.muted` (boolean), `jj.best` (number), `jj.levels` (`Record<levelId, {stars, bestScore}>`, written by
`levels-progress.ts`). Use the same `jj.` prefix for new keys. Always go through `storage.ts`; localStorage
can throw or be empty (private mode).

## Milestone 2: special pieces (as built)

| Piece | Created by | When matched/activated |
|---|---|---|
| **Laser** | 4 in a line | Clears its entire row or column; orientation follows the *swipe direction* that made the match (not just the line's axis) |
| **Bomb** | 2x2 block, or L/T/+ shaped match | Explodes a 3x3 area; chain-triggers other specials caught in it |
| **Hypercube** | 5 in a line | Swap it with any gem: clears every gem of that color |
| **Star** | A match that happens mid-cascade (combo >= 2), 5+ cells | Bigger blast (5x5) |

Special+special swap combos: Laser+Laser = full row+column cross; Bomb+Bomb = 5x5 blast; Laser+Bomb =
3-wide row+column band; Hypercube+anything = clears that color, with the other special's effect also
applied; Hypercube+Hypercube = clears the whole occupied board. Specials appear where the swap landed.
They count toward objectives like any other cleared gem (`clearedCounts` flows through to `applyClear`).

Logic lives in `specials.ts` (`planSpecials`, `expandActivation`, `comboActivation`), fully unit-tested.
`game.ts` was split into `board-input.ts` (input) and `board-render.ts` (frame + draw) as part of this work.

## Milestones 3 and 4: levels (as built)

- `levelgen.ts`'s `generateLevel(n)` is pure and deterministic (`mulberry32(n)`), tuning: board size/mask
  (6x6 up to 9x9, occasional corner-blocked masks from level 21+), gem color count (4 to 7, ramping),
  which specials are enabled (laser+bomb from 6, hypercube from 15, star from 25), obstacle count/type/hits,
  drop-item count/position, objective kind(s) and targets, and move limit.
- **Mixed objectives implemented:** `score`, `clearTiles` (ice/dirt obstacles, multi-hit, adjacency-chain
  breaking), `dropItems` (deliver to the bottom row), `collectColor`. Levels 71+ combine two.
- **Difficulty curve:** tutorial band (1-10, single color-count/objective) near 100% win rate, ramping
  through obstacles/drop-items/masks, easing every 10th level (`difficultyIndex`), tapering to a harder
  but still-winnable endgame (81-100). Validated with `tools/solve-levels.ts` (random + greedy bots against
  the pure engine, no rendering) -- re-run it after any `levelgen.ts` tuning change before trusting a curve
  change; a stuck board must reshuffle (`shuffleGrid`) in the solver too, or win rates read falsely low.
  **Known hard spot:** a drop item only advances when a match clears a cell *below it in its own column* --
  that's why `dropItemsFor()` places items 1-2 rows above the bottom rather than higher up; if drop-item
  levels ever feel too hard again, that mechanic (not just the parameters) is the first thing to revisit.

## Milestone 5: shipping on the Fire tablet (as built)

- Level-select home screen (`main.ts` + `#screen-levels`): 100-level scrollable grid, locked/unlocked,
  0-3 stars. `levels-progress.ts` is the pure localStorage-backed progress module -- level N unlocks once
  N-1 has a win recorded; stars are based on moves spent vs. the level's budget (<=50% of limit = 3 stars,
  <=75% = 2, else 1).
  - Game screen is shared between level mode and the original endless mode; the right-hand pill shows
    Best (endless) or Moves (level), and an objectives bar above the board shows live per-objective progress
    only in level mode.
- PWA pieces added: `public/manifest.webmanifest`, icons rendered from the procedural gem art
  (`tools/render-icons.ts`), and a stale-while-revalidate service worker (`public/sw.js`, registered only
  in production builds via `import.meta.env.PROD`).
- **Still unverified:** whether Silk (Fire tablet browser) supports a true "install web app" flow, and
  whether the service worker actually lets the game open offline on that specific device/browser. Test on
  a real Fire tablet. **Backup plan if not:** wrap the site as an APK (PWABuilder or Capacitor) and sideload
  it; the owner is comfortable with ADB.
- Sound was synthesized and the logic runs error-free, but **nobody has confirmed how it sounds on a real
  device yet.** Ask Albert.

## Block puzzle (second game, added after Milestone 5)

A Block Blast / 1010!-style game that lives inside the app as its own screen (`#screen-blocks`), opened
from the "블록 Blocks" button next to Endless on the level-select screen. Drag one of three pieces from the
tray onto an 8x8 grid; full rows/columns clear. No rotation. Game over when no tray piece fits anywhere.

- **Engine (`blocks.ts`, pure, 14 tests in `tests/blocks.test.ts`):** 29 shapes in 3 tiers. Difficulty is a
  *stage* derived from score (`stageFor`: sqrt(score/40), capped at 10, shown 1-based in the HUD).
  `tierShares(stage)` controls the draw mix: stage 0 = starter shapes only (dot, 2-3 bars, 2x2), tier 2
  (4-bars, small L, 2x3) from stage 1, tier 3 (5-bars, big L, T, S/Z, 3x3) from stage 3. Below
  `FAIR_TRAY_BELOW_STAGE` (6) a tray always contains a placeable piece (`nextTray`, with a forced-fit
  fallback); from stage 6 up it doesn't, which is the difficulty.
- **Scoring:** 1 per block placed, 10 x lines^2 per clear, +20 per extra move in a clearing streak.
- **Front-end (`blocks-game.ts`):** one canvas holds board + tray. Held piece floats ~0.9 cell above the
  finger and snaps to the nearest grid position; a translucent ghost shows where it lands and rows/columns
  it would clear glow gold. `onLayout` reports the board rect so `main.ts` can size the `.blocks-frame`
  overlay (the four `frame-*.png` corner pieces) around it.
- **Storage:** `jj.blocks.best`. A game in progress is not saved (leaving to the menu abandons it).
- **Test hooks:** with `?debug`, `window.__blocks` (`.state`, `.tryPlace(slot, r, c)`, `.step(now)` to pump a
  frame) and `window.__startBlocks()`.
- **Ideas not built yet:** a proper home hub instead of a button on the level screen, saved in-progress
  games, more stage-driven difficulty (pre-filled junk cells, fewer fair trays), sound beyond reusing the
  match-game effects, and a block level map like the gem game's.

## Known gaps / tech debt

- New gems spawn fully random, so cascades can chain luckily; `ensurePlayable()` reshuffles if no moves remain,
  but there's no hint button yet (`getHint()` exists and is exactly what a hint button would call).
- Score formula is still a placeholder: 10 per gem, +40 for a 4-run, +100 for a 5+-run, multiplied by the
  cascade combo, +150 for a combo swap. Fine for relative progress; hasn't been tuned against the generated
  levels' score targets beyond "the solver bots can reach them."
- Fonts are system fonts (rounded fallbacks). Embedding a fun font file would help the look on Fire OS.
- No pause/menu screen mid-level beyond the Menu button (which just leaves the level -- progress on that
  attempt isn't saved, only a completed/failed result is). No title screen.
- Level-select grid is a plain CSS grid scroller, not a themed "map" with a path/trail between levels --
  functional but plainer than a full level-map mockup would look. Revisit if the owner wants more visual
  flourish there.
- PWA install/offline behavior is implemented but unverified on a real device (see Milestone 5 above).

## How Albert likes to work (applies to you too)

- Senior hardware product manager with deep PM/hardware expertise. **Software depth is thinner**, so explain
  code decisions in plain terms and say what you changed and why.
- **Casual, direct, a touch of warmth.** Lead with the answer. Skip filler openers and AI clichés.
- **Ask before guessing** on ambiguous requests; asking several questions is fine.
- **Propose a plan first, then work milestone by milestone and wait for sign-off** before moving on.
- **Be conservative with structural changes:** explain your approach before making significant ones.
  Cite library docs and versions when relevant.
- Be a real sparring partner: flag risks, challenge assumptions, say so if there's a better approach than what
  he asked for.
- Give a best guess with a clear caveat rather than refusing. List your assumptions at the end of longer replies.
- American English, imperial units, MM/DD/YYYY dates.
- Commits: end messages with the Co-Authored-By trailer your tooling adds.
