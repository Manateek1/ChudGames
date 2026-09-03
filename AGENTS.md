# ChudGames engineering context

- Stack: React 19 with TypeScript, built by Vite 7.
- Styling: Tailwind CSS 3 plus targeted component/game CSS.
- 3D games: Three.js with `@types/three`; keep game loops and scene cleanup inside React effects.
- Shared game interfaces live in `src/types/arcade.ts`; register games in `src/games/registry.ts`.
- Shared engine helpers for input, audio, canvas, FPS, math, and persistence live in `src/engine/`.
- Validate changes with `npm run build`; use `npm run test` when modifying logic that has tests.
- Preserve the existing component, input, accessibility, and responsive conventions when extending a game.
