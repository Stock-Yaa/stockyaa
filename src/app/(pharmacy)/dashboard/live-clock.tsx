"use client";

import { useEffect, useState } from "react";
import { useFormat } from "@/components/pharmacy-context";
import { now } from "@/lib/time";

/**
 * The pharmacy's current date and time, ticking every few seconds. Starts
 * from the server's time so the first render matches the HTML.
 */
export function LiveClock({ initial }: { initial: string }) {
  const f = useFormat();
  const [time, setTime] = useState(initial);

  useEffect(() => {
    const timer = setInterval(() => setTime(now().toISOString()), 10_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <time dateTime={time} suppressHydrationWarning className="tabular-nums">
      {f.dateTime(time)}
    </time>
  );
}
