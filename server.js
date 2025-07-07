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

// Game constants
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

// Correct suits - only Triangle and Circle
const SUITS = ['Triangle', 'Circle'];

// Role assignment based on player count
const ROLE_ASSIGNMENTS = {
  4: { friends: 2, accomplices: 1, ringleader: 1 },
  5: { friends: 3, accomplices: 1, ringleader: 1 },
  6: { friends: 4, accomplices: 1, ringleader: 1 },
  7: { friends: 4, accomplices: 2, ringleader: 1 },
  8: { friends: 5, accomplices: 2, ringleader: 1 },
  9: { friends: 5, accomplices: 3, ringleader: 1 },
  10: { friends: 6, accomplices: 3, ringleader: 1 }
};

// Store games
const games = new Map();

// Test endpoints
app.get('/test', (req, res) => {
  res.json({ status: 'Clue Conspiracy server working!', games: games.size });
});

// Utility functions
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function createSupplyCard(value, suit = null) {
  return {
    type: 'supply',
    value: value,
    suit: suit,
    id: Math.random().toString(36).substr(2, 9)
  };
}

function createClueCard(type, content = null) {
  return {
    type: 'clue',
    cardType: type, // 'weapon', 'location', 'instant_disarm', 'no_clue'
    content: content,
    id: Math.random().toString(36).substr(2, 9)
  };
}

function createTrapTile(playerCount) {
  // Official trap configurations with correct Triangle/Circle suits
  const officialTraps = [
    // 4-7 player traps
    { value: 4, suit: 'Triangle', playerRange: '4-7' },
    { value: 4, suit: 'Circle', playerRange: '4-7' },
    { value: 5, suit: 'Triangle', playerRange: '4-7' },
    { value: 5, suit: 'Circle', playerRange: '4-7' },
    { value: 5, suit: 'Triangle', playerRange: '4-7' },
    { value: 5, suit: 'Circle', playerRange: '4-7' },
    { value: 7, suit: 'Triangle', playerRange: '4-7' },
    { value: 7, suit: 'Circle', playerRange: '4-7' },
    { value: 7, suit: 'Trip Wire', playerRange: '4-7' }, // Accepts both Triangle and Circle
    
    // 8-10 player traps  
    { value: 6, suit: 'Triangle', playerRange: '8-10' },
    { value: 6, suit: 'Circle', playerRange: '8-10' },
    { value: 7, suit: 'Triangle', playerRange: '8-10' },
    { value: 7, suit: 'Circle', playerRange: '8-10' },
    { value: 7, suit: 'Triangle', playerRange: '8-10' },
    { value: 7, suit: 'Circle', playerRange: '8-10' },
    { value: 9, suit: 'Triangle', playerRange: '8-10' },
    { value: 9, suit: 'Circle', playerRange: '8-10' },
    { value: 9, suit: 'Trip Wire', playerRange: '8-10' } // Accepts both Triangle and Circle
  ];
  
  // Filter traps by player count
  const validTraps = officialTraps.filter(trap => {
    if (playerCount <= 7) {
      return trap.playerRange === '4-7';
    } else {
      return trap.playerRange === '8-10';
    }
  });
  
  // Randomly select a trap configuration
  const selectedTrap = validTraps[Math.floor(Math.random() * validTraps.length)];
  
  return {
    value: selectedTrap.value,
    suit: selectedTrap.suit,
    id: Math.random().toString(36).substr(2, 9)
  };
}

// Complete game class
class ClueConspiracyGame {
  constructor(gameId) {
    this.id = gameId;
    this.players = new Map();
    this.phase = 'lobby';
    this.playerCount = 0;
    
    // Game state
    this.coralHealth = 3;
    this.stormTracker = 0;
    this.round = 1;
    this.currentScout = null;
    this.currentBodyguard = null;
    this.previousRoles = { scout: null, bodyguard: null };
    
    // Game data
    this.secretRoles = new Map();
    this.plotLocation = null;
    this.plotWeapon = null;
    this.ringleaderId = null;
    this.accompliceIds = [];
    this.friendIds = [];
    
    // Board state
    this.locations = new Map();
    this.safeLocation = null;
    this.trapsRemaining = 9;
    this.supplyDeck = [];
    this.supplyDiscard = [];
    
    // Round state
    this.proposedMission = null;
    this.votes = new Map();
    this.supplyContributions = new Map();
    this.cluesCollected = [];
    
    // Final accusation
    this.finalAccusation = null;
    this.gameEnded = false;
    this.winner = null;
    
    this.initializeGame();
  }

  initializeGame() {
    console.log(`🎮 Initializing game ${this.id}`);
    
    // Initialize locations with empty state
    LOCATIONS.forEach(location => {
      this.locations.set(location, {
        name: location,
        trap: null,
        clues: [],
        playersPresent: [],
        visited: false
      });
    });
  }

  addPlayer(socketId, name) {
    if (this.players.size >= 10) return false;
    if (this.phase !== 'lobby') return false;
    
    const player = {
      id: socketId,
      name: name,
      character: CHARACTERS[this.players.size] || 'Unknown',
      supplyCards: [],
      clueCards: [],
      claimedClues: { weapons: [], locations: [] },
      location: null,
      isAlive: true
    };
    
    this.players.set(socketId, player);
    this.playerCount = this.players.size;
    
    console.log(`✅ Player ${name} joined game ${this.id} (${this.playerCount}/10)`);
    return true;
  }

  removePlayer(socketId) {
    if (this.players.has(socketId)) {
      const player = this.players.get(socketId);
      console.log(`🔌 Player ${player.name} left game ${this.id}`);
      
      // Handle critical disconnections first
      if (this.phase !== 'lobby') {
        this.handleCriticalPlayerDisconnection(socketId);
      }
      
      this.players.delete(socketId);
      this.playerCount = this.players.size;
      
      // If game is in progress and becomes empty, end it
      if (this.phase !== 'lobby' && this.playerCount === 0) {
        this.endGame('disconnection');
      }
      
      // If too few players remain, end the game
      if (this.phase !== 'lobby' && this.playerCount < 4) {
        console.log('🚨 Too few players remaining - ending game');
        this.endGame('insufficient_players');
      }
    }
  }

  startGame() {
    if (this.playerCount < 4) {
      throw new Error('Need at least 4 players to start');
    }
    
    console.log(`🎮 Starting game ${this.id} with ${this.playerCount} players`);
    
    // Assign secret roles
    this.assignSecretRoles();
    
    // Setup game board
    this.setupGameBoard();
    
    // Deal initial supply cards
    this.dealInitialSupplyCards();
    
    // Set first scout
    this.setFirstScout();
    
    // For 4-player games, skip conspiracy reveal phase (accomplice doesn't know ringleader)
    if (this.playerCount === 4) {
      this.phase = 'round_choose_team';
      this.round = 1;
      console.log(`🎯 4-player game: Starting Round ${this.round} - Scout: ${this.players.get(this.currentScout).name}`);
    } else {
      // For 5+ players, do conspiracy phase
      this.phase = 'conspiracy_setup';
      console.log(`🤫 Conspiracy setup phase starting`);
    }
    
    this.addToGameLog('game_started', 'System', {
      playerCount: this.playerCount,
      plotLocation: this.plotLocation,
      plotWeapon: this.plotWeapon,
      firstScout: this.players.get(this.currentScout).name
    });
    
    return true;
  }

  assignSecretRoles() {
    const playerIds = Array.from(this.players.keys());
    const shuffledIds = shuffleArray(playerIds);
    
    const roleCount = ROLE_ASSIGNMENTS[this.playerCount];
    
    // Assign ringleader
    this.ringleaderId = shuffledIds[0];
    this.secretRoles.set(shuffledIds[0], 'ringleader');
    
    // Assign accomplices
    for (let i = 1; i <= roleCount.accomplices; i++) {
      this.accompliceIds.push(shuffledIds[i]);
      this.secretRoles.set(shuffledIds[i], 'accomplice');
    }
    
    // Assign friends
    for (let i = 1 + roleCount.accomplices; i < shuffledIds.length; i++) {
      this.friendIds.push(shuffledIds[i]);
      this.secretRoles.set(shuffledIds[i], 'friend');
    }
    
    console.log(`🎭 Roles assigned: Ringleader: 1, Accomplices: ${roleCount.accomplices}, Friends: ${roleCount.friends}`);
  }

  setupGameBoard() {
    console.log('🏖️ Setting up game board...');
    
    // Create clue decks
    const locationClues = LOCATIONS.map(loc => createClueCard('location', loc));
    const weaponClues = WEAPONS.map(weapon => createClueCard('weapon', weapon));
    
    // Shuffle location clues and set plot + safe location
    const shuffledLocationClues = shuffleArray(locationClues);
    
    // First card is plot location (face down)
    this.plotLocation = shuffledLocationClues[0].content;
    
    // Second card is safe location (face up)
    this.safeLocation = shuffledLocationClues[1].content;
    console.log(`🛡️ Safe location: ${this.safeLocation}`);
    
    // Remaining location clues for board (7 locations need clues)
    const remainingLocationClues = shuffledLocationClues.slice(2);
    
    // Add instant disarms and no clue cards to fill 9 slots total
    const instantDisarms = Array(2).fill(null).map(() => createClueCard('instant_disarm'));
    const noClues = Array(1).fill(null).map(() => createClueCard('no_clue'));
    const allLocationClues = [...remainingLocationClues, ...instantDisarms, ...noClues];
    
    // Shuffle weapon clues and set plot weapon
    const shuffledWeaponClues = shuffleArray(weaponClues);
    this.plotWeapon = shuffledWeaponClues[0].content;
    
    // Remaining weapon clues for board
    const remainingWeaponClues = shuffledWeaponClues.slice(1);
    const moreInstantDisarms = Array(2).fill(null).map(() => createClueCard('instant_disarm'));
    const moreNoClues = Array(1).fill(null).map(() => createClueCard('no_clue'));
    const allWeaponClues = [...remainingWeaponClues, ...moreInstantDisarms, ...moreNoClues];
    
    // Shuffle the clue arrays to ensure random distribution
    const shuffledLocationClueCards = shuffleArray(allLocationClues);
    const shuffledWeaponClueCards = shuffleArray(allWeaponClues);
    
    // Place clues on locations (excluding safe location)
    const boardLocations = LOCATIONS.filter(loc => loc !== this.safeLocation);
    boardLocations.forEach((location, index) => {
      const locationData = this.locations.get(location);
      
      // Add one location clue and one weapon clue to each location
      if (shuffledLocationClueCards[index]) locationData.clues.push(shuffledLocationClueCards[index]);
      if (shuffledWeaponClueCards[index]) locationData.clues.push(shuffledWeaponClueCards[index]);
      
      // Add trap
      locationData.trap = createTrapTile(this.playerCount);
    });
    
    // Safe location gets no trap but can have clues for first mission
    const safeLocationData = this.locations.get(this.safeLocation);
    safeLocationData.trap = null;
    if (shuffledLocationClueCards[8]) safeLocationData.clues.push(shuffledLocationClueCards[8]);
    if (shuffledWeaponClueCards[8]) safeLocationData.clues.push(shuffledWeaponClueCards[8]);
    
    // Initialize trap counter correctly
    this.trapsRemaining = boardLocations.length; // 8 locations with traps (9 total - 1 safe)
    
    console.log(`🎯 Plot: ${this.plotLocation} with ${this.plotWeapon}`);
    console.log(`🛡️ Safe location: ${this.safeLocation}`);
    console.log(`🔢 Traps placed: ${this.trapsRemaining}`);
  }

  dealInitialSupplyCards() {
    // Create supply deck - 35 total cards as per rules
    this.supplyDeck = [];
    
    // Add value 1 cards (no suit) - 15 total
    for (let i = 0; i < 15; i++) {
      this.supplyDeck.push(createSupplyCard(1));
    }
    
    // Add value 2 cards with Triangle and Circle suits
    // 10 Triangle cards + 10 Circle cards = 20 total
    // This gives us 15 + 20 = 35 total cards ✅
    for (let i = 0; i < 10; i++) {
      this.supplyDeck.push(createSupplyCard(2, 'Triangle'));
      this.supplyDeck.push(createSupplyCard(2, 'Circle'));
    }
    
    // Shuffle deck
    this.supplyDeck = shuffleArray(this.supplyDeck);
    
    // Deal initial cards based on player count
    const cardsPerPlayer = this.playerCount === 4 ? 4 : 3;
    
    this.players.forEach(player => {
      player.supplyCards = [];
      for (let i = 0; i < cardsPerPlayer; i++) {
        this.ensureSupplyAvailable();
        if (this.supplyDeck.length > 0) {
          player.supplyCards.push(this.supplyDeck.pop());
        }
      }
    });
    
    console.log(`🎴 Dealt ${cardsPerPlayer} supply cards to each player. Deck: ${this.supplyDeck.length} remaining`);
  }

  setFirstScout() {
    // Choose random first scout
    const playerIds = Array.from(this.players.keys());
    this.currentScout = playerIds[Math.floor(Math.random() * playerIds.length)];
    
    console.log(`🎯 First scout: ${this.players.get(this.currentScout).name}`);
  }

  getPublicGameState() {
    return {
      id: this.id,
      phase: this.phase,
      playerCount: this.playerCount,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        character: p.character,
        supplyCardCount: p.supplyCards.length,
        clueCardCount: p.clueCards.length,
        claimedClues: p.claimedClues,
        location: p.location,
        isAlive: p.isAlive
      })),
      coralHealth: this.coralHealth,
      stormTracker: this.stormTracker,
      round: this.round,
      currentScout: this.currentScout,
      currentBodyguard: this.currentBodyguard,
      locations: Array.from(this.locations.entries()).map(([name, data]) => ({
        name: name,
        hasTraps: data.trap !== null,
        trapValue: data.trap ? data.trap.value : 0,
        trapSuit: data.trap ? data.trap.suit : null,
        playersPresent: data.playersPresent,
        visited: data.visited
      })),
      safeLocation: this.safeLocation,
      trapsRemaining: this.trapsRemaining,
      proposedMission: this.proposedMission,
      votes: this.votes.size > 0 ? Array.from(this.votes.entries()) : null,
      gameEnded: this.gameEnded,
      winner: this.winner
    };
  }

  getPrivateGameState(playerId) {
    const player = this.players.get(playerId);
    if (!player) return null;
    
    const privateState = {
      secretRole: this.secretRoles.get(playerId),
      supplyCards: player.supplyCards,
      clueCards: player.clueCards,
      isScout: this.currentScout === playerId,
      isBodyguard: this.currentBodyguard === playerId
    };
    
    // Add plot info for conspiracy members
    if (this.secretRoles.get(playerId) === 'ringleader' || this.secretRoles.get(playerId) === 'accomplice') {
      privateState.plotLocation = this.plotLocation;
      privateState.plotWeapon = this.plotWeapon;
      privateState.ringleaderId = this.ringleaderId;
      privateState.accompliceIds = this.accompliceIds;
    }
    
    return privateState;
  }

  // Game action methods
  proposeTeam(scoutId, bodyguardId, teamMemberIds, locationName) {
    // Input validation
    if (!scoutId || typeof scoutId !== 'string') {
      throw new Error('Invalid scout ID');
    }
    
    if (!bodyguardId || typeof bodyguardId !== 'string') {
      throw new Error('Invalid bodyguard ID');
    }
    
    if (!Array.isArray(teamMemberIds)) {
      throw new Error('Team member IDs must be an array');
    }
    
    if (!locationName || typeof locationName !== 'string') {
      throw new Error('Invalid location name');
    }
    
    if (this.phase !== 'round_choose_team') {
      throw new Error('Game must be in team selection phase');
    }
    
    if (this.currentScout !== scoutId) {
      throw new Error('Only the current scout can propose a team');
    }
    
    // Validate all player IDs exist
    const allPlayerIds = [scoutId, bodyguardId, ...teamMemberIds];
    const invalidPlayers = allPlayerIds.filter(id => !this.players.has(id));
    if (invalidPlayers.length > 0) {
      throw new Error(`Invalid player IDs: ${invalidPlayers.join(', ')}`);
    }
    
    // Check for duplicate team members
    const uniqueTeamMembers = new Set(teamMemberIds);
    if (uniqueTeamMembers.size !== teamMemberIds.length) {
      throw new Error('Duplicate team members not allowed');
    }
    
    // Validate location
    if (!this.locations.has(locationName)) {
      throw new Error('Invalid location');
    }
    
    // Create team (scout + bodyguard + additional members)
    const teamMembers = [scoutId, bodyguardId];
    teamMemberIds.forEach(id => {
      if (!teamMembers.includes(id)) {
        teamMembers.push(id);
      }
    });
    
    this.proposedMission = {
      scout: scoutId,
      bodyguard: bodyguardId,
      teamMembers: teamMembers,
      location: locationName
    };
    
    // Reset votes
    this.votes.clear();
    
    this.setActivity(scoutId, 'team_proposed', {
      bodyguard: this.players.get(bodyguardId)?.name,
      location: locationName,
      teamSize: this.proposedMission.teamMembers.length
    });
    
    this.addToGameLog('team_proposed', this.players.get(scoutId).name, {
      bodyguard: this.players.get(bodyguardId).name,
      location: locationName,
      teamMembers: teamMembers.map(id => this.players.get(id).name),
      teamSize: teamMembers.length,
      round: this.round
    });
    
    this.phase = 'round_voting';
    console.log(`🗳️ Mission proposed: ${this.players.get(bodyguardId).name} as bodyguard to ${locationName}`);
    console.log(`Team: ${teamMembers.map(id => this.players.get(id)?.name).join(', ')}`);
    
    return true;
  }

  castVote(playerId, vote) {
    console.log(`🗳️ Vote received from ${this.players.get(playerId)?.name}: ${vote}`);
    
    if (this.phase !== 'round_voting' && this.phase !== 'final_accusation_voting') {
        console.error(`Invalid phase for voting: ${this.phase}`);
        throw new Error(`Game must be in voting phase (current: ${this.phase})`);
    }
    
    if (!this.players.has(playerId)) {
        console.error(`Invalid player: ${playerId}`);
        throw new Error('Invalid player');
    }
    
    if (this.votes.has(playerId)) {
        console.log(`Player ${this.players.get(playerId).name} already voted - overriding`);
    }
    
    this.votes.set(playerId, vote);
    
    console.log(`Votes so far: ${this.votes.size}/${this.playerCount}`);
    
    // Check if all votes are in
    if (this.votes.size === this.playerCount) {
        console.log('🗳️ All votes collected, resolving...');
        this.resolveVote();
    }
    
    this.setActivity(playerId, 'vote_cast', {
      vote: vote,
      location: this.proposedMission?.location,
      votesReceived: this.votes.size,
      totalPlayers: this.playerCount
    });
    
    this.addToGameLog('vote_cast', this.players.get(playerId).name, {
      vote: vote,
      location: this.proposedMission?.location,
      votesReceived: this.votes.size,
      totalPlayers: this.playerCount
    });
    
    return true;
  }

  resolveVote() {
    const approveVotes = Array.from(this.votes.values()).filter(v => v === 'approve').length;
    const rejectVotes = this.votes.size - approveVotes;
    
    console.log(`🗳️ Vote results: ${approveVotes} approve, ${rejectVotes} reject`);
    
    // Clear votes immediately to prevent issues
    this.votes.clear();
    
    if (this.phase === 'final_accusation_voting') {
        this.resolveFinalVote();
        return;
    }
    
    if (approveVotes > rejectVotes) {
        // Vote passes
        console.log('✅ Vote PASSED - Mission approved!');
        this.addToGameLog('vote_passed', 'System', { 
            approveVotes, 
            rejectVotes, 
            location: this.proposedMission.location 
        });
        this.executeApprovedMission();
    } else {
        // Vote fails
        console.log('❌ Vote FAILED - Mission rejected!');
        this.addToGameLog('vote_failed', 'System', { 
            approveVotes, 
            rejectVotes, 
            stormTracker: this.stormTracker + 1 
        });
        this.handleFailedVote();
    }
  }

  executeApprovedMission() {
    // Move players to location
    this.proposedMission.teamMembers.forEach(playerId => {
      const player = this.players.get(playerId);
      const locationData = this.locations.get(this.proposedMission.location);
      
      player.location = this.proposedMission.location;
      locationData.playersPresent.push(playerId);
    });
    
    // Move other players to supply gathering
    this.players.forEach((player, playerId) => {
      if (!this.proposedMission.teamMembers.includes(playerId)) {
        player.location = 'supply_gathering';
      }
    });
    
    // Add Mr. Coral to the location
    this.locations.get(this.proposedMission.location).playersPresent.push('mr_coral');
    
    // Set bodyguard
    this.currentBodyguard = this.proposedMission.bodyguard;
    
    // Reset storm tracker
    this.stormTracker = 0;
    
    this.phase = 'round_plot_check';
    console.log(`✅ Mission approved! Team heading to ${this.proposedMission.location}`);
  }

  handleFailedVote() {
    this.stormTracker++;
    
    console.log(`⛈️ Vote failed! Storm tracker: ${this.stormTracker}/3`);
    
    if (this.stormTracker >= 3) {
        // Mr. Coral takes damage
        this.coralHealth--;
        this.stormTracker = 0;
        
        console.log(`💔 Three failed votes! Mr. Coral takes damage (${this.coralHealth}/3)`);
        
        if (this.coralHealth <= 0) {
            this.handleCoralDeath();
            return;
        }
    }
    
    // Clear current mission and votes
    this.proposedMission = null;
    this.votes.clear();
    this.currentBodyguard = null;
    
    // Move scout to next player
    this.rotateScout();
    
    this.phase = 'round_choose_team';
    console.log(`🎯 New round begins. Scout: ${this.players.get(this.currentScout).name}`);
  }

  checkPlot() {
    if (this.phase !== 'round_plot_check') {
      throw new Error('Game must be in plot check phase');
    }
    
    // This should be called after everyone asks "Has the plot been activated?"
    const plotActivated = (
      this.coralHealth < 3 && // Mr. Coral has taken at least one damage
      this.proposedMission.location === this.plotLocation && // Current location matches plot
      this.currentBodyguard === this.ringleaderId // Ringleader is the bodyguard
    );
    
    console.log(`🕵️ Plot check: Health=${this.coralHealth < 3}, Location=${this.proposedMission.location === this.plotLocation}, Bodyguard=${this.currentBodyguard === this.ringleaderId}`);
    
    if (plotActivated) {
      this.addToGameLog('plot_activated', 'System', {
        location: this.plotLocation,
        weapon: this.plotWeapon,
        ringleader: this.players.get(this.ringleaderId).name
      });
      this.endGame('conspiracy_plot');
      return { activated: true };
    }
    
    this.phase = 'round_disarm_traps';
    return { activated: false };
  }

  submitSupplyCards(playerId, cardIds) {
    // Input validation
    if (!playerId || typeof playerId !== 'string') {
      throw new Error('Invalid player ID');
    }
    
    if (!Array.isArray(cardIds)) {
      throw new Error('Card IDs must be an array');
    }
    
    if (cardIds.length === 0) {
      throw new Error('Must submit at least one card');
    }
    
    if (this.phase !== 'round_disarm_traps') {
      throw new Error('Game must be in trap disarming phase');
    }
    
    if (!this.proposedMission || !this.proposedMission.teamMembers.includes(playerId)) {
      throw new Error('Only team members can submit supply cards');
    }
    
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error('Player not found');
    }
    
    // Check for duplicate submission
    if (this.supplyContributions.has(playerId)) {
      throw new Error('Player has already submitted cards');
    }
    
    // Validate card ownership and IDs
    const submittedCards = [];
    const invalidCards = [];
    
    cardIds.forEach(cardId => {
      if (!cardId || typeof cardId !== 'string') {
        invalidCards.push(cardId);
        return;
      }
      
      const cardIndex = player.supplyCards.findIndex(card => card.id === cardId);
      if (cardIndex === -1) {
        invalidCards.push(cardId);
      } else {
        submittedCards.push(player.supplyCards.splice(cardIndex, 1)[0]);
      }
    });
    
    if (invalidCards.length > 0) {
      // Restore removed cards
      player.supplyCards.push(...submittedCards);
      throw new Error(`Invalid card IDs: ${invalidCards.join(', ')}`);
    }
    
    this.supplyContributions.set(playerId, submittedCards);
    
    // Check if all team members have submitted
    const allSubmitted = this.proposedMission.teamMembers.every(memberId => 
      this.supplyContributions.has(memberId)
    );
    
    if (allSubmitted) {
      // ENHANCED: Return the trap disarm result for broadcasting
      const result = this.resolveTrapDisarming();
      this.addToGameLog('supply_contributed', player.name, {
        location: this.proposedMission.location,
        cardsSubmitted: submittedCards.map(card => ({ value: card.value, suit: card.suit })),
        totalContribution: submittedCards.length,
        teamMembersSubmitted: this.supplyContributions.size,
        totalTeamMembers: this.proposedMission.teamMembers.length
      });
      return { 
        submitted: true, 
        allSubmitted: true, 
        disarmResult: result 
      };
    }
    
    // ✅ NEW: Broadcast individual contribution
    const progressUpdate = {
        playerName: player.name,
        submitted: this.supplyContributions.size,
        total: this.proposedMission.teamMembers.length,
        phase: this.phase
    };
    
    // Broadcast to all players so non-team members can see progress
    // This would be added to the socket handler
    
    return { submitted: true, allSubmitted: false };
  }

  resolveTrapDisarming() {
    const locationData = this.locations.get(this.proposedMission.location);
    const trap = locationData.trap;
    
    // Calculate total value with detailed breakdown
    let totalValue = 0;
    const allSubmittedCards = [];
    const contributionBreakdown = {};
    
    this.supplyContributions.forEach((cards, playerId) => {
      allSubmittedCards.push(...cards);
      contributionBreakdown[playerId] = {
        playerName: this.players.get(playerId).name,
        cards: cards.map(card => ({ value: card.value, suit: card.suit })),
        contribution: 0
      };
    });
    
    // For 4-player games, add random card from deck
    if (this.playerCount === 4 && this.supplyDeck.length > 0) {
      this.ensureSupplyAvailable();
      const randomCard = this.supplyDeck.pop();
      allSubmittedCards.push(randomCard);
      contributionBreakdown['deck'] = {
        playerName: 'Random Draw',
        cards: [{ value: randomCard.value, suit: randomCard.suit }],
        contribution: 0
      };
    }
    
    // Calculate points with detailed tracking
    allSubmittedCards.forEach(card => {
      let cardValue = 0;
      if (card.value === 1) {
        cardValue = 1; // Value 1 cards always count positively
      } else if (card.value === 2) {
        if (trap.suit === 'Trip Wire') {
          cardValue = 2; // Trip Wire accepts both Triangle and Circle
        } else if (card.suit === trap.suit) {
          cardValue = 2; // Suit matches
        } else {
          cardValue = -2; // Suit doesn't match - subtract points
        }
      }
      totalValue += cardValue;
      
      // Track contribution by player
      const contributor = Object.keys(contributionBreakdown).find(playerId => {
        return contributionBreakdown[playerId].cards.some(c => 
          c.value === card.value && c.suit === card.suit
        );
      });
      if (contributor) {
        contributionBreakdown[contributor].contribution += cardValue;
      }
    });
    
    // Add cards to discard pile
    this.supplyDiscard.push(...allSubmittedCards);
    
    const success = totalValue >= trap.value;
    const previousTrapsRemaining = this.trapsRemaining;
    
    // Update game state
    locationData.trap = null;
    locationData.visited = true;
    this.trapsRemaining--;
    
    if (success) {
      console.log(`✅ Trap disarmed at ${this.proposedMission.location} (${totalValue}/${trap.value})`);
      
      // Check if all traps are gone (Friends win condition)
      if (this.trapsRemaining === 0) {
        this.endGame('friends_traps');
        return { 
          success: true, 
          totalValue, 
          requiredValue: trap.value, 
          location: this.proposedMission.location,
          contributionBreakdown,
          trapsRemaining: this.trapsRemaining,
          gameEnded: true 
        };
      }
    } else {
      // Mr. Coral takes damage
      this.coralHealth--;
      console.log(`❌ Trap not disarmed at ${this.proposedMission.location} (${totalValue}/${trap.value}). Mr. Coral takes damage!`);
      
      if (this.coralHealth <= 0) {
        this.handleCoralDeath();
        return { 
          success: false, 
          totalValue, 
          requiredValue: trap.value, 
          location: this.proposedMission.location,
          contributionBreakdown,
          trapsRemaining: this.trapsRemaining,
          coralDied: true 
        };
      }
    }
    
    // Clear contributions and advance phase
    this.supplyContributions.clear();
    this.phase = 'round_collect_clues';
    
    // Add game log entry
    this.addToGameLog('trap_result', 'System', {
      success,
      location: this.proposedMission.location,
      totalValue,
      requiredValue: trap.value,
      trapsRemaining: this.trapsRemaining
    });
    
    return { 
      success, 
      totalValue, 
      requiredValue: trap.value,
      location: this.proposedMission.location,
      contributionBreakdown,
      trapsRemaining: this.trapsRemaining
    };
  }

  collectClues(bodyguardId, claimData = {}) {
    // Input validation
    if (!bodyguardId || typeof bodyguardId !== 'string') {
      throw new Error('Invalid bodyguard ID');
    }
    
    if (claimData && typeof claimData !== 'object') {
      throw new Error('Claim data must be an object');
    }
    
    if (this.phase !== 'round_collect_clues') {
      throw new Error('Game must be in clue collection phase');
    }
    
    if (this.currentBodyguard !== bodyguardId) {
      throw new Error('Only the bodyguard can collect clues');
    }
    
    const player = this.players.get(bodyguardId);
    if (!player) {
      throw new Error('Bodyguard player not found');
    }
    
    // Validate claim data structure
    if (claimData.weaponClaims && !Array.isArray(claimData.weaponClaims)) {
      throw new Error('Weapon claims must be an array');
    }
    
    if (claimData.locationClaims && !Array.isArray(claimData.locationClaims)) {
      throw new Error('Location claims must be an array');
    }
    
    // Store the actual clues found for later verification
    const actualClues = [...this.locations.get(this.proposedMission.location).clues];
    
    // Add clues to player's hand
    player.clueCards.push(...this.locations.get(this.proposedMission.location).clues);
    
    // Process claims with validation
    const claimResults = {
      weaponClaims: [],
      locationClaims: [],
      instantDisarms: 0,
      noCluesFound: 0
    };
    
    if (claimData.weaponClaims) {
      claimData.weaponClaims.forEach(weapon => {
        player.claimedClues.weapons.push(weapon);
        claimResults.weaponClaims.push(weapon);
      });
    }
    
    if (claimData.locationClaims) {
      claimData.locationClaims.forEach(location => {
        player.claimedClues.locations.push(location);
        claimResults.locationClaims.push(location);
      });
    }
    
    // Count special cards
    actualClues.forEach(clue => {
      if (clue.cardType === 'instant_disarm') {
        claimResults.instantDisarms++;
      } else if (clue.cardType === 'no_clue') {
        claimResults.noCluesFound++;
      }
    });
    
    // Clear clues from location
    this.locations.get(this.proposedMission.location).clues = [];
    
    this.phase = 'round_supply_distribution';
    
    // Add game log entry
    this.addToGameLog('clues_collected', player.name, {
      location: this.proposedMission.location,
      claimResults
    });
    
    console.log(`🔍 Clues collected by ${player.name} at ${this.proposedMission.location}`);
    
    return {
      success: true,
      bodyguardName: player.name,
      location: this.proposedMission.location,
      claimResults
    };
  }

  prepareSupplyDistribution(scoutId) {
    if (this.phase !== 'round_supply_distribution') {
      throw new Error('Game must be in supply distribution phase');
    }
    
    if (this.currentScout !== scoutId) {
      throw new Error('Only the scout can prepare supply distribution');
    }
    
    // Draw cards equal to number of pawns at location (team + Mr. Coral)
    const pawnCount = this.proposedMission.teamMembers.length + 1; // +1 for Mr. Coral
    
    const drawnCards = [];
    for (let i = 0; i < pawnCount; i++) {
      this.ensureSupplyAvailable();
      if (this.supplyDeck.length > 0) {
        drawnCards.push(this.supplyDeck.pop());
      }
    }
    
    // Store drawn cards for distribution
    this.pendingSupplyDistribution = {
      drawnCards,
      teamMembers: this.proposedMission.teamMembers,
      distributed: false
    };
    
    console.log(`🎒 Drew ${drawnCards.length} supply cards for distribution at ${this.proposedMission.location}`);
    
    return {
      drawnCards: drawnCards.map(card => ({ id: card.id, value: card.value, suit: card.suit })),
      teamMembers: this.proposedMission.teamMembers.map(id => ({
        id,
        name: this.players.get(id).name,
        currentCards: this.players.get(id).supplyCards.length,
        maxCards: this.playerCount === 4 ? 4 : 3
      }))
    };
  }

  distributeSupplies(scoutId) {
    // For backward compatibility, auto-distribute randomly
    const result = this.prepareSupplyDistribution(scoutId);
    
    // Auto-distribute cards randomly to team members
    const { drawnCards, teamMembers } = this.pendingSupplyDistribution;
    const distribution = [];
    
    drawnCards.forEach((card, index) => {
      const targetPlayer = teamMembers[index % teamMembers.length];
      distribution.push({ cardId: card.id, playerId: targetPlayer });
    });
    
    return this.executeSupplyDistribution(scoutId, distribution);
  }

  executeSupplyDistribution(scoutId, distribution) {
    if (!this.pendingSupplyDistribution || this.pendingSupplyDistribution.distributed) {
      throw new Error('No pending distribution or already completed');
    }
    
    if (this.currentScout !== scoutId) {
      throw new Error('Only the scout can execute distribution');
    }
    
    // Validate distribution
    const { drawnCards, teamMembers } = this.pendingSupplyDistribution;
    
    // Apply distribution
    distribution.forEach(({ cardId, playerId }) => {
      const card = drawnCards.find(c => c.id === cardId);
      const player = this.players.get(playerId);
      
      if (card && player && teamMembers.includes(playerId)) {
        const maxCards = this.playerCount === 4 ? 4 : 3;
        this.ensureSupplyAvailable();
        if (player.supplyCards.length < maxCards) {
          player.supplyCards.push(card);
          // Remove from drawn cards
          const cardIndex = drawnCards.findIndex(c => c.id === cardId);
          if (cardIndex !== -1) {
            drawnCards.splice(cardIndex, 1);
          }
        }
      }
    });
    
    // Discard any remaining cards
    this.supplyDiscard.push(...drawnCards);
    
    // Non-team members draw 1 card each
    this.players.forEach((player, playerId) => {
      if (!teamMembers.includes(playerId)) {
        const maxCards = this.playerCount === 4 ? 4 : 3;
        this.ensureSupplyAvailable();
        if (player.supplyCards.length < maxCards && this.supplyDeck.length > 0) {
          player.supplyCards.push(this.supplyDeck.pop());
        }
      }
    });
    
    this.pendingSupplyDistribution.distributed = true;
    this.endRound();
    
    console.log(`🎒 Supply distribution completed by ${this.players.get(scoutId).name}`);
    return { success: true };
  }

  endRound() {
    // Clear locations
    this.locations.forEach(locationData => {
      locationData.playersPresent = [];
    });
    
    // Reset player locations
    this.players.forEach(player => {
      player.location = null;
    });
    
    // Store previous roles
    this.previousRoles.scout = this.currentScout;
    this.previousRoles.bodyguard = this.currentBodyguard;
    
    // Rotate scout
    this.rotateScout();
    
    // Reset round state
    this.currentBodyguard = null;
    this.proposedMission = null;
    this.votes.clear();
    this.supplyContributions.clear();
    
    this.round++;
    this.phase = 'round_choose_team';
    
    console.log(`🔄 Round ${this.round} begins. Scout: ${this.players.get(this.currentScout).name}`);
    
    this.addToGameLog('round_ended', 'System', {
      completedRound: this.round - 1,
      newRound: this.round,
      newScout: this.players.get(this.currentScout).name,
      trapsRemaining: this.trapsRemaining,
      coralHealth: this.coralHealth
    });
  }

  rotateScout() {
    const playerIds = Array.from(this.players.keys());
    const currentIndex = playerIds.indexOf(this.currentScout);
    let nextIndex = (currentIndex + 1) % playerIds.length;
    
    // Apply official rules: previous scout or bodyguard cannot be scout/bodyguard next round
    const previousScout = this.previousRoles.scout;
    const previousBodyguard = this.previousRoles.bodyguard;
    
    let attempts = 0;
    const maxAttempts = playerIds.length * 2; // Prevent infinite loops
    
    while (attempts < maxAttempts) {
      const candidate = playerIds[nextIndex];
      
      // In games with 4-5 players, be more flexible with restrictions
      if (this.playerCount <= 5) {
        // Only avoid immediate previous scout
        if (candidate !== previousScout) {
          this.currentScout = candidate;
          console.log(`🎯 Scout rotated to: ${this.players.get(this.currentScout).name}`);
          return;
        }
      } else {
        // Larger games: avoid both previous scout and bodyguard
        if (candidate !== previousScout && candidate !== previousBodyguard) {
          this.currentScout = candidate;
          console.log(`🎯 Scout rotated to: ${this.players.get(this.currentScout).name}`);
          return;
        }
      }
      
      nextIndex = (nextIndex + 1) % playerIds.length;
      attempts++;
    }
    
    // Fallback: if we can't find eligible player, use next in rotation
    console.warn('⚠️ Could not find eligible scout with restrictions - using next player');
    this.currentScout = playerIds[(currentIndex + 1) % playerIds.length];
    console.log(`🎯 Scout (fallback) rotated to: ${this.players.get(this.currentScout).name}`);
  }

  handleCoralDeath() {
    console.log(`💀 Mr. Coral has died! Starting final accusation process`);
    
    // Step 1: Rotate to next scout for final round
    this.rotateScout();
    this.phase = 'final_accusation_setup';
    this.finalAccusationVoteCount = 0; // Track failed votes
    
    console.log(`⚖️ Final round scout: ${this.players.get(this.currentScout).name}`);
  }

  // New method for final accusation team selection
  proposeFinalTeam(scoutId, teamMemberIds) {
    if (this.phase !== 'final_accusation_setup') {
      throw new Error('Game must be in final accusation setup phase');
    }
    
    if (this.currentScout !== scoutId) {
      throw new Error('Only the current scout can propose final team');
    }
    
    // No bodyguard or location needed for final round
    this.proposedMission = {
      scout: scoutId,
      bodyguard: null,
      teamMembers: teamMemberIds, // Just the chosen team
      location: null
    };
    
    this.votes.clear();
    this.phase = 'final_accusation_voting';
    
    console.log(`📋 Final team proposed: ${teamMemberIds.length} members`);
    return true;
  }

  // Updated final accusation handling
  resolveFinalVote() {
    const approveVotes = Array.from(this.votes.values()).filter(v => v === 'approve').length;
    const rejectVotes = this.votes.size - approveVotes;
    
    if (approveVotes > rejectVotes) {
      // Vote passes - distribute clues and start discussion
      this.distributeFinalClues();
      this.phase = 'final_accusation';
      
      // Start SERVER-SIDE 5-minute timer
      this.finalAccusationStartTime = Date.now();
      
      if (this.finalAccusationTimer) {
        clearTimeout(this.finalAccusationTimer);
      }
      
      this.finalAccusationTimer = setTimeout(() => {
        console.log('⏰ Final accusation time limit reached - Conspiracy wins by default');
        this.endGame('time_limit');
      }, 5 * 60 * 1000); // 5 minutes
      
      console.log('⏰ Final accusation phase started - 5 minute timer active');
      
    } else {
      // Vote fails
      this.finalAccusationVoteCount++;
      
      if (this.finalAccusationVoteCount >= 3) {
        this.endGame('conspiracy_votes');
        return;
      }
      
      this.rotateScout();
      this.proposedMission = null;
      this.votes.clear();
      this.phase = 'final_accusation_setup';
    }
  }

  distributeFinalClues() {
    // Collect ALL remaining clue cards from ALL locations
    const allRemainingClues = [];
    this.locations.forEach(locationData => {
      allRemainingClues.push(...locationData.clues);
      locationData.clues = []; // Clear location clues
    });
    
    // Remove all remaining traps (as per rules)
    this.locations.forEach(locationData => {
      locationData.trap = null;
    });
    
    // Shuffle and deal to chosen team members one at a time
    const shuffledClues = shuffleArray(allRemainingClues);
    const teamMembers = this.proposedMission.teamMembers;
    
    shuffledClues.forEach((clue, index) => {
      const playerIndex = index % teamMembers.length;
      const playerId = teamMembers[playerIndex];
      this.players.get(playerId).clueCards.push(clue);
    });
    
    console.log(`🃏 Distributed ${shuffledClues.length} remaining clues to final team`);
  }

  makeFinalAccusation(who, where, what) {
    // Input validation
    if (!who || typeof who !== 'string' || who.trim() === '') {
      throw new Error('WHO must be a valid character name');
    }
    
    if (!where || typeof where !== 'string' || where.trim() === '') {
      throw new Error('WHERE must be a valid location name');
    }
    
    if (!what || typeof what !== 'string' || what.trim() === '') {
      throw new Error('WHAT must be a valid weapon name');
    }
    
    if (this.phase !== 'final_accusation') {
      throw new Error('Game must be in final accusation phase');
    }
    
    // Validate accusation values against game data
    const validCharacters = Array.from(this.players.values()).map(p => p.character);
    if (!validCharacters.includes(who.trim())) {
      throw new Error(`Invalid character: ${who}. Must be one of: ${validCharacters.join(', ')}`);
    }
    
    const validLocations = Array.from(this.locations.keys());
    if (!validLocations.includes(where.trim())) {
      throw new Error(`Invalid location: ${where}. Must be one of: ${validLocations.join(', ')}`);
    }
    
    const validWeapons = ['Rope', 'Knife', 'Candlestick', 'Revolver', 'Lead Pipe', 'Wrench'];
    if (!validWeapons.includes(what.trim())) {
      throw new Error(`Invalid weapon: ${what}. Must be one of: ${validWeapons.join(', ')}`);
    }
    
    // Check if accusation is correct (rest of existing logic)
    const ringleaderCharacter = this.players.get(this.ringleaderId).character;
    const correct = (who === ringleaderCharacter && where === this.plotLocation && what === this.plotWeapon);
    
    this.addToGameLog('final_accusation', 'System', { who, where, what, correct });
    
    if (correct) {
      this.endGame('friends_accusation');
    } else {
      this.endGame('conspiracy_accusation');
    }
    
    return {
      correct,
      actualWho: ringleaderCharacter,
      actualWhere: this.plotLocation,
      actualWhat: this.plotWeapon
    };
  }

  endGame(reason) {
    this.gameEnded = true;
    this.phase = 'game_over';
    
    switch (reason) {
      case 'friends_traps':
        this.winner = 'friends';
        console.log(`🎉 Game ${this.id} ended: Friends win by disarming all traps!`);
        break;
      case 'friends_accusation':
        this.winner = 'friends';
        console.log(`🎉 Game ${this.id} ended: Friends win by correct accusation!`);
        break;
      case 'conspiracy_plot':
        this.winner = 'conspiracy';
        console.log(`🕵️ Game ${this.id} ended: Conspiracy wins by plot activation!`);
        break;
      case 'conspiracy_accusation':
        this.winner = 'conspiracy';
        console.log(`🕵️ Game ${this.id} ended: Conspiracy wins by failed accusation!`);
        break;
      default:
        console.log(`🎮 Game ${this.id} ended: ${reason}`);
    }
  }

  // Activity tracking
  setActivity(playerId, action, details = {}) {
    const player = this.players.get(playerId);
    if (!player) return;
    
    this.currentActivity = {
      playerId,
      playerName: player.name,
      action,
      details,
      timestamp: Date.now()
    };
    
    // Add to game log
    this.addToGameLog(action, player.name, details);
  }

  addToGameLog(action, playerName, details = {}) {
    if (!this.gameLog) this.gameLog = [];
    
    const logEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      round: this.round,
      action,
      playerName,
      details,
      phase: this.phase
    };
    
    this.gameLog.push(logEntry);
    
    // Keep only last 50 entries
    if (this.gameLog.length > 50) {
      this.gameLog = this.gameLog.slice(-50);
    }
  }

  getActivityStatus() {
    switch (this.phase) {
      case 'setup':
        return {
          primary: 'Game starting...',
          secondary: 'Preparing first round',
          active: []
        };
        
      case 'round_choose_team':
        const scoutName = this.players.get(this.currentScout)?.name;
        if (!scoutName) {
          return {
            primary: 'Setting up round...',
            secondary: 'Determining scout',
            active: []
          };
        }
        return {
          primary: `${scoutName} choosing team and location`,
          secondary: `Round ${this.round} - Scout phase`,
          active: [this.currentScout]
        };
        
      case 'round_voting':
        const voted = this.votes.size;
        const remaining = this.playerCount - voted;
        const notVoted = Array.from(this.players.keys()).filter(id => !this.votes.has(id));
        
        return {
          primary: `Voting on mission (${voted}/${this.playerCount} voted)`,
          secondary: `Waiting for ${remaining} more vote${remaining !== 1 ? 's' : ''}`,
          active: notVoted
        };
        
      case 'round_disarm_traps':
        const contributed = this.supplyContributions.size;
        const teamSize = this.proposedMission?.teamMembers.length || 0;
        const notContributed = this.proposedMission?.teamMembers.filter(id => !this.supplyContributions.has(id)) || [];
        
        return {
          primary: `Disarming trap at ${this.proposedMission?.location}`,
          secondary: `Team members selecting supply cards (${contributed}/${teamSize} submitted)`,
          active: notContributed
        };
        
      case 'round_collect_clues':
        const bodyguardName = this.players.get(this.currentBodyguard)?.name;
        return {
          primary: `${bodyguardName} collecting clues`,
          secondary: `Bodyguard deciding what to tell the group`,
          active: [this.currentBodyguard]
        };
        
      case 'round_supply_distribution':
        const scoutName2 = this.players.get(this.currentScout)?.name;
        return {
          primary: `${scoutName2} distributing supply cards`,
          secondary: `Scout managing supply distribution`,
          active: [this.currentScout]
        };
        
      case 'final_accusation':
        return {
          primary: `Final Accusation Phase`,
          secondary: `Discuss and vote on WHO, WHERE, and WHAT`,
          active: Array.from(this.players.keys())
        };
        
      default:
        return {
          primary: this.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          secondary: '',
          active: []
        };
    }
  }

  // Add new method for conspiracy setup
  beginConspiracyPhase() {
    if (this.phase !== 'conspiracy_setup') {
      throw new Error('Game must be in conspiracy setup phase');
    }
    
    this.phase = 'conspiracy_plotting';
    console.log(`🤫 Conspiracy plotting phase started`);
    return true;
  }

  finishConspiracyPhase() {
    if (this.phase !== 'conspiracy_plotting') {
      throw new Error('Game must be in conspiracy plotting phase');
    }
    
    this.phase = 'round_choose_team';
    this.round = 1;
    console.log(`🎯 Starting Round ${this.round} - Scout: ${this.players.get(this.currentScout).name}`);
    return true;
  }

  useInstantDisarm(playerId, cardId) {
    if (this.phase !== 'round_disarm_traps') {
      throw new Error('Can only use instant disarm during trap disarming phase');
    }
    
    if (!this.proposedMission.teamMembers.includes(playerId)) {
      throw new Error('Only team members can use instant disarm');
    }
    
    const player = this.players.get(playerId);
    const cardIndex = player.clueCards.findIndex(card => 
      card.id === cardId && card.cardType === 'instant_disarm'
    );
    
    if (cardIndex === -1) {
      throw new Error('Player does not have this instant disarm card');
    }
    
    // Remove the card
    player.clueCards.splice(cardIndex, 1);
    
    // Instantly disarm the trap
    const locationData = this.locations.get(this.proposedMission.location);
    locationData.trap = null;
    locationData.visited = true;
    this.trapsRemaining--;
    
    console.log(`⚡ Instant disarm used at ${this.proposedMission.location}`);
    
    // Check win condition
    if (this.trapsRemaining === 0) {
      this.endGame('friends_traps');
      return { success: true, instantDisarm: true, gameEnded: true };
    }
    
    // Skip to clue collection
    this.supplyContributions.clear();
    this.phase = 'round_collect_clues';
    
    this.addToGameLog('instant_disarm_used', this.players.get(playerId).name, {
      location: this.proposedMission.location,
      trapsRemaining: this.trapsRemaining,
      autoDisarmed: true
    });
    
    return { success: true, instantDisarm: true };
  }

  handleCriticalPlayerDisconnection(disconnectedPlayerId) {
    console.log(`🚨 Critical player disconnected: ${this.players.get(disconnectedPlayerId)?.name}`);
    
    // If scout disconnects during team selection
    if (this.phase === 'round_choose_team' && this.currentScout === disconnectedPlayerId) {
      console.log('🎯 Scout disconnected during team selection - rotating to next scout');
      this.rotateScout();
      // Reset any partial selections
      this.proposedMission = null;
      this.votes.clear();
      // Stay in the same phase with new scout
    }
    
    // If bodyguard disconnects during clue collection
    if (this.phase === 'round_collect_clues' && this.currentBodyguard === disconnectedPlayerId) {
      console.log('🛡️ Bodyguard disconnected during clue collection - auto-collecting clues');
      // Auto-collect clues with no claims
      this.collectClues(disconnectedPlayerId, null, null);
    }
    
    // If scout disconnects during supply distribution
    if (this.phase === 'round_supply_distribution' && this.currentScout === disconnectedPlayerId) {
      console.log('🎒 Scout disconnected during supply distribution - auto-distributing');
      this.distributeSupplies(disconnectedPlayerId);
    }
    
    // If scout disconnects during final accusation setup
    if (this.phase === 'final_accusation_setup' && this.currentScout === disconnectedPlayerId) {
      console.log('⚖️ Scout disconnected during final accusation setup - rotating scout');
      this.rotateScout();
      // Stay in the same phase with new scout
    }
  }

  rejoinGame(socketId, playerName) {
    // Find if this player was in the game before
    const existingPlayer = Array.from(this.players.values()).find(p => p.name === playerName);
    
    if (existingPlayer && this.phase !== 'lobby') {
      // Update their socket ID
      this.players.delete(existingPlayer.id);
      existingPlayer.id = socketId;
      this.players.set(socketId, existingPlayer);
      
      // Update role references
      if (this.currentScout === existingPlayer.id) this.currentScout = socketId;
      if (this.currentBodyguard === existingPlayer.id) this.currentBodyguard = socketId;
      if (this.ringleaderId === existingPlayer.id) this.ringleaderId = socketId;
      if (this.accompliceIds.includes(existingPlayer.id)) {
        const index = this.accompliceIds.indexOf(existingPlayer.id);
        this.accompliceIds[index] = socketId;
      }
      
      console.log(`✅ Player ${playerName} rejoined game ${this.id}`);
      return true;
    }
    
    return false;
  }

  recoverFromError(errorType, details = {}) {
    console.log(`🔄 Attempting error recovery: ${errorType}`, details);
    
    switch (errorType) {
      case 'invalid_scout':
        // Find a valid scout
        const validScouts = Array.from(this.players.keys()).filter(id => 
          id !== this.previousRoles.scout && id !== this.previousRoles.bodyguard
        );
        if (validScouts.length > 0) {
          this.currentScout = validScouts[0];
          console.log(`🎯 Emergency scout assignment: ${this.players.get(this.currentScout).name}`);
        }
        break;
        
      case 'missing_bodyguard':
        // Clear bodyguard requirement and continue
        this.currentBodyguard = null;
        console.log('🛡️ Bodyguard requirement cleared due to error');
        break;
        
      case 'phase_desync':
        // Reset to a safe phase
        this.phase = 'round_choose_team';
        this.votes.clear();
        this.proposedMission = null;
        console.log('🔄 Phase reset to team selection due to desync');
        break;
    }
  }

  ensureSupplyAvailable() {
    // If supply deck is empty but discard pile has cards, reshuffle
    if (this.supplyDeck.length === 0 && this.supplyDiscard.length > 0) {
      console.log(`🔄 Supply deck empty - reshuffling ${this.supplyDiscard.length} discarded cards`);
      this.supplyDeck = shuffleArray([...this.supplyDiscard]);
      this.supplyDiscard = [];
    }
  }

  validateGameState() {
    // Comprehensive game state validation
    if (!this.players || this.players.size === 0) {
      throw new Error('Game has no players');
    }
    
    if (this.playerCount !== this.players.size) {
      console.warn(`⚠️ Player count mismatch: ${this.playerCount} vs ${this.players.size}`);
    }
    
    if (this.currentScout && !this.players.has(this.currentScout)) {
      throw new Error('Current scout is not a valid player');
    }
    
    if (this.currentBodyguard && !this.players.has(this.currentBodyguard)) {
      throw new Error('Current bodyguard is not a valid player');
    }
    
    if (this.coralHealth < 0 || this.coralHealth > 3) {
      throw new Error(`Invalid coral health: ${this.coralHealth}`);
    }
    
    if (this.trapsRemaining < 0 || this.trapsRemaining > 9) {
      throw new Error(`Invalid traps remaining: ${this.trapsRemaining}`);
    }
  }

  // Enhanced error handling in socket handlers
  safeExecute(operation, errorContext) {
    try {
      this.validateGameState();
      return operation();
    } catch (error) {
      console.error(`❌ Error in ${errorContext}:`, error.message);
      this.addToGameLog('error', 'System', { 
        context: errorContext, 
        error: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
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
      
      // Try to rejoin first
      if (game.rejoinGame(socket.id, playerName)) {
        socket.join(gameId);
        socket.emit('joined_game', { gameId, playerId: socket.id });
        
        // Send current game state
        console.log('📡 Sending game state to rejoined player...');
        io.to(gameId).emit('game_state', game.getPublicGameState());
        socket.emit('private_state', game.getPrivateGameState(socket.id));
        
        console.log(`🔄 Player ${playerName} rejoined game ${gameId}`);
        return;
      }
      
      // Otherwise try to add as new player
      const success = game.addPlayer(socket.id, playerName);
      
      if (success) {
        socket.join(gameId);
        socket.emit('joined_game', { gameId, playerId: socket.id });
        
        // ✅ IMPORTANT: Send game state to ALL players after new player joins
        console.log('📡 Broadcasting updated game state to all players...');
        const publicState = game.getPublicGameState();
        console.log('📡 Public state player count:', publicState.playerCount);
        console.log('📡 Public state players:', publicState.players?.length);
        
        io.to(gameId).emit('game_state', publicState);
        socket.emit('private_state', game.getPrivateGameState(socket.id));
        
        console.log(`✅ Player ${playerName} joined game ${gameId} - broadcasted to all`);
      } else {
        socket.emit('join_failed', { reason: 'Game is full or already started' });
      }
    } catch (error) {
      console.error('❌ Error in join_game:', error);
      socket.emit('join_failed', { reason: 'Server error' });
    }
  });
  
  socket.on('start_game', (data) => {
    console.log('🎮 Starting game:', data);
    
    try {
      const { gameId } = data;
      const game = games.get(gameId);
      
      if (game && game.startGame()) {
        // Send updated game state to all players
        io.to(gameId).emit('game_state', game.getPublicGameState());
        
        // Send private states to all players
        game.players.forEach((player, playerId) => {
          io.to(playerId).emit('private_state', game.getPrivateGameState(playerId));
        });
        
        // Send activity update immediately
        const activity = game.getActivityStatus();
        io.to(gameId).emit('activity_update', activity);
        
        console.log(`✅ Game ${gameId} started successfully`);
      } else {
        socket.emit('start_failed', { reason: 'Cannot start game' });
      }
    } catch (error) {
      console.error('❌ Error starting game:', error);
      socket.emit('start_failed', { reason: error.message });
    }
  });
  
  socket.on('propose_team', (data) => {
    try {
      const { gameId, bodyguardId, teamMemberIds, locationName } = data;
      const game = games.get(gameId);
      
      if (game && game.proposeTeam(socket.id, bodyguardId, teamMemberIds, locationName)) {
        io.to(gameId).emit('game_state', game.getPublicGameState());
        console.log(`🎯 Team proposed for game ${gameId}`);
      }
    } catch (error) {
      console.error('❌ Error in propose_team:', error);
      socket.emit('error', error.message);
    }
  });
  
  socket.on('cast_vote', (data) => {
    try {
      const { gameId, vote } = data;
      const game = games.get(gameId);
      
      if (game && game.castVote(socket.id, vote)) {
        io.to(gameId).emit('game_state', game.getPublicGameState());
        console.log(`🗳️ Vote received from ${socket.id}: ${vote}`);
      }
    } catch (error) {
      console.error('❌ Error in cast_vote:', error);
      socket.emit('error', error.message);
    }
  });

  socket.on('check_plot', (data) => {
    try {
      const { gameId } = data;
      const game = games.get(gameId);
      
      if (game) {
        const result = game.checkPlot();
        io.to(gameId).emit('plot_check_result', result);
        io.to(gameId).emit('game_state', game.getPublicGameState());
        console.log(`🎯 Plot checked in game ${gameId}: ${result.activated ? 'ACTIVATED' : 'Not activated'}`);
      }
    } catch (error) {
      console.error('❌ Error in check_plot:', error);
      socket.emit('error', error.message);
    }
  });

  socket.on('submit_supply_cards', (data) => {
    try {
      const { gameId, cardIds } = data;
      const game = games.get(gameId);
      
      if (game) {
        const result = game.submitSupplyCards(socket.id, cardIds);
        
        // Update game state for all players
        io.to(gameId).emit('game_state', game.getPublicGameState());
        
        // Update private states
        game.players.forEach((player, playerId) => {
          io.to(playerId).emit('private_state', game.getPrivateGameState(playerId));
        });
        
        // ENHANCED: Broadcast trap disarm result if all submitted
        if (result.allSubmitted && result.disarmResult) {
          io.to(gameId).emit('disarm_result', result.disarmResult);
          
          // Add notification for all players
          const notification = {
            type: result.disarmResult.success ? 'success' : 'error',
            message: result.disarmResult.success ? 
              `🔓 Trap at ${result.disarmResult.location} disarmed!` : 
              `💥 Trap at ${result.disarmResult.location} triggered! Mr. Coral takes damage.`,
            details: `Contributed: ${result.disarmResult.totalValue}/${result.disarmResult.requiredValue} points. ${result.disarmResult.trapsRemaining} traps remaining.`
          };
          
          io.to(gameId).emit('notification', notification);
        }
        
        console.log(`🎴 Supply cards submitted in game ${gameId} - All submitted: ${result.allSubmitted}`);
      }
    } catch (error) {
      console.error('❌ Error in submit_supply_cards:', error);
      socket.emit('error', error.message);
    }
  });

  socket.on('collect_clues', (data) => {
    try {
      const { gameId, claimData } = data;
      const game = games.get(gameId);
      
      if (game) {
        const result = game.collectClues(socket.id, claimData);
        
        // Update game state for all players
        io.to(gameId).emit('game_state', game.getPublicGameState());
        
        // Update private states
        game.players.forEach((player, playerId) => {
          io.to(playerId).emit('private_state', game.getPrivateGameState(playerId));
        });
        
        // ENHANCED: Broadcast clue collection result
        io.to(gameId).emit('clue_collection_result', result);
        
        console.log(`🔍 Clues collected in game ${gameId} by ${result.bodyguardName}`);
      }
    } catch (error) {
      console.error('❌ Error in collect_clues:', error);
      socket.emit('error', error.message);
    }
  });

  socket.on('distribute_supplies', (data) => {
    try {
      const { gameId } = data;
      const game = games.get(gameId);
      
      if (game && game.distributeSupplies(socket.id)) {
        io.to(gameId).emit('game_state', game.getPublicGameState());
        
        // Update private states
        game.players.forEach((player, playerId) => {
          io.to(playerId).emit('private_state', game.getPrivateGameState(playerId));
        });
        
        console.log(`🎒 Supplies distributed in game ${gameId}`);
      }
    } catch (error) {
      console.error('❌ Error in distribute_supplies:', error);
      socket.emit('error', error.message);
    }
  });

  socket.on('final_accusation', (data) => {
    try {
      const { gameId, who, where, what } = data;
      const game = games.get(gameId);
      
      if (game) {
        const result = game.makeFinalAccusation(who, where, what);
        io.to(gameId).emit('final_accusation_result', result);
        io.to(gameId).emit('game_state', game.getPublicGameState());
        console.log(`⚖️ Final accusation made in game ${gameId}: ${result.correct ? 'CORRECT' : 'INCORRECT'}`);
      }
    } catch (error) {
      console.error('❌ Error in final_accusation:', error);
      socket.emit('error', error.message);
    }
  });

  socket.on('begin_conspiracy', (data) => {
    try {
      const { gameId } = data;
      const game = games.get(gameId);
      
      if (game && game.beginConspiracyPhase()) {
        io.to(gameId).emit('game_state', game.getPublicGameState());
        console.log(`🤫 Conspiracy phase started in game ${gameId}`);
      }
    } catch (error) {
      console.error('❌ Error in begin_conspiracy:', error);
      socket.emit('error', error.message);
    }
  });
  
  socket.on('finish_conspiracy', (data) => {
    try {
      const { gameId } = data;
      const game = games.get(gameId);
      
      if (game && game.finishConspiracyPhase()) {
        io.to(gameId).emit('game_state', game.getPublicGameState());
        console.log(`🤫 Conspiracy phase finished in game ${gameId}`);
      }
    } catch (error) {
      console.error('❌ Error in finish_conspiracy:', error);
      socket.emit('error', error.message);
    }
  });

  socket.on('prepare_supply_distribution', (data) => {
    try {
      const { gameId } = data;
      const game = games.get(gameId);
      
      if (game) {
        const result = game.prepareSupplyDistribution(socket.id);
        
        // Send distribution interface to scout
        socket.emit('supply_distribution_prepared', result);
        
        console.log(`🎒 Supply distribution prepared in game ${gameId}`);
      }
    } catch (error) {
      console.error('❌ Error in prepare_supply_distribution:', error);
      socket.emit('error', error.message);
    }
  });

  socket.on('execute_supply_distribution', (data) => {
    try {
      const { gameId, distribution } = data;
      const game = games.get(gameId);
      
      if (game) {
        const result = game.executeSupplyDistribution(socket.id, distribution);
        
        // Update game state for all players
        io.to(gameId).emit('game_state', game.getPublicGameState());
        
        // Update private states
        game.players.forEach((player, playerId) => {
          io.to(playerId).emit('private_state', game.getPrivateGameState(playerId));
        });
        
        console.log(`🎒 Supply distribution executed in game ${gameId}`);
      }
    } catch (error) {
      console.error('❌ Error in execute_supply_distribution:', error);
      socket.emit('error', error.message);
    }
  });
});

// Add this at the very end of server.js
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🌟 Clue Conspiracy server is running on port ${PORT}`);
  console.log(`🔗 Open http://localhost:${PORT} in your browser`);
  console.log(`🎮 Ready for players to join!`);
});