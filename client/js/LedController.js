/*****************************
 * ===== LED Controller Class =====
 * - Controls WS2812 LEDs via Raspberry Pi REST API
 * - Supports RGB transitions and direct color control
 *  24.10.2025 Daniel Graf
 *****************************/

// const BASE_URL = "http://192.168.112.151:5000"; // Pi API Endpoint
const BASE_URL = "https://localhost:5000"; // Pi API Endpoint

export class LEDController {
  constructor(baseUrl = BASE_URL) {
    this.baseUrl = baseUrl;
    this.currentColor = { r: 0, g: 0, b: 0 };
    this.targetColor = { r: 0, g: 0, b: 0 };
    this.isPulsing = false;
  }

  /*****************************
   * Send RGB Color to Raspberry Pi LED API
   *****************************/
  async sendColor(r, g, b) {
    const url = this.baseUrl + "/color?r=" + r + "&g=" + g + "&b=" + b;
    const elem = document.getElementById("led-indicator");
    if (elem) {
      console.log("setting color", r, g, b);
      elem.style.background = "rgb(" + r + ", " + g + ", " + b + ")";
      elem.style.boxshadoe = "0 0 12px rgb(" + r + ", " + g + ", " + b + ")";
    }
    return;
    try {
      const res = await fetch(url);
      const data = await res.json();
      // if (!res.ok) throw new Error(data.message || "LED Request failed");
      return data;
    } catch (err) {
      // console.error("[LEDController] Fetch Error:", err);
      return { status: "error", message: err.message };
    }
  }

  /*****************************
   * Set Color with Smooth Transition
   *****************************/
  async setColor(r, g, b) {
    const start = { ...this.currentColor };
    const delay = 300 / 3;

    const steps = [
      { t: 0.33 },
      { t: 0.66 },
      { t: 1.0 },
    ];

    for (const step of steps) {
      const ir = Math.round(start.r + (r - start.r) * step.t);
      const ig = Math.round(start.g + (g - start.g) * step.t);
      const ib = Math.round(start.b + (b - start.b) * step.t);
      await this.sendColor(ir, ig, ib);
      await new Promise(res => setTimeout(res, delay));
    }

    this.currentColor = { r, g, b };
  }

  /*****************************
   * Set Color Immediately (no transition)
   *****************************/
  async instantColor(r, g, b) {
    this.currentColor = { r, g, b };
    await this.sendColor(r, g, b);
  }


  /*****************************
   * Random Color Helper
   *****************************/
  async randomColor() {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    await this.setColor(r, g, b);
  }

/*****************************
 * Pulse Effect
 *****************************/
async startPulse(r, g, b, speed = 2000) {
  if (this.isPulsing) this.stopPulse(); // Already pulsing
  this.isPulsing = true;
  this.currentColor = { r, g, b };

  while (this.isPulsing) {
    if (!this.isPulsing) break;
    await this.setColor(r, g, b);
    if (!this.isPulsing) break;
    await new Promise(res => setTimeout(res, speed / 2));
    if (!this.isPulsing) break;

    await this.setColor(r / 3, g / 3, b / 3);
    if (!this.isPulsing) break;
    await new Promise(res => setTimeout(res, speed / 2));
    if (!this.isPulsing) break;
  }
}

/*****************************
 * Stop Pulse Effect
 *****************************/
stopPulse() {
  this.isPulsing = false;
}

}
