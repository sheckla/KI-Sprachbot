const API_URL = "https://one.beezlebug.com/ki-sprachbot";

/* ===== Beezlebug API Class =====
* - Handles all API requests to the Beezlebug backend
* - Manages conversation state for LLM
*/
class BeezlebugAPI {
  conversationId = "";

  constructor(apiUrl) {
    this.apiUrl = apiUrl || API_URL;
  }

  /*****************************
   * Speech-To-Text POST
   * - file: Audio File
   *****************************/
  async stt_POST(file, quality) {
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("quality", quality);
    const url = this.apiUrl + "/server/stt.php";
    const response = await fetch(url, { method: "POST", body: formData });
    const responseText = await response.text();
    return JSON.parse(responseText);
  }

  async stt_emotion_POST(file) {
    const formData = new FormData();
    formData.append("file", file, file.name);
    const url = this.apiUrl + "/server/stt-emotion.php";
    const response = await fetch(url, { method: "POST", body: formData });
    const responseText = await response.text();
    return JSON.parse(responseText);
  }

  /*****************************
   * Language Model POST
   * - question: User question
   *****************************/
  async llm_POST(question) {
    const formData = new FormData();
    formData.append("message", question);

    // remember conversation
    if (this.conversationId) {
      formData.append("conversation", this.conversationId);
    }

    const url = this.apiUrl + "/server/llm.php";
    const response = await fetch(url, { method: "POST", body: formData });
    const responseText = await response.text();
    let json = JSON.parse(responseText);
    this.conversationId = json.conversation;
    document.getElementById("conversation").textContent = " Received";
    return JSON.parse(responseText);
  }

  /*****************************
   * Text-To-Speech POST for Piper
   * - text: Text to be converted to speech
   * - emotion: [0,7]
   * - speed: [0,1]
   *****************************/
  async tts_POST_piper(text, emotion, speed) {
    const formData = new FormData();

    // 4 = default = neutral
    formData.append("emotion", emotion || "4");
    formData.append("speed", speed);
    formData.append("text", text);
    const url = this.apiUrl + "/server/tts-piper.php";
    const response = await fetch(url, { method: "POST", body: formData });
    const responseText = await response.text();
    return JSON.parse(responseText);
  }

    /*****************************
   * Text-To-Speech POST for Coqui
   * - text: Text to be converted to speech
   *****************************/
  async tts_POST_coqui(text) {
    const formData = new FormData();
    formData.append("text", text);
    const url = this.apiUrl + "/server/tts-coqui-hot.php";
    const response = await fetch(url, { method: "POST", body: formData });
    const responseText = await response.text();
    return JSON.parse(responseText);
  }
}
