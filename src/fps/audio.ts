// Small original synthesized cues: no remote files, music, or autoplay.
let context: AudioContext | null = null;
let enabled = true;
export function enableAudio(value: boolean) { enabled = value; }
export function unlockAudio() {
  if (!enabled) return;
  try { context ??= new AudioContext(); void context.resume().catch(() => {}); } catch { /* optional audio */ }
}
export function sound(kind: 'pick' | 'drop' | 'install' | 'bell' | 'step' | 'thunder') {
  if (!enabled || !context || context.state !== 'running') return;
  const now = context.currentTime;
  const notes = kind === 'install' ? [392, 523, 659] : kind === 'bell' ? [440, 660, 880] : [kind === 'step' ? 100 : kind === 'pick' ? 340 : kind === 'drop' ? 125 : 38];
  notes.forEach((frequency, index) => {
    const oscillator = context!.createOscillator();
    const gain = context!.createGain();
    const at = now + index * .09;
    const duration = kind === 'bell' ? 1.8 : kind === 'thunder' ? 2.5 : .16;
    oscillator.type = kind === 'thunder' || kind === 'step' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * .7, at + duration);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(kind === 'step' ? .025 : .09, at + .015);
    gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    oscillator.connect(gain); gain.connect(context!.destination);
    oscillator.start(at); oscillator.stop(at + duration + .02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  });
}
