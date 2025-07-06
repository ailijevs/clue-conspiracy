// Game state
let socket;
let gameId;
let playerId;
let gameState = null;
let privateState = null;
let selectedCards = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeSocket();
    setupEventListeners();
    showScreen('login-screen');
});

function initializeSocket() {
    socket = io();
    
    socket.on('connect', () => {
        playerId = socket.id;
        console.log('Connected to server');
    });

    socket.on('game_state', (state) => {
        gameState = state;
        updateUI();
    });

    socket.on('private_state', (state) => {
        privateState = state;
        updatePrivateUI();
    });

    socket.on('trap_result', (result) => {
        showTrapResult(result);
    });

    socket.on('error', (message) => {
        alert('Error: ' + message);
    });
}

function setupEventListeners() {
    // Login
    document.getElementById('join-btn').addEventListener('click', joinGame);
    document.getElementById('player-name').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinGame();
    });

    // Game actions
    document.getElementById('start-game-btn').addEventListener('click', startGame);
    document.getElementById('confirm-selection-btn').addEventListener('click', confirmSelection);
    document.getElementById('vote-approve').addEventListener('click', () => vote(true));
    document.getElementById('vote-reject').addEventListener('click', () => vote(false));
    document.getElementById('submit-cards-btn').addEventListener('click', submitCards);
    document.getElementById('new-game-btn').addEventListener('click', () => location.reload());
}

function joinGame() {
    const playerName = document.getElementById('player-name').value.trim();
    const gameIdInput = document.getElementById('game-id').value.trim();
    
    if (!playerName) {
        alert('Please enter your name');
        return;
    }
    
    gameId = gameIdInput || generateGameId();
    
    socket.emit('join_game', { gameId, playerName });
    showScreen('game-screen');
}

function generateGameId() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function startGame() {
    socket.emit('start_game');
}

function confirmSelection() {
    const bodyguard = document.getElementById('bodyguard-select').value;
    const location = document.getElementById('location-select').value;
    const teamCheckboxes = document.querySelectorAll('#team-selection input[type="checkbox"]:checked');
    const team = Array.from(teamCheckboxes).map(cb => cb.value);
    
    if (!bodyguard || !location) {
        alert('Please select a bodyguard and location');
        return;
    }
    
    socket.emit('scout_selection', { bodyguard, team, location });
}

function vote(approve) {
    socket.emit('vote', { approve });
}

function submitCards() {
    const submittedCards = selectedCards.map(cardIndex => {
        return privateState.supplyCards[cardIndex];
    });
    
    socket.emit('disarm_trap', { submittedCards });
    selectedCards = [];
}

function updateUI() {
    if (!gameState) return;
    
    // Update header
    document.getElementById('game-phase').textContent = gameState.phase;
    document.getElementById('round-info').textContent = gameState.phase === 'playing' ? `Round ${gameState.round}` : '';
    
    // Update health and storm
    updateHealthDisplay(gameState.coralHealth);
    updateStormDisplay(gameState.stormTracker);
    
    // Update locations
    updateLocations();
    
    // Update players list
    updatePlayersList();
    
    // Update actions
    updateActions();
}

function updatePrivateUI() {
    if (!privateState) return;
    
    // Update role display
    const roleDisplay = document.getElementById('role-display');
    roleDisplay.textContent = capitalizeFirst(privateState.secretRole);
    roleDisplay.className = privateState.isConspiracy ? 'conspiracy' : '';
    
    // Update plot info for conspiracy members
    const plotInfo = document.getElementById('plot-info');
    if (privateState.secretRole === 'ringleader') {
        plotInfo.style.display = 'block';
        document.getElementById('plot-location').textContent = privateState.plotLocation;
        document.getElementById('plot-weapon').textContent = privateState.plotWeapon;
    } else {
        plotInfo.style.display = 'none';
    }
    
    // Update cards
    updateSupplyCards();
    updateClueCards();
}

function updateHealthDisplay(health) {
    const hearts = '♥'.repeat(health) + '♡'.repeat(3 - health);
    document.getElementById('health-display').textContent = hearts;
}

function updateStormDisplay(storm) {
    const activeStorms = '🌩️'.repeat(storm);
    const inactiveStorms = '☁️'.repeat(3 - storm);
    document.getElementById('storm-display').textContent = activeStorms + inactiveStorms;
}

function updateLocations() {
    const locations = document.querySelectorAll('.location');
    locations.forEach(locationEl => {
        const locationName = locationEl.dataset.location;
        const trap = gameState.traps[locationName];
        
        if (trap) {
            const trapValue = locationEl.querySelector('.trap-value');
            const trapSuit = locationEl.querySelector('.trap-suit');
            
            trapValue.textContent = trap.value;
            trapSuit.textContent = trap.suit === 'triangle' ? '▲' : '●';
            trapSuit.className = `trap-suit ${trap.suit}`;
            
            locationEl.classList.toggle('disarmed', trap.disarmed);
        }
        
        locationEl.classList.toggle('current', locationName === gameState.currentLocation);
    });
}

function updatePlayersList() {
    const playersList = document.getElementById('players-list');
    playersList.innerHTML = '';
    
    gameState.players.forEach(player => {
        const playerEl = document.createElement('div');
        playerEl.className = 'player-item';
        
        if (player.isScout) playerEl.classList.add('scout');
        if (player.isBodyguard) playerEl.classList.add('bodyguard');
        
        playerEl.innerHTML = `
            <div>
                <div class="player-name">${player.name}</div>
                <div class="player-character">${player.character}</div>
            </div>
            <div>
                ${player.isScout ? '🎯' : ''}
                ${player.isBodyguard ? '🛡️' : ''}
            </div>
        `;
        
        playersList.appendChild(playerEl);
    });
}

function updateActions() {
    // Hide all action panels
    document.querySelectorAll('.action-panel').forEach(panel => {
        panel.style.display = 'none';
    });
    
    // Show appropriate action panel
    switch (gameState.phase) {
        case 'lobby':
            document.getElementById('lobby-actions').style.display = 'block';
            document.getElementById('start-game-btn').disabled = !gameState.players || gameState.players.length < 4;
            break;
            
        case 'playing':
            if (gameState.currentScout === playerId) {
                showScoutActions();
            }
            break;
            
        case 'voting':
            showVotingActions();
            break;
            
        case 'disarming':
            if (gameState.currentTeam.includes(playerId) || gameState.currentScout === playerId) {
                showDisarmActions();
            }
            break;
            
        case 'ended':
            showGameOverActions();
            break;
    }
}

function showScoutActions() {
    const scoutActions = document.getElementById('scout-actions');
    scoutActions.style.display = 'block';
    
    // Populate bodyguard select
    const bodyguardSelect = document.getElementById('bodyguard-select');
    bodyguardSelect.innerHTML = '<option value="">Select Bodyguard...</option>';
    
    gameState.players.forEach(player => {
        if (player.id !== playerId) {
            const option = document.createElement('option');
            option.value = player.id;
            option.textContent = `${player.name} (${player.character})`;
            bodyguardSelect.appendChild(option);
        }
    });
    
    // Populate location select
    const locationSelect = document.getElementById('location-select');
    locationSelect.innerHTML = '<option value="">Select Location...</option>';
    
    gameState.locations.forEach(location => {
        if (!gameState.disarmedTraps.includes(location)) {
            const option = document.createElement('option');
            option.value = location;
            option.textContent = location;
            locationSelect.appendChild(option);
        }
    });
    
    // Populate team selection
    const teamSelection = document.getElementById('team-selection');
    teamSelection.innerHTML = '';
    
    gameState.players.forEach(player => {
        if (player.id !== playerId) {
            const label = document.createElement('label');
            label.className = 'team-member';
            label.innerHTML = `
                <input type="checkbox" value="${player.id}">
                ${player.name} (${player.character})
            `;
            teamSelection.appendChild(label);
        }
    });
}

function showVotingActions() {
    const votingActions = document.getElementById('voting-actions');
    votingActions.style.display = 'block';
    
    // Show mission details
    const scoutPlayer = gameState.players.find(p => p.id === gameState.currentScout);
    const bodyguardPlayer = gameState.players.find(p => p.id === gameState.currentBodyguard);
    const teamNames = gameState.currentTeam.map(id => {
        const player = gameState.players.find(p => p.id === id);
        return player ? player.name : 'Unknown';
    }).join(', ');
    
    document.getElementById('vote-scout').textContent = scoutPlayer ? scoutPlayer.name : 'Unknown';
    document.getElementById('vote-bodyguard').textContent = bodyguardPlayer ? bodyguardPlayer.name : 'Unknown';
    document.getElementById('vote-team').textContent = teamNames || 'None';
    document.getElementById('vote-location').textContent = gameState.currentLocation || 'Unknown';
    
    // Update vote status
    document.getElementById('vote-count').textContent = gameState.totalVotes;
    document.getElementById('vote-total').textContent = gameState.requiredVotes;
    
    // Disable buttons if already voted
    const hasVoted = gameState.votes.hasOwnProperty(playerId);
    document.getElementById('vote-approve').disabled = hasVoted;
    document.getElementById('vote-reject').disabled = hasVoted;
}

function showDisarmActions() {
    const disarmActions = document.getElementById('disarm-actions');
    disarmActions.style.display = 'block';
    
    // Show trap details
    document.getElementById('disarm-location').textContent = gameState.currentLocation;
    const trap = gameState.traps[gameState.currentLocation];
    if (trap) {
        document.getElementById('trap-strength').textContent = trap.value;
        document.getElementById('trap-type').textContent = trap.suit === 'triangle' ? 'Triangle (▲)' : 'Circle (●)';
    }
    
    // Show selectable cards
    updateSelectableCards();
}

function showGameOverActions() {
    const gameOverActions = document.getElementById('game-over-actions');
    gameOverActions.style.display = 'block';
    
    const resultDiv = document.getElementById('game-result');
    let resultText = '';
    
    switch (gameState.winner) {
        case 'conspiracy':
            resultText = '🎭 The Conspiracy Wins! The plot was successfully executed.';
            break;
        case 'friends':
            resultText = '👥 The Friends Win! All traps were successfully disarmed.';
            break;
        case 'investigation':
            resultText = '⚰️ Mr. Coral has died. Time for the final investigation...';
            break;
        default:
            resultText = '🤔 Game ended unexpectedly.';
    }
    
    resultDiv.innerHTML = resultText;
}

function updateSupplyCards() {
    const container = document.getElementById('supply-cards-display');
    container.innerHTML = '';
    
    if (privateState && privateState.supplyCards) {
        privateState.supplyCards.forEach((card, index) => {
            const cardEl = document.createElement('div');
            cardEl.className = `card supply ${card.suit || 'neutral'}`;
            cardEl.textContent = `${card.value}`;
            cardEl.dataset.index = index;
            container.appendChild(cardEl);
        });
    }
}

function updateClueCards() {
    const container = document.getElementById('clue-cards-display');
    container.innerHTML = '';
    
    if (privateState && privateState.clueCards) {
        privateState.clueCards.forEach(card => {
            const cardEl = document.createElement('div');
            cardEl.className = 'card clue';
            cardEl.textContent = card;
            container.appendChild(cardEl);
        });
    }
}

function updateSelectableCards() {
    const container = document.getElementById('selectable-cards');
    container.innerHTML = '';
    
    if (privateState && privateState.supplyCards) {
        privateState.supplyCards.forEach((card, index) => {
            const cardEl = document.createElement('div');
            cardEl.className = `card supply ${card.suit || 'neutral'}`;
            cardEl.textContent = `${card.value}`;
            cardEl.dataset.index = index;
            
            cardEl.addEventListener('click', () => {
                if (selectedCards.includes(index)) {
                    selectedCards = selectedCards.filter(i => i !== index);
                    cardEl.classList.remove('selected');
                } else {
                    selectedCards.push(index);
                    cardEl.classList.add('selected');
                }
            });
            
            container.appendChild(cardEl);
        });
    }
}

function showTrapResult(result) {
    const message = result.success ? 
        '✅ Trap successfully disarmed!' : 
        '❌ Trap activation! Mr. Coral takes damage.';
    
    alert(message);
    
    if (result.gameEnded) {
        setTimeout(() => {
            updateUI();
        }, 1000);
    }
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
} 