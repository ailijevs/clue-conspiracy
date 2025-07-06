// Error handling at the top
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

console.log('🚀 Starting Clue Conspiracy server...');

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game data
const LOCATIONS = [
  'Palm Lounge', 'Infinity Pool', 'Concierge Station', 'Lifeguard Post', 'Utility Room',
  'Hidden Cove', 'Botanical Spa', 'Observation Deck', 'Royal Villa'
];

const WEAPONS = [
  'Poison', 'Knife', 'Rope', 'Wrench', 'Candlestick',
  'Revolver', 'Lead Pipe', 'Dumbbell', 'Trophy'
];

const CHARACTERS = [
  'Miss Scarlett', 'Colonel Mustard', 'Mayor Green', 'Solicitor Peacock',
  'Professor Plum', 'Chef White', 'Director Rosewood', 'Dean Celadon',
  'Analyst Hyacinth', 'Agent Gray'
];

// Store games
const games = new Map();

// Test endpoints
app.get('/test', (req, res) => {
  res.json({ status: 'Clue Conspiracy server working!', players: games.size });
});

// Simple game class
class ClueConspiracyGame {
  constructor(gameId) {
    this.id = gameId;
    this.players = new Map();
    this.phase = 'lobby';
  }

  addPlayer(socketId, name) {
    if (this.players.size >= 10) return false;
    
    const player = {
      id: socketId,
      name: name,
      character: CHARACTERS[this.players.size] || 'Unknown'
    };
    
    this.players.set(socketId, player);
    return true;
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
  }

  getPublicGameState() {
    return {
      id: this.id,
      phase: this.phase,
      playerCount: this.players.size,
      players: Array.from(this.players.values())
    };
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 Player connected:', socket.id);
  
  socket.on('join_game', (data) => {
    console.log('🎮 Player joining game:', data);
    
    try {
      const { gameId, playerName } = data;
      
      if (!games.has(gameId)) {
        games.set(gameId, new ClueConspiracyGame(gameId));
      }
      
      const game = games.get(gameId);
      const success = game.addPlayer(socket.id, playerName);
      
      if (success) {
        socket.join(gameId);
        socket.emit('joined_game', { gameId, playerId: socket.id });
        
        // Send game state to all players in the game
        io.to(gameId).emit('game_state', game.getPublicGameState());
        
        console.log(`✅ Player ${playerName} joined game ${gameId}`);
      } else {
        socket.emit('join_failed', { reason: 'Game is full' });
      }
    } catch (error) {
      console.error('❌ Error in join_game:', error);
      socket.emit('join_failed', { reason: 'Server error' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Player disconnected:', socket.id);
    
    // Remove player from all games
    for (const [gameId, game] of games) {
      if (game.players.has(socket.id)) {
        game.removePlayer(socket.id);
        io.to(gameId).emit('game_state', game.getPublicGameState());
        
        // Remove empty games
        if (game.players.size === 0) {
          games.delete(gameId);
        }
      }
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🕵️ Clue Conspiracy server running on port ${PORT}`);
  console.log(`🌐 Server is ready for players!`);
});

// Keep the process alive
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  process.exit(0);
}); 