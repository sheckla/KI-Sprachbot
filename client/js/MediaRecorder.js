class Recorder {
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

    static async start() {
        if (Recorder.isRecording) {
            console.warn("Recorder already running");
            return;
        }

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
        Recorder.isRecording = true;
        console.log("Recorder started:", mime);
    }

    static stop() {
        return new Promise(resolve => {
            if (!Recorder.isRecording) {
                console.warn("Recorder not running");
                resolve(null);
                return;
            }

            Recorder.mediaRecorder.onstop = () => {
                const blob = new Blob(Recorder.chunks, { type: Recorder.mediaRecorder.mimeType });
                const file = new File([blob], "input.webm", { type: Recorder.mediaRecorder.mimeType });

                Recorder.clearStream();
                Recorder.isRecording = false;

                resolve({ blob, file });
            };

            Recorder.mediaRecorder.stop();
        });
    }


    // stoppt Tracks und räumt auf
    static clearStream() {
        Recorder.stream?.getTracks().forEach(t => t.stop());
        Recorder.stream = null;
        Recorder.mediaRecorder = null;
        Recorder.chunks = [];
    }

    // Hilfsfunktion: Mime-Type finden
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
}
