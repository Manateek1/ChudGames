import type { WorldSnapshotMessage } from './protocol';
import { angleLerp } from '../math';

export interface InterpolatedActor {
  id: string;
  position: [number, number, number];
  yaw: number;
  pitch: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  spawnState: 'skydive' | 'gliding' | 'grounded';
  currentWeaponId: string | null;
  isAiming?: boolean;
}

/**
 * Buffers snapshots and smoothly interpolates positions and rotations of remote actors.
 */
export class SnapshotInterpolator {
  private snapshots: WorldSnapshotMessage[] = [];
  private readonly renderDelayMs: number;

  constructor(renderDelayMs = 120) {
    this.renderDelayMs = renderDelayMs;
  }

  pushSnapshot(snapshot: WorldSnapshotMessage): void {
    this.snapshots.push(snapshot);
    // Keep roughly one second of snapshots at the 10Hz world update rate.
    if (this.snapshots.length > 12) {
      this.snapshots.shift();
    }
  }

  getInterpolatedActors(currentTimeMs: number, localPlayerId: string): {
    players: Map<string, InterpolatedActor>;
    bots: Map<string, InterpolatedActor>;
  } {
    const players = new Map<string, InterpolatedActor>();
    const bots = new Map<string, InterpolatedActor>();

    if (this.snapshots.length === 0) {
      return { players, bots };
    }

    const renderTime = currentTimeMs - this.renderDelayMs;

    // Find two snapshots surrounding renderTime
    let fromSnap = this.snapshots[0];
    let toSnap = this.snapshots[this.snapshots.length - 1];

    for (let i = 0; i < this.snapshots.length - 1; i += 1) {
      if (this.snapshots[i].timestamp <= renderTime && this.snapshots[i + 1].timestamp >= renderTime) {
        fromSnap = this.snapshots[i];
        toSnap = this.snapshots[i + 1];
        break;
      }
    }

    const duration = Math.max(1, toSnap.timestamp - fromSnap.timestamp);
    const alpha = Math.max(0, Math.min(1, (renderTime - fromSnap.timestamp) / duration));
    const fromPlayersById = new Map(fromSnap.players.map((player) => [player.id, player]));
    const fromBotsById = new Map(fromSnap.bots.map((bot) => [bot.id, bot]));

    // Interpolate remote players (skip local player who uses client-side prediction)
    for (const toPlayer of toSnap.players) {
      if (toPlayer.id === localPlayerId) {
        continue;
      }
      const fromPlayer = fromPlayersById.get(toPlayer.id);
      if (!fromPlayer) {
        players.set(toPlayer.id, {
          id: toPlayer.id,
          position: [...toPlayer.position],
          yaw: toPlayer.yaw,
          pitch: toPlayer.pitch,
          health: toPlayer.health,
          maxHealth: toPlayer.maxHealth,
          alive: toPlayer.alive,
          spawnState: toPlayer.spawnState,
          currentWeaponId: toPlayer.currentWeaponId,
          isAiming: toPlayer.isAiming
        });
        continue;
      }

      players.set(toPlayer.id, {
        id: toPlayer.id,
        position: [
          fromPlayer.position[0] + (toPlayer.position[0] - fromPlayer.position[0]) * alpha,
          fromPlayer.position[1] + (toPlayer.position[1] - fromPlayer.position[1]) * alpha,
          fromPlayer.position[2] + (toPlayer.position[2] - fromPlayer.position[2]) * alpha
        ],
        yaw: angleLerp(fromPlayer.yaw, toPlayer.yaw, alpha),
        pitch: fromPlayer.pitch + (toPlayer.pitch - fromPlayer.pitch) * alpha,
        health: toPlayer.health,
        maxHealth: toPlayer.maxHealth,
        alive: toPlayer.alive,
        spawnState: toPlayer.spawnState,
        currentWeaponId: toPlayer.currentWeaponId,
        isAiming: toPlayer.isAiming
      });
    }

    // Interpolate bots
    for (const toBot of toSnap.bots) {
      const fromBot = fromBotsById.get(toBot.id);
      if (!fromBot) {
        bots.set(toBot.id, {
          id: toBot.id,
          position: [...toBot.position],
          yaw: toBot.yaw,
          pitch: 0,
          health: toBot.health,
          maxHealth: toBot.maxHealth,
          alive: toBot.alive,
          spawnState: toBot.spawnState,
          currentWeaponId: toBot.currentWeaponId
        });
        continue;
      }

      bots.set(toBot.id, {
        id: toBot.id,
        position: [
          fromBot.position[0] + (toBot.position[0] - fromBot.position[0]) * alpha,
          fromBot.position[1] + (toBot.position[1] - fromBot.position[1]) * alpha,
          fromBot.position[2] + (toBot.position[2] - fromBot.position[2]) * alpha
        ],
        yaw: angleLerp(fromBot.yaw, toBot.yaw, alpha),
        pitch: 0,
        health: toBot.health,
        maxHealth: toBot.maxHealth,
        alive: toBot.alive,
        spawnState: toBot.spawnState,
        currentWeaponId: toBot.currentWeaponId
      });
    }

    return { players, bots };
  }

  clear(): void {
    this.snapshots = [];
  }
}
