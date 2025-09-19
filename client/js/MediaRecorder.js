/*****************************
 *  Recorder class for microphone input in browser
 *  Uses MediaRecorder API
 *  https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
 *  16.09.2025 Daniel Graf
 *****************************/
class Recorder {
    static worklet = null;
    static stream = null;
    static mediaRecorder = null;
    static chunks = [];
    static isRecording = false;
    static settings = {
        audio: {
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: false
        }, video: false
    }

    static onChunk = null;

    static async start() {
        if (Recorder.isRecording) {
            console.warn("Recorder already running");
            return;
        }
        Recorder.isRecording = true;

        // permision prompt!
        Recorder.stream = await navigator.mediaDevices.getUserMedia(Recorder.settings);

        // mediarecorder init
        const mime = Recorder.findSupportedMime();
        Recorder.mediaRecorder = new MediaRecorder(Recorder.stream, { mimeType: mime });
        Recorder.chunks = [];

        Recorder.mediaRecorder.addEventListener("dataavailable", e => {
            if (e.data && e.data.size) {
                Recorder.chunks.push(e.data);
            }
        })

        Recorder.mediaRecorder.start();
        console.log("Recorder started:", mime);
    }

    static stop() {
        return new Promise(resolve => {
            if (!Recorder.isRecording) {
                console.warn("Recorder not running");
                resolve(null);
                return;
            }

            if (Recorder.mediaRecorder) {

                Recorder.mediaRecorder.onstop = () => {
                    const blob = new Blob(Recorder.chunks, { type: Recorder.mediaRecorder.mimeType });
                    const file = new File([blob], "input.webm", { type: Recorder.mediaRecorder.mimeType });

                    Recorder.clearStream();
                    Recorder.isRecording = false;

                    resolve({ blob, file });
                };

                Recorder.mediaRecorder.stop();
            }
        });
    }


    static clearStream() {
        Recorder.stream?.getTracks().forEach(t => t.stop());
        Recorder.stream = null;
        Recorder.mediaRecorder = null;
        Recorder.chunks = [];
    }

    static findSupportedMime() {
        const mimes = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/ogg;codecs=opus',
            'audio/ogg'
        ];
        return mimes.find(t => MediaRecorder.isTypeSupported?.(t)) || "";
    }

    static async loadWorklet() {
        // --- Audio Context + Mic Input ---
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // TODO: only works for chrome now, firefox doesn't allow 16kHz sampling
        const audioContext = new AudioContext({ sampleRate: 16000 });
        // const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);


        // --- Load Worklet ---
        const blob = new Blob([processorCode], { type: "application/javascript" });
        const workletURL = URL.createObjectURL(blob);
        await audioContext.audioWorklet.addModule(workletURL);
        this.worklet = new AudioWorkletNode(audioContext, "mic-processor");

        // Standard-Handler -> ruft Callback auf
        this.worklet.port.onmessage = (event) => {
            if (this.onChunk) {
                this.onChunk(event.data); // {chunk, rms, db}
            }
        };

        // --- Connect Mic to Worklet ---
        source.connect(this.worklet);
    }

    static setOnChunkCallback(fn) {
        this.onChunk = fn;
    }
}
// --- Worklet Code for Chunking ---
const processorCode = `
class MicProcessor extends AudioWorkletProcessor {
  bufferSize = 1280; // 80ms bei 16kHz
  _buffer = new Float32Array(this.bufferSize);
  _pos = 0;

  process(inputs) {
    const input = inputs[0][0];
    if (input) {
      for (let i = 0; i < input.length; i++) {
        this._buffer[this._pos++] = input[i];
        if (this._pos === this.bufferSize) {
          // --- Wakeword-Chunks raus ---
          const chunk = this._buffer.slice(0);

          // --- Lautstärke berechnen (RMS) ---
          let sum = 0;
          for (let j = 0; j < chunk.length; j++) {
            sum += chunk[j] * chunk[j];
          }
          const rms = Math.sqrt(sum / chunk.length);
          const db = 20 * Math.log10(rms + 1e-8); // in dB

          // zurück an Main-Thread
          this.port.postMessage({ chunk, rms, db });

          this._pos = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('mic-processor', MicProcessor);
`;

