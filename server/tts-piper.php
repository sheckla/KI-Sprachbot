<?php
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
// 0 = amused
// 1 = angry
// 2 = disgusted
// 3 = drunk
// 4 = neutral
// 5 = sleepy
// 6 = surprised
// 7 = whsiper
$emotion = 7;
$emotion = $_POST["emotion"] ?? "4";
$speed = $_POST["speed"] ?? "1";
$PIPER_BIN  = '/Library/Frameworks/Python.framework/Versions/3.13/bin/piper';
$modelName = "thorsten";
$modelName = "thorsten_emotional";
$modelQuality = "medium";
$MODEL_ONNX = '/Users/customer/Sites/localhost/sprachbot/tts/voices/de_DE-' . $modelName . "-" . $modelQuality . ".onnx";
$MODEL_JSON = $MODEL_ONNX . '.json';
$PIPER_EXTRA_FLAGS = [];
$CWD = dirname($MODEL_ONNX);

// ===== Input =====
$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
$text = $_POST['text'];
$text = html_entity_decode( strip_tags( $text ) );
$speaker = trim((string)($body['speaker'] ?? $_POST['speaker'] ?? ''));
if ($text === '') $fail(400, 'no text provided');
// clip fix
$text = $text . ".!_! !_! !_! !_! !_! !_! !_! !_! !_! !_! !_! !_! !_! .!_! !_! !_! !_! !_! !_! !_! !_! !_! !_! !_! !_! !_! .!_! !_! !_! !_! !_! !_! !_! !_! !_! !_! !_! !_! !_!";

// ===== Checks =====
if (!is_file($PIPER_BIN) || !is_executable($PIPER_BIN)) $fail(500, 'piper binary not found or not executable', ['path'=>$PIPER_BIN]);
if (!is_file($MODEL_ONNX)) $fail(500, 'onnx model not found', ['path'=>$MODEL_ONNX]);
if (!is_file($MODEL_JSON)) $fail(500, 'model json not found', ['path'=>$MODEL_JSON]);

$wavFile = sys_get_temp_dir() . '/piper_' . bin2hex(random_bytes(6)) . '.wav'; // nur Output-Datei
$parts = [
  escapeshellarg($PIPER_BIN),
  '--model', escapeshellarg($MODEL_ONNX),
  '--output_file', escapeshellarg($wavFile),
  '--sentence-silence ', escapeshellarg("0.9"),
  "--speaker " . $emotion,
  "--length-scale " . $speed,
  escapeshellarg($text),  // kleiner Punkt gegen abgeschnittene Enden
];
if ($speaker !== '') { $parts[]='--speaker'; $parts[]=escapeshellarg($speaker); }
foreach ($PIPER_EXTRA_FLAGS as $f) { $parts[] = escapeshellarg((string)$f); }
$cmd = implode(' ', $parts) . ' 2>&1'; // stderr auf stdout für Debug

// optional CWD setzen
$prevCwd = getcwd();
if ($CWD && @is_dir($CWD)) @chdir($CWD);

// ausführen
$output = [];
$exitCode = 0;
@exec($cmd, $output, $exitCode);

// CWD zurück
if ($prevCwd) @chdir($prevCwd);

// WAV lesen
$stderr = trim(implode("\n", $output));
$wavBytes = (is_file($wavFile) && filesize($wavFile) > 0) ? @file_get_contents($wavFile) : '';
@unlink($wavFile);

if ($exitCode !== 0 || $wavBytes === '' ) {
  $fail(502, 'piper synthesis failed', [
    'exit_code' => $exitCode,
    'stderr'    => $stderr,
    'cmd'       => $cmd,
    'cwd'       => $CWD,
  ]);
}

$ms = round((microtime(true) - $startTime) * 1000, 2);


echo json_encode([
  'ok'             => true,
  'format'         => 'wav',
  'size_bytes'     => strlen($wavBytes),
  'audio_data_url' => 'data:audio/wav;base64,' . base64_encode($wavBytes),
  'ms'=> $ms,
], JSON_UNESCAPED_UNICODE);
