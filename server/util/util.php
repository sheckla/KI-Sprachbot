<?php
class CorsConfig {
    public static function allowAll(): void {
        header("Access-Control-Allow-Origin: *");
        header("Access-Control-Allow-Methods: POST, OPTIONS");
        header("Access-Control-Allow-Headers: Content-Type, Accept");

        if (($_SERVER["REQUEST_METHOD"] ?? "GET") === "OPTIONS") {
            http_response_code(204);
            exit;
        }
    }
}

// Simple Timer implementation
Class TimerMs {
    private $startTime;
    private $duration;
    
    public function __construct() {
        $this->startTime = microtime(true);
    }
    public function start(): void {
        $this->startTime = microtime(true);
    }

    public function stop(): void {
        $this->duration = microtime(true) - $this->startTime;
    }

    public function getMs(): float {
        if ($this->duration === null) {
            $this->stop();
        }
        return round($this->duration * 1000, 2);
    }
}


// ===== Err Log =====
$fail = function (int $code, string $msg, array $extra = []) {
    http_response_code($code);
    echo json_encode(["ok" => false, "error" => $msg] + $extra, JSON_UNESCAPED_UNICODE);
    exit;
};

class Response {
    public static function fail(int $code, string $msg, array $extra = []): void {
        http_response_code($code);
        echo json_encode(
            array_merge(["ok" => false, "error" => $msg], $extra),
            JSON_UNESCAPED_UNICODE
        );
        exit;
    }

    public static function success(array $data = []): void {
        http_response_code(200);
        echo json_encode(["ok" => true] + $data, JSON_UNESCAPED_UNICODE);
        exit;
    }
}

