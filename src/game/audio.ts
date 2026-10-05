export class GameAudio {
  private context?: AudioContext;
  enabled = true;
  unlock() {
    if (!this.enabled) return;
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
  }
  suspend() { if (this.context?.state === 'running') void this.context.suspend(); }
  play(kind: string) {
    if (!this.enabled || this.context?.state !== 'running') return;
    const ctx = this.context, oscillator = ctx.createOscillator(), gain = ctx.createGain(), now = ctx.currentTime;
    const tones: Record<string, [number, number, number]> = {
      shot: [340, 150, 0.045], hit: [170, 80, 0.06], kill: [360, 90, 0.11],
      hurt: [90, 35, 0.16], dodge: [200, 520, 0.08], cleared: [390, 780, 0.45], blast: [120, 28, 0.28], parry: [620, 980, 0.1], stomp: [140, 35, 0.18],
    };
    const [from, to, duration] = tones[kind] ?? tones.hit;
    oscillator.type = kind === 'shot' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(from, now); oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(kind === 'shot' ? 0.035 : 0.06, now); gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(now + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
}
