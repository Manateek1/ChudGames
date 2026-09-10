import { GameThumbnail } from "./GameThumbnail";
import type { GameDefinition } from "../types/arcade";
import "./HomeScreen.css";

interface HomeScreenProps {
  games: GameDefinition[];
  reducedMotion: boolean;
  onBrowse: () => void;
  onOpen: (gameId: string) => void;
}

const Arrow = (): React.JSX.Element => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M4 12h15M14 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const HomeScreen = ({ games, reducedMotion, onBrowse, onOpen }: HomeScreenProps): React.JSX.Element => {
  const homeGames = games.filter((game) => game.id !== "fortlite").slice(0, 4);

  return (
    <div className="chud-home">
      <header className="chud-home__header">
        <button type="button" className="chud-home__wordmark" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          chudgames
        </button>
        <nav aria-label="Main navigation" className="chud-home__nav">
          <button type="button" onClick={onBrowse}>Games</button>
          <a href="#about">About</a>
        </nav>
        <button type="button" className="chud-home__browse chud-home__browse--top" onClick={onBrowse}>Browse games</button>
      </header>

      <div>
        <section className="chud-home__hero" aria-labelledby="home-title">
          <div className="chud-home__hero-copy">
            <h1 id="home-title">good games.<br />no nonsense.</h1>
            <p>A small collection of browser games with quick starts, sharp controls, and no downloads.</p>
            <div className="chud-home__hero-actions">
              <button type="button" className="chud-home__play" onClick={onBrowse}>Play something</button>
              <button type="button" className="chud-home__collection-link" onClick={onBrowse}>See the collection <Arrow /></button>
            </div>
          </div>
          <div className="chud-home__hero-image" aria-label="A mountain road at night from Apex Run" role="img" />
        </section>

        <section id="about" className="chud-home__about" aria-labelledby="about-title">
          <h2 id="about-title">Built for the browser.</h2>
          <p>Pick a game, start playing, and get into it. No downloads, no accounts, no waiting around.</p>
        </section>

        <section className="chud-home__games" aria-labelledby="games-title">
          <div className="chud-home__games-heading">
            <h2 id="games-title">Start here.</h2>
            <button type="button" onClick={onBrowse}>All games <Arrow /></button>
          </div>
          <div className="chud-home__game-list">
            {homeGames.map((game) => (
              <button type="button" className="chud-home__game-row" key={game.id} onClick={() => onOpen(game.id)}>
                <span className="chud-home__game-thumb"><GameThumbnail renderer={game.thumbnail} reducedMotion={reducedMotion} /></span>
                <span className="chud-home__game-meta"><strong>{game.title}</strong><small>{game.shortDescription}</small></span>
                <span className="chud-home__arrow"><Arrow /></span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <footer className="chud-home__footer">
        <span>chudgames</span>
        <div><button type="button" onClick={onBrowse}>Games</button><a href="#about">About</a></div>
      </footer>
    </div>
  );
};
