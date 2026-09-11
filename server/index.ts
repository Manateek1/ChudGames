import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { RoomManager } from './roomManager.ts';
import type { ClientMessage } from './protocol.ts';

const PORT = Number(process.env.PORT || 8080);
const roomManager = new RoomManager();

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'FortLite Dedicated Match Server',
      activeRooms: roomManager.roomCount,
      time: new Date().toISOString()
    }));
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  let currentRoom: ReturnType<typeof roomManager.getRoom> | null = null;

  ws.on('message', (data: Buffer | string) => {
    const raw = data.toString();

    // If not yet in a room, listen for create_room or join_room
    if (!currentRoom) {
      try {
        const msg = JSON.parse(raw) as ClientMessage;
        if (msg.type === 'create_room') {
          const room = roomManager.createRoom();
          currentRoom = room;
          const { client } = room.createOrJoinClient(ws, msg.playerName);
          ws.send(JSON.stringify({
            type: 'room_created',
            roomCode: room.roomCode,
            playerId: client.id,
            reconnectToken: client.reconnectToken,
            isHost: true
          }));
          return;
        }

        if (msg.type === 'join_room') {
          const room = roomManager.getRoom(msg.roomCode);
          if (!room) {
            ws.send(JSON.stringify({
              type: 'error',
              code: 'ROOM_NOT_FOUND',
              message: `Room code ${msg.roomCode} was not found or has expired.`
            }));
            return;
          }

          if (!room.canAcceptClient(msg.reconnectToken)) {
            ws.send(JSON.stringify({
              type: 'error',
              code: 'ROOM_FULL',
              message: 'This match is full. FortLite supports up to 50 players.'
            }));
            return;
          }

          currentRoom = room;
          const { client } = room.createOrJoinClient(ws, msg.playerName, msg.reconnectToken);
          ws.send(JSON.stringify({
            type: 'room_joined',
            roomCode: room.roomCode,
            playerId: client.id,
            reconnectToken: client.reconnectToken,
            isHost: client.isHost,
            players: []
          }));
          return;
        }
      } catch {
        ws.send(JSON.stringify({
          type: 'error',
          code: 'INVALID_JSON',
          message: 'Malformed request.'
        }));
        return;
      }
    }

    // Pass message to active room
    if (currentRoom) {
      currentRoom.handleMessage(ws, raw);
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      currentRoom.handleDisconnect(ws);
    }
  });

  ws.on('error', (err) => {
    console.error('[WebSocket Error]', err);
    if (currentRoom) {
      currentRoom.handleDisconnect(ws);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[FortLite Match Server] Running on http://localhost:${PORT} (WebSocket ready)`);
});

process.on('SIGINT', () => {
  roomManager.dispose();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  roomManager.dispose();
  server.close(() => process.exit(0));
});
