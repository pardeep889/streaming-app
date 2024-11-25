const express = require('express');
const bodyParser = require('body-parser');
const webrtc = require("wrtc");
const { v4: uuidv4 } = require('uuid'); // Install with `npm install uuid`

const app = express();
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let activeSessions = {};

// Endpoint for the broadcaster to start streaming
app.post('/broadcast', async ({ body }, res) => {
    const sessionId = uuidv4(); // Generate unique session ID
    const peer = new webrtc.RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.stunprotocol.org" }]
    });

    peer.ontrack = (e) => {
        activeSessions[sessionId] = { peer, stream: e.streams[0] };
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

    const peer = new webrtc.RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.stunprotocol.org" }]
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

app.listen(5000, () => console.log('Server started on http://192.168.1.16:5000'));
