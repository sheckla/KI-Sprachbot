<?php
// Author Robert Heuer
ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);

//phpinfo();

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Bearer Token Check
$headers = getallheaders();
$auth_header = $headers['Authorization'] ?? '';
//print_r($headers); exit;

if (!str_starts_with($auth_header, 'Bearer ')) {
	http_response_code(401);
	echo json_encode(['error' => ['message' => 'Invalid API key', 'type' => 'invalid_request_error']]);
	exit;
}
//echo "DEV"; exit;

$token = substr($auth_header, 7); // "Bearer " entfernen
$valid_tokens = ['sk-local-ollama-key-123', 'dein-custom-token']; // Deine Token hier

if (!in_array($token, $valid_tokens)) {
	http_response_code(401);
	echo json_encode(['error' => ['message' => 'Invalid API key', 'type' => 'invalid_request_error']]);
	exit;
}
//echo "DEV"; exit;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
	$input = json_decode(file_get_contents('php://input'), true);
	//print_r($input); exit;

	$model = $input['model'] ?? 'nomic-embed-text';
	$text = $input['input'] ?? '';

	if (empty($text)) {
		http_response_code(400);
		echo json_encode(['error' => ['message' => 'Input text is required', 'type' => 'invalid_request_error']]);
		exit;
	}

	// Ollama API Call
	$url = 'http://localhost:11434/api/embeddings';
	$data = [
		'model' => $model,
		'prompt' => $text
	];

	$ch = curl_init();
	curl_setopt($ch, CURLOPT_URL, $url);
	curl_setopt($ch, CURLOPT_POST, true);
	curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
	curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
	curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
	curl_setopt($ch, CURLOPT_TIMEOUT, 30);

	$response = curl_exec($ch);
	$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
	$curl_error = curl_error($ch);
	curl_close($ch);

	if ($curl_error) {
		http_response_code(500);
		echo json_encode(['error' => ['message' => 'Ollama connection failed: ' . $curl_error, 'type' => 'api_error']]);
		exit;
	}

	if ($http_code !== 200) {
		http_response_code(500);
		echo json_encode(['error' => ['message' => 'Ollama API error: ' . $response, 'type' => 'api_error']]);
		exit;
	}

	$result = json_decode($response, true);

	if (!isset($result['embedding']) || empty($result['embedding'])) {
		http_response_code(500);
		echo json_encode(['error' => ['message' => 'No embedding returned from model', 'type' => 'api_error']]);
		exit;
	}

	// ChatGPT-kompatible Response
	$openai_response = [
		'object' => 'list',
		'data' => [
			[
				'object' => 'embedding',
				'index' => 0,
				'embedding' => $result['embedding']
			]
		],
		'model' => $model,
		'usage' => [
			'prompt_tokens' => str_word_count($text),
			'total_tokens' => str_word_count($text)
		]
	];

	echo json_encode($openai_response);
} else {
	http_response_code(405);
	echo json_encode(['error' => 'Method not allowed']);
}
?>
