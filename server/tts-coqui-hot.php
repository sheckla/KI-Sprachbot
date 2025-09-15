<?php
/* HTTP
*
* created by: Daniel Graf
* Doc last updated: 15.09.25
*/

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
$startTime = microtime(true);

// ===== CORS =====
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') { http_response_code(204); exit; }
if ($method !== 'POST') { http_response_code(405); echo json_encode(['ok'=>false,'error'=>'method not allowed']); exit; }

// ===== Helper =====
$fail = function(int $code, string $msg, array $extra = []) {
  http_response_code($code);
  echo json_encode(['ok'=>false,'error'=>$msg] + $extra, JSON_UNESCAPED_UNICODE);
  exit;
};

// ===== Config =====
// Standard: Thorsten (de)
// Verfügbare gute Defaults:
//   - tts_models/de/thorsten/vits
//   - tts_models/de/thorsten/tacotron2-DDC
$MODEL_NAME_DEFAULT = 'tts_models/de/thorsten/vits';
$MODEL_NAME_DEFAULT = 'tts_models/de/thorsten/tacotron2-DDC';


// Pfad zur Coqui-CLI (anpassen!)
// - venv:  /Users/DEINUSER/coqui-venv/bin/tts
// - global: /usr/local/bin/tts oder /opt/homebrew/bin/tts
$TTS_BIN = '/Users/customer/coqui-venv/bin/tts';  // <— ANPASSEN

// ===== Input =====
$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
$text = $_POST['text'] ?? ($body['text'] ?? '');
$text = str_replace('KI','K-I-', $text);
$text = str_replace('twi-bot','twaybott', $text);
//$decoded["reply"] = str_replace("KI","K-I-", $decoded["reply"]);
//$decoded["reply"] = str_replace("twi-bot","twaybott", $decoded["reply"]);
$text = html_entity_decode(strip_tags((string)$text));
$model = $_POST['model'] ?? ($body['model'] ?? $MODEL_NAME_DEFAULT);
$speaker = trim((string)($body['speaker'] ?? $_POST['speaker'] ?? '')); // nur relevant bei Multi-Speaker-Modellen
// "speed" & "emotion" sind bei Thorsten i.d.R. nicht verfügbar; wir loggen sie nur.
$speed   = trim((string)($_POST['speed'] ?? ($body['speed'] ?? '')));
$emotion = trim((string)($_POST['emotion'] ?? ($body['emotion'] ?? '')));

if ($text === '') $fail(400, 'no text provided');


// ===== Checks =====
if (!is_file($TTS_BIN) || !is_executable($TTS_BIN)) {
  $fail(500, 'tts binary not found or not executable', ['path'=>$TTS_BIN]);
}

// ===== Ausführen =====
$output = [];
$exitCode = 0;
// HTTP an den lokalen Dienst
$payload = json_encode(['text'=>$text, 'model'=>$model, 'speaker'=>$speaker ?: null], JSON_UNESCAPED_UNICODE);
$ch = curl_init('http://127.0.0.1:5025/synthesize');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
  CURLOPT_POSTFIELDS => $payload,
  CURLOPT_TIMEOUT => 20
]);
$res = curl_exec($ch);
$http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);

if ($res === false || $http !== 200) {
  $fail(502, 'coqui http failed', ['curl_error'=>$err, 'http'=>$http]);
}
$data = json_decode($res, true);
if (!$data || empty($data['ok'])) {
  $fail(502, 'coqui synthesis failed', ['from_http'=>$data]);
}
$ms = round((microtime(true) - $startTime) * 1000, 2);

// vorhandenes JSON vom Service nehmen und erweitern
$data['ms'] = $ms;

// zurückgeben
echo json_encode($data, JSON_UNESCAPED_UNICODE);
exit;
