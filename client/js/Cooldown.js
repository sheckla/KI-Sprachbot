class Cooldown {
  constructor(timeoutMs = 1000) {
    this.duration = timeoutMs;
    this.timeStart = null;
  }

  start() {
    this.timeStart = Date.now();
  }

  isExpired() {
    if (!this.timeStart) return false;
    return (Date.now() - this.timeStart) >= this.duration;
  }

  reset() {
    this.timeStart = null;
  }
}
