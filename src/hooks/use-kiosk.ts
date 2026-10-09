"use client";
import { useEffect, useRef, useState } from "react";
export function useKiosk() {
  const [started, setStarted] = useState(false);
  const [wakeStatus, setWakeStatus] = useState("Not requested");
  const [fullscreenError, setFullscreenError] = useState("");
  const sentinel = useRef<WakeLockSentinel | null>(null);
  const wanted = useRef(false);
  const alive = useRef(true);
  const pending = useRef(false);
  async function acquire() {
    if (!wanted.current || !alive.current || pending.current || sentinel.current || document.visibilityState !== "visible") return;
    if (!("wakeLock" in navigator)) { setWakeStatus("Unsupported. Disable the TV sleep timer in its settings."); return; }
    pending.current = true;
    try {
      const lock = await navigator.wakeLock.request("screen");
      if (!wanted.current || !alive.current) { await lock.release(); return; }
      sentinel.current = lock; setWakeStatus("Keep-awake active");
      lock.addEventListener("release", () => {
        if (sentinel.current === lock) {
          sentinel.current = null;
          if (alive.current) setWakeStatus("Released by the device. Check its power settings.");
        }
      }, { once: true });
    } catch { if (alive.current) setWakeStatus("Not granted. Disable the TV sleep timer in its settings."); }
    finally { pending.current = false; }
  }
  useEffect(() => {
    alive.current = true;
    const visible = () => { if (document.visibilityState === "visible") void acquire(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive.current = false; wanted.current = false;
      document.removeEventListener("visibilitychange", visible);
      void sentinel.current?.release(); sentinel.current = null;
    };
  }, []);
  async function start() {
    wanted.current = true; setStarted(true); setFullscreenError("");
    void acquire();
    if (!document.documentElement.requestFullscreen) {
      setFullscreenError("Use the TV browser's full-screen setting if available."); return;
    }
    try { await document.documentElement.requestFullscreen(); }
    catch { if (alive.current) setFullscreenError("Full screen was not granted. The menu can still be displayed."); }
  }
  async function stop() {
    wanted.current = false;
    if (sentinel.current) await sentinel.current.release().catch(() => undefined);
    sentinel.current = null;
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen().catch(() => undefined);
    if (alive.current) { setStarted(false); setWakeStatus("Not requested"); }
  }
  return { started, wakeStatus, fullscreenError, start, stop };
}
