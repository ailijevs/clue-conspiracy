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
      this.players.delete(socketId);
      this.playerCount = this.players.size;
      
      // If game is in progress, handle disconnection
      if (this.phase !== 'lobby' && this.playerCount === 0) {
        this.endGame('disconnection');
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
    console.log(`🗺️ Setting up game board for ${this.playerCount} players`);
    
    // Step 1: Create and shuffle location clue cards
    const locationClues = shuffleArray([...LOCATIONS]);
    
    // Step 2: Set plot location (first card goes facedown on board)
    this.plotLocation = locationClues[0];
    
    // Step 3: Set safe location (second card goes faceup near board)
    this.safeLocation = locationClues[1];
    
    // Step 4: Create remaining location clue cards
    const remainingLocationClues = [];
    for (let i = 2; i < locationClues.length; i++) {
      remainingLocationClues.push(createClueCard('location', locationClues[i]));
    }
    
    // Step 5: Add instant disarm and no clue to location pile
    remainingLocationClues.push(createClueCard('instant_disarm'));
    remainingLocationClues.push(createClueCard('no_clue'));
    
    // Step 6: Shuffle location clue cards and distribute one to each location
    const shuffledLocationClues = shuffleArray(remainingLocationClues);
    
    // Step 7: Create weapon clue cards
    const weaponClues = shuffleArray([...WEAPONS]);
    this.plotWeapon = weaponClues[0]; // First weapon is the plot weapon
    
    const weaponClueCards = [];
    for (let i = 1; i < weaponClues.length; i++) {
      weaponClueCards.push(createClueCard('weapon', weaponClues[i]));
    }
    
    // Step 8: Add instant disarms and no clue cards to weapon pile
    weaponClueCards.push(createClueCard('instant_disarm'));
    weaponClueCards.push(createClueCard('no_clue'));
    
    // Step 9: Shuffle weapon clue cards
    const shuffledWeaponClues = shuffleArray(weaponClueCards);
    
    // Step 10: Place clues and traps at each of the 9 locations
    LOCATIONS.forEach((location, index) => {
      const locationData = this.locations.get(location);
      
      // Each location gets exactly 2 clue cards (1 from each pile)
      if (index < shuffledLocationClues.length) {
        locationData.clues.push(shuffledLocationClues[index]);
      }
      if (index < shuffledWeaponClues.length) {
        locationData.clues.push(shuffledWeaponClues[index]);
      }
      
      // Add trap tile to each location
      locationData.trap = createTrapTile(this.playerCount);
    });
    
    console.log(`🎯 Plot: ${this.plotLocation} with ${this.plotWeapon}`);
    console.log(`✅ Safe location: ${this.safeLocation}`);
    console.log(`🃏 Board setup complete with ${this.trapsRemaining} traps`);
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
    if (this.phase !== 'round_choose_team') {
      throw new Error('Game must be in team selection phase');
    }
    
    if (this.currentScout !== scoutId) {
      throw new Error('Only the current scout can propose a team');
    }
    
    // Validate bodyguard selection
    if (!this.players.has(bodyguardId)) {
      throw new Error('Invalid bodyguard selection');
    }
    
    // Scout cannot be bodyguard
    if (bodyguardId === scoutId) {
      throw new Error('Scout cannot be the bodyguard');
    }
    
    // Validate bodyguard selection based on player count
    if (this.playerCount === 4) {
      // 4-player rule: Bodyguard cannot be bodyguard twice in a row
      if (bodyguardId === this.previousRoles.bodyguard) {
        throw new Error('Previous bodyguard cannot be bodyguard again');
      }
    } else {
      // 5+ player rule: Previous bodyguard cannot be bodyguard again
      if (bodyguardId === this.previousRoles.bodyguard) {
        throw new Error('Previous bodyguard cannot be bodyguard again');
      }
    }
    
    // Validate location
    if (!this.locations.has(locationName)) {
      throw new Error('Invalid location');
    }
    
    // Validate team members
    const invalidMembers = teamMemberIds.filter(id => !this.players.has(id));
    if (invalidMembers.length > 0) {
      throw new Error('Invalid team member selection');
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
    
    this.setActivity(playerId, 'vote_cast', { vote });
    
    return true;
  }

  resolveVote() {
    const approveVotes = Array.from(this.votes.values()).filter(v => v === 'approve').length;
    const rejectVotes = this.votes.size - approveVotes;
    
    console.log(`🗳️ Vote results: ${approveVotes} approve, ${rejectVotes} reject`);
    
    if (this.phase === 'final_accusation_voting') {
        this.resolveFinalVote();
        return;
    }
    
    if (approveVotes > rejectVotes) {
        // Vote passes
        console.log('✅ Vote PASSED');
        this.executeApprovedMission();
    } else {
        // Vote fails
        console.log('❌ Vote FAILED');
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
    
    if (this.stormTracker >= 3) {
      // Mr. Coral takes damage
      this.coralHealth--;
      this.stormTracker = 0;
      
      console.log(`⛈️ Three failed votes! Mr. Coral takes damage (${this.coralHealth}/3)`);
      
      if (this.coralHealth <= 0) {
        this.handleCoralDeath();
        return;
      }
    }
    
    // Move scout to next player
    this.rotateScout();
    this.proposedMission = null;
    this.votes.clear();
    
    this.phase = 'round_choose_team';
    console.log(`❌ Vote failed (${this.stormTracker}/3). New scout: ${this.players.get(this.currentScout).name}`);
  }

  checkPlot() {
    if (this.phase !== 'round_plot_check') {
      throw new Error('Game must be in plot check phase');
    }
    
    const plotActivated = (
      this.coralHealth < 3 && // Mr. Coral has taken damage
      this.proposedMission.location === this.plotLocation && // Correct location
      this.currentBodyguard === this.ringleaderId // Ringleader is bodyguard
    );
    
    if (plotActivated) {
      this.endGame('conspiracy_plot');
      return { activated: true };
    }
    
    this.phase = 'round_disarm_traps';
    return { activated: false };
  }

  submitSupplyCards(playerId, cardIds) {
    if (this.phase !== 'round_disarm_traps') {
      throw new Error('Game must be in trap disarming phase');
    }
    
    if (!this.proposedMission.teamMembers.includes(playerId)) {
      throw new Error('Only team members can submit supply cards');
    }
    
    const player = this.players.get(playerId);
    const submittedCards = [];
    
    // Remove cards from player's hand
    cardIds.forEach(cardId => {
      const cardIndex = player.supplyCards.findIndex(card => card.id === cardId);
      if (cardIndex !== -1) {
        submittedCards.push(player.supplyCards.splice(cardIndex, 1)[0]);
      }
    });
    
    this.supplyContributions.set(playerId, submittedCards);
    
    // Check if all team members have submitted
    const allSubmitted = this.proposedMission.teamMembers.every(memberId => 
      this.supplyContributions.has(memberId)
    );
    
    if (allSubmitted) {
      this.resolveTrapDisarming();
    }
    
    return true;
  }

  resolveTrapDisarming() {
    const locationData = this.locations.get(this.proposedMission.location);
    const trap = locationData.trap;
    
    // Calculate total value
    let totalValue = 0;
    const allSubmittedCards = [];
    
    this.supplyContributions.forEach((cards, playerId) => {
      allSubmittedCards.push(...cards);
    });
    
    // For 4-player games, add random card from deck
    if (this.playerCount === 4 && this.supplyDeck.length > 0) {
      allSubmittedCards.push(this.supplyDeck.pop());
    }
    
    // Calculate points based on trap type (Triangle/Circle only)
    allSubmittedCards.forEach(card => {
      if (card.value === 1) {
        // Value 1 cards always count positively
        totalValue += 1;
      } else if (card.value === 2) {
        // Value 2 cards depend on suit matching
        if (trap.suit === 'Trip Wire') {
          // Trip Wire accepts both Triangle and Circle
          totalValue += 2;
        } else if (card.suit === trap.suit) {
          // Suit matches (Triangle or Circle)
          totalValue += 2;
        } else {
          // Suit doesn't match - subtract points
          totalValue -= 2;
        }
      }
    });
    
    // Add cards to discard pile
    this.supplyDiscard.push(...allSubmittedCards);
    
    const success = totalValue >= trap.value;
    
    if (success) {
      // Trap disarmed
      locationData.trap = null;
      locationData.visited = true;
      this.trapsRemaining--;
      
      console.log(`✅ Trap disarmed at ${this.proposedMission.location} (${totalValue}/${trap.value})`);
      
      // Check if all traps are gone (Friends win condition)
      if (this.trapsRemaining === 0) {
        this.endGame('friends_traps');
        return { success: true, totalValue, requiredValue: trap.value, gameEnded: true };
      }
    } else {
      // Trap not disarmed - Mr. Coral takes damage
      this.coralHealth--;
      
      console.log(`❌ Trap not disarmed at ${this.proposedMission.location} (${totalValue}/${trap.value}). Mr. Coral takes damage!`);
      
      // Remove trap anyway (rule: trap is removed whether disarmed or not)
      locationData.trap = null;
      locationData.visited = true;
      this.trapsRemaining--;
      
      if (this.coralHealth <= 0) {
        this.handleCoralDeath();
        return { success: false, totalValue, requiredValue: trap.value, coralDied: true };
      }
    }
    
    // Clear contributions
    this.supplyContributions.clear();
    
    this.phase = 'round_collect_clues';
    return { success, totalValue, requiredValue: trap.value };
  }

  collectClues(bodyguardId, weaponClaim, locationClaim) {
    if (this.phase !== 'round_collect_clues') {
      throw new Error('Game must be in clue collection phase');
    }
    
    if (this.currentBodyguard !== bodyguardId) {
      throw new Error('Only the bodyguard can collect clues');
    }
    
    const locationData = this.locations.get(this.proposedMission.location);
    const player = this.players.get(bodyguardId);
    
    // Add clues to player's hand
    player.clueCards.push(...locationData.clues);
    
    // Update claims
    if (weaponClaim) {
      player.claimedClues.weapons.push(weaponClaim);
    }
    if (locationClaim) {
      player.claimedClues.locations.push(locationClaim);
    }
    
    // Clear clues from location
    locationData.clues = [];
    
    this.phase = 'round_supply_distribution';
    console.log(`🔍 Clues collected by ${player.name}`);
    return true;
  }

  distributeSupplies(scoutId) {
    if (this.phase !== 'round_supply_distribution') {
      throw new Error('Game must be in supply distribution phase');
    }
    
    if (this.currentScout !== scoutId) {
      throw new Error('Only the scout can distribute supplies');
    }
    
    const locationData = this.locations.get(this.proposedMission.location);
    const cardsToDistribute = locationData.playersPresent.length; // Include Mr. Coral
    
    // Draw cards from deck
    const drawnCards = [];
    for (let i = 0; i < cardsToDistribute && this.supplyDeck.length > 0; i++) {
      drawnCards.push(this.supplyDeck.pop());
    }
    
    // Distribute randomly to team members (not to Mr. Coral)
    const teamMembers = this.proposedMission.teamMembers;
    drawnCards.forEach(card => {
      const randomMember = teamMembers[Math.floor(Math.random() * teamMembers.length)];
      const player = this.players.get(randomMember);
      
      // Check hand limit
      const maxCards = this.playerCount === 4 ? 4 : 3;
      if (player.supplyCards.length < maxCards) {
        player.supplyCards.push(card);
      } else {
        this.supplyDiscard.push(card);
      }
    });
    
    // End round
    this.endRound();
    
    console.log(`🎒 Supplies distributed`);
    return true;
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
  }

  rotateScout() {
    const playerIds = Array.from(this.players.keys());
    const currentIndex = playerIds.indexOf(this.currentScout);
    let nextIndex = (currentIndex + 1) % playerIds.length;
    
    // Apply role restrictions based on player count
    if (this.playerCount === 4) {
      // 4-player rule: Skip if player was just bodyguard (scout can be bodyguard next round)
      if (playerIds[nextIndex] === this.previousRoles.bodyguard) {
        nextIndex = (nextIndex + 1) % playerIds.length;
      }
    } else {
      // 5+ player rule: Skip if player was just bodyguard
      if (playerIds[nextIndex] === this.previousRoles.bodyguard) {
        nextIndex = (nextIndex + 1) % playerIds.length;
      }
    }
    
    this.currentScout = playerIds[nextIndex];
    this.currentBodyguard = null;
    console.log(`🔄 Scout rotated to: ${this.players.get(this.currentScout).name}`);
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
      
      // Start 5-minute timer (handled client-side)
      this.finalAccusationStartTime = Date.now();
      
    } else {
      // Vote fails
      this.finalAccusationVoteCount++;
      
      if (this.finalAccusationVoteCount >= 3) {
        // Three failed votes - Conspiracy wins automatically
        this.endGame('conspiracy_votes');
        return;
      }
      
      // Try again with next scout
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
    if (this.phase !== 'final_accusation') {
      throw new Error('Game must be in final accusation phase');
    }
    
    const ringleaderCharacter = this.players.get(this.ringleaderId).character;
    const correct = (
      who === ringleaderCharacter &&
      where === this.plotLocation &&
      what === this.plotWeapon
    );
    
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
    
    return { success: true, instantDisarm: true };
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
        
        // Send game state to all players
        io.to(gameId).emit('game_state', game.getPublicGameState());
        
        // Send private state to joining player
        socket.emit('private_state', game.getPrivateGameState(socket.id));
        
        console.log(`✅ Player ${playerName} joined game ${gameId}`);
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
        console.log(`🗳️ Vote cast in game ${gameId}`);
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
        console.log(`🎯 Plot checked in game ${gameId}`);
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
      
      if (game && game.submitSupplyCards(socket.id, cardIds)) {
        io.to(gameId).emit('game_state', game.getPublicGameState());
        
        // Send updated private state to player
        socket.emit('private_state', game.getPrivateGameState(socket.id));
        
        console.log(`🎴 Supply cards submitted in game ${gameId}`);
      }
    } catch (error) {
      console.error('❌ Error in submit_supply_cards:', error);
      socket.emit('error', error.message);
    }
  });
  
  socket.on('collect_clues', (data) => {
    try {
      const { gameId, weaponClaim, locationClaim } = data;
      const game = games.get(gameId);
      
      if (game && game.collectClues(socket.id, weaponClaim, locationClaim)) {
        io.to(gameId).emit('game_state', game.getPublicGameState());
        
        // Send updated private state to bodyguard
        socket.emit('private_state', game.getPrivateGameState(socket.id));
        
        console.log(`🔍 Clues collected in game ${gameId}`);
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
        
        // Send updated private states to all players
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
        console.log(`⚖️ Final accusation made in game ${gameId}`);
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
        console.log(`🎯 First round started in game ${gameId}`);
      }
    } catch (error) {
      console.error('❌ Error in finish_conspiracy:', error);
      socket.emit('error', error.message);
    }
  });
  
  socket.on('use_instant_disarm', (data) => {
    try {
      const { gameId, cardId } = data;
      const game = games.get(gameId);
      
      if (game) {
        const result = game.useInstantDisarm(socket.id, cardId);
        io.to(gameId).emit('instant_disarm_result', result);
        io.to(gameId).emit('game_state', game.getPublicGameState());
        
        // Update private states
        game.players.forEach((player, playerId) => {
          io.to(playerId).emit('private_state', game.getPrivateGameState(playerId));
        });
        
        console.log(`⚡ Instant disarm used in game ${gameId}`);
      }
    } catch (error) {
      console.error('❌ Error in use_instant_disarm:', error);
      socket.emit('error', error.message);
    }
  });
  
  socket.on('propose_final_team', (data) => {
    try {
      const { gameId, teamMemberIds } = data;
      const game = games.get(gameId);
      
      if (game && game.proposeFinalTeam(socket.id, teamMemberIds)) {
        io.to(gameId).emit('game_state', game.getPublicGameState());
        console.log(`📋 Final team proposed in game ${gameId}`);
      }
    } catch (error) {
      console.error('❌ Error in propose_final_team:', error);
      socket.emit('error', error.message);
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