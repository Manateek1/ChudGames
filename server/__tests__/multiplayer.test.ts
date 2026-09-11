import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { WebSocket } from 'ws';
import { MatchRoom, TICK_DELTA_SECONDS, TOTAL_MATCH_PARTICIPANTS } from '../matchRoom.ts';
import { RoomManager } from '../roomManager.ts';
import {
  generateRandomRoomCode,
  isValidRoomCode,
  ROOM_CODE_CHARSET,
  ROOM_CODE_LENGTH,
  type ServerMessage,
  type WorldSnapshotMessage,
  type LobbyUpdateMessage,
  type DamageEventMessage,
  type BuildEventMessage
} from '../protocol.ts';
import { BUILD_COST } from '../../src/games/fortliteRuntime/content.ts';

class MockWebSocket {
  readyState = 1; // OPEN
  sentMessages: string[] = [];

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = 3; // CLOSED
  }

  getLastMessage<T = ServerMessage>(): T | null {
    if (this.sentMessages.length === 0) return null;
    return JSON.parse(this.sentMessages[this.sentMessages.length - 1]) as T;
  }

  getMessagesOfType<T = ServerMessage>(type: string): T[] {
    return this.sentMessages
      .map((m) => JSON.parse(m) as ServerMessage)
      .filter((m) => m.type === type) as T[];
  }

  clear(): void {
    this.sentMessages = [];
  }
}

describe('FortLite Multiplayer Server Suite', () => {
  describe('Room Code Generation & Validation', () => {
    it('generates 6-character uppercase codes using valid charset', () => {
      for (let i = 0; i < 50; i += 1) {
        const code = generateRandomRoomCode();
        expect(code).toHaveLength(ROOM_CODE_LENGTH);
        expect(isValidRoomCode(code)).toBe(true);
        for (const char of code) {
          expect(ROOM_CODE_CHARSET).toContain(char);
          // Ambiguous chars must be absent
          expect(['0', 'O', '1', 'I']).not.toContain(char);
        }
      }
    });

    it('rejects invalid codes (wrong length, illegal chars, lowercase)', () => {
      expect(isValidRoomCode('')).toBe(false);
      expect(isValidRoomCode('ABCDE')).toBe(false);
      expect(isValidRoomCode('ABCDEFG')).toBe(false);
      expect(isValidRoomCode('23456I')).toBe(false); // Contains 'I'
      expect(isValidRoomCode('234560')).toBe(false); // Contains '0'
      expect(isValidRoomCode('abcdef')).toBe(false); // Lowercase
      expect(isValidRoomCode(null as unknown as string)).toBe(false);
    });

    it('generates distinct codes with negligible collision probability', () => {
      const generated = new Set<string>();
      for (let i = 0; i < 100; i += 1) {
        generated.add(generateRandomRoomCode());
      }
      expect(generated.size).toBe(100);
    });
  });

  describe('RoomManager Lifecycle', () => {
    let manager: RoomManager;

    beforeEach(() => {
      manager = new RoomManager();
    });

    afterEach(() => {
      manager.dispose();
    });

    it('creates, retrieves, and removes rooms', () => {
      const room = manager.createRoom();
      expect(isValidRoomCode(room.roomCode)).toBe(true);
      expect(manager.getRoom(room.roomCode)).toBe(room);
      expect(manager.roomCount).toBe(1);

      manager.removeRoom(room.roomCode);
      expect(manager.getRoom(room.roomCode)).toBeUndefined();
      expect(manager.roomCount).toBe(0);
    });
  });

  describe('Lobby Lifecycle & Host Promotion', () => {
    let room: MatchRoom;
    let wsHost: MockWebSocket;
    let wsGuest: MockWebSocket;

    beforeEach(() => {
      // Create room with autoTick disabled for deterministic step testing
      room = new MatchRoom('TEST01', 42, false);
      wsHost = new MockWebSocket();
      wsGuest = new MockWebSocket();
    });

    afterEach(() => {
      room.dispose();
    });

    it('assigns host status to first client and non-host to second client', () => {
      const { client: hostClient } = room.createOrJoinClient(wsHost as unknown as WebSocket, 'HostPlayer');
      expect(hostClient.isHost).toBe(true);
      expect(hostClient.name).toBe('HostPlayer');

      const { client: guestClient } = room.createOrJoinClient(wsGuest as unknown as WebSocket, 'GuestPlayer');
      expect(guestClient.isHost).toBe(false);
      expect(guestClient.name).toBe('GuestPlayer');

      expect(room.activeClientCount).toBe(2);
    });

    it('promotes remaining client to host when host disconnects', () => {
      const { client: hostClient } = room.createOrJoinClient(wsHost as unknown as WebSocket, 'HostPlayer');
      const { client: guestClient } = room.createOrJoinClient(wsGuest as unknown as WebSocket, 'GuestPlayer');

      expect(hostClient.isHost).toBe(true);
      expect(guestClient.isHost).toBe(false);

      // Host disconnects
      room.handleDisconnect(wsHost as unknown as WebSocket);

      expect(hostClient.isHost).toBe(false);
      expect(guestClient.isHost).toBe(true);

      const lobbyUpdates = wsGuest.getMessagesOfType<LobbyUpdateMessage>('lobby_update');
      const latestUpdate = lobbyUpdates[lobbyUpdates.length - 1];
      expect(latestUpdate.players.find((p) => p.id === guestClient.id)?.isHost).toBe(true);
    });

    it('starts match countdown when all clients toggle ready', () => {
      room.createOrJoinClient(wsHost as unknown as WebSocket, 'HostPlayer');
      room.createOrJoinClient(wsGuest as unknown as WebSocket, 'GuestPlayer');

      // Toggle Host ready
      room.handleMessage(wsHost as unknown as WebSocket, JSON.stringify({ type: 'toggle_ready', isReady: true }));
      expect(room.state).toBe('lobby');

      // Toggle Guest ready -> Auto start countdown
      room.handleMessage(wsGuest as unknown as WebSocket, JSON.stringify({ type: 'toggle_ready', isReady: true }));
      expect(room.state).toBe('countdown');

      // Step countdown (3 seconds)
      room.step(1.0);
      expect(room.state).toBe('countdown');
      room.step(1.0);
      expect(room.state).toBe('countdown');
      room.step(1.1); // Finish countdown
      expect(room.state).toBe('in_game');
    });
  });

  describe('Authoritative Combat Simulation', () => {
    let room: MatchRoom;
    let wsHost: MockWebSocket;
    let wsGuest: MockWebSocket;
    let hostId: string;
    let guestId: string;

    beforeEach(() => {
      room = new MatchRoom('TEST02', 100, false);
      wsHost = new MockWebSocket();
      wsGuest = new MockWebSocket();

      const resHost = room.createOrJoinClient(wsHost as unknown as WebSocket, 'Shooter');
      const resGuest = room.createOrJoinClient(wsGuest as unknown as WebSocket, 'Target');
      hostId = resHost.client.id;
      guestId = resGuest.client.id;

      room.forceStartMatch();

      // Set actors to grounded state for combat tests
      const shooterActor = room.getActor(hostId)!;
      const targetActor = room.getActor(guestId)!;
      shooterActor.spawnState = 'grounded';
      shooterActor.position = [0, 0, 0];
      targetActor.spawnState = 'grounded';
      targetActor.position = [0, 0, 10]; // 10 meters directly in front
    });

    afterEach(() => {
      room.dispose();
    });

    it('enforces weapon magazine deduction and rate of fire interval', () => {
      const shooter = room.getActor(hostId)!;
      const initialMag = shooter.inventory.weapons[0].magAmmo;
      expect(initialMag).toBe(24);

      // Fire weapon facing target (direction: 0, 0, 1)
      room.handleMessage(wsHost as unknown as WebSocket, JSON.stringify({
        type: 'fire_weapon',
        weaponId: 'ranger-rifle',
        origin: [0, 1.4, 0],
        direction: [0, 0, 1],
        clientTime: Date.now()
      }));

      // Mag decreased by 1
      expect(shooter.inventory.weapons[0].magAmmo).toBe(initialMag - 1);
      // Cooldown active
      expect(shooter.fireCooldown).toBeGreaterThan(0);

      // Immediate second shot must be rejected by rate-of-fire limiter
      room.handleMessage(wsHost as unknown as WebSocket, JSON.stringify({
        type: 'fire_weapon',
        weaponId: 'ranger-rifle',
        origin: [0, 1.4, 0],
        direction: [0, 0, 1],
        clientTime: Date.now()
      }));
      expect(shooter.inventory.weapons[0].magAmmo).toBe(initialMag - 1);

      // Step simulation past fire cooldown
      room.step(shooter.fireCooldown + TICK_DELTA_SECONDS);
      expect(shooter.fireCooldown).toBe(0);

      // Now next shot succeeds
      room.handleMessage(wsHost as unknown as WebSocket, JSON.stringify({
        type: 'fire_weapon',
        weaponId: 'ranger-rifle',
        origin: [0, 1.4, 0],
        direction: [0, 0, 1],
        clientTime: Date.now()
      }));
      expect(shooter.inventory.weapons[0].magAmmo).toBe(initialMag - 2);
    });

    it('applies authoritative damage and awards eliminations', () => {
      const target = room.getActor(guestId)!;
      expect(target.health).toBe(100);

      // Fire shot landing on target
      room.handleMessage(wsHost as unknown as WebSocket, JSON.stringify({
        type: 'fire_weapon',
        weaponId: 'ranger-rifle',
        origin: [0, 1.4, 0],
        direction: [0, 0, 1],
        clientTime: Date.now()
      }));

      expect(target.health).toBeLessThan(100);

      const damageEvents = wsGuest.getMessagesOfType<DamageEventMessage>('damage_event');
      expect(damageEvents.length).toBeGreaterThan(0);
      expect(damageEvents[0].targetId).toBe(guestId);
      expect(damageEvents[0].attackerId).toBe(hostId);
    });

    it('enforces reload timing and replenishes ammo from reserve', () => {
      const shooter = room.getActor(hostId)!;
      shooter.inventory.weapons[0].magAmmo = 5;
      shooter.inventory.ammo.light = 50;

      room.handleMessage(wsHost as unknown as WebSocket, JSON.stringify({ type: 'reload' }));
      expect(shooter.reloadTimer).toBeGreaterThan(0);

      // Cannot fire during reload
      room.handleMessage(wsHost as unknown as WebSocket, JSON.stringify({
        type: 'fire_weapon',
        weaponId: 'ranger-rifle',
        origin: [0, 1.4, 0],
        direction: [0, 0, 1],
        clientTime: Date.now()
      }));
      expect(shooter.inventory.weapons[0].magAmmo).toBe(5);

      // Step through reload duration
      room.step(shooter.reloadTimer + TICK_DELTA_SECONDS);
      expect(shooter.reloadTimer).toBe(0);
      expect(shooter.inventory.weapons[0].magAmmo).toBe(24);
      expect(shooter.inventory.ammo.light).toBe(50 - (24 - 5));
    });
  });

  describe('Authoritative Building Simulation', () => {
    let room: MatchRoom;
    let ws: MockWebSocket;
    let clientId: string;

    beforeEach(() => {
      room = new MatchRoom('TEST03', 200, false);
      ws = new MockWebSocket();
      const res = room.createOrJoinClient(ws as unknown as WebSocket, 'Builder');
      clientId = res.client.id;
      room.forceStartMatch();

      const actor = room.getActor(clientId)!;
      actor.spawnState = 'grounded';
      actor.position = [0, 0, 0];
      actor.inventory.materials.wood = 60;
    });

    afterEach(() => {
      room.dispose();
    });

    it('deducts material cost and creates server build piece on valid placement', () => {
      const actor = room.getActor(clientId)!;
      expect(actor.inventory.materials.wood).toBe(60);

      room.handleMessage(ws as unknown as WebSocket, JSON.stringify({
        type: 'place_build',
        pieceType: 'wall',
        position: [0, 0, 4],
        yaw: 0
      }));

      expect(actor.inventory.materials.wood).toBe(60 - BUILD_COST);
      expect(room.getBuildCount()).toBe(1);

      const builds = room.getBuildPieces();
      expect(builds[0].pieceType).toBe('wall');
      expect(builds[0].health).toBe(220);
      expect(builds[0].ownerId).toBe(clientId);

      const buildEvents = ws.getMessagesOfType<BuildEventMessage>('build_event');
      expect(buildEvents.length).toBe(1);
      expect(buildEvents[0].action).toBe('placed');
    });

    it('rejects placement when actor has insufficient materials', () => {
      const actor = room.getActor(clientId)!;
      actor.inventory.materials.wood = 10;
      actor.inventory.materials.stone = 0;
      actor.inventory.materials.metal = 0;

      room.handleMessage(ws as unknown as WebSocket, JSON.stringify({
        type: 'place_build',
        pieceType: 'wall',
        position: [0, 0, 4],
        yaw: 0
      }));

      expect(room.getBuildCount()).toBe(0);
      expect(actor.inventory.materials.wood).toBe(10);
    });

    it('rejects placement beyond maximum build distance (> 14m)', () => {
      room.handleMessage(ws as unknown as WebSocket, JSON.stringify({
        type: 'place_build',
        pieceType: 'wall',
        position: [0, 0, 25], // 25 meters away
        yaw: 0
      }));

      expect(room.getBuildCount()).toBe(0);
    });
  });

  describe('Reconnect Recovery (45-second Grace Window)', () => {
    let room: MatchRoom;
    let ws1: MockWebSocket;
    let clientId: string;
    let token: string;

    beforeEach(() => {
      room = new MatchRoom('TEST04', 300, false);
      ws1 = new MockWebSocket();
      const res = room.createOrJoinClient(ws1 as unknown as WebSocket, 'PersistentPlayer');
      clientId = res.client.id;
      token = res.client.reconnectToken;
      room.forceStartMatch();

      const actor = room.getActor(clientId)!;
      actor.spawnState = 'grounded';
      actor.position = [15, 0, 25];
      actor.health = 85;
      actor.inventory.materials.wood = 120;
    });

    afterEach(() => {
      room.dispose();
    });

    it('reconnects within grace period preserving actor identity, health, and inventory', () => {
      // Simulate socket disconnect
      room.handleDisconnect(ws1 as unknown as WebSocket);
      expect(room.getClient(clientId)!.ws).toBeNull();
      expect(room.getClient(clientId)!.disconnectedAt).not.toBeNull();

      // Step forward 10 seconds of game time
      for (let i = 0; i < 200; i += 1) {
        room.step(0.05);
      }

      // Reconnect with same reconnectToken
      const ws2 = new MockWebSocket();
      const reconnectResult = room.createOrJoinClient(ws2 as unknown as WebSocket, 'PersistentPlayer', token);

      expect(reconnectResult.isReconnect).toBe(true);
      expect(reconnectResult.client.id).toBe(clientId);
      expect(reconnectResult.client.ws).toBe(ws2 as unknown as WebSocket);
      expect(reconnectResult.client.disconnectedAt).toBeNull();

      // Actor still exists and was not duplicated
      const actor = room.getActor(clientId)!;
      expect(actor).toBeDefined();
      expect(actor.alive).toBe(true);
      expect(actor.health).toBe(85);
      expect(actor.inventory.materials.wood).toBe(120);
      expect(actor.position[0]).toBe(15);
      expect(actor.position[2]).toBe(25);

      // Verify no duplicate actors were spawned
      const allHumanActors = room.getAllActors().filter((a) => !a.isBot);
      expect(allHumanActors.length).toBe(1);
    });

    it('eliminates actor if disconnect exceeds 45-second grace window', () => {
      room.handleDisconnect(ws1 as unknown as WebSocket);

      // Force disconnectedAt timestamp to > 45s ago
      room.getClient(clientId)!.disconnectedAt = Date.now() - 46000;

      // Step simulation
      room.step(TICK_DELTA_SECONDS);

      const actor = room.getActor(clientId)!;
      expect(actor.alive).toBe(false);
      expect(actor.health).toBe(0);
    });
  });

  describe('20-Minute Soak Simulation Test', () => {
    it('simulates 24,000 ticks (20 minutes at 20 Hz) with complete match lifecycle, storm progression, and zero NaNs', () => {
      const room = new MatchRoom('SOAK20', 9999, false);
      const wsA = new MockWebSocket();
      const wsB = new MockWebSocket();

      const { client: clientA } = room.createOrJoinClient(wsA as unknown as WebSocket, 'PlayerA');
      const { client: clientB } = room.createOrJoinClient(wsB as unknown as WebSocket, 'PlayerB');
      void clientB;

      // Start match
      room.forceStartMatch();
      expect(room.state).toBe('in_game');
      expect(room.getAllActors().length).toBe(TOTAL_MATCH_PARTICIPANTS); // 2 humans + remaining bots

      const TOTAL_TICKS = 24000; // 24,000 ticks * 0.05s = 1,200s (20 minutes)

      for (let t = 1; t <= TOTAL_TICKS; t += 1) {
        // Feed periodic input for Player A
        if (t % 10 === 0 && room.getActor(clientA.id)?.alive) {
          room.handleMessage(wsA as unknown as WebSocket, JSON.stringify({
            type: 'player_input',
            seq: t,
            move: { x: Math.sin(t * 0.01), z: Math.cos(t * 0.01) },
            yaw: (t * 0.02) % (Math.PI * 2),
            pitch: 0,
            sprint: true,
            jump: false,
            ads: false
          }));
        }

        // Simulate occasional building placement
        if (t % 500 === 0 && room.getActor(clientA.id)?.alive) {
          const actorA = room.getActor(clientA.id)!;
          if (actorA.inventory.materials.wood >= BUILD_COST) {
            room.handleMessage(wsA as unknown as WebSocket, JSON.stringify({
              type: 'place_build',
              pieceType: 'wall',
              position: [actorA.position[0], actorA.position[1], actorA.position[2] + 3],
              yaw: actorA.yaw
            }));
          }
        }

        // Advance simulation tick
        room.step(TICK_DELTA_SECONDS);

        // Periodic state integrity assertions
        if (t % 1000 === 0) {
          const storm = room.getStorm();
          expect(Number.isFinite(storm.currentRadius)).toBe(true);
          expect(Number.isFinite(storm.currentCenter[0])).toBe(true);
          expect(Number.isFinite(storm.currentCenter[2])).toBe(true);
          expect(storm.currentRadius).toBeGreaterThanOrEqual(0);

          for (const actor of room.getAllActors()) {
            expect(Number.isFinite(actor.position[0])).toBe(true);
            expect(Number.isFinite(actor.position[1])).toBe(true);
            expect(Number.isFinite(actor.position[2])).toBe(true);
            expect(Number.isFinite(actor.health)).toBe(true);
            expect(actor.health).toBeGreaterThanOrEqual(0);
          }
        }

        // Stop early if match concludes with victory
        if (room.state === 'ended') {
          break;
        }
      }

      // Verifications after simulation
      expect(room.currentTick).toBeGreaterThan(0);
      expect(room.elapsedTime).toBeGreaterThan(0);

      // Verify world snapshots were sent
      const snapshots = wsA.getMessagesOfType<WorldSnapshotMessage>('world_snapshot');
      expect(snapshots.length).toBeGreaterThan(0);

      // Clean disposal
      room.dispose();
      expect(room.activeClientCount).toBe(0);
    });
  });
});
