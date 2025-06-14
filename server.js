const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

// Rota básica para teste
app.get('/', (req, res) => {
  res.send('Servidor do Pong Game está funcionando!');
});

// Lógica do Socket.io
io.on('connection', (socket) => {
  console.log('Jogador conectado:', socket.id);

  socket.on('disconnect', () => {
    console.log('Jogador desconectado:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});