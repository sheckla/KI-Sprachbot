class WakeWordController {
    melspectogramSession = null;
    embeddingSession = null;
    wakewordSession = null;
    vadSession = null;

    melBuffer = [];
    embeddingBuffer = [];

    constructor() { }

    async loadProcessingModels() {
        const sessionOptions = { executionProviders: ['wasm'] };
        // const wakewordModel = "./models/hey_rhasspy_v0.1.onnx";
        const embeddingsModel = "./models/openwakeword/embedding_model.onnx";
        const vadModel = "./models/openwakeword/silero_vad.onnx";
        const melspectogramModel = "./models/openwakeword/melspectrogram.onnx";

        this.melspectogramSession = await ort.InferenceSession.create(melspectogramModel, sessionOptions);
        this.embeddingSession = await ort.InferenceSession.create(embeddingsModel, sessionOptions);
        // this.wakewordSession = await ort.InferenceSession.create(wakewordModel, sessionOptions);
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

        const frameSize = 1280;
        const minRequiredSamples = 16 * frameSize;
        // if (audioData.length < minRequiredSamples) {
            // const padding = new Float32Array(minRequiredSamples - audioData.length);
            // const newAudioData = new Float32Array(minRequiredSamples);
            // newAudioData.set(audioData, 0);
            // newAudioData.set(padding, audioData.length);
            // audioData = newAudioData;
        // }

        // Silence-Padding wie in Python (1s vorne + 1s hinten)
        const pad = new Float32Array(16000);
        let padded = new Float32Array(pad.length + samples.length + pad.length);
        padded.set(pad, 0);
        padded.set(samples, pad.length);
        padded.set(pad, pad.length + samples.length);
        samples = padded;

        // Embedding-Buffer mit 16 Null-Vektoren starten
        this.embeddingBuffer = [];
        for (let i = 0; i < 16; i++) {
            this.embeddingBuffer.push(new Float32Array(96).fill(0));
        }

        let highestScore = 0.0;
        const scores = [];

        // Kein Overlap → Schrittweite = frameSize
        for (let i = 0; i < Math.floor(samples.length / frameSize); i++) {
            const frame = samples.subarray(i * frameSize, (i + 1) * frameSize);
            const score = await this.processChunk(frame);
            if (score !== null) {
                scores.push(score);
                if (score > highestScore) highestScore = score;
            }
        }

        return { hit: highestScore >= threshold, scores, max: highestScore };
    }




    async processChunk(chunk) {
        // chunk = Float32Array mit 1280 Samples @16kHz
        const melIn = new ort.Tensor("float32", chunk, [1, chunk.length]);
        const melOut = await this.melspectogramSession.run({ [this.melspectogramSession.inputNames[0]]: melIn });
        let melData = melOut[this.melspectogramSession.outputNames[0]].data;

        // Normierung wie in openWakeWord
        for (let j = 0; j < melData.length; j++) {
            melData[j] = (melData[j] / 10.0) + 2.0;
        }

        // 5 Frames à 32 Features ins Buffer (immer Kopien!)
        for (let i = 0; i < 5; i++) {
            this.melBuffer.push(new Float32Array(melData.subarray(i * 32, (i + 1) * 32)));
        }

        return this._maybeRunEmbedding();
    }

    async _maybeRunEmbedding() {
        if (this.melBuffer.length < 76) return null;

        const windowFrames = this.melBuffer.slice(0, 76);
        this.melBuffer.splice(0, 8); // Stride = 8 Frames (wie im Web-Repo)

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
