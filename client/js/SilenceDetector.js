export class SilenceDetector {
  constructor(silenceDurationMs = 5000, threshold = 0.3) {
    this.silenceDurationMs = silenceDurationMs;
    this.frameDurationMs = 80;
    this.threshold = threshold;
    this.buffer = [];
    this.maxFrames = parseInt(this.silenceDurationMs / this.frameDurationMs);
  }

  addValue(score) {
    this.buffer.push(score);
    if (this.buffer.length > this.maxFrames) {
      this.buffer.shift();
    }
  }

  isSilent() {
    if (this.buffer.length < this.maxFrames) {
    return false;
    }
    return this.getAvg() < this.threshold;
  }

  getAvg() {
    let val = 0;
    this.buffer.forEach(score => {
      val += score;
    })
    val /= this.buffer.length;
    return val;
  }
}
