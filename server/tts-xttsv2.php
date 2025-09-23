<?php
/* HTTP Proxy für Coqui-TTS API
 *
 * created by: Daniel Graf
 * updated: 23.09.25
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

// ===== Input =====
$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);

$text   = $body['text']   ?? $body['input'] ?? '';
$voice  = $body['voice']  ?? 'Tammie Ema';
$speed  = $body['speed']  ?? 1.0;

if ($text === '') $fail(400, 'no text provided');

// ===== Request an lokalen Coqui-Server =====
$payload = json_encode([
  'input' => $text,
  'voice' => $voice,
  'speed' => (float)$speed
], JSON_UNESCAPED_UNICODE);

$ch = curl_init('http://127.0.0.1:5002/v1/audio/speech');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    'Content-Type: application/json',
    // hier kannst du das gewünschte Format erzwingen:
    'Accept: audio/wav'
  ],
  CURLOPT_POSTFIELDS => $payload,
  CURLOPT_TIMEOUT => 30
]);

$res = curl_exec($ch);
$http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err  = curl_error($ch);
curl_close($ch);

if ($res === false || $http !== 200) {
  $fail(502, 'coqui http failed', ['curl_error'=>$err, 'http'=>$http, 'response'=>$res]);
}

// ===== Rückgabe =====
// Wir liefern die Audiodaten als Base64 zurück, damit Clients es einfach nutzen können
$audioBase64 = base64_encode($res);
$ms = round((microtime(true) - $startTime) * 1000, 2);

echo json_encode([
  'ok'    => true,
  'voice' => $voice,
  'speed' => $speed,
  'ms'    => $ms,
  'audio' => $audioBase64,
  'mime'  => 'audio/wav'
], JSON_UNESCAPED_UNICODE);
exit;
