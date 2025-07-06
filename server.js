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

const SUITS = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];

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
  // Generate trap with value and suit based on player count
  const value = playerCount <= 7 ? Math.floor(Math.random() * 4) + 4 : Math.floor(Math.random() * 4) + 6;
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  
  return {
    value: value,
    suit: suit,
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
    
    this.phase = 'setup';
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
    // Create and shuffle location clue cards
    const locationClues = shuffleArray([...LOCATIONS]);
    
    // Set plot location (first card)
    this.plotLocation = locationClues[0];
    
    // Set safe location (second card)
    this.safeLocation = locationClues[1];
    
    // Create weapon clue cards
    const weaponClues = shuffleArray([...WEAPONS]);
    
    // Set plot weapon
    this.plotWeapon = weaponClues[0];
    
    // Create clue deck for locations
    const locationClueCards = [];
    for (let i = 2; i < locationClues.length; i++) {
      locationClueCards.push(createClueCard('location', locationClues[i]));
    }
    
    // Add instant disarm and no clue cards
    locationClueCards.push(createClueCard('instant_disarm'));
    locationClueCards.push(createClueCard('no_clue'));
    
    // Shuffle and distribute location clues
    const shuffledLocationClues = shuffleArray(locationClueCards);
    
    // Create weapon clue deck
    const weaponClueCards = [];
    for (let i = 1; i < weaponClues.length; i++) {
      weaponClueCards.push(createClueCard('weapon', weaponClues[i]));
    }
    
    // Add instant disarm and no clue cards
    weaponClueCards.push(createClueCard('instant_disarm'));
    weaponClueCards.push(createClueCard('no_clue'));
    
    // Shuffle and distribute weapon clues
    const shuffledWeaponClues = shuffleArray(weaponClueCards);
    
    // Place clues and traps at locations
    let clueIndex = 0;
    LOCATIONS.forEach(location => {
      const locationData = this.locations.get(location);
      
      // Add location clue
      if (clueIndex < shuffledLocationClues.length) {
        locationData.clues.push(shuffledLocationClues[clueIndex]);
        clueIndex++;
      }
      
      // Add weapon clue
      if (clueIndex - shuffledLocationClues.length < shuffledWeaponClues.length) {
        locationData.clues.push(shuffledWeaponClues[clueIndex - shuffledLocationClues.length]);
      }
      
      // Add trap
      locationData.trap = createTrapTile(this.playerCount);
    });
    
    // Also add trap to safe location
    this.locations.get(this.safeLocation).trap = createTrapTile(this.playerCount);
    
    console.log(`🗺️ Game board setup complete. Plot: ${this.plotLocation} with ${this.plotWeapon}`);
  }

  dealInitialSupplyCards() {
    // Create supply deck
    this.supplyDeck = [];
    
    // Add cards with value 1 (no suit)
    for (let i = 0; i < 15; i++) {
      this.supplyDeck.push(createSupplyCard(1));
    }
    
    // Add cards with value 2 (with suits)
    SUITS.forEach(suit => {
      for (let i = 0; i < 5; i++) {
        this.supplyDeck.push(createSupplyCard(2, suit));
      }
    });
    
    // Shuffle deck
    this.supplyDeck = shuffleArray(this.supplyDeck);
    
    // Deal 3 cards to each player (4 for 4-player game)
    const cardsPerPlayer = this.playerCount === 4 ? 4 : 3;
    
    this.players.forEach(player => {
      for (let i = 0; i < cardsPerPlayer; i++) {
        if (this.supplyDeck.length > 0) {
          player.supplyCards.push(this.supplyDeck.pop());
        }
      }
    });
    
    console.log(`🎴 Dealt ${cardsPerPlayer} supply cards to each player`);
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
  beginConspiracyPhase() {
    if (this.phase !== 'setup') {
      throw new Error('Game must be in setup phase');
    }
    
    this.phase = 'conspiracy_plotting';
    console.log(`🤫 Beginning conspiracy phase for game ${this.id}`);
    return true;
  }

  revealPlotToConspiracy() {
    // This is handled client-side with the conspiracy instructions
    // The plot info is already available in private state for conspiracy members
    return {
      plotLocation: this.plotLocation,
      plotWeapon: this.plotWeapon
    };
  }

  finishPlottingPhase() {
    if (this.phase !== 'conspiracy_plotting') {
      throw new Error('Game must be in conspiracy plotting phase');
    }
    
    this.phase = 'round_choose_team';
    console.log(`🎯 Starting round ${this.round} - team selection`);
    return true;
  }

  proposeTeam(scoutId, bodyguardId, teamMemberIds, locationName) {
    if (this.phase !== 'round_choose_team') {
      throw new Error('Game must be in team selection phase');
    }
    
    if (this.currentScout !== scoutId) {
      throw new Error('Only the current scout can propose a team');
    }
    
    // Validate bodyguard selection
    if (bodyguardId === this.previousRoles.bodyguard) {
      throw new Error('Previous bodyguard cannot be bodyguard again');
    }
    
    // Validate location
    if (!this.locations.has(locationName)) {
      throw new Error('Invalid location');
    }
    
    this.proposedMission = {
      scout: scoutId,
      bodyguard: bodyguardId,
      teamMembers: [scoutId, bodyguardId, ...teamMemberIds],
      location: locationName
    };
    
    // Reset votes
    this.votes.clear();
    
    this.phase = 'round_voting';
    console.log(`🗳️ Mission proposed: ${this.players.get(bodyguardId).name} as bodyguard to ${locationName}`);
    return true;
  }

  castVote(playerId, vote) {
    if (this.phase !== 'round_voting') {
      throw new Error('Game must be in voting phase');
    }
    
    if (!this.players.has(playerId)) {
      throw new Error('Invalid player');
    }
    
    this.votes.set(playerId, vote);
    
    // Check if all votes are in
    if (this.votes.size === this.playerCount) {
      this.resolveVote();
    }
    
    return true;
  }

  resolveVote() {
    const approveVotes = Array.from(this.votes.values()).filter(v => v === 'approve').length;
    const rejectVotes = this.votes.size - approveVotes;
    
    if (approveVotes > rejectVotes) {
      // Vote passes
      this.executeApprovedMission();
    } else {
      // Vote fails
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
    
    // Calculate points
    allSubmittedCards.forEach(card => {
      if (card.value === 1) {
        totalValue += 1;
      } else if (card.value === 2) {
        if (card.suit === trap.suit || trap.suit === 'Trip Wire') {
          totalValue += 2;
        } else {
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
      
      // Check if all traps are gone
      if (this.trapsRemaining === 0) {
        this.endGame('friends_traps');
        return { success: true, totalValue, required: trap.value };
      }
    } else {
      // Trap failed, Mr. Coral takes damage
      this.coralHealth--;
      locationData.trap = null;
      locationData.visited = true;
      this.trapsRemaining--;
      
      console.log(`❌ Trap failed at ${this.proposedMission.location} (${totalValue}/${trap.value}). Mr. Coral takes damage (${this.coralHealth}/3)`);
      
      if (this.coralHealth <= 0) {
        this.handleCoralDeath();
        return { success: false, totalValue, required: trap.value };
      }
    }
    
    // Clear contributions
    this.supplyContributions.clear();
    
    this.phase = 'round_collect_clues';
    return { success, totalValue, required: trap.value };
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
    const cardsToDistribute = locationData.playersPresent.filter(p => p !== 'mr_coral').length;
    
    // Draw cards from deck
    const drawnCards = [];
    for (let i = 0; i < cardsToDistribute && this.supplyDeck.length > 0; i++) {
      drawnCards.push(this.supplyDeck.pop());
    }
    
    // Distribute randomly to team members
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
    
    // Non-team members draw one card each
    this.players.forEach((player, playerId) => {
      if (!teamMembers.includes(playerId)) {
        const maxCards = this.playerCount === 4 ? 4 : 3;
        if (player.supplyCards.length < maxCards && this.supplyDeck.length > 0) {
          player.supplyCards.push(this.supplyDeck.pop());
        }
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
    
    // Skip if next player was just bodyguard
    if (playerIds[nextIndex] === this.previousRoles.bodyguard) {
      nextIndex = (nextIndex + 1) % playerIds.length;
    }
    
    this.currentScout = playerIds[nextIndex];
  }

  handleCoralDeath() {
    console.log(`💀 Mr. Coral has died! Starting final accusation phase`);
    this.phase = 'final_accusation';
    
    // Distribute remaining clues
    const allRemainingClues = [];
    this.locations.forEach(locationData => {
      allRemainingClues.push(...locationData.clues);
      locationData.clues = [];
    });
    
    // Shuffle and distribute to random players
    const shuffledClues = shuffleArray(allRemainingClues);
    const playerIds = Array.from(this.players.keys());
    
    shuffledClues.forEach(clue => {
      const randomPlayer = playerIds[Math.floor(Math.random() * playerIds.length)];
      this.players.get(randomPlayer).clueCards.push(clue);
    });
  }

  makeFinalAccusation(who, where, what) {
    if (this.phase !== 'final_accusation') {
      throw new Error('Game must be in final accusation phase');
    }
    
    const correct = (
      who === this.players.get(this.ringleaderId).character &&
      where === this.plotLocation &&
      what === this.plotWeapon
    );
    
    if (correct) {
      this.endGame('friends_accusation');
    } else {
      this.endGame('conspiracy_accusation');
    }
    
    return { correct, actualWho: this.players.get(this.ringleaderId).character, actualWhere: this.plotLocation, actualWhat: this.plotWeapon };
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
        
        console.log(`✅ Game ${gameId} started successfully`);
      } else {
        socket.emit('start_failed', { reason: 'Cannot start game' });
      }
    } catch (error) {
      console.error('❌ Error starting game:', error);
      socket.emit('start_failed', { reason: error.message });
    }
  });
  
  socket.on('begin_conspiracy_phase', (data) => {
    try {
      const { gameId } = data;
      const game = games.get(gameId);
      
      if (game && game.beginConspiracyPhase()) {
        io.to(gameId).emit('game_state', game.getPublicGameState());
        console.log(`🤫 Conspiracy phase started for game ${gameId}`);
      }
    } catch (error) {
      console.error('❌ Error in begin_conspiracy_phase:', error);
      socket.emit('error', error.message);
    }
  });
  
  socket.on('reveal_plot', (data) => {
    try {
      const { gameId } = data;
      const game = games.get(gameId);
      
      if (game) {
        const plotInfo = game.revealPlotToConspiracy();
        
        // Send plot info only to conspiracy members
        if (game.secretRoles.get(socket.id) === 'ringleader' || game.secretRoles.get(socket.id) === 'accomplice') {
          socket.emit('plot_revealed', plotInfo);
        }
      }
    } catch (error) {
      console.error('❌ Error in reveal_plot:', error);
      socket.emit('error', error.message);
    }
  });
  
  socket.on('finish_plotting', (data) => {
    try {
      const { gameId } = data;
      const game = games.get(gameId);
      
      if (game && game.finishPlottingPhase()) {
        io.to(gameId).emit('game_state', game.getPublicGameState());
        console.log(`🎯 Plotting phase finished for game ${gameId}`);
      }
    } catch (error) {
      console.error('❌ Error in finish_plotting:', error);
      socket.emit('error', error.message);
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