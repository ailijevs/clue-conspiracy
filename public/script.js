// Game state
let socket;
let gameId;
let playerId;
let playerName;
let gameState = null;
let privateState = null;
let selectedCards = [];
let notifications = [];
let activityUpdateInterval;
let isInGame = false;

// Selection state for scout
let scoutSelections = {
    location: null,
    bodyguard: null,
    teamMembers: []
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing...');
    
    // COMPLETELY RESET GAME STATE ON PAGE LOAD
    gameState = null;
    privateState = null;
    isInGame = false;
    playerId = null;
    gameId = null;
    selectedCards = [];
    scoutSelections = {
        location: null,
        bodyguard: null,
        teamMembers: []
    };
    
    // FORCE hide game screen and show login screen
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Hide waiting indicator and activity display initially
    const waitingIndicator = document.getElementById('waiting-indicator');
    const activityDisplay = document.getElementById('current-activity');
    
    if (waitingIndicator) {
        waitingIndicator.classList.add('hidden');
    }
    if (activityDisplay) {
        activityDisplay.classList.add('hidden');
    }
    
    // FORCE show login screen
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
        loginScreen.classList.add('active');
    }
    
    // Initialize socket after setting up the UI
    initializeSocket();
    setupEventListeners();
    
    console.log('✅ Login screen should now be visible');
});

function initializeSocket() {
    socket = io();
    
    socket.on('connect', () => {
        playerId = socket.id;
        console.log('Connected to server:', playerId);
    });

    socket.on('joined_game', (data) => {
        console.log('Joined game:', data);
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
        console.error('Join failed:', data);
        alert('Failed to join game: ' + data.reason);
        isInGame = false;
        // Return to login screen on failure
        showScreen('login-screen');
    });

    socket.on('game_state', (state) => {
        console.log('Game state received:', state);
        gameState = state;
        if (isInGame) {
            updateUI();
        }
    });

    socket.on('private_state', (state) => {
        console.log('Private state received:', state);
        privateState = state;
        if (isInGame) {
            updatePrivateUI();
        }
    });

    socket.on('plot_revealed', (plot) => {
        console.log('Plot revealed:', plot);
        if (privateState && (privateState.secretRole === 'ringleader' || privateState.secretRole === 'accomplice')) {
            alert(`🤫 Secret Plot Revealed!\nLocation: ${plot.plotLocation}\nWeapon: ${plot.plotWeapon}`);
        }
    });

    socket.on('plot_check_result', (result) => {
        console.log('Plot check result:', result);
        if (result.activated) {
            alert('🎯 The Plot has been activated! The Conspiracy wins!');
        } else {
            alert('🕵️ Plot not activated. Continue with trap disarming.');
        }
    });

    socket.on('disarm_result', (result) => {
        console.log('Disarm result:', result);
        showDisarmResult(result);
    });

    socket.on('final_accusation_result', (result) => {
        console.log('Final accusation result:', result);
        showFinalAccusationResult(result);
    });

    socket.on('game_ended', (result) => {
        console.log('Game ended:', result);
        showGameEnd(result);
    });

    socket.on('error', (message) => {
        console.error('Socket error:', message);
        alert('Error: ' + message);
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        isInGame = false;
        // Return to login screen on disconnect
        showScreen('login-screen');
    });

    socket.on('activity_update', (activity) => {
        console.log('Activity update:', activity);
        if (isInGame) {
            updateActivityDisplay(activity);
        }
    });

    socket.on('game_log_update', (logEntry) => {
        console.log('Game log update:', logEntry);
        if (isInGame) {
            addToGameLog(logEntry);
        }
    });

    socket.on('notification', (notification) => {
        console.log('Notification:', notification);
        showNotification(notification);
    });

    // Reset selections when becoming scout
    socket.on('game_state_updated', (data) => {
        // ... existing code ...
        
        // Reset scout selections if we're the new scout
        if (data.gameState.currentScout === playerId && data.gameState.phase === 'round_choose_team') {
            scoutSelections = {
                location: null,
                bodyguard: null,
                teamMembers: []
            };
        }
        
        // ... existing code ...
    });
}

function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Login
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Lobby actions
    const startGameBtn = document.getElementById('start-game-btn');
    if (startGameBtn) {
        startGameBtn.addEventListener('click', startGame);
    }

    // Setup actions
    const startConspiracyBtn = document.getElementById('start-conspiracy-btn');
    if (startConspiracyBtn) {
        startConspiracyBtn.addEventListener('click', beginConspiracyPhase);
    }

    // Conspiracy actions
    const revealPlotBtn = document.getElementById('reveal-plot-btn');
    if (revealPlotBtn) {
        revealPlotBtn.addEventListener('click', revealPlot);
    }

    const finishPlottingBtn = document.getElementById('finish-plotting-btn');
    if (finishPlottingBtn) {
        finishPlottingBtn.addEventListener('click', finishPlotting);
    }

    // Scout actions
    const confirmMissionBtn = document.getElementById('confirm-mission-btn');
    if (confirmMissionBtn) {
        confirmMissionBtn.addEventListener('click', confirmMission);
    }

    // Voting actions
    const voteApproveBtn = document.getElementById('vote-approve');
    if (voteApproveBtn) {
        voteApproveBtn.addEventListener('click', () => castVote('approve'));
    }

    const voteRejectBtn = document.getElementById('vote-reject');
    if (voteRejectBtn) {
        voteRejectBtn.addEventListener('click', () => castVote('reject'));
    }

    // Plot check
    const checkPlotBtn = document.getElementById('check-plot-btn');
    if (checkPlotBtn) {
        checkPlotBtn.addEventListener('click', checkPlot);
    }

    // Disarming actions
    const submitCardsBtn = document.getElementById('submit-cards-btn');
    if (submitCardsBtn) {
        submitCardsBtn.addEventListener('click', submitSupplyCards);
    }

    // Collecting actions
    const collectCluesBtn = document.getElementById('collect-clues-btn');
    if (collectCluesBtn) {
        collectCluesBtn.addEventListener('click', collectClues);
    }

    // Supply distribution
    const distributeSuppliesBtn = document.getElementById('distribute-supplies-btn');
    if (distributeSuppliesBtn) {
        distributeSuppliesBtn.addEventListener('click', distributeSupplies);
    }

    // Final accusation
    const submitAccusationBtn = document.getElementById('submit-accusation-btn');
    if (submitAccusationBtn) {
        submitAccusationBtn.addEventListener('click', submitFinalAccusation);
    }

    // New game
    const newGameBtn = document.getElementById('new-game-btn');
    if (newGameBtn) {
        newGameBtn.addEventListener('click', () => location.reload());
    }

    // Supply card selection
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('supply-card')) {
            toggleSupplyCard(e.target);
        }
    });

    // Dynamic form updates
    const bodyguardSelect = document.getElementById('bodyguard-select');
    const locationSelect = document.getElementById('location-select');
    
    if (bodyguardSelect) {
        bodyguardSelect.addEventListener('change', updateMissionConfirmButton);
    }
    if (locationSelect) {
        locationSelect.addEventListener('change', updateMissionConfirmButton);
    }

    // Final accusation setup
    const proposeFinalTeamBtn = document.getElementById('propose-final-team-btn');
    if (proposeFinalTeamBtn) {
        proposeFinalTeamBtn.addEventListener('click', proposeFinalTeam);
    }
    
    // 5-minute timer for final accusation
    let finalAccusationTimer = null;
    
    socket.on('final_accusation_started', () => {
        // Start 5-minute timer
        finalAccusationTimer = setTimeout(() => {
            alert('⏰ Time is up! The Conspiracy wins by default.');
        }, 5 * 60 * 1000); // 5 minutes
        
        showGameNotification('info', '⏰ Final Accusation Phase', 'You have 5 minutes to discuss and vote!');
    });
    
    socket.on('game_ended', () => {
        if (finalAccusationTimer) {
            clearTimeout(finalAccusationTimer);
        }
    });

    // Conspiracy phase actions
    const beginConspiracyBtn = document.getElementById('begin-conspiracy-btn');
    if (beginConspiracyBtn) {
        beginConspiracyBtn.addEventListener('click', beginConspiracyPhase);
    }
    
    const finishConspiracyBtn = document.getElementById('finish-conspiracy-btn');
    if (finishConspiracyBtn) {
        finishConspiracyBtn.addEventListener('click', finishConspiracyPhase);
    }

    // Add instant disarm result handler
    socket.on('instant_disarm_result', (result) => {
        console.log('Instant disarm result:', result);
        if (result.success) {
            showGameNotification('success', '⚡ Trap Instantly Disarmed!', 'The trap has been neutralized without using supply cards.');
        }
    });

    // Location selection (click on board)
    document.addEventListener('click', (e) => {
        if (e.target.closest('.location-card.selectable')) {
            handleLocationSelection(e.target.closest('.location-card'));
        }
    });
    
    // Player card selection
    document.addEventListener('click', (e) => {
        if (e.target.closest('.player-selection-card') && !e.target.closest('.player-selection-card').classList.contains('disabled')) {
            handlePlayerCardSelection(e.target.closest('.player-selection-card'));
        }
    });
}

// Login and setup functions
function handleLogin(e) {
    e.preventDefault();
    console.log('Handle login called');
    
    const playerNameInput = document.getElementById('player-name');
    const gameIdInput = document.getElementById('game-id');
    
    if (!playerNameInput || !gameIdInput) {
        console.error('Required input elements not found');
        return;
    }
    
    playerName = playerNameInput.value.trim();
    let inputGameId = gameIdInput.value.trim();
    
    if (!playerName) {
        alert('Please enter your name');
        return;
    }
    
    gameId = inputGameId || generateGameId();
    
    console.log('Joining game:', { gameId, playerName });
    socket.emit('join_game', { gameId, playerName });
}

function generateGameId() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function startGame() {
    console.log('Starting game...');
    socket.emit('start_game', { gameId });
}

// Game action functions
function confirmMission() {
    console.log('🎯 Scout confirming mission...');
    
    if (!scoutSelections.location || !scoutSelections.bodyguard) {
        alert('Please select both a location and a bodyguard');
        return;
    }
    
    console.log('Mission details:', scoutSelections);
    
    socket.emit('propose_team', {
        gameId,
        bodyguardId: scoutSelections.bodyguard,
        teamMemberIds: scoutSelections.teamMembers,
        locationName: scoutSelections.location
    });
    
    // Reset selections for next round
    scoutSelections = {
        location: null,
        bodyguard: null,
        teamMembers: []
    };
}

function castVote(vote) {
    console.log('🗳️ Casting vote:', vote);
    console.log('Current game state:', gameState);
    console.log('Current phase:', gameState?.phase);
    
    // Add validation
    if (!gameState || gameState.phase !== 'round_voting') {
        console.error('Cannot vote - not in voting phase');
        alert('Cannot vote right now. Game phase: ' + (gameState?.phase || 'unknown'));
        return;
    }
    
    // Disable voting buttons to prevent double-voting
    const approveBtn = document.getElementById('vote-approve');
    const rejectBtn = document.getElementById('vote-reject');
    
    if (approveBtn) approveBtn.disabled = true;
    if (rejectBtn) rejectBtn.disabled = true;
    
    // Show visual feedback
    const clickedBtn = document.getElementById(vote === 'approve' ? 'vote-approve' : 'vote-reject');
    if (clickedBtn) {
        clickedBtn.style.opacity = '0.7';
        clickedBtn.textContent = vote === 'approve' ? '✅ Approved' : '❌ Rejected';
    }
    
    socket.emit('cast_vote', { gameId, vote });
}

function checkPlot() {
    console.log('Checking plot...');
    socket.emit('check_plot', { gameId });
}

function submitSupplyCards() {
    const selectedCardIds = selectedCards.map(card => card.id);
    
    if (selectedCardIds.length === 0) {
        alert('Please select at least one supply card');
        return;
    }
    
    console.log('Submitting supply cards:', selectedCardIds);
    socket.emit('submit_supply_cards', { gameId, cardIds: selectedCardIds });
    
    // Clear selection
    selectedCards = [];
    updateSupplyCardsDisplay();
}

function collectClues() {
    const weaponClaim = document.getElementById('weapon-claim-select').value;
    const locationClaim = document.getElementById('location-claim-select').value;
    
    console.log('Collecting clues...');
    socket.emit('collect_clues', { gameId, weaponClaim, locationClaim });
}

function distributeSupplies() {
    console.log('Distributing supplies...');
    socket.emit('distribute_supplies', { gameId });
}

function submitFinalAccusation() {
    const who = document.getElementById('accusation-who').value;
    const where = document.getElementById('accusation-where').value;
    const what = document.getElementById('accusation-what').value;
    
    if (!who || !where || !what) {
        alert('Please select who, where, and what for your accusation');
        return;
    }
    
    console.log('Submitting final accusation...');
    socket.emit('final_accusation', { gameId, who, where, what });
}

// UI update functions
function updateUI() {
    console.log('Updating UI...');
    if (!gameState || !isInGame) {
        console.log('No game state or not in game, skipping UI update');
        return;
    }
    
    // Update basic info
    updateBasicInfo();
    
    // Update players grid
    updatePlayersGrid();
    
    // Update game board
    updateGameBoard();
    
    // Update health trackers
    updateHealthTrackers();
    
    // Show appropriate screen and panels
    updateScreenAndPanels();
    
    // Update form options
    updateFormOptions();
    
    // Update activity status
    if (gameState.activityStatus) {
        updateActivityDisplay(gameState.activityStatus);
    }
    
    // Update game log
    if (gameState.gameLog) {
        updateGameLog(gameState.gameLog);
    }
    
    // Update waiting indicators
    updateWaitingIndicators();
}

function updateBasicInfo() {
    // Update player count
    const playerCountElement = document.getElementById('player-count');
    if (playerCountElement) {
        playerCountElement.textContent = gameState.playerCount;
    }
    
    // Update game phase
    const gamePhaseElement = document.getElementById('game-phase');
    if (gamePhaseElement) {
        gamePhaseElement.textContent = getPhaseDisplayName(gameState.phase);
    }
    
    // Update round info
    const roundInfoElement = document.getElementById('round-info');
    if (roundInfoElement) {
        roundInfoElement.textContent = `Round ${gameState.round}`;
    }
    
    // Update game ID displays
    document.getElementById('game-id-display').textContent = gameState.id;
    document.getElementById('game-id-display-game').textContent = gameState.id;
    
    // Update start game button
    const startGameBtn = document.getElementById('start-game-btn');
    if (startGameBtn) {
        startGameBtn.disabled = gameState.playerCount < 4;
        startGameBtn.textContent = gameState.playerCount < 4 ? 
            `Start Game (Need ${4 - gameState.playerCount} more players)` : 
            `Start Game (${gameState.playerCount} players ready)`;
    }
}

function updatePlayersGrid() {
    const playersGrid = document.getElementById('players-grid');
    if (!playersGrid || !gameState.players) return;
    
    playersGrid.innerHTML = '';
    
    gameState.players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = `player-card ${player.id === playerId ? 'me' : ''}`;
        
        let statusText = '';
        if (gameState.currentScout === player.id) statusText += '🎯 Scout ';
        if (gameState.currentBodyguard === player.id) statusText += '🛡️ Bodyguard ';
        
        playerDiv.innerHTML = `
            <div class="player-name">${player.name} ${statusText}</div>
            <div class="player-character">${player.character}</div>
            <div class="player-stats">
                <span>Supply: ${player.supplyCardCount}</span>
                <span>Clues: ${player.clueCardCount}</span>
            </div>
        `;
        playersGrid.appendChild(playerDiv);
    });
}

function updateGameBoard() {
    const resortBoard = document.getElementById('resort-board');
    if (!resortBoard || !gameState.locations) return;
    
    // Update each location card
    gameState.locations.forEach(location => {
        const locationElement = document.querySelector(`[data-location="${location.name}"]`);
        if (!locationElement) return;
        
        const trapDisplay = locationElement.querySelector('.trap-display');
        if (!trapDisplay) return;
        
        // Check if this is the safe location
        if (location.name === gameState.safeLocation) {
            trapDisplay.innerHTML = '<span class="safe-indicator">✅ SAFE</span>';
            trapDisplay.classList.add('safe');
        } else if (location.hasTraps) {
            // Show trap information
            trapDisplay.classList.remove('safe');
            
            let trapSuitsHTML = '';
            if (location.trapSuit === 'Trip Wire') {
                // Trip Wire Explosive shows both Triangle and Circle
                trapSuitsHTML = `
                    <div class="suit-symbol triangle">▲</div>
                    <div class="suit-symbol circle">●</div>
                `;
            } else {
                // Single suit trap (Triangle or Circle)
                const suitSymbol = {
                    'Triangle': '▲',
                    'Circle': '●'
                }[location.trapSuit] || '?';
                
                trapSuitsHTML = `<div class="suit-symbol ${location.trapSuit.toLowerCase()}">${suitSymbol}</div>`;
            }
            
            trapDisplay.innerHTML = `
                <span class="trap-value">${location.trapValue}</span>
                <div class="trap-suits">
                    ${trapSuitsHTML}
                </div>
            `;
        } else {
            // Trap has been disarmed
            trapDisplay.innerHTML = '<span class="disarmed-indicator">🔓 DISARMED</span>';
            trapDisplay.classList.add('disarmed');
        }
        
        // Update location status
        locationElement.classList.toggle('visited', location.visited);
        locationElement.classList.toggle('current', location.playersPresent.includes('mr_coral'));
        locationElement.classList.toggle('disarmed', !location.hasTraps && location.name !== gameState.safeLocation);
    });
    
    updateCoralPosition();
}

function updateCoralPosition() {
    const coralIndicator = document.getElementById('coral-position');
    if (!coralIndicator || !gameState.locations) return;
    
    // Find where Mr. Coral is
    const coralLocation = gameState.locations.find(loc => 
        loc.playersPresent.includes('mr_coral')
    );
    
    if (coralLocation) {
        // Position the indicator on the current location
        const locationElement = document.querySelector(`[data-location="${coralLocation.name}"]`);
        if (locationElement) {
            const rect = locationElement.getBoundingClientRect();
            const boardRect = document.getElementById('resort-board').getBoundingClientRect();
            
            coralIndicator.style.left = `${rect.left - boardRect.left + rect.width/2 - 15}px`;
            coralIndicator.style.top = `${rect.top - boardRect.top + rect.height/2 - 15}px`;
            coralIndicator.style.display = 'block';
        }
    } else {
        coralIndicator.style.display = 'none';
    }
}

function updateHealthTrackers() {
    // Update storm tracker
    const stormIndicators = document.getElementById('storm-indicators');
    if (stormIndicators) {
        stormIndicators.innerHTML = '';
        for (let i = 0; i < 3; i++) {
            const indicator = document.createElement('div');
            indicator.className = `tracker-indicator storm-indicator ${i < gameState.stormTracker ? 'active' : ''}`;
            indicator.textContent = '⛈️';
            stormIndicators.appendChild(indicator);
        }
    }
    
    // Update health tracker
    const healthIndicators = document.getElementById('health-indicators');
    if (healthIndicators) {
        healthIndicators.innerHTML = '';
        for (let i = 0; i < 3; i++) {
            const indicator = document.createElement('div');
            indicator.className = `tracker-indicator health-indicator ${i >= gameState.coralHealth ? 'lost' : ''}`;
            indicator.textContent = '💖';
            healthIndicators.appendChild(indicator);
        }
    }
}

function updateScreenAndPanels() {
    if (!gameState || !isInGame) return;

    // Show game screen for all phases except lobby
    if (gameState.phase === 'lobby') {
        showScreen('lobby-screen');
        return;
    }

    showScreen('game-screen');

    // Hide all action panels first
    document.querySelectorAll('.action-panel').forEach(panel => {
        panel.style.display = 'none';
    });

    // Show appropriate panel based on phase and player role
    switch (gameState.phase) {
        case 'conspiracy_setup':
            document.getElementById('setup-actions').style.display = 'block';
            break;
        
        case 'conspiracy_plotting':
            document.getElementById('plotting-actions').style.display = 'block';
            break;
        
        case 'round_choose_team':
            // Only the current scout sees the team selection panel
            if (gameState.currentScout === playerId) {
                document.getElementById('scout-actions').style.display = 'block';
                console.log('🎯 Showing scout actions for current scout');
            } else {
                // Show waiting message for other players
                console.log('⏰ Waiting for scout to choose team');
            }
            break;
        
        case 'round_voting':
            console.log('🗳️ Showing voting panel');
            document.getElementById('voting-actions').style.display = 'block';
            updateVotingDisplay();
            break;
        
        case 'round_plot_check':
            document.getElementById('plot-check-actions').style.display = 'block';
            break;
        
        case 'round_disarm_traps':
            if (gameState.proposedMission && gameState.proposedMission.teamMembers.includes(playerId)) {
                document.getElementById('disarming-actions').style.display = 'block';
            }
            break;
        
        case 'round_collect_clues':
            if (gameState.currentBodyguard === playerId) {
                document.getElementById('collecting-actions').style.display = 'block';
            }
            break;
        
        case 'round_supply_distribution':
            if (gameState.currentScout === playerId) {
                document.getElementById('supplying-actions').style.display = 'block';
            }
            break;
        
        case 'final_accusation_setup':
            if (gameState.currentScout === playerId) {
                document.getElementById('final-team-selection').style.display = 'block';
            }
            break;
        
        case 'final_accusation_voting':
            document.getElementById('voting-actions').style.display = 'block';
            updateVotingDisplay();
            break;
        
        case 'final_accusation':
            document.getElementById('final-accusation-actions').style.display = 'block';
            break;
        
        case 'game_over':
            document.getElementById('game-over-actions').style.display = 'block';
            break;
        
        default:
            console.log('Unknown phase:', gameState.phase);
    }
}

function updateFormOptions() {
    if (!gameState || !gameState.players) return;
    
    // Make locations selectable
    document.querySelectorAll('.location-card').forEach(card => {
        card.classList.remove('selectable', 'selected');
        const locationName = card.dataset.location;
        
        if (gameState.locations) {
            const locationData = gameState.locations.find(loc => loc.name === locationName);
            if (locationData && locationData.hasTraps) {
                card.classList.add('selectable');
            }
        }
    });
    
    // Update bodyguard selection cards
    updateBodyguardCards();
    
    // Update team member selection cards
    updateTeamMemberCards();
    
    // Update bodyguard selection
    const bodyguardSelect = document.getElementById('bodyguard-select');
    if (bodyguardSelect) {
        const currentValue = bodyguardSelect.value;
        bodyguardSelect.innerHTML = '<option value="">Select a bodyguard...</option>';
        
        gameState.players.forEach(player => {
            // Scout cannot select themselves as bodyguard
            // Previous bodyguard cannot be selected again (this should be validated server-side too)
            if (player.id !== playerId && player.id !== gameState.currentScout) {
                const option = document.createElement('option');
                option.value = player.id;
                option.textContent = `${player.name} (${player.character})`;
                bodyguardSelect.appendChild(option);
            }
        });
        
        // Restore previous selection if still valid
        if (currentValue && Array.from(bodyguardSelect.options).some(opt => opt.value === currentValue)) {
            bodyguardSelect.value = currentValue;
        }
    }
    
    // Update location selection
    const locationSelect = document.getElementById('location-select');
    if (locationSelect && gameState.locations) {
        const currentValue = locationSelect.value;
        locationSelect.innerHTML = '<option value="">Select a location...</option>';
        
        gameState.locations.forEach(location => {
            const option = document.createElement('option');
            option.value = location.name;
            option.textContent = location.name;
            
            // Mark safe location
            if (location.name === gameState.safeLocation) {
                option.textContent += ' (Safe)';
            }
            
            // Mark if location has been visited or disarmed
            if (!location.hasTraps) {
                option.textContent += ' (Disarmed)';
                option.disabled = true; // Can't visit disarmed locations
            }
            
            locationSelect.appendChild(option);
        });
        
        // Restore previous selection if still valid
        if (currentValue && Array.from(locationSelect.options).some(opt => opt.value === currentValue && !opt.disabled)) {
            locationSelect.value = currentValue;
        }
    }
    
    // Update team member selection (optional additional team members)
    const teamSelection = document.getElementById('team-selection');
    if (teamSelection) {
        teamSelection.innerHTML = '';
        
        gameState.players.forEach(player => {
            // Don't include scout (automatically included) or selected bodyguard
            if (player.id !== playerId && player.id !== gameState.currentScout) {
                const label = document.createElement('label');
                label.className = 'team-member';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = player.id;
                checkbox.name = 'team-member';
                
                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(` ${player.name} (${player.character})`));
                
                teamSelection.appendChild(label);
            }
        });
    }
    
    // Update weapon claim options for bodyguard
    const weaponClaimSelect = document.getElementById('weapon-claim-select');
    if (weaponClaimSelect) {
        weaponClaimSelect.innerHTML = '<option value="">None</option>';
        
        // Add all weapons as options for claiming
        const weapons = [
            'Poison', 'Knife', 'Rope', 'Wrench', 'Candlestick',
            'Revolver', 'Lead Pipe', 'Dumbbell', 'Trophy'
        ];
        
        weapons.forEach(weapon => {
            const option = document.createElement('option');
            option.value = weapon;
            option.textContent = weapon;
            weaponClaimSelect.appendChild(option);
        });
    }
    
    // Update location claim options for bodyguard
    const locationClaimSelect = document.getElementById('location-claim-select');
    if (locationClaimSelect && gameState.locations) {
        locationClaimSelect.innerHTML = '<option value="">None</option>';
        
        gameState.locations.forEach(location => {
            const option = document.createElement('option');
            option.value = location.name;
            option.textContent = location.name;
            locationClaimSelect.appendChild(option);
        });
    }
    
    // Update final accusation forms
    const accusationWho = document.getElementById('accusation-who');
    if (accusationWho) {
        accusationWho.innerHTML = '<option value="">Select character...</option>';
        gameState.players.forEach(player => {
            const option = document.createElement('option');
            option.value = player.character;
            option.textContent = `${player.character} (${player.name})`;
            accusationWho.appendChild(option);
        });
    }
    
    const accusationWhere = document.getElementById('accusation-where');
    if (accusationWhere && gameState.locations) {
        accusationWhere.innerHTML = '<option value="">Select location...</option>';
        gameState.locations.forEach(location => {
            const option = document.createElement('option');
            option.value = location.name;
            option.textContent = location.name;
            accusationWhere.appendChild(option);
        });
    }
    
    const accusationWhat = document.getElementById('accusation-what');
    if (accusationWhat) {
        accusationWhat.innerHTML = '<option value="">Select weapon...</option>';
        const weapons = [
            'Poison', 'Knife', 'Rope', 'Wrench', 'Candlestick',
            'Revolver', 'Lead Pipe', 'Dumbbell', 'Trophy'
        ];
        
        weapons.forEach(weapon => {
            const option = document.createElement('option');
            option.value = weapon;
            option.textContent = weapon;
            accusationWhat.appendChild(option);
        });
    }
    
    // Update the mission confirm button state
    updateMissionConfirmButton();
}

function updateVotingDisplay() {
    const missionInfo = document.getElementById('mission-info');
    if (!missionInfo || !gameState || !gameState.proposedMission) return;
    
    const mission = gameState.proposedMission;
    const scout = gameState.players.find(p => p.id === mission.scout);
    const bodyguard = gameState.players.find(p => p.id === mission.bodyguard);
    const teamMembers = mission.teamMembers.map(id => {
        const player = gameState.players.find(p => p.id === id);
        return player ? player.name : 'Unknown';
    });
    
    missionInfo.innerHTML = `
        <h4>🎯 Proposed Mission</h4>
        <p><strong>Scout:</strong> ${scout?.name || 'Unknown'}</p>
        <p><strong>Bodyguard:</strong> ${bodyguard?.name || 'Unknown'}</p>
        <p><strong>Location:</strong> ${mission.location}</p>
        <p><strong>Team Members:</strong> ${teamMembers.join(', ')}</p>
        <p><strong>Team Size:</strong> ${mission.teamMembers.length} players</p>
        <div style="margin-top: 16px; padding: 12px; background: rgba(255,107,107,0.1); border-radius: 8px;">
            <strong>⚠️ Vote carefully!</strong> Failed votes advance the storm tracker.
        </div>
    `;
    
    // Reset voting buttons
    const approveBtn = document.getElementById('vote-approve');
    const rejectBtn = document.getElementById('vote-reject');
    
    if (approveBtn) {
        approveBtn.disabled = false;
        approveBtn.style.opacity = '1';
        approveBtn.textContent = '👍 Approve';
    }
    
    if (rejectBtn) {
        rejectBtn.disabled = false;
        rejectBtn.style.opacity = '1';
        rejectBtn.textContent = '❌ Reject';
    }
}

function updatePrivateUI() {
    console.log('Updating private UI...');
    if (!privateState) return;
    
    // Update role display
    const roleDisplay = document.getElementById('role-display');
    if (roleDisplay) {
        roleDisplay.textContent = capitalizeFirst(privateState.secretRole);
    }
    
    // Update character display
    const myCharacter = document.getElementById('my-character');
    if (myCharacter && gameState) {
        const myPlayer = gameState.players.find(p => p.id === playerId);
        if (myPlayer) {
            myCharacter.textContent = myPlayer.character;
        }
    }
    
    // Show/hide plot info
    const plotInfo = document.getElementById('plot-info');
    if (plotInfo) {
        if (privateState.secretRole === 'ringleader' || privateState.secretRole === 'accomplice') {
            plotInfo.classList.remove('hidden');
            plotInfo.innerHTML = `
                <h4>🎯 Secret Plot</h4>
                <div class="plot-details">
                    <p><strong>Location:</strong> ${privateState.plotLocation || 'Unknown'}</p>
                    <p><strong>Weapon:</strong> ${privateState.plotWeapon || 'Unknown'}</p>
                </div>
            `;
        } else {
            plotInfo.classList.add('hidden');
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
    console.log('Showing screen:', screenId);
    
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Show target screen
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
    
    // Hide waiting indicator and activity display when not in game screen
    const waitingIndicator = document.getElementById('waiting-indicator');
    const activityDisplay = document.getElementById('current-activity');
    
    if (screenId !== 'game-screen') {
        if (waitingIndicator) {
            waitingIndicator.classList.add('hidden');
        }
        if (activityDisplay) {
            activityDisplay.classList.add('hidden');
        }
    } else {
        // Only show these in game screen when we have valid game state
        if (waitingIndicator && isInGame) {
            waitingIndicator.classList.remove('hidden');
        }
        if (activityDisplay && isInGame) {
            activityDisplay.classList.remove('hidden');
        }
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

// New notification system
function showNotification(notification) {
    const container = document.getElementById('notification-container') || createNotificationContainer();
    
    const notificationDiv = document.createElement('div');
    notificationDiv.className = `notification notification-${notification.type}`;
    notificationDiv.innerHTML = `
        <div class="notification-content">
            <div class="notification-message">${notification.message}</div>
            ${notification.details ? `<div class="notification-details">${notification.details}</div>` : ''}
        </div>
        <button class="notification-close" onclick="closeNotification('${notification.id}')">✕</button>
    `;
    
    container.appendChild(notificationDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        closeNotification(notification.id);
    }, 5000);
    
    // Add to notifications array
    notifications.push(notification);
}

function createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'notification-container';
    document.body.appendChild(container);
    return container;
}

function closeNotification(notificationId) {
    const notification = document.querySelector(`[data-notification-id="${notificationId}"]`);
    if (notification) {
        notification.remove();
    }
    notifications = notifications.filter(n => n.id !== notificationId);
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
        alert('Please select at least one team member for the final round.');
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

function finishConspiracyPhase() {
    console.log('🎯 Finishing conspiracy phase...');
    socket.emit('finish_conspiracy', { gameId });
}

// Handle instant disarm
function useInstantDisarm(cardId) {
    console.log('⚡ Using instant disarm card...');
    socket.emit('use_instant_disarm', { gameId, cardId });
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