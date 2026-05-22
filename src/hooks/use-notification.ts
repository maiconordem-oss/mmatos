import { useRef, useCallback } from "react";

export function useNotification() {
  const audioRef = useRef<AudioContext | null>(null);

  const playSound = useCallback(() => {
    try {
      if (!audioRef.current) audioRef.current = new AudioContext();
      const ctx = audioRef.current;
      const playTone = (frequency: number, start: number, duration: number, gain = 0.12) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + start);
        gainNode.gain.setValueAtTime(0.001, ctx.currentTime + start);
        gainNode.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.015);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.start(ctx.currentTime + start);
        oscillator.stop(ctx.currentTime + start + duration + 0.02);
      };
      playTone(880, 0, 0.12);
      playTone(1175, 0.09, 0.18, 0.10);
    } catch {}
  }, []);

  const notify = useCallback((title: string, body: string, onClick?: () => void) => {
    playSound();
    if ("Notification" in window && Notification.permission === "granted") {
      const n = new Notification(title, {
        body, icon: "/favicon.ico", badge: "/favicon.ico",
        tag: "lex-crm-message",
      });
      if (onClick) n.onclick = () => { window.focus(); onClick(); };
      setTimeout(() => n.close(), 6000);
    }
  }, [playSound]);

  const requestPermission = useCallback(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  return { notify, requestPermission };
}
