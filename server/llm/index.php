<?php
/* HTTP
*
* created by: Daniel Graf
* Doc last updated: 15.09.25
*/
declare(stript_types=1);
header("Content-Type: application/json; charset=utf-8");
require __DIR__ . "../../util/util.php";
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

$fields = [
  'controller'   => 'message',
  'message'      => $message,
];
if ($conversation !== '') $fields['conversation'] = $conversation;

$postFields = http_build_query($fields);

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
    CURLOPT_ENCODING       => '', // gzip/deflate automatisch entpacken
]);
$res  = curl_exec($ch);
$code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($res === false) Response::fail(502, "Agent Request failed.");


$decoded = json_decode($res, true);

Response::success([
    "ms" => $timer->getMs(),
    "reply" => strip_tags($decoded["reply"]),
    "conversation" => $decoded["conversation"],
]);
