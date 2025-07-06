const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game data matching official rules
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

class ClueConspiracyGame {
  constructor(gameId) {
    this.id = gameId;
    this.players = new Map();
    this.phase = 'lobby'; // lobby, setup, plotting, playing, voting, disarming, collecting, ended
    this.round = 1;
    this.currentScout = null;
    this.currentBodyguard = null;
    this.currentTeam = [];
    this.currentLocation = null;
    this.plotLocation = null;
    this.plotWeapon = null;
    this.ringleader = null;
    this.accomplices = [];
    this.votes = new Map();
    this.stormTracker = 0;
    this.coralHealth = 3;
    this.traps = new Map();
    this.locationClues = new Map();
    this.disarmedTraps = new Set();
    this.playerOrder = [];
    this.scoutIndex = 0;
    this.lastScout = null;
    this.lastBodyguard = null;
    this.supplyDeck = [];
    this.plotRevealed = false;
    this.safeLocation = null;
    this.submittedCards = new Map();
    this.finalAccusation = null;
    this.gameLog = [];
    
    this.setupGameBoard();
  }

  setupGameBoard() {
    // Setup traps based on player count
    const trapValues = [4, 5, 6, 7]; // Different difficulty levels
    
    LOCATIONS.forEach((location, index) => {
      const trapValue = trapValues[index % trapValues.length];
      const trapSuit = Math.random() < 0.5 ? 'triangle' : 'circle';
      
      this.traps.set(location, {
        value: trapValue,
        suit: trapSuit,
        disarmed: false
      });
    });

    // Setup clue cards
    this.setupClueCards();
  }

  setupClueCards() {
    // Create clue deck
    const clueCards = [];
    
    // Add location clues (minus plot location)
    LOCATIONS.forEach(location => {
      clueCards.push({ type: 'location', value: location });
    });
    
    // Add weapon clues (minus plot weapon)
    WEAPONS.forEach(weapon => {
      clueCards.push({ type: 'weapon', value: weapon });
    });
    
    // Add instant disarms and no clue found cards
    for (let i = 0; i < 3; i++) {
      clueCards.push({ type: 'instant_disarm' });
    }
    for (let i = 0; i < 6; i++) {
      clueCards.push({ type: 'no_clue' });
    }
    
    // Shuffle clue cards
    for (let i = clueCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [clueCards[i], clueCards[j]] = [clueCards[j], clueCards[i]];
    }
    
    // Place clue cards on locations
    LOCATIONS.forEach((location, index) => {
      this.locationClues.set(location, clueCards[index] || { type: 'no_clue' });
    });
  }

  addPlayer(socketId, name) {
    if (this.players.size >= 10) return false;
    
    const player = {
      id: socketId,
      name: name,
      character: CHARACTERS[this.players.size],
      secretRole: null,
      supplyCards: [],
      clueCards: [],
      weaponTokens: [],
      locationTokens: [],
      isScout: false,
      isBodyguard: false,
      plotKnown: false,
      canBeScout: true,
      canBeBodyguard: true
    };
    
    this.players.set(socketId, player);
    this.playerOrder.push(socketId);
    return true;
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    this.playerOrder = this.playerOrder.filter(id => id !== socketId);
    
    if (this.currentScout === socketId) {
      this.currentScout = null;
    }
    if (this.currentBodyguard === socketId) {
      this.currentBodyguard = null;
    }
  }

  canStart() {
    return this.players.size >= 4 && this.players.size <= 10;
  }

  start() {
    if (!this.canStart()) return false;
    
    this.assignRoles();
    this.setupPlot();
    this.dealSupplyCards();
    this.phase = 'setup';
    return true;
  }

  assignRoles() {
    const playerCount = this.players.size;
    const roles = [];
    
    // Role distribution based on official rules
    const roleDistribution = {
      4: { friends: 2, accomplices: 1 },
      5: { friends: 3, accomplices: 1 },
      6: { friends: 4, accomplices: 1 },
      7: { friends: 4, accomplices: 2 },
      8: { friends: 5, accomplices: 2 },
      9: { friends: 5, accomplices: 3 },
      10: { friends: 6, accomplices: 3 }
    };

    const dist = roleDistribution[playerCount];
    
    for (let i = 0; i < dist.friends; i++) {
      roles.push('friend');
    }
    for (let i = 0; i < dist.accomplices; i++) {
      roles.push('accomplice');
    }
    roles.push('ringleader');
    
    // Shuffle roles
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }
    
    // Assign to players
    let roleIndex = 0;
    for (const [playerId, player] of this.players) {
      player.secretRole = roles[roleIndex];
      if (player.secretRole === 'ringleader') {
        this.ringleader = playerId;
      } else if (player.secretRole === 'accomplice') {
        this.accomplices.push(playerId);
      }
      roleIndex++;
    }
  }

  setupPlot() {
    // Draw plot location and weapon
    this.plotLocation = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    this.plotWeapon = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
    
    // Remove plot cards from clue deck
    this.locationClues.forEach((clue, location) => {
      if (clue.type === 'location' && clue.value === this.plotLocation) {
        this.locationClues.set(location, { type: 'no_clue' });
      }
      if (clue.type === 'weapon' && clue.value === this.plotWeapon) {
        this.locationClues.set(location, { type: 'no_clue' });
      }
    });
    
    // Set safe location (different from plot location)
    do {
      this.safeLocation = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    } while (this.safeLocation === this.plotLocation);
  }

  dealSupplyCards() {
    const deck = [];
    
    // Create supply deck: 30 value-1 cards, 20 triangle-2 cards, 20 circle-2 cards
    for (let i = 0; i < 30; i++) {
      deck.push({ value: 1, suit: null });
    }
    for (let i = 0; i < 20; i++) {
      deck.push({ value: 2, suit: 'triangle' });
    }
    for (let i = 0; i < 20; i++) {
      deck.push({ value: 2, suit: 'circle' });
    }
    
    // Shuffle deck
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    // Deal 3 cards to each player
    for (const [playerId, player] of this.players) {
      player.supplyCards = deck.splice(0, 3);
    }
    
    this.supplyDeck = deck;
  }

  startPlotPhase() {
    this.phase = 'plotting';
    this.plotRevealed = false;
  }

  revealPlot() {
    this.plotRevealed = true;
    // Mark conspiracy members as knowing the plot
    if (this.players.has(this.ringleader)) {
      this.players.get(this.ringleader).plotKnown = true;
    }
    this.accomplices.forEach(id => {
      if (this.players.has(id)) {
        this.players.get(id).plotKnown = true;
      }
    });
  }

  startPlaying() {
    this.phase = 'playing';
    // Choose first scout (player who most recently flew on airplane - random for now)
    this.scoutIndex = Math.floor(Math.random() * this.playerOrder.length);
    this.startRound();
  }

  startRound() {
    this.votes.clear();
    this.currentTeam = [];
    this.currentLocation = null;
    this.currentBodyguard = null;
    this.submittedCards.clear();
    
    // Update role availability based on previous round
    for (const [playerId, player] of this.players) {
      player.canBeScout = playerId !== this.lastScout;
      player.canBeBodyguard = playerId !== this.lastBodyguard;
    }
    
    // Find next available scout
    let attempts = 0;
    while (attempts < this.playerOrder.length) {
      const candidateId = this.playerOrder[this.scoutIndex];
      if (this.players.has(candidateId) && this.players.get(candidateId).canBeScout) {
        this.currentScout = candidateId;
        break;
      }
      this.scoutIndex = (this.scoutIndex + 1) % this.playerOrder.length;
      attempts++;
    }
    
    // Clear scout/bodyguard flags
    for (const [playerId, player] of this.players) {
      player.isScout = false;
      player.isBodyguard = false;
    }
    
    if (this.players.has(this.currentScout)) {
      this.players.get(this.currentScout).isScout = true;
    }
    
    this.phase = 'team_selection';
  }

  setTeamSelection(bodyguard, team, location) {
    if (!this.players.has(bodyguard) || !this.players.get(bodyguard).canBeBodyguard) {
      return false;
    }
    
    this.currentBodyguard = bodyguard;
    this.currentTeam = [this.currentScout, bodyguard, ...team].filter((id, index, arr) => arr.indexOf(id) === index);
    this.currentLocation = location;
    
    // Set bodyguard flag
    this.players.get(bodyguard).isBodyguard = true;
    
    this.phase = 'voting';
    return true;
  }

  vote(playerId, approve) {
    if (this.phase !== 'voting') return false;
    this.votes.set(playerId, approve);
    return true;
  }

  processVotes() {
    const totalVotes = this.votes.size;
    const approveVotes = Array.from(this.votes.values()).filter(v => v).length;
    const disapproveVotes = totalVotes - approveVotes;
    
    if (approveVotes > disapproveVotes) {
      // Vote passes
      this.stormTracker = 0;
      this.phase = 'plot_check';
      return { result: 'approved', approveVotes, disapproveVotes };
    } else {
      // Vote fails
      this.stormTracker++;
      
      if (this.stormTracker >= 3) {
        // Three failed votes - Mr. Coral takes damage
        this.coralHealth--;
        this.stormTracker = 0;
        
        if (this.coralHealth <= 0) {
          this.startFinalAccusation();
          return { result: 'coral_died', approveVotes, disapproveVotes };
        }
      }
      
      // Move to next scout
      this.lastScout = this.currentScout;
      this.scoutIndex = (this.scoutIndex + 1) % this.playerOrder.length;
      this.startRound();
      
      return { result: 'rejected', approveVotes, disapproveVotes };
    }
  }

  checkPlotActivation() {
    const plotActivated = (
      this.coralHealth < 3 && // Mr. Coral has taken damage
      this.currentLocation === this.plotLocation && // At plot location
      this.currentBodyguard === this.ringleader // Ringleader is bodyguard
    );
    
    if (plotActivated) {
      this.endGame('conspiracy_plot');
      return true;
    }
    
    this.phase = 'disarming';
    return false;
  }

  submitCards(playerId, cards) {
    if (this.phase !== 'disarming') return false;
    if (!this.currentTeam.includes(playerId)) return false;
    
    const player = this.players.get(playerId);
    const validCards = cards.filter(card => 
      player.supplyCards.some(sc => sc.value === card.value && sc.suit === card.suit)
    );
    
    this.submittedCards.set(playerId, validCards);
    
    // Remove cards from player's hand
    validCards.forEach(card => {
      const index = player.supplyCards.findIndex(sc => sc.value === card.value && sc.suit === card.suit);
      if (index >= 0) {
        player.supplyCards.splice(index, 1);
      }
    });
    
    return true;
  }

  processDisarming() {
    if (this.phase !== 'disarming') return false;
    
    // Check if all team members have submitted cards
    const allSubmitted = this.currentTeam.every(playerId => this.submittedCards.has(playerId));
    if (!allSubmitted) return false;
    
    // Collect all submitted cards
    const allCards = [];
    this.submittedCards.forEach(cards => allCards.push(...cards));
    
    // Calculate total value
    const trap = this.traps.get(this.currentLocation);
    let totalValue = 0;
    
    allCards.forEach(card => {
      if (card.value === 1) {
        totalValue += 1; // Value 1 cards always count
      } else if (card.suit === trap.suit) {
        totalValue += 2; // Matching suit counts positive
      } else {
        totalValue -= 2; // Non-matching suit subtracts
      }
    });
    
    const trapDisarmed = totalValue >= trap.value;
    
    if (trapDisarmed) {
      this.disarmedTraps.add(this.currentLocation);
      this.traps.get(this.currentLocation).disarmed = true;
    } else {
      // Mr. Coral takes damage
      this.coralHealth--;
      
      if (this.coralHealth <= 0) {
        this.startFinalAccusation();
        return { success: false, damage: true, totalValue, required: trap.value };
      }
    }
    
    this.phase = 'collecting';
    return { success: trapDisarmed, damage: !trapDisarmed, totalValue, required: trap.value };
  }

  collectClues(playerId, claimedClues) {
    if (this.phase !== 'collecting') return false;
    if (this.currentBodyguard !== playerId) return false;
    
    const actualClue = this.locationClues.get(this.currentLocation);
    const player = this.players.get(playerId);
    
    // Add actual clue to player's collection
    player.clueCards.push(actualClue);
    
    // Add claimed tokens
    claimedClues.forEach(clue => {
      if (clue.type === 'weapon') {
        player.weaponTokens.push(clue.value);
      } else if (clue.type === 'location') {
        player.locationTokens.push(clue.value);
      }
    });
    
    this.phase = 'supplying';
    return true;
  }

  distributeSupplyCards() {
    if (this.phase !== 'supplying') return false;
    
    // Count pawns at current location (including Mr. Coral)
    const pawnsAtLocation = this.currentTeam.length + 1; // +1 for Mr. Coral
    
    // Scout draws and distributes cards
    const drawnCards = this.supplyDeck.splice(0, pawnsAtLocation);
    let cardIndex = 0;
    
    // Distribute to team members
    this.currentTeam.forEach(playerId => {
      const player = this.players.get(playerId);
      if (player.supplyCards.length < 3 && cardIndex < drawnCards.length) {
        player.supplyCards.push(drawnCards[cardIndex]);
        cardIndex++;
      }
    });
    
    // Players not at location draw one card
    this.playerOrder.forEach(playerId => {
      if (!this.currentTeam.includes(playerId)) {
        const player = this.players.get(playerId);
        if (player.supplyCards.length < 3 && this.supplyDeck.length > 0) {
          player.supplyCards.push(this.supplyDeck.shift());
        }
      }
    });
    
    // Check win conditions
    if (this.disarmedTraps.size === LOCATIONS.length) {
      this.endGame('friends_traps');
      return true;
    }
    
    // Move to next round
    this.lastScout = this.currentScout;
    this.lastBodyguard = this.currentBodyguard;
    this.scoutIndex = (this.scoutIndex + 1) % this.playerOrder.length;
    this.round++;
    this.startRound();
    
    return true;
  }

  startFinalAccusation() {
    this.phase = 'final_accusation';
    this.finalAccusation = {
      timeLimit: 5 * 60, // 5 minutes
      accusations: new Map(),
      votingPhase: false
    };
  }

  submitFinalAccusation(who, where, what) {
    if (this.phase !== 'final_accusation') return false;
    
    this.finalAccusation.accusations.set('final', { who, where, what });
    
    // Check if accusation is correct
    const correct = (
      who === this.ringleader &&
      where === this.plotLocation &&
      what === this.plotWeapon
    );
    
    if (correct) {
      this.endGame('friends_accusation');
    } else {
      this.endGame('conspiracy_accusation');
    }
    
    return true;
  }

  endGame(reason) {
    this.phase = 'ended';
    
    const result = {
      reason,
      winner: null,
      plotLocation: this.plotLocation,
      plotWeapon: this.plotWeapon,
      ringleader: this.ringleader,
      accomplices: this.accomplices
    };
    
    switch (reason) {
      case 'friends_traps':
        result.winner = 'friends';
        break;
      case 'friends_accusation':
        result.winner = 'friends';
        break;
      case 'conspiracy_plot':
        result.winner = 'conspiracy';
        break;
      case 'conspiracy_accusation':
        result.winner = 'conspiracy';
        break;
    }
    
    this.gameLog.push(`Game ended: ${reason}, Winner: ${result.winner}`);
    return result;
  }

  getPublicGameState() {
    return {
      id: this.id,
      phase: this.phase,
      round: this.round,
      playerCount: this.players.size,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        character: p.character,
        isScout: p.isScout,
        isBodyguard: p.isBodyguard,
        supplyCardCount: p.supplyCards.length,
        clueCardCount: p.clueCards.length,
        weaponTokens: p.weaponTokens,
        locationTokens: p.locationTokens,
        canBeScout: p.canBeScout,
        canBeBodyguard: p.canBeBodyguard
      })),
      currentScout: this.currentScout,
      currentBodyguard: this.currentBodyguard,
      currentTeam: this.currentTeam,
      currentLocation: this.currentLocation,
      stormTracker: this.stormTracker,
      coralHealth: this.coralHealth,
      traps: Object.fromEntries(
        Array.from(this.traps.entries()).map(([location, trap]) => [
          location,
          {
            value: trap.value,
            suit: trap.suit,
            disarmed: trap.disarmed
          }
        ])
      ),
      disarmedTraps: Array.from(this.disarmedTraps),
      safeLocation: this.safeLocation,
      votes: this.phase === 'voting' ? Object.fromEntries(this.votes) : null,
      submittedCards: this.phase === 'disarming' ? Array.from(this.submittedCards.keys()) : null,
      finalAccusation: this.finalAccusation,
      gameLog: this.gameLog.slice(-10) // Last 10 log entries
    };
  }

  getPlayerPrivateState(playerId) {
    const player = this.players.get(playerId);
    if (!player) return null;
    
    return {
      secretRole: player.secretRole,
      supplyCards: player.supplyCards,
      clueCards: player.clueCards,
      plotKnown: player.plotKnown,
      plotLocation: player.plotKnown ? this.plotLocation : null,
      plotWeapon: player.plotKnown ? this.plotWeapon : null,
      canSubmitCards: this.phase === 'disarming' && this.currentTeam.includes(playerId),
      canCollectClues: this.phase === 'collecting' && this.currentBodyguard === playerId,
      actualClue: this.phase === 'collecting' && this.currentBodyguard === playerId ? 
        this.locationClues.get(this.currentLocation) : null
    };
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  socket.on('join_game', (data) => {
    const { gameId, playerName } = data;
    
    if (!games.has(gameId)) {
      games.set(gameId, new ClueConspiracyGame(gameId));
    }
    
    const game = games.get(gameId);
    const success = game.addPlayer(socket.id, playerName);
    
    if (success) {
      socket.join(gameId);
      socket.emit('joined_game', { gameId, playerId: socket.id });
      
      // Send game state to all players
      io.to(gameId).emit('game_state', game.getPublicGameState());
      
      // Send private state to joining player
      socket.emit('private_state', game.getPlayerPrivateState(socket.id));
    } else {
      socket.emit('join_failed', { reason: 'Game is full' });
    }
  });
  
  socket.on('start_game', (data) => {
    const { gameId } = data;
    const game = games.get(gameId);
    
    if (game && game.canStart()) {
      game.start();
      io.to(gameId).emit('game_state', game.getPublicGameState());
      
      // Send private states to all players
      for (const [playerId] of game.players) {
        io.to(playerId).emit('private_state', game.getPlayerPrivateState(playerId));
      }
    }
  });
  
  socket.on('start_plot_phase', (data) => {
    const { gameId } = data;
    const game = games.get(gameId);
    
    if (game && game.phase === 'setup') {
      game.startPlotPhase();
      io.to(gameId).emit('game_state', game.getPublicGameState());
    }
  });
  
  socket.on('reveal_plot', (data) => {
    const { gameId } = data;
    const game = games.get(gameId);
    
    if (game && game.phase === 'plotting') {
      game.revealPlot();
      io.to(gameId).emit('game_state', game.getPublicGameState());
      
      // Send updated private states to conspiracy members
      for (const [playerId] of game.players) {
        io.to(playerId).emit('private_state', game.getPlayerPrivateState(playerId));
      }
    }
  });
  
  socket.on('start_playing', (data) => {
    const { gameId } = data;
    const game = games.get(gameId);
    
    if (game && game.phase === 'plotting' && game.plotRevealed) {
      game.startPlaying();
      io.to(gameId).emit('game_state', game.getPublicGameState());
    }
  });
  
  socket.on('set_team', (data) => {
    const { gameId, bodyguard, team, location } = data;
    const game = games.get(gameId);
    
    if (game && game.phase === 'team_selection' && game.currentScout === socket.id) {
      const success = game.setTeamSelection(bodyguard, team, location);
      if (success) {
        io.to(gameId).emit('game_state', game.getPublicGameState());
      }
    }
  });
  
  socket.on('vote', (data) => {
    const { gameId, approve } = data;
    const game = games.get(gameId);
    
    if (game && game.phase === 'voting') {
      game.vote(socket.id, approve);
      io.to(gameId).emit('game_state', game.getPublicGameState());
      
      // Check if all players have voted
      if (game.votes.size === game.players.size) {
        const result = game.processVotes();
        io.to(gameId).emit('vote_result', result);
        io.to(gameId).emit('game_state', game.getPublicGameState());
      }
    }
  });
  
  socket.on('check_plot', (data) => {
    const { gameId } = data;
    const game = games.get(gameId);
    
    if (game && game.phase === 'plot_check') {
      const plotActivated = game.checkPlotActivation();
      io.to(gameId).emit('plot_check_result', { activated: plotActivated });
      io.to(gameId).emit('game_state', game.getPublicGameState());
    }
  });
  
  socket.on('submit_cards', (data) => {
    const { gameId, cards } = data;
    const game = games.get(gameId);
    
    if (game && game.phase === 'disarming') {
      const success = game.submitCards(socket.id, cards);
      if (success) {
        io.to(gameId).emit('game_state', game.getPublicGameState());
        
        // Check if all team members have submitted
        const allSubmitted = game.currentTeam.every(playerId => game.submittedCards.has(playerId));
        if (allSubmitted) {
          const result = game.processDisarming();
          io.to(gameId).emit('disarm_result', result);
          io.to(gameId).emit('game_state', game.getPublicGameState());
        }
      }
    }
  });
  
  socket.on('collect_clues', (data) => {
    const { gameId, claimedClues } = data;
    const game = games.get(gameId);
    
    if (game && game.phase === 'collecting') {
      const success = game.collectClues(socket.id, claimedClues);
      if (success) {
        io.to(gameId).emit('game_state', game.getPublicGameState());
        io.to(socket.id).emit('private_state', game.getPlayerPrivateState(socket.id));
      }
    }
  });
  
  socket.on('distribute_supplies', (data) => {
    const { gameId } = data;
    const game = games.get(gameId);
    
    if (game && game.phase === 'supplying' && game.currentScout === socket.id) {
      const gameEnded = game.distributeSupplyCards();
      io.to(gameId).emit('game_state', game.getPublicGameState());
      
      // Send updated private states
      for (const [playerId] of game.players) {
        io.to(playerId).emit('private_state', game.getPlayerPrivateState(playerId));
      }
    }
  });
  
  socket.on('final_accusation', (data) => {
    const { gameId, who, where, what } = data;
    const game = games.get(gameId);
    
    if (game && game.phase === 'final_accusation') {
      const result = game.submitFinalAccusation(who, where, what);
      io.to(gameId).emit('game_state', game.getPublicGameState());
      
      if (result) {
        io.to(gameId).emit('game_ended', game.endGame());
      }
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🕵️ Clue Conspiracy server running on port ${PORT}`);
  console.log(`🌐 Open http://localhost:${PORT} in your browser`);
}); 