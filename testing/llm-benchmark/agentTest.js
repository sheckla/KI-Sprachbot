const fetch = require("node-fetch");
const fs = require("fs");

// config
const N_RUNS = 3;
const LLM_NAME = "gwen-3:4b";
const OUTPUT_FILE = "bot-run-n3-" + LLM_NAME + ".txt";
const API_URL = "https://one.beezlebug.com/sprachbot/llm.php";

const QUESTIONS = [
  "/no_think Hallo, ich heiße Klaus!",
  "Für wen arbeitest du. Kannst du mir mehr darüber erzählen?",
  "Ich werde Morgen nächsten Montag meinen ersten Arbeitstag haben. Wann sind die Arbeitszeiten?",
  "Ok verstanden! Wie funktioniert das Flex-Time System?",
  "Wenn ich jetzt Montag um 9:00 Uhr kommen würde und dann um 16:00 Uhr gehe, ist das aber kein Problem, oder?",
  "Ok danke! Bis dann!"
];

class Bot {
  constructor(apiUrl) {
    this.apiUrl = apiUrl;
    this.conversation = "";
  }

  async start() {
    this.conversation = "";
    console.log("Started new bot session");
  }

  async message(text) {
    const body = new URLSearchParams();
    body.set("message", text);
    if (this.conversation) body.set("conversation", this.conversation);

    const begin = Date.now();
    const res = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body
    });
    const end = Date.now();
    const latencySec = (end - begin) / 1000;

    const data = await res.json().catch(() => ({}));

    if (data.conversation) {
      this.conversation = data.conversation;
    }

    const rawReply = (data.reply_text || data.reply || data.reply_html || "");
    const cleanReply = String(rawReply).replace(/<[^>]+>/g, "").trim();

    console.log("Bot (" + latencySec.toFixed(3) + " s) " + cleanReply)
    return { reply: cleanReply, latencySec, raw: data };
  }
}

async function singleRun(runIndex, log) {
  const bot = new Bot(API_URL);
  await bot.start();

  const perMsgLatency = [];
  const replies = [];

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    //log("\n[Test " + (runIndex + 1) + "] [Frage " + (i + 1) + "] " + q);
    try {
      const ans = await bot.message(q);
      perMsgLatency[i] = ans.latencySec;
      replies[i] = ans.reply;
      log("[Antwort " + (i + 1) + "] (" + ans.latencySec.toFixed(3) + "s) " + ans.reply);
    } catch (e) {
      perMsgLatency[i] = NaN;
      replies[i] = "(Fehler)";
      log("Fehler");
    }
  }

  const total = perMsgLatency.reduce((a, b) => a + (isNaN(b) ? 0 : b), 0);
  log("Gesamtlatenz: " + total.toFixed(3) + "s");
  return { perMsgLatency, total };
}

async function main() {
  const lines = [];
  const log = (s = "") => lines.push(s);

  log("Sprachbot Test mit " + LLM_NAME);
  log("API: " + API_URL);
  log("Output: " + OUTPUT_FILE);
  log("Testdurchlauf Anzahl: " + N_RUNS);
  log("Anzahl Fragen: " + QUESTIONS.length);
  for (let i = 0; i < QUESTIONS.length; i++) {
    log("Frage " + (i + 1) + ": " + QUESTIONS[i]);
  }
  log("=============================================");

  const sumPerMsg = new Array(QUESTIONS.length).fill(0);
  const countPerMsg = new Array(QUESTIONS.length).fill(0);
  let sumTotal = 0;
  let countTotal = 0;

  for (let r = 0; r < N_RUNS; r++) {
    log("\n==== [Test " + (r + 1) + "]=====");
    const result = await singleRun(r, log);

    // Durchschnitt sammeln
    result.perMsgLatency.forEach((v, i) => {
      if (!isNaN(v)) {
        sumPerMsg[i] += v;
        countPerMsg[i] += 1;
      }
    });
    if (!isNaN(result.total)) {
      sumTotal += result.total;
      countTotal += 1;
    }
  }

  log("\n===========================");
  log("=== Ergebnis ===");

  for (let i = 0; i < QUESTIONS.length; i++) {
    const avg = countPerMsg[i] ? (sumPerMsg[i] / countPerMsg[i]) : NaN;
    log("[Frage " + (i + 1) + "] durschnittliche Latenz: " + avg.toFixed(3));
  }
  const avgTotal = countTotal ? (sumTotal / countTotal) : NaN;
  log("durschnittliche Latez pro Durchlauf: " + avgTotal.toFixed(3) + " s");
  //log(`[durschnittliche Latenz pro Lauf: ${isNaN(avgTotal) ? "-" : avgTotal.toFixed(3)} s  (n=${countTotal}/${N_RUNS})`);
  const avgPerQuestion = avgTotal / QUESTIONS.length;
  log("durschnittliche Latenz pro Frage " + avgPerQuestion.toFixed(3) + " s");
  // Datei schreiben
  fs.writeFileSync(OUTPUT_FILE, lines.join("\n") + "\n", "utf8");
  console.log(`\n✅ Ergebnisse gespeichert in: ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error("Error!:", err);
  process.exit(1);
});
