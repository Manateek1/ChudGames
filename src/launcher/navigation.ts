import { useSyncExternalStore } from "react";
import { gameMap } from "../games/registry";

export const pages = { home: "Home", games: "All Games", map: "Map", about: "About" } as const;
export type Page = keyof typeof pages;

function subscribe(notify: () => void) {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
}

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  const [section, id, action] = hash.replace(/^#\/?/, "").split("/");
  const page: Page = Object.hasOwn(pages, section) ? section as Page : "home";
  const game = id ? gameMap.get(id) : undefined;
  const playing = Boolean(game && game.isAvailable !== false && action === "play");
  return { page, game, playing };
}

export function gameUrl(page: Page, gameId: string) {
  return `#/${page}/${gameId}`;
}
