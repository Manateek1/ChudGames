# ChudGames

ChudGames is a React + Vite + TypeScript game launcher with a neon UI, shared game engine utilities, and 11 playable games including FortLite and Apex Run.

## Included Games

- Apex Run
- Neon Dodger
- Asteroids Pulse
- Brick Breaker Blitz
- FortLite
- Void Survival
- Rhythm Tap
- Precision Runner
- Fusion 2048
- Memory Match
- Pong Neon (Single Player + Two Player Duel)

## Core Architecture

- `src/games/registry.ts`: central game metadata + component registry.
- `src/engine/`: shared engine utilities.
  - `input.ts`: low-latency keyboard + virtual touch input manager.
  - `audio.ts`: WebAudio SFX + lightweight synth music.
  - `particles.ts`: quality-scaled particle bursts.
  - `fps.ts`: rolling-average FPS meter.
  - `math.ts`: deterministic random + collision helpers.
  - `storage.ts`: localStorage settings, high scores, progress.
  - `achievements.ts`: local achievement unlock rules.
- `src/components/GamePlayer.tsx`: shared in-game shell (tutorial, pause, restart, quit, FPS, mobile controls).

## How to Add a New Game

1. Create a game component in `src/games/` that accepts `GameComponentProps`.
2. Add metadata + thumbnail + controls/tutorial copy in `src/games/registry.ts`.
3. Use `onScore`, `onFps`, and `onGameOver` callbacks from `GameComponentProps`.
4. Use shared engine utilities (`InputManager`, `AudioManager`, `ParticleSystem`) instead of duplicating game loop services.
5. Verify it works inside the shared launcher shell and supports the input model it needs on desktop/mobile.

## Local Development

```bash
npm install
npm run dev
```

## Unit Tests

```bash
npm run test
```

## Production Build

```bash
npm run build
npm run preview
```

## Deploy on Vercel

1. Push this repository to GitHub.
2. Import the project in Vercel.
3. Framework preset: `Vite`.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Deploy.

No server runtime is required.

## Apex Run — Solstice Pass

A 2.64 km mountain time attack in an original procedural Solstice GT. Complete eight sectors in order, then chase a locally saved personal-best ghost. The race has its own menu, paint selector, settings, pause and results presentation within the shared launcher. No account or asset download is required.

- **Drive:** WASD / arrows, Space handbrake, C camera, R recovery (+3 seconds), Escape / P pause or resume. Standard gamepads use left stick, RT / LT, A handbrake, Y camera, X recovery and Menu pause. Touch controls appear on small screens.
- **Graphics:** Low, Medium, High and Ultra scale pixel density, shadows, vegetation and particles. Rendering is capped at 60 FPS and adapts resolution when sustained frame rate drops. F8 toggles render statistics; they are hidden by default. Fullscreen is available when the browser permits it.
- **Handling:** automatic six-speed drivetrain, gradual steering, friction-limited lateral forces, drag, road gradient, barrier impulses and a stability assist. Hard difficulty disables stability assist. This is an accessible simcade approximation, not a mechanical tire/suspension simulator.
- **Audio:** persistent Web Audio combustion harmonics, intake filter, gear cuts, tire slip, wind, road noise and impact layers. Audio begins after interaction and respects both game and launcher mute settings.
- **Persistence:** versioned settings and best runs are stored locally. Best times are separated by difficulty. Recovery returns to the last completed sector and adds three seconds. A completed lap awards the launcher a score of `max(100, round(1,000,000 / lapSeconds))`. Storage failure does not prevent racing.

### Runtime structure

`src/games/apexRun.tsx` owns React UI and lazily imports `apex/runtime.ts`. The runtime owns the requestAnimationFrame loop, camera, input polling, rendering and resource lifetime. Physics runs at 120 Hz with interpolated rendering and bounded catch-up after stalls; the HUD publishes at 10 Hz. Hidden pages and paused races do not advance simulation.

The `apex/` directory separates `physics`, `track`, `race`, `world`, `car`, `audio`, `effects` and `settings`. The route is an arc-length sampled closed spline with exact segment projection for driving and a coarser lookup for terrain generation. Ordered distance tracking rejects teleports and backwards start-line shortcuts.

All geometry and textures are generated locally. Rigid car parts are batched by material; wheels retain independent animation transforms. Foliage, guardrail posts, reflectors and skid marks are instanced. Particles use a fixed pool. A generated PMREM captures the environment on load and when changing reflection resolution; this is an approximation, not live reflections of every nearby object. The atmospheric sky uses Three.js's analytic Sky shader. No third-party car, track, photography or audio assets are included.

Geometry, materials, textures, shadow targets, audio nodes, observers and event listeners are released when the game unmounts. Context loss presents a restart flow. Automated logic tests cover road projection, acceleration/braking/reverse, gradual steering, containment, complete laps, recovery, best-run validation and input focus recovery. Run `npm run test`, `npm run lint` and `npm run build` before publishing changes.
