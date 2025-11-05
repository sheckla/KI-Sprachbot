/*****************************
 * ===== Simple Cooldown Manager =====
 * keep track of cooldowns for actions
 *  05.11.2025 Daniel Graf
*****************************/
export class Cooldown {
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
