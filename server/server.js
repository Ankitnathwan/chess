import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Chess } from 'chess.js';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

const PORT = process.env.PORT || 4000;

// Define __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from Vite build directory
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

const waiting = [];  // waiting queue of socket IDs
const games = new Map();

io.on('connection', socket => {
    console.log('socket connected', socket.id);

    socket.on('join', () => {
        console.log('join from', socket.id);

        if (waiting.length > 0) {
            const opponentId = waiting.shift();
            const roomId = `room-${socket.id}-${opponentId}`;
            socket.join(roomId);
            io.sockets.sockets.get(opponentId)?.join(roomId);

            const chess = new Chess();
            const white = opponentId;
            const black = socket.id;
            games.set(roomId, { chess, players: { white, black } });

            io.to(white).emit('paired', { roomId, color: 'white', fen: chess.fen(), pgn: chess.pgn() });
            io.to(black).emit('paired', { roomId, color: 'black', fen: chess.fen(), pgn: chess.pgn() });

            console.log(`Game started in ${roomId}`);
        } else {
            waiting.push(socket.id);
            socket.emit('waiting');
        }
    });

    socket.on('makeMove', ({ roomId, from, to, promotion }) => {
        const game = games.get(roomId);
        if (!game) {
            console.log('makeMove: no game for room', roomId);
            return;
        }

        const { chess, players } = game;
        const move = chess.move({ from, to, promotion });

        if (move) {
            console.log('=== CHESS.JS GAME STATE ===');
        console.log('isGameOver():', chess.isGameOver());
        console.log('isCheckmate():', chess.isCheckmate());
        console.log('isDraw():', chess.isDraw());
        console.log('turn():', chess.turn());
        console.log('move.san:', move.san);
        console.log('==========================');
            const isGameOver = chess.isGameOver();
            const isCheckmate = chess.isCheckmate();
            const isDraw = chess.isDraw();
            let winner = null;
            if (isCheckmate) {
                // winner is the player who just moved (opposite of current turn)
                winner = chess.turn() === 'w' ? 'black' : 'white';
            }

            const payload = {
                fen: chess.fen(),
                pgn: chess.pgn(),
                move,
                isGameOver,
                checkmate: isCheckmate,
                draw: isDraw,
                winner
            };

            console.log('FULL gameUpdate payload:', JSON.stringify(payload, null, 2))
            io.to(roomId).emit('gameUpdate', payload);
        } else {
            console.log('illegal move attempt', { roomId, from, to, promotion });
            socket.emit('illegalMove', { reason: 'Illegal move' });
        }
    });

    socket.on('disconnect', () => {
        console.log('socket disconnected', socket.id);

        const idx = waiting.indexOf(socket.id);
        if (idx !== -1) {
            waiting.splice(idx, 1);
        }

        for (const [roomId, game] of games.entries()) {
            const { players } = game;
            if (players.white === socket.id || players.black === socket.id) {
                io.to(roomId).emit('opponentDisconnected');
                games.delete(roomId);
                console.log(`Game in ${roomId} ended due to disconnect`);
                break;
            }
        }
    });
});

// FIXED: Use app.use instead of app.get('*') to avoid path-to-regexp error
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

server.listen(PORT, () => console.log('Server listening on', PORT));