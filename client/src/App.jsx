import React, { useEffect, useState, useRef } from 'react';
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

  useEffect(() => {
    const s = io('http://localhost:4000');
    setSocket(s);

    s.on('connect', () => setStatus('connected'));
    s.on('waiting', () => setStatus('waiting'));
    s.on('paired', data => {
      setRoomId(data.roomId);
      setColor(data.color);
      chessRef.current.load(data.fen);
      setFen(data.fen);
      setStatus('paired');
    });
    s.on('gameUpdate', data => {
      chessRef.current.load(data.fen);
      setFen(data.fen);
      setSelectedSquare(null);
      setLegalMoves([]);
      if (data.isGameOver) {
        if (data.checkmate) alert('Checkmate! ' + (data.winner || ''));
        else if (data.draw) alert('Draw');
      }
    });
    s.on('illegalMove', ({ reason }) => alert('Illegal move: ' + reason));
    s.on('opponentDisconnected', () => alert('Opponent disconnected.'));

    return () => s.disconnect();
  }, []);

  useEffect(() => {
    if (fen) chessRef.current.load(fen);
  }, [fen]);

  function joinGame() {
    if (!socket) return;
    socket.emit('join');
  }

  function algebraicFromIndex(idx) {
    const rank = 8 - Math.floor(idx / 8);
    const file = idx % 8;
    return String.fromCharCode(97 + file) + rank;
  }

  function handleSquareClick(square) {
    const currentPlayerTurn = chessRef.current.turn() === (color === 'white' ? 'w' : 'b');
    if (!currentPlayerTurn) {
      alert("It's not your turn!");
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

  function renderBoard() {
  const board = chessRef.current.board();
  const size = Math.min(window.innerWidth, window.innerHeight) / 12;

  // Create a properly reversed board for black
  const displayBoard = color === 'white' ? board : [...board].reverse().map(row => [...row].reverse());
  
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8','7','6','5','4','3','2','1'];
  const fileLabels = color === 'white' ? files : [...files].reverse();
  const rankLabels = color === 'white' ? ranks : [...ranks].reverse();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'white' }}>
      {/* Board with rank labels */}
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
            // Calculate the actual square coordinate
            const row = Math.floor(idx / 8);
            const col = idx % 8;
            
            // For black, we need to reverse both rows and columns
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

      {/* File labels */}
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

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif', color: 'white' }}>
      <h1 style={{ fontSize: 24 }}>Multiplayer Chess ♟️</h1>
      <p>Status: {status} {color ? ` — you are ${color}` : ''}</p>
      {status === 'disconnected' && <button onClick={joinGame}>Connect & Join</button>}
      {status === 'connected' && <button onClick={joinGame}>Join a game</button>}
      {status === 'waiting' && <div>Waiting for opponent...</div>}
      {status === 'paired' && (
        <div style={{ display: 'flex', gap: 20 }}>
          <div>{renderBoard()}</div>
          <div>
            <p>Room: {roomId}</p>
            <p>FEN: {fen}</p>
            <p>Selected: {selectedSquare}</p>
            <p>Legal moves: {legalMoves.join(', ')}</p>
            <p>Controls: click your piece, then click target square.</p>
          </div>
        </div>
      )}
    </div>
  );
}
