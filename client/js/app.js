/*****************************
 * AI Voice Assistant
 * - program entry point
 * - manages most functions
 *  17.09.2025 Daniel Graf
 *****************************/
// ===== Basic Variables =====
const beezlebugApi = new BeezlebugAPI(API_URL);
const wakewordController = new WakeWordController();
const fileInput = document.getElementById("file");
const fileInputPlayer = document.getElementById("inputPlayer");
const loadingText = document.getElementById("loading");
let llmAnswer = "";

function vad() {
  console.log("VAD Listening...");
}

function wakeWordDetected() {
  console.log("WakeWord detected!");
  // document.getElementById("status").innerText = "Wakeword erkannt!";
  document.getElementById("push-to-talk-begin").disabled = false;
  document.getElementById("push-to-talk-begin").focus();
}

/*************************************************************
 *  Init Application
 *************************************************************/
document.addEventListener("DOMContentLoaded", async () => {
  updateWakeWordThresholdDisplay();
  updateAudioInputLabel();
  updateTTSOptions();
  updateModelSelection(document.getElementById("wake-word-model").value);

  document.getElementById("start").disabled = true;
  document.getElementById("start-file").disabled = true;
  // await wakewordController.loadWakeWordModel(model);
  await wakewordController.loadProcessingModels();
  console.log("WakeWordController ready");
  document.getElementById("start").disabled = false;
  document.getElementById("start-file").disabled = false;
});

/*****************************
 *  Audio-File WakeWord Init
 * - Handles file input and runs WakeWord detection
 *****************************/
async function initWakeWordFromFile() {
  let threshold = parseFloat(document.getElementById("wakeword-threshold").value) || 0.5;
  let result = await wakewordController.initWakeWordFromFile(fileInput.files?.[0], threshold);
  console.log(result);
  if (result.scores.length === 0) {
    console.log("no scores bruh");
    return;
  }
if (result.hit) {
  let maxScore = Math.max(...result.scores);
  document.getElementById("status").innerText = `Wakeword erkannt! Max-Score: ${maxScore.toFixed(5)}`;
} else {
  let maxScore = Math.max(...result.scores);
  document.getElementById("status").innerText = `Kein Wakeword erkannt. Max-Score: ${maxScore.toFixed(5)}`;
}


}

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
    initPushToTalk()
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
function updateAudioInputLabel() {
  const file = document.getElementById("file").files?.[0];
  if (!file) return;
  if (file) {
    document.getElementById("audio-player-label").innerText = `Ausgewählte Datei: ${file.name}`;
  }
  const url = URL.createObjectURL(file);
  fileInputPlayer.src = url;
  fileInputPlayer.load();
}

/*****************************
 *  TTS Type Listener
 * - show advanced Options for Piper
 *****************************/
function updateTTSOptions() {
  selectedTypeTTS = document.getElementById("tts-type").value;
  if (selectedTypeTTS === "coqui") {
    document.getElementById("piper-options").classList.add("hidden");
  } else {
    document.getElementById("piper-options").classList.remove("hidden");
  }
}

/*****************************
 *  WakeWord Threshold Slider
 *****************************/
function updateWakeWordThresholdDisplay() {
  const val = document.getElementById("wakeword-threshold").value;
  document.getElementById("wakeword-threshold-display").innerText = val;
}

function updateModelSelection(name) {
  wakewordController.loadWakeWordModel(name);
}
