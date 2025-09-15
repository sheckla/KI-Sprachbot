// ===== Config =====

// ===== Basic Variables =====
const beezlebugApi = new BeezlebugAPI(API_URL);
const canvas = document.getElementById("visualizer");
const canvasCtx = canvas?.getContext("2d");
const fileInput = document.getElementById("file");
const fileInputPlayer = document.getElementById("inputPlayer");
const pttButton = document.getElementById('push-to-talk-begin')
const loadingText = document.getElementById("loading");
let selectedTypeTTS = "coqui";
let timer = 0;
let llmAnswer = "";
let animationFrameId = null;
let pttStartTime = 0;
    // Hilfsfunktion: Hann-Fenster
    function hannWindow(length) {
      const win = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
      }
      return win;
    }

    // Hilfsfunktion: FFT -> Magnitude Spectrum
    function fftMag(frame) {
      const N = frame.length;
      const re = new Float32Array(N);
      const im = new Float32Array(N);
      frame.forEach((val, i) => re[i] = val);

      // Cooley–Tukey FFT (nur für Test, kann durch Lib ersetzt werden)
      let step = 1;
      for (let size = 2; size <= N; size *= 2) {
        const half = size / 2;
        const tableStep = N / size;
        for (let i = 0; i < N; i += size) {
          for (let j = 0; j < half; j++) {
            const l = i + j;
            const r = i + j + half;
            const angle = (2 * Math.PI * j) / size;
            const cos = Math.cos(angle);
            const sin = -Math.sin(angle);
            const tre = re[r] * cos - im[r] * sin;
            const tim = re[r] * sin + im[r] * cos;
            re[r] = re[l] - tre;
            im[r] = im[l] - tim;
            re[l] += tre;
            im[l] += tim;
          }
        }
        step *= 2;
      }
      const mags = new Float32Array(N / 2);
      for (let i = 0; i < N / 2; i++) {
        mags[i] = Math.sqrt(re[i] ** 2 + im[i] ** 2);
      }
      return mags;
    }

    // Mel-Filterbank bauen
    function melFilterbank(nfft, sampleRate, numMels) {
      function hzToMel(hz) { return 2595 * Math.log10(1 + hz / 700); }
      function melToHz(mel) { return 700 * (Math.pow(10, mel / 2595) - 1); }

      const lowMel = hzToMel(0);
      const highMel = hzToMel(sampleRate / 2);
      const mels = new Float32Array(numMels + 2);
      for (let i = 0; i < numMels + 2; i++) {
        mels[i] = lowMel + (i * (highMel - lowMel)) / (numMels + 1);
      }
      const hz = Array.from(mels).map(melToHz);
      const bins = hz.map(f => Math.floor((nfft + 1) * f / sampleRate));

      const fb = [];
      for (let i = 0; i < numMels; i++) {
        const f = new Float32Array(nfft / 2);
        for (let j = bins[i]; j < bins[i + 1]; j++) {
          f[j] = (j - bins[i]) / (bins[i + 1] - bins[i]);
        }
        for (let j = bins[i + 1]; j < bins[i + 2]; j++) {
          f[j] = (bins[i + 2] - j) / (bins[i + 2] - bins[i + 1]);
        }
        fb.push(f);
      }
      return fb;
    }

    async function initWakeWord() {
      const session = await ort.InferenceSession.create("./models/hey_rhasspy_v0.1.onnx");
      const inputName = session.inputNames[0];
      const outputName = session.outputNames[0];
      document.getElementById("status").innerText = "Modell geladen ✅";

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(512, 1, 1);
      source.connect(processor);
      processor.connect(audioCtx.destination);

      const frameSize = 512;
      const window = hannWindow(frameSize);
      const fbanks = melFilterbank(frameSize, 16000, 96);
      let frameBuffer = [];

      processor.onaudioprocess = async (e) => {
        const input = e.inputBuffer.getChannelData(0);

        // Fensterung + FFT
        const framed = input.map((v, i) => v * window[i % frameSize]);
        const magSpec = fftMag(framed);

        // Mel-Spectrum (96 Bins)
        const melSpec = fbanks.map(f => f.reduce((acc, w, i) => acc + w * magSpec[i], 0));
        const logMel = melSpec.map(v => Math.log(v + 1e-6));

        frameBuffer.push(logMel);
        if (frameBuffer.length > 16) frameBuffer.shift();

        if (frameBuffer.length === 16) {
          const flat = frameBuffer.flat();
          const tensor = new ort.Tensor("float32", Float32Array.from(flat), [1, 16, 96]);
          const results = await session.run({ [inputName]: tensor });
          const score = results[outputName].data[0];
          console.log("Wakeword-Score:", score.toFixed(3));
          if (score > 0.7) {
            document.getElementById("status").innerText = "Wakeword erkannt!" + score.toFixed(3);
          } else {
            document.getElementById("status").innerText = "Warte auf Wakeword..." + score.toFixed(3);
          }
        }
      };
    }

    document.getElementById("start").onclick = initWakeWord;

/*****************************
 *  Speech-To-Text Step
 * - Handles file input and sends to STT API
 *****************************/
async function startSTT() {
  // check empty file
  const file = document.getElementById("file").files?.[0];
  if (!file) return alert("Bitte eine Audiodatei wählen.");
  const quality = document.getElementById("whisper-model").value

  let clientStartTime = Date.now();
  clearSTT();
  document.getElementById("stt-text").textContent = "(wird transkribiert...)";
  document.getElementById("stt-success").classList.add("processing");
  try {
    const response = await beezlebugApi.stt_POST(file, quality);
    let responseTime = getResponseTime(clientStartTime, response.ms);
    // update html
    document.getElementById("stt-success").classList.remove("processing");
    document.getElementById("stt-success").classList.add("success");
    document.getElementById("stt-text").textContent = response.transcription;
    document.getElementById("stt-ms-server").textContent = "Bearbeitungsdauer: " + responseTime.server + " ms";
    document.getElementById("stt-ms-network").textContent = "Netzwerklatenz: " + responseTime.network + " ms";
    document.getElementById("stt-ms-total").textContent = "Gesamt: " + responseTime.total + " ms";
    document.getElementById("llm-question").value = response.transcription;
    document.getElementById("stt-text").textContent += "\n";

    if (response.emotion) {
      response.emotion.forEach(element => {
        element.score = Number.parseFloat(element.score * 100).toPrecision(2) + "%";
      });
      document.getElementById("stt-text").textContent += JSON.stringify(response.emotion);
    }
    return responseTime;
  } catch (e) {
    console.error(e);
  }
}

async function startEmotionSTT() {
  // check empty file
  const file = document.getElementById("file").files?.[0];
  if (!file) return alert("Bitte eine Audiodatei wählen.");

  let clientStartTime = Date.now();
  clearSTT();
  document.getElementById("stt-text").textContent = "(Emotionen werden analysiert...)";
  document.getElementById("stt-success").classList.add("processing");
  try {
    const response = await beezlebugApi.stt_emotion_POST(file);
    let responseTime = getResponseTime(clientStartTime, response.ms);
    // update html
    document.getElementById("stt-text").textContent = "";
    document.getElementById("stt-success").classList.remove("processing");
    document.getElementById("stt-success").classList.add("success");
    document.getElementById("stt-ms-server").textContent = "Bearbeitungsdauer: " + responseTime.server + " ms";
    document.getElementById("stt-ms-network").textContent = "Netzwerklatenz: " + responseTime.network + " ms";
    document.getElementById("stt-ms-total").textContent = "Gesamt: " + responseTime.total + " ms";
    document.getElementById("stt-text").textContent += "\n";

    let str = "";
    if (response.emotion) {
      response.emotion.forEach(element => {
        element.score = Number.parseFloat(element.score * 100).toPrecision(2) + "%";
        switch (element.label) {
          case "neu":
            element.label = "Neutral";
            break;
          case "hap":
            element.label = "Glücklich";
            break;
          case "sad":
            element.label = "Traurig";
            break;
          case "ang":
            element.label = "Wütend";
            break;
        }
        str += element.label + ": " + element.score + "\n";
      });
      document.getElementById("stt-text").textContent += str;
    }
  } catch (e) {
    console.error(e);
  }
}

/*****************************
 *  Language Model Step
 * - Sends user question to LLM API
 *****************************/
async function startLLM() {
  // check empty input
  const question = document.getElementById("llm-question").value.trim();
  if (!question) return alert("Bitte eine Frage eingeben.");

  let clientStartTime = Date.now();
  clearLLM();
  document.getElementById("llm-text").textContent = "(Warte auf Antwort...)";
  document.getElementById("llm-success").classList.add("processing");
  try {
    const response = await beezlebugApi.llm_POST(question);
    let responseTime = getResponseTime(clientStartTime, response.ms);

    // update html
    llmAnswer = response.reply;
    document.getElementById("llm-processing").classList.remove("processing");
    document.getElementById("llm-success").classList.add("success");
    document.getElementById("llm-text").textContent = response.reply;
    document.getElementById("llm-ms-server").textContent = "Bearbeitungszeit: " + responseTime.server + " ms";
    document.getElementById("llm-ms-network").textContent = "Netzwerklatenz: " + responseTime.network + " ms";
    document.getElementById("llm-ms-total").textContent = "Gesamt: " + responseTime.total + " ms";
    document.getElementById("tts-text").value = response.reply;
    document.getElementById("llm-success").classList.add("success");
    document.getElementById("llm-success").classList.remove("processing");

    return responseTime;
  } catch (e) {
    console.error(e);
  }
}

/*****************************
 *  Text-To-Speech Step
 * - Sends text to TTS API and plays audio response
 *****************************/
async function startTTS() {
  // check empty
  const text = document.getElementById("tts-text").value.trim();
  if (!text) return alert("Bitte eine Antwort zum Vorlesen eingeben.");

  let selectedEmotion = document.getElementById("thorsten-emotion").value;
  let selectedSpeed = document.getElementById("tts-speed").value;

  clearTTS();
  document.getElementById("tts-success").classList.add("processing");
  const clientStartTime = Date.now();
  try {
    let response;
    if (selectedTypeTTS === "piper") {
      console.log("piper");
      response = await beezlebugApi.tts_POST_piper(text, selectedEmotion, selectedSpeed);
    } else {
      console.log("coqui");
      response = await beezlebugApi.tts_POST_coqui(text);
    }
    let responseTime = getResponseTime(clientStartTime, response.ms);
    // Oops! No response
    if (!response.audio_data_url) {
      return alert("Keine Audiodaten erhalten.");
    }

    const player = document.getElementById("ttsPlayer");
    player.src = response.audio_data_url; // apply audio data
    // TODO toggle autoplay
    player.play().catch(() => { });

    // update html
    document.getElementById("tts-success").classList.remove("processing");
    document.getElementById("tts-success").classList.add("success");
    document.getElementById("tts-ms-server").textContent = "Bearbeitungszeit: " + responseTime.server + " ms";
    document.getElementById("tts-ms-network").textContent = "Netzwerklatenz: " + responseTime.network + " ms";
    document.getElementById("tts-ms-total").textContent = "Gesamt: " + responseTime.total + " ms";


    return responseTime;
  } catch (e) {
    console.error(e);
  }
}

/*****************************
 *  Full Pipeline
 * - STT -> LLM -> TTS
 *****************************/
async function startPipeline() {
  // Prepare run
  clearAll();
  document.getElementById("tts-text").value = "";
  document.getElementById("llm-question").value = "";
  document.getElementById("final-success").classList.add("processing");
  document.getElementById("loading").textContent = "(wird bearbeitet...)";
  let times = [];

  // STT Step
  loadingText.textContent = "(wird transkribiert...";
  let ms = await startSTT();
  times.push(ms)
  let transcription = document.getElementById("stt-text").textContent.trim();
  document.getElementById("llm-question").value = transcription;

  // LLM Step
  loadingText.textContent = "(warte auf Antwort...)";
  ms = await startLLM();
  times.push(ms);
  let answer = document.getElementById("llm-text").textContent.trim();
  document.getElementById("tts-text").value = answer;

  // TTS Step
  loadingText.textContent = "(Audio wird generiert...)";
  ms = await startTTS();
  times.push(ms);

  // Prepare Logs
  let msTotal = 0;
  times.forEach(element => {
    msTotal += element.total
  });
  let msServerTotal = 0;
  times.forEach(element => {
    msServerTotal += element.server
  });
  let msNetworkTotal = 0;
  times.forEach(element => {
    msNetworkTotal += element.network
  });
  let finalMs = { server: msServerTotal, network: msNetworkTotal, total: msTotal };

  // Final UI Update
  document.getElementById("total-ms-server").textContent = "Bearbeitungszeit: " + finalMs.server + " ms";
  document.getElementById("total-ms-network").textContent = "Netzwerklatenz: " + finalMs.network + " ms";
  document.getElementById("total-ms-total").textContent = "Gesamt: " + finalMs.total + " ms";
  document.getElementById("final-success").classList.remove("processing");
  document.getElementById("final-success").classList.add("success");
  // document.getElementById("loading").textContent = "Anfrage erfolgreich durchgeführt!";
  document.getElementById("loading").textContent = llmAnswer;
}

/*****************************
 *  Button handlers
 *****************************/

// clear conversation button
function clearConversation() {
  beezlebugApi.conversation = "";
  document.getElementById("conversation").textContent = " none";
}

function clearSTT() {
  document.getElementById("stt-text").textContent = "(Sende eine Audio zum Transkribieren ein...)";
  document.getElementById("stt-text").value = "";
  document.getElementById("stt-ms-server").textContent = "";
  document.getElementById("stt-ms-network").textContent = "";
  document.getElementById("stt-ms-total").textContent = "";
  document.getElementById("stt-success").classList.remove("success");
  document.getElementById("stt-success").classList.remove("processing");
}

function clearLLM() {
  document.getElementById("llm-text").textContent = "(Frage den Chatbot für eine Antwort!)";
  document.getElementById("llm-ms-server").textContent = "";
  document.getElementById("llm-ms-network").textContent = "";
  document.getElementById("llm-ms-total").textContent = "";
  document.getElementById("llm-success").classList.remove("success");
  document.getElementById("llm-success").classList.remove("processing");
}

function clearTTS() {
  document.getElementById("tts-text").textContent = "";
  document.getElementById("tts-ms-server").textContent = "";
  document.getElementById("tts-ms-network").textContent = "";
  document.getElementById("tts-ms-total").textContent = "";
  document.getElementById("tts-success").classList.remove("processing");
  document.getElementById("tts-success").classList.remove("success");
}

// clear all button
function clearAll() {
  clearSTT();
  clearLLM();
  clearTTS();
  document.getElementById("total-ms-server").textContent = "";
  document.getElementById("total-ms-network").textContent = "";
  document.getElementById("total-ms-total").textContent = "";
  document.getElementById("final-success").classList.remove("processing");
  document.getElementById("final-success").classList.remove("success");
  document.getElementById("loading").textContent = "";
}

// Push-to-Talk Button
document.getElementById("push-to-talk-begin").addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "Spacebar") { // " " für moderne Browser, "Spacebar" für ältere
    event.preventDefault();
    recordAudio()
  }
});

/*************************************************************
 *  Utility Functions
 *************************************************************/

/*****************************
 *  Get Response Times
 * - (server, network, total)
 *****************************/
function getResponseTime(start, response) {
  const msServer = response;
  const msNetwork = Date.now() - start - msServer;
  const msTotal = msServer + msNetwork;
  const times = {
    server: Math.round(msServer),
    network: Math.round(msNetwork),
    total: Math.round(msTotal)
  };
  return times;
}

/*****************************
 *  FileInput Listener
 * - Preview audio file in player
 *****************************/
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  fileInputPlayer.src = url;
  fileInputPlayer.load();
});

document.getElementById("tts-type").addEventListener("change", () => {
  selectedTypeTTS = document.getElementById("tts-type").value;
  if (selectedTypeTTS === "coqui") {
    document.getElementById("piper-options").classList.add("hidden");
  } else {
    document.getElementById("piper-options").classList.remove("hidden");
  }
})

