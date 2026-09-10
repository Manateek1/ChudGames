import { MatchRoom } from './matchRoom.ts';
import { generateRandomRoomCode } from './protocol.ts';

export class RoomManager {
  private rooms = new Map<string, MatchRoom>();
  private cleanupTimer: NodeJS.Timeout;

  constructor() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleRooms();
    }, 60000);
  }

  createRoom(seed?: number): MatchRoom {
    let attempts = 0;
    let code = generateRandomRoomCode();
    while (this.rooms.has(code) && attempts < 100) {
      code = generateRandomRoomCode();
      attempts += 1;
    }

    const room = new MatchRoom(code, seed);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(roomCode: string): MatchRoom | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  removeRoom(roomCode: string): void {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (room) {
      room.dispose();
      this.rooms.delete(roomCode.toUpperCase());
    }
  }

  private cleanupStaleRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms.entries()) {
      const isOld = now - room.createdAt > 3600000; // 1 hour
      const isEmpty = room.activeClientCount === 0 && (now - room.createdAt > 300000);
      const isEnded = room.state === 'ended' && room.activeClientCount === 0;

      if (isOld || isEmpty || isEnded) {
        room.dispose();
        this.rooms.delete(code);
      }
    }
  }

  dispose(): void {
    clearInterval(this.cleanupTimer);
    for (const room of this.rooms.values()) {
      room.dispose();
    }
    this.rooms.clear();
  }

  get roomCount(): number {
    return this.rooms.size;
  }
}
