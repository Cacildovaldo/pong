// server.js - Arquivo completo para hospedar no Render/Railway
const express = require('express');
const socketIo = require('socket.io');
const http = require('http');
const { ethers } = require('ethers');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Configuração do contrato
const CONTRACT_ADDRESS = "0x7228FC125EF5b4598315CEc74c37C16Fb2100447";
const CONTRACT_ABI = [
  {"inputs":[],"stateMutability":"nonpayable","type":"constructor"},
  {"inputs":[],"name":"USDC","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"depositBet","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"opponent","type":"address"}],"name":"challengePlayer","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"loser","type":"address"}],"name":"declareWinner","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"withdrawBet","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"getWaitingPlayers","outputs":[{"internalType":"address[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"player","type":"address"}],"name":"getGame","outputs":[{"components":[{"internalType":"address","name":"player1","type":"address"},{"internalType":"address","name":"player2","type":"address"},{"internalType":"uint256","name":"betAmount","type":"uint256"},{"internalType":"bool","name":"active","type":"bool"},{"internalType":"bool","name":"gameEnded","type":"bool"},{"internalType":"address","name":"winner","type":"address"}],"internalType":"struct PongBetGame.Game","name":"","type":"tuple"}],"stateMutability":"view","type":"function"}
];

// Estado dos jogos ativos
const activeGames = {};

// Configurar conexão com Polygon
const provider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');
const pongContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

// Configuração básica do Socket.io
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Registrar jogador
  socket.on('register', (playerAddress) => {
    socket.playerAddress = playerAddress;
    console.log(`Player registered: ${playerAddress}`);
  });

  // Jogador pronto para iniciar
  socket.on('player_ready', ({ gameId }) => {
    if (!activeGames[gameId]) {
      activeGames[gameId] = {
        players: [],
        state: {
          ball: { x: 200, y: 200, vx: 3, vy: 3, r: 10 },
          paddle1: { y: 180, width: 10, height: 60 },
          paddle2: { y: 180, width: 10, height: 60 },
          score1: 0,
          score2: 0
        }
      };
    }

    if (!activeGames[gameId].players.includes(socket.playerAddress)) {
      activeGames[gameId].players.push(socket.playerAddress);
      socket.join(gameId);
    }

    // Iniciar jogo quando ambos estiverem prontos
    if (activeGames[gameId].players.length === 2) {
      io.to(gameId).emit('game_start', { 
        player1: gameId.split('-')[0], 
        player2: gameId.split('-')[1],
        betAmount: activeGames[gameId].betAmount,
        gameId
      });
      
      startGameLoop(gameId);
    }
  });

  // Movimento da raquete
  socket.on('player_move', ({ gameId, yPosition }) => {
    if (activeGames[gameId]) {
      const playerIndex = activeGames[gameId].players.indexOf(socket.playerAddress);
      const paddleHeight = activeGames[gameId].state.paddle1.height;
      const y = Math.max(0, Math.min(400 - paddleHeight, yPosition - paddleHeight/2));

      if (playerIndex === 0) {
        activeGames[gameId].state.paddle1.y = y;
      } else if (playerIndex === 1) {
        activeGames[gameId].state.paddle2.y = y;
      }
    }
  });

  // Jogador saiu do jogo
  socket.on('leave_game', ({ gameId }) => {
    if (activeGames[gameId]) {
      const index = activeGames[gameId].players.indexOf(socket.playerAddress);
      if (index !== -1) {
        activeGames[gameId].players.splice(index, 1);
        if (activeGames[gameId].players.length === 0) {
          delete activeGames[gameId];
        }
      }
    }
  });

  // Desconexão
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Você pode adicionar lógica adicional de limpeza aqui se necessário
  });
});

// Lógica do jogo
function startGameLoop(gameId) {
  const gameInterval = setInterval(() => {
    if (!activeGames[gameId]) {
      clearInterval(gameInterval);
      return;
    }

    const game = activeGames[gameId];
    const state = game.state;

    // Atualizar posição da bola
    state.ball.x += state.ball.vx;
    state.ball.y += state.ball.vy;

    // Colisão com paredes
    if (state.ball.y - state.ball.r <= 0 || state.ball.y + state.ball.r >= 400) {
      state.ball.vy *= -1;
    }

    // Colisão com raquetes
    if (state.ball.x - state.ball.r <= 30 && 
        state.ball.y >= state.paddle1.y && 
        state.ball.y <= state.paddle1.y + state.paddle1.height) {
      state.ball.vx = Math.abs(state.ball.vx) * 1.05; // Aumentar velocidade
      state.ball.x = 30 + state.ball.r;
    }

    if (state.ball.x + state.ball.r >= 370 && 
        state.ball.y >= state.paddle2.y && 
        state.ball.y <= state.paddle2.y + state.paddle2.height) {
      state.ball.vx = -Math.abs(state.ball.vx) * 1.05;
      state.ball.x = 370 - state.ball.r;
    }

    // Pontuação
    if (state.ball.x - state.ball.r <= 0) {
      state.score2++;
      resetBall(state, 3);
    }

    if (state.ball.x + state.ball.r >= 400) {
      state.score1++;
      resetBall(state, -3);
    }

    // Verificar vencedor
    if (state.score1 >= 5 || state.score2 >= 5) {
      const winnerAddress = state.score1 >= 5 ? 
        activeGames[gameId].players[0] : activeGames[gameId].players[1];
      
      io.to(gameId).emit('game_over', winnerAddress);
      clearInterval(gameInterval);
      delete activeGames[gameId];
    }

    // Enviar estado atualizado
    io.to(gameId).emit('game_state', state);
  }, 16);
}

function resetBall(state, initialVx) {
  state.ball.x = 200;
  state.ball.y = 200;
  state.ball.vx = initialVx;
  state.ball.vy = (Math.random() > 0.5 ? 1 : -1) * 3;
}

// Rota básica de saúde
app.get('/', (req, res) => {
  res.send('Pong Game Server is running');
});

// Iniciar servidor
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
