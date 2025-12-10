const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 4000 });
console.log('WS server running on ws://localhost:4000');

wss.on('connection', (ws) => {
  console.log('WS client connected');
  ws.send(JSON.stringify({ type: 'hello', ts: Date.now() }));
});

function broadcast(obj){
  const msg = JSON.stringify(obj);
  wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

module.exports = { broadcast };
