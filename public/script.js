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

    socket.on('vote_result', (result) => {
        console.log('Vote result:', result);
        showVoteResult(result);
    });

    socket.on('plot_check_result', (result) => {
        console.log('Plot check result:', result);
        if (result.activated) {
            alert('🎯 The Plot has been activated! The Conspiracy wins!');
        }
    });

    socket.on('disarm_result', (result) => {
        console.log('Disarm result:', result);
        showDisarmResult(result);
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

    // Game actions
    const startGameBtn = document.getElementById('start-game-btn');
    if (startGameBtn) {
        startGameBtn.addEventListener('click', startGame);
    }

    // Add more event listeners as needed...
}

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

function updateUI() {
    console.log('Updating UI...');
    if (!gameState) return;
    
    // Update player count
    const playerCountElement = document.getElementById('player-count');
    if (playerCountElement) {
        playerCountElement.textContent = gameState.playerCount;
    }

    // Update players grid
    updatePlayersGrid();
    
    // Update game phase
    const gamePhaseElement = document.getElementById('game-phase');
    if (gamePhaseElement) {
        gamePhaseElement.textContent = getPhaseDisplayName(gameState.phase);
    }

    // Update start game button
    const startGameBtn = document.getElementById('start-game-btn');
    if (startGameBtn) {
        startGameBtn.disabled = gameState.playerCount < 4;
        startGameBtn.textContent = `Start Game (${gameState.playerCount}/10 players)`;
    }

    // Show appropriate screen
    if (gameState.phase === 'lobby') {
        showScreen('lobby-screen');
    } else {
        showScreen('game-screen');
    }
}

function updatePlayersGrid() {
    const playersGrid = document.getElementById('players-grid');
    if (!playersGrid || !gameState.players) return;
    
    playersGrid.innerHTML = '';
    
    gameState.players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = `player-card ${player.id === playerId ? 'me' : ''}`;
        playerDiv.innerHTML = `
            <div class="player-name">${player.name}</div>
            <div class="player-character">${player.character}</div>
        `;
        playersGrid.appendChild(playerDiv);
    });
}

function updatePrivateUI() {
    console.log('Updating private UI...');
    if (!privateState) return;
    
    // Update role display
    const roleDisplay = document.getElementById('role-display');
    if (roleDisplay) {
        roleDisplay.textContent = capitalizeFirst(privateState.secretRole);
    }
}

function showVoteResult(result) {
    let message = '';
    if (result.result === 'approved') {
        message = `✅ Mission approved! (${result.approveVotes} vs ${result.disapproveVotes})`;
    } else if (result.result === 'rejected') {
        message = `❌ Mission rejected! (${result.approveVotes} vs ${result.disapproveVotes})`;
    }
    alert(message);
}

function showDisarmResult(result) {
    let message = '';
    if (result.success) {
        message = `✅ Trap disarmed! (${result.totalValue}/${result.required} points)`;
    } else {
        message = `❌ Trap failed to disarm! (${result.totalValue}/${result.required} points)`;
    }
    alert(message);
}

function showGameEnd(result) {
    let message = '';
    switch (result.reason) {
        case 'friends_traps':
            message = '🎉 Friends win! All traps disarmed!';
            break;
        case 'friends_accusation':
            message = '🎉 Friends win! Correct accusation!';
            break;
        case 'conspiracy_plot':
            message = '🕵️ Conspiracy wins! Plot activated!';
            break;
        case 'conspiracy_accusation':
            message = '🕵️ Conspiracy wins! Friends failed accusation!';
            break;
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
        'plotting': 'Conspiracy Plotting',
        'team_selection': 'Team Selection',
        'voting': 'Voting',
        'plot_check': 'Plot Check',
        'disarming': 'Disarming Trap',
        'collecting': 'Collecting Clues',
        'supplying': 'Distributing Supplies',
        'final_accusation': 'Final Accusation',
        'ended': 'Game Over'
    };
    return phaseNames[phase] || phase;
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
} 