import { useEffect, useRef, useState } from "react";
import type { GameComponentProps } from "../types/arcade";
import { FortLiteGame } from "./fortliteRuntime/game";
import { FortLiteNetworkClient } from "./fortliteRuntime/multiplayer/client";
import type { LobbyPlayer, MatchStartingMessage } from "./fortliteRuntime/multiplayer/protocol";
import { MAX_MATCH_PARTICIPANTS } from "./fortliteRuntime/content";
import "./fortlite.css";

const FULLSCREEN_HINT_KEY = "fortlite_fullscreen_hint_hidden";
const SAVED_NAME_KEY = "fortlite_player_name";

type LobbyTab = "create" | "join";
type LobbyState = "menu" | "in_lobby" | "playing";

export const FortLite = ({
  seed,
  mode,
  settings,
  paused,
  audio,
  onScore,
  onFps,
  onGameOver,
  onPauseToggle,
}: GameComponentProps): React.JSX.Element => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<FortLiteGame | null>(null);
  const scoreRef = useRef(onScore);
  const fpsRef = useRef(onFps);
  const lastFpsReportAtRef = useRef(0);
  const fpsVisibleRef = useRef(settings.showFps);
  const graphicsQualityRef = useRef(settings.graphicsQuality);
  const gameOverRef = useRef(onGameOver);
  const pauseToggleRef = useRef(onPauseToggle);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreenHint, setShowFullscreenHint] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return window.localStorage.getItem(FULLSCREEN_HINT_KEY) !== "true";
  });
  const fullscreenSupported = typeof document !== "undefined" && document.fullscreenEnabled;

  // Multiplayer lobby state
  const [showLobbyModal, setShowLobbyModal] = useState(() => {
    if (typeof window === "undefined") return false;
    const urlParams = new URLSearchParams(window.location.search);
    return Boolean(urlParams.get("room") || (window.location.hash && window.location.hash.length >= 7));
  });

  const [activeTab, setActiveTab] = useState<LobbyTab>(() => {
    if (typeof window === "undefined") return "create";
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("room") || (window.location.hash && window.location.hash.length >= 7)) {
      return "join";
    }
    return "create";
  });

  const [playerName, setPlayerName] = useState(() => {
    if (typeof window === "undefined") return "Player";
    return window.localStorage.getItem(SAVED_NAME_KEY) || `Operator_${Math.floor(100 + Math.random() * 900)}`;
  });

  const [joinCode, setJoinCode] = useState(() => {
    if (typeof window === "undefined") return "";
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get("room");
    if (roomFromUrl) return roomFromUrl.toUpperCase();
    if (window.location.hash && window.location.hash.length >= 7) {
      return window.location.hash.slice(1, 7).toUpperCase();
    }
    return "";
  });

  const [lobbyState, setLobbyState] = useState<LobbyState>("menu");
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>([]);
  const [lobbyCountdown, setLobbyCountdown] = useState<number | null>(null);
  const [currentRoomCode, setCurrentRoomCode] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [matchData, setMatchData] = useState<MatchStartingMessage | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);
  const [hasConnectedClient, setHasConnectedClient] = useState(false);

  const clientRef = useRef<FortLiteNetworkClient | null>(null);

  useEffect(() => {
    scoreRef.current = onScore;
    fpsRef.current = onFps;
    gameOverRef.current = onGameOver;
    pauseToggleRef.current = onPauseToggle;
  }, [onScore, onFps, onGameOver, onPauseToggle]);

  useEffect(() => {
    fpsVisibleRef.current = settings.showFps;
    if (!settings.showFps) {
      onFps(0);
    }
  }, [settings.showFps, onFps]);

  useEffect(() => {
    graphicsQualityRef.current = settings.graphicsQuality;
  }, [settings.graphicsQuality]);

  useEffect(() => {
    const onFullscreenChange = (): void => {
      setIsFullscreen(document.fullscreenElement === viewportRef.current);
      window.dispatchEvent(new Event("resize"));
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    onFullscreenChange();

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!fullscreenSupported) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || event.code !== "KeyF") {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }

      event.preventDefault();

      void (async () => {
        try {
          if (document.fullscreenElement === viewport) {
            await document.exitFullscreen();
            return;
          }

          await viewport.requestFullscreen();
        } catch {
          setIsFullscreen(document.fullscreenElement === viewport);
        }
      })();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [fullscreenSupported]);

  useEffect(() => {
    if (!fullscreenSupported || !showFullscreenHint) {
      return;
    }

    const timer = window.setTimeout(() => {
      setShowFullscreenHint(false);
      window.localStorage.setItem(FULLSCREEN_HINT_KEY, "true");
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [fullscreenSupported, showFullscreenHint]);

  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
        setHasConnectedClient(false);
        setLocalPlayerId(null);
      }
    };
  }, []);

  // Initialize and mount FortLiteGame
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || showLobbyModal) {
      return;
    }

    const viewport = viewportRef.current;
    const isMultiplayer = Boolean(clientRef.current && lobbyState === "playing");

    const game = new FortLiteGame(mount, {
      seedBase: seed,
      matchSeed: matchData?.seed,
      dropStartPositions: matchData?.dropStartPositions,
      networkClient: isMultiplayer ? (clientRef.current ?? undefined) : undefined,
      localPlayerName: playerName,
      mode: mode === "duos" ? "duos" : "solo",
      graphicsQuality: graphicsQualityRef.current,
      audio,
      showEndScreen: false,
      onPauseToggle: () => pauseToggleRef.current(),
      onFpsChange: (fps) => {
        if (!fpsVisibleRef.current) {
          return;
        }

        const now = performance.now();
        if (now - lastFpsReportAtRef.current < 500) {
          return;
        }

        lastFpsReportAtRef.current = now;
        fpsRef.current(fps);
      },
      onPlacementChange: (placement) => {
        scoreRef.current(placement);
      },
      onMatchEnd: (result) => {
        const reportGameOver = (): void => {
          gameOverRef.current({
            score: result.won ? 1 : 0,
            won: result.won,
            stats: {
              placement: result.placement,
              eliminations: result.eliminations,
              run: result.survivalTime,
            },
          });
        };

        if (fullscreenSupported && document.fullscreenElement === viewport) {
          void document.exitFullscreen().finally(reportGameOver);
          return;
        }

        reportGameOver();
      },
    });

    gameRef.current = game;
    game.start();

    return () => {
      if (document.fullscreenElement === viewport) {
        void document.exitFullscreen();
      }
      game.dispose();
      gameRef.current = null;
    };
  }, [
    seed,
    mode,
    playerName,
    audio,
    showLobbyModal,
    lobbyState,
    matchData,
    fullscreenSupported,
  ]);

  useEffect(() => {
    gameRef.current?.setPaused(paused || showLobbyModal);
    if (paused || showLobbyModal) {
      onFps(0);
    }
  }, [paused, showLobbyModal, onFps]);

  useEffect(() => {
    gameRef.current?.setGraphicsQuality(settings.graphicsQuality);
  }, [settings.graphicsQuality]);

  const handlePointerLockRequest = (): void => {
    gameRef.current?.requestPointerLock();
  };

  const toggleFullscreen = async (): Promise<void> => {
    const viewport = viewportRef.current;
    if (!viewport || !fullscreenSupported) {
      return;
    }

    if (document.fullscreenElement === viewport) {
      await document.exitFullscreen();
      return;
    }

    await viewport.requestFullscreen();
    handlePointerLockRequest();
  };

  const dismissFullscreenHint = (): void => {
    setShowFullscreenHint(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FULLSCREEN_HINT_KEY, "true");
    }
  };

  const handleNameChange = (val: string): void => {
    setPlayerName(val);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SAVED_NAME_KEY, val);
    }
  };

  const initNetworkClient = (): FortLiteNetworkClient => {
    if (clientRef.current) {
      clientRef.current.disconnect();
    }

    const client = new FortLiteNetworkClient({
      onLobbyUpdate: (players, countdown) => {
        setLobbyPlayers(players);
        setLobbyCountdown(countdown);
        if (client.roomCode) {
          setCurrentRoomCode(client.roomCode);
        }
        if (client.playerId) {
          setLocalPlayerId(client.playerId);
        }
        setIsHost(client.isHost);
      },
      onMatchStarting: (data) => {
        setMatchData(data);
        setLobbyState("playing");
        setShowLobbyModal(false);
      },
      onError: (_code, message) => {
        setErrorMessage(message);
      },
      onStatusChange: (status) => {
        if (status === "disconnected" && lobbyState === "in_lobby") {
          setErrorMessage("Disconnected from server.");
        }
      },
    });

    clientRef.current = client;
    setHasConnectedClient(true);
    if (client.playerId) {
      setLocalPlayerId(client.playerId);
    }
    client.connect();
    return client;
  };

  const handleCreateRoom = (): void => {
    setErrorMessage(null);
    const client = initNetworkClient();
    client.createRoom(playerName.trim() || "Host", mode === "duos" ? "duos" : "solo");
    setLobbyState("in_lobby");
  };

  const handleJoinRoom = (): void => {
    setErrorMessage(null);
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      setErrorMessage("Room code must be 6 characters.");
      return;
    }

    const client = initNetworkClient();
    client.joinRoom(code, playerName.trim() || "Player");
    setCurrentRoomCode(code);
    setLobbyState("in_lobby");
  };

  const handleToggleReady = (): void => {
    if (!clientRef.current) return;
    const me = lobbyPlayers.find((p) => p.id === localPlayerId);
    const currentlyReady = me?.isReady ?? false;
    clientRef.current.toggleReady(!currentlyReady);
  };

  const handleStartMatch = (): void => {
    if (!clientRef.current) return;
    clientRef.current.startMatch();
  };

  const handleLeaveLobby = (): void => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    setHasConnectedClient(false);
    setLocalPlayerId(null);
    setLobbyState("menu");
    setCurrentRoomCode(null);
    setLobbyPlayers([]);
    setLobbyCountdown(null);
    setErrorMessage(null);
  };

  const handleCopyCode = (): void => {
    if (!currentRoomCode) return;
    void navigator.clipboard.writeText(currentRoomCode).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    });
  };

  const isLocalReady = Boolean(
    lobbyPlayers.find((p) => p.id === localPlayerId)?.isReady
  );

  return (
    <div ref={viewportRef} className="fortlite-viewport">
      {fullscreenSupported && showFullscreenHint && (
        <button
          type="button"
          className="fortlite-fullscreen-btn"
          onClick={() => {
            dismissFullscreenHint();
            void toggleFullscreen();
          }}
          aria-pressed={isFullscreen}
        >
          {isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
        </button>
      )}

      {/* Top action button to open multiplayer lobby when playing solo */}
      {!showLobbyModal && (
        <button
          type="button"
          className="fortlite-top-btn"
          onClick={() => setShowLobbyModal(true)}
        >
          {hasConnectedClient && lobbyState === "playing"
            ? `Room: ${currentRoomCode || "MP"}`
            : "Multiplayer Lobby"}
        </button>
      )}

      {/* Multiplayer Lobby Modal Overlay */}
      {showLobbyModal && (
        <div className="fortlite-lobby-overlay">
          <div className="fortlite-lobby-card">
            <div className="fortlite-lobby-title">
              <span>FORTLITE MULTIPLAYER</span>
              <button
                type="button"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: "20px",
                  lineHeight: "1",
                }}
                onClick={() => setShowLobbyModal(false)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="fortlite-lobby-subtitle">
              Join-code battle royale with synchronized combat, building, and bots. {MAX_MATCH_PARTICIPANTS}-player cap.
            </div>

            {lobbyState === "menu" ? (
              <>
                <div className="fortlite-input-group">
                  <label className="fortlite-input-label" htmlFor="fortlite-callsign">
                    YOUR CALL-SIGN
                  </label>
                  <input
                    id="fortlite-callsign"
                    type="text"
                    maxLength={16}
                    className="fortlite-input"
                    value={playerName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Enter your name"
                  />
                </div>

                <div className="fortlite-tabs">
                  <button
                    type="button"
                    className={`fortlite-tab ${activeTab === "create" ? "active" : ""}`}
                    onClick={() => {
                      setActiveTab("create");
                      setErrorMessage(null);
                    }}
                  >
                    Create Match
                  </button>
                  <button
                    type="button"
                    className={`fortlite-tab ${activeTab === "join" ? "active" : ""}`}
                    onClick={() => {
                      setActiveTab("join");
                      setErrorMessage(null);
                    }}
                  >
                    Join with Code
                  </button>
                </div>

                {activeTab === "create" ? (
                  <div>
                    <p style={{ fontSize: "14px", color: "#cbd5e1", marginBottom: "18px", lineHeight: "1.5" }}>
                      Host a dedicated authoritative match. A 6-character room code will be generated for friends to join.
                    </p>
                    <button
                      type="button"
                      className="fortlite-action-btn"
                      onClick={handleCreateRoom}
                    >
                      Create Match Room
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="fortlite-input-group">
                      <label className="fortlite-input-label" htmlFor="fortlite-room-code">
                        6-CHARACTER JOIN CODE
                      </label>
                      <input
                        id="fortlite-room-code"
                        type="text"
                        maxLength={6}
                        className="fortlite-input fortlite-input-code"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        placeholder="ABCXYZ"
                      />
                    </div>
                    <button
                      type="button"
                      className="fortlite-action-btn"
                      onClick={handleJoinRoom}
                      disabled={joinCode.trim().length !== 6}
                    >
                      Join Match Room
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  className="fortlite-action-btn secondary"
                  onClick={() => setShowLobbyModal(false)}
                >
                  Play Solo Practice (Offline)
                </button>
              </>
            ) : (
              <>
                {/* IN LOBBY VIEW */}
                <div className="fortlite-room-code-box">
                  <div className="fortlite-room-code-label">SHARE ROOM CODE</div>
                  <div className="fortlite-room-code-display">
                    {currentRoomCode || "..."}
                  </div>
                  <button
                    type="button"
                    className="fortlite-copy-btn"
                    onClick={handleCopyCode}
                  >
                    {copiedCode ? "Copied to Clipboard!" : "Copy Code"}
                  </button>
                </div>

                {lobbyCountdown !== null && (
                  <div className="fortlite-status-text">
                    Match starting in {lobbyCountdown}s...
                  </div>
                )}

                <div className="fortlite-input-label">
                  PLAYERS IN LOBBY ({lobbyPlayers.length}/{MAX_MATCH_PARTICIPANTS})
                </div>
                <div className="fortlite-player-list">
                  {lobbyPlayers.map((player) => (
                    <div key={player.id} className="fortlite-player-item">
                      <span className="fortlite-player-name">
                        {player.name}
                        {player.isHost && (
                          <span className="fortlite-lobby-badge">HOST</span>
                        )}
                        {player.id === localPlayerId && (
                          <span style={{ color: "#38bdf8", fontSize: "12px" }}> (You)</span>
                        )}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                          {player.ping ? `${player.ping}ms` : ""}
                        </span>
                        <span
                          className={`fortlite-ready-tag ${
                            player.isReady ? "ready" : "not-ready"
                          }`}
                        >
                          {player.isReady ? "Ready" : "Waiting"}
                        </span>
                      </div>
                    </div>
                  ))}
                  {lobbyPlayers.length === 0 && (
                    <div style={{ textAlign: "center", padding: "12px", color: "#64748b", fontSize: "13px" }}>
                      Connecting to lobby...
                    </div>
                  )}
                </div>

                {isHost ? (
                  <button
                    type="button"
                    className="fortlite-action-btn"
                    onClick={handleStartMatch}
                    disabled={lobbyCountdown !== null}
                  >
                    {lobbyCountdown !== null ? "Launching..." : "Start Match Now"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="fortlite-action-btn"
                    onClick={handleToggleReady}
                  >
                    {isLocalReady ? "Cancel Ready" : "Ready Up"}
                  </button>
                )}

                <button
                  type="button"
                  className="fortlite-action-btn secondary"
                  onClick={handleLeaveLobby}
                >
                  Leave Lobby
                </button>
              </>
            )}

            {errorMessage && (
              <div className="fortlite-error-text">
                {errorMessage}
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={mountRef} className="fortlite-mount" />
    </div>
  );
};

