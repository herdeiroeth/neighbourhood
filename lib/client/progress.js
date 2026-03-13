import { formatSize, formatSpeed, formatDuration } from '../shared/format.js';

export class ProgressBar {
  constructor(totalBytes) {
    this.totalBytes = totalBytes;
    this.received = 0;
    this.startTime = Date.now();
    this.samples = []; // { time, bytes } for rolling average
    this.lastRender = 0;
  }

  update(chunkSize) {
    this.received += chunkSize;
    const now = Date.now();

    this.samples.push({ time: now, bytes: this.received });
    // Keep last 3 seconds of samples
    const cutoff = now - 3000;
    while (this.samples.length > 1 && this.samples[0].time < cutoff) {
      this.samples.shift();
    }

    // Render at most 4 times per second
    if (now - this.lastRender < 250) return;
    this.lastRender = now;

    this.render();
  }

  render() {
    const cols = process.stderr.columns || 80;
    const pct = this.totalBytes > 0 ? this.received / this.totalBytes : 0;
    const pctStr = `${Math.floor(pct * 100)}%`;

    // Rolling speed
    let speed = 0;
    if (this.samples.length >= 2) {
      const first = this.samples[0];
      const last = this.samples[this.samples.length - 1];
      const dt = (last.time - first.time) / 1000;
      if (dt > 0) speed = (last.bytes - first.bytes) / dt;
    }

    const speedStr = formatSpeed(speed);
    const sizeStr = `${formatSize(this.received)} / ${formatSize(this.totalBytes)}`;
    const eta = speed > 0 ? (this.totalBytes - this.received) / speed : Infinity;
    const etaStr = `ETA: ${formatDuration(eta)}`;

    // Bar
    const info = ` ${pctStr} | ${sizeStr} | ${speedStr} | ${etaStr}`;
    const barWidth = Math.max(10, cols - info.length - 3);
    const filled = Math.floor(barWidth * pct);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);

    process.stderr.write(`\r[${bar}]${info}`);
  }

  finish() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const avgSpeed = elapsed > 0 ? this.received / elapsed : 0;
    process.stderr.write(`\n  Done: ${formatSize(this.received)} in ${formatDuration(elapsed)} (avg ${formatSpeed(avgSpeed)})\n`);
  }
}
