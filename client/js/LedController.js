export class LEDController {
  constructor(baseUrl = "raspberrypi.local:5000") {
    this.baseUrl = baseUrl;
    this.currentColor = { r: 0, g: 0, b: 0 };
    this.targetColor = { r: 0, g: 0, b: 0 };
    this.animDuration = 500; // 0.5 Sekunden
    this.animSteps = 20;
  }

  async sendColor(r, g, b) {
    const url = `${this.baseUrl}/color?r=${r}&g=${g}&b=${b}`;
    console.log(url);
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Request failed");
      return data;
    } catch (err) {
      console.error("LED-Request-Fehler:", err);
    }
  }

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
  }

  async randomColor() {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    await this.setColor(r, g, b);
  }
}
