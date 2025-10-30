import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { Chess } from 'chess.js';

export default function App() {
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState('disconnected');
  const [color, setColor] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [fen, setFen] = useState(null);
  const chessRef = useRef(new Chess());
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [gameMessage, setGameMessage] = useState('');

  // sound refs (place sound files in client/public/sounds/)
  const moveAudio = useRef(new Audio('/sounds/move-self.mp3'));
  const captureAudio = useRef(new Audio('/sounds/capture.mp3'));
  const illegalAudio = useRef(new Audio('/sounds/illegal.mp3'));
  const checkAudio = useRef(new Audio('/sounds/move-check.mp3'));
  const checkmateAudio = useRef(new Audio('/sounds/checkmate.mp3'));
  const castlingAudio = useRef(new Audio('/sounds/castle.mp3'));
  const gameStartAudio = useRef(new Audio('/sounds/game-start.mp3'));
  const opponentTurnAudio = useRef(new Audio('/sounds/illegal.mp3'));
  const promotionAudio = useRef(new Audio('/sounds/promote.mp3'));
  const drawAudio = useRef(new Audio('/sounds/game-draw.mp3'));

  const playSound = useCallback((soundRef) => {
    try {
      const s = soundRef.current;
      if (!s) return;
      s.currentTime = 0;
      const p = s.play();
      if (p && p.catch) p.catch(() => { /* autoplay blocked until user gesture */ });
    } catch (e) {
      console.error('playSound error', e);
    }
  }, []);

  // preload sounds
  useEffect(() => {
    [
      moveAudio, captureAudio, illegalAudio, checkAudio, checkmateAudio,
      castlingAudio, gameStartAudio, opponentTurnAudio, promotionAudio, drawAudio
    ].forEach(ref => {
      try {
        if (ref.current) {
          ref.current.preload = 'auto';
          ref.current.load();
        }
      } catch (e) { /* ignore */ }
    });
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('connect', () => {
      setStatus('connected');
      console.log('Connected to server');
    });
    
    socket.on('waiting', () => {
      setStatus('waiting');
      console.log('Waiting for opponent');
    });
    
    socket.on('paired', data => {
      setRoomId(data.roomId);
      setColor(data.color);
      chessRef.current.load(data.fen);
      setFen(data.fen);
      setStatus('paired');
      setGameMessage('');
      console.log('Paired with opponent', data);
      // play game start sound
      playSound(gameStartAudio);
    });
    
    socket.on('gameUpdate', data => {
      console.log("Received full gameUpdate:", JSON.stringify(data, null, 2));
      if (data.fen) chessRef.current.load(data.fen);
      setFen(data.fen);
      setSelectedSquare(null);
      setLegalMoves([]);

      // play move/capture sound (and handle promotion/castling)
      if (data.move) {
        // promotion
        if (data.move.promotion) {
          playSound(promotionAudio);
        }

        // castling detection: SAN often contains "O-O" or flags may include 'k'/'q'
        const san = data.move.san || '';
        const flags = data.move.flags || '';
        const isCastling = san.startsWith('O-O') || /[kq]/.test(flags);
        if (isCastling) {
          playSound(castlingAudio);
        } else if (data.move.captured) {
          playSound(captureAudio);
        } else {
          playSound(moveAudio);
        }
      }

      // game state sounds and messages
      if (data.isGameOver) {
        if (data.checkmate) {
          setGameMessage(`Checkmate! Winner: ${data.winner || ''}`);
          playSound(checkmateAudio);
        } else if (data.draw) {
          setGameMessage('Draw');
          playSound(drawAudio);
        } else {
          setGameMessage('Game Over');
        }
      } else if (chessRef.current.inCheck()) {
        setGameMessage("Check!");
        playSound(checkAudio);
      } else {
        setGameMessage('');
      }
    });
    
    socket.on('illegalMove', ({ reason }) => {
      setGameMessage('Illegal move: ' + reason);
      playSound(illegalAudio);
      console.log('Illegal move', reason);
    });
    
    socket.on('opponentDisconnected', () => {
      setGameMessage('Opponent disconnected.');
      console.log('Opponent disconnected');
    });

    socket.on('disconnect', () => {
      setStatus('disconnected');
      setGameMessage('');
      console.log('Disconnected from server');
    });

    return () => {
      if (socket) socket.disconnect();
    };
  }, [socket, playSound]);

  useEffect(() => {
    if (fen) chessRef.current.load(fen);
  }, [fen]);

  useEffect(() => {
    console.log('Connecting to server...');
    setStatus('connecting');
    
    const s = io(import.meta.env.PROD 
      ? "https://multiplayer-chess-2w3q.onrender.com"
      : "http://localhost:4000", {
      transports: ['websocket']
    });

    s.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setStatus('disconnected');
      setGameMessage('Failed to connect to server. Please try again.');
    });

    setSocket(s);

    return () => {
      if (s) s.disconnect();
    };
  }, []);

  function renderBoard() {
    if (!chessRef.current.board()) return null;
    
    const board = chessRef.current.board();
    const size = Math.min(
      Math.min(window.innerWidth * 0.9, window.innerHeight * 0.8) / 8,
      60
    );

    const displayBoard = color === 'white' ? board : [...board].reverse().map(row => [...row].reverse());
    
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8','7','6','5','4','3','2','1'];
    const fileLabels = color === 'white' ? files : [...files].reverse();
    const rankLabels = color === 'white' ? ranks : [...ranks].reverse();

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'white' }}>
        <div style={{ display: 'flex', gap: 5 }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: size * 8 }}>
            {rankLabels.map((r, idx) => (
              <div key={idx} style={{ height: size, lineHeight: `${size}px`, textAlign: 'center', fontWeight: 'bold' }}>
                {r}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(8, ${size}px)` }}>
            {displayBoard.flat().map((square, idx) => {
              const row = Math.floor(idx / 8);
              const col = idx % 8;
              const actualRow = color === 'white' ? row : 7 - row;
              const actualCol = color === 'white' ? col : 7 - col;
              const sq = String.fromCharCode(97 + actualCol) + (8 - actualRow);
              const isLight = (actualRow + actualCol) % 2 === 0;
              const baseColor = isLight ? '#f0d9b5' : '#b58863';
              const isSelected = selectedSquare === sq;
              const isLegal = legalMoves.includes(sq);
              const bgColor = isSelected ? 'yellow' : isLegal ? 'lightgreen' : baseColor;

              return (
                <div
                  key={idx}
                  onClick={() => handleSquareClick(sq)}
                  onTouchStart={(e) => {
                    e.preventDefault(); // Prevent zoom
                    handleSquareClick(sq);
                  }}
                  style={{
                    width: size,
                    height: size,
                    background: bgColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  {square && (
                    <img
                      src={`/pieces/${square.color}${square.type}.svg`}
                      alt={`${square.color}${square.type}`}
                      style={{ width: size * 0.8, height: size * 0.8 }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(8, ${size}px)`, marginTop: 2 }}>
          {fileLabels.map((f, idx) => (
            <div key={idx} style={{ textAlign: 'center', fontWeight: 'bold', fontSize: size / 5 }}>
              {f}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function handleSquareClick(square) {
    if (!socket || status !== 'paired') return;
    
    const currentPlayerTurn = chessRef.current.turn() === (color === 'white' ? 'w' : 'b');
    if (!currentPlayerTurn) {
      setGameMessage("It's not your turn!");
      playSound(opponentTurnAudio); // play sound when attempting to move on opponent's turn
      return;
    }

    if (selectedSquare) {
      if (legalMoves.includes(square)) {
        socket.emit('makeMove', { roomId, from: selectedSquare, to: square });
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }
    }

    const piece = chessRef.current.get(square);
    if (piece && ((color === 'white' && piece.color === 'w') || (color === 'black' && piece.color === 'b'))) {
      setSelectedSquare(square);
      const moves = chessRef.current.moves({ square, verbose: true }).map(m => m.to);
      setLegalMoves(moves);
    } else {
      setSelectedSquare(null);
      setLegalMoves([]);
    }
  }

  return (
    <div style={{ 
      padding: '20px',
      fontFamily: 'sans-serif',
      color: 'white',
      backgroundColor: '#282c34',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        <h1 style={{ 
          fontSize: 'clamp(20px, 4vw, 24px)',
          textAlign: 'center' 
        }}>Multiplayer Chess ♟️</h1>
        
        <p style={{ textAlign: 'center' }}>
          Status: {status} {color ? ` — you are ${color}` : ''}
        </p>
        
        {gameMessage && (
          <div style={{ 
            background: '#222',
            color: 'yellow',
            padding: '10px',
            margin: '10px auto',
            borderRadius: '4px',
            maxWidth: '400px',
            textAlign: 'center'
          }}>
            {gameMessage}
          </div>
        )}
        
        {status === 'connected' && (
          <div style={{ textAlign: 'center' }}>
            <button 
              onClick={() => socket.emit('join')}
              style={{
                padding: '10px 20px',
                fontSize: '16px',
                cursor: 'pointer',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: '#4CAF50',
                color: 'white'
              }}
            >
              Join a game
            </button>
          </div>
        )}
        
        {status === 'connecting' && (
          <div style={{ textAlign: 'center' }}>Connecting to server...</div>
        )}
        
        {status === 'waiting' && (
          <div style={{ textAlign: 'center' }}>Waiting for opponent...</div>
        )}
        
        {status === 'paired' && (
          <div style={{ 
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            alignItems: 'center'
          }}>
            <div>{renderBoard()}</div>
            <div style={{
              background: '#222',
              padding: '15px',
              borderRadius: '4px',
              fontSize: 'clamp(14px, 2vw, 16px)',
              width: '100%',
              maxWidth: '400px'
            }}>
              <p>Room: {roomId}</p>
              <p style={{ wordBreak: 'break-all' }}>FEN: {fen}</p>
              <p>Selected: {selectedSquare}</p>
              <p>Legal moves: {legalMoves.join(', ')}</p>
              <p>Controls: click your piece, then click target square.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}