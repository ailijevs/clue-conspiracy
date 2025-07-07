console.log('🔄 Script.js loading...');

// Test if Socket.IO is loaded
if (typeof io === 'undefined') {
    console.error('❌ Socket.IO not loaded!');
    alert('Socket.IO library not loaded! Check your HTML.');
} else {
    console.log('✅ Socket.IO library loaded');
}

// Game state variables
let socket;
let gameId;
let playerId;
let playerName;
let gameState = null;
let privateState = null;
let isInGame = false;

// Global selections for scout
let scoutSelections = {
    location: null,
    bodyguard: null,
    teamMembers: []
};

// Initialize socket ONLY ONCE when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔄 DOM loaded, initializing...');
    
    // Reset all state
    gameState = null;
    privateState = null;
    isInGame = false;
    playerId = null;
    gameId = null;
    
    // Initialize socket ONLY HERE
    console.log('🔌 Initializing socket...');
    socket = io();
    
    // Socket event handlers - REGISTER ONLY ONCE
    socket.on('connect', () => {
        playerId = socket.id;
        console.log('✅ Connected to server:', playerId);
    });

    socket.on('joined_game', (data) => {
        console.log('🎉 JOINED_GAME EVENT RECEIVED:', data);
        gameId = data.gameId;
        playerId = data.playerId;
        isInGame = true;
        
        // Update game ID display
        const gameIdDisplay = document.getElementById('game-id-display');
        if (gameIdDisplay) {
            gameIdDisplay.textContent = gameId;
        }
        
        // Show lobby screen
        showScreen('lobby-screen');
    });

    socket.on('join_failed', (data) => {
        console.error('❌ JOIN_FAILED EVENT:', data);
        alert(`Join failed: ${data.reason}`);
        isInGame = false;
        showScreen('login-screen');
    });
    
    socket.on('error', (message) => {
        console.error('❌ SOCKET ERROR:', message);
        alert(`Socket error: ${message}`);
    });

    socket.on('disconnect', () => {
        console.log('🔌 DISCONNECTED from server');
        isInGame = false;
        showScreen('login-screen');
    });

    // CRITICAL: Game state update handler
    socket.on('game_state', (state) => {
        console.log('📡 GAME_STATE EVENT RECEIVED:', state);
        console.log('📊 Player count in state:', state?.playerCount);
        console.log('📊 Players array:', state?.players);
        console.log('📊 Phase:', state?.phase);
        
        const previousPhase = gameState?.phase;
        gameState = state;
        
        // AUTO-TRANSITION: Switch to game screen when game starts
        if (previousPhase === 'lobby' && state.phase !== 'lobby') {
            console.log('🎮 GAME STARTED! Auto-transitioning to game screen...');
            showScreen('game-screen');
        }
        
        if (isInGame) {
            console.log('✅ isInGame=true, calling updateUI...');
            updateUI();
        } else {
            console.log('❌ isInGame=false, skipping updateUI');
        }
    });
    
    // MISSING: Handle private state updates (for roles and secret info)
    socket.on('private_state', (state) => {
        console.log('🔐 PRIVATE_STATE EVENT RECEIVED:', state);
        console.log('🎭 Secret role:', state?.secretRole);
        
        privateState = state;
        
        if (isInGame) {
            console.log('✅ Updating private UI...');
            updatePrivateUI();
        }
    });
    
    // Setup event listeners
    setupEventListeners();
    
    console.log('✅ Initialization complete');
});

function updateUI() {
    console.log('🔄 updateUI called');
    debugGameState();
    
    if (!gameState || !isInGame) {
        console.log('❌ Skipping UI update - no gameState or not in game');
        return;
    }
    
    console.log('✅ Updating basic info...');
    updateBasicInfo();
    
    console.log('✅ Updating players grid...');
    updatePlayersGrid();
    
    // Update phase display
    updateGamePhaseDisplay();
    
    // Show appropriate action panel based on phase
    showPhaseSpecificUI();
}

function debugGameState() {
    console.log('🔍 DEBUG GAME STATE:');
    console.log('- Phase:', gameState?.phase);
    console.log('- Round:', gameState?.round);
    console.log('- Player count:', gameState?.playerCount);
    console.log('- Current scout:', gameState?.currentScout);
    console.log('- Scout name:', gameState?.players?.find(p => p.id === gameState?.currentScout)?.name);
    console.log('- Is in game:', isInGame);
    console.log('- Player ID:', playerId);
    console.log('- Am I the scout?:', gameState?.currentScout === playerId);
}

function updatePlayersGrid() {
    console.log('🔄 UPDATING PLAYERS GRID...');
    
    const playersGrid = document.getElementById('game-players-grid');
    const scoutAnnouncement = document.getElementById('scout-announcement');
    const currentRoundDisplay = document.getElementById('current-round-display');
    
    if (!playersGrid) {
        console.log('❌ No game-players-grid element found!');
        // Try the lobby players grid as fallback
        const lobbyGrid = document.getElementById('players-grid');
        if (lobbyGrid && gameState && gameState.players) {
            updateLobbyPlayersGrid(lobbyGrid);
        }
        return;
    }
    
    if (!gameState || !gameState.players) {
        console.log('❌ No game state or players data');
        playersGrid.innerHTML = '<p>Loading players...</p>';
        return;
    }
    
    console.log('✅ Game state exists, updating grid...');
    console.log('📊 Players data:', gameState.players);
    console.log('🎯 Current Scout ID:', gameState.currentScout);
    
    // Update round display
    if (currentRoundDisplay) {
        currentRoundDisplay.textContent = gameState.round || 1;
    }
    
    // Clear the grid
    playersGrid.innerHTML = '';
    
    // Find the scout player
    const scoutPlayer = gameState.players.find(p => p.id === gameState.currentScout);
    console.log('🎯 Scout player found:', scoutPlayer);
    
    // Update scout announcement
    if (scoutAnnouncement && scoutPlayer) {
        if (gameState.currentScout === playerId) {
            scoutAnnouncement.innerHTML = `🎯 YOU are the Scout! Choose your team and location.`;
            scoutAnnouncement.className = 'current-scout-highlight';
        } else {
            scoutAnnouncement.innerHTML = `🎯 ${scoutPlayer.name} is the Scout and will choose the team.`;
            scoutAnnouncement.className = 'current-scout-highlight';
        }
    }
    
    // Create player cards
    gameState.players.forEach(player => {
        console.log('👤 Creating card for player:', player.name, 'ID:', player.id);
        
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        
        // Add role-specific classes
        if (player.id === gameState.currentScout) {
            playerCard.classList.add('scout');
            console.log('🎯 Added scout class to', player.name);
        }
        if (player.id === gameState.currentBodyguard) {
            playerCard.classList.add('bodyguard');
            console.log('🛡️ Added bodyguard class to', player.name);
        }
        if (player.id === playerId) {
            playerCard.classList.add('current-player');
            console.log('👤 Added current-player class to', player.name);
        }
        
        // Build role indicators
        let roleIcons = '';
        if (player.id === gameState.currentScout) {
            roleIcons += '🎯';
        }
        if (player.id === gameState.currentBodyguard) {
            roleIcons += '🛡️';
        }
        if (player.id === playerId) {
            roleIcons += '👤';
        }
        
        // Create the card content
        playerCard.innerHTML = `
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div class="player-character">${player.character}</div>
            </div>
            <div class="player-roles">${roleIcons}</div>
        `;
        
        playersGrid.appendChild(playerCard);
    });
    
    console.log('✅ Players grid updated successfully');
}

// ADD THIS HELPER FUNCTION FOR LOBBY
function updateLobbyPlayersGrid(gridElement) {
    if (!gameState || !gameState.players) return;
    
    gridElement.innerHTML = '';
    
    gameState.players.forEach(player => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-item';
        
        playerCard.innerHTML = `
            <div class="player-name">${player.name}</div>
            <div class="player-character">${player.character}</div>
        `;
        
        gridElement.appendChild(playerCard);
    });
}

function updateGamePhaseDisplay() {
    // Update phase in header
    const currentPhaseElement = document.getElementById('current-phase');
    if (currentPhaseElement && gameState) {
        const scoutName = gameState.players?.find(p => p.id === gameState.currentScout)?.name;
        const phaseText = getPhaseDisplayName(gameState.phase);
        
        if (scoutName && gameState.phase === 'round_choose_team') {
            currentPhaseElement.textContent = `${phaseText} - ${scoutName} is Scout`;
        } else {
            currentPhaseElement.textContent = phaseText;
        }
    }
    
    // Update round number  
    const roundNumberElement = document.getElementById('round-number');
    if (roundNumberElement && gameState) {
        roundNumberElement.textContent = gameState.round || 1;
    }
    
    // Update Mr. Coral's health
    const coralHealthElement = document.getElementById('coral-health');
    if (coralHealthElement && gameState) {
        coralHealthElement.textContent = `${gameState.coralHealth || 3}/3`;
    }
}

function showPhaseSpecificUI() {
    if (!gameState) return;
    
    console.log(`🎭 Showing UI for phase: ${gameState.phase}`);
    
    // Hide all action panels first
    document.querySelectorAll('.action-panel').forEach(panel => {
        panel.style.display = 'none';
    });
    
    switch (gameState.phase) {
        case 'conspiracy_setup':
            showConspiracySetupUI();
            break;
        case 'round_choose_team':
            showTeamSelectionUI();
            break;
        case 'round_voting':
            showVotingUI();
            break;
        case 'round_plot_check':
            showPlotCheckUI();
            break;
        case 'round_disarm_traps':
            showTrapDisarmingUI();
            break;
        case 'round_collect_clues':
            showClueCollectionUI();
            break;
        case 'round_supply_distribution':
            showSupplyDistributionUI();
            break;
        default:
            console.log('❓ Unknown phase:', gameState.phase);
    }
}

function showConspiracySetupUI() {
    console.log('🤫 Showing conspiracy setup UI');
    
    const plotCheckPanel = document.getElementById('plot-check-actions');
    if (plotCheckPanel) {
        plotCheckPanel.style.display = 'block';
        
        if (privateState?.secretRole === 'ringleader') {
            plotCheckPanel.innerHTML = `
                <h3>🤫 Conspiracy Setup</h3>
                <p><strong>You are the Ringleader!</strong></p>
                <p>Share your plot location and weapon with your accomplices, then continue.</p>
                <div class="conspiracy-info">
                    <p><strong>📍 Plot Location:</strong> ${privateState.plotLocation}</p>
                    <p><strong>🔪 Plot Weapon:</strong> ${privateState.plotWeapon}</p>
                </div>
                <button class="btn btn-primary" onclick="finishConspiracyPhase()">Continue to First Round</button>
            `;
        } else if (privateState?.secretRole === 'accomplice') {
            plotCheckPanel.innerHTML = `
                <h3>🤫 Conspiracy Setup</h3>
                <p><strong>You are an Accomplice!</strong></p>
                <p>Wait for the Ringleader to share the plot details.</p>
                <div class="conspiracy-info">
                    <p><strong>📍 Plot Location:</strong> ${privateState.plotLocation || 'Waiting...'}</p>
                    <p><strong>🔪 Plot Weapon:</strong> ${privateState.plotWeapon || 'Waiting...'}</p>
                </div>
            `;
        } else {
            plotCheckPanel.innerHTML = `
                <h3>⏳ Setup Phase</h3>
                <p>The conspiracy members are coordinating their plan...</p>
            `;
        }
    }
}

function showTeamSelectionUI() {
    console.log('🎯 Showing team selection UI');
    console.log('🎯 Game State Locations:', gameState.locations);
    console.log('🎯 Current Scout:', gameState.currentScout);
    console.log('🎯 My Player ID:', playerId);
    
    const scoutPanel = document.getElementById('scout-actions');
    if (!scoutPanel) {
        console.error('❌ scout-actions panel not found!');
        return;
    }
    
    scoutPanel.style.display = 'block';
    
    if (gameState.currentScout === playerId) {
        console.log('🎯 I am the scout - building UI...');
        
        // BUILD WORKING LOCATION BUTTONS
        const locationButtons = gameState.locations.map(location => {
            const isSafe = location.name === gameState.safeLocation;
            let trapInfo = '';
            
            if (location.hasTraps && location.trapValue) {
                const suitSymbol = getTrapSuitSymbol(location.trapSuit);
                trapInfo = ` (${location.trapValue}${suitSymbol})`;
                console.log(`🔧 Location ${location.name}: value=${location.trapValue}, suit=${location.trapSuit}, symbol=${suitSymbol}`);
            }
            
            const safeIcon = isSafe ? ' 🛡️' : '';
            const buttonText = `${location.name}${safeIcon}${trapInfo}`;
            
            console.log(`🔧 Creating button for: ${buttonText}`);
            
            return `
                <button class="btn btn-outline location-btn" 
                        onclick="selectLocationSimple('${location.name}')"
                        data-location="${location.name}">
                    ${buttonText}
                </button>
            `;
        }).join('');
        
        // BUILD WORKING PLAYER BUTTONS
        const otherPlayers = gameState.players.filter(p => p.id !== playerId);
        
        const playerButtons = otherPlayers.map(player => `
            <button class="btn btn-outline player-btn" 
                    onclick="selectBodyguardSimple('${player.id}')"
                    data-player="${player.id}">
                ${player.name} (${player.character})
            </button>
        `).join('');
        
        const teamButtons = otherPlayers.map(player => `
            <button class="btn btn-outline team-btn" 
                    onclick="toggleTeamMemberSimple('${player.id}')"
                    data-player="${player.id}">
                ${player.name} (${player.character})
            </button>
        `).join('');
        
        console.log('🔧 Generated location buttons:', locationButtons);
        console.log('🔧 Generated player buttons:', playerButtons);
        
        scoutPanel.innerHTML = `
            <h3>🎯 You are the Scout!</h3>
            <p><strong>Round ${gameState.round}</strong> - Choose your team and location.</p>
            
            <div class="scout-interface">
                <div class="selection-step">
                    <h4>📍 Step 1: Choose Location</h4>
                    <div class="location-buttons">
                        ${locationButtons}
                    </div>
                    <p id="selected-location-display">Selected: <em>None</em></p>
                </div>
                
                <div class="selection-step">
                    <h4>🛡️ Step 2: Choose Bodyguard</h4>
                    <div class="player-buttons">
                        ${playerButtons}
                    </div>
                    <p id="selected-bodyguard-display">Selected: <em>None</em></p>
                </div>
                
                <div class="selection-step">
                    <h4>👥 Step 3: Choose Team Members (Optional)</h4>
                    <div class="player-buttons">
                        ${teamButtons}
                    </div>
                    <p id="selected-team-display">Selected: Scout + Bodyguard</p>
                </div>
                
                <button id="confirm-mission-btn" class="btn btn-primary btn-large" 
                        onclick="confirmMissionSimple()" disabled>
                    Select Location & Bodyguard
                </button>
            </div>
        `;
        
        console.log('✅ Scout UI built successfully');
        
    } else {
        // Someone else is the scout
        const scoutName = gameState.players.find(p => p.id === gameState.currentScout)?.name;
        scoutPanel.innerHTML = `
            <h3>⏳ Waiting for Scout</h3>
            <p><strong>${scoutName}</strong> is choosing the team and location for Round ${gameState.round}.</p>
            <div class="waiting-indicator">
                <div class="spinner"></div>
                <p>Please wait...</p>
            </div>
        `;
        
        console.log(`✅ Waiting UI shown for scout: ${scoutName}`);
    }
}

// Global variables for scout selections
let selectedLocation = null;
let selectedBodyguard = null;
let selectedTeamMembers = [];

// Simple selection functions
function selectLocationSimple(locationName) {
    console.log('🎯 selectLocationSimple called with:', locationName);
    selectedLocation = locationName;
    
    // Update button states
    document.querySelectorAll('.location-btn').forEach(btn => {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline');
    });
    
    const selectedBtn = document.querySelector(`[data-location="${locationName}"]`);
    if (selectedBtn) {
        selectedBtn.classList.remove('btn-outline');
        selectedBtn.classList.add('btn-primary');
        console.log('✅ Location button updated');
    } else {
        console.error('❌ Could not find location button for:', locationName);
    }
    
    // Update display
    const display = document.getElementById('selected-location-display');
    if (display) {
        display.innerHTML = `Selected: <strong>${locationName}</strong>`;
        console.log('✅ Location display updated');
    }
    
    checkCanConfirmMission();
}

function selectBodyguardSimple(playerId) {
    console.log('🛡️ selectBodyguardSimple called with:', playerId);
    selectedBodyguard = playerId;
    
    // Update button states
    document.querySelectorAll('.player-btn').forEach(btn => {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline');
    });
    
    const selectedBtn = document.querySelector(`.player-btn[data-player="${playerId}"]`);
    if (selectedBtn) {
        selectedBtn.classList.remove('btn-outline');
        selectedBtn.classList.add('btn-primary');
        console.log('✅ Bodyguard button updated');
    } else {
        console.error('❌ Could not find bodyguard button for:', playerId);
    }
    
    // Update display
    const playerName = gameState.players.find(p => p.id === playerId)?.name;
    const display = document.getElementById('selected-bodyguard-display');
    if (display) {
        display.innerHTML = `Selected: <strong>${playerName}</strong>`;
        console.log('✅ Bodyguard display updated');
    }
    
    checkCanConfirmMission();
}

function toggleTeamMemberSimple(playerId) {
    console.log('👥 toggleTeamMemberSimple called with:', playerId);
    
    if (playerId === selectedBodyguard) {
        console.log('⚠️ Cannot select bodyguard as team member');
        return;
    }
    
    const button = document.querySelector(`.team-btn[data-player="${playerId}"]`);
    if (!button) {
        console.error('❌ Could not find team button for:', playerId);
        return;
    }
    
    if (selectedTeamMembers.includes(playerId)) {
        // Remove from selection
        selectedTeamMembers = selectedTeamMembers.filter(id => id !== playerId);
        button.classList.remove('btn-primary');
        button.classList.add('btn-outline');
        console.log('➖ Removed team member:', playerId);
    } else {
        // Add to selection
        selectedTeamMembers.push(playerId);
        button.classList.remove('btn-outline');
        button.classList.add('btn-primary');
        console.log('➕ Added team member:', playerId);
    }
    
    // Update display
    const teamNames = selectedTeamMembers.map(id => 
        gameState.players.find(p => p.id === id)?.name
    );
    const displayText = teamNames.length > 0 ? 
        `Scout + Bodyguard + ${teamNames.join(', ')}` : 
        'Scout + Bodyguard';
    
    const display = document.getElementById('selected-team-display');
    if (display) {
        display.innerHTML = `Selected: <strong>${displayText}</strong>`;
        console.log('✅ Team display updated');
    }
}

function checkCanConfirmMission() {
    console.log('🔧 checkCanConfirmMission called');
    console.log('🔧 selectedLocation:', selectedLocation);
    console.log('🔧 selectedBodyguard:', selectedBodyguard);
    
    const confirmBtn = document.getElementById('confirm-mission-btn');
    if (confirmBtn) {
        if (selectedLocation && selectedBodyguard) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirm Mission';
            confirmBtn.classList.remove('btn-secondary');
            confirmBtn.classList.add('btn-primary');
            console.log('✅ Confirm button enabled');
        } else {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Select Location & Bodyguard';
            confirmBtn.classList.remove('btn-primary');
            confirmBtn.classList.add('btn-secondary');
            console.log('⚠️ Confirm button disabled');
        }
    } else {
        console.error('❌ Confirm button not found');
    }
}

function confirmMissionSimple() {
    if (!selectedLocation || !selectedBodyguard) {
        alert('Please select both location and bodyguard!');
        return;
    }
    
    console.log('🎯 Confirming mission:', {
        location: selectedLocation,
        bodyguard: selectedBodyguard,
        teamMembers: selectedTeamMembers
    });
    
    socket.emit('propose_team', {
        gameId: gameId,
        bodyguardId: selectedBodyguard,
        teamMemberIds: selectedTeamMembers,
        locationName: selectedLocation
    });
    
    // Reset selections
    selectedLocation = null;
    selectedBodyguard = null;
    selectedTeamMembers = [];
}

function finishConspiracyPhase() {
    console.log('🤫 Finishing conspiracy phase');
    socket.emit('finish_conspiracy', { gameId });
}

function showVotingUI() {
    console.log('🗳️ Showing voting UI');
    
    const votingPanel = document.getElementById('voting-actions');
    if (votingPanel) {
        votingPanel.style.display = 'block';
        
        const mission = gameState.proposedMission;
        const bodyguardName = gameState.players.find(p => p.id === mission?.bodyguard)?.name;
        const teamNames = mission?.teamMembers?.map(id => 
            gameState.players.find(p => p.id === id)?.name
        ).join(', ');
        
        votingPanel.innerHTML = `
            <h3>🗳️ Vote on Proposed Mission</h3>
            <div class="mission-details">
                <p><strong>📍 Location:</strong> ${mission?.location}</p>
                <p><strong>🛡️ Bodyguard:</strong> ${bodyguardName}</p>
                <p><strong>👥 Team:</strong> ${teamNames}</p>
            </div>
            <div class="vote-buttons">
                <button class="btn btn-success btn-large" onclick="castVoteSimple('approve')">
                    ✅ Approve Mission
                </button>
                <button class="btn btn-danger btn-large" onclick="castVoteSimple('reject')">
                    ❌ Reject Mission
                </button>
            </div>
            <p class="vote-status">Votes: ${Object.keys(gameState.votes || {}).length} / ${gameState.playerCount}</p>
        `;
    }
}

function castVoteSimple(vote) {
    console.log(`🗳️ Casting vote: ${vote}`);
    socket.emit('cast_vote', {
        gameId: gameId,
        vote: vote
    });
}

function showPlotCheckUI() {
    console.log('🕵️ Showing plot check UI');
    // Will implement later
}

function showTrapDisarmingUI() {
    console.log('🔓 Showing trap disarming UI');
    // Will implement later
}

function showClueCollectionUI() {
    console.log('🔍 Showing clue collection UI');
    // Will implement later
}

function showSupplyDistributionUI() {
    console.log('🎒 Showing supply distribution UI');
    // Will implement later
}

function updateBasicInfo() {
    console.log('📊 updateBasicInfo called');
    console.log('📊 gameState.playerCount:', gameState?.playerCount);
    
    // Update player count in lobby
    const playerCountElement = document.getElementById('player-count');
    if (playerCountElement) {
        console.log('📊 Setting player count to:', gameState.playerCount);
        playerCountElement.textContent = gameState.playerCount;
    }
    
    // Update character display
    const characterDisplay = document.getElementById('character-display');
    if (characterDisplay && gameState) {
        const myPlayer = gameState.players.find(p => p.id === playerId);
        if (myPlayer) {
            characterDisplay.textContent = myPlayer.character;
        }
    }
    
    // Update lobby players grid
    const lobbyPlayersGrid = document.getElementById('players-grid');
    if (lobbyPlayersGrid && gameState && gameState.players) {
        updateLobbyPlayersGrid(lobbyPlayersGrid);
    }
}

function updatePrivateUI() {
    console.log('Updating private UI...');
    console.log('Private state:', privateState);
    
    if (!privateState) {
        console.log('❌ No private state available');
        return;
    }
    
    // Update role display
    const roleDisplay = document.getElementById('role-display');
    if (roleDisplay) {
        roleDisplay.textContent = capitalizeFirst(privateState.secretRole || 'Unknown');
        console.log('✅ Role display updated:', privateState.secretRole);
    } else {
        console.log('❌ role-display element not found');
    }
    
    // Update character display
    const myCharacter = document.getElementById('my-character');
    if (myCharacter && gameState) {
        const myPlayer = gameState.players.find(p => p.id === playerId);
        if (myPlayer) {
            myCharacter.textContent = myPlayer.character;
            console.log('✅ Character display updated:', myPlayer.character);
        }
    }
    
    // Show/hide plot info for conspiracy members
    const plotInfo = document.getElementById('plot-info');
    if (plotInfo) {
        if (privateState.secretRole === 'ringleader' || privateState.secretRole === 'accomplice') {
            plotInfo.classList.remove('hidden');
            
            // Get conspiracy member names
            let conspiracyMembers = '';
            if (gameState && privateState.ringleaderId && privateState.accompliceIds) {
                const ringleader = gameState.players.find(p => p.id === privateState.ringleaderId);
                const accomplices = privateState.accompliceIds.map(id => 
                    gameState.players.find(p => p.id === id)
                ).filter(p => p); // filter out any undefined players
                
                conspiracyMembers = `
                    <div class="conspiracy-members">
                        <h5>🤝 Your Conspiracy Team:</h5>
                        <p><strong>Ringleader:</strong> ${ringleader ? ringleader.character : 'Unknown'} ${privateState.ringleaderId === playerId ? '(YOU)' : ''}</p>
                        ${accomplices.length > 0 ? 
                            `<p><strong>Accomplice${accomplices.length > 1 ? 's' : ''}:</strong> ${accomplices.map(acc => 
                                `${acc.character}${privateState.accompliceIds.includes(playerId) && acc.id === playerId ? ' (YOU)' : ''}`
                            ).join(', ')}</p>` 
                            : ''
                        }
                    </div>
                `;
            }
            
            plotInfo.innerHTML = `
                <h4>🎯 Secret Plot</h4>
                <div class="plot-details">
                    <p><strong>Location:</strong> ${privateState.plotLocation || 'Unknown'}</p>
                    <p><strong>Weapon:</strong> ${privateState.plotWeapon || 'Unknown'}</p>
                </div>
                ${conspiracyMembers}
            `;
            console.log('✅ Plot info displayed for conspiracy member');
        } else {
            plotInfo.classList.add('hidden');
            console.log('✅ Plot info hidden for friend');
        }
    }
    
    // Update supply cards
    updateSupplyCardsDisplay();
    
    // Update clue cards
    updateClueCardsDisplay();
}

function updateSupplyCardsDisplay() {
    const supplyCardsContainer = document.getElementById('supply-cards');
    const supplyCountElement = document.getElementById('supply-count');
    
    if (!supplyCardsContainer || !privateState || !privateState.supplyCards) return;
    
    supplyCardsContainer.innerHTML = '';
    supplyCountElement.textContent = privateState.supplyCards.length;
    
    privateState.supplyCards.forEach(card => {
        const cardElement = document.createElement('div');
        cardElement.className = `card supply ${selectedCards.includes(card.id) ? 'selected' : ''}`;
        cardElement.setAttribute('data-card-id', card.id);
        cardElement.setAttribute('data-suit', card.suit || 'none');
        
        let suitDisplay = '';
        if (card.suit === 'Triangle') {
            suitDisplay = '<div class="card-suit triangle">▲</div>';
        } else if (card.suit === 'Circle') {
            suitDisplay = '<div class="card-suit circle">●</div>';
        }
        
        cardElement.innerHTML = `
            <div class="card-value">${card.value}</div>
            ${suitDisplay}
        `;
        
        cardElement.addEventListener('click', () => toggleSupplyCard(cardElement));
        supplyCardsContainer.appendChild(cardElement);
    });
}

function updateClueCardsDisplay() {
    const clueCardsContainer = document.getElementById('clue-cards');
    const clueCountElement = document.getElementById('clue-count');
    
    if (!clueCardsContainer || !privateState || !privateState.clueCards) return;
    
    clueCardsContainer.innerHTML = '';
    clueCountElement.textContent = privateState.clueCards.length;
    
    privateState.clueCards.forEach(card => {
        const cardElement = document.createElement('div');
        cardElement.className = 'card clue';
        
        let cardContent = '';
        switch (card.cardType) {
            case 'weapon':
                cardContent = `🔪 Weapon: ${card.content}`;
                break;
            case 'location':
                cardContent = `📍 Location: ${card.content}`;
                break;
            case 'instant_disarm':
                cardContent = '⚡ Instant Disarm';
                // Add button for instant disarm if in disarming phase
                if (gameState.phase === 'round_disarm_traps' && 
                    gameState.proposedMission && 
                    gameState.proposedMission.teamMembers.includes(playerId)) {
                    cardContent += '<button class="btn btn-warning btn-sm" onclick="useInstantDisarm(\'' + card.id + '\')">Use Now</button>';
                }
                break;
            case 'no_clue':
                cardContent = '❌ No Clue Found';
                break;
            default:
                cardContent = '❓ Unknown Clue';
        }
        
        cardElement.innerHTML = `<div class="clue-content">${cardContent}</div>`;
        clueCardsContainer.appendChild(cardElement);
    });
}

// Helper functions
function toggleSupplyCard(cardElement) {
    const cardId = cardElement.dataset.cardId;
    const card = privateState.supplyCards.find(c => c.id === cardId);
    
    if (!card) return;
    
    const index = selectedCards.indexOf(card);
    if (index > -1) {
        selectedCards.splice(index, 1);
        cardElement.classList.remove('selected');
    } else {
        selectedCards.push(card);
        cardElement.classList.add('selected');
    }
    
    updateContributionPreview();
}

function updateContributionPreview() {
    const preview = document.getElementById('contribution-preview');
    if (!preview) return;
    
    if (selectedCards.length === 0) {
        preview.innerHTML = '<p>No cards selected</p>';
        return;
    }
    
    const totalValue = selectedCards.reduce((sum, card) => sum + card.value, 0);
    const cardsList = selectedCards.map(card => 
        `${card.value}${card.suit ? ` (${card.suit})` : ''}`
    ).join(', ');
    
    preview.innerHTML = `
        <h5>Selected Cards:</h5>
        <p>${cardsList}</p>
        <p><strong>Total Value:</strong> ${totalValue}</p>
        <small>Note: Actual contribution depends on trap's suit</small>
    `;
}

function updateMissionConfirmButton() {
    const confirmBtn = document.getElementById('confirm-mission-btn');
    const bodyguardSelect = document.getElementById('bodyguard-select');
    const locationSelect = document.getElementById('location-select');
    
    if (!confirmBtn || !bodyguardSelect || !locationSelect) return;
    
    const isValid = bodyguardSelect.value && locationSelect.value;
    confirmBtn.disabled = !isValid;
    
    if (isValid) {
        confirmBtn.textContent = 'Confirm Mission';
        confirmBtn.classList.remove('btn-disabled');
    } else {
        confirmBtn.textContent = 'Select Bodyguard & Location';
        confirmBtn.classList.add('btn-disabled');
    }
}

function showDisarmResult(result) {
    const type = result.success ? 'success' : 'error';
    const message = result.success ? 'Trap disarmed successfully!' : 'Trap disarming failed!';
    const details = `Submitted: ${result.totalValue} points, Required: ${result.required} points`;
    
    showGameNotification(type, message, details);
}

function showFinalAccusationResult(result) {
    const type = result.correct ? 'success' : 'error';
    const message = result.correct ? 'Correct accusation! Friends win!' : 'Incorrect accusation! Conspiracy wins!';
    const details = `The plot was: ${result.actualWho} in the ${result.actualWhere} with the ${result.actualWhat}`;
    
    showGameNotification(type, message, details);
}

function showGameEnd(result) {
    let message = '';
    switch (result.reason) {
        case 'friends_traps':
            message = '🎉 Friends win! All traps disarmed!';
            break;
        case 'friends_accusation':
            message = '🎉 Friends win! Conspiracy exposed!';
            break;
        case 'conspiracy_plot':
            message = '🕵️ Conspiracy wins! Plot executed!';
            break;
        case 'conspiracy_accusation':
            message = '🕵️ Conspiracy wins! Friends failed!';
            break;
    }
    
    showGameNotification('info', message);
}

function showScreen(screenId) {
    console.log('🖥️ showScreen called with:', screenId);
    
    // Hide all screens
    const allScreens = document.querySelectorAll('.screen');
    console.log('🖥️ Found screens:', allScreens.length);
    
    allScreens.forEach(screen => {
        console.log('🖥️ Hiding screen:', screen.id);
        screen.classList.remove('active');
    });
    
    // Show target screen
    const targetScreen = document.getElementById(screenId);
    console.log('🖥️ Target screen found:', !!targetScreen);
    
    if (targetScreen) {
        targetScreen.classList.add('active');
        console.log('✅ Activated screen:', screenId);
        console.log('🖥️ Screen classes:', targetScreen.classList.toString());
    } else {
        console.error('❌ Screen not found:', screenId);
    }
}

function getPhaseDisplayName(phase) {
    const phaseNames = {
        'lobby': 'Lobby',
        'setup': 'Setup',
        'conspiracy_plotting': 'Conspiracy Plotting',
        'round_choose_team': 'Team Selection',
        'round_voting': 'Voting',
        'round_plot_check': 'Plot Check',
        'round_disarm_traps': 'Disarming Traps',
        'round_collect_clues': 'Collecting Clues',
        'round_supply_distribution': 'Supply Distribution',
        'final_accusation': 'Final Accusation',
        'game_over': 'Game Over'
    };
    return phaseNames[phase] || phase;
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ADD THIS FUNCTION BEFORE line 1603 (before showNotification function)

function createNotificationContainer() {
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.className = 'notification-container';
        document.body.appendChild(container);
    }
    return container;
}

// Enhanced notification system with auto-show animation
function showNotification(notification) {
    const container = document.getElementById('notification-container') || createNotificationContainer();
    
    const notificationDiv = document.createElement('div');
    notificationDiv.className = `notification notification-${notification.type}`;
    notificationDiv.setAttribute('data-notification-id', notification.id || Date.now());
    
    notificationDiv.innerHTML = `
        <div class="notification-content">
            <div class="notification-message">${notification.message}</div>
            ${notification.details ? `<div class="notification-details">${notification.details}</div>` : ''}
        </div>
        <button class="notification-close" onclick="closeNotification('${notification.id || Date.now()}')">✕</button>
    `;
    
    container.appendChild(notificationDiv);
    
    // Trigger show animation
    requestAnimationFrame(() => {
        notificationDiv.classList.add('show');
    });
    
    // Auto-close after 5 seconds
    setTimeout(() => {
        closeNotification(notification.id || Date.now());
    }, 5000);
}

function closeNotification(notificationId) {
    const notification = document.querySelector(`[data-notification-id="${notificationId}"]`);
    if (notification) {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300); // Wait for animation to complete
    }
}

// Replace all alert() calls with proper notifications
function showGameNotification(type, message, details = '') {
    showNotification({
        id: Math.random().toString(36).substr(2, 9),
        type,
        message,
        details,
        timestamp: Date.now()
    });
}

// Update the UI functions to show better status
function updateActivityDisplay(activity) {
    if (!isInGame) return;
    
    const activityElement = document.getElementById('current-activity');
    if (!activityElement) return;
    
    // Show the activity display
    activityElement.classList.remove('hidden');
    
    if (activity) {
        activityElement.innerHTML = `
            <div class="activity-primary">${activity.primary}</div>
            <div class="activity-secondary">${activity.secondary}</div>
        `;
        
        // Update player indicators
        updatePlayerActivityIndicators(activity.active);
    }
}

function updatePlayerActivityIndicators(activePlayerIds) {
    document.querySelectorAll('.player-card').forEach(card => {
        const playerId = card.dataset.playerId;
        if (activePlayerIds.includes(playerId)) {
            card.classList.add('active-player');
        } else {
            card.classList.remove('active-player');
        }
    });
}

// Enhanced game log
function addToGameLog(logEntry) {
    const gameLogContainer = document.getElementById('game-log');
    if (!gameLogContainer) return;
    
    const logDiv = document.createElement('div');
    logDiv.className = 'log-entry';
    logDiv.innerHTML = `
        <div class="log-timestamp">${formatTimestamp(logEntry.timestamp)}</div>
        <div class="log-content">
            <strong>Round ${logEntry.round}:</strong> ${formatLogMessage(logEntry)}
        </div>
    `;
    
    gameLogContainer.appendChild(logDiv);
    
    // Auto-scroll to bottom
    gameLogContainer.scrollTop = gameLogContainer.scrollHeight;
    
    // Keep only last 20 visible entries
    const entries = gameLogContainer.querySelectorAll('.log-entry');
    if (entries.length > 20) {
        entries[0].remove();
    }
}

function formatLogMessage(logEntry) {
    switch (logEntry.action) {
        case 'team_proposed':
            return `${logEntry.playerName} proposed mission to ${logEntry.details.location} with ${logEntry.details.bodyguard} as bodyguard`;
        case 'vote_cast':
            return `${logEntry.playerName} voted ${logEntry.details.vote}`;
        case 'trap_disarmed':
            return `Trap at ${logEntry.details.location} was disarmed successfully`;
        case 'trap_failed':
            return `Trap at ${logEntry.details.location} failed to disarm - Mr. Coral takes damage`;
        case 'clues_collected':
            return `${logEntry.playerName} collected clues at ${logEntry.details.location}`;
        case 'plot_activated':
            return `🎯 THE PLOT HAS BEEN ACTIVATED! Conspiracy wins!`;
        case 'final_accusation':
            return `Final accusation made: ${logEntry.details.who} in ${logEntry.details.where} with ${logEntry.details.what}`;
        default:
            return `${logEntry.playerName} - ${logEntry.action}`;
    }
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Update the UI functions to show better status
function updateWaitingIndicators() {
    if (!isInGame || !gameState) return;
    
    const waitingElement = document.getElementById('waiting-indicator');
    if (!waitingElement) return;
    
    if (gameState.activityStatus && gameState.activityStatus.active.length > 0) {
        const waitingFor = gameState.activityStatus.active
            .map(id => gameState.players.find(p => p.id === id)?.name)
            .filter(name => name)
            .join(', ');
            
        waitingElement.innerHTML = `
            <div class="waiting-content">
                <div class="waiting-spinner"></div>
                <div class="waiting-text">Waiting for: ${waitingFor}</div>
            </div>
        `;
        waitingElement.classList.remove('hidden');
    } else {
        waitingElement.classList.add('hidden');
    }
}

function updateGameLog(gameLogEntries) {
    const gameLogContainer = document.getElementById('game-log');
    if (!gameLogContainer) return;
    
    // Clear and rebuild (more efficient for full updates)
    gameLogContainer.innerHTML = '';
    
    gameLogEntries.slice(-20).forEach(entry => {
        addToGameLog(entry);
    });
}

function proposeFinalTeam() {
    const selectedTeamMembers = [];
    const checkboxes = document.querySelectorAll('#final-team-selection input[type="checkbox"]:checked');
    
    checkboxes.forEach(checkbox => {
        selectedTeamMembers.push(checkbox.value);
    });
    
    if (selectedTeamMembers.length === 0) {
        showGameNotification('warning', 'Team Required', 'Please select at least one team member for the final round.');
        return;
    }
    
    console.log('📋 Proposing final team...');
    socket.emit('propose_final_team', {
        gameId: gameId,
        teamMemberIds: selectedTeamMembers
    });
}

// Handle conspiracy phase
function beginConspiracyPhase() {
    console.log('🤫 Beginning conspiracy phase...');
    socket.emit('begin_conspiracy', { gameId });
}

function handleLocationSelection(locationCard) {
    const locationName = locationCard.dataset.location;
    
    // Clear previous selection
    document.querySelectorAll('.location-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Select new location
    locationCard.classList.add('selected');
    scoutSelections.location = locationName;
    
    // Update UI
    updateSelectedLocation(locationName);
    updateMissionSummary();
    updateConfirmButton();
}

function handlePlayerCardSelection(playerCard) {
    const playerId = playerCard.dataset.playerId;
    const selectionType = playerCard.dataset.selectionType;
    
    if (selectionType === 'bodyguard') {
        // Clear previous bodyguard selection
        document.querySelectorAll('.player-selection-card[data-selection-type="bodyguard"]').forEach(card => {
            card.classList.remove('selected');
        });
        
        // Select new bodyguard
        playerCard.classList.add('selected');
        scoutSelections.bodyguard = playerId;
        
        updateSelectedBodyguard(playerId);
    } else if (selectionType === 'team-member') {
        // Toggle team member selection
        if (playerCard.classList.contains('selected')) {
            playerCard.classList.remove('selected');
            scoutSelections.teamMembers = scoutSelections.teamMembers.filter(id => id !== playerId);
        } else {
            playerCard.classList.add('selected');
            scoutSelections.teamMembers.push(playerId);
        }
        
        updateSelectedTeamMembers();
    }
    
    updateMissionSummary();
    updateConfirmButton();
}

function updateSelectedLocation(locationName) {
    const selectedLocation = document.getElementById('selected-location');
    if (selectedLocation) {
        const valueSpan = selectedLocation.querySelector('.selection-value');
        if (valueSpan) {
            valueSpan.textContent = locationName;
            valueSpan.style.color = 'var(--resort-coral)';
        }
    }
}

function updateSelectedBodyguard(playerId) {
    const selectedBodyguard = document.getElementById('selected-bodyguard');
    if (selectedBodyguard && gameState) {
        const player = gameState.players.find(p => p.id === playerId);
        const valueSpan = selectedBodyguard.querySelector('.selection-value');
        if (valueSpan && player) {
            valueSpan.textContent = `${player.name} (${player.character})`;
            valueSpan.style.color = 'var(--resort-coral)';
        }
    }
}

function updateSelectedTeamMembers() {
    const selectedTeamMembers = document.getElementById('selected-team-members');
    if (selectedTeamMembers && gameState) {
        const valueSpan = selectedTeamMembers.querySelector('.selection-value');
        if (valueSpan) {
            if (scoutSelections.teamMembers.length === 0) {
                valueSpan.textContent = 'You + Bodyguard';
                valueSpan.style.color = 'var(--gray-medium)';
            } else {
                const memberNames = scoutSelections.teamMembers.map(id => {
                    const player = gameState.players.find(p => p.id === id);
                    return player ? player.name : 'Unknown';
                });
                valueSpan.textContent = `You + Bodyguard + ${memberNames.join(', ')}`;
                valueSpan.style.color = 'var(--resort-coral)';
            }
        }
    }
}

function updateMissionSummary() {
    const summaryContent = document.getElementById('mission-summary-content');
    if (!summaryContent) return;
    
    if (!scoutSelections.location || !scoutSelections.bodyguard) {
        summaryContent.innerHTML = '<p>Select a location and bodyguard to see mission details</p>';
        return;
    }
    
    const bodyguardPlayer = gameState.players.find(p => p.id === scoutSelections.bodyguard);
    const teamSize = 2 + scoutSelections.teamMembers.length; // Scout + Bodyguard + additional
    
    const memberNames = scoutSelections.teamMembers.map(id => {
        const player = gameState.players.find(p => p.id === id);
        return player ? player.name : 'Unknown';
    });
    
    const allTeamMembers = ['You', bodyguardPlayer?.name || 'Unknown', ...memberNames];
    
    summaryContent.innerHTML = `
        <div class="summary-item">
            <span class="summary-label">📍 Destination:</span>
            <span class="summary-value">${scoutSelections.location}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">🛡️ Bodyguard:</span>
            <span class="summary-value">${bodyguardPlayer?.name || 'Unknown'}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">👥 Team Size:</span>
            <span class="summary-value">${teamSize} players</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">🎯 Mission Team:</span>
            <span class="summary-value">${allTeamMembers.join(', ')}</span>
        </div>
    `;
}

function updateConfirmButton() {
    const confirmBtn = document.getElementById('confirm-mission-btn');
    if (!confirmBtn) return;
    
    const isValid = scoutSelections.location && scoutSelections.bodyguard;
    
    confirmBtn.disabled = !isValid;
    
    if (isValid) {
        confirmBtn.textContent = '🚀 Launch Mission';
        confirmBtn.classList.remove('btn-disabled');
    } else {
        confirmBtn.innerHTML = '<span class="btn-icon">⚠️</span>Select Location & Bodyguard';
        confirmBtn.classList.add('btn-disabled');
    }
}

function updateBodyguardCards() {
    const bodyguardCards = document.getElementById('bodyguard-cards');
    if (!bodyguardCards) return;
    
    bodyguardCards.innerHTML = '';
    
    gameState.players.forEach(player => {
        // Skip scout and previous bodyguard
        if (player.id === playerId || player.id === gameState.previousRoles?.bodyguard) {
            return;
        }
        
        const card = document.createElement('div');
        card.className = 'player-selection-card';
        card.dataset.playerId = player.id;
        card.dataset.selectionType = 'bodyguard';
        
        card.innerHTML = `
            <div class="player-card-name">${player.name}</div>
            <div class="player-card-character">${player.character}</div>
        `;
        
        bodyguardCards.appendChild(card);
    });
}

function updateTeamMemberCards() {
    const teamMemberCards = document.getElementById('team-member-cards');
    if (!teamMemberCards) return;
    
    teamMemberCards.innerHTML = '';
    
    gameState.players.forEach(player => {
        // Skip scout and selected bodyguard
        if (player.id === playerId || player.id === scoutSelections.bodyguard) {
            return;
        }
        
        const card = document.createElement('div');
        card.className = 'player-selection-card';
        card.dataset.playerId = player.id;
        card.dataset.selectionType = 'team-member';
        
        // Mark as selected if already selected
        if (scoutSelections.teamMembers.includes(player.id)) {
            card.classList.add('selected');
        }
        
        card.innerHTML = `
            <div class="player-card-name">${player.name}</div>
            <div class="player-card-character">${player.character}</div>
        `;
        
        teamMemberCards.appendChild(card);
    });
}

// Replace/enhance the showVoteResultFeedback function around line 1843
function showVoteResultFeedback(gameState) {
    const voteApproved = gameState.phase !== 'round_choose_team'; // If we're not back to team selection, vote passed
    
    // Clear voting status first
    const votingStatus = document.getElementById('voting-status');
    if (votingStatus) {
        votingStatus.innerHTML = '';
        votingStatus.style.background = '';
        votingStatus.style.border = '';
    }
    
    if (voteApproved) {
        // MISSION APPROVED FLOW
        showGameNotification('success', '✅ MISSION APPROVED!', 
            `The team will head to ${gameState.proposedMission?.location || 'the target location'}`);
        
        // Show immediate next steps
        setTimeout(() => {
            showPhaseTransitionGuide('mission_approved');
        }, 1500);
        
    } else {
        // MISSION REJECTED FLOW
        const stormLevel = gameState.stormTracker || 0;
        let message = `❌ MISSION REJECTED! Storm tracker: ${stormLevel}/3`;
        
        if (stormLevel >= 3) {
            message += '\n💔 Mr. Coral takes damage!';
        }
        
        showGameNotification('error', 'Mission Rejected', message);
        
        // Show what happens next
        setTimeout(() => {
            showPhaseTransitionGuide('mission_rejected');
        }, 1500);
    }
}

// Add this new function to guide players through phase transitions
function showPhaseTransitionGuide(situation) {
    const guideModal = document.createElement('div');
    guideModal.className = 'phase-transition-guide';
    guideModal.id = 'phase-guide-modal';
    
    let content = '';
    
    switch (situation) {
        case 'mission_approved':
            content = `
                <div class="guide-header">
                    <h3>🎯 Mission Approved - What Happens Next?</h3>
                </div>
                <div class="guide-steps">
                    <div class="step active">
                        <div class="step-number">1</div>
                        <div class="step-content">
                            <h4>Plot Check Phase</h4>
                            <p>Everyone will be asked: <strong>"Has the plot been activated?"</strong></p>
                            <p>The conspiracy members secretly know if their plot conditions are met.</p>
                        </div>
                    </div>
                    <div class="step">
                        <div class="step-number">2</div>
                        <div class="step-content">
                            <h4>Disarm Traps</h4>
                            <p>If plot isn't activated, team members work together to disarm the trap at this location.</p>
                        </div>
                    </div>
                    <div class="step">
                        <div class="step-number">3</div>
                        <div class="step-content">
                            <h4>Collect Clues & Continue</h4>
                            <p>Bodyguard gathers information, then the next scout takes over.</p>
                        </div>
                    </div>
                </div>
                <button class="btn btn-primary" onclick="closePhaseGuide()">Got it! Let's proceed</button>
            `;
            break;
            
        case 'mission_rejected':
            content = `
                <div class="guide-header">
                    <h3>❌ Mission Rejected - What Happens Next?</h3>
                </div>
                <div class="guide-steps">
                    <div class="step active">
                        <div class="step-number">1</div>
                        <div class="step-content">
                            <h4>Storm Tracker Increases</h4>
                            <p>Failed votes bring the storm closer! Current: ${gameState.stormTracker || 0}/3</p>
                            ${(gameState.stormTracker >= 3) ? '<p class="danger">⚠️ Mr. Coral takes damage from the storm!</p>' : ''}
                        </div>
                    </div>
                    <div class="step">
                        <div class="step-number">2</div>
                        <div class="step-content">
                            <h4>New Scout Takes Over</h4>
                            <p>The scout role passes to the next player who will choose a new team and location.</p>
                        </div>
                    </div>
                    ${(gameState.coralHealth <= 0) ? `
                    <div class="step danger">
                        <div class="step-number">⚠️</div>
                        <div class="step-content">
                            <h4>Mr. Coral is Dead!</h4>
                            <p>The game enters final accusation mode. Friends must identify the conspiracy!</p>
                        </div>
                    </div>
                    ` : ''}
                </div>
                <button class="btn btn-primary" onclick="closePhaseGuide()">Understood</button>
            `;
            break;
            
        case 'plot_check':
            content = `
                <div class="guide-header">
                    <h3>🕵️ Plot Check Phase</h3>
                </div>
                <div class="guide-content">
                    <p><strong>Everyone should now ask:</strong></p>
                    <div class="plot-question">"Has the plot been activated?"</div>
                    <div class="guide-explanation">
                        <h4>What this means:</h4>
                        <ul>
                            <li>🎭 <strong>Conspiracy members</strong> know their secret plot conditions</li>
                            <li>👥 <strong>Friends</strong> are watching for suspicious behavior</li>
                            <li>⚖️ Someone will click the button below to proceed</li>
                        </ul>
                        <p><em>The conspiracy wins if their plot conditions are met!</em></p>
                    </div>
                </div>
                <button class="btn btn-primary" onclick="closePhaseGuide()">Ready to check plot</button>
            `;
            break;
            
        case 'disarm_phase':
            content = `
                <div class="guide-header">
                    <h3>⚡ Trap Disarming Phase</h3>
                </div>
                <div class="guide-content">
                    <div class="phase-explanation">
                        <h4>Team members at ${gameState.proposedMission?.location}:</h4>
                        <p>Work together to disarm the trap by contributing supply cards.</p>
                        
                        <div class="trap-info">
                            <h5>How it works:</h5>
                            <ul>
                                <li>💳 Each team member selects supply cards to contribute</li>
                                <li>🎯 Cards must total enough value to disarm the trap</li>
                                <li>⚡ Instant Disarm cards can neutralize any trap immediately</li>
                                <li>❌ If you fail, Mr. Coral takes damage!</li>
                            </ul>
                        </div>
                    </div>
                </div>
                <button class="btn btn-primary" onclick="closePhaseGuide()">Let's disarm this trap!</button>
            `;
            break;
    }
    
    guideModal.innerHTML = content;
    document.body.appendChild(guideModal);
    
    // Animate it in
    setTimeout(() => {
        guideModal.classList.add('visible');
    }, 50);
}

// Function to close the phase guide
window.closePhaseGuide = function() {
    const guide = document.getElementById('phase-guide-modal');
    if (guide) {
        guide.classList.remove('visible');
        setTimeout(() => {
            guide.remove();
        }, 300);
    }
};

// Add this new function to handle phase transitions smoothly
function handlePhaseTransition(fromPhase, toPhase) {
    console.log(`🔄 Phase transition: ${fromPhase} → ${toPhase}`);
    
    // Show appropriate guidance for key transitions
    setTimeout(() => {
        switch (toPhase) {
            case 'round_plot_check':
                if (fromPhase === 'round_voting') {
                    // Mission was approved, now checking plot
                    showPhaseTransitionGuide('plot_check');
                }
                break;
                
            case 'round_disarm_traps':
                if (fromPhase === 'round_plot_check') {
                    // Plot wasn't activated, now disarming
                    showPhaseTransitionGuide('disarm_phase');
                }
                break;
                
            case 'round_choose_team':
                if (fromPhase === 'round_voting') {
                    // Vote was rejected, starting new round
                    const scoutName = gameState.players.find(p => p.id === gameState.currentScout)?.name;
                    showGameNotification('info', '🎯 New Round Starting', 
                        `${scoutName} is now the scout and will choose a new team.`);
                } else if (fromPhase === 'round_supply_distribution') {
                    // Normal end of round
                    const scoutName = gameState.players.find(p => p.id === gameState.currentScout)?.name;
                    showGameNotification('info', '🔄 Round Complete', 
                        `Round ${gameState.round} begins! ${scoutName} is the new scout.`);
                }
                break;
                
            case 'final_accusation_setup':
                showGameNotification('warning', '💀 Mr. Coral is Dead!', 
                    'The Friends must now identify the conspiracy to win the game.');
                break;
                
            case 'final_accusation':
                showGameNotification('info', '⏰ Final Accusation Phase', 
                    'You have 5 minutes to discuss and make your accusation!');
                break;
        }
    }, 500); // Small delay for smooth transitions
}

// Enhanced supply distribution interface
function showSupplyDistributionInterface(data) {
    const { drawnCards, teamMembers } = data;
    
    // Create distribution interface
    const distributionDiv = document.createElement('div');
    distributionDiv.className = 'supply-distribution-interface';
    distributionDiv.innerHTML = `
        <h3>🎒 Distribute Supply Cards</h3>
        <p>Drag cards to team members or click to assign:</p>
        <div class="drawn-cards">
            ${drawnCards.map(card => `
                <div class="card supply draggable" data-card-id="${card.id}">
                    <div class="card-value">${card.value}</div>
                    ${card.suit ? `<div class="card-suit ${card.suit.toLowerCase()}">${getSuitSymbol(card.suit)}</div>` : ''}
                </div>
            `).join('')}
        </div>
        <div class="team-members">
            ${teamMembers.map(member => `
                <div class="member-drop-zone" data-player-id="${member.id}">
                    <h4>${member.name}</h4>
                    <p>Cards: ${member.currentCards}/${member.maxCards}</p>
                    <div class="assigned-cards" data-player-id="${member.id}"></div>
                </div>
            `).join('')}
        </div>
        <button id="confirm-distribution" class="btn btn-primary">Confirm Distribution</button>
    `;
    
    // Show in a modal or panel
    document.body.appendChild(distributionDiv);
    
    // Add drag-and-drop functionality
    setupDistributionDragDrop();
}

function setupDistributionDragDrop() {
    // Complete implementation for drag-and-drop card distribution
    const draggableCards = document.querySelectorAll('.draggable');
    const dropZones = document.querySelectorAll('.member-drop-zone');
    
    draggableCards.forEach(card => {
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', card.dataset.cardId);
            card.classList.add('dragging');
        });
        
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });
        
        // Click to assign alternative
        card.addEventListener('click', () => {
            showCardAssignmentMenu(card);
        });
    });
    
    dropZones.forEach(zone => {
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
        
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });
        
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            const cardId = e.dataTransfer.getData('text/plain');
            const playerId = zone.dataset.playerId;
            
            assignCardToPlayer(cardId, playerId);
            zone.classList.remove('drag-over');
        });
    });
    
    // Confirm distribution button
    const confirmBtn = document.getElementById('confirm-distribution');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', confirmSupplyDistribution);
    }
}

function showCardAssignmentMenu(cardElement) {
    // Show menu for manual card assignment
    const cardId = cardElement.dataset.cardId;
    const menu = document.createElement('div');
    menu.className = 'card-assignment-menu';
    
    const teamMembers = gameState.players.filter(p => 
        gameState.proposedMission.teamMembers.includes(p.id)
    );
    
    menu.innerHTML = `
        <div class="menu-header">Assign to:</div>
        ${teamMembers.map(member => `
            <button class="assign-btn" data-player-id="${member.id}">
                ${member.name}
            </button>
        `).join('')}
    `;
    
    document.body.appendChild(menu);
    
    // Position menu near card
    const rect = cardElement.getBoundingClientRect();
    menu.style.position = 'absolute';
    menu.style.left = rect.right + 'px';
    menu.style.top = rect.top + 'px';
    
    // Add click handlers
    menu.querySelectorAll('.assign-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            assignCardToPlayer(cardId, btn.dataset.playerId);
            document.body.removeChild(menu);
        });
    });
    
    // Close menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
                document.body.removeChild(menu);
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 100);
}

function assignCardToPlayer(cardId, playerId) {
    // Move card to player's assigned area
    const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
    const targetZone = document.querySelector(`[data-player-id="${playerId}"] .assigned-cards`);
    
    if (cardElement && targetZone) {
        cardElement.classList.add('assigned');
        targetZone.appendChild(cardElement);
        
        // Update distribution tracking
        if (!window.currentDistribution) {
            window.currentDistribution = {};
        }
        if (!window.currentDistribution[playerId]) {
            window.currentDistribution[playerId] = [];
        }
        window.currentDistribution[playerId].push(cardId);
        
        updateDistributionValidation();
    }
}

function updateDistributionValidation() {
    const confirmBtn = document.getElementById('confirm-distribution');
    const drawnCards = document.querySelectorAll('.drawn-cards .draggable');
    const assignedCards = document.querySelectorAll('.assigned-cards .draggable');
    
    // Check if all cards are assigned
    const allAssigned = drawnCards.length === assignedCards.length;
    
    if (confirmBtn) {
        confirmBtn.disabled = !allAssigned;
        confirmBtn.textContent = allAssigned ? 
            'Confirm Distribution' : 
            `Assign ${drawnCards.length - assignedCards.length} more cards`;
    }
}

function confirmSupplyDistribution() {
    if (window.currentDistribution) {
        socket.emit('execute_supply_distribution', {
            gameId: gameId,
            distribution: window.currentDistribution
        });
        
        // Close distribution interface
        const distributionDiv = document.querySelector('.supply-distribution-interface');
        if (distributionDiv) {
            document.body.removeChild(distributionDiv);
        }
        
        // Clear tracking
        window.currentDistribution = null;
    }
}

// Missing functions for clue collection interface
function getSelectedWeaponClaims() {
    const selectedWeapons = [];
    const weaponCheckboxes = document.querySelectorAll('.weapon-claim-checkbox:checked');
    weaponCheckboxes.forEach(checkbox => {
        selectedWeapons.push(checkbox.value);
    });
    return selectedWeapons;
}

function getSelectedLocationClaims() {
    const selectedLocations = [];
    const locationCheckboxes = document.querySelectorAll('.location-claim-checkbox:checked');
    locationCheckboxes.forEach(checkbox => {
        selectedLocations.push(checkbox.value);
    });
    return selectedLocations;
}

// ADD THIS AT THE VERY END OF script.js:

function forceStartGame() {
    console.log('🚨 FORCE START called');
    console.log('gameId:', gameId);
    console.log('socket connected:', socket?.connected);
    
    // LOG COMPLETE GAME STATE
    console.log('🎮 COMPLETE GAME STATE:', JSON.stringify(gameState, null, 2));
    
    const debugInfo = document.getElementById('debug-info');
    if (debugInfo) {
        debugInfo.innerHTML = `
            gameId: ${gameId}<br>
            socket connected: ${socket?.connected}<br>
            isInGame: ${isInGame}<br>
            gameState: ${gameState ? 'exists' : 'null'}<br>
            playerCount: ${gameState?.playerCount || 'unknown'}<br>
            <strong>PHASE: ${gameState?.phase || 'unknown'}</strong><br>
            currentScout: ${gameState?.currentScout || 'none'}<br>
            round: ${gameState?.round || 'unknown'}
        `;
    }
    
    socket.emit('start_game', { gameId: gameId });
    
    // MULTIPLE ATTEMPTS TO FORCE SCREEN SWITCH
    setTimeout(() => {
        console.log('🔧 First attempt - checking game state...');
        console.log('gameState.phase:', gameState?.phase);
        console.log('isInGame:', isInGame);
        
        if (gameState && gameState.phase !== 'lobby') {
            console.log('⚡ FORCING SCREEN TO GAME-SCREEN (attempt 1)');
            showScreen('game-screen');
        }
    }, 1000);
    
    setTimeout(() => {
        console.log('🔧 Second attempt - forcing screen regardless...');
        console.log('⚡ FORCING SCREEN TO GAME-SCREEN (attempt 2)');
        showScreen('game-screen');
        
        // Also force UI update
        if (gameState) {
            console.log('🔧 Forcing UI update...');
            updateUI();
        }
    }, 2000);
    
    setTimeout(() => {
        console.log('🔧 Third attempt - checking what screen is active...');
        const activeScreens = document.querySelectorAll('.screen.active');
        console.log('Active screens:', activeScreens);
        activeScreens.forEach(screen => console.log('Active screen ID:', screen.id));
        
        const gameScreen = document.getElementById('game-screen');
        console.log('Game screen exists:', !!gameScreen);
        console.log('Game screen classes:', gameScreen?.classList.toString());
        
        // FORCE activate game screen
        console.log('⚡ FORCING SCREEN TO GAME-SCREEN (attempt 3)');
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        if (gameScreen) {
            gameScreen.classList.add('active');
        }
    }, 3000);
}

// Login and setup functions
function handleLogin(e) {
    e.preventDefault();
    console.log('🚨 handleLogin called!');
    
    const playerNameInput = document.getElementById('player-name');
    const gameIdInput = document.getElementById('game-id');
    
    console.log('playerNameInput:', playerNameInput);
    console.log('gameIdInput:', gameIdInput);
    
    if (!playerNameInput || !gameIdInput) {
        console.error('❌ Required input elements not found');
        alert('Form elements not found!');
        return;
    }
    
    playerName = playerNameInput.value.trim();
    let inputGameId = gameIdInput.value.trim();
    
    console.log('playerName:', playerName);
    console.log('inputGameId:', inputGameId);
    
    if (!playerName) {
        console.log('❌ No player name provided');
        alert('Please enter your name!');
        return;
    }
    
    gameId = inputGameId || generateGameId();
    console.log('Final gameId:', gameId);
    
    // Check socket connection
    console.log('socket exists:', !!socket);
    console.log('socket connected:', socket?.connected);
    
    if (!socket || !socket.connected) {
        console.error('❌ Socket not connected!');
        alert('Connection error! Please refresh the page.');
        return;
    }
    
    console.log('🎮 Emitting join_game event...');
    socket.emit('join_game', { gameId, playerName });
    
    // Add a timeout to see if we get a response
    setTimeout(() => {
        console.log('⏰ 3 seconds after join_game - still on login screen?');
        console.log('Current isInGame:', isInGame);
        console.log('Current gameId:', gameId);
    }, 3000);
}

function generateGameId() {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    console.log('Generated gameId:', id);
    return id;
}

// ALSO ADD THIS TO setupEventListeners function:
function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Login form handler - THIS WAS MISSING!
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
        console.log('✅ Login form handler added');
    } else {
        console.error('❌ Login form not found!');
    }
    
    // ... rest of your existing event listeners ...
}

function getTrapSuitSymbol(suit) {
    if (!suit) return '';
    
    console.log('🔧 getTrapSuitSymbol called with:', suit);
    
    switch (suit.toLowerCase()) {
        case 'triangle':
            return ' ▲';
        case 'circle':
            return ' ●';
        case 'trip wire':
            return ' ⚡';
        default:
            console.warn('⚠️ Unknown trap suit:', suit);
            return '';
    }
} 