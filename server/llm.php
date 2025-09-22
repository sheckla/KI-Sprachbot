<?php
/* HTTP
*
* created by: Daniel Graf
* Doc last updated: 15.09.25
*/
declare(stript_types=1);
require __DIR__ . "/util/util.php";
// ===== CORS =====
CorsConfig::allowAll();
$timer = new TimerMs();

// ===== Config =====
$AGENT_URL = "https://agent.cybob.com/sprachbot/";

// ===== Input =====
$message = $_POST['message'] ?? '';
$conversation = $_POST['conversation'] ?? '';

// ===== Validation =====
if ($message === "") Response::fail(400, "Missing parameter: message.");

// Form-urlencoded Body bauen (RFC 3986, sicher für Sonderzeichen)
$postFields = http_build_query([
    'controller'   => 'message',
    'message'      => $message,
    'conversation' => $conversation,
], '', '&', PHP_QUERY_RFC3986);

// cURL-POST
$ch = curl_init($AGENT_URL);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $postFields,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/x-www-form-urlencoded',
        'Accept: application/json',
    ],
    CURLOPT_FOLLOWLOCATION => true,
    // CURLOPT_TIMEOUT        => 15,
    CURLOPT_ENCODING       => '', // gzip/deflate automatisch entpacken
]);
$res  = curl_exec($ch);
$err  = curl_error($ch);
$code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($res === false) Response::fail(502, "Agent Request failed.");



// Fehler?
// if ($res === false) {
    // http_response_code(502);
    // echo json_encode(['error' => 'Upstream failed', 'detail' => $err, 'status' => $code], JSON_UNESCAPED_UNICODE);
    // exit;
// }
// Status durchreichen & Antwort ausgeben
// http_response_code($code ?: 200);
// $elapsedMs = (int) round((microtime(true) - $startTime) * 1000);
// $decoded = json_decode($res, true);
//$decoded["reply"] = str_replace("KI","K-I-", $decoded["reply"]);
//$decoded["reply"] = str_replace("twi-bot","twaybott", $decoded["reply"]);
// echo json_encode(
    // (json_last_error() === JSON_ERROR_NONE && is_array($decoded))
        // ? $decoded + ['ms' => $elapsedMs]
        // : ['ms' => $elapsedMs, 'raw' => $res],
    // JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
// );

Response::success([
    "reply" => "hi",
    "ms" => $timer->getMs()
]);
