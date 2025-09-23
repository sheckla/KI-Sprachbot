<?php
declare(strict_types=1);
require __DIR__ . "/util/util.php";

header("Content-Type: application/json; charset=utf-8");
CorsConfig::allowAll();
$timer = new TimerMs(); $timer->start();

// ===== Input =====
$text    = $_POST["text"]    ?? "";
$speed   = (float)($_POST["speed"] ?? 1.0);
$speaker = $_POST["speaker"] ?? "Tammie Ema";
$language = $_POST["language_id"] ?? "";

if ($text === "") {
  Response::fail(400, "No text input.");
}
$text = preg_replace("/[.,!?;:]/u", "\n", $text);
// ===== Request an lokalen Coqui XTTSv2 Server =====
$payload = json_encode([
  "input"  => $text,
  "voice"  => $speaker,
  "speed"  => $speed,
  "language_id" => $lang
], JSON_UNESCAPED_UNICODE);

$ch = curl_init("http://127.0.0.1:5002/v1/audio/speech");
curl_setopt_array($ch, [
  CURLOPT_POST           => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER     => [
    "Content-Type: application/json",
    "Accept: audio/wav"
  ],
  CURLOPT_POSTFIELDS     => $payload,
  CURLOPT_TIMEOUT        => 60,
]);

$res  = curl_exec($ch);
$http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err  = curl_error($ch);
curl_close($ch);

if ($res === false || $http !== 200) {
  Response::fail(502, "coqui http failed", [
    "curl_error" => $err,
    "http"       => $http,
    "response"   => $res,
  ]);
}

// ===== Base64 codieren & zurückgeben =====
$audioBase64 = base64_encode($res);

Response::success([
  "ok"             => true,
  "format"         => "wav",
  "audio_data_url" => "data:audio/wav;base64," . $audioBase64,
  "size_bytes"     => strlen($res),
  "ms"             => $timer->getMs(),
  "speaker"        => $speaker,
  "speed"          => $speed,
]);
