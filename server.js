const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const rooms = new Map();
const colors = ['#7c3aed', '#0891b2', '#db2777', '#ea580c', '#16a34a', '#2563eb', '#ca8a04', '#dc2626'];

function code(length) {
  let value = '';
  while (value.length < length) value += crypto.randomInt(0, 10);
  return value;
}
function uniqueCode(length, exists) {
  let result;
  do result = code(length); while (exists(result));
  return result;
}
function publicState(room) {
  return {
    roomCode: room.roomCode,
    teams: room.teams.map(({ id, name, members, color, connected, buzzed }) => ({ id, name, members, color, connected, buzzed })),
    started: room.started,
    remaining: room.remaining,
    buzzerOrder: room.buzzerOrder
  };
}
function broadcast(room, message) {
  const payload = JSON.stringify(message);
  room.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}
function broadcastState(room) { broadcast(room, { type: 'state', state: publicState(room) }); }
function resetRound(room) {
  room.started = false;
  room.remaining = 20;
  room.buzzerOrder = [];
  room.teams.forEach(team => { team.buzzed = false; });
  if (room.timer) clearInterval(room.timer);
  room.timer = null;
}
function startRound(room) {
  resetRound(room);
  room.started = true;
  room.timer = setInterval(() => {
    room.remaining -= 1;
    if (room.remaining <= 0) {
      room.remaining = 0;
      room.started = false;
      clearInterval(room.timer);
      room.timer = null;
    }
    broadcastState(room);
  }, 1000);
  broadcastState(room);
}

const server = http.createServer((req, res) => {
  const requested = req.url === '/' ? 'index.html' : req.url.split('?')[0].replace(/^\//, '');
  const file = path.join(publicDir, requested);
  if (!file.startsWith(publicDir)) return res.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end('Not found');
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/javascript';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});
const wss = new WebSocket.Server({ server });

wss.on('connection', socket => {
  socket.on('message', raw => {
    let message;
    try { message = JSON.parse(raw); } catch { return socket.send(JSON.stringify({ type: 'error', message: 'Invalid request.' })); }

    if (message.type === 'create') {
      const roomCode = uniqueCode(6, value => rooms.has(value));
      const teams = (message.teams || []).map((team, index) => ({
        id: crypto.randomUUID(), name: String(team.name || `Team ${index + 1}`).slice(0, 30),
        members: Math.max(1, Math.min(99, Number(team.members) || 1)), color: colors[index % colors.length],
        code: uniqueCode(5, candidate => [...rooms.values()].some(room => room.teams.some(item => item.code === candidate))),
        connected: false, buzzed: false
      }));
      const room = { roomCode, teams, clients: new Set([socket]), started: false, remaining: 20, buzzerOrder: [], host: socket, timer: null };
      rooms.set(roomCode, room);
      socket.room = room; socket.role = 'host';
      socket.send(JSON.stringify({ type: 'created', room: publicState(room), teamCodes: teams.map(({ id, code }) => ({ id, code })) }));
      broadcastState(room);
      return;
    }

    if (message.type === 'join') {
      const room = [...rooms.values()].find(item => item.teams.some(team => team.code === String(message.teamCode)));
      if (!room) return socket.send(JSON.stringify({ type: 'error', message: 'Team code not found. Ask the host for the 5-digit code.' }));
      const team = room.teams.find(item => item.code === String(message.teamCode));
      if (team.connected) return socket.send(JSON.stringify({ type: 'error', message: 'This team is already connected.' }));
      team.connected = true; socket.room = room; socket.team = team; socket.role = 'team'; room.clients.add(socket);
      socket.send(JSON.stringify({ type: 'joined', team: { id: team.id, name: team.name, color: team.color }, room: publicState(room) }));
      broadcastState(room); return;
    }

    const room = socket.room;
    if (!room) return socket.send(JSON.stringify({ type: 'error', message: 'Create or join a room first.' }));
    if (message.type === 'start' && socket.role === 'host') startRound(room);
    if (message.type === 'reset' && socket.role === 'host') { resetRound(room); broadcastState(room); }
    if (message.type === 'buzz' && socket.role === 'team' && room.started && !socket.team.buzzed && room.buzzerOrder.length === 0) {
      socket.team.buzzed = true;
      room.buzzerOrder.push({ teamId: socket.team.id, name: socket.team.name, color: socket.team.color, at: new Date().toISOString() });
      broadcast(room, { type: 'winner', winner: room.buzzerOrder[0] });
      broadcastState(room);
    }
  });
  socket.on('close', () => {
    const room = socket.room;
    if (!room) return;
    room.clients.delete(socket);
    if (socket.team) socket.team.connected = false;
    broadcastState(room);
    if (socket.role === 'host') { rooms.delete(room.roomCode); room.clients.forEach(client => client.send(JSON.stringify({ type: 'error', message: 'The host left this room.' }))); }
  });
});

server.listen(PORT, () => console.log(`Hazer Quiz Buzzer running at http://localhost:${PORT}`));
