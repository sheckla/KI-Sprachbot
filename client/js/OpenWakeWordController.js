
/*************************************************************
 * Open Wake Word Controller with processing functions for Audio Chunks
 * 16000 Samples => 1 sec audio
 * inference every 0.08 sec => 1280 Samples per Chunk
 * min required samples = 16 * 1280 = 20480 (1.28 sec)
 *
 * openWakeWord:
 * https://github.com/dscripka/openWakeWord
 *
 * Main processing steps have been adapted from:
 * https://deepcorelabs.com/open-wake-word-on-the-web/
*************************************************************/
const FRAME_SIZE = 1280;
class OpenWakeWordController {
    melspectogramSession = null;
    embeddingSession = null;
    wakewordSession = null;
    vadSession = null;

    melBuffer = [];
    embeddingBuffer = [];

    constructor() { }

    async loadProcessingModels() {
        const sessionOptions = { executionProviders: ['wasm'] };
        const embeddingsModel = "./models/openwakeword/embedding_model.onnx";
        const vadModel = "./models/openwakeword/silero_vad.onnx";
        const melspectogramModel = "./models/openwakeword/melspectrogram.onnx";

        this.melspectogramSession = await ort.InferenceSession.create(melspectogramModel, sessionOptions);
        this.embeddingSession = await ort.InferenceSession.create(embeddingsModel, sessionOptions);
        this.vadSession = await ort.InferenceSession.create(vadModel, sessionOptions);
    }

    async loadWakeWordModel(name = "./models/hey_rhasspy_v0.1.onnx") {
        if (this.wakewordSession) this.wakewordSession = null;
        console.log("loading Wake-Word-model " + name);
        this.wakewordSession = await ort.InferenceSession.create(name);
        console.log("model loaded!");
    }

    async initWakeWordFromFile(file, threshold = 0.5) {
        if (!file) return { hit: false, scores: [], max: 0 };

        this.melBuffer = [];
        this.embeddingBuffer = [];

        // Audio laden und auf 16kHz Mono resamplen
        const audioCtx = new AudioContext();
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const offlineCtx = new OfflineAudioContext(1, Math.ceil(audioBuffer.length * 16000 / audioBuffer.sampleRate), 16000);
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineCtx.destination);
        source.start(0);
        let samples = (await offlineCtx.startRendering()).getChannelData(0);

        // Silence-Padding wie in Python (1s vorne + 1s hinten)
        const pad = new Float32Array(12400);
        console.log(pad.length);
        let padded = new Float32Array(pad.length + samples.length + pad.length);
        padded.set(pad, 0);
        padded.set(samples, pad.length);
        padded.set(pad, pad.length + samples.length);
        samples = padded;
        console.log("audio length (samples): " + samples.length);
        console.log(samples.length / 16000 + " sec");

        // Embedding-Buffer mit 16 Null-Vektoren starten
        this.embeddingBuffer = [];
        for (let i = 0; i < 16; i++) {
            this.embeddingBuffer.push(new Float32Array(96).fill(0));
        }

        let highestScore = 0.0;
        const scores = [];

        // Kein Overlap → Schrittweite = frameSize
        for (let i = 0; i < Math.floor(samples.length / FRAME_SIZE); i++) {
            const frame = samples.subarray(i * FRAME_SIZE, (i + 1) * FRAME_SIZE);
            const score = await this.processChunk(frame);
            if (score !== null) {
                scores.push(score);
                if (score > highestScore) highestScore = score;
            }
        }

        return { hit: highestScore >= threshold, scores, max: highestScore };
    }



    // step 1: Mel-Spectogram + Buffer
    // 1280 frames!
    async processChunk(chunk) {

        // prcoess via onnx
        const melIn = new ort.Tensor("float32", chunk, [1, chunk.length]);
        const melOut = await this.melspectogramSession.run({ [this.melspectogramSession.inputNames[0]]: melIn });
        let melData = melOut[this.melspectogramSession.outputNames[0]].data;

        // magic from https://deepcorelabs.com/open-wake-word-on-the-web/
        for (let j = 0; j < melData.length; j++) {
            melData[j] = (melData[j] / 10.0) + 2.0;
        }

        // onxx runtime reuses output buffers => must create copies
        for (let i = 0; i < 5; i++) {
            this.melBuffer.push(new Float32Array(melData.subarray(i * 32, (i + 1) * 32)));
        }

        return this._maybeRunEmbedding();
    }

    async _maybeRunEmbedding() {

        if (this.melBuffer.length < 76) return null;
        // while (this.melBuffer.length < 76) {
        this.melBuffer.splice(0, 8); // Stride = 8 Frames (wie im Web-Repo)

            const windowFrames = this.melBuffer.slice(0, 76);
            // this.melBuffer.splice(0, 8); // Stride = 8 Frames (wie im Web-Repo)
            const flatMel = new Float32Array(76 * 32);
            for (let i = 0; i < windowFrames.length; i++) {
                flatMel.set(windowFrames[i], i * 32);
            }

            const embIn = new ort.Tensor("float32", flatMel, [1, 76, 32, 1]);
            const embOut = await this.embeddingSession.run({ [this.embeddingSession.inputNames[0]]: embIn });
            const embedding = new Float32Array(embOut[this.embeddingSession.outputNames[0]].data);

            // Embedding Buffer: exakt 16 behalten
            if (this.embeddingBuffer.length >= 16) this.embeddingBuffer.shift();
            this.embeddingBuffer.push(embedding);

            return this._maybeRunWakeword();
        // }
    }

    async _maybeRunWakeword() {
        if (this.embeddingBuffer.length < 16) return null;

        const flatEmb = new Float32Array(16 * 96);
        for (let i = 0; i < this.embeddingBuffer.length; i++) {
            flatEmb.set(this.embeddingBuffer[i], i * 96);
        }

        const wwIn = new ort.Tensor("float32", flatEmb, [1, 16, 96]);
        const wwOut = await this.wakewordSession.run({ [this.wakewordSession.inputNames[0]]: wwIn });
        const score = wwOut[this.wakewordSession.outputNames[0]].data[0];

        return score;
    }
}
