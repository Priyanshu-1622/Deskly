/* Small, local soundscape. Audio is created after a player gesture and makes no
   network requests. Short filtered noise layers give actions physical texture. */
(function () {
  class OfficeAudio {
    constructor() { this.context = null; this.volume = 0.65; this.last = new Map(); this.variant = 0; }
    setVolume(value) { this.volume = Math.max(0, Math.min(1, Number(value) || 0)); }
    contextForSound() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || !this.volume) return null;
      try {
        this.context ||= new AC();
        if (this.context.state === 'suspended') this.context.resume().catch(() => {});
        return this.context;
      } catch { return null; }
    }
    noise(ctx, at, duration, options = {}) {
      const rate = ctx.sampleRate, size = Math.max(1, Math.ceil(rate * duration));
      const buffer = ctx.createBuffer(1, size, rate), data = buffer.getChannelData(0);
      let smooth = 0, seed = (Math.random() * 0x7fffffff) | 0;
      for (let i = 0; i < size; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        const white = ((seed >>> 0) / 0x7fffffff) - 1;
        smooth = smooth * 0.82 + white * 0.18;
        data[i] = options.soft ? smooth * 2.3 : white;
      }
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      source.buffer = buffer;
      filter.type = options.high ? 'highpass' : 'lowpass';
      filter.frequency.value = options.cutoff || 1000;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(options.level || 0.1, at + Math.min(0.022, duration * 0.22));
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      source.connect(filter); filter.connect(gain); gain.connect(this.output);
      source.start(at); source.stop(at + duration + 0.01);
    }
    tone(ctx, at, duration, frequency, level, type = 'sine', end = frequency) {
      const source = ctx.createOscillator(), gain = ctx.createGain();
      source.type = type; source.frequency.setValueAtTime(frequency, at);
      source.frequency.exponentialRampToValueAtTime(Math.max(30, end), at + duration);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(level, at + Math.min(0.015, duration * 0.2));
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      source.connect(gain); gain.connect(this.output);
      source.start(at); source.stop(at + duration + 0.01);
    }
    play(name, options = {}) {
      if (!this.volume) return false;
      const now = performance.now(), key = name === 'step' ? `${name}:${options.actor || 'player'}` : name;
      const minimum = name === 'step' ? 110 : name === 'door' ? 700 : 80;
      if (now - (this.last.get(key) ?? -Infinity) < minimum) return false;
      if (options.actor && now - (this.last.get('nearby-steps') ?? -Infinity) < 110) return false;
      const ctx = this.contextForSound(); if (!ctx) return false;
      this.last.set(key, now);
      if (options.actor) this.last.set('nearby-steps', now);
      const out = ctx.createGain(), pan = ctx.createStereoPanner?.();
      out.gain.value = this.volume * (options.gain ?? 1);
      if (pan) { pan.pan.value = Math.max(-1, Math.min(1, options.pan || 0)); out.connect(pan); pan.connect(ctx.destination); }
      else out.connect(ctx.destination);
      this.output = out;
      const t = ctx.currentTime + 0.005, v = (this.variant++ % 5) - 2;
      if (name === 'step') {
        const surface = options.surface || 'carpet', run = !!options.run;
        this.noise(ctx, t, run ? 0.105 : 0.13, { cutoff: surface === 'wood' ? 760 : surface === 'tile' ? 1150 : 420, soft: surface === 'carpet', level: surface === 'carpet' ? 0.085 : 0.13 });
        this.tone(ctx, t, 0.095, 95 + v * 5, 0.045, 'sine', 52);
        if (surface !== 'carpet') this.noise(ctx, t + 0.035, 0.045, { high: true, cutoff: surface === 'wood' ? 1450 : 2500, level: 0.025 });
      } else if (name === 'pour') {
        this.noise(ctx, t, 0.52, { cutoff: options.water ? 2300 : 1350, soft: true, level: 0.12 });
        for (let i = 0; i < 4; i++) this.tone(ctx, t + 0.08 + i * 0.095, 0.065, 350 + i * 42 + v * 12, 0.017, 'sine', 280 + i * 22);
        this.tone(ctx, t + 0.52, 0.07, 820, 0.035, 'sine', 550);
      } else if (name === 'sip') {
        this.noise(ctx, t, 0.28, { cutoff: options.water ? 1700 : 900, soft: true, level: 0.14 });
        this.tone(ctx, t + 0.12, 0.19, options.water ? 420 : 310, 0.018, 'sine', 225);
        this.noise(ctx, t + 0.38, 0.12, { cutoff: 700, soft: true, level: 0.055 });
      } else if (name === 'cup') {
        this.noise(ctx, t, 0.1, { cutoff: 950, level: 0.11 });
        this.tone(ctx, t, 0.14, 450 + v * 12, 0.047, 'sine', 240);
      } else if (name === 'chair') {
        this.noise(ctx, t, 0.34, { cutoff: 480, soft: true, level: 0.13 });
        this.tone(ctx, t + 0.12, 0.23, 155 + v * 5, 0.045, 'triangle', 75);
        this.noise(ctx, t + 0.22, 0.12, { cutoff: 1300, level: 0.045 });
      } else if (name === 'door') {
        this.noise(ctx, t, options.slide ? 0.47 : 0.36, { cutoff: options.slide ? 850 : 510, soft: true, level: 0.105 });
        this.tone(ctx, t + (options.slide ? 0.37 : 0.27), 0.11, options.slide ? 230 : 145, 0.047, 'triangle', 90);
      } else if (name === 'printer') {
        for (let i = 0; i < 3; i++) {
          this.noise(ctx, t + i * 0.18, 0.12, { cutoff: 1350, level: 0.095 });
          this.tone(ctx, t + i * 0.18, 0.10, 115, 0.03, 'sawtooth', 80);
        }
        this.noise(ctx, t + 0.55, 0.24, { high: true, cutoff: 800, level: 0.055 });
      } else if (name === 'paper') {
        this.noise(ctx, t, 0.2, { high: true, cutoff: 750, level: 0.055 });
        this.noise(ctx, t + 0.1, 0.19, { cutoff: 1500, level: 0.065 });
      } else if (name === 'switch') {
        this.noise(ctx, t, 0.045, { high: true, cutoff: 1700, level: 0.14 });
        this.tone(ctx, t, 0.06, 390, 0.03, 'triangle', 160);
      } else if (name === 'lift') {
        this.tone(ctx, t, 0.18, 660, 0.035, 'sine', 660);
        this.tone(ctx, t + 0.16, 0.23, 880, 0.035, 'sine', 880);
      } else if (name === 'ui') {
        this.tone(ctx, t, 0.08, 420, 0.018, 'sine', 560);
      } else return false;
      return true;
    }
  }
  window.DesklyOfficeAudio = OfficeAudio;
})();
