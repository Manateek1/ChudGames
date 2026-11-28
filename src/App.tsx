import { useCallback, useEffect, useRef, useState } from "react";
import { AchievementPanel } from "./components/AchievementPanel";
import { GearSix, ArrowRight } from "@phosphor-icons/react";
import { IslandMap } from "./components/IslandMap";
import { pages, useRoute, gameUrl } from "./launcher/navigation";
import { selectGames, type Category, type SortOrder } from "./launcher/catalog";
import { spawnCar, type Car } from "./launcher/islandRoads";
import { GameDetail } from "./components/GameDetail";
import { GameLibrary } from "./components/GameLibrary";
import { GamePlayer } from "./components/GamePlayer";
import { HomeScreen } from "./components/HomeScreen";
import { PageTransition } from "./components/PageTransition";
import { SettingsModal } from "./components/SettingsModal";
import "./components/ArcadeShell.css";
import "./components/Launcher.css";
import { evaluateAchievements } from "./engine/achievements";
import {
  getBestScore,
  loadProgress,
  loadSettings,
  markTutorialSeen,
  saveProgress,
  saveSettings,
  withGameResult,
  withUnlockedAchievements,
} from "./engine/storage";
import { gameMap, gameRegistry } from "./games/registry";
import type { Difficulty } from "./types/arcade";



const randomSeed = (): number => Math.floor(Math.random() * 2_000_000_000);
const preferredDifficulty = (difficulties: Difficulty[]): Difficulty =>
  difficulties.includes("normal") ? "normal" : difficulties[0];
const defaultModeForGame = (game: (typeof gameRegistry)[number]): string =>
  game.defaultMode ?? game.modes?.[0]?.id ?? "single";
const defaultGameId = gameMap.get("apex-run")?.id ?? gameRegistry[0].id;

function App(): React.JSX.Element {
  const [settings, setSettings] = useState(loadSettings);
  const [progress, setProgress] = useState(loadProgress);
  const route = useRoute();
  const screen = route.game ? (route.playing ? "play" : "detail") : route.page;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("All");
  const [order, setOrder] = useState<SortOrder>("featured");
  const [preferredLevel, setDifficulty] = useState<Difficulty>("normal");
  const [preferredMode, setMode] = useState("single");
  const carMemory = useRef(spawnCar());
  const readCar = useCallback(() => ({ ...carMemory.current }), []);
  const parkCar = useCallback((car: Car) => { carMemory.current = { ...car, speed: 0 }; }, []);
  const [showSettings, setShowSettings] = useState(false);
  const [runSeed, setRunSeed] = useState(randomSeed);
  const [toast, setToast] = useState<string | null>(null);

  const selectedGame = route.game ?? gameMap.get(defaultGameId)!;
  const difficulty = selectedGame.difficulties.includes(preferredLevel) ? preferredLevel : preferredDifficulty(selectedGame.difficulties);
  const mode = selectedGame.modes?.some(item => item.id === preferredMode) ? preferredMode : defaultModeForGame(selectedGame);
  const backLabel = `Back to ${pages[route.page]}`;
  const goBack = () => { window.location.hash = `#/${route.page}`; };
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${route.game?.title ?? pages[route.page]} | ChudGames`;
  }, [screen, route.page, route.game]);
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.classList.toggle("reduced-motion", settings.reducedMotion);
  }, [settings.theme, settings.reducedMotion]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const bestScore = selectedGame.id === "fortlite"
    ? (progress.stats[selectedGame.id]?.wins ?? 0)
    : getBestScore(progress, selectedGame.id, difficulty);

  const startGame = (id: string): void => {
    const game = gameMap.get(id);
    if (!game) return;
    if (game.isAvailable === false) {
      setToast(`${game.title} is temporarily unavailable while Phase 1 is being stabilized.`);
      return;
    }

    setRunSeed(randomSeed());
    window.location.hash = gameUrl(route.page, id) + "/play";
  };

  const handleRunComplete = (result: { score: number; won?: boolean; stats?: Record<string, number> }): void => {
    setProgress((prev) => {
      const trackedScore = selectedGame.id === "fortlite" ? Number(Boolean(result.won)) : result.score;
      let next = withGameResult(prev, {
        gameId: selectedGame.id,
        difficulty,
        score: trackedScore,
        won: Boolean(result.won),
        combo: result.stats?.combo,
        tile: result.stats?.tile,
        run: result.stats?.run,
      });

      const unlocked = evaluateAchievements(next, selectedGame.id, mode, result);
      if (unlocked.length > 0) {
        next = withUnlockedAchievements(next, unlocked);
        setToast(
          result.won
            ? `+1 EBT Buck • Achievement unlocked: ${unlocked.length}`
            : `Achievement unlocked: ${unlocked.length}`,
        );
      } else if (result.won) {
        setToast("+1 EBT Buck");
      }

      return next;
    });
  };

  const dismissTutorial = (): void => {
    setProgress((prev) => markTutorialSeen(prev, selectedGame.id));
  };

  return (
    <div className="app-shell island-launcher">
      <header className="launcher-header">
        <div className="launcher-bar">
          <a className="launcher-brand" href="#/home" aria-label="ChudGames home">Chud<span>Games</span></a>
          <nav aria-label="Main navigation">
            {Object.entries(pages).map(([id, title]) =>
              <a key={id} href={`#/${id}`} aria-current={route.page === id ? "page" : undefined}>{title}</a>)}
          </nav>
          <button className="settings-trigger" aria-label="Settings" onClick={() => setShowSettings(true)}><GearSix size={22} /></button>
        </div>
      </header>
      <main className={route.game ? "relative mx-auto w-full max-w-[1260px] px-4 pb-16 pt-6 md:px-8" : "launcher-main"}>
        {screen === "home" && <HomeScreen reducedMotion={settings.reducedMotion} />}
        {screen === "games" && <div className="arcade-wrap">
          <GameLibrary games={selectGames(gameRegistry, search, category, order)} search={search} setSearch={setSearch}
            category={category} setCategory={setCategory} order={order} setOrder={setOrder} reducedMotion={settings.reducedMotion} />
          <details className="collection-achievements"><summary>Achievements</summary><AchievementPanel unlocked={progress.achievements} /></details>
        </div>}
        {screen === "map" && <IslandMap readCar={readCar} parkCar={parkCar} onLaunch={startGame} paused={showSettings} soundAllowed={settings.sound} />}
        {screen === "about" && <section className="arcade-wrap about-page">
          <div><h1>About ChudGames</h1>
            <p>ChudGames is a collection of games you can play in your browser.</p>
            <p>I made it to give the games I build a home and make it easy to jump into something fun.</p>
            <a className="orange-button" href="#/games">Browse games <ArrowRight /></a>
          </div>
          <img src="/island/island.webp" alt="The ChudGames island with its mountain circuit and harbor arcade" />
        </section>}
        {screen === "detail" && (
          <PageTransition reducedMotion={settings.reducedMotion}>
            <GameDetail
              game={selectedGame}
              difficulty={difficulty}
              mode={mode}
              bestScore={bestScore}
              ebtBucks={progress.ebtBucks}
              reducedMotion={settings.reducedMotion}
              onDifficultyChange={setDifficulty}
              onModeChange={setMode}
              onStart={() => startGame(selectedGame.id)}
              onBack={goBack}
              backLabel={backLabel}
            />
          </PageTransition>
        )}

        {screen === "play" && (
          <PageTransition reducedMotion={settings.reducedMotion}>
            <GamePlayer
              key={selectedGame.id}
              game={selectedGame}
              difficulty={difficulty}
              mode={mode}
              seed={runSeed}
              settings={settings}
              bestScore={bestScore}
              tutorialOpenByDefault={!progress.tutorialsSeen[selectedGame.id]}
              onSettingsChange={setSettings}
              onTutorialDismiss={dismissTutorial}
              onQuit={goBack}
              backLabel={backLabel}
              onComplete={handleRunComplete}
            />
          </PageTransition>
        )}
      </main>

      <SettingsModal open={showSettings} settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />

      {toast && (
        <div className="toast fixed bottom-4 right-4 z-50 rounded-2xl border border-amber-200/40 bg-[rgba(7,18,34,0.92)] px-4 py-3 text-sm text-slate-50 shadow-[0_22px_44px_-22px_rgba(4,12,24,0.85)]">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
