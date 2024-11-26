const express = require('express');
const bodyParser = require('body-parser');
const webrtc = require("wrtc");
const { v4: uuidv4 } = require('uuid'); // Install with `npm install uuid`
const http = require('http');
const { Server } = require('socket.io'); // Install with `npm install socket.io`

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let activeSessions = {};

// Endpoint for the broadcaster to start streaming
app.post('/broadcast', async ({ body }, res) => {
    const sessionId = uuidv4(); // Generate unique session ID
    const peer = new webrtc.RTCPeerConnection({
        iceServers: [{ urls: "stun:stunprotocol.org" }]
    });

    peer.ontrack = (e) => {
        activeSessions[sessionId] = { peer, stream: e.streams[0], viewers: 0 };
    };

    const desc = new webrtc.RTCSessionDescription(JSON.parse(body.sdp));
    await peer.setRemoteDescription(desc);

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    const candidates = [];
    peer.onicecandidate = (event) => {
        if (event.candidate) {
            candidates.push(event.candidate);
        }
    };

    await new Promise(resolve => peer.onicegatheringstatechange = () => {
        if (peer.iceGatheringState === "complete") resolve();
    });

    res.json({ sdp: peer.localDescription, candidates, sessionId });
});

// Endpoint for viewers to connect and receive the stream
app.post("/consumer", async ({ body }, res) => {
    const { sessionId, sdp } = body;
    const session = activeSessions[sessionId];
    if (!session) {
        return res.status(404).json({ error: "Session not found" });
    }

    session.viewers += 1;

    const peer = new webrtc.RTCPeerConnection({
        iceServers: [{ urls: "stun:stunprotocol.org" }]
    });

    session.stream.getTracks().forEach(track => peer.addTrack(track, session.stream));

    const desc = new webrtc.RTCSessionDescription(JSON.parse(sdp));
    await peer.setRemoteDescription(desc);

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    const candidates = [];
    peer.onicecandidate = (event) => {
        if (event.candidate) {
            candidates.push(event.candidate);
        }
    };

    await new Promise(resolve => peer.onicegatheringstatechange = () => {
        if (peer.iceGatheringState === "complete") resolve();
    });

    res.json({ sdp: peer.localDescription, candidates });
});

// Get viewer count for a session
app.get('/viewers/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = activeSessions[sessionId];
    if (!session) {
        return res.status(404).json({ error: "Session not found" });
    }

    res.json({ viewers: session.viewers });
});

// Handle chat via Socket.IO
io.on('connection', (socket) => {
    console.log('A user connected.');

    socket.on('join-session', (sessionId) => {
        socket.join(sessionId);
        console.log(`User joined session: ${sessionId}`);
    });

    socket.on('chat-message', ({ sessionId, message, username }) => {
        console.log(`Message in ${sessionId}: ${username}: ${message}`);
        io.to(sessionId).emit('chat-message', { username, message });
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected.');
    });
});

const PORT = process.env.PORT || 8080

server.listen(PORT, () => console.log(`Server started on PORT ${PORT}`));
