<?php

// 37: tts_models/de/thorsten/tacotron2-DCA [already downloaded]
// 38: tts_models/de/thorsten/vits [already downloaded]
// 39: tts_models/de/thorsten/tacotron2-DDC [already downloaded]
// 40: tts_models/de/css10/vits-neon [already downloaded]

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


// Pfad zur Coqui-CLI (anpassen!)
// - venv:  /Users/DEINUSER/coqui-venv/bin/tts
// - global: /usr/local/bin/tts oder /opt/homebrew/bin/tts
$TTS_BIN = '/Users/customer/coqui-venv/bin/tts';  // <— ANPASSEN

// ===== Input =====
$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
$text = $_POST['text'] ?? ($body['text'] ?? '');
$text = html_entity_decode(strip_tags((string)$text));
$model = $_POST['model'] ?? ($body['model'] ?? $MODEL_NAME_DEFAULT);
$speaker = trim((string)($body['speaker'] ?? $_POST['speaker'] ?? '')); // nur relevant bei Multi-Speaker-Modellen
// "speed" & "emotion" sind bei Thorsten i.d.R. nicht verfügbar; wir loggen sie nur.
$speed   = trim((string)($_POST['speed'] ?? ($body['speed'] ?? '')));
$emotion = trim((string)($_POST['emotion'] ?? ($body['emotion'] ?? '')));

if ($text === '') $fail(400, 'no text provided');

// Kleines Workaround gegen „Clip am Ende“
$text .= " .";

// ===== Checks =====
if (!is_file($TTS_BIN) || !is_executable($TTS_BIN)) {
  $fail(500, 'tts binary not found or not executable', ['path'=>$TTS_BIN]);
}

// ===== Ausgabedatei =====
$wavFile = sys_get_temp_dir() . '/coqui_' . bin2hex(random_bytes(6)) . '.wav';

// ===== Command bauen =====
$parts = [
  escapeshellarg($TTS_BIN),
  '--text', escapeshellarg($text),
  '--model_name', escapeshellarg($model),
  '--out_path', escapeshellarg($wavFile),
  '--device', 'cpu',              // <— HINZUGEFÜGT
];
// optional: keine GPU/Nvidia auf Mac

// speaker nur anhängen, wenn gesetzt (für Multispeaker-Modelle)
if ($speaker !== '') { $parts[] = '--speaker_idx'; $parts[] = escapeshellarg($speaker); }

// Hinweis: Coqui-CLI hat kein generisches "--length-scale" wie Piper.
// Manche Community-Modelle haben eigene Flags; die lassen wir bewusst weg,
// damit es stabil auf Standard-Thorsten läuft. Wir loggen aber:
$speed = 0.2;
$envNote = [
  'speed_requested' => $speed,
  'emotion_requested' => $emotion,
];

$cmd = implode(' ', $parts) . ' 2>&1';

// ===== Ausführen =====
$output = [];
$exitCode = 0;
@exec($cmd, $output, $exitCode);

// ===== WAV laden =====
$stderr = trim(implode("\n", $output));
$wavBytes = (is_file($wavFile) && filesize($wavFile) > 0) ? @file_get_contents($wavFile) : '';
@unlink($wavFile);

if ($exitCode !== 0 || $wavBytes === '') {
  $fail(502, 'coqui synthesis failed', [
    'exit_code' => $exitCode,
    'stderr'    => $stderr,
    'cmd'       => $cmd,
    'model'     => $model,
  ] + $envNote);
}

$ms = round((microtime(true) - $startTime) * 1000, 2);

echo json_encode([
  'ok'             => true,
  'format'         => 'wav',
  'size_bytes'     => strlen($wavBytes),
  'audio_data_url' => 'data:audio/wav;base64,' . base64_encode($wavBytes),
  'ms'             => $ms,
  'model'          => $model,
] + $envNote, JSON_UNESCAPED_UNICODE);
