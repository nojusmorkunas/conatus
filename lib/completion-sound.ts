export const COMPLETION_SOUND_EVENT = "completion-sound-change";

// Synthesized rather than shipped as a file: two ramps are smaller than any
// sample, need no licence, and can be retuned by editing the numbers below.
// Swap in an <audio> element if a recorded pop is ever preferred.
let context: AudioContext | null = null;

export function completionSoundEnabled() {
  try {
    return localStorage.getItem("completion-sound") !== "off";
  } catch {
    return false;
  }
}

export function setCompletionSoundEnabled(enabled: boolean) {
  localStorage.setItem("completion-sound", enabled ? "on" : "off");
  window.dispatchEvent(new Event(COMPLETION_SOUND_EVENT));
}

export function playCompletionSound() {
  if (typeof window === "undefined" || !completionSoundEnabled()) return;

  try {
    context ??= new AudioContext();
    // Completing a task is itself the user gesture that unlocks audio, but a
    // context created on an earlier page can come back suspended.
    if (context.state === "suspended") void context.resume();

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    // Rising pitch with a fast decay: the bubble swells, then pops.
    oscillator.frequency.setValueAtTime(420, now);
    oscillator.frequency.exponentialRampToValueAtTime(940, now + 0.11);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
  } catch {
    // A missing or blocked audio device must never stop a task completing.
  }
}
