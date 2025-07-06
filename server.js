// Error handling at the top
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

console.log('🚀 Starting ultra-simple server...');

const express = require('express');
const app = express();

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('✅ Health check requested');
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test endpoint
app.get('/test', (req, res) => {
  console.log('✅ Test endpoint requested');
  res.send('Hello from Railway! Server is working!');
});

// Main page
app.get('/', (req, res) => {
  console.log('✅ Root endpoint requested');
  res.send('<h1>Clue Conspiracy Server</h1><p>Server is running!</p>');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Server listening on port ${PORT}`);
  console.log('✅ Server is ready');
});

// Keep the process alive
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  process.exit(0);
}); 