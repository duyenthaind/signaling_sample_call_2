const peerConnectionConfig = {
    'iceServers': [{
        'url': 'stun:stun.services.mozilla.com'
    }]
};
const urlParams = new URLSearchParams(window.location.search);
var turnOnly = false;
if (urlParams && urlParams.get('turnOnly')) turnOnly = Boolean(urlParams.get('turnOnly'));
const socket = io('http://localhost:8088');
const accessTokenInput = document.querySelector('#accessToken-input');
const roomIdInput = document.querySelector("#roomId-input");
const userIdLabel = document.querySelector("#userId");
const callButton = document.querySelector('#call-button');
const loginButton = document.querySelector("#auth-button");
const localvideoElement = document.querySelector('#local-video');
const remoteVideoElement = document.querySelector('#remote-video');
const setLocalStream = setStreamFn(localvideoElement);
const setRemoteStream = setStreamFn(remoteVideoElement);
const getUserMediaPromise = navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true
});
const pc = new RTCPeerConnection(peerConnectionConfig);

// communicate new ice candidates to signaling server
pc.onicecandidate = evt => {
    if (evt.candidate) {
        let ices = {
            "roomId":roomIdInput.value,
            "sic":evt.candidate
        }
        let eventPacket = genPacket(11, ices);
        sendEventPacketToServer(eventPacket);
    }
};
pc.onaddstream = evt => setRemoteStream(evt.stream);

const sendEventPacketToServer = eventPacket => socket.emit('EventPacket', JSON.stringify(eventPacket));

// create initial offer 
const createOffer = async () => {
    const offer = await pc.createOffer();
    let sdp = {
        "roomId":roomIdInput.value,
        "sic" : offer
    }
    let eventPacket = genPacket(10, sdp);
    sendEventPacketToServer(eventPacket);

    await pc.setLocalDescription(offer);
};

// create answer to offer and set local description
const createAnswer = async offer => {
    const answer = await pc.createAnswer(offer);
    let sdp = {
        "roomId":roomIdInput.value,
        "sic":answer
    }
    let eventPacket = genPacket(13, sdp);
    sendEventPacketToServer(eventPacket);
    await pc.setLocalDescription(answer);
};

const onAuth = async () => {
    let accessToken = accessTokenInput.value;
    let authBody = {
        "accessToken" : accessToken,
        "isForCall" : true
    }
    let eventPacket = genPacket(1, authBody);

    console.log(accessToken);
    sendEventPacketToServer(eventPacket);
}

// sets up local stream and sends offer to signaling server
const onCall = async () => {
    callButton.disabled = true;
    const stream = await getUserMediaPromise;
    setLocalStream(stream);
    await pc.addStream(stream);
    // await createOffer();
    roomIdInput.disabled = true;
    let roomId = roomIdInput.value;
    let eventPacket = genPacket(3, {"roomId": roomId});
    sendEventPacketToServer(eventPacket);
};

// sets remote description passed from calling client of RTCPeerConnection
const onOffer = async offer => {
    const response = confirm('Incoming call: Press \'OK\' to answer');
    if (response) {
        callButton.disabled = true;
        await pc.setRemoteDescription(offer);
        const localStream = await getUserMediaPromise;
        setLocalStream(localStream);
        await pc.addStream(localStream);
        await createAnswer(offer);
    }
};

// sets remote description passed from calling client of RTCPeerConnection
const onAnswer = answer => pc.setRemoteDescription(answer);

// adds candidate to RTCPeerConnection
const onCandidate = async candidate => {
    if (candidate && candidate.candidate) {
        const typ = candidate.candidate.split(' ')[7]; // type value
        if (turnOnly && typ === 'relay')
            await pc.addIceCandidate(candidate);
        else if (!turnOnly)
            await pc.addIceCandidate(candidate);
    }
};

const onAuthenticated = async(data) => {
    callButton.disabled = false;
    loginButton.disabled = true;
    let userId = data.user_id;
    let text = userId.fontcolor("green");
    console.log("Login with userId " + userId);
    userIdLabel.innerHTML = text;
}

const onJoinRoom = async(data) => {
    let r = data.r;
    if(r != 0){
        alert("join room error " + data.msg);
        console.log("Join room error " + data.msg)
        return;
    }
    await createOffer();
}

const onOfferEvent = async(data) => {
    let r = data.r;
    let sdp = data.sic;
    if(r == null && sdp != null){
        await onOffer(sdp);
    }
}

const onAnswerEvent = async(data) => {
    let r = data.r;
    let sdp = data.sic;
    if(r == null && sdp != null){
        await onAnswer(sdp);
    }
}

const onIceCandidateEvent = async(data) => {
    let r = data.r;
    let ices = data.sic;
    if(r == null && ices != null){
        await onCandidate(ices);
    }
}

const onPingEvent = async(data) => {
    if(data.r == null){
        let eventPacket = genPacket(99, {"body" : null});
        sendEventPacketToServer(eventPacket);
    }
}

const onEventPacketFromServer = async(data) => {
    let packet = JSON.parse(data)
    let service = packet.service;
    let body = packet.body;
    let jsonBody = JSON.parse(body);
    console.log(jsonBody);
    switch (service){
        case 1:
            await onAuthenticated(jsonBody);
            break;
        case 3:
            await onJoinRoom(jsonBody);
            break;
        case 10:
            await onOfferEvent(jsonBody);
            break;
        case 11:
            await onIceCandidateEvent(jsonBody);
            break;
        case 13:
            await onAnswerEvent(jsonBody);
            break;
        case 99:
            await onPingEvent(jsonBody);
            break;
        default:
            return;
    }
}

function genPacket(service, body){
    return {
        "service":service,
        "body": JSON.stringify(body)
    }
}

socket.on('EventPacket', onEventPacketFromServer);
socket.on('connect', data => {
    console.log("Connected, send a ping first");

    let eventPacket = {
        "service": 99,
        "body": null
    }

    socket.emit('EventPacket', JSON.stringify(eventPacket))
})

socket.on('disconnect', data => {
    let userId = userIdLabel.textContent;
    let text = userId.fontcolor("red");
    console.log("Disconnected userId " + userId);
    userIdLabel.innerHTML = text;  
})