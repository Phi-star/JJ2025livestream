require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket connection handling
let broadcaster = null;
const clients = new Set();

wss.on('connection', (ws) => {
    console.log('New client connected');
    clients.add(ws);

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'broadcaster':
                broadcaster = ws;
                broadcastToClients({ type: 'streamStatus', isLive: true });
                console.log('Broadcaster connected');
                break;

            case 'viewer':
                if (broadcaster) {
                    ws.send(JSON.stringify({ type: 'streamStatus', isLive: true }));
                } else {
                    ws.send(JSON.stringify({ type: 'streamStatus', isLive: false }));
                }
                break;

            case 'candidate':
            case 'offer':
            case 'answer':
                // Relay WebRTC signaling messages
                const target = data.target === 'broadcaster' ? broadcaster : ws;
                if (target) {
                    target.send(JSON.stringify(data));
                }
                break;

            case 'disconnect':
                if (ws === broadcaster) {
                    broadcaster = null;
                    broadcastToClients({ type: 'streamStatus', isLive: false });
                    console.log('Broadcaster disconnected');
                }
                break;
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        if (ws === broadcaster) {
            broadcaster = null;
            broadcastToClients({ type: 'streamStatus', isLive: false });
            console.log('Broadcaster disconnected');
        }
    });
});

function broadcastToClients(message) {
    clients.forEach(client => {
        if (client !== broadcaster && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
