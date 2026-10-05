export class RenderTiming {
  fps = 0;
  private schedule = 0;
  private sampleStart = 0;
  private frames = 0;
  reset(now: number) { this.schedule = this.sampleStart = now; this.frames = this.fps = 0; }
  due(now: number, limit: number) {
    if (!limit) { this.schedule = now; return true; }
    const interval = 1000 / limit, elapsed = now - this.schedule;
    if (elapsed + 1e-7 < interval) return false;
    // Preserve the fractional remainder on displays whose refresh rate is not a multiple of the limit.
    this.schedule += Math.floor((elapsed + 1e-7) / interval) * interval;
    return true;
  }
  rendered(now: number) {
    this.frames++;
    const elapsed = now - this.sampleStart;
    if (elapsed + 1e-7 >= 500) {
      this.fps = Math.round(this.frames * 1000 / elapsed);
      this.sampleStart = now; this.frames = 0;
    }
  }
}
