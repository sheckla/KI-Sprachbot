/*****************************
 * AI Voice Assistant
 * - program entry point
 * - manages Utility Programms
 * - handles UI-Updates
 *  17.09.2025 Daniel Graf
 *****************************/
// ===== Basic Variables =====
const pipelineController = new PipelineController();
const wakewordController = new OpenWakeWordController();
const fileInput = document.getElementById("file");
const PUSH_TO_TALK_COOLDOWN_MS = 3000;
const wakewordCooldown = new Cooldown(PUSH_TO_TALK_COOLDOWN_MS);
let readyToListen = true;
const $ = (id) => document.getElementById(id);


class SilenceDetector {
  constructor(silenceDurationMs = 1000, threshold = 0.3) {
    this.silenceDurationMs = silenceDurationMs;
    this.frameDurationMs = 80;
    this.threshold = threshold;
    this.buffer = [];
    this.maxFrames = parseInt(this.silenceDurationMs / this.frameDurationMs);
  }

  addValue(score) {
    this.buffer.push(score);
    if (this.buffer.length > this.maxFrames) {
      this.buffer.shift();
    }
  }

  // TODO mit avg arbeiten weil wenn 1 frame nicht passt => non-fire
  isSilent() {
    // console.log(this.buffer.length + " " + this.maxFrames)
    if (this.buffer.length < this.maxFrames) {
    return false;
    }
    console.log(this.getAvg() +  "<" +  this.threshold + "=" + (this.getAvg() < this.threshold))
    return this.getAvg() < this.threshold;
    // return this.bWuffer.every(value => value < this.threshold);
  }

  getAvg() {
    let val = 0;
    this.buffer.forEach(score => {
      val += score;
    })
    val /= this.buffer.length;
    return val;
  }
}

const silenceDetector = new SilenceDetector(5500, 0.0);



/*************************************************************
 *  Init Application
 *************************************************************/
document.addEventListener("DOMContentLoaded", async () => {
  $("final-text").innerText = "Hallo";
  // initial UI update
  updateThresholdSlider($("speech-timeout-threshold"));
  updateThresholdSlider($("vad-threshold"));
  updateThresholdSlider($("wakeword-threshold"));
  updateAudioInputLabel();
  updateTTSOptions();
  updateModelSelection(document.getElementById("wake-word-model").value);

  // disable some functions until ready
  // document.getElementById("start").disabled = true;
  document.getElementById("start-file").disabled = true;

  // load OpenWakeWord
  await wakewordController.loadProcessingModels();
  console.log("WakeWordController ready");

  // enable functions
  // document.getElementById("start").disabled = false;
  document.getElementById("start-file").disabled = false;
  buttonListenForVoiceActivation();
});

/*****************************
 *  Activate WakeWord/VAD Listening
 * - AudioWorklet to chunk audio into 1280 samples (80ms @16kHz = 1240 samples)
 * - Sends chunks to WakeWordController for detection
 * - On detection, triggers Recorder.start()
 * - todo port to different class
 *****************************/
async function buttonListenForVoiceActivation() {
  await Recorder.loadWorklet();

  async function processAudioChunk({ chunk }) {
    // update meters
    const vadScore = await wakewordController.runVAD(chunk);
    const vadThreshold = $("vad-threshold").value;
    const wakewordScore = await wakewordController.processChunk(chunk);
    const wakewordThreshold = $("wakeword-threshold").value;
    silenceDetector.addValue(vadScore);
    silenceDetector.threshold = $("speech-timeout-threshold").value;
    updateMeter("vad", vadScore, $("vad-threshold").value);
    updateMeter("vad", silenceDetector.getAvg(), silenceDetector.threshold);
    updateMeter("wakeword", wakewordScore, $("wakeword-threshold").value);


    if (Recorder.isRecording) {
      if (wakewordCooldown.isExpired() ) {
        console.log(silenceDetector.getAvg().toFixed(3))
        if (silenceDetector.isSilent()) {
          console.log("Es war silent!");
          await stopPushToTalk();
          readyToListen = true;
        }
      }

    }

    if (readyToListen && wakewordScore !== null && wakewordScore >= wakewordThreshold) {
      if (!Recorder.isRecording) {
        await initPushToTalk();
        Recorder.isRecording = true;
        wakewordCooldown.start(); // Cooldown läuft ab jetzt
        readyToListen = false;
      }
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
    console.log("no scores bruh");
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

  // show output
  document.getElementById("llm-wrapper").classList.remove("processing");
  document.getElementById("llm-wrapper").classList.add("success");
  document.getElementById("llm-text").textContent = result.text;
  window.llmAnswer = result.text;

  // llm output to tts input
  document.getElementById("tts-input").value = result.text;

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

  // ui -> processing
  clearTTS();
  document.getElementById("tts-wrapper").classList.add("processing");
  const result = await pipelineController.generateTextToSpeech(text, selectedTypeTTS, selectedEmotion, selectedSpeed)
  if (!result.audio_data_url) {
    return alert("Keine Audiodeteien erhalten!");
  }

  const player = document.getElementById("ttsPlayer");
  player.src = result.audio_data_url; // apply audio data
  // TODO toggle autoplay
  player.play().catch(() => { });

  // update html
  document.getElementById("tts-wrapper").classList.remove("processing");
  document.getElementById("tts-wrapper").classList.add("success");
  // append response times
  let wrapper = buildResponseWrapper(result.responseTimes, " s");
  document.getElementById("tts-text").appendChild(wrapper);
  console.log(result.responseTimes);
  return result;
}

/*****************************
 *  Full Pipeline
 * - STT -> LLM -> TTS
 *****************************/
async function startPipeline() {
  // Prepare run
  clearAll();
  document.getElementById("tts-input").value = "";
  document.getElementById("llm-question").value = "";
  document.getElementById("final-wrapper").classList.add("processing");
  let responseTimes = [];
  let text = document.getElementById("final-text");
  text.text = "(transkribiert...)";
  responseTimes.push((await startSTT()).responseTimes);
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
  console.log(finalResponseTime);
  // Final UI Update
  document.getElementById("final-wrapper").classList.remove("processing");
  document.getElementById("final-wrapper").classList.add("success");

  document.getElementById("final-text").textContent = window.llmAnswer;

  let wrapper = buildResponseWrapper(finalResponseTime, " s");
  document.getElementById("final-text").appendChild(wrapper);

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
  // document.getElementById("loading").textContent = "(hier wird die Antwort stehen)";
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
  // document.getElementById("status").innerText = "Wakeword erkannt!";
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
  selectedTypeTTS = document.getElementById("tts-type").value;
  if (selectedTypeTTS === "coqui") {
    document.getElementById("piper-options").classList.add("hidden");
  } else {
    document.getElementById("piper-options").classList.remove("hidden");
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
  if (event.key === " " || event.key === "Spacebar") { // " " für moderne Browser, "Spacebar" für ältere
    event.preventDefault();
    initPushToTalk()
  }
});


