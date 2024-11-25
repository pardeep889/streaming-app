const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const webrtc = require("wrtc");

let senderStream;

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Endpoint for viewers to connect and receive the stream
app.post("/consumer", async ({ body }, res) => {
    try {
        const peer = new webrtc.RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.stunprotocol.org" }]
        });
    
        // Add existing broadcast stream to this peer connection
        senderStream.getTracks().forEach(track => peer.addTrack(track, senderStream));
    
        // Set the remote SDP description sent by the viewer
        const desc = new webrtc.RTCSessionDescription(JSON.parse(body.sdp));
        await peer.setRemoteDescription(desc);
    
        // Create answer SDP and set it as local description
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
    
        // Collect ICE candidates and send the response once ICE gathering completes
        const candidates = [];
        peer.onicecandidate = (event) => {
            if (event.candidate) {
                candidates.push(event.candidate);
            }
        };
    
        // Wait until ICE gathering is complete
        await new Promise(resolve => peer.onicegatheringstatechange = () => {
            if (peer.iceGatheringState === "complete") resolve();
        });
    
        // Send SDP and ICE candidates together once ICE gathering is complete
        return res.json({ sdp: peer.localDescription, candidates });
    } catch (error) {
        console.log("error", error)
    }
   
});

// Endpoint for the broadcaster to start streaming
app.post('/broadcast', async ({ body }, res) => {
    const peer = new webrtc.RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.stunprotocol.org" }]
    });

    // Save the broadcaster's stream to broadcast to consumers
    peer.ontrack = (e) => {
        senderStream = e.streams[0];
    };

    // Set the remote SDP description sent by the broadcaster
    const desc = new webrtc.RTCSessionDescription(JSON.parse(body.sdp));
    await peer.setRemoteDescription(desc);

    // Create answer SDP and set it as local description
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    // Collect ICE candidates and send the response once ICE gathering completes
    const candidates = [];
    peer.onicecandidate = (event) => {
        if (event.candidate) {
            candidates.push(event.candidate);
        }
    };

    // Wait until ICE gathering is complete
    await new Promise(resolve => peer.onicegatheringstatechange = () => {
        if (peer.iceGatheringState === "complete") resolve();
    });

    // Send SDP and ICE candidates together once ICE gathering is complete
    res.json({ sdp: peer.localDescription, candidates });
});

// app.listen(5000, () => console.log('Server started on http://localhost:5000'));
app.listen(5000, () => console.log('Server started on http://192.168.1.16:5000'));
