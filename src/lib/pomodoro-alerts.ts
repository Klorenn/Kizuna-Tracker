"use client";

import { useEffect } from "react";

// What the Pomodoro screen does when a block ends: a short sound (Web Audio, no file), a vibration
// and, only when the permission was granted and the page is hidden, a notification. None of it is
// guaranteed with the app closed (the web has no scheduled notifications).

export type NotificationEnv = {
  hasNotification: boolean;
  permission: NotificationPermission | null;
  isIOS: boolean;
  standalone: boolean;
};

/**
 * "Avisarme al terminar" shows only while the permission is undecided, and on iOS only with the
 * installed app (Safari tabs cannot show notifications). Permission is never asked by itself.
 */
export function canOfferNotifications(env: NotificationEnv): boolean {
  if (!env.hasNotification || env.permission !== "default") return false;
  return !env.isIOS || env.standalone;
}

/** Reads the browser; only call it on the client (effects, handlers). */
export function readNotificationEnv(): NotificationEnv {
  const hasNotification = typeof Notification !== "undefined";
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return { hasNotification, permission: hasNotification ? Notification.permission : null, isIOS, standalone };
}

let audio: AudioContext | null = null;

/** Creates (and resumes) the audio context inside a tap, so the beep at the end is allowed to play. */
export function primeAudio(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    // no audio: the vibration and the screen still tell
  }
}

function beep(): void {
  try {
    primeAudio();
    if (!audio) return;
    const ctx = audio;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t0);
    for (const [i, hz] of [660, 880].entries()) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz;
      osc.connect(gain);
      const start = t0 + i * 0.22;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      osc.start(start);
      osc.stop(start + 0.22);
    }
  } catch {
    // ignore
  }
}

export type BlockEnd =
  | { kind: "focus"; habitId: string; habitName: string; minutes: number; lastRound: boolean }
  | { kind: "break"; habitId: string; habitName: string };

/** Sound unless `silent`, vibration, and a notification when granted and the page is hidden. */
export function blockEndAlert(end: BlockEnd, silent: boolean): void {
  if (!silent) beep();
  navigator.vibrate?.([200, 100, 200]);
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || !document.hidden) return;
  const title = end.kind === "focus" ? "Terminó el foco" : "Terminó el descanso";
  const body =
    end.kind === "focus"
      ? `${end.minutes} min de foco en ${end.habitName}.${end.lastRound ? "" : " Toma un descanso."}`
      : "Listo para otra ronda.";
  const options = { body, tag: `pomodoro-${end.habitId}` };
  const fallback = () => {
    try {
      new Notification(title, options);
    } catch {
      // some mobile browsers only allow the service worker route
    }
  };
  if (!("serviceWorker" in navigator)) return fallback();
  navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, options)).catch(fallback);
}

/** Keeps the screen on while `active` (focus or break on screen). No support: nothing happens. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const s = await navigator.wakeLock.request("screen");
        if (cancelled) void s.release();
        else sentinel = s;
      } catch {
        // denied (low battery, background tab): fine
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && (!sentinel || sentinel.released)) void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}
