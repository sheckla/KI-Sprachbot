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
    this.animDuration = 100; // 0.5 s smooth transition
    this.animSteps = 10;
  }

  /*****************************
   * Send RGB Color to Raspberry Pi LED API
   *****************************/
  async sendColor(r, g, b) {
    const url = `${this.baseUrl}/color?r=${r}&g=${g}&b=${b}`;
    console.log("[LEDController] →", url);
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "LED Request failed");
      return data;
    } catch (err) {
      console.error("[LEDController] Fetch Error:", err);
      return { status: "error", message: err.message };
    }
  }

  /*****************************
   * Set Color with Smooth Transition
   *****************************/
  async setColor(r, g, b) {
    this.targetColor = { r, g, b };
    const start = { ...this.currentColor };
    const steps = this.animSteps;
    const delay = this.animDuration / steps;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ir = Math.round(start.r + (r - start.r) * t);
      const ig = Math.round(start.g + (g - start.g) * t);
      const ib = Math.round(start.b + (b - start.b) * t);

      await this.sendColor(ir, ig, ib);
      await new Promise(res => setTimeout(res, delay));
    }

    this.currentColor = { r, g, b };
    console.log(`[LEDController] ✅ Color set to (${r}, ${g}, ${b})`);
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
}
