// Error handling at the top
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

console.log('🚀 Starting Clue Conspiracy server...');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

console.log('✅ Express and Socket.IO setup complete');

// Simple in-memory game storage
const games = new Map();

// Basic route to test server is working
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/test', (req, res) => {
  res.json({ status: 'Server is working!', timestamp: new Date().toISOString() });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 Player connected:', socket.id);
  
  socket.on('join_game', (data) => {
    console.log('🎮 Player joining game:', data);
    
    try {
      const { gameId, playerName } = data;
      
      // Simple game joining logic
      socket.join(gameId);
      socket.emit('joined_game', { gameId, playerId: socket.id });
      
      // Send basic game state
      socket.emit('game_state', {
        id: gameId,
        phase: 'lobby',
        playerCount: 1,
        players: [{ id: socket.id, name: playerName, character: 'Miss Scarlett' }]
      });
      
      console.log(`✅ Player ${playerName} joined game ${gameId}`);
    } catch (error) {
      console.error('❌ Error in join_game:', error);
      socket.emit('join_failed', { reason: 'Server error' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Player disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3000;

try {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🕵️ Clue Conspiracy server running on port ${PORT}`);
    console.log(`🌐 Server is ready to accept connections`);
  });
} catch (error) {
  console.error('❌ Error starting server:', error);
  process.exit(1);
} 