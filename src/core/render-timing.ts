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

export type GraphicsMode = 'auto' | 'low' | 'high';
export type GraphicsLevel = 0 | 1 | 2 | 3;
export const validGraphicsMode = (value: unknown): value is GraphicsMode =>
  value === 'auto' || value === 'low' || value === 'high';

export class AdaptiveQuality {
  level: GraphicsLevel = 2;
  private mode: GraphicsMode = 'auto';
  private slowSamples = 0;
  private smoothSince: number | null = null;
  private lastSampleAt: number | null = null;
  private lastUpgradeAt: number | null = null;
  private upgradeAfter = 0;
  private recoveryDelay = 30000;

  resetSamples() {
    this.slowSamples = 0; this.smoothSince = this.lastSampleAt = null;
  }

  setMode(mode: GraphicsMode) {
    this.mode = mode;
    this.level = mode === 'low' ? 0 : mode === 'high' ? 3 : 2;
    this.resetSamples(); this.lastUpgradeAt = null;
    this.upgradeAfter = 0; this.recoveryDelay = 30000;
  }

  sample(now: number, fps: number, active: boolean, cap: number): GraphicsLevel {
    if (this.mode !== 'auto' || !active || (cap !== 0 && cap < 60) || !Number.isFinite(now) || !Number.isFinite(fps) || fps <= 0) {
      this.resetSamples();
      return this.level;
    }
    // Samples arrive every 500 ms. Missing three windows cannot prove continuous play.
    if (this.lastSampleAt !== null && (now - this.lastSampleAt > 1500 || now < this.lastSampleAt)) {
      this.resetSamples();
    }
    this.lastSampleAt = now;
    if (fps < 53) {
      this.smoothSince = null;
      if (++this.slowSamples >= 2) {
        if (this.level > 0) {
          // Quickly failed upgrades get progressively fewer retries: 30, 60, then 120 seconds.
          if (this.lastUpgradeAt !== null && now - this.lastUpgradeAt <= 5000) {
            this.recoveryDelay = Math.min(120000, this.recoveryDelay * 2);
          }
          this.level = (this.level - 1) as GraphicsLevel;
          this.upgradeAfter = now + this.recoveryDelay;
          this.lastUpgradeAt = null;
        }
        this.slowSamples = 0;
      }
    } else if (fps >= 58) {
      this.slowSamples = 0;
      if (this.smoothSince === null) this.smoothSince = now;
      if (this.level < 3 && now >= this.upgradeAfter && now - this.smoothSince >= 12000) {
        this.level = (this.level + 1) as GraphicsLevel;
        this.lastUpgradeAt = now;
        this.smoothSince = now;
      }
    } else {
      this.slowSamples = 0; this.smoothSince = null;
    }
    return this.level;
  }
}
