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
const defaultGameId = gameMap.get("fortlite")?.id ?? gameRegistry[0].id;

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
          return -1;
        }
        if (b.id === "fortlite") {
          return 1;
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
    <header className="mb-6 rounded-[1.6rem] border border-sky-200/35 bg-[rgba(7,18,34,0.74)] px-4 py-3 text-slate-50 shadow-[0_26px_60px_-34px_rgba(11,33,64,0.8)] backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setScreen("home")}
          className="font-display text-2xl tracking-[0.16em] text-white"
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
      <div className="mt-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.24em] text-sky-100/70">
        <span>{daily.dateKey}</span>
        <span>Featured: FortLite</span>
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
        <div className="fixed bottom-4 right-4 z-50 rounded-2xl border border-amber-200/40 bg-[rgba(7,18,34,0.92)] px-4 py-3 text-sm text-slate-50 shadow-[0_22px_44px_-22px_rgba(4,12,24,0.85)]">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
