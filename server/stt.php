<?php
/* HTTP
*   Params:
*     - "file" : .mp3 File
*     - "quality" : model quality (small, medium, large-v3-turbo)
*
* created by: Daniel Graf
* Doc last updated: 15.09.25
*/
declare(strict_types=1);
require __DIR__ . "/util/util.php";
header("Content-Type: application/json; charset=utf-8");
CorsConfig::allowAll();
$timer = new TimerMs();

// ===== Config =====
$quality = $_POST["quality"] ?? "v3-large-turbo-q5_0";
$LANG        = "de";
$WHISPER_CPP_BIN = "/Users/customer/Sprachbot/STT/whisper.cpp/build/bin/whisper-cli"; // absolute path
$MODEL_BIN   = "/Users/customer/Sprachbot/STT/whisper.cpp/models/ggml-" . $quality . ".bin"; // absolute path

// ===== Check binaries =====
$defaultPath = getenv("PATH");
// add ffmpeg to PATH from homebrew installation
putenv("PATH=/opt/homebrew/bin:/usr/local/bin:" . $defaultPath);
$FFMPEG_BIN = trim(shell_exec("command -v ffmpeg") ?? ""); // get location
if ($FFMPEG_BIN === "" || !is_executable($FFMPEG_BIN)) Response::fail(500, "ffmpeg not found");

// Whisper Model Check
if (!is_file($MODEL_BIN)) Response::fail(500, "model missing");

// Whisper bin Check
if (!is_file($WHISPER_CPP_BIN) || !is_executable($WHISPER_CPP_BIN)) Response::fail(500, "whisper missing/not exec");

// ===== Check for uploaded file =====
$uploadedTmp = null;

// check for missing file
if (empty($_FILES["file"])) Response::fail(400, "no audio uploaded");
$inputFile = $_FILES["file"]["tmp_name"];

// ===== TMP Dir =====
$base      = sys_get_temp_dir() . "/stt_" . bin2hex(random_bytes(length: 6));
$tmpWav    = $base . ".wav";
$outPrefix = $base . "_out";
$jsonOut   = $outPrefix . ".json";

// ===== MP3 -> WAV (16k, mono) =====
// TODO Check if not already .wav
$cmdFfmpeg = $FFMPEG_BIN
    . " -y -loglevel error" // -y = overwrite without asking
    . " -i " . escapeshellarg($inputFile) // -i = from input
    . " -ac 1 -ar 16000 " // -ac = audio chanel 1 (mono), 16k
    . escapeshellarg($tmpWav) // tmp location
    . " 2>&1"; // redirect standard error to standard output

$ffmpegOut = shell_exec($cmdFfmpeg);

// file not generated oopsie
if (!is_file($tmpWav)) Response::fail(500, "ffmpeg failed", ["detail" => $ffmpegOut]);

// ===== Whisper processing =====
$cmdWhisper = escapeshellarg($WHISPER_CPP_BIN) .
    " -m " . escapeshellarg($MODEL_BIN) . // -m = model file name
    " -f " . escapeshellarg($tmpWav) . // -f = input file name
    " -l " . escapeshellarg($LANG) . // -l = LANG
    " -t 12 -oj -of " . escapeshellarg($outPrefix) . // -t = threads, oj = output json, of = output file
    " 2>&1"; // redirect standard error to standard output
$whisperOut = shell_exec($cmdWhisper);

// check for whisper output
if (!is_file($jsonOut)) {
    // cleanup
    @unlink($tmpWav);
    Response::fail(500, "no whipser json", ["detail" => $whisperOut]);
}
$data = json_decode(file_get_contents($jsonOut), true) ?: [];

$segments = $data['data']['transcription'] ?? $data['transcription'] ?? null;
$transcription = '';
foreach ($segments as $seg) {
    $transcription .= (string)($seg['text'] ?? '');
}
// ===== Cleanup =====
@unlink($tmpWav);
@unlink($jsonOut);
if ($uploadedTmp) {
    @unlink($uploadedTmp);
}

// ===== Response =====
Response::success([
    "transcription" => $transcription,
    "ms" => $timer->getMs(),
]);
