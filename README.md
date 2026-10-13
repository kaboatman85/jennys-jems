# Jenny's Jems

A bright, floral match-3 gem game. Phone/tablet-first, runs in any modern browser, no backend.

## Status

- [x] Milestone 1: board engine, 3D procedural gems, swipe/tap input, cascades, sound with mute toggle, local best score
- [ ] Milestone 2: special pieces (Flame, Star, Hypercube, Laser, Bomb) and combos
- [ ] Milestone 3: level system with mixed objectives
- [ ] Milestone 4: 100 generated levels with a gradual difficulty curve
- [ ] Milestone 5: level map, progress saving, PWA/offline, polish

## Develop

```bash
npm install
npm run dev      # local dev server (also reachable from your phone on the same Wi-Fi)
npm test         # engine unit tests
npm run build    # typecheck + production build into dist/
```

Gem art is drawn in code (`src/gems.ts`). `node tools/render-gems.ts out.png` renders a contact sheet
of the gems without needing a browser. The renderer sits behind the `GemArt` interface, so sprite
images can be swapped in later without touching game logic.

## Deploy (GitHub Pages)

1. Push to `main` on GitHub.
2. Repo **Settings > Pages > Source: GitHub Actions**.
3. The included workflow tests, builds, and publishes on every push.

The build uses a relative base path, so it works from `https://<user>.github.io/jennys-jems/`.
