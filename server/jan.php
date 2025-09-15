<?php
set_time_limit(120);
/*

🔹 1. Jan-nano
API-Name: Menlo:Jan-nano-gguf:jan-nano-4b-iQ4_XS.gguf
Modell-Datei: jan-nano-4b-iQ4_XS.gguf
Pfad: models/huggingface.co/Menlo/Jan-nano-gguf/
Kontextlänge: 40960 Tokens
🔹 2. Mistral 7B
API-Name: mistral:7b
Modell-Datei: model.gguf
Pfad: models/cortex.so/mistral/7b/
Kontextlänge: 4096 Tokens
🔹 3. Gemma 2B
API-Name: gemma2:2b
Modell-Datei: model.gguf
Pfad: models/cortex.so/gemma2/2b/
Kontextlänge: 4096 Tokens
🔹 4. LLaMA 3.2 1B
API-Name: llama3.2:1b
Modell-Datei: model.gguf
Pfad: models/cortex.so/llama3.2/1b/
Kontextlänge: 4096 Tokens
🔹 5. DeepSeek Distill Qwen 7B
API-Name: deepseek-r1-distill-qwen-7b:7b
Modell-Datei: model.gguf
Pfad: models/cortex.so/deepseek-r1-distill-qwen-7b/7b/
Kontextlänge: 4096 Tokens

*/


// Lokaler Jan.ai-Endpunkt
$apiUrl = "http://127.0.0.1:1337/v1/chat/completions";

// 1. Anfrage entgegennehmen
$input = file_get_contents("php://input");
$requestData = json_decode($input, true);

// 2. Modellnamen ggf. mappen, falls "custom" verwendet wird
$modelMap = [
    "custom" => "Menlo:Jan-nano-gguf:jan-nano-4b-iQ4_XS.gguf", // Dein Modellname aus /v1/models
    // Weitere Mappings bei Bedarf
];
//$selectedModel = "gemma2:2b"; //$modelMap[$requestData["model"]] ?? $requestData["model"];

// working
$selectedModel = "Qwen_Qwen3-4B-Instruct-2507-IQ3_XS"; // etwas länger als gemma
$selectedModel = "Llama-3_2-3B-Instruct-IQ4_XS"; // Obwohl geht

//$selectedModel = "mistralai_Voxtral-Mini-3B-2507-IQ4_XS";
$selectedModel = "gemma-3-12b-it-IQ4_XS";
$selectedModel = "gemma-3-1b-it-IQ4_XS"; // aktueller favorit nach Recherche und Testing
$selectedModel = "gemma-3-4b-it-IQ4_XS";

//$selectedModel = "DeepSeek-R1-Distill-Qwen-1_5B-Q4_K_M";
//$selectedModel = "openai_gpt-oss-20b-IQ4_XS";

// 3. Weiterleitbare API-Daten vorbereiten
$payload = [
    "model" => $selectedModel,
    "messages" => $requestData["messages"],
];


// Optional: Temperatur mit übergeben
if (isset($requestData["temperature"])) {
    $payload["temperature"] = $requestData["temperature"];
}

// 4. Anfrage an lokalen Jan.ai-Server senden
$ch = curl_init($apiUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Content-Type: application/json",
    "Authorization: Bearer dev"
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// 5. Ergebnis direkt als JSON zurückgeben
http_response_code($httpCode);
header("Content-Type: application/json");
echo $response;

