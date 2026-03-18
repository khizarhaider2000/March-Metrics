"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

type Status = "checking" | "waking" | "ready";

const POLL_INTERVAL = 4000;   // ms between retries while waking
const SLOW_THRESHOLD = 1500;  // ms before we decide to show the banner

export function WarmupBanner() {
  const [status, setStatus] = useState<Status>("checking");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout>  | null>(null);

  function clearTimers() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timerRef.current)    clearTimeout(timerRef.current);
  }

  async function ping(): Promise<boolean> {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      return res.ok;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function check() {
      // If the first ping takes longer than SLOW_THRESHOLD, show the banner
      timerRef.current = setTimeout(() => {
        if (!cancelled) setStatus("waking");
      }, SLOW_THRESHOLD);

      const ok = await ping();
      clearTimeout(timerRef.current!);

      if (cancelled) return;

      if (ok) {
        setStatus("ready");
        return;
      }

      // First ping failed — backend is definitely cold
      setStatus("waking");
      intervalRef.current = setInterval(async () => {
        const up = await ping();
        if (up && !cancelled) {
          setStatus("ready");
          clearTimers();
        }
      }, POLL_INTERVAL);
    }

    check();
    return () => {
      cancelled = true;
      clearTimers();
    };
  }, []);

  if (status !== "waking") return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-950/40 border-b border-amber-900/40 text-xs text-amber-300/90">
      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-amber-400" />
      <span>
        <span className="font-semibold">Backend is waking up</span>
        {" "}— free-tier cold start, usually takes 20–30 seconds. Hang tight.
      </span>
    </div>
  );
}
