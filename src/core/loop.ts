export class FixedLoop {
  private accumulator = 0;
  private overloadMs = 0;
  overloaded = false;
  get shouldPause() { return this.overloadMs >= 2000; }
  get alpha() { return this.accumulator / (1000 / 60); }
  reset() { this.accumulator = 0; this.overloaded = false; this.overloadMs = 0; }
  advance(deltaMs: number, update: () => unknown) {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) return 0;
    this.accumulator += deltaMs;
    const dt = 1000 / 60;
    let steps = 0;
    while (this.accumulator + 1e-7 >= dt && steps < 5) {
      const keepGoing = update(); steps++;
      if (keepGoing === false) { this.reset(); return steps; }
      this.accumulator = Math.max(0, this.accumulator - dt);
    }
    this.overloaded = this.accumulator + 1e-7 >= dt;
    // A single long stall cannot trigger the sustained-overload warning.
    this.overloadMs = this.overloaded ? this.overloadMs + Math.min(deltaMs, 250) : 0;
    if (this.overloaded) this.accumulator = 0;
    return steps;
  }
}
