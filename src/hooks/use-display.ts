"use client";
import { useCallback, useEffect, useState } from "react";
import { MAX_OFFLINE_MS, POLL_MS, snapshotSchema, type DisplayCache } from "@/lib/model";
export type Connection = "loading" | "live" | "reconnecting" | "pairing";
export function useDisplay(screenId: number) {
  const [cache, setCache] = useState<DisplayCache | null>(null);
  const [connection, setConnection] = useState<Connection>("loading");
  const [message, setMessage] = useState("");
  const [generation, setGeneration] = useState(0);
  const [now, setNow] = useState(0);
  const refresh = useCallback(() => setGeneration(value => value + 1), []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    setNow(Date.now());
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const key = `display-cache-v1-${screenId}`;
    let disposed = false, running = false, blocked = false, failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let current: DisplayCache | null = null;
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? "null");
      if (raw && typeof raw.validatedAt === "number" && raw.validatedAt <= Date.now() && Date.now() - raw.validatedAt < MAX_OFFLINE_MS) {
        const snapshot = snapshotSchema.parse(raw.snapshot);
        if (snapshot.screen.id === screenId) current = { snapshot, validatedAt: raw.validatedAt };
      }
    } catch { /* Corrupt or unavailable storage must not prevent a fresh connection. */ }
    setCache(current); setConnection("loading");
    const save = (value: DisplayCache | null) => {
      current = value; setCache(value);
      try { if (value) localStorage.setItem(key, JSON.stringify(value)); else localStorage.removeItem(key); } catch { /* Private browsing can disable storage. */ }
    };
    const schedule = (delay: number) => {
      clearTimeout(timer);
      if (!disposed && !blocked) timer = setTimeout(() => { void poll(); }, delay);
    };
    async function poll() {
      if (disposed || running || blocked) return;
      running = true; controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8000);
      try {
        const revision = current?.snapshot.revision;
        const response = await fetch(`/api/signage/displays/${screenId}${revision ? `?revision=${revision}` : ""}`, {
          cache: "no-store", credentials: "same-origin", signal: controller.signal,
          headers: revision ? { "If-None-Match": `"${screenId}-${revision}"` } : {}
        });
        if (disposed) return;
        if (response.status === 401 || response.status === 403) {
          blocked = true; save(null); setConnection("pairing"); setMessage("Enter a current pairing code from the screen dashboard."); return;
        }
        if (response.status === 304 && current) save({ ...current, validatedAt: Date.now() });
        else {
          if (!response.ok) throw new Error("The server could not be reached.");
          const snapshot = snapshotSchema.parse(await response.json());
          if (disposed) return;
          if (snapshot.screen.id !== screenId) throw new Error("The server returned a different screen.");
          save({ snapshot, validatedAt: Date.now() });
        }
        failures = 0; setConnection("live"); setMessage("");
      } catch {
        if (!disposed) { failures += 1; setConnection("reconnecting"); setMessage("Reconnecting automatically. Cached prices expire after 15 minutes."); }
      } finally {
        clearTimeout(timeout); running = false;
        schedule(failures ? Math.min(60_000, POLL_MS * 2 ** Math.min(failures - 1, 3)) : POLL_MS);
      }
    }
    const online = () => { if (!running && !blocked) schedule(0); };
    const visible = () => { if (document.visibilityState === "visible") online(); };
    window.addEventListener("online", online); document.addEventListener("visibilitychange", visible);
    void poll();
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/display-sw.js", { scope: "/display/" }).then(async () => {
        const registration = await navigator.serviceWorker.ready;
        if (disposed) return;
        const assets = performance.getEntriesByType("resource").map(entry => entry.name).filter(url => {
          try { const parsed = new URL(url); return parsed.origin === location.origin && parsed.pathname.startsWith("/_next/static/"); } catch { return false; }
        });
        registration.active?.postMessage({ type: "CACHE_DISPLAY", path: location.pathname, assets });
      }).catch(() => { /* Normal online display still works. */ });
    }
    return () => {
      disposed = true; clearTimeout(timer); controller?.abort();
      window.removeEventListener("online", online); document.removeEventListener("visibilitychange", visible);
    };
  }, [screenId, generation]);
  const pair = useCallback(async (code: string) => {
    const response = await fetch(`/api/signage/displays/${screenId}/pair`, {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Pairing failed. Please try again.");
    refresh();
  }, [screenId, refresh]);
  return { cache, connection, message, now, refresh, pair };
}
