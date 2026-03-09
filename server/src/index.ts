import express from 'express';
import { createServer } from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@mmw/shared';
import { RoomManager } from './game/RoomManager.js';
import { registerHandlers } from './socket/handlers.js';
import narratorRoutes from './api/narratorRoutes.js';

const app = express();
app.use(express.json());
const httpServer = createServer(app);

const isProd = process.env.NODE_ENV === 'production';

const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
  cors: isProd
    ? undefined
    : {
        origin: ['http://localhost:5173', 'http://localhost:4173'],
        methods: ['GET', 'POST'],
      },
});

const roomManager = new RoomManager({
  broadcastToRoom: (roomCode: string, event: string, data: unknown) => {
    io.to(roomCode).emit(event as keyof ServerToClientEvents, data as never);
  },
  emitToPlayer: (playerId: string, event: string, data: unknown) => {
    io.to(playerId).emit(event as keyof ServerToClientEvents, data as never);
  },
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/narrator', narratorRoutes);

registerHandlers(io, roomManager);

if (isProd) {
  const clientDist = join(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  roomManager.destroy();
  httpServer.close();
});
