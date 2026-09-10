import type {
  ClientMessage,
  ServerMessage,
  LobbyPlayer,
  WorldSnapshotMessage,
  MatchStartingMessage,
  ShotBroadcastMessage,
  DamageEventMessage,
  EliminationEventMessage,
  BuildEventMessage,
  LootEventMessage,
  MatchEndedMessage
} from './protocol';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface NetworkClientCallbacks {
  onStatusChange?: (status: ConnectionStatus) => void;
  onLobbyUpdate?: (players: LobbyPlayer[], countdown: number | null) => void;
  onMatchStarting?: (data: MatchStartingMessage) => void;
  onWorldSnapshot?: (data: WorldSnapshotMessage) => void;
  onShotEvent?: (data: ShotBroadcastMessage) => void;
  onDamageEvent?: (data: DamageEventMessage) => void;
  onEliminationEvent?: (data: EliminationEventMessage) => void;
  onBuildEvent?: (data: BuildEventMessage) => void;
  onLootEvent?: (data: LootEventMessage) => void;
  onMatchEnded?: (data: MatchEndedMessage) => void;
  onPingUpdate?: (pingMs: number) => void;
  onError?: (code: string, message: string) => void;
}

export function getDefaultServerUrl(): string {
  // Vite env variable
  try {
    const envUrl = (import.meta as unknown as { env?: { VITE_FORTLITE_SERVER_URL?: string } })?.env?.VITE_FORTLITE_SERVER_URL;
    if (envUrl) {
      return envUrl;
    }
  } catch {
    // Ignore in non-vite environments
  }

  if (typeof window !== 'undefined') {
    const isHttps = window.location.protocol === 'https:';
    const proto = isHttps ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    // Default to port 8080 when testing locally
    if (host === 'localhost' || host === '127.0.0.1') {
      return `${proto}//${host}:8080`;
    }
    return `${proto}//${window.location.host}`;
  }

  return 'ws://localhost:8080';
}

export class FortLiteNetworkClient {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private callbacks: NetworkClientCallbacks;

  private status: ConnectionStatus = 'disconnected';
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingMs = 0;

  roomCode: string | null = null;
  playerId: string | null = null;
  reconnectToken: string | null = null;
  isHost = false;

  constructor(callbacks: NetworkClientCallbacks, serverUrl = getDefaultServerUrl()) {
    this.callbacks = callbacks;
    this.serverUrl = serverUrl;
  }

  setCallbacks(callbacks: Partial<NetworkClientCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setStatus('connecting');
    try {
      this.ws = new WebSocket(this.serverUrl);
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
    } catch {
      this.setStatus('disconnected');
      this.scheduleReconnect();
    }
  }

  private setStatus(newStatus: ConnectionStatus): void {
    this.status = newStatus;
    this.callbacks.onStatusChange?.(newStatus);
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  get currentPing(): number {
    return this.pingMs;
  }

  createRoom(playerName: string, mode: 'solo' | 'duos' = 'solo'): void {
    this.ensureConnected(() => {
      this.send({
        type: 'create_room',
        playerName,
        mode
      });
    });
  }

  joinRoom(roomCode: string, playerName: string): void {
    const code = roomCode.toUpperCase().trim();
    this.roomCode = code;

    // Check stored reconnect token
    let savedToken: string | undefined;
    if (typeof window !== 'undefined') {
      savedToken = window.sessionStorage.getItem(`fortlite_token_${code}`) ?? undefined;
    }

    this.ensureConnected(() => {
      this.send({
        type: 'join_room',
        roomCode: code,
        playerName,
        reconnectToken: savedToken
      });
    });
  }

  toggleReady(isReady: boolean): void {
    this.send({
      type: 'toggle_ready',
      isReady
    });
  }

  startMatch(): void {
    this.send({
      type: 'start_match'
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private ensureConnected(onReady: () => void): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      onReady();
    } else {
      this.connect();
      const checkTimer = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          clearInterval(checkTimer);
          onReady();
        }
      }, 50);
    }
  }

  private handleOpen(): void {
    this.setStatus('connected');
    this.startPingLoop();
  }

  private handleClose(): void {
    this.stopPingLoop();
    this.setStatus('disconnected');
    if (this.roomCode && this.reconnectToken) {
      this.setStatus('reconnecting');
      this.scheduleReconnect();
    }
  }

  private handleError(): void {
    this.stopPingLoop();
    this.setStatus('disconnected');
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.status !== 'connected' && this.roomCode) {
        this.connect();
      }
    }, 2500);
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.pingInterval = setInterval(() => {
      this.send({
        type: 'ping',
        clientTime: Date.now()
      });
    }, 2000);
  }

  private stopPingLoop(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const msg = JSON.parse(event.data as string) as ServerMessage;

      switch (msg.type) {
        case 'room_created': {
          this.roomCode = msg.roomCode;
          this.playerId = msg.playerId;
          this.reconnectToken = msg.reconnectToken;
          this.isHost = msg.isHost;
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(`fortlite_token_${msg.roomCode}`, msg.reconnectToken);
          }
          break;
        }

        case 'room_joined': {
          this.roomCode = msg.roomCode;
          this.playerId = msg.playerId;
          this.reconnectToken = msg.reconnectToken;
          this.isHost = msg.isHost;
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(`fortlite_token_${msg.roomCode}`, msg.reconnectToken);
          }
          break;
        }

        case 'lobby_update': {
          this.callbacks.onLobbyUpdate?.(msg.players, msg.countdown);
          break;
        }

        case 'match_starting': {
          this.callbacks.onMatchStarting?.(msg);
          break;
        }

        case 'world_snapshot': {
          this.callbacks.onWorldSnapshot?.(msg);
          break;
        }

        case 'shot_broadcast': {
          this.callbacks.onShotEvent?.(msg);
          break;
        }

        case 'damage_event': {
          this.callbacks.onDamageEvent?.(msg);
          break;
        }

        case 'elimination_event': {
          this.callbacks.onEliminationEvent?.(msg);
          break;
        }

        case 'build_event': {
          this.callbacks.onBuildEvent?.(msg);
          break;
        }

        case 'loot_event': {
          this.callbacks.onLootEvent?.(msg);
          break;
        }

        case 'match_ended': {
          this.callbacks.onMatchEnded?.(msg);
          break;
        }

        case 'pong': {
          this.pingMs = Math.max(1, Date.now() - msg.clientTime);
          this.callbacks.onPingUpdate?.(this.pingMs);
          break;
        }

        case 'error': {
          this.callbacks.onError?.(msg.code, msg.message);
          break;
        }
      }
    } catch {
      // Ignore
    }
  }

  disconnect(): void {
    this.stopPingLoop();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }
}
