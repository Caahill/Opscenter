'use client';
// Live updates (TechSpec 6.2): one Socket.IO connection per tab to the API's /rt namespace. The API
// sends each person their own masked copy of every event; this only decides what to refresh.
import { REALTIME_PATH, type RealtimeEvent } from '@opshub/shared';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';

type Handler = (payload: unknown) => void;
const Ctx = createContext<{ on: (event: RealtimeEvent, h: Handler) => () => void; connected: boolean } | null>(null);

/** `url` is the API origin when the browser reaches it directly (local dev), or '' for this origin. */
export function RealtimeProvider({ url, children }: { url: string; children: ReactNode }) {
  const handlers = useRef(new Map<RealtimeEvent, Set<Handler>>());
  const [connected, setConnected] = useState(false);
  const socket = useRef<Socket | null>(null);

  useEffect(() => {
    const s = io(`${url}/rt`, { path: REALTIME_PATH, transports: ['websocket'], withCredentials: true });
    socket.current = s;
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.onAny((event: RealtimeEvent, payload: unknown) => handlers.current.get(event)?.forEach((h) => h(payload)));
    return () => {
      s.close();
    };
  }, [url]);

  const on = (event: RealtimeEvent, h: Handler) => {
    const set = handlers.current.get(event) ?? new Set();
    set.add(h);
    handlers.current.set(event, set);
    return () => set.delete(h);
  };
  return <Ctx.Provider value={{ on, connected }}>{children}</Ctx.Provider>;
}

export function useRealtime(event: RealtimeEvent, handler: Handler) {
  const ctx = useContext(Ctx);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => ctx?.on(event, (p) => latest.current(p)), [ctx, event]);
}

export const useRealtimeConnected = () => useContext(Ctx)?.connected ?? false;

/** Refreshes server components when any of these events arrives (debounced). */
export function LiveRefresh({ events, filter }: { events: RealtimeEvent[]; filter?: (payload: unknown) => boolean }) {
  const router = useRouter();
  const ctx = useContext(Ctx);
  const keep = useRef(filter);
  keep.current = filter;
  const key = events.join(',');
  useEffect(() => {
    if (!ctx) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = (payload: unknown) => {
      if (keep.current && !keep.current(payload)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };
    const offs = key.split(',').map((e) => ctx.on(e as RealtimeEvent, refresh));
    return () => {
      offs.forEach((off) => off());
      if (timer) clearTimeout(timer);
    };
  }, [ctx, key, router]);
  return null;
}
