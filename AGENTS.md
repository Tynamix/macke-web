# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project overview

**macke-web** is a zero-dependency, mobile-first browser game: *Macke* (a variant of the dice game 10.000 / Farkle). Players take turns rolling 6 dice, select scoring dice, and race to 10,000 points. The UI language is German.

## Stack & structure

- Plain HTML/CSS/JS — no build step, no package.json, no frameworks.
- `index.html` — all three screens (setup, game, winner) in one file.
- `game.js` — single IIFE with a central `state` object; all logic lives here.
- `style.css` — dark theme using CSS custom properties defined in `:root`.

## Running & testing

- No build or test suite. Open `index.html` directly in a browser or serve statically (e.g. `python3 -m http.server`).
- Verify changes manually in a mobile-sized viewport (the game targets phones; `#app` is max-width 540px).
- `game.js` exposes a debug API on `window.MackeGame` (`getState()`, `forceRoll(values)`) — use it for quick in-browser verification of game logic, and keep it working when touching roll/scoring code.
- `index.html` has a `window.onerror` handler that replaces the body with an error message — if you see that screen during development, check the console for the actual line number.

## Conventions

- Cache busting: `index.html` references `style.css?v=N` and `game.js?v=N`. **Bump `N` in both URLs whenever you change CSS or JS**, otherwise mobile browsers serve stale assets.
- Game constants (`WIN_SCORE`, `DICE_COUNT`) are at the top of `game.js`.
- All user-facing strings are German; keep it that way.
- DOM references use `$` prefix variables; mutations go through small helper functions (`renderDice`, `updateScoreboard`, `updateStats`, `setControls`) — call these after state changes rather than touching the DOM ad hoc.
- Dice are real CSS-3D cubes: orientation via `show-N` classes on `.die`, selection/frozen transforms on `.die-wrapper` (never put transforms on `.die` itself, it breaks the face rotations).
- Player names are rendered via `escapeHtml()` — use it for any new user-controlled output.
- Commit style: short German conventional commits, e.g. `feat: kompaktes Scoreboard für viele Spieler`.

## Game rules implemented (for reference)

- 1 = 100 pts, 5 = 50 pts; three-of-a-kind: 3×1 = 1000, otherwise face × 100.
- Bust ("Macke") = turn scores 0; rolling all 6 dice scoring grants a fresh set of 6.
- Win at ≥ 10,000 points.
