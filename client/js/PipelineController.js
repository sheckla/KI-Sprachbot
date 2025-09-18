/*****************************
 * AI-Pipeline Controller
 * - controls main stepf
 * - 1. Speech-to-text
 * - 2. large language model processing (RAG)
 * - 3. Text-to-Speech generation
 *
 * - Responses contain step-result aswell as response times
 * - API Interaction handled via BeezlebugAPI
 *  18.09.2025 Daniel Graf
 *****************************/
class PipelineController {
    beezlebugAPI = new BeezlebugAPI();

    async speechToText(file, quality) {
        let t1 = Date.now();
        try {
            const response = await this.beezlebugAPI.stt_POST(file, quality);
            let responseTimes = this.getResponseTime(t1, response.ms);
            let answer = {
                text: response.transcription,
                responseTimes: responseTimes
            }
            return answer;
        } catch (error) {
            console.error("Error during STT:", error);
        }
    }

    async speechToEmotion(file) {
        let t1 = Date.now();
        try {
            const response = await this.beezlebugAPI.stt_emotion_POST(file);
            let responseTimes = this.getResponseTime(t1, response.ms);

            // format emotion output
            let emotions = [];
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
                    emotions[element.label] = element.score
                });
            }
            let answer = {
                emotions: emotions,
                responseTimes: responseTimes
            }
            return answer;
        } catch (error) {
            console.error("Error during Emotion STT:", error);
        }
    }

    async startLargeLanguageModelInference(question) {
        let t1 = Date.now();
        try {
            const response = await this.beezlebugAPI.llm_POST(question);
            let responseTimes = this.getResponseTime(t1, response.ms);
            let answer = {
                text: response.reply,
                responseTimes: responseTimes
            }
            return answer;
        } catch (error) {

        }
    }

    async generateTextToSpeech(text, type = "coqui", emotion = 4, speed = 1.0) {
        let t1 = Date.now();
        try {
            let response;
            if (type === "coqui") {
                response = await this.beezlebugAPI.tts_POST_coqui(text);
            } else {
                response = await this.beezlebugAPI.tts_POST_piper(text, emotion, speed);
            }
            let responseTimes = this.getResponseTime(t1, response.ms);
            let answer = {
                audio_data_url: response.audio_data_url,
                responseTimes: responseTimes
            }
            return answer;
        } catch (error) {

        }
    }

    /*****************************
     *  Get Response Times
     * - works via Date.now (t2 - t1)
     * - (server, network, total)
     *****************************/
    getResponseTime(start, response) {
        let msServer = response;
        let msNetwork = Date.now() - start - msServer;
        let msTotal = msServer + msNetwork;

        msServer /= 1000;
        msNetwork /= 1000;
        msTotal /= 1000;

        msServer = msServer.toFixed(2);
        msNetwork = msNetwork.toFixed(2);
        msTotal = msTotal.toFixed(2);

        const times = {
            server: msServer,
            network: msNetwork,
            total: msTotal
        }

        // const times = {
        //     server: msServer.toFixed(2),
        //     network: msNetwork.toFixed(2),
        //     total: msTotal.toFixed(2)
        // };
        return times;
    }
}
