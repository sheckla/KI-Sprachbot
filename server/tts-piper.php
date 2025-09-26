<?php
/*
 * HTTP Proxy für Piper-TTS
 *   Params:
 *     - "text"    : Eingabetext
 *     - "emotion" : 0=amused, 1=angry, 2=disgusted, 3=drunk, 
 *                   4=neutral, 5=sleepy, 6=surprised, 7=whisper
 *     - "speed"   : Sprechgeschwindigkeit (default: 1.0)
 *
 * created by: Daniel Graf
 * last updated: 26.09.25
 */
declare(strict_types=1);
require __DIR__ . "/util/util.php";

header("Content-Type: application/json; charset=utf-8");
CorsConfig::allowAll();
$timer = new TimerMs();

// ===== Input =====
$emotion = $_POST["emotion"] ?? "4";
$speed   = $_POST["speed"]   ?? "1";
$text    = $_POST["text"]    ?? "";
if ($text === "") Response::fail(400, "no text provided");

// ===== Config =====
$modelName    = "thorsten_emotional";
$modelQuality = "medium";
$MODEL_ONNX   = __DIR__ . "/voices/de_DE-" . $modelName . "-" . $modelQuality . ".onnx";
$MODEL_JSON   = $MODEL_ONNX . ".json";
$CWD          = dirname($MODEL_ONNX);

// ===== Piper Binary check =====
// zuerst im PATH suchen
$defaultPath = getenv("PATH");
putenv("PATH=/opt/homebrew/bin:/usr/local/bin:" . $defaultPath);
$PIPER_BIN = trim(shell_exec("command -v piper") ?? "");

// fallback auf absoluten Pfad
if ($PIPER_BIN === "" || !is_executable($PIPER_BIN)) {
    $PIPER_BIN = "/Library/Frameworks/Python.framework/Versions/3.13/bin/piper";
}
if (!is_file($PIPER_BIN) || !is_executable($PIPER_BIN)) {
    Response::fail(500, "piper binary not found or not executable", ["path" => $PIPER_BIN]);
}

// ===== Model check =====
if (!is_file($MODEL_ONNX)) Response::fail(500, "onnx model not found", ["path" => $MODEL_ONNX]);
if (!is_file($MODEL_JSON)) Response::fail(500, "model json not found", ["path" => $MODEL_JSON]);

// ===== Temp output =====
$wavFile = sys_get_temp_dir() . "/piper_" . bin2hex(random_bytes(6)) . ".wav";

// ===== Command =====
$parts = [
    escapeshellarg($PIPER_BIN),
    "--model", escapeshellarg($MODEL_ONNX),
    "--output_file", escapeshellarg($wavFile),
    "--sentence-silence", "0.9",
    "--speaker", escapeshellarg($emotion),
    "--length-scale", escapeshellarg($speed),
    escapeshellarg($text)
];
$cmd = implode(" ", $parts) . " 2>&1";

// ===== Run =====
$output   = [];
$exitCode = 0;
@exec($cmd, $output);

// ===== WAV lesen =====
$stderr   = trim(implode("\n", $output));
$wavBytes = (is_file($wavFile) && filesize($wavFile) > 0) ? @file_get_contents($wavFile) : '';
@unlink($wavFile);

if ($exitCode !== 0 || $wavBytes === '') {
    Response::fail(502, "piper synthesis failed", [
        "exit_code" => $exitCode,
        "stderr"    => $stderr,
        "cmd"       => $cmd,
        "cwd"       => $CWD,
    ]);
}

// ===== Response =====
Response::success([
    "ok"             => true,
    "format"         => "wav",
    "size_bytes"     => strlen($wavBytes),
    "audio_data_url" => "data:audio/wav;base64," . base64_encode($wavBytes),
    "ms"             => $timer->getMs(),
]);
