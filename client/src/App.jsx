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
  const [promotionPending, setPromotionPending] = useState(null);

  // Time control state
  const [timeControl, setTimeControl] = useState({
    time: 300,  // 5 minutes
    increment: 2 // 2 seconds
  });
  const [timers, setTimers] = useState({
    remaining: { white: 300, black: 300 },
    increment: 2,
    runningColor: null,
    lastMoveTs: Date.now()
  });
  const [displayRemaining, setDisplayRemaining] = useState({ white: 300, black: 300 });

  // Sound refs
  const moveAudio = useRef(new Audio('/sounds/move-self.mp3'));
  const captureAudio = useRef(new Audio('/sounds/capture.mp3'));
  const illegalAudio = useRef(new Audio('/sounds/illegal.mp3'));
  const checkAudio = useRef(new Audio('/sounds/move-check.mp3'));
  const checkmateAudio = useRef(new Audio('/sounds/checkmate.mp3'));
  const castlingAudio = useRef(new Audio('/sounds/castle.mp3'));
  const gameStartAudio = useRef(new Audio('/sounds/game-start.mp3'));
  const opponentTurnAudio = useRef(new Audio('/sounds/opponent-turn.mp3'));
  const promotionAudio = useRef(new Audio('/sounds/promotion.mp3'));
  const drawAudio = useRef(new Audio('/sounds/draw.mp3'));

  // Drag/drop refs
  const draggedPieceRef = useRef(null);
  const sourceSquareRef = useRef(null);

  const playSound = useCallback((soundRef) => {
    try {
      const s = soundRef.current;
      if (!s) return;
      s.currentTime = 0;
      const p = s.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignore */ }
  }, []);

  // Preload sounds
  useEffect(() => {
    [moveAudio, captureAudio, illegalAudio, checkAudio, checkmateAudio,
     castlingAudio, gameStartAudio, opponentTurnAudio, promotionAudio, drawAudio
    ].forEach(ref => {
      try {
        if (ref.current) {
          ref.current.preload = 'auto';
          ref.current.load();
        }
      } catch (e) {}
    });
  }, []);

  // Socket connection
  useEffect(() => {
    const connectSocket = () => {
      setStatus('connecting');
      const s = io(import.meta.env.PROD 
        ? window.location.origin 
        : "http://localhost:4000", {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });

      s.on('connect_error', (error) => {
        console.error('Connection error:', error);
        setStatus('disconnected');
        setGameMessage('Connection lost. Trying to reconnect...');
      });

      setSocket(s);
      return () => {
        if (s) {
          s.removeAllListeners();
          s.disconnect();
        }
      };
    };

    connectSocket();
  }, []);

  // Socket events
  useEffect(() => {
    if (!socket) return;

    socket.on('connect', () => setStatus('connected'));
    socket.on('waiting', () => setStatus('waiting'));

    socket.on('paired', data => {
      setRoomId(data.roomId);
      setColor(data.color);
      chessRef.current.load(data.fen);
      setFen(data.fen);
      setStatus('paired');
      setGameMessage('');
      if (data.timers) {
        setTimers(data.timers);
        setDisplayRemaining(data.timers.remaining);
      }
      playSound(gameStartAudio);
    });

    socket.on('gameUpdate', data => {
      if (data.fen) chessRef.current.load(data.fen);
      setFen(data.fen);
      setSelectedSquare(null);
      setLegalMoves([]);

      if (data.move) {
        if (data.move.promotion) playSound(promotionAudio);
        const san = data.move.san || '';
        const flags = data.move.flags || '';
        const isCastling = san.startsWith('O-O') || /[kq]/.test(flags);
        if (isCastling) playSound(castlingAudio);
        else if (data.move.captured) playSound(captureAudio);
        else playSound(moveAudio);
      }

      if (data.timers) {
        setTimers(data.timers);
        setDisplayRemaining(data.timers.remaining);
      }

      if (data.isGameOver) {
        if (data.checkmate) {
          setGameMessage(`Checkmate! Winner: ${data.winner || ''}`);
          playSound(checkmateAudio);
        } else if (data.draw) {
          setGameMessage('Draw');
          playSound(drawAudio);
        } else if (data.timeout) {
          setGameMessage(`Timeout: ${data.timeout}`);
        } else {
          setGameMessage('Game Over');
        }
      } else if (chessRef.current.inCheck()) {
        setGameMessage('Check!');
        playSound(checkAudio);
      } else {
        setGameMessage('');
      }
    });

    socket.on('illegalMove', ({ reason }) => {
      setGameMessage('Illegal move: ' + reason);
      playSound(illegalAudio);
    });

    socket.on('opponentDisconnected', () => {
      setGameMessage('Opponent disconnected.');
    });

    socket.on('disconnect', () => {
      setStatus('disconnected');
      setGameMessage('');
    });

    return () => socket.removeAllListeners();
  }, [socket, playSound]);

  // Timer tick effect
  useEffect(() => {
    const id = setInterval(() => {
      setDisplayRemaining(prev => {
        if (!timers || !timers.runningColor) return prev;
        const elapsed = Math.floor((Date.now() - timers.lastMoveTs) / 1000);
        const rc = timers.runningColor;
        const newRem = { ...timers.remaining };
        newRem[rc] = Math.max(0, timers.remaining[rc] - elapsed);
        return newRem;
      });
    }, 250);
    return () => clearInterval(id);
  }, [timers]);

  // Time control selector component
  function TimeControlSelector() {
    const commonStyles = {
      padding: '8px 12px',
      margin: '4px',
      borderRadius: '4px',
      border: '1px solid #4CAF50',
      background: 'transparent',
      color: 'white',
      cursor: 'pointer'
    };

    const presets = [
      { name: "1 min", time: 60, increment: 0 },
      { name: "3 min", time: 180, increment: 0 },
      { name: "5 min", time: 300, increment: 0 },
      { name: "10 min", time: 600, increment: 0 },
      { name: "3|2", time: 180, increment: 2 },
      { name: "5|2", time: 300, increment: 2 },
      { name: "10|5", time: 600, increment: 5 },
    ];

    return (
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <h3>Select Time Control</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
          {presets.map((preset) => (
            <button
              key={`${preset.time}-${preset.increment}`}
              onClick={() => setTimeControl(preset)}
              style={{
                ...commonStyles,
                background: timeControl.time === preset.time && 
                           timeControl.increment === preset.increment ? '#4CAF50' : 'transparent'
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
        <div style={{ marginTop: '10px', fontSize: '0.9em', opacity: 0.8 }}>
          Selected: {Math.floor(timeControl.time / 60)} minutes 
          {timeControl.increment > 0 ? ` + ${timeControl.increment}s` : ''}
        </div>
      </div>
    );
  }

  // Helper functions
  const formatTime = (seconds) => {
    const s = Math.max(0, Number(seconds || 0));
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = Math.floor(s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const coordToSquare = (row, col) => `${String.fromCharCode(97 + col)}${8 - row}`;

  const emitMove = (from, to, promotion) => {
    if (!socket || !roomId) return;
    socket.emit('makeMove', { roomId, from, to, promotion });
  };

  const isPromotionMove = (from, to) => {
    const piece = chessRef.current.get(from);
    if (!piece || piece.type !== 'p') return false;
    const toRank = parseInt(to[1], 10);
    return (piece.color === 'w' && toRank === 8) || (piece.color === 'b' && toRank === 1);
  };

  const handleDropMove = (fromSq, toSq) => {
    if (isPromotionMove(fromSq, toSq)) setPromotionPending({ from: fromSq, to: toSq });
    else emitMove(fromSq, toSq);
    sourceSquareRef.current = null;
    draggedPieceRef.current = null;
  };

  function renderBoard() {
    if (!chessRef.current.board()) return null;
    const board = chessRef.current.board();
    const size = Math.min(Math.min(window.innerWidth * 0.9, window.innerHeight * 0.8) / 8, 60);
    const displayBoard = color === 'white' ? board : [...board].reverse().map(row => [...row].reverse());
    const files = ['a','b','c','d','e','f','g','h'];
    const ranks = ['8','7','6','5','4','3','2','1'];
    const fileLabels = color === 'white' ? files : [...files].reverse();
    const rankLabels = color === 'white' ? ranks : [...ranks].reverse();

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'white' }}>
        <div style={{ display: 'flex', gap: 5 }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: size * 8 }}>
            {rankLabels.map((r, idx) => (
              <div key={idx} style={{ height: size, lineHeight: `${size}px`, textAlign: 'center', fontWeight: 'bold' }}>{r}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(8, ${size}px)` }}>
            {displayBoard.flat().map((square, idx) => {
              const row = Math.floor(idx / 8);
              const col = idx % 8;
              const actualRow = color === 'white' ? row : 7 - row;
              const actualCol = color === 'white' ? col : 7 - col;
              const sq = coordToSquare(actualRow, actualCol);
              const isLight = (actualRow + actualCol) % 2 === 0;
              const baseColor = isLight ? '#f0d9b5' : '#b58863';
              const isSelected = selectedSquare === sq;
              const isLegal = legalMoves.includes(sq);
              const bgColor = isSelected ? 'yellow' : isLegal ? 'lightgreen' : baseColor;
              const piece = square;
              const draggable = piece && status === 'paired' &&
                ((color === 'white' && piece.color === 'w') || (color === 'black' && piece.color === 'b'));

              return (
                <div
                  key={idx}
                  data-square={sq}
                  onClick={() => handleSquareClick(sq)}
                  onTouchStart={(e) => {
                    if (e.touches && e.touches.length === 1) {
                      e.preventDefault();
                      handleSquareClick(sq);
                      const pieceAt = chessRef.current.get(sq);
                      if (pieceAt && draggable) { sourceSquareRef.current = sq; draggedPieceRef.current = true; }
                    }
                  }}
                  onTouchEnd={(e) => {
                    if (!sourceSquareRef.current) return;
                    const touch = e.changedTouches[0];
                    const el = document.elementFromPoint(touch.clientX, touch.clientY);
                    let targetEl = el;
                    while (targetEl && !targetEl.dataset?.square) targetEl = targetEl.parentElement;
                    if (targetEl && targetEl.dataset?.square) {
                      const targetSq = targetEl.dataset.square;
                      if (sourceSquareRef.current !== targetSq) handleDropMove(sourceSquareRef.current, targetSq);
                    }
                    sourceSquareRef.current = null;
                    draggedPieceRef.current = null;
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!sourceSquareRef.current) return;
                    if (sourceSquareRef.current !== sq) handleDropMove(sourceSquareRef.current, sq);
                  }}
                  style={{
                    width: size, height: size, background: bgColor, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent'
                  }}
                >
                  {piece && (
                    <div
                      draggable={!!draggable}
                      onDragStart={(e) => {
                        if (!draggable) { e.preventDefault(); return; }
                        draggedPieceRef.current = piece;
                        sourceSquareRef.current = sq;
                        try { e.dataTransfer.setData('text/plain', ''); } catch {}
                      }}
                      onDragEnd={() => { draggedPieceRef.current = null; sourceSquareRef.current = null; }}
                      style={{ width: size * 0.9, height: size * 0.9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <img
                        src={`/pieces/${piece.color}${piece.type}.svg`}
                        alt={`${piece.color}${piece.type}`}
                        style={{ width: size * 0.8, height: size * 0.8, pointerEvents: 'none', userSelect: 'none' }}
                        draggable={false}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(8, ${size}px)`, marginTop: 2 }}>
          {fileLabels.map((f, idx) => (
            <div key={idx} style={{ textAlign: 'center', fontWeight: 'bold', fontSize: size / 5 }}>{f}</div>
          ))}
        </div>
      </div>
    );
  }

  // Update handleSquareClick function
function handleSquareClick(square) {
  if (!socket || status !== 'paired') {
    setGameMessage('Not connected to game');
    return;
  }

  // Clear validation
  const currentPlayerTurn = chessRef.current.turn() === (color === 'white' ? 'w' : 'b');
  if (!currentPlayerTurn) {
    setGameMessage("It's not your turn!");
    playSound(opponentTurnAudio);
    setSelectedSquare(null);
    setLegalMoves([]);
    return;
  }

  // If a square was previously selected
  if (selectedSquare) {
    if (legalMoves.includes(square)) {
      if (isPromotionMove(selectedSquare, square)) {
        setPromotionPending({ from: selectedSquare, to: square });
      } else {
        emitMove(selectedSquare, square);
      }
      setSelectedSquare(null);
      setLegalMoves([]);
      return;
    }
    // If clicking same square, deselect
    if (selectedSquare === square) {
      setSelectedSquare(null);
      setLegalMoves([]);
      return;
    }
  }

  // Selecting a new piece
  const piece = chessRef.current.get(square);
  if (piece && ((color === 'white' && piece.color === 'w') || 
                (color === 'black' && piece.color === 'b'))) {
    setSelectedSquare(square);
    const moves = chessRef.current.moves({ 
      square, 
      verbose: true 
    }).map(m => m.to);
    setLegalMoves(moves);
  } else {
    setSelectedSquare(null);
    setLegalMoves([]);
  }
}

// Add cleanup effect for game state
useEffect(() => {
  if (status !== 'paired') {
    setSelectedSquare(null);
    setLegalMoves([]);
    setPromotionPending(null);
  }
}, [status]);

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
      <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ fontSize: 'clamp(20px, 4vw, 24px)', textAlign: 'center' }}>
          Multiplayer Chess ♟️
        </h1>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 8 }}>
          <div style={{ opacity: chessRef.current.turn() === 'w' ? 1 : 0.5 }}>
            White: {formatTime(displayRemaining.white)}
          </div>
          <div style={{ opacity: chessRef.current.turn() === 'b' ? 1 : 0.5 }}>
            Black: {formatTime(displayRemaining.black)}
          </div>
        </div>

        {timers?.increment > 0 && (
          <div style={{ textAlign: 'center', fontSize: '0.8em', opacity: 0.8 }}>
            +{timers.increment}s increment
          </div>
        )}

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
            <TimeControlSelector />
            <button 
              onClick={() => socket.emit('join', timeControl)}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
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
              <p>Controls: click or drag your piece, then release on target square.</p>
            </div>
          </div>
        )}
      </div>

      {promotionPending && (
        <div style={{
          position: 'fixed',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)',
          zIndex: 9999
        }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 8, textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px' }}>Choose promotion:</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => {
                emitMove(promotionPending.from, promotionPending.to, 'q');
                setPromotionPending(null);
              }}>Queen</button>
              <button onClick={() => {
                emitMove(promotionPending.from, promotionPending.to, 'r');
                setPromotionPending(null);
              }}>Rook</button>
              <button onClick={() => {
                emitMove(promotionPending.from, promotionPending.to, 'b');
                setPromotionPending(null);
              }}>Bishop</button>
              <button onClick={() => {
                emitMove(promotionPending.from, promotionPending.to, 'n');
                setPromotionPending(null);
              }}>Knight</button>
              <button onClick={() => setPromotionPending(null)} style={{ marginLeft: 8 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}