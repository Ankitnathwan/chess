# ♟️ Real-Time Multiplayer Chess Web Application
A lightweight, browser-based multiplayer chess application built with the MERN stack (minus MongoDB for this version) and Socket.io. This project demonstrates full-stack development with a focus on bidirectional, low-latency communication for instant move synchronization.

# 📖 About
This application allows two players to join a virtual chess room and compete live. Unlike traditional server-polling chess apps, this project utilizes WebSockets to push updates instantly to clients. The system validates legal chess moves, maintains turn-based logic, and handles user disconnections gracefully without the need for a database in the current version.

# ✨ Features
Real-time Gameplay: Instant move updates via Socket.io.\
Multiplayer Matching: Room-based system for 1v1 connection.\
Move Validation: integrated logic to enforce valid chess rules and legal moves.\
Game State Management: Automatic detection of checkmate, resignation, or draw.\
Time Controls: Supports different time settings for various playstyles.\
Disconnect Handling: Robust handling of player dropouts and reconnections.\
Responsive UI: Clean interface built with React, usable on desktop browsers.

# 🛠️ Technology Stack
Component          Technology  
Frontend           React.js, HTML5, CSS3  
Backend            Node.js, Express.js  
Real-time          EngineSocket.io (WebSockets)  
State Management   React Hooks / Local State  
Deployment         Render  

# 🏗️ System Architecture
The application follows an event-driven architecture. The backend does not persist data to a database; all active game states are held in the server's memory for optimal speed during the match.\
\
Data Flow: [Player A] ⇄ [React UI] ⇄ [Socket] ⇄ [Node Server] ⇄ [Socket] ⇄ [React UI] ⇄ [Player B]
\
Connection: Player connects and joins a specific room (Lobby/Game).
\
Pairing: Server pairs players and initializes the board.

# Gameplay:
Player makes a move.  

Client emits move event to Server.  

Server validates move.  

Server broadcasts update to both clients.  

Termination: Game ends via Checkmate, Resignation, or Disconnection.  
  
# 🔌 Socket.io Events API
Here are the primary events used for client-server communication:  
**Event Name** -------- **Direction**-----------**Description**  
connection -------- Client → Server ---- Triggered when a new user visits the site.\
joinRoom ---------- Client → Server ---- Player requests to join a specific game lobby.\
move -------------- Client → Server ---- Contains the source and target coordinates of a chess piece.\
updateBoard ------- Server → Client ---- Broadcasts the new board state to both players.\
gameOver ---------- Server → Client ---- Emitted on checkmate or resignation.\
playerDisconnected--Server → Client ---- Notifies the remaining player that their opponent has left.

# 🚀 Getting Started
Play here: https://multiplayer-chess-2w3q.onrender.com/

**OR**

Follow these steps to run the project locally.

**Prerequisites**  
Node.js (v14+ recommended)
npm or yarn

**Installation**
1. Clone the repository
    git clone https://github.com/Ankitnathwan/chess.git
    cd chess
3. Install Server Dependencies
    cd server
    npm install
4. Install Client Dependencies
    cd ../client
    npm install
5. Run the Application You will likely need two terminals.

    Terminal 1 (Server): npm start
    Terminal 2 (Client): npm run dev

Open in Browser Navigate to http://localhost:5173. Open a second tab to simulate the second player.

# 🔮 Future Roadmap
1. AI Integration: Add a single-player mode against a Stockfish-based engine.
2. User Accounts: Implement Auth0 or JWT for user login and Elo ratings.
3. Database: Persist match history and user stats (MongoDB/PostgreSQL).
4. Spectator Mode: Allow others to watch live games without interacting.
5. Mobile Optimization: Improved touch controls for mobile devices.

