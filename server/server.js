import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { Chess } from 'chess.js';

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Default time controls
const DEFAULT_TIME = 300; // 5 minutes
const DEFAULT_INCREMENT = 2; // 2 seconds

const PORT = process.env.PORT || 4000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

// Store waiting players with their time preferences
const waiting = []; // [{socketId, timeControl}]
const games = new Map();

function makeRoomId() {
  return Math.random().toString(36).slice(2, 9);
}

io.on('connection', socket => {
  console.log('socket connected', socket.id);

  socket.on('join', (timeControl) => {
    // Validate time control
    const initialTime = timeControl?.time ? Math.max(30, Math.min(3600, parseInt(timeControl.time))) : DEFAULT_TIME;
    const increment = timeControl?.increment ? Math.max(0, Math.min(60, parseInt(timeControl.increment))) : DEFAULT_INCREMENT;
    
    // Remove existing entry if any
    const existingIndex = waiting.findIndex(w => w.socketId === socket.id);
    if (existingIndex !== -1) {
      waiting.splice(existingIndex, 1);
    }

    // Add to waiting queue with time preferences
    waiting.push({
      socketId: socket.id,
      timeControl: { time: initialTime, increment: increment }
    });
    console.log('waiting queue:', waiting);

    // Try to find match with same time control
    const matchIndex = waiting.findIndex(w => 
      w.socketId !== socket.id && 
      w.timeControl.time === initialTime &&
      w.timeControl.increment === increment
    );

    if (matchIndex !== -1) {
      // Found matching opponent
      const opponent = waiting[matchIndex];
      waiting.splice(matchIndex, 1);
      waiting.splice(waiting.findIndex(w => w.socketId === socket.id), 1);

      const roomId = makeRoomId();
      const chess = new Chess();

      const timePrefs = {
        initialTime,
        increment
      };

      const assignAWhite = Math.random() < 0.5;
      const players = {
        white: assignAWhite ? socket.id : opponent.socketId,
        black: assignAWhite ? opponent.socketId : socket.id
      };

      const sA = io.sockets.sockets.get(socket.id);
      const sB = io.sockets.sockets.get(opponent.socketId);
      if (sA) sA.join(roomId);
      if (sB) sB.join(roomId);

      const timers = {
        remaining: { 
          white: timePrefs.initialTime, 
          black: timePrefs.initialTime 
        },
        increment: timePrefs.increment,
        lastMoveTs: Date.now(),
        runningColor: 'white'
      };

      games.set(roomId, { chess, players, timers });

      if (sA) {
        sA.emit('paired', { 
          roomId, 
          color: assignAWhite ? 'white' : 'black', 
          fen: chess.fen(), 
          timers,
          timeControl: timePrefs 
        });
      }
      if (sB) {
        sB.emit('paired', { 
          roomId, 
          color: assignAWhite ? 'black' : 'white', 
          fen: chess.fen(), 
          timers,
          timeControl: timePrefs 
        });
      }

      console.log('paired', roomId, players, timePrefs);
    } else {
      socket.emit('waiting');
    }
  });

  socket.on('makeMove', ({ roomId, from, to, promotion }) => {
    try {
      if (typeof roomId !== 'string' || typeof from !== 'string' || typeof to !== 'string') {
        socket.emit('illegalMove', { reason: 'Invalid move payload' });
        return;
      }

      const game = games.get(roomId);
      if (!game) {
        socket.emit('illegalMove', { reason: 'No such game' });
        return;
      }

      const { chess, timers } = game;
      const now = Date.now();

      if (timers.runningColor) {
        const elapsed = Math.max(0, Math.floor((now - timers.lastMoveTs) / 1000));
        if (elapsed > 0) {
          timers.remaining[timers.runningColor] = Math.max(0, 
            Math.floor(timers.remaining[timers.runningColor] - elapsed)
          );
        }
      }

      const movingColor = chess.turn() === 'w' ? 'white' : 'black';

      if (timers.remaining[movingColor] <= 0) {
        io.to(roomId).emit('gameUpdate', {
          fen: chess.fen(),
          isGameOver: true,
          timeout: movingColor,
          winner: movingColor === 'white' ? 'black' : 'white',
          timers: JSON.parse(JSON.stringify(timers))
        });
        games.delete(roomId);
        return;
      }

      // Normalize promotion
      if (promotion) {
        promotion = String(promotion).toLowerCase();
        if (!['q', 'r', 'b', 'n'].includes(promotion)) promotion = undefined;
      }

      // Check move legality
      const legal = chess.moves({ verbose: true }).some(m =>
        m.from === from && m.to === to && (!m.promotion || m.promotion === promotion)
      );

      if (!legal) {
        socket.emit('illegalMove', { reason: 'Illegal move' });
        return;
      }

      const move = chess.move({ from, to, promotion });
      
      timers.remaining[movingColor] = Math.floor(Number(timers.remaining[movingColor]) + Number(timers.increment));
      timers.runningColor = movingColor === 'white' ? 'black' : 'white';
      timers.lastMoveTs = now;

      const payload = {
        fen: chess.fen(),
        pgn: chess.pgn(),
        move,
        isGameOver: chess.isGameOver(),
        checkmate: chess.isCheckmate(),
        draw: chess.isDraw(),
        winner: chess.isCheckmate() ? (chess.turn() === 'w' ? 'black' : 'white') : null,
        timers: JSON.parse(JSON.stringify(timers))
      };

      io.to(roomId).emit('gameUpdate', payload);
      if (payload.isGameOver) games.delete(roomId);

    } catch (err) {
      console.error('makeMove handler error:', err);
      socket.emit('illegalMove', { reason: 'Server error' });
    }
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
    const wi = waiting.findIndex(w => w.socketId === socket.id);
    if (wi !== -1) waiting.splice(wi, 1);

    for (const [roomId, game] of games.entries()) {
      const { players } = game;
      if (players.white === socket.id || players.black === socket.id) {
        const opponentId = players.white === socket.id ? players.black : players.white;
        const opp = io.sockets.sockets.get(opponentId);
        if (opp) opp.emit('opponentDisconnected');
        games.delete(roomId);
        break;
      }
    }
  });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

server.listen(PORT, () => console.log('Server listening on', PORT));