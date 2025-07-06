// Game state
let socket;
let gameId;
let playerId;
let playerName;
let gameState = null;
let privateState = null;
let selectedCards = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing...');
    initializeSocket();
    setupEventListeners();
    showScreen('login-screen');
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
        document.getElementById('game-id-display').textContent = gameId;
        showScreen('lobby-screen');
    });

    socket.on('join_failed', (data) => {
        console.error('Join failed:', data);
        alert('Failed to join game: ' + data.reason);
    });

    socket.on('game_state', (state) => {
        console.log('Game state received:', state);
        gameState = state;
        updateUI();
    });

    socket.on('private_state', (state) => {
        console.log('Private state received:', state);
        privateState = state;
        updatePrivateUI();
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
    document.addEventListener('change', (e) => {
        if (e.target.id === 'bodyguard-select' || e.target.id === 'location-select') {
            updateMissionConfirmButton();
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
function beginConspiracyPhase() {
    console.log('Beginning conspiracy phase...');
    socket.emit('begin_conspiracy_phase', { gameId });
}

function revealPlot() {
    console.log('Revealing plot...');
    socket.emit('reveal_plot', { gameId });
}

function finishPlotting() {
    console.log('Finishing plotting phase...');
    socket.emit('finish_plotting', { gameId });
}

function confirmMission() {
    const bodyguardSelect = document.getElementById('bodyguard-select');
    const locationSelect = document.getElementById('location-select');
    
    if (!bodyguardSelect.value || !locationSelect.value) {
        alert('Please select a bodyguard and location');
        return;
    }
    
    // Get selected team members
    const teamCheckboxes = document.querySelectorAll('#team-selection input[type="checkbox"]:checked');
    const teamMemberIds = Array.from(teamCheckboxes).map(cb => cb.value);
    
    console.log('Confirming mission...');
    socket.emit('propose_team', {
        gameId,
        bodyguardId: bodyguardSelect.value,
        teamMemberIds,
        locationName: locationSelect.value
    });
}

function castVote(vote) {
    console.log('Casting vote:', vote);
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
    if (!gameState) return;
    
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
    const locationsGrid = document.getElementById('locations-grid');
    if (!locationsGrid || !gameState.locations) return;
    
    locationsGrid.innerHTML = '';
    
    gameState.locations.forEach(location => {
        const locationDiv = document.createElement('div');
        locationDiv.className = `location-card ${location.visited ? 'visited' : ''}`;
        
        let statusText = '';
        if (location.name === gameState.safeLocation) statusText += '✅ Safe ';
        if (location.playersPresent.length > 0) statusText += '👥 ';
        
        locationDiv.innerHTML = `
            <div class="location-name">${location.name}</div>
            <div class="location-status">${statusText}</div>
            <div class="location-info">
                ${location.hasTraps ? `🎯 Trap (${location.trapValue})` : '✅ Clear'}
                ${location.playersPresent.length > 0 ? `<br>Players: ${location.playersPresent.length}` : ''}
            </div>
        `;
        locationsGrid.appendChild(locationDiv);
    });
}

function updateHealthTrackers() {
    // Update Mr. Coral's health
    const coralHealthElement = document.getElementById('coral-health');
    if (coralHealthElement) {
        const hearts = '♥'.repeat(gameState.coralHealth) + '♡'.repeat(3 - gameState.coralHealth);
        coralHealthElement.textContent = hearts;
    }
    
    // Update storm tracker
    const stormTrackerElement = document.getElementById('storm-tracker');
    if (stormTrackerElement) {
        const clouds = '☁'.repeat(gameState.stormTracker) + '☀'.repeat(3 - gameState.stormTracker);
        stormTrackerElement.textContent = clouds;
    }
}

function updateScreenAndPanels() {
    // Show appropriate screen
    if (gameState.phase === 'lobby') {
        showScreen('lobby-screen');
    } else {
        showScreen('game-screen');
    }
    
    // Hide all action panels
    document.querySelectorAll('.action-panel').forEach(panel => {
        panel.style.display = 'none';
    });
    
    // Show appropriate action panel
    switch (gameState.phase) {
        case 'setup':
            document.getElementById('setup-actions').style.display = 'block';
            break;
        case 'conspiracy_plotting':
            document.getElementById('plotting-actions').style.display = 'block';
            break;
        case 'round_choose_team':
            if (gameState.currentScout === playerId) {
                document.getElementById('scout-actions').style.display = 'block';
            }
            break;
        case 'round_voting':
            if (!gameState.votes || !gameState.votes.find(v => v[0] === playerId)) {
                document.getElementById('voting-actions').style.display = 'block';
                updateVotingDisplay();
            }
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
        case 'final_accusation':
            document.getElementById('final-accusation-actions').style.display = 'block';
            break;
        case 'game_over':
            document.getElementById('game-over-actions').style.display = 'block';
            break;
    }
}

function updateFormOptions() {
    // Update bodyguard selection
    const bodyguardSelect = document.getElementById('bodyguard-select');
    if (bodyguardSelect && gameState.players) {
        bodyguardSelect.innerHTML = '<option value="">Select a bodyguard...</option>';
        gameState.players.forEach(player => {
            if (player.id !== playerId && player.id !== gameState.currentScout) {
                const option = document.createElement('option');
                option.value = player.id;
                option.textContent = player.name;
                bodyguardSelect.appendChild(option);
            }
        });
    }
    
    // Update location selection
    const locationSelect = document.getElementById('location-select');
    if (locationSelect && gameState.locations) {
        locationSelect.innerHTML = '<option value="">Select a location...</option>';
        gameState.locations.forEach(location => {
            const option = document.createElement('option');
            option.value = location.name;
            option.textContent = location.name;
            if (location.name === gameState.safeLocation) {
                option.textContent += ' (Safe)';
            }
            locationSelect.appendChild(option);
        });
    }
    
    // Update team selection
    const teamSelection = document.getElementById('team-selection');
    if (teamSelection && gameState.players) {
        teamSelection.innerHTML = '';
        gameState.players.forEach(player => {
            if (player.id !== playerId) {
                const label = document.createElement('label');
                label.className = 'team-checkbox';
                label.innerHTML = `
                    <input type="checkbox" value="${player.id}">
                    ${player.name}
                `;
                teamSelection.appendChild(label);
            }
        });
    }
}

function updateVotingDisplay() {
    const missionInfo = document.getElementById('mission-info');
    if (missionInfo && gameState.proposedMission) {
        const mission = gameState.proposedMission;
        const scout = gameState.players.find(p => p.id === mission.scout);
        const bodyguard = gameState.players.find(p => p.id === mission.bodyguard);
        const teamMembers = mission.teamMembers.map(id => 
            gameState.players.find(p => p.id === id)?.name || 'Unknown'
        );
        
        missionInfo.innerHTML = `
            <h4>Proposed Mission:</h4>
            <p><strong>Scout:</strong> ${scout?.name}</p>
            <p><strong>Bodyguard:</strong> ${bodyguard?.name}</p>
            <p><strong>Location:</strong> ${mission.location}</p>
            <p><strong>Team:</strong> ${teamMembers.join(', ')}</p>
        `;
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
    const supplyCount = document.getElementById('supply-count');
    
    if (!supplyCardsContainer || !privateState?.supplyCards) return;
    
    supplyCount.textContent = privateState.supplyCards.length;
    supplyCardsContainer.innerHTML = '';
    
    privateState.supplyCards.forEach(card => {
        const cardDiv = document.createElement('div');
        cardDiv.className = `supply-card ${selectedCards.includes(card) ? 'selected' : ''}`;
        cardDiv.dataset.cardId = card.id;
        
        cardDiv.innerHTML = `
            <div class="card-value">${card.value}</div>
            ${card.suit ? `<div class="card-suit">${card.suit}</div>` : ''}
        `;
        
        supplyCardsContainer.appendChild(cardDiv);
    });
}

function updateClueCardsDisplay() {
    const clueCardsContainer = document.getElementById('clue-cards');
    const clueCount = document.getElementById('clue-count');
    
    if (!clueCardsContainer || !privateState?.clueCards) return;
    
    clueCount.textContent = privateState.clueCards.length;
    clueCardsContainer.innerHTML = '';
    
    privateState.clueCards.forEach(card => {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'clue-card';
        
        let cardContent = '';
        switch (card.cardType) {
            case 'weapon':
                cardContent = `🔫 ${card.content}`;
                break;
            case 'location':
                cardContent = `📍 ${card.content}`;
                break;
            case 'instant_disarm':
                cardContent = '⚡ Instant Disarm';
                break;
            case 'no_clue':
                cardContent = '❌ No Clue Found';
                break;
            default:
                cardContent = 'Unknown Clue';
        }
        
        cardDiv.innerHTML = `<div class="card-content">${cardContent}</div>`;
        clueCardsContainer.appendChild(cardDiv);
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
    const bodyguardSelect = document.getElementById('bodyguard-select');
    const locationSelect = document.getElementById('location-select');
    const confirmButton = document.getElementById('confirm-mission-btn');
    
    if (confirmButton) {
        confirmButton.disabled = !bodyguardSelect.value || !locationSelect.value;
    }
}

function showDisarmResult(result) {
    let message = '';
    if (result.success) {
        message = `✅ Trap disarmed successfully!\n\nSubmitted: ${result.totalValue} points\nRequired: ${result.required} points`;
    } else {
        message = `❌ Trap disarming failed!\n\nSubmitted: ${result.totalValue} points\nRequired: ${result.required} points\n\nMr. Coral takes damage!`;
    }
    alert(message);
}

function showFinalAccusationResult(result) {
    let message = '';
    if (result.correct) {
        message = `🎉 Correct accusation! Friends win!\n\nThe plot was:\n${result.actualWho} in the ${result.actualWhere} with the ${result.actualWhat}`;
    } else {
        message = `❌ Incorrect accusation! Conspiracy wins!\n\nThe actual plot was:\n${result.actualWho} in the ${result.actualWhere} with the ${result.actualWhat}`;
    }
    alert(message);
}

function showGameEnd(result) {
    let message = '';
    switch (result.reason) {
        case 'friends_traps':
            message = '🎉 Friends win! All traps have been disarmed and Mr. Coral is safe!';
            break;
        case 'friends_accusation':
            message = '🎉 Friends win! The conspiracy has been exposed with a correct accusation!';
            break;
        case 'conspiracy_plot':
            message = '🕵️ Conspiracy wins! The plot has been successfully executed!';
            break;
        case 'conspiracy_accusation':
            message = '🕵️ Conspiracy wins! The friends failed to expose the plot!';
            break;
        default:
            message = `Game ended: ${result.reason}`;
    }
    alert(message);
}

function showScreen(screenId) {
    console.log('Showing screen:', screenId);
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
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