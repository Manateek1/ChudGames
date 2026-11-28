import { Play } from "@phosphor-icons/react";
import { categoryFor, coverFor } from "../launcher/catalog";
import { gameUrl, type Page } from "../launcher/navigation";
import type { GameDefinition } from "../types/arcade";
import { GameThumbnail } from "./GameThumbnail";

export function GameShelf({ games, origin, reducedMotion }: {
  games: GameDefinition[];
  origin: Page;
  reducedMotion: boolean;
}) {
  return <div className={`game-shelf game-shelf--${origin}`}>
    {games.map(game => (
      <article className="shelf-card" key={game.id}>
        <div className="shelf-art"><GameThumbnail renderer={coverFor(game)} reducedMotion={reducedMotion} /></div>
        <div className="shelf-meta">
          <span className="game-type">{categoryFor(game)}</span>
          <h2>{game.title}</h2>
          <p>{game.shortDescription}</p>
          {game.isAvailable === false ? <span>Temporarily unavailable</span> :
            <a className="shelf-play" href={gameUrl(origin, game.id)} aria-label={`Play ${game.title}`}>
              <Play weight="fill" aria-hidden /> Play
            </a>}
        </div>
      </article>
    ))}
  </div>;
}
