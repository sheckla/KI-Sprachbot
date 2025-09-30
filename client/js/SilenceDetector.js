export class SilenceDetector {
  constructor(silenceDurationMs = 1000, threshold = 0.3) {
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

  // TODO mit avg arbeiten weil wenn 1 frame nicht passt => non-fire
  isSilent() {
    // console.log(this.buffer.length + " " + this.maxFrames)
    if (this.buffer.length < this.maxFrames) {
    return false;
    }
    console.log(this.getAvg() +  "<" +  this.threshold + "=" + (this.getAvg() < this.threshold))
    return this.getAvg() < this.threshold;
    // return this.bWuffer.every(value => value < this.threshold);
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
