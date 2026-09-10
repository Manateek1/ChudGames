import { useEffect, useMemo, useState } from "react";
import { AchievementPanel } from "./components/AchievementPanel";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { GameDetail } from "./components/GameDetail";
import { GameLibrary } from "./components/GameLibrary";
import { GamePlayer } from "./components/GamePlayer";
import { HomeScreen } from "./components/HomeScreen";
import { PageTransition } from "./components/PageTransition";
import { SettingsModal } from "./components/SettingsModal";
import "./components/ArcadeShell.css";
import { evaluateAchievements } from "./engine/achievements";
import { pickDailyChallenge } from "./engine/daily";
import {
  getBestScore,
  loadProgress,
  loadSettings,
  markTutorialSeen,
  saveProgress,
  saveSettings,
  withDailyBest,
  withGameResult,
  withUnlockedAchievements,
} from "./engine/storage";
import { gameMap, gameRegistry } from "./games/registry";
import type { Difficulty, GameGenre } from "./types/arcade";

type Screen = "home" | "library" | "detail" | "play";

const randomSeed = (): number => Math.floor(Math.random() * 2_000_000_000);
const preferredDifficulty = (difficulties: Difficulty[]): Difficulty =>
  difficulties.includes("normal") ? "normal" : difficulties[0];
const defaultModeForGame = (game: (typeof gameRegistry)[number]): string =>
  game.defaultMode ?? game.modes?.[0]?.id ?? "single";
const defaultGameId = gameMap.get("apex-run")?.id ?? gameRegistry[0].id;

function App(): React.JSX.Element {
  const [settings, setSettings] = useState(loadSettings);
  const [progress, setProgress] = useState(loadProgress);
  const [screen, setScreen] = useState<Screen>("home");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<GameGenre | "all">("all");
  const [selectedGameId, setSelectedGameId] = useState(defaultGameId);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [mode, setMode] = useState("single");
  const [showSettings, setShowSettings] = useState(false);
  const [runSeed, setRunSeed] = useState(randomSeed);
  const [dailyRun, setDailyRun] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const selectedGame = gameMap.get(selectedGameId) ?? gameRegistry[0];

  const daily = useMemo(
    () => pickDailyChallenge(gameRegistry.map((game) => game.id)),
    [],
  );
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

  const filteredGames = useMemo(() => {
    const query = search.toLowerCase().trim();
    return gameRegistry
      .filter((game) => {
        const genreMatch = filter === "all" ? true : game.genre === filter;
        const searchMatch =
          query.length === 0 ||
          game.title.toLowerCase().includes(query) ||
          game.description.toLowerCase().includes(query) ||
          game.tags.some((tag) => tag.includes(query));
        return genreMatch && searchMatch;
      })
      .sort((a, b) => {
        if (a.id === "fortlite") {
          return 1;
        }
        if (b.id === "fortlite") {
          return -1;
        }
        return a.title.localeCompare(b.title);
      });
  }, [search, filter]);

  const bestScore = selectedGame.id === "fortlite"
    ? (progress.stats[selectedGame.id]?.wins ?? 0)
    : getBestScore(progress, selectedGame.id, difficulty);

  const openGame = (gameId: string): void => {
    const targetGame = gameMap.get(gameId) ?? gameRegistry[0];
    setSelectedGameId(targetGame.id);
    setDifficulty((current) =>
      targetGame.difficulties.includes(current) ? current : preferredDifficulty(targetGame.difficulties),
    );
    setMode((current) =>
      targetGame.modes?.some((item) => item.id === current) ? current : defaultModeForGame(targetGame),
    );
    setScreen("detail");
    setDailyRun(false);
  };

  const startFromDetail = (): void => {
    if (selectedGame.isAvailable === false) {
      setToast(`${selectedGame.title} is temporarily unavailable while Phase 1 is being stabilized.`);
      return;
    }

    setRunSeed(randomSeed());
    setDailyRun(false);
    setScreen("play");
  };

  const startDaily = (): void => {
    setSelectedGameId(daily.gameId);
    const targetGame = gameMap.get(daily.gameId) ?? gameRegistry[0];
    if (targetGame.isAvailable === false) {
      setToast(`${targetGame.title} is temporarily unavailable while Phase 1 is being stabilized.`);
      setScreen("detail");
      return;
    }

    setDifficulty(preferredDifficulty(targetGame.difficulties));
    setMode(defaultModeForGame(targetGame));
    setRunSeed(daily.seed);
    setDailyRun(true);
    setScreen("play");
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

      if (dailyRun) {
        next = withDailyBest(next, daily.dateKey, selectedGame.id, trackedScore);
      }

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

  const sharedHeader = (
    <header className="site-header">
      <div>
        <button
          type="button"
          onClick={() => setScreen("home")}
          className="font-display text-2xl tracking-[0.16em] text-white"
        >
          chudgames
        </button>

        <nav>
          <button type="button" className="arcade-btn-secondary" onClick={() => setScreen("home")}>Home</button>
          <button type="button" className="arcade-btn-secondary" onClick={() => setScreen("library")}>Games</button>
          <button type="button" className="arcade-btn-secondary" onClick={startDaily}>Daily</button>
          <button type="button" className="arcade-btn-secondary" onClick={() => setShowSettings(true)}>Settings</button>
        </nav>
      </div>
    </header>
  );

  return (
    <div className="app-shell">
      <AnimatedBackground settings={settings} />
      <main className={screen === "home" ? "relative w-full" : "relative mx-auto w-full max-w-[1260px] px-4 pb-16 pt-6 md:px-8"}>
        {screen !== "home" && sharedHeader}

        {screen === "home" && (
          <PageTransition reducedMotion={settings.reducedMotion}>
            <HomeScreen games={gameRegistry} reducedMotion={settings.reducedMotion} onBrowse={() => setScreen("library")} onOpen={openGame} />
          </PageTransition>
        )}

        {screen === "library" && (
          <PageTransition reducedMotion={settings.reducedMotion}>
            <div className="grid gap-6 xl:grid-cols-[1.25fr,0.75fr]">
              <GameLibrary
                games={filteredGames}
                search={search}
                setSearch={setSearch}
                filter={filter}
                setFilter={setFilter}
                onOpen={openGame}
                reducedMotion={settings.reducedMotion}
              />
              <AchievementPanel unlocked={progress.achievements} />
            </div>
          </PageTransition>
        )}

        {screen === "detail" && (
          <PageTransition reducedMotion={settings.reducedMotion}>
            <GameDetail
              game={selectedGame}
              difficulty={difficulty}
              mode={mode}
              bestScore={bestScore}
              ebtBucks={progress.ebtBucks}
              daily={daily.gameId === selectedGame.id}
              reducedMotion={settings.reducedMotion}
              onDifficultyChange={setDifficulty}
              onModeChange={setMode}
              onStart={startFromDetail}
              onBack={() => setScreen("library")}
            />
          </PageTransition>
        )}

        {screen === "play" && (
          <PageTransition reducedMotion={settings.reducedMotion}>
            <GamePlayer
              game={selectedGame}
              difficulty={difficulty}
              mode={mode}
              seed={runSeed}
              settings={settings}
              bestScore={bestScore}
              tutorialOpenByDefault={!progress.tutorialsSeen[selectedGame.id]}
              onSettingsChange={setSettings}
              onTutorialDismiss={dismissTutorial}
              onQuit={() => setScreen("library")}
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
