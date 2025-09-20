import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Chess } from 'chess.js';
import path from 'path'; // 👈 1. Import the path module
import { fileURLToPath } from 'url'; // 👈 Needed for ES modules (import)

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

const PORT = process.env.PORT || 4000;

// 👇 2. Define __dirname for ES Modules (This is CRUCIAL)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 👇 3. Serve static files from the React build directory
// This line makes Express serve files like:
// /static/js/main.x123y.js -> build/static/js/main.x123y.js
// /pieces/wP.svg -> build/pieces/wP.svg
app.use(express.static(path.join(__dirname, 'build')));

const waiting = [];  // waiting queue of socket IDs
// Map of roomId -> { chess: Chess(), players: { white, black } }
const games = new Map();

// 👇 4. Your API and Socket.io routes go here as normal
// This is where your backend logic lives
io.on('connection', socket => {
    console.log('socket connected', socket.id);

    // Player joins the queue
    socket.on('join', () => {
        console.log('join from', socket.id);

        if (waiting.length > 0) {
            const opponentId = waiting.shift();
            const roomId = `room-${socket.id}-${opponentId}`;
            socket.join(roomId);
            io.sockets.sockets.get(opponentId)?.join(roomId);

            const chess = new Chess();
            const white = opponentId;  // first waiting gets white
            const black = socket.id;   // new player gets black
            games.set(roomId, { chess, players: { white, black } });

            // Notify both players
            io.to(white).emit('paired', { roomId, color: 'white', fen: chess.fen(), pgn: chess.pgn() });
            io.to(black).emit('paired', { roomId, color: 'black', fen: chess.fen(), pgn: chess.pgn() });

            console.log(`Game started in ${roomId}`);
        } else {
            waiting.push(socket.id);
            socket.emit('waiting');
        }
    });

    // Handle moves
    socket.on('makeMove', ({ roomId, from, to, promotion }) => {
        const game = games.get(roomId);
        if (!game) return;

        const { chess, players } = game;
        const move = chess.move({ from, to, promotion });

        if (move) {
            // Broadcast updated state
            io.to(roomId).emit('gameUpdate', {
                fen: chess.fen(),
                pgn: chess.pgn(),
                move
            });
        } else {
            // Invalid move attempt
            socket.emit('invalidMove', { from, to, promotion });
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('socket disconnected', socket.id);

        // Remove from waiting queue if still waiting
        const idx = waiting.indexOf(socket.id);
        if (idx !== -1) {
            waiting.splice(idx, 1);
        }

        // Find any game the player was in
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

// 👇 5. The Catch-All Handler: Send React's index.html for all other requests.
// This MUST be the last route defined.
// It allows client-side routing (e.g., React Router) to work.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// ✅ Start server ONCE here
server.listen(PORT, () => console.log('Server listening on', PORT));