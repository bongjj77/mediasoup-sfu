const socket = io('https://signaling-dev.aswing.net');
const roomId = 'test-room';
let device;
let localStream;
let producerTransport;
let consumerTransport;

// Get available media devices
async function getMediaDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioSelect = document.getElementById('audioSource');
  const videoSelect = document.getElementById('videoSource');

  devices.forEach((device) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.text = device.label || `${device.kind} ${audioSelect.length + 1}`;
    if (device.kind === 'audioinput') {
      audioSelect.appendChild(option);
    } else if (device.kind === 'videoinput') {
      videoSelect.appendChild(option);
    }
  });
}

// Join room button click handler
document.getElementById('joinRoom').addEventListener('click', async () => {
  const audioOnly = document.getElementById('audioOnly').checked;

  socket.emit('joinRoom', { roomId });

  device = new mediasoupClient.Device();
  const rtpCapabilities = await emitWithTimeout('getRtpCapabilities', {});

  await device.load({ routerRtpCapabilities: rtpCapabilities });

  const audioSource = document.getElementById('audioSource').value;

  // Media constraints based on audioOnly selection
  const constraints = {
    audio: {
      deviceId: audioSource ? { exact: audioSource } : undefined,
    },
  };

  if (!audioOnly) {
    const videoSource = document.getElementById('videoSource').value;
    constraints.video = {
      deviceId: videoSource ? { exact: videoSource } : undefined,
    };
  }

  // Capture media streams
  localStream = await navigator.mediaDevices.getUserMedia(constraints);

  if (!audioOnly) {
    document.getElementById('localVideo').srcObject = localStream;
    document.getElementById('localVideo').style.display = 'block';
  } else {
    document.getElementById('localVideo').style.display = 'none';
  }

  producerTransport = await createSendTransport();

  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    await producerTransport.produce({ track: audioTrack });
  }

  if (!audioOnly) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      await producerTransport.produce({ track: videoTrack });
    }
  }
});

document.getElementById('leaveRoom').addEventListener('click', () => {
  socket.emit('clientExited', { roomId });
  console.log(`Client exited room: ${roomId}`);
});

// Handle joinedRoom event
socket.on('joinedRoom', async ({ roomId, producers }) => {
  console.log(`Joined room: ${roomId}, existing producers:`, producers);

  for (const producer of producers) {
    const { producerId, kind, clientId } = producer;

    if (!consumerTransport) {
      consumerTransport = await createRecvTransport();
    }

    const { consumerId, rtpParameters } = await emitWithTimeout('consume', {
      roomId,
      transportId: consumerTransport.id,
      producerId,
      rtpCapabilities: device.rtpCapabilities,
    });

    const consumer = await consumerTransport.consume({
      id: consumerId,
      producerId,
      kind,
      rtpParameters,
    });

    const remoteStream = new MediaStream();
    remoteStream.addTrack(consumer.track);

    // Use clientId for element ID
    if (kind === 'video') {
      let videoElement = document.getElementById(`remoteVideo-${clientId}`);
      if (!videoElement) {
        videoElement = document.createElement('video');
        videoElement.id = `remoteVideo-${clientId}`;
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        document.getElementById('remoteStreams').appendChild(videoElement);
      }
      videoElement.srcObject = remoteStream;
    } else if (kind === 'audio') {
      let audioElement = document.getElementById(`remoteAudio-${clientId}`);
      if (!audioElement) {
        audioElement = document.createElement('audio');
        audioElement.id = `remoteAudio-${clientId}`;
        audioElement.autoplay = true;
        document.getElementById('remoteStreams').appendChild(audioElement);
      }
      audioElement.srcObject = remoteStream;
    }

    await consumer.resume();
    console.log('Consumer resumed:', consumer.id);
  }
});

// Listen for newProducer event
socket.on('newProducer', async ({ producerId, clientId }) => {
  console.log(`New producer detected: ${producerId} from client: ${clientId}`);

  if (!consumerTransport) {
    consumerTransport = await createRecvTransport();
  }

  const { consumerId, kind, rtpParameters } = await emitWithTimeout('consume', {
    roomId,
    transportId: consumerTransport.id,
    producerId,
    rtpCapabilities: device.rtpCapabilities,
  });

  const consumer = await consumerTransport.consume({
    id: consumerId,
    producerId,
    kind,
    rtpParameters,
  });

  const remoteStream = new MediaStream();
  remoteStream.addTrack(consumer.track);

  // Use clientId for element ID
  if (kind === 'video') {
    let videoElement = document.getElementById(`remoteVideo-${clientId}`);
    if (!videoElement) {
      videoElement = document.createElement('video');
      videoElement.id = `remoteVideo-${clientId}`;
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      document.getElementById('remoteStreams').appendChild(videoElement);
    }
    videoElement.srcObject = remoteStream;
  } else if (kind === 'audio') {
    let audioElement = document.getElementById(`remoteAudio-${clientId}`);
    if (!audioElement) {
      audioElement = document.createElement('audio');
      audioElement.id = `remoteAudio-${clientId}`;
      audioElement.autoplay = true;
      document.getElementById('remoteStreams').appendChild(audioElement);
    }
    audioElement.srcObject = remoteStream;
  }

  await consumer.resume();
  console.log('Consumer resumed:', consumer.id);
});

// Listen for clientDisconnected event
socket.on('clientDisconnected', ({ clientId }) => {
  console.log(`Client disconnected: ${clientId}`);

  // Remove video element
  const videoElement = document.getElementById(`remoteVideo-${clientId}`);
  if (videoElement) {
    videoElement.remove();
    console.log(`Removed video element for client: ${clientId}`);
  }

  // Remove audio element
  const audioElement = document.getElementById(`remoteAudio-${clientId}`);
  if (audioElement) {
    audioElement.remove();
    console.log(`Removed audio element for client: ${clientId}`);
  }
});

// Create send transport
async function createSendTransport() {
  const transportOptions = await emitWithTimeout('createTransport', {
    roomId,
    direction: 'send',
  });
  const transport = device.createSendTransport(transportOptions);

  transport.on('connect', ({ dtlsParameters }, callback, errback) => {
    emitWithTimeout('connectTransport', {
      roomId,
      transportId: transport.id,
      dtlsParameters,
    })
      .then(() => callback())
      .catch(errback);
  });

  transport.on('produce', (parameters, callback, errback) => {
    emitWithTimeout('produce', {
      roomId,
      transportId: transport.id,
      kind: parameters.kind,
      rtpParameters: parameters.rtpParameters,
    })
      .then(({ producerId }) => callback({ id: producerId }))
      .catch(errback);
  });

  return transport;
}

// Create receive transport
async function createRecvTransport() {
  const transportOptions = await emitWithTimeout('createTransport', {
    roomId,
    direction: 'recv',
  });
  const transport = device.createRecvTransport(transportOptions);

  transport.on('connect', ({ dtlsParameters }, callback, errback) => {
    emitWithTimeout('connectTransport', {
      roomId,
      transportId: transport.id,
      dtlsParameters,
    })
      .then(() => callback())
      .catch(errback);
  });

  return transport;
}

// Emit with timeout
function emitWithTimeout(event, data, timeout = 5000) {
  return new Promise((resolve, reject) => {
    socket.emit(event, data);

    const timer = setTimeout(() => {
      reject(new Error(`Timeout on ${event} event`));
    }, timeout);

    socket.once(event + 'Success', (response) => {
      clearTimeout(timer);
      resolve(response);
    });

    socket.once(event + 'Error', (error) => {
      clearTimeout(timer);
      reject(new Error(error.message || `Error on ${event} event`));
    });
  });
}

// Load media devices on page load
getMediaDevices();
