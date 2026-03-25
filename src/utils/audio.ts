export class SoundManager {
  ctx: AudioContext | null = null;

  constructor() {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContext();
    } catch (e) {
      console.error('Web Audio API not supported');
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playSplat() {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300 + Math.random() * 200, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.15);
      
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
      
      osc.start(t);
      osc.stop(t + 0.15);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  playThrow() {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.linearRampToValueAtTime(400, t + 0.1);
      
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.1);
      
      osc.start(t);
      osc.stop(t + 0.1);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  playBoom() {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, t);
      osc.frequency.exponentialRampToValueAtTime(10, t + 0.5);
      
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
      
      osc.start(t);
      osc.stop(t + 0.5);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }
}

export const soundManager = new SoundManager();
