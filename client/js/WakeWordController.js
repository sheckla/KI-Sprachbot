class WakeWordController {
    onnxSession = null;

    async loadModel(name = "./models/hey_rhasspy_v0.1.onnx") {
        if (this.onnxSession) {
            this.onxxSession = null;
        }
        console.log("loading Onxx-model " + name);
        this.onnxSession = await ort.InferenceSession.create(name);
        console.log("model loaded!");
    }

    async initWakeWordFromFile(file, threshold = 0.5) {
        if (!file) {
            alert("Bitte Audiodatei auswählen!");
            return;
        }
        const inputName = this.onnxSession.inputNames[0];
        const outputName = this.onnxSession.outputNames[0];

        // Audio-Datei laden und decodieren
        const audioCtx = new AudioContext();
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        // Rohsamples vom 1. Kanal
        let samples = audioBuffer.getChannelData(0);
        // evtl downsampling?
        // klappt nicht gut mit 44khz
        // 22khz, 16khz sind ok!
        samples = await resampleTo16k(audioBuffer);
        const frameSize = 512;
        const window = hannWindow(frameSize);
        const fbanks = melFilterbank(frameSize, 16000, 96);
        let frameBuffer = [];

        // Datei frameweise durchlaufen
        let scores = []
        for (let pos = 0; pos + frameSize <= samples.length; pos += frameSize/2) {
            const frame = samples.slice(pos, pos + frameSize);

            // Fensterung + FFT
            const framed = frame.map((v, i) => v * window[i]);
            const magSpec = fftMag(framed);

            // Mel-Spectrum (96 Bins)
            const melSpec = fbanks.map(f => f.reduce((acc, w, i) => acc + w * magSpec[i], 0));
            const logMel = melSpec.map(v => Math.log(v + 1e-6));

            frameBuffer.push(logMel);
            if (frameBuffer.length > 16) frameBuffer.shift();

            if (frameBuffer.length === 16) {
                const flat = frameBuffer.flat();
                const tensor = new ort.Tensor("float32", Float32Array.from(flat), [1, 16, 96]);
                const results = await this.onnxSession.run({ [inputName]: tensor });
                const score = results[outputName].data[0];
                // console.log(`Frame @${(pos / 16000).toFixed(2)}s: Score=${score.toFixed(3)}`);

                if (score >= threshold) {
                    return {hit: true, "score": score};
                } else {
                    scores.push(score);
                }
            }
        }
        return {hit: false, "scores": scores};
    }
}

// Hilfsfunktion: Hann-Fenster
function hannWindow(length) {
    const win = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
    }
    return win;
}

/*************************************************************
 *  Ab hier alles schwarze Magie....
 *************************************************************/
async function resampleTo16k(audioBuffer) {
    const targetRate = 16000;
    const offlineCtx = new OfflineAudioContext(
        1, // Kanäle: mono
        Math.ceil(audioBuffer.duration * targetRate),
        targetRate
    );

    // Quelle aus dem alten Buffer
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    // Rendern → neues AudioBuffer mit 16 kHz mono
    const rendered = await offlineCtx.startRendering();
    return rendered.getChannelData(0); // Float32Array
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
