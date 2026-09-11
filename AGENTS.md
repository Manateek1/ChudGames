# ChudGames agent guide

This file is the repository map and working agreement for coding agents. Use it to orient yourself quickly, then verify behavior in the source and tests before making assumptions.

## Project identity

ChudGames is a React 19 + TypeScript arcade launcher built with Vite 7. The main browser application currently registers eleven games, including the Three.js-based FortLite and Apex Run experiences.

The main entry path is:

```text
index.html -> src/main.tsx -> src/App.tsx -> game registry -> GamePlayer -> game component
```

The root-level legacy HTML files (`2048.html`, `asteroids.html`, `breakout.html`, and the other simple arcade pages) are standalone inline prototypes. They are not imported by the React/Vite launcher; do not confuse them with the production game components under `src/games/`.

## Commands and environments

Run these from the repository root:

| Command | Purpose |
| --- | --- |
| `npm install` | Install the locked project dependencies. |
| `npm run dev` | Start the Vite development server, normally at `http://localhost:5173`. |
| `npm run build` | Run TypeScript project builds and create the Vite production bundle. |
| `npm run lint` | Run ESLint across the repository. |
| `npm run test` | Run the Vitest suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run preview` | Serve the production bundle locally. |
| `npm run server` | Start the FortLite HTTP/WebSocket server, normally on port `8080`. |

The frontend and FortLite multiplayer server are separate processes in deployment. The server accepts `PORT`; the client can use `VITE_FORTLITE_SERVER_URL` when the WebSocket server is not at its local default. See `DEPLOYMENT.md` for the operational setup.

## Repository map

| Path | Responsibility |
| --- | --- |
| `index.html` | Vite HTML entry point. |
| `src/main.tsx` | Mounts the React application. |
| `src/App.tsx` | Owns launcher screens, navigation, settings, progress, achievements, and game launch. |
| `src/components/` | Shared launcher and game-shell UI, especially `GamePlayer.tsx`. |
| `src/types/arcade.ts` | Shared game definitions, component props, settings, results, genres, and thumbnail types. |
| `src/games/registry.ts` | Central game registry and lookup map. Add a launcher-visible game here. |
| `src/games/*.tsx` | Game adapters/components that satisfy the shared game interface. |
| `src/games/*.css` | Targeted game and HUD styles. |
| `src/games/apex/` | Modular Apex Run runtime and its Three.js systems. |
| `src/games/fortlite.tsx` | FortLite React adapter, lobby, network setup, runtime mount, and cleanup. |
| `src/games/fortlite.css` | FortLite lobby, canvas, HUD, and responsive styling. |
| `src/games/fortliteRuntime/` | FortLite simulation, rendering, effects, performance, networking, and tests. |
| `src/engine/` | Shared input, audio, canvas, FPS, math, persistence, and other engine helpers. |
| `server/` | FortLite authoritative HTTP/WebSocket server and server-side tests. |
| `public/` | Static assets copied or served by Vite. |
| `README.md` | User-facing project overview and short developer guide. |
| `DEPLOYMENT.md` | Frontend/server deployment and multiplayer operations. |
| `FortLite-5-Stage-Rebuild-Roadmap.md` | FortLite planning and historical rebuild context. |
| `vite.config.ts` | React plugin, Vitest environment, and test include configuration. |
| `tsconfig*.json` | Strict TypeScript configuration for app and Node/Vite code. |
| `dist/`, `output/`, `tmp/` | Generated or temporary output; do not edit as source. |

## Application flow

`App.tsx` controls the launcher state (`home`, `library`, `detail`, and `play`), loads and persists settings/progress, resolves a game from the registry, and passes the selected definition into `GamePlayer`.

`GamePlayer.tsx` provides the common play shell. It creates the shared `InputManager` and `AudioManager`, handles tutorial/pause/restart/quit behavior, settings such as music and effects volume, FPS reporting, and common game callbacks. Most games render inside this shell. Apex Run has a specialized cinematic shell, so check its existing flow before changing shared behavior that could affect it.

Games communicate with the launcher through `GameComponentProps` in `src/types/arcade.ts`. Preserve the existing callback contract (`onScore`, `onFps`, and `onGameOver` where applicable) when adding or refactoring a game.

## FortLite architecture

FortLite is split into a React adapter and a runtime rather than putting the simulation directly in JSX:

- `src/games/fortlite.tsx` owns the lobby, solo/duos setup, player names and room code, network-client construction, runtime mounting, and React lifecycle cleanup.
- `src/games/fortliteRuntime/game.ts` is the runtime orchestrator. It owns the Three.js scene, fixed-step simulation, render interpolation, actors, input, match state, HUD hooks, and disposal. The simulation runs at a fixed 30 Hz step while rendering interpolates between states.
- `src/games/fortliteRuntime/content.ts` is the gameplay tuning source for match limits, the 50-player configuration, map/storm values, and weapons.
- `src/games/fortliteRuntime/constants.ts` contains physics, camera, and rendering constants.
- `src/games/fortliteRuntime/types.ts` and `runtimeTypes.ts` define combat/domain and runtime state contracts.
- `bots.ts`, `pathfinding.ts`, and `collisionGrid.ts` cover bot behavior, navigation, and broad-phase collision lookup.
- `performance.ts` owns quality profiles, adaptive resolution, and bot scheduling budgets. Keep expensive work out of hot loops and preserve the lower-quality path for weaker hardware.
- `terrain.ts`, `locations.ts`, and `atmosphere.ts` build world geometry, locations/obstacles, sky, fog, materials, and lights.
- `effects.ts`, `combat.ts`, `controls.ts`, `math.ts`, and `ui.ts` provide focused runtime helpers for effects, combat feedback, input/physics math, and HUD behavior.
- `src/games/fortliteRuntime/multiplayer/` contains the client, protocol handling, prediction, interpolation, and network callbacks.
- `src/games/fortliteRuntime/__tests__/` contains runtime tests for controls, combat, performance, release polish, terrain, and collision indexing.

Important FortLite invariants:

- `MAX_MATCH_PARTICIPANTS` is the match cap and must remain aligned between client content and server validation; the requested target is 50 players.
- Keep the fixed-step accumulator and render interpolation stable. Do not move simulation work into an unbounded render callback without measuring it.
- Reuse the collision spatial index for movement/landing queries and rebuild it when obstacle data changes; avoid scanning every obstacle for every actor.
- Respect performance quality profiles, bot budgets, effect budgets, and adaptive resolution before adding visual work.
- Every animation frame, event listener, timer, Three.js object, network subscription, and HUD resource created by a runtime must be released by `dispose()` or the owning React effect cleanup.
- Avoid per-frame allocations and repeated DOM layout reads in gameplay or HUD hot paths.

## FortLite server and multiplayer

`server/index.ts` exposes health/HTTP handling and the WebSocket upgrade. `server/roomManager.ts` creates and cleans rooms. `server/matchRoom.ts` is authoritative for match state, client input, firing/building, and snapshots; its normal cadence is a 20 Hz simulation tick, 10 Hz snapshots, and 10 Hz bot thinking. The server enforces the participant cap and has a reconnect grace period. Shared wire contracts live in `server/protocol.ts` and `server/types.ts`.

When changing multiplayer behavior, check both the client runtime and server protocol/types. Validate the server health endpoint and relevant server tests in addition to the browser build.

## Shared conventions

- Keep strict TypeScript types accurate; prefer existing domain types over `any` or duplicated interfaces.
- Keep Three.js loops, event listeners, timers, and scene/resource cleanup inside the owning React effect or runtime lifecycle.
- Reuse shared helpers from `src/engine/` for input, audio, canvas sizing, FPS, math, and persistence rather than creating parallel implementations.
- Preserve the existing Tailwind/component CSS conventions, accessibility behavior, responsive layouts, settings, and reduced-motion handling.
- Keep UI text and HUD regions separated so labels, mini-bars, prompts, and controls cannot overlap at supported viewport sizes.
- Do not edit `node_modules/`, generated `dist/` output, temporary `tmp/` files, or derived `output/` artifacts as a source-of-truth fix.

## Adding or changing a game

1. Implement or update a component that follows `GameComponentProps`.
2. Add/update its `GameDefinition` entry and lookup in `src/games/registry.ts`.
3. Add the thumbnail, tutorial/input description, category, and metadata needed by the launcher.
4. Use the shared `GamePlayer` shell and engine helpers unless the game has a documented specialized flow.
5. Keep game-specific styles and runtime systems in focused files; avoid growing a single component into a new monolith.
6. Add or update focused tests for changed logic, then run the validation checklist below.

## Validation checklist

Before handing off a change:

- Run `npm run lint` for source/style changes.
- Run `npm run test` when changing logic covered by Vitest, especially FortLite runtime or server behavior.
- Run `npm run build` for every implementation change or whenever TypeScript/build configuration may be affected.
- Run `git diff --check` and inspect the final diff for unrelated edits.
- For frontend behavior, exercise the local flow from the launcher into the affected game and check the browser console, responsive layout, overlays, input capture/release, pause/restart/quit, and cleanup.
- For FortLite server changes, start `npm run server`, check `/health`, and test the affected room/protocol path.

## Documentation sources of truth

- `AGENTS.md`: agent-facing repository map, invariants, conventions, and validation workflow.
- `README.md`: concise developer/user-facing project overview.
- `DEPLOYMENT.md`: deployment, environment variables, and multiplayer operations.
- `FortLite-5-Stage-Rebuild-Roadmap.md`: planning history and intended rebuild stages; confirm current code before treating it as authoritative behavior.
