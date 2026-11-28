import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { act, advance, encode, newFarm, restore, SAVE_KEY, type Action, type Farm } from "./farm";

interface Session {
  action: (a: Action) => Farm | undefined;
  pause: (p: boolean) => void;
}
export function useFarm(paused: boolean) {
  const [farm, setFarm] = useState(newFarm);
  const [away, setAway] = useState(0);
  const [status, setStatus] = useState<"opening" | "ready" | "visitor" | "temporary">("opening");
  const session = useRef<Session | null>(null);
  const initiallyPaused = useEffectEvent(() => paused);
  useLayoutEffect(() => {
    session.current?.pause(paused);
  }, [paused]);
  useEffect(() => {
    let disposed = false;
    let close: (() => void) | undefined;
    const abort = new AbortController();
    async function own() {
      if (disposed) return;
      let raw: string | null = null,
        writable = true;
      try {
        raw = localStorage.getItem(SAVE_KEY);
      } catch {
        writable = false;
      }
      let clock = Date.now(),
        lastWrite = clock;
      const initial = restore(raw, clock);
      let current = initial.farm,
        stopped = initiallyPaused();
      setFarm(current);
      setAway(initial.away);
      setStatus(writable ? "ready" : "temporary");
      const save = () => {
        try {
          localStorage.setItem(SAVE_KEY, encode(current, clock));
        } catch {
          if (!disposed) setStatus("temporary");
        }
        lastWrite = Date.now();
      };
      function tick() {
        const now = Date.now();
        if (stopped || now < clock) {
          clock = now;
          return;
        }
        const elapsed = Math.floor((now - clock) / 1000);
        if (elapsed > 0) {
          current = advance(current, elapsed);
          clock += elapsed * 1000;
          if (!disposed) setFarm(current);
        }
      }
      const flush = () => {
        tick();
        save();
      };
      session.current = {
        action(a) {
          if (stopped) return;
          tick();
          const next = act(current, a);
          if (next === current) return;
          current = next;
          setFarm(next);
          save();
          return next;
        },
        pause(p) {
          if (stopped !== p) {
            tick();
            stopped = p;
            clock = Date.now();
            save();
          }
        },
      };
      save();
      const id = window.setInterval(() => {
        tick();
        if (Date.now() - lastWrite >= 5000) save();
      }, 500);
      window.addEventListener("pagehide", flush);
      document.addEventListener("visibilitychange", flush);
      await new Promise<void>((resolve) => {
        close = () => {
          window.clearInterval(id);
          flush();
          session.current = null;
          window.removeEventListener("pagehide", flush);
          document.removeEventListener("visibilitychange", flush);
          resolve();
        };
      });
    }
    if (navigator.locks) {
      const waiting = window.setTimeout(() => {
        if (!disposed && !session.current) setStatus("visitor");
      }, 250);
      void navigator.locks.request(SAVE_KEY, { signal: abort.signal }, own).catch((e: unknown) => {
        if (!disposed && !(e instanceof DOMException && e.name === "AbortError")) void own();
      });
      return () => {
        disposed = true;
        window.clearTimeout(waiting);
        abort.abort();
        close?.();
      };
    } else void own();
    return () => {
      disposed = true;
      abort.abort();
      close?.();
    };
  }, []);
  return { farm, away, status, send: (a: Action) => session.current?.action(a) };
}
