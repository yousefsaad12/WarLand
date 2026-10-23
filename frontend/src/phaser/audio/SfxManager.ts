export class SfxManager {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private lastPlayed = new Map<string, number>();

  constructor() {
    try {
      const Ctor =
        (window as any).AudioContext || (window as any).webkitAudioContext;
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

  private ready(key: string, cooldownMs: number) {
    const now = performance.now();
    const previous = this.lastPlayed.get(key) ?? -Infinity;
    if (now - previous < cooldownMs) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType = 'sine',
    gain = 0.08,
  ) {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      freq * 0.6,
      ctx.currentTime + dur,
    );
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

  deploy(cardId = 'unit') {
    if (!this.ready('deploy', 55)) return;
    const roots: Record<string, number> = {
      knight: 300,
      archer: 440,
      guard: 220,
      scout: 560,
      unit: 380,
    };
    const root = roots[cardId] ?? roots.unit;
    this.tone(root, 0.14, 'square', 0.05);
    setTimeout(() => this.tone(root * 1.5, 0.12, 'triangle', 0.04), 40);
  }

  hit(damage = 1) {
    if (!this.ready('hit', 35)) return;
    const pitch = Math.max(190, Math.min(360, 250 + damage * 3));
    this.noise(0.1, Math.min(0.07, 0.035 + damage * 0.0015));
    this.tone(pitch, 0.1, 'sawtooth', 0.03);
  }

  swing() {
    if (!this.ready('swing', 45)) return;
    this.noise(0.08, 0.04);
  }

  death(cardId = 'unit') {
    if (!this.ready(`death:${cardId}`, 70)) return;
    const roots: Record<string, number> = {
      knight: 180,
      guard: 140,
      archer: 240,
      scout: 280,
      unit: 200,
    };
    const root = roots[cardId] ?? roots.unit;
    this.tone(root, 0.18, 'sawtooth', 0.05);
    setTimeout(() => this.tone(root * 0.72, 0.22, 'sawtooth', 0.04), 60);
  }

  baseHit() {
    if (!this.ready('base-hit', 80)) return;
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
