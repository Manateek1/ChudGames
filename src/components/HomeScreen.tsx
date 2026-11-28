import { ArrowRight, SteeringWheel } from "@phosphor-icons/react";
import { featuredIds } from "../launcher/catalog";
import { gameMap } from "../games/registry";
import { GameShelf } from "./GameShelf";

export function HomeScreen({ reducedMotion }: { reducedMotion: boolean }) {
  const featured = featuredIds.flatMap(id => gameMap.get(id) ?? []);
  return <div className="arcade-wrap home-page">
    <div className="section-line"><h1>Featured games</h1><a href="#/games">All games <ArrowRight /></a></div>
    <GameShelf games={featured} origin="home" reducedMotion={reducedMotion} />
    <a className="island-invite" href="#/map">
      <img src="/island/island.webp" alt="" />
      <div className="island-invite-copy">
        <SteeringWheel aria-hidden />
        <h2>Drive the island</h2>
        <p>Take the Polestar 5 to your next game.</p>
      </div>
      <ArrowRight className="invite-arrow" aria-hidden />
    </a>
  </div>;
}
