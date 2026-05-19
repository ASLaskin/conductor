import {
  AudioPlayer,
  createAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";

let done: AudioPlayer | null = null;
let alert: AudioPlayer | null = null;
let initialized = false;

export async function initSounds(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // play even on silent mode. dont stop background music.
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: "mixWithOthers",
    });
  } catch {}

  done = createAudioPlayer(require("../assets/sounds/done.wav"));
  alert = createAudioPlayer(require("../assets/sounds/alert.wav"));
}

function play(p: AudioPlayer | null): void {
  if (!p) return;
  try {
    p.seekTo(0);
    p.play();
  } catch {}
}

export function playDone(): void {
  play(done);
}

export function playAlert(): void {
  play(alert);
}
