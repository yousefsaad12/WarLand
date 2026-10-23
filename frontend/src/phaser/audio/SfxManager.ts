export class SfxManager {
  private ctx: AudioContext | null = null;
  private enabled = true;

  constructor() {
    try {
      const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (Ctor) {
        this.ctx = new Ctor();
      }
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  private ensure() {
    if (!this.enabled || !this.ctx) return null;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.08) {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  private noise(dur: number, gain = 0.06) {
    const ctx = this.ensure();
    if (!ctx) return;
    const bufferSize = ctx.sampleRate * dur;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buffer;
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(g).connect(ctx.destination);
    src.start();
  }

  click() {
    this.tone(520, 0.08, 'triangle', 0.05);
  }

  select() {
    this.tone(680, 0.1, 'sine', 0.05);
  }

  deploy() {
    this.tone(420, 0.14, 'square', 0.05);
    setTimeout(() => this.tone(620, 0.12, 'triangle', 0.04), 40);
  }

  hit() {
    this.noise(0.12, 0.05);
    this.tone(280, 0.1, 'sawtooth', 0.03);
  }

  swing() {
    this.noise(0.08, 0.04);
  }

  death() {
    this.tone(220, 0.18, 'sawtooth', 0.05);
    setTimeout(() => this.tone(160, 0.22, 'sawtooth', 0.04), 60);
  }

  baseHit() {
    this.noise(0.16, 0.07);
    this.tone(180, 0.16, 'sawtooth', 0.05);
  }

  win() {
    this.tone(523, 0.16, 'sine', 0.06);
    setTimeout(() => this.tone(659, 0.16, 'sine', 0.06), 80);
    setTimeout(() => this.tone(784, 0.22, 'sine', 0.07), 160);
  }

  lose() {
    this.tone(392, 0.18, 'sawtooth', 0.05);
    setTimeout(() => this.tone(294, 0.22, 'sawtooth', 0.05), 90);
  }
}

export const sfx = new SfxManager();
