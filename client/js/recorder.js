let recorderStream = null;
let recorder = null;
let recorderChunks = [];
let micIsRecording = false;

async function recordAudio() {
  pttButton.classList.add('push-to-talk-active');
  try {

    // stop recording
    if (micIsRecording) {
      recorder.stop();
      pttButton.classList.remove('push-to-talk-active');
      return;
    }

    // Start recording
    clearAll();

    // audiostream settings
    // with browser asking for microphone-permission
    recorderStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false }, video: false
    });

    // === AudioContext für Lautstärke-Messung ===
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(recorderStream);
    source.connect(analyser);

    analyser.fftSize = 2048;
    dataArray = new Uint8Array(analyser.fftSize);

    function updateVolume() {
      analyser.getByteTimeDomainData(dataArray);

      // RMS berechnen
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        let val = (dataArray[i] - 128) / 128;
        sum += val * val;
      }
      let rms = Math.sqrt(sum / dataArray.length);
      let db = 20 * Math.log10(rms);

      const info = document.getElementById("ptt-info");
      if (rms < 0.01) {
        info.textContent = `Silent (${db.toFixed(1)} dB)`;
      } else {
        info.textContent = `Lautstärke: ${db.toFixed(1)} dB`;
      }

      volumeAnimId = requestAnimationFrame(updateVolume);
    }
    updateVolume();

    // mediarecorder init
    let supportedMime = findSupportedMime();
    recorder = new MediaRecorder(recorderStream, { mimeType: supportedMime });
    recorderChunks = [];

    // push recording chunks
    recorder.addEventListener("dataavailable", e => {
      if (e.data && e.data.size) {
        recorderChunks.push(e.data);
      }
    }
    )
    // recorder.ondataavailable = function (e) {
    // if (e.data && e.data.size) {
    // recorderChunks.push(e.data);
    // }
    // }

    // recorder stop listener
    recorder.onstop = function () {
      stopTimer()

      // generate blob/url
      const audioBlob = new Blob(recorderChunks, { type: recorder.mimeType || 'audio/webm' });
      const audioUrl = URL.createObjectURL(audioBlob);

      // create audio fille and put as input
      const audioFile = new File([audioBlob], "recording.webm", { type: recorder.mimeType });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(audioFile);
      fileInput.files = null;
      fileInput.files = dataTransfer.files;

      fileInputPlayer.src = audioUrl;
      //fileInputPlayer.load();

      // when file ready => start pipeline
      window.onAudioReady?.(audioBlob, audioUrl);
      startPipeline();

      clearStreamTracks();
      recorderStream = null;
      pttButton.textContent = 'Push-to-talk';
      micIsRecording = false;
      cancelAnimationFrame(volumeAnimId);
if (audioContext) audioContext.close();
document.getElementById("ptt-info").textContent = "(Mic Idle)";
    };

    // Start Recording
    recorder.start();
    pttButton.textContent = '00:00:00';
    micIsRecording = true;
    startTimer();
  } catch (err) {
    clearStreamTracks();
    recorderStream = null;
    micIsRecording = false;
    pttButton.textContent = "Push-to-Talk";
    if (audioContext) audioContext.close();
document.getElementById("ptt-info").textContent = "(Mic Idle)";
  }
}

// stop streams
function clearStreamTracks() {
  recorderStream.getTracks().forEach(t => {
    t.stop();
  })
}

function findSupportedMime() {
  const mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
  const hit = mimes.find(t => MediaRecorder.isTypeSupported?.(t) || "");
  return hit;
}

/*****************************
 *  Start ms-timer when activating Push-to-Talk
 *****************************/
async function startTimer() {
  pttStartTime = performance.now();
  function timeStep() {
    const elapsed = (performance.now() - pttStartTime) / 1000.0;
    if (micIsRecording) {
      pttButton.textContent = elapsed.toFixed(1) + " s";
      animationFrameId = requestAnimationFrame(timeStep);
    }

  }
  timeStep();
}
/*****************************
 *  Reset Timer and animationFrameId
 *****************************/
async function stopTimer() {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
}
