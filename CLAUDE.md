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
| 2. Special pieces and combos | Next |
| 3. Level system and mixed objectives | Not started |
| 4. 100 generated levels and difficulty curve | Not started |
| 5. Level map, progress save, PWA/offline, polish | Not started |

**Not yet pushed to GitHub.** The workspace that built this had no GitHub access. If you have access, create
`kaboatman85/jennys-jems`, push `main`, and enable Settings > Pages > Source: GitHub Actions. The deploy
workflow (`.github/workflows/deploy.yml`) already exists: it runs `npm ci`, `npm test`, `npm run build`, then
deploys `dist/`. Live URL will be `https://kaboatman85.github.io/jennys-jems/`.

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
  board.ts    Pure game logic. No DOM. grid[row][col], gems are {id, type}. Match finding,
              swap checks, move finding, gravity/refill (collapse), shuffle, seeded RNG.
  gems.ts     Procedural 3D gem drawing (drawGem) + GemSprites cache. Behind the GemArt interface.
  game.ts     The Game class: layout, pre-rendered frame, tween/animation engine, input,
              resolve loop (match > clear > fall > refill > repeat), particles, rendering.
  deco.ts     Canvas flower/leaf painters (used by bg.ts and the board frame).
  bg.ts       Page background: pastel gradient + scattered flowers.
  audio.ts    WebAudio synthesized sound effects (no audio files). Mute persists.
  storage.ts  Guarded localStorage wrappers (loadJSON / saveJSON).
  main.ts     Wires DOM, buttons, resize, ?debug hook.
  style.css   Page styling.
tests/board.test.ts   Engine unit tests (7).
tools/render-gems.ts  Gem contact sheet renderer.
tools/playtest.py     Playwright end-to-end playtest.
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
  (diamond, yellow), 4 Amethyst (triangle, purple), 5 Rose Quartz (cushion, pink). `TYPES = 6` in `board.ts`.
  Shapes are distinct on purpose (color-blind friendly). Levels will want a 7th gem; add it to `GEM_DEFS` in
  `gems.ts` and give it its own silhouette.

### Test hooks

Open the app with `?debug` and it exposes `window.__game`. `isBusy` and `getHint()` (a random valid move as
client coordinates) exist for the playtest, and `getHint()` is also the basis for a future in-game hint button.

### localStorage keys

`jj.muted` (boolean), `jj.best` (number). Use the same `jj.` prefix for new keys. Always go through
`storage.ts`; localStorage can throw or be empty (private mode).

## Milestone 2 spec: special pieces (PROPOSAL; confirm with Albert before building)

The owner asked for "a hybrid": Bejeweled-style specials plus Candy-Crush-style line clearers ("bombs, lasers,
etc."). Proposed set:

| Piece | Created by | When matched/activated |
|---|---|---|
| **Laser** | 4 in a line | Clears its entire row or column (orientation follows the line that made it) |
| **Bomb (Flame)** | L, T, or + shaped match (5+ cells) | Explodes a 3x3 area; chain-triggers other specials caught in it |
| **Hypercube** | 5 in a line | Swap it with any gem: clears every gem of that color |
| **Star / Supernova** | OPEN QUESTION: e.g. 6+ in a line, or a match in a cascade | Bigger blast (e.g., row + column + diagonals, or 5x5) |

Special + special swap combos (proposal): Laser+Laser = row and column cross; Bomb+Bomb = 5x5 blast;
Laser+Bomb = 3-wide row and column; Hypercube+anything = converts/clears that color with the other effect
applied to each; Hypercube+Hypercube = clear the board.

Questions to settle with Albert up front (he prefers being asked over guessing):
1. Exact piece set and what creates each (the Star/Supernova row above is undecided).
2. Do specials appear where the swap landed (usual) or at the match center?
3. Do specials count toward objectives (collect-X-of-a-color, etc.) when they clear gems?

Implementation notes: `findRuns()` already carries what's needed; add a pure `planSpecials(runs, swapPos)` in
`board.ts` (or a new module) that returns which cells become specials, and a pure `expandActivation(grid, cells)`
that resolves chain reactions. Extend `Gem` with an optional `special?: { kind, orientation? }`, and add
overlay drawing (glow, stripes, rings) on top of the base sprite so any color can be any special. Write unit tests first.
`game.ts` is already one large class: split rendering/animation/input out of it as part of this milestone
rather than adding more to it.

## Milestones 3 and 4 notes: levels

- **Generated from parameters, seeded per level** (`mulberry32(levelNumber)` style) so levels are stable
  across plays. Parameters to tune: board shape/mask, number of gem colors (4 to 7), objective type and
  target, move limit, obstacle types/density, and which specials are enabled.
- **Mixed objectives:** score target, clear marked tiles (ice/dirt, possibly multi-hit), drop items to the
  bottom row, collect N of a color. Levels can combine two.
- **Difficulty curve:** introduce one new mechanic at a time with easy "tutorial" levels, ramp gradually,
  and add occasional easier "breather" levels. Obstacles phase in over the 100 levels.
- Add a headless **level solver/simulator** (random and greedy bots running the pure engine) to estimate win
  rates per level, so the curve is tuned with data and not by feel. Real tuning still needs human playtesting
  passes; budget for them.
- Board size is currently fixed 8x8 (`ROWS`/`COLS` in `board.ts`); level masks will need that to become
  per-level.

## Milestone 5 notes: shipping on the Fire tablet

- Add a level-select map (floral, bright), star ratings, unlock progression, all in localStorage.
- Add PWA pieces: web manifest, icons, service worker for offline play.
- **Unverified:** whether Silk (Fire tablet browser) supports a true "install web app" flow. A web search
  didn't confirm it. What's confirmed: Silk can pin a page to favorites on its home page. The reliable path is
  pinning plus PWA/offline caching. **Backup plan:** wrap the site as an APK (PWABuilder or Capacitor) and
  sideload it; the owner is comfortable with ADB. Test on a real Fire tablet as soon as the Pages link is live.
- Sound was synthesized and the logic runs error-free in a headless browser, but **nobody has heard it yet**.
  Ask Albert how it sounds.

## Known gaps / tech debt

- `game.ts` is a monolith (layout + frame art + animation + input + resolve loop). Split it during Milestone 2.
- New gems spawn fully random, so cascades can chain luckily; `ensurePlayable()` reshuffles if no moves remain,
  but there's no hint button yet (`getHint()` exists).
- Score formula is placeholder: 10 per gem, +40 for a 4-run, +100 for a 5+-run, multiplied by the cascade combo.
- Fonts are system fonts (rounded fallbacks). Embedding a fun font file would help the look on Fire OS.
- No pause/menu screen, no title screen yet.

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
