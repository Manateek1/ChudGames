import type { GameDefinition } from "../types/arcade";

export const featuredIds = ["apex-run", "fortlite", "buildblox"];
export const categories = ["All", "Racing", "Building", "Action", "Arcade", "Puzzle"] as const;
export type Category = typeof categories[number];
export type SortOrder = "featured" | "title";

const covers: Record<string, string> = {
  "apex-run": "/island/apex-cover.webp",
  fortlite: "/island/fortlite-cover.webp",
  buildblox: "/island/buildblox-cover.webp",
};

export function coverFor(game: GameDefinition) {
  return covers[game.id] ?? game.thumbnail;
}

export function categoryFor(game: GameDefinition): Category {
  if (game.id === "apex-run") return "Racing";
  if (game.id === "buildblox") return "Building";
  if (game.genre === "puzzle") return "Puzzle";
  if (game.id === "fortlite" || game.id === "void-survival") return "Action";
  return "Arcade";
}

export function selectGames(games: GameDefinition[], search: string, category: Category, order: SortOrder) {
  const query = search.trim().toLowerCase();
  const matches = games.filter(game =>
    (category === "All" || categoryFor(game) === category) &&
    [game.title, game.description, ...game.tags].some(text => text.toLowerCase().includes(query))
  );
  if (order === "title") return matches.sort((a, b) => a.title.localeCompare(b.title));
  const rank = (id: string) => featuredIds.includes(id) ? featuredIds.indexOf(id) : featuredIds.length;
  return matches.sort((a, b) => rank(a.id) - rank(b.id));
}
