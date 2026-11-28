import { MagnifyingGlass } from "@phosphor-icons/react";
import { categories, type Category, type SortOrder } from "../launcher/catalog";
import type { GameDefinition } from "../types/arcade";
import { GameShelf } from "./GameShelf";

interface LibraryProps {
  games: GameDefinition[];
  search: string;
  setSearch: (value: string) => void;
  category: Category;
  setCategory: (value: Category) => void;
  order: SortOrder;
  setOrder: (value: SortOrder) => void;
  reducedMotion: boolean;
}

export function GameLibrary({ games, search, setSearch, category, setCategory, order, setOrder, reducedMotion }: LibraryProps) {
  return <section className="catalog">
    <div className="section-line catalog-title">
      <h1>All games</h1>
      <label className="search-field"><MagnifyingGlass aria-hidden />
        <input type="search" aria-label="Search games" placeholder="Search games" value={search}
          onChange={event => setSearch(event.target.value)} />
      </label>
    </div>
    <div className="catalog-controls">
      <div className="category-list" role="group" aria-label="Game type">
        {categories.map(item => <button type="button" key={item} aria-pressed={category === item}
          onClick={() => setCategory(item)}>{item}</button>)}
      </div>
      <label className="sort-field">Sort
        <select value={order} onChange={event => setOrder(event.target.value as SortOrder)}>
          <option value="featured">Featured order</option><option value="title">A–Z</option>
        </select>
      </label>
    </div>
    {games.length ? <GameShelf games={games} origin="games" reducedMotion={reducedMotion} /> :
      <div className="empty-shelf"><h2>No matching games</h2><button className="orange-button" onClick={() => {
        setSearch(""); setCategory("All");
      }}>Clear filters</button></div>}
  </section>;
}
