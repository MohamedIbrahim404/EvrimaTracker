import { useEffect, useRef, useState } from 'react';
import type { ServerSnapshot } from './types';

type Status = 'connecting' | 'open' | 'closed';

export function useLiveData() {
  const [snapshot, setSnapshot] = useState<ServerSnapshot | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      wsRef.current = ws;
      setStatus('connecting');

      ws.onopen = () => setStatus('open');
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'snapshot') setSnapshot(msg.data as ServerSnapshot);
        } catch { /* ignore malformed */ }
      };
      ws.onclose = () => {
        setStatus('closed');
        if (!stopped) retry = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => { stopped = true; clearTimeout(retry); wsRef.current?.close(); };
  }, []);

  return { snapshot, status };
}
