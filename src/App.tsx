import { useEffect, useMemo, useState } from "react";
import { AchievementPanel } from "./components/AchievementPanel";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { GameDetail } from "./components/GameDetail";
import { GameLibrary } from "./components/GameLibrary";
import { GamePlayer } from "./components/GamePlayer";
import { HomeScreen } from "./components/HomeScreen";
import { PageTransition } from "./components/PageTransition";
import { SettingsModal } from "./components/SettingsModal";
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

function App(): React.JSX.Element {
  const [settings, setSettings] = useState(loadSettings);
  const [progress, setProgress] = useState(loadProgress);
  const [screen, setScreen] = useState<Screen>("home");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<GameGenre | "all">("all");
  const [selectedGameId, setSelectedGameId] = useState(gameRegistry[0].id);
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
  const dailyGame = gameMap.get(daily.gameId);

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
    return gameRegistry.filter((game) => {
      const genreMatch = filter === "all" ? true : game.genre === filter;
      const searchMatch =
        query.length === 0 ||
        game.title.toLowerCase().includes(query) ||
        game.description.toLowerCase().includes(query) ||
        game.tags.some((tag) => tag.includes(query));
      return genreMatch && searchMatch;
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
    setRunSeed(randomSeed());
    setDailyRun(false);
    setScreen("play");
  };

  const startDaily = (): void => {
    setSelectedGameId(daily.gameId);
    const targetGame = gameMap.get(daily.gameId) ?? gameRegistry[0];
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
        setToast(`Achievement unlocked: ${unlocked.length}`);
      }

      return next;
    });
  };

  const dismissTutorial = (): void => {
    setProgress((prev) => markTutorialSeen(prev, selectedGame.id));
  };

  const sharedHeader = (
    <header className="mb-6 rounded-2xl border border-sky-300/55 bg-white/78 px-4 py-3 shadow-[0_22px_50px_-30px_rgba(42,157,208,0.45)] backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setScreen("home")}
          className="font-display text-2xl tracking-wide text-sky-950"
        >
          ChudGames
        </button>

        <nav className="flex flex-wrap items-center gap-2 text-sm">
          <button type="button" className="arcade-btn-secondary" onClick={() => setScreen("home")}>Home</button>
          <button type="button" className="arcade-btn-secondary" onClick={() => setScreen("library")}>Library</button>
          <button type="button" className="arcade-btn-secondary" onClick={startDaily}>Daily</button>
          <button type="button" className="arcade-btn-secondary" onClick={() => setShowSettings(true)}>Settings</button>
        </nav>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-sky-700/80">
        <span>{daily.dateKey}</span>
        <span>Daily: {dailyGame?.title ?? "..."}</span>
        <span>Achievements: {progress.achievements.length}</span>
      </div>
    </header>
  );

  return (
    <div className="min-h-screen text-sky-950">
      <AnimatedBackground settings={settings} />
      <main className="relative mx-auto w-full max-w-[1260px] px-4 pb-16 pt-6 md:px-8">
        {sharedHeader}

        {screen === "home" && (
          <PageTransition reducedMotion={settings.reducedMotion}>
            <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
              <HomeScreen onPlay={() => setScreen("library")} onDaily={startDaily} daily={daily} dailyGame={dailyGame} progress={progress} />
              <AchievementPanel unlocked={progress.achievements} />
            </div>
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
                dailyGameId={daily.gameId}
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
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-lime-300/75 bg-white/90 px-4 py-3 text-sm text-sky-950 shadow-[0_20px_40px_-20px_rgba(122,213,76,0.45)]">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
