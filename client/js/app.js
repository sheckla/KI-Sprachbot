/*****************************
 * AI Voice Assistant
 * - program entry point
 * - manages Utility Programms
 * - handles UI-Updates
 *  17.09.2025 Daniel Graf
 *****************************/
import { OpenWakeWordController } from "./OpenWakeWordController.js";
import { PipelineController } from "./PipelineController.js";
import { SilenceDetector } from "./SilenceDetector.js";
import { Recorder } from "./MediaRecorder.js";
import { togglePushToTalk } from "./Push-to-Talk-Controller.js";
import { ScoreChart } from "./ScoreChart.js";
import { TwiBotState } from "./TwiBotState.js";
import { LEDController } from "./LedController.js";

// ===== Basic Variables =====
export const state = new TwiBotState();
const pipelineController = new PipelineController();
const wakewordController = new OpenWakeWordController();
const ledController = new LEDController();
const silenceDetector = new SilenceDetector();

// ===== HTML Elems =====
const fileInput = document.getElementById("file");
let wakeWordChart
const $ = (id) => document.getElementById(id);

function playAudio(src, volume = 1.0) {
  const audio = new Audio(src);
  audio.play().then(() => {
    audio.volume = volume;
  });
}

/*************************************************************
 *  Init Application
*************************************************************/
document.addEventListener("DOMContentLoaded", async () => {
  // state init
  playAudio("./audio/startup.mp3", 0.5);
  setLedLoading();
  state.setPipelineBlocked(false);

  // initial UI update
  updateThresholdSlider($("speech-timeout-threshold"));
  updateThresholdSlider($("vad-threshold"));
  updateThresholdSlider($("wakeword-threshold"));
  updateThresholdSlider($("tts-speed"));
  updateAudioInputLabel();
  updateTTSOptions();
  updateModelSelection(document.getElementById("wake-word-model").value);

  // init chart
  wakeWordChart = new ScoreChart("scoreChart", 50);
  window.addEventListener("resize", () => {
    if (wakeWordChart && wakeWordChart.chart) {
      wakeWordChart.chart.resize();
    }
  });

  // disable some functions until ready
  document.getElementById("start-file").disabled = true;

  // load OpenWakeWord
  await wakewordController.loadProcessingModels();
  console.log("AI-Assistant ready to listen!");
  playAudio("./audio/init-complete.mp3", 0.5);
  setLedReady();

  // enable functions
  document.getElementById("start-file").disabled = false;
  buttonListenForVoiceActivation();
});
/*****************************
 *  Activate WakeWord/VAD Listening
 * - AudioWorklet to chunk audio into 1280 samples (80ms @16kHz = 1240 samples)
 * - Sends chunks to WakeWordController for detection
 * - On detection, triggers Recorder.start()
 *****************************/
let i = 0;
async function buttonListenForVoiceActivation() {
  await Recorder.loadWorklet();

  async function processAudioChunk({ chunk, rms, db }) {
    i++
    // update meters
    const vadScore = await wakewordController.runVAD(chunk);
    const vadThreshold = $("vad-threshold").value;
    const wakewordScore = await wakewordController.processChunk(chunk);
    const wakewordThreshold = $("wakeword-threshold").value;
    const normalizedDb = Math.min(1, Math.max(0, (db + 60) / 60)); // [-60, 0] to [0, 1]
    updateMeter("db", normalizedDb);
    updateMeter("vad", silenceDetector.getAvg(), silenceDetector.threshold);
    updateMeter("wakeword", wakewordScore, wakewordThreshold);
    // update chart
    if (wakeWordChart) {
      wakeWordChart.addData(vadScore, wakewordScore);
    }
    silenceDetector.addValue(vadScore * normalizedDb);
    silenceDetector.threshold = $("speech-timeout-threshold").value;

    // ===== stop when silent =====
    if (Recorder.isRecording && silenceDetector.isSilent() && state.pushToTalkCooldown.isExpired()) {
      await togglePushToTalk();
      state.setReadyToListen(true);
    }

    if (state.warmedUpCooldown.isExpired() && state.warmedUp) {
      console.log("setting false from Chunk");
      state.setWarmedUp(false);
      state.warmedUpCooldown.reset();
      setLedReady();
    }

    // ===== already busy or blocked =====
    if (state.pipelineBlocked || Recorder.isRecording) return;

    async function startRecording(v = 0.4) {
      if (state.pipelineBlocked || Recorder.isRecording) return;
      // play start-recording.mp3
      console.log("start recording!");
      playAudio("./audio/start-recording.mp3", v);
      setLedRecording();
      silenceDetector.fillEmpty();
      state.pushToTalkCooldown.start();
      await togglePushToTalk();
      stopTTSPlayback();
    }

    // Start Push-To-Talk via VAD
    // take normalizedDB  and vadScore into account
    if (state.warmedUp &&
      (vadScore * normalizedDb >= vadThreshold)) {
      await startRecording(0.1);
      console.log(vadThreshold)
      silenceDetector.fill(vadThreshold);
      state.setWarmedUp(false);
      return;
    }

    // Start Push-To-Talk via WakeWord + Cooldown
    if ((wakewordScore >= wakewordThreshold)) {
      await startRecording();
      silenceDetector.fill(vadThreshold);
      return;
    }
  }
  Recorder.setOnChunkCallback(processAudioChunk);
}

/*****************************
 *  Audio-File WakeWord Init
 * - Handles file input and runs WakeWord detection
 *****************************/
async function buttonProcessAudioForWakeWord() {
  let threshold = parseFloat(document.getElementById("wakeword-threshold").value) || 0.5;
  let result = await wakewordController.initWakeWordFromFile(fileInput.files?.[0], threshold);
  console.log(result);
  if (result.scores.length === 0) {
    // console.log("no scores bruh");
    return;
  }
  if (result.hit) {
    let maxScore = Math.max(...result.scores);
    document.getElementById("status").innerText = "Wake word erkannt, Max Score: " + maxScore.toFixed(5);
  } else {
    let maxScore = Math.max(...result.scores);
    document.getElementById("status").innerText = "Kein Wake word erkannt, Max Score: " + maxScore.toFixed(5);
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

  // ui -> processing
  clearSTT();
  document.getElementById("stt-text").textContent = "(wird transkribiert...)";
  document.getElementById("stt-wrapper").classList.add("processing");

  // prcoess STT step
  const quality = document.getElementById("whisper-model").value
  let result = await pipelineController.speechToText(file, quality);
  // show output
  document.getElementById("stt-wrapper").classList.remove("processing");
  document.getElementById("stt-wrapper").classList.add("success");
  document.getElementById("stt-text").textContent = result.text;

  // stt output to llm input
  document.getElementById("llm-question").value = result.text;

  // append response times
  let wrapper = buildResponseWrapper(result.responseTimes, " s");
  document.getElementById("stt-text").appendChild(wrapper);
  return result;
}

/*****************************
 *  Emotion STT Step
 * - Handles file input and sends to Emotion STT API
 * - Currently just for demo uses
 *****************************/
async function startEmotionSTT() {
  // check empty file
  const file = document.getElementById("file").files?.[0];
  if (!file) {
    fileInput.focus();
    return alert("Bitte eine Audiodatei wählen.");
  }

  // ui -> processing
  clearSTT();
  document.getElementById("stt-text").textContent = "(Emotionen werden analysiert...)";
  document.getElementById("stt-wrapper").classList.add("processing");

  // prcoess STT step
  let result = await pipelineController.speechToEmotion(file);
  // show output
  document.getElementById("stt-wrapper").classList.remove("processing");
  document.getElementById("stt-wrapper").classList.add("success");
  document.getElementById("stt-text").textContent = result.text;

  // append response times
  document.getElementById("stt-text").appendChild(buildResponseWrapper(result.emotions));
  document.getElementById("stt-text").appendChild(document.createElement("br"));
  document.getElementById("stt-text").appendChild(buildResponseWrapper(result.responseTimes));
  return result;
}

/*****************************
 *  Language Model Step
 * - Sends user question to LLM API
 *****************************/
async function startLLM() {
  // check empty input
  const question = document.getElementById("llm-question").value.trim();
  if (!question) return alert("Bitte eine Frage eingeben.");

  // ui -> processing
  clearLLM();
  document.getElementById("llm-text").textContent = "(Warte auf Antwort...)";
  document.getElementById("llm-wrapper").classList.add("processing");

  const result = await pipelineController.startLargeLanguageModelInference(question);
  const clean = result.text.replace(/\\u([\dA-F]{4})/gi,
    (match, grp) => String.fromCharCode(parseInt(grp, 16))
  );

  // show output
  document.getElementById("llm-wrapper").classList.remove("processing");
  document.getElementById("llm-wrapper").classList.add("success");
  document.getElementById("llm-text").textContent = clean;

  window.llmAnswer = clean;

  // llm output to tts input
  document.getElementById("tts-input").value = clean;

  // append response times
  let wrapper = buildResponseWrapper(result.responseTimes, " s");
  document.getElementById("llm-text").appendChild(wrapper);

  return result;
}

/*****************************
 *  Text-To-Speech Step
 * - Sends text to TTS API and plays audio response
 * TODO: change to 16k for performance (latency)
 *****************************/
async function startTTS() {
  // check empty
  const text = document.getElementById("tts-input").value.trim();
  if (!text) return alert("Bitte eine Antwort zum Vorlesen eingeben.");

  let selectedEmotion = document.getElementById("thorsten-emotion").value;
  let selectedSpeed = document.getElementById("tts-speed").value;
  let selectedSpeaker = document.getElementById("tts-speaker").value;
  let selectedTypeTTS = document.getElementById("tts-type").value;

  // ui -> processing
  clearTTS();
  document.getElementById("tts-wrapper").classList.add("processing");
  const result = await pipelineController.generateTextToSpeech(text, selectedTypeTTS, selectedEmotion, selectedSpeed, selectedSpeaker)
  if (!result.audio_data_url) {
    return alert("Keine Audiodeteien erhalten!");
  }

  const player = document.getElementById("ttsPlayer");
  player.src = result.audio_data_url; // apply audio data
  startTTSPlayback();

  // update html
  document.getElementById("tts-wrapper").classList.remove("processing");
  document.getElementById("tts-wrapper").classList.add("success");
  // append response times
  let wrapper = buildResponseWrapper(result.responseTimes, " s");
  document.getElementById("tts-text").appendChild(wrapper);
  return result;
}

/*****************************
 *  Full Pipeline
 * - STT -> LLM -> TTS
 *****************************/
async function startPipeline() {
  if (state.pipelineBlocked) {
    console.log("Pipeline is blocked!");
    return;
  }
  playAudio("./audio/stop-recording.mp3", 0.5);
  setLedProcessing();

  // Prepare run
  state.setPipelineBlocked(true);
  clearAll();
  document.getElementById("tts-input").value = "";
  document.getElementById("llm-question").value = "";
  document.getElementById("final-wrapper").classList.add("processing");
  let responseTimes = [];
  let text = document.getElementById("final-text");
  text.text = "(transkribiert...)";
  // let response = await startEmotionSTT();
  // responseTimes.push(response.responseTimes);
  responseTimes.push((await startSTT()).responseTimes);
  // $("stt-text").textContent = "setze stimme zu 3";
  $("stt-text").textContent = "neustart";
  let sttText = document.getElementById("stt-text").textContent.toLowerCase();
  if (checkForCommandsInTranscription(sttText)) {
    stopLedProcessing();
    clearAll();
    document.getElementById("llm-question").value = "";
    state.setPipelineBlocked(false);
    setLedReady();
    return;
  }

  text.text = "(wartet auf Anwort...)";
  responseTimes.push((await startLLM()).responseTimes);
  text.text = "(generiert Sprache...)";
  responseTimes.push((await startTTS()).responseTimes);

  let finalResponseTime = { server: 0, network: 0, total: 0 };
  for (const { server, network, total } of responseTimes) {
    finalResponseTime.server = (parseFloat(finalResponseTime.server) + parseFloat(server)).toFixed(2);
    finalResponseTime.network = (parseFloat(finalResponseTime.network) + parseFloat(network)).toFixed(2);
    finalResponseTime.total = (parseFloat(finalResponseTime.total) + parseFloat(total)).toFixed(2);
  }
  // Final UI Update
  document.getElementById("final-wrapper").classList.remove("processing");
  document.getElementById("final-wrapper").classList.add("success");

  document.getElementById("final-text").textContent = window.llmAnswer;

  let wrapper = buildResponseWrapper(finalResponseTime, " s");
  document.getElementById("final-text").appendChild(wrapper);
  state.setPipelineBlocked(false);
  console.log("Pipeline finished!");

  // start hot listen window
  state.setWarmedUp(true);
  stopLedProcessing();
  setLedAnswering();
  state.warmedUpCooldown.reset();
  const player = document.getElementById("ttsPlayer");
  player.onended = () => {
    console.log("onend!");
    state.warmedUpCooldown.start();
  };
}

function checkForCommandsInTranscription(text) {
  text = text.toLowerCase();
  //  text = "setze stimme zu piper hahaha!!";
  // text = "ändere stimme. zu 1.";
  // text = "stop";
  // text = "neustart";

  //check STOP
  const stopSigns = ["stop", "stopp", "abbrechen"];
  for (const sign of stopSigns) {
    if (text.includes(sign)) {
      console.log("command stop!");
      return true;
    }
  }

  // check conversation-memory reset
  const resetSigns = ["neustarten", "neustart"];
  for (const sign of resetSigns) {
    if (text.includes(sign)) {
      console.log("command reset conversation!");
      // beezlebugApi.conversation = "";
      pipelineController.beezlebugAPI.conversationId = "";
      document.getElementById("conversation").textContent = " none";
      return true;
    }
  }
  const ttsMap = {
    "1": "piper",
    "2": "coqui-thorsten",
    "3": "coqui-xttsv2"
  };
  const setTTSSigns = ["setze stimme", "ändere stimme", "wechsel stimme"];
  const ttsOptions = ["1", "2", "3"];
  for (const sign of setTTSSigns) {
    if (text.includes(sign)) {
      for (const [key, value] of Object.entries(ttsMap)) {
        if (text.includes(value.toLowerCase()) || text.includes(key)) {
          document.getElementById("tts-type").value = value;
          updateTTSOptions();
          console.log("command set tts to " + value);
          return true;
        }
      }
    }


    return false;
  }
}


/*****************************
 *  Button handlers
 *****************************/

// clear conversation button
function clearConversation() {
  beezlebugApi.conversation = "";
  document.getElementById("conversation").textContent = " none";
}

// clear stt step
function clearSTT() {
  document.getElementById("stt-text").textContent = "(Sende eine Audio zum Transkribieren ein...)";
  document.getElementById("stt-text").value = "";
  document.getElementById("stt-wrapper").classList.remove("success");
  document.getElementById("stt-wrapper").classList.remove("processing");
}

// clear LLM step
function clearLLM() {
  document.getElementById("llm-text").textContent = "(Frage den Chatbot für eine Antwort!)";
  document.getElementById("llm-wrapper").classList.remove("success");
  document.getElementById("llm-wrapper").classList.remove("processing");
}

// clear TTS step
function clearTTS() {
  document.getElementById("tts-text").textContent = "(Generierte Audio wird hier angezeigt und abgespielt...)";
  document.getElementById("tts-text").value = "";
  document.getElementById("tts-wrapper").classList.remove("processing");
  document.getElementById("tts-wrapper").classList.remove("success");
}

function clearAll() {
  clearSTT();
  clearLLM();
  clearTTS();
  document.getElementById("final-wrapper").classList.remove("processing");
  document.getElementById("final-wrapper").classList.remove("success");
}

/*************************************************************
 *  Utility Functions
 *************************************************************/

/*****************************
 *  Wake Word Detection
 * - initiates push-to-talk
 *****************************/
function wakeWordDetected() {
  console.log("WakeWord detected!");
  document.getElementById("push-to-talk-begin").disabled = false;
  document.getElementById("push-to-talk-begin").focus();
  document.getElementById("push-to-talk-begin").click();
}

/*****************************
 *  Append responseTime Object as html-element
 *****************************/
function buildResponseWrapper(data, suffix = "") {
  const wrapper = document.createElement("div");
  if (data === null) return wrapper;
  Object.entries(data).forEach(([key, value]) => {
    const line = document.createElement("a");
    line.textContent = key + ": " + value + suffix;
    wrapper.appendChild(line);
    wrapper.appendChild(document.createElement("br"));
  })
  return wrapper;
}


function startTTSPlayback() {
  const player = document.getElementById("ttsPlayer");
  player.volume = 1.0;
  player.play().catch(() => { });
}

export function stopTTSPlayback() {
  const player = document.getElementById("ttsPlayer");
  const fadeOut = setInterval(() => {
    if (player.volume <= 0.1) {
      player.volume = 0.0;
      clearInterval(fadeOut);
    }
    player.volume = Math.max(0.0, player.volume - 0.1);
  }, 100);
}
/*****************************
 *  LED-CONTROL Functions
 *****************************/
function setLedLoading() {
  ledController.setColor(20, 20, 20);
}

function setPurpleLED() {
  ledController.setColor(128, 0, 128);
}

function setLedReady() {
  ledController.setColor(0, 255, 0);
}

function setLedRecording() {
  ledController.setColor(128, 0, 128);
}

function setLedProcessing() {
  ledController.startPulse(255, 140, 0);
}

function stopLedProcessing() {
  ledController.stopPulse();
  // ledController.setColor(0, 255, 0);
}

function setLedAnswering() {
  // orange
  ledController.setColor(255, 140, 0);
}

/*************************************************************
 *  Update Functions
 *************************************************************/

/*****************************
 *  FileInput Listener
 * - Preview audio file in player
 *****************************/
function updateAudioInputLabel() {
  const file = document.getElementById("file").files?.[0];
  if (!file) return;
  document.getElementById("audio-player-label").innerText = "Datei: " + file.name;
  const url = URL.createObjectURL(file);
  document.getElementById("inputPlayer").src = url;
  document.getElementById("inputPlayer").load();
}

/*****************************
 *  TTS Type Listener
 * - show advanced Options for Piper
 *****************************/
function updateTTSOptions() {
  let selectedTypeTTS = document.getElementById("tts-type").value;

  document.getElementById("piper-options").classList.add("hidden");
  document.getElementById("xtts-options").classList.add("hidden");
  document.getElementById("speed-options").classList.add("hidden");
  // quick and dirty
  switch (selectedTypeTTS) {
    case "coqui-thorsten":
      break;
    case "coqui-xttsv2":
      document.getElementById("xtts-options").classList.remove("hidden");
      document.getElementById("speed-options").classList.remove("hidden");
      break;
    case "piper":
      document.getElementById("piper-options").classList.remove("hidden");
      document.getElementById("speed-options").classList.remove("hidden");
      break;
  }
}

function updateThresholdSlider(input) {
  const label = $(input.id + "-display");
  label.textContent = input.value;
}

/*****************************
 *  Wake Workd Model Selection Update
 *****************************/
function updateModelSelection(name) {
  wakewordController.loadWakeWordModel(name);
}

function updateMeter(id, value, activateAt = 0.5) {
  const wrapper = document.getElementById(id + "-meter-wrapper");
  const meter = document.getElementById(id + "-meter");
  const label = document.getElementById(id + "-meter-value");

  // clamp 0–1
  const clamped = Math.max(0, Math.min(1, value));
  meter.style.width = (clamped * 100) + "%";
  label.textContent = clamped.toFixed(2);

  if (value >= activateAt) {
    wrapper.classList.toggle("meter-active", true);
  } else {
    wrapper.classList.toggle("meter-active", false);
  }

}

/*****************************
 *  Push to Talk Via Spacebar
 *****************************/
document.getElementById("push-to-talk-begin").addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "Spacebar") {
    event.preventDefault();
    // initPushToTalk()
  }
});

// app.js (am Ende oder nach Funktionsdefinitionen)
window.startTTS = startTTS;
window.startSTT = startSTT;
window.startEmotionSTT = startEmotionSTT;
window.startLLM = startLLM;
window.startPipeline = startPipeline;
window.buttonListenForVoiceActivation = buttonListenForVoiceActivation;
window.buttonProcessAudioForWakeWord = buttonProcessAudioForWakeWord;
window.updateModelSelection = updateModelSelection;
window.updateThresholdSlider = updateThresholdSlider;
window.updateTTSOptions = updateTTSOptions;
window.clearAll = clearAll;
window.clearConversation = clearConversation;
window.updateAudioInputLabel = updateAudioInputLabel;
window.togglePushToTalk = togglePushToTalk;

