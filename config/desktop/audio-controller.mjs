/** One on-demand audio element, with cancellation guards for rapid point switching. */
export class AudioController {
  constructor({ audio, beforePlay = () => {}, onChange = () => {}, onHeard = () => {}, onError = () => {} }) {
    Object.assign(this, { audio, beforePlay, onChange, onHeard, onError });
    this.clip = null; this.status = 'stopped'; this.generation = 0;
    audio.preload = 'none'; audio.volume = 0.7;
    for (const type of ['timeupdate', 'durationchange', 'loadedmetadata']) audio.addEventListener(type, () => this.emit());
    audio.addEventListener('ended', () => {
      if (!audio.ended || this.status !== 'playing') return;
      this.status = 'ended'; this.emit();
    });
    audio.addEventListener('error', () => {
      if (this.clip && audio.error && this.matchesSource()) this.fail(new Error('This audio file could not be read.'));
    });
  }
  matchesSource() { return Boolean(this.clip && this.audio.currentSrc === this.clip.url); }
  emit() {
    this.onChange({ clip: this.clip, status: this.status, currentTime: Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0, duration: Number.isFinite(this.audio.duration) ? this.audio.duration : (this.clip?.duration ?? 5), volume: this.audio.volume });
  }
  select(clip) {
    this.generation++; this.audio.pause(); this.clip = clip; this.status = 'stopped';
    this.audio.src = clip.url; this.audio.load(); this.emit();
  }
  async play(clip = this.clip, { restart = false } = {}) {
    if (!clip) return;
    if (this.clip?.id !== clip.id) this.select(clip);
    const token = ++this.generation;
    if (restart || this.status === 'ended') this.seek(0);
    this.status = 'loading'; this.emit();
    try {
      await this.beforePlay(clip);
      if (token !== this.generation) return;
      await this.audio.play();
      if (token !== this.generation || this.audio.paused || !this.matchesSource()) return;
      this.status = 'playing'; this.onHeard(clip); this.emit();
    } catch (error) { if (token === this.generation) this.fail(error); }
  }
  pause() { this.generation++; this.audio.pause(); this.status = this.clip ? 'paused' : 'stopped'; this.emit(); }
  stop() { this.generation++; this.audio.pause(); this.seek(0); this.status = 'stopped'; this.emit(); }
  toggle() { if (['playing', 'loading'].includes(this.status)) this.pause(); else return this.play(); }
  seek(seconds) {
    const max = Number.isFinite(this.audio.duration) ? this.audio.duration : (this.clip?.duration ?? 5);
    const target = Math.max(0, Math.min(max, seconds));
    try {
      this.audio.currentTime = target;
      if (this.status === 'ended' && target < max) this.status = 'paused';
    } catch { /* Metadata may not be loaded yet. */ }
    this.emit();
  }
  setVolume(value) { this.audio.volume = Math.max(0, Math.min(1, value)); this.emit(); }
  fail(error) { this.generation++; this.audio.pause(); this.status = 'error'; this.emit(); this.onError(error); }
}
