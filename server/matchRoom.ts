import type { WebSocket } from 'ws';
import crypto from 'node:crypto';
import type {
  ClientMessage,
  ServerMessage,
  LobbyPlayer,
  PlayerSnapshot,
  BotSnapshot,
  StormSnapshot,
  BuildSnapshot,
  LootSnapshot,
  MatchPlacement
} from './protocol.ts';
import type {
  ServerClient,
  ServerActor,
  ServerBuildPiece,
  ServerLootPickup,
  ServerStorm
} from './types.ts';
import {
  WEAPON_DEFINITIONS,
  MAP_RADIUS,
  BUILD_COST,
  STORM_PHASES,
  SKYDIVE_ALTITUDE,
  GLIDER_DEPLOY_ALTITUDE,
  SKYDIVE_FALL_SPEED,
  GLIDER_FALL_SPEED
} from '../src/games/fortliteRuntime/content.ts';
import { calculateDamageWithFalloff } from '../src/games/fortliteRuntime/combat.ts';
import { generateBotSkillProfile } from '../src/games/fortliteRuntime/bots.ts';
import { SeededRandom } from '../src/games/fortliteRuntime/math.ts';

export const TICK_RATE_HZ = 20;
export const TICK_DELTA_SECONDS = 1 / TICK_RATE_HZ;
export const RECONNECT_GRACE_PERIOD_MS = 45000;
export const TOTAL_MATCH_PARTICIPANTS = 10;

export class MatchRoom {
  readonly roomCode: string;
  readonly createdAt = Date.now();
  state: 'lobby' | 'countdown' | 'in_game' | 'ended' = 'lobby';

  private clients = new Map<string, ServerClient>();
  private actors = new Map<string, ServerActor>();
  private buildPieces = new Map<string, ServerBuildPiece>();
  private loot = new Map<string, ServerLootPickup>();
  private storm!: ServerStorm;

  private tick = 0;
  private matchTime = 0;
  private countdownTimer = 0;
  private tickInterval: NodeJS.Timeout | null = null;
  private rng: SeededRandom;
  private buildCounter = 0;
  private nextBotId = 1;

  constructor(
    roomCode: string,
    seed = Math.floor(Math.random() * 1000000),
    autoTick = true
  ) {
    this.roomCode = roomCode;
    this.rng = new SeededRandom(seed);
    this.initializeStorm();
    if (autoTick) {
      this.startTickLoop();
    }
  }

  private initializeStorm(): void {
    const firstPhase = STORM_PHASES[0];
    this.storm = {
      phaseIndex: 0,
      timer: 0,
      mode: 'pause',
      currentCenter: [0, 0, 0],
      currentRadius: MAP_RADIUS,
      startCenter: [0, 0, 0],
      startRadius: MAP_RADIUS,
      targetCenter: [0, 0, 0],
      targetRadius: firstPhase.targetRadius,
      damagePerSecond: firstPhase.damagePerSecond
    };
  }

  private startTickLoop(): void {
    this.tickInterval = setInterval(() => {
      this.onServerTick(TICK_DELTA_SECONDS);
    }, 1000 / TICK_RATE_HZ);
  }

  dispose(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    for (const client of this.clients.values()) {
      if (client.ws) {
        client.ws.close();
      }
    }
    this.clients.clear();
    this.actors.clear();
    this.buildPieces.clear();
    this.loot.clear();
  }

  // --- Client & Connection Management ---

  createOrJoinClient(
    ws: WebSocket,
    playerName: string,
    reconnectToken?: string
  ): { client: ServerClient; isReconnect: boolean } {
    const cleanName = (playerName || 'Player').slice(0, 16).trim();

    // Check reconnect by token
    if (reconnectToken) {
      for (const existing of this.clients.values()) {
        if (existing.reconnectToken === reconnectToken) {
          existing.ws = ws;
          existing.disconnectedAt = null;
          existing.lastSeenTime = Date.now();
          const hasHost = Array.from(this.clients.values()).some((c) => c.ws !== null && c.isHost);
          if (!hasHost) {
            existing.isHost = true;
          }
          return { client: existing, isReconnect: true };
        }
      }
    }

    const clientId = `client_${crypto.randomUUID().slice(0, 8)}`;
    const newReconnectToken = crypto.randomBytes(16).toString('hex');
    const isHost = this.clients.size === 0;

    const client: ServerClient = {
      id: clientId,
      ws,
      name: cleanName,
      reconnectToken: newReconnectToken,
      isHost,
      isReady: false,
      ping: 0,
      lastPingTime: Date.now(),
      lastSeenTime: Date.now(),
      disconnectedAt: null
    };

    this.clients.set(clientId, client);
    this.broadcastLobbyUpdate();
    return { client, isReconnect: false };
  }

  handleDisconnect(ws: WebSocket): void {
    let disconnectedHost = false;
    for (const client of this.clients.values()) {
      if (client.ws === ws) {
        client.ws = null;
        client.disconnectedAt = Date.now();
        if (client.isHost) {
          client.isHost = false;
          disconnectedHost = true;
        }
        break;
      }
    }
    if (disconnectedHost) {
      for (const client of this.clients.values()) {
        if (client.ws !== null) {
          client.isHost = true;
          break;
        }
      }
    }
    this.broadcastLobbyUpdate();
  }

  handleMessage(ws: WebSocket, raw: string): void {
    let client: ServerClient | null = null;
    for (const c of this.clients.values()) {
      if (c.ws === ws) {
        client = c;
        break;
      }
    }
    if (!client) {
      return;
    }

    client.lastSeenTime = Date.now();

    try {
      const msg = JSON.parse(raw) as ClientMessage;
      this.processClientMessage(client, msg);
    } catch {
      // Ignore malformed JSON
    }
  }

  private processClientMessage(client: ServerClient, msg: ClientMessage): void {
    switch (msg.type) {
      case 'ping': {
        client.ping = Math.max(1, Math.round(Date.now() - msg.clientTime));
        this.send(client, {
          type: 'pong',
          clientTime: msg.clientTime,
          serverTime: Date.now()
        });
        break;
      }

      case 'toggle_ready': {
        if (this.state === 'lobby') {
          client.isReady = msg.isReady;
          this.checkLobbyAutoStart();
          this.broadcastLobbyUpdate();
        }
        break;
      }

      case 'start_match': {
        if (this.state === 'lobby' && client.isHost) {
          this.startCountdown();
        }
        break;
      }

      case 'player_input': {
        if (this.state === 'in_game') {
          this.handlePlayerInput(client, msg);
        }
        break;
      }

      case 'fire_weapon': {
        if (this.state === 'in_game') {
          this.handleFireWeapon(client, msg);
        }
        break;
      }

      case 'place_build': {
        if (this.state === 'in_game') {
          this.handlePlaceBuild(client, msg);
        }
        break;
      }

      case 'switch_slot': {
        if (this.state === 'in_game') {
          const actor = this.actors.get(client.id);
          if (actor && actor.alive && msg.slotIndex >= 0 && msg.slotIndex < actor.inventory.weapons.length) {
            actor.inventory.activeWeaponIndex = msg.slotIndex;
            actor.inventory.mode = 'weapon';
          }
        }
        break;
      }

      case 'reload': {
        if (this.state === 'in_game') {
          const actor = this.actors.get(client.id);
          if (actor && actor.alive) {
            this.tryStartReload(actor);
          }
        }
        break;
      }
    }
  }

  // --- Lobby Management ---

  private checkLobbyAutoStart(): void {
    const connectedClients = Array.from(this.clients.values()).filter((c) => c.ws !== null);
    if (connectedClients.length >= 2 && connectedClients.every((c) => c.isReady)) {
      this.startCountdown();
    }
  }

  private startCountdown(): void {
    if (this.state !== 'lobby') {
      return;
    }
    this.state = 'countdown';
    this.countdownTimer = 3;
    this.broadcastLobbyUpdate();
  }

  private launchMatch(): void {
    this.state = 'in_game';
    this.matchTime = 0;
    this.tick = 0;

    const dropStarts: Record<string, [number, number, number]> = {};

    // Spawn human player actors
    for (const client of this.clients.values()) {
      const angle = this.rng.next() * Math.PI * 2;
      const dist = this.rng.range(60, MAP_RADIUS * 0.55);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const startPos: [number, number, number] = [x, SKYDIVE_ALTITUDE, z];
      dropStarts[client.id] = startPos;

      const actor: ServerActor = {
        id: client.id,
        clientId: client.id,
        isBot: false,
        name: client.name,
        position: [...startPos],
        velocity: [0, -SKYDIVE_FALL_SPEED, 0],
        yaw: Math.PI,
        pitch: 0,
        health: 100,
        maxHealth: 100,
        alive: true,
        spawnState: 'skydive',
        spawnTimer: 0,
        fireCooldown: 0,
        reloadTimer: 0,
        reloadWeaponId: null,
        eliminations: 0,
        survivalTime: 0,
        inventory: {
          weapons: [
            { definitionId: 'ranger-rifle', magAmmo: 24 },
            { definitionId: 'auto-shotgun', magAmmo: 6 }
          ],
          activeWeaponIndex: 0,
          ammo: { light: 72, medium: 0, heavy: 0, shells: 24 },
          materials: { wood: 60, stone: 40, metal: 20 },
          mode: 'weapon'
        }
      };
      this.actors.set(client.id, actor);
    }

    // Fill remainder with bots
    const botCount = Math.max(1, TOTAL_MATCH_PARTICIPANTS - this.clients.size);
    for (let i = 0; i < botCount; i += 1) {
      const botId = `bot_${this.nextBotId++}`;
      const angle = this.rng.next() * Math.PI * 2;
      const dist = this.rng.range(50, MAP_RADIUS * 0.6);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const startPos: [number, number, number] = [x, SKYDIVE_ALTITUDE, z];
      dropStarts[botId] = startPos;

      const profile = generateBotSkillProfile(this.rng);
      const botActor: ServerActor = {
        id: botId,
        isBot: true,
        name: `Bot ${profile.tier.toUpperCase()}`,
        position: [...startPos],
        velocity: [0, -SKYDIVE_FALL_SPEED, 0],
        yaw: this.rng.next() * Math.PI * 2,
        pitch: 0,
        health: 100,
        maxHealth: 100,
        alive: true,
        spawnState: 'skydive',
        spawnTimer: 0,
        fireCooldown: 0,
        reloadTimer: 0,
        reloadWeaponId: null,
        eliminations: 0,
        survivalTime: 0,
        inventory: {
          weapons: [
            { definitionId: 'ranger-rifle', magAmmo: 24 },
            { definitionId: 'tactical-smg', magAmmo: 30 }
          ],
          activeWeaponIndex: 0,
          ammo: { light: 90, medium: 0, heavy: 0, shells: 12 },
          materials: { wood: 60, stone: 30, metal: 0 },
          mode: 'weapon'
        },
        botBrain: {
          profile,
          state: 'roam',
          targetPosition: [0, 0, 0],
          decisionTimer: profile.reactionTime,
          strafeDirection: this.rng.next() > 0.5 ? 1 : -1,
          strafeTimer: 1.5,
          burstShotsRemaining: 0,
          burstCooldownTimer: 0,
          buildCooldown: 2.0,
          healTimer: 0,
          retreatTimer: 0
        }
      };
      this.actors.set(botId, botActor);
    }

    // Spawn starter loot around map
    this.seedWorldLoot();

    this.broadcast({
      type: 'match_starting',
      seed: 1337,
      dropStartPositions: dropStarts
    });
  }

  private seedWorldLoot(): void {
    const pickupTypes: ('weapon' | 'ammo' | 'material' | 'medkit')[] = ['weapon', 'ammo', 'material', 'medkit'];
    for (let i = 0; i < 30; i += 1) {
      const angle = this.rng.next() * Math.PI * 2;
      const r = this.rng.range(20, MAP_RADIUS * 0.7);
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const kind = pickupTypes[i % pickupTypes.length];
      const id = `loot_${i}`;
      this.loot.set(id, {
        id,
        kind,
        position: [x, 0.5, z],
        itemId: kind === 'weapon' ? 'ranger-rifle' : undefined,
        amount: kind === 'ammo' ? 30 : kind === 'material' ? 40 : undefined
      });
    }
  }

  // --- Authoritative Simulation ---

  private onServerTick(dt: number): void {
    this.tick += 1;

    // Lobby countdown
    if (this.state === 'countdown') {
      this.countdownTimer -= dt;
      if (this.countdownTimer <= 0) {
        this.launchMatch();
      } else {
        this.broadcastLobbyUpdate();
      }
      return;
    }

    if (this.state !== 'in_game') {
      return;
    }

    this.matchTime += dt;

    // Check reconnect timeouts (45s grace period)
    const now = Date.now();
    for (const client of this.clients.values()) {
      if (client.disconnectedAt && now - client.disconnectedAt > RECONNECT_GRACE_PERIOD_MS) {
        const actor = this.actors.get(client.id);
        if (actor && actor.alive) {
          this.applyActorDamage(actor, 9999, null, 'disconnect');
        }
      }
    }

    // Tick actors
    for (const actor of this.actors.values()) {
      if (!actor.alive) {
        continue;
      }
      actor.survivalTime += dt;
      actor.fireCooldown = Math.max(0, actor.fireCooldown - dt);

      // Handle reload timer
      if (actor.reloadTimer > 0) {
        actor.reloadTimer = Math.max(0, actor.reloadTimer - dt);
        if (actor.reloadTimer === 0) {
          this.finishReload(actor);
        }
      }

      // Drop physics
      if (actor.spawnState !== 'grounded') {
        if (actor.position[1] <= GLIDER_DEPLOY_ALTITUDE && actor.spawnState === 'skydive') {
          actor.spawnState = 'gliding';
        }
        const fallSpeed = actor.spawnState === 'skydive' ? SKYDIVE_FALL_SPEED : GLIDER_FALL_SPEED;
        actor.position[1] -= fallSpeed * dt;
        if (actor.position[1] <= 0) {
          actor.position[1] = 0;
          actor.spawnState = 'grounded';
        }
      }

      // Bot simulation
      if (actor.isBot && actor.spawnState === 'grounded') {
        this.tickBot(actor, dt);
      }

      // Check loot pickups in radius
      this.checkLootPickups(actor);
    }

    // Tick storm
    this.tickStorm(dt);

    // Broadcast world snapshot
    this.broadcastSnapshot();

    // Check match victory/defeat
    this.checkMatchEnd();
  }

  private handlePlayerInput(client: ServerClient, msg: { move: { x: number; z: number }; yaw: number; pitch: number; sprint: boolean }): void {
    const actor = this.actors.get(client.id);
    if (!actor || !actor.alive || actor.spawnState !== 'grounded') {
      return;
    }

    actor.yaw = msg.yaw;
    actor.pitch = msg.pitch;

    // Movement speed validation
    const maxSpeed = msg.sprint ? 9.2 : 6.2;
    let mx = msg.move.x;
    let mz = msg.move.z;
    const len = Math.sqrt(mx * mx + mz * mz);
    if (len > 1.0) {
      mx /= len;
      mz /= len;
    }

    const forwardX = Math.sin(actor.yaw);
    const forwardZ = Math.cos(actor.yaw);
    const rightX = Math.cos(actor.yaw);
    const rightZ = -Math.sin(actor.yaw);

    const worldMoveX = (rightX * mx + forwardX * mz) * maxSpeed;
    const worldMoveZ = (rightZ * mx + forwardZ * mz) * maxSpeed;

    actor.position[0] += worldMoveX * TICK_DELTA_SECONDS;
    actor.position[2] += worldMoveZ * TICK_DELTA_SECONDS;

    // Map bounds clamp
    const distSq = actor.position[0] * actor.position[0] + actor.position[2] * actor.position[2];
    if (distSq > MAP_RADIUS * MAP_RADIUS) {
      const scale = MAP_RADIUS / Math.sqrt(distSq);
      actor.position[0] *= scale;
      actor.position[2] *= scale;
    }
  }

  private handleFireWeapon(client: ServerClient, msg: { weaponId: string; origin: [number, number, number]; direction: [number, number, number] }): void {
    const actor = this.actors.get(client.id);
    if (!actor || !actor.alive || actor.spawnState !== 'grounded') {
      return;
    }

    const weaponDef = WEAPON_DEFINITIONS.find((w) => w.id === msg.weaponId);
    if (!weaponDef) {
      return;
    }

    // Rate of fire and reload validation
    if (actor.fireCooldown > 0 || actor.reloadTimer > 0) {
      return;
    }

    const equipped = actor.inventory.weapons[actor.inventory.activeWeaponIndex];
    if (!equipped || equipped.definitionId !== msg.weaponId || equipped.magAmmo <= 0) {
      return;
    }

    equipped.magAmmo -= 1;
    actor.fireCooldown = weaponDef.fireInterval;

    // Authoritative hit detection against other actors
    let hitTarget: ServerActor | null = null;
    let minDistance = weaponDef.range;
    let isCritical = false;

    const dir = msg.direction;
    const origin = msg.origin;

    for (const other of this.actors.values()) {
      if (!other.alive || other.id === actor.id) {
        continue;
      }
      const toTarget = [other.position[0] - origin[0], other.position[1] + 1.2 - origin[1], other.position[2] - origin[2]];
      const dist = Math.sqrt(toTarget[0] * toTarget[0] + toTarget[1] * toTarget[1] + toTarget[2] * toTarget[2]);
      if (dist > minDistance) {
        continue;
      }

      // Simple ray-cylinder / dot product alignment
      const dot = (toTarget[0] * dir[0] + toTarget[1] * dir[1] + toTarget[2] * dir[2]) / dist;
      if (dot > 0.94) {
        minDistance = dist;
        hitTarget = other;
        // Check headshot (top portion)
        isCritical = (origin[1] + dir[1] * dist) - other.position[1] > 1.32;
      }
    }

    let impactPoint: [number, number, number] | null = null;
    if (hitTarget) {
      impactPoint = [
        origin[0] + dir[0] * minDistance,
        origin[1] + dir[1] * minDistance,
        origin[2] + dir[2] * minDistance
      ];
      let damage = calculateDamageWithFalloff(weaponDef, minDistance);
      if (isCritical) {
        damage = Math.round(damage * 1.5);
      }
      this.applyActorDamage(hitTarget, damage, actor, weaponDef.id, isCritical);
    }

    this.broadcast({
      type: 'shot_broadcast',
      actorId: actor.id,
      weaponId: weaponDef.id,
      origin: msg.origin,
      direction: msg.direction,
      impact: impactPoint
    });
  }

  private handlePlaceBuild(client: ServerClient, msg: { pieceType: 'wall' | 'floor' | 'ramp'; position: [number, number, number]; yaw: number }): void {
    const actor = this.actors.get(client.id);
    if (!actor || !actor.alive || actor.spawnState !== 'grounded') {
      return;
    }

    // Material cost check
    let materialType: 'wood' | 'stone' | 'metal' | null = null;
    if (actor.inventory.materials.wood >= BUILD_COST) {
      materialType = 'wood';
    } else if (actor.inventory.materials.stone >= BUILD_COST) {
      materialType = 'stone';
    } else if (actor.inventory.materials.metal >= BUILD_COST) {
      materialType = 'metal';
    }

    if (!materialType) {
      return;
    }

    // Distance validation (< 14m)
    const dx = msg.position[0] - actor.position[0];
    const dz = msg.position[2] - actor.position[2];
    if (dx * dx + dz * dz > 14 * 14) {
      return;
    }

    actor.inventory.materials[materialType] -= BUILD_COST;
    const buildId = `build_${this.buildCounter++}`;
    const piece: ServerBuildPiece = {
      id: buildId,
      pieceType: msg.pieceType,
      materialType,
      position: msg.position,
      yaw: msg.yaw,
      health: msg.pieceType === 'wall' ? 220 : 180,
      ownerId: actor.id
    };

    this.buildPieces.set(buildId, piece);

    this.broadcast({
      type: 'build_event',
      action: 'placed',
      piece: {
        id: piece.id,
        pieceType: piece.pieceType,
        materialType: piece.materialType,
        position: piece.position,
        yaw: piece.yaw,
        health: piece.health
      }
    });
  }

  private tryStartReload(actor: ServerActor): void {
    const weapon = actor.inventory.weapons[actor.inventory.activeWeaponIndex];
    if (!weapon || actor.reloadTimer > 0) {
      return;
    }
    const def = WEAPON_DEFINITIONS.find((w) => w.id === weapon.definitionId);
    if (!def) {
      return;
    }
    const reserve = actor.inventory.ammo[def.ammoType];
    if (reserve <= 0 || weapon.magAmmo >= def.magSize) {
      return;
    }

    actor.reloadTimer = def.reloadDuration;
    actor.reloadWeaponId = def.id;
  }

  private finishReload(actor: ServerActor): void {
    const weapon = actor.inventory.weapons[actor.inventory.activeWeaponIndex];
    if (!weapon || !actor.reloadWeaponId) {
      return;
    }
    const def = WEAPON_DEFINITIONS.find((w) => w.id === actor.reloadWeaponId);
    if (!def) {
      return;
    }

    const needed = def.magSize - weapon.magAmmo;
    const available = Math.min(needed, actor.inventory.ammo[def.ammoType]);
    weapon.magAmmo += available;
    actor.inventory.ammo[def.ammoType] -= available;
    actor.reloadWeaponId = null;
  }

  private checkLootPickups(actor: ServerActor): void {
    for (const pickup of this.loot.values()) {
      const dx = pickup.position[0] - actor.position[0];
      const dz = pickup.position[2] - actor.position[2];
      if (dx * dx + dz * dz < 2.8 * 2.8) {
        // Collect
        if (pickup.kind === 'weapon' && pickup.itemId) {
          const hasWeapon = actor.inventory.weapons.some((w) => w.definitionId === pickup.itemId);
          if (!hasWeapon && actor.inventory.weapons.length < 3) {
            const def = WEAPON_DEFINITIONS.find((w) => w.id === pickup.itemId);
            actor.inventory.weapons.push({ definitionId: pickup.itemId, magAmmo: def?.magSize ?? 24 });
          }
        } else if (pickup.kind === 'ammo') {
          actor.inventory.ammo.light += pickup.amount ?? 30;
        } else if (pickup.kind === 'material') {
          actor.inventory.materials.wood += pickup.amount ?? 30;
        } else if (pickup.kind === 'medkit') {
          actor.health = Math.min(actor.maxHealth, actor.health + 50);
        }

        this.loot.delete(pickup.id);
        this.broadcast({
          type: 'loot_event',
          action: 'collected',
          lootId: pickup.id,
          collectorId: actor.id
        });
      }
    }
  }

  private applyActorDamage(
    target: ServerActor,
    amount: number,
    attacker: ServerActor | null,
    weaponId: string,
    isCritical = false
  ): void {
    if (!target.alive) {
      return;
    }

    target.health = Math.max(0, target.health - amount);

    this.broadcast({
      type: 'damage_event',
      targetId: target.id,
      amount,
      attackerId: attacker ? attacker.id : null,
      isCritical,
      newHealth: target.health
    });

    if (target.health <= 0) {
      target.alive = false;
      if (attacker) {
        attacker.eliminations += 1;
      }

      const aliveCount = Array.from(this.actors.values()).filter((a) => a.alive).length;
      this.broadcast({
        type: 'elimination_event',
        targetId: target.id,
        attackerId: attacker ? attacker.id : null,
        weaponId,
        remainingAlive: aliveCount
      });

      // Drop loot on death
      const lootId = `drop_${target.id}_${Date.now()}`;
      this.loot.set(lootId, {
        id: lootId,
        kind: 'material',
        position: [...target.position],
        amount: 40
      });
      this.broadcast({
        type: 'loot_event',
        action: 'spawned',
        lootId
      });
    }
  }

  // --- Storm Ticking ---

  private tickStorm(dt: number): void {
    const phase = STORM_PHASES[Math.min(this.storm.phaseIndex, STORM_PHASES.length - 1)];
    this.storm.damagePerSecond = phase.damagePerSecond;
    this.storm.timer += dt;

    if (this.storm.mode === 'pause') {
      if (this.storm.timer >= phase.pauseDuration) {
        this.storm.mode = 'shrink';
        this.storm.timer = 0;
        this.storm.startRadius = this.storm.currentRadius;
        this.storm.startCenter = [...this.storm.currentCenter];
      }
    } else if (this.storm.mode === 'shrink') {
      const shrinkDuration = Math.max(0.1, phase.shrinkDuration);
      const t = Math.min(1, Math.max(0, this.storm.timer / shrinkDuration));
      this.storm.currentRadius = this.storm.startRadius + (this.storm.targetRadius - this.storm.startRadius) * t;
      this.storm.currentCenter = [
        this.storm.startCenter[0] + (this.storm.targetCenter[0] - this.storm.startCenter[0]) * t,
        0,
        this.storm.startCenter[2] + (this.storm.targetCenter[2] - this.storm.startCenter[2]) * t
      ];

      if (t >= 1) {
        this.storm.phaseIndex += 1;
        this.storm.timer = 0;
        this.storm.currentRadius = this.storm.targetRadius;
        this.storm.currentCenter = [...this.storm.targetCenter];

        if (this.storm.phaseIndex >= STORM_PHASES.length) {
          this.storm.mode = 'done';
        } else {
          this.storm.mode = 'pause';
          const nextPhase = STORM_PHASES[this.storm.phaseIndex];
          this.storm.startCenter = [...this.storm.currentCenter];
          this.storm.startRadius = this.storm.currentRadius;
          this.storm.targetRadius = nextPhase.targetRadius;

          const maxOffset = Math.max(0, this.storm.currentRadius - nextPhase.targetRadius - 6);
          const angle = this.rng.next() * Math.PI * 2;
          const dist = this.rng.next() * maxOffset;
          const candX = this.storm.currentCenter[0] + Math.cos(angle) * dist;
          const candZ = this.storm.currentCenter[2] + Math.sin(angle) * dist;
          const maxDist = Math.max(0, MAP_RADIUS - nextPhase.targetRadius - 4);
          const cDist = Math.sqrt(candX * candX + candZ * candZ);
          if (cDist > maxDist && cDist > 0) {
            this.storm.targetCenter = [(candX / cDist) * maxDist, 0, (candZ / cDist) * maxDist];
          } else {
            this.storm.targetCenter = [candX, 0, candZ];
          }
        }
      }
    }

    // Apply storm damage to actors outside the circle
    for (const actor of this.actors.values()) {
      if (!actor.alive || actor.spawnState !== 'grounded') {
        continue;
      }
      const dx = actor.position[0] - this.storm.currentCenter[0];
      const dz = actor.position[2] - this.storm.currentCenter[2];
      if (dx * dx + dz * dz > this.storm.currentRadius * this.storm.currentRadius) {
        this.applyActorDamage(actor, this.storm.damagePerSecond * dt, null, 'storm');
      }
    }
  }

  // --- Bot AI Ticking ---

  private tickBot(actor: ServerActor, dt: number): void {
    const brain = actor.botBrain;
    if (!brain) {
      return;
    }

    brain.decisionTimer -= dt;
    brain.burstCooldownTimer = Math.max(0, brain.burstCooldownTimer - dt);
    brain.buildCooldown = Math.max(0, brain.buildCooldown - dt);

    // Find nearest visible target
    let nearestTarget: ServerActor | null = null;
    let minDistSq = brain.profile.awarenessRadius * brain.profile.awarenessRadius;

    for (const other of this.actors.values()) {
      if (!other.alive || other.id === actor.id) {
        continue;
      }
      const dx = other.position[0] - actor.position[0];
      const dz = other.position[2] - actor.position[2];
      const distSq = dx * dx + dz * dz;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        nearestTarget = other;
      }
    }

    if (nearestTarget) {
      brain.targetActorId = nearestTarget.id;
      const dx = nearestTarget.position[0] - actor.position[0];
      const dz = nearestTarget.position[2] - actor.position[2];
      const targetYaw = Math.atan2(dx, dz);

      // Smooth turning limit
      let yawDiff = targetYaw - actor.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      const maxTurn = brain.profile.turnRate * dt;
      actor.yaw += Math.max(-maxTurn, Math.min(maxTurn, yawDiff));

      const dist = Math.sqrt(minDistSq);

      // Bot firing
      if (dist < 45 && brain.burstCooldownTimer <= 0 && actor.fireCooldown <= 0) {
        const weaponDef = WEAPON_DEFINITIONS[0];
        const dir: [number, number, number] = [Math.sin(actor.yaw), 0, Math.cos(actor.yaw)];
        const origin: [number, number, number] = [actor.position[0], actor.position[1] + 1.4, actor.position[2]];
        const damage = calculateDamageWithFalloff(weaponDef, dist);
        this.applyActorDamage(nearestTarget, damage, actor, weaponDef.id);
        this.broadcast({
          type: 'shot_broadcast',
          actorId: actor.id,
          weaponId: weaponDef.id,
          origin,
          direction: dir,
          impact: nearestTarget.position
        });
        actor.fireCooldown = weaponDef.fireInterval;
        brain.burstCooldownTimer = brain.profile.burstCooldown;
      }

      // Move toward or strafe
      if (dist > 18) {
        actor.position[0] += Math.sin(actor.yaw) * 5.2 * dt;
        actor.position[2] += Math.cos(actor.yaw) * 5.2 * dt;
      }
    }
  }

  // --- Snapshot Broadcast ---

  private broadcastSnapshot(): void {
    const players: PlayerSnapshot[] = [];
    const bots: BotSnapshot[] = [];

    for (const actor of this.actors.values()) {
      if (actor.isBot) {
        bots.push({
          id: actor.id,
          position: [...actor.position],
          yaw: actor.yaw,
          health: actor.health,
          maxHealth: actor.maxHealth,
          alive: actor.alive,
          spawnState: actor.spawnState,
          currentWeaponId: actor.inventory.weapons[actor.inventory.activeWeaponIndex]?.definitionId ?? null
        });
      } else {
        const activeWeapon = actor.inventory.weapons[actor.inventory.activeWeaponIndex];
        players.push({
          id: actor.id,
          name: actor.name,
          position: [...actor.position],
          yaw: actor.yaw,
          pitch: actor.pitch,
          health: actor.health,
          maxHealth: actor.maxHealth,
          alive: actor.alive,
          spawnState: actor.spawnState,
          currentWeaponId: activeWeapon?.definitionId ?? null,
          ammoInMag: activeWeapon?.magAmmo ?? 0,
          materials: { ...actor.inventory.materials },
          ammo: { ...actor.inventory.ammo },
          isReloading: actor.reloadTimer > 0,
          isAiming: false,
          isGrounded: actor.spawnState === 'grounded',
          eliminationCount: actor.eliminations
        });
      }
    }

    const stormSnap: StormSnapshot = {
      center: [...this.storm.currentCenter],
      radius: this.storm.currentRadius,
      targetCenter: [...this.storm.targetCenter],
      targetRadius: this.storm.targetRadius,
      phaseIndex: this.storm.phaseIndex,
      timer: this.storm.timer,
      damagePerSecond: this.storm.damagePerSecond
    };

    const buildSnaps: BuildSnapshot[] = Array.from(this.buildPieces.values()).map((b) => ({
      id: b.id,
      pieceType: b.pieceType,
      materialType: b.materialType,
      position: [...b.position],
      yaw: b.yaw,
      health: b.health
    }));

    const lootSnaps: LootSnapshot[] = Array.from(this.loot.values()).map((l) => ({
      id: l.id,
      kind: l.kind,
      position: [...l.position],
      itemId: l.itemId,
      amount: l.amount
    }));

    this.broadcast({
      type: 'world_snapshot',
      tick: this.tick,
      timestamp: Date.now(),
      players,
      bots,
      storm: stormSnap,
      builds: buildSnaps,
      loot: lootSnaps
    });
  }

  private checkMatchEnd(): void {
    const livingActors = Array.from(this.actors.values()).filter((a) => a.alive);
    if (livingActors.length <= 1 && this.actors.size > 1) {
      this.state = 'ended';
      const winner = livingActors[0] ?? null;
      const placements: MatchPlacement[] = Array.from(this.actors.values())
        .sort((a, b) => b.survivalTime - a.survivalTime)
        .map((a, idx) => ({
          id: a.id,
          name: a.name,
          placement: idx + 1,
          eliminations: a.eliminations,
          survivalTime: Math.round(a.survivalTime)
        }));

      this.broadcast({
        type: 'match_ended',
        winnerId: winner?.id ?? '',
        winnerName: winner?.name ?? 'Nobody',
        placements
      });
    }
  }

  // --- Network Helpers ---

  broadcastLobbyUpdate(): void {
    const players: LobbyPlayer[] = Array.from(this.clients.values()).map((c) => ({
      id: c.id,
      name: c.name,
      isHost: c.isHost,
      isReady: c.isReady,
      ping: c.ping
    }));

    this.broadcast({
      type: 'lobby_update',
      players,
      countdown: this.state === 'countdown' ? Math.ceil(this.countdownTimer) : null
    });
  }

  send(client: ServerClient, msg: ServerMessage): void {
    if (client.ws && client.ws.readyState === 1) {
      client.ws.send(JSON.stringify(msg));
    }
  }

  broadcast(msg: ServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const client of this.clients.values()) {
      if (client.ws && client.ws.readyState === 1) {
        client.ws.send(payload);
      }
    }
  }

  get activeClientCount(): number {
    return Array.from(this.clients.values()).filter((c) => c.ws !== null).length;
  }

  /**
   * Advance the simulation manually by dt seconds (defaults to TICK_DELTA_SECONDS).
   * Useful for testing, simulation runs, and soak tests.
   */
  step(dt = TICK_DELTA_SECONDS): void {
    this.onServerTick(dt);
  }

  /**
   * Forcibly transitions the room into the match immediately (skipping countdown).
   */
  forceStartMatch(): void {
    if (this.state === 'lobby' || this.state === 'countdown') {
      this.launchMatch();
    }
  }

  getActor(id: string): ServerActor | undefined {
    return this.actors.get(id);
  }

  getAllActors(): ServerActor[] {
    return Array.from(this.actors.values());
  }

  getClient(id: string): ServerClient | undefined {
    return this.clients.get(id);
  }

  getAllClients(): ServerClient[] {
    return Array.from(this.clients.values());
  }

  getBuildPieces(): ServerBuildPiece[] {
    return Array.from(this.buildPieces.values());
  }

  getBuildCount(): number {
    return this.buildPieces.size;
  }

  getLoot(): ServerLootPickup[] {
    return Array.from(this.loot.values());
  }

  getLootCount(): number {
    return this.loot.size;
  }

  getStorm(): Readonly<ServerStorm> {
    return this.storm;
  }

  get currentTick(): number {
    return this.tick;
  }

  get elapsedTime(): number {
    return this.matchTime;
  }
}
