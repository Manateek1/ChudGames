import * as THREE from 'three';
import type { AudioManager } from '../../../engine/audio';
import type { FortLiteHud } from '../ui';
import type { BuildPiece } from '../types';
import type {
  Actor,
  FortLiteMatchResult,
  StormRuntime
} from '../runtimeTypes';
import type { FortLiteNetworkClient, NetworkClientCallbacks } from './client';
import { LocalPlayerPredictor } from './prediction';
import { SnapshotInterpolator } from './interpolation';
import type { BuildSnapshot, LootSnapshot } from './protocol';
import { WEAPON_DEFINITIONS } from '../content';
import { horizontalDistance } from '../math';

export interface FortLiteNetworkRuntime {
  client: FortLiteNetworkClient;
  interpolator: SnapshotInterpolator;
  predictor: LocalPlayerPredictor;
  audio?: AudioManager;
  hud: FortLiteHud;
  getPlayer(): Actor;
  getStorm(): StormRuntime | null;
  getCameraYaw(): number;
  getMatchTime(): number;
  getPlayerDamageSoundCooldown(): number;
  setPlayerDamageSoundCooldown(value: number): void;
  getSpectatingTargetId(): string | null;
  setSpectatingTargetId(value: string | null): void;
  findActorById(id: string): Actor | null;
  startSpectating(): void;
  showMessage(text: string, duration: number): void;
  createShotEffect(origin: THREE.Vector3, impact: THREE.Vector3, color: number): void;
  updateStormVisuals(): void;
  syncBuildSnapshots(builds: BuildSnapshot[]): void;
  syncLootSnapshots(loot: LootSnapshot[]): void;
  findBuildPiece(id: string): BuildPiece | null;
  buildPieceExists(id: string): boolean;
  addBuildPiece(
    pieceType: BuildPiece['pieceType'],
    materialType: BuildPiece['materialType'],
    position: THREE.Vector3,
    yaw: number,
    id: string
  ): void;
  damageBuildPiece(piece: BuildPiece, damage: number): void;
  removeLootById(id: string): void;
  endMatch(
    title: string,
    subtitle: string,
    won: boolean,
    result: FortLiteMatchResult,
    showEndScreen: boolean
  ): void;
}

export function createFortLiteNetworkCallbacks(runtime: FortLiteNetworkRuntime): NetworkClientCallbacks {
  const { client } = runtime;

  return {
    onWorldSnapshot: (snapshot) => {
      runtime.interpolator.pushSnapshot(snapshot);

      const player = runtime.getPlayer();
      const localSnap = snapshot.players.find((candidate) => candidate.id === client.playerId);
      if (localSnap) {
        runtime.predictor.reconcile(localSnap);
        player.health = localSnap.health;
        player.maxHealth = localSnap.maxHealth;
        player.alive = localSnap.alive;
        player.inventory.materials = { ...localSnap.materials };
        player.inventory.ammo = { ...localSnap.ammo };
        player.eliminationCount = localSnap.eliminationCount;

        if (!player.alive && !runtime.getSpectatingTargetId()) {
          runtime.startSpectating();
        }
      }

      const storm = runtime.getStorm();
      if (snapshot.storm && storm) {
        const previousPhase = storm.phaseIndex;
        storm.currentCenter.set(snapshot.storm.center[0], snapshot.storm.center[1], snapshot.storm.center[2]);
        storm.currentRadius = snapshot.storm.radius;
        storm.targetCenter.set(snapshot.storm.targetCenter[0], snapshot.storm.targetCenter[1], snapshot.storm.targetCenter[2]);
        storm.targetRadius = snapshot.storm.targetRadius;
        storm.phaseIndex = snapshot.storm.phaseIndex;
        storm.timer = snapshot.storm.timer;
        storm.currentDamagePerSecond = snapshot.storm.damagePerSecond;
        if (snapshot.storm.phaseIndex !== previousPhase) {
          runtime.audio?.fortliteStormWarning();
        }
        runtime.updateStormVisuals();
      }

      if (snapshot.builds) {
        runtime.syncBuildSnapshots(snapshot.builds);
      }
      if (snapshot.loot) {
        runtime.syncLootSnapshots(snapshot.loot);
      }
    },

    onShotEvent: (shot) => {
      if (shot.actorId === client.playerId) {
        return;
      }

      const origin = new THREE.Vector3(...shot.origin);
      const direction = new THREE.Vector3(...shot.direction);
      const impact = shot.impact
        ? new THREE.Vector3(...shot.impact)
        : origin.clone().addScaledVector(direction, 60);
      const weapon = WEAPON_DEFINITIONS.find((candidate) => candidate.id === shot.weaponId);
      runtime.createShotEffect(origin, impact, weapon?.color ?? 0xffd280);
      if (horizontalDistance(origin, runtime.getPlayer().position) < 80) {
        runtime.audio?.fortliteFire(shot.weaponId);
      }
    },

    onDamageEvent: (damage) => {
      const player = runtime.getPlayer();
      if (damage.targetId === client.playerId) {
        if (runtime.getPlayerDamageSoundCooldown() <= 0) {
          runtime.audio?.fortliteDamage();
          runtime.setPlayerDamageSoundCooldown(0.12);
        }

        const attacker = damage.attackerId ? runtime.findActorById(damage.attackerId) : null;
        if (attacker) {
          const dx = attacker.position.x - player.position.x;
          const dz = attacker.position.z - player.position.z;
          runtime.hud.flashHit(Math.atan2(dz, dx) - runtime.getCameraYaw());
        } else {
          runtime.hud.flashHit(0);
        }
        player.health = damage.newHealth;
      }

      if (damage.attackerId === client.playerId) {
        runtime.hud.showHitMarker(damage.isCritical);
        if (damage.isCritical) {
          runtime.audio?.fortliteCriticalHit();
        } else {
          runtime.audio?.hit();
        }
      }
    },

    onEliminationEvent: (elimination) => {
      const victim = runtime.findActorById(elimination.targetId);
      const attacker = elimination.attackerId ? runtime.findActorById(elimination.attackerId) : null;
      const victimName = victim?.name || elimination.targetId.slice(0, 6);
      const killerName = elimination.attackerId
        ? attacker?.name || elimination.attackerId.slice(0, 6)
        : 'The Storm';

      runtime.showMessage(`${killerName} eliminated ${victimName}`, 2.5);

      if (elimination.targetId === client.playerId) {
        runtime.setSpectatingTargetId(elimination.attackerId);
        runtime.startSpectating();
        runtime.showMessage(`Eliminated by ${killerName}. Now spectating.`, 4);
      } else if (elimination.attackerId === client.playerId) {
        runtime.audio?.explosion();
        runtime.showMessage(`You eliminated ${victimName}!`, 2.5);
      }

      if (victim) {
        victim.alive = false;
        victim.group.visible = false;
      }
    },

    onBuildEvent: (event) => {
      if (event.action === 'placed') {
        if (!runtime.buildPieceExists(event.piece.id)) {
          runtime.addBuildPiece(
            event.piece.pieceType,
            event.piece.materialType,
            new THREE.Vector3(...event.piece.position),
            event.piece.yaw,
            event.piece.id
          );
          runtime.audio?.fortliteBuild();
        }
      } else if (event.action === 'destroyed') {
        const piece = runtime.findBuildPiece(event.piece.id);
        if (piece) {
          runtime.damageBuildPiece(piece, 9999);
        }
      }
    },

    onLootEvent: (event) => {
      if (event.action === 'collected') {
        runtime.removeLootById(event.lootId);
      }
    },

    onMatchEnded: (data) => {
      const player = runtime.getPlayer();
      const won = data.winnerId === client.playerId;
      const placement = data.placements.find((candidate) => candidate.id === client.playerId);
      runtime.endMatch(
        won ? 'Victory Royale' : 'Match Ended',
        won ? 'You won the match!' : `Winner: ${data.winnerName}. Placement: #${placement?.placement ?? '-'}.`,
        won,
        {
          won,
          placement: placement?.placement ?? (won ? 1 : 2),
          eliminations: placement?.eliminations ?? player.eliminationCount,
          survivalTime: runtime.getMatchTime()
        },
        false
      );
    },

    onPingUpdate: (pingMs) => {
      runtime.hud.setPing(pingMs);
    }
  };
}
