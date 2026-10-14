import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? 'http://localhost:4000';

export interface LivePoint { lat: number; lng: number; at: number }

/** Subscribe to a job's live location channel (participant-authorized on the server). */
export function useJobLocation(jobId: string, userId: string) {
  const [point, setPoint] = useState<LivePoint | null>(null);
  const [stale, setStale] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(WS_URL, { transports: ['websocket'] });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('subscribe', { jobId, userId }));
    socket.on('location', (msg: { point: LivePoint }) => {
      setPoint(msg.point ?? (msg as unknown as LivePoint));
      setStale(false);
    });
    // Mark stale if no update within 8s (matches server MAX_LOCATION_AGE_MS).
    const timer = setInterval(() => setStale(true), 8000);
    return () => { clearInterval(timer); socket.disconnect(); };
  }, [jobId, userId]);

  return { point, stale };
}

/** Rider side: publish location. Fans out to EVERY delivery the rider is currently on (so a stacked
 *  second customer also sees them move), and keeps the per-job emit so an older backend still works
 *  during the deploy window. The backend throttles, so the overlap on the current job is harmless. */
export function createRiderPublisher(jobId: string, riderId: string) {
  const socket = io(WS_URL, { transports: ['websocket'] });
  return {
    publish: (lat: number, lng: number) => {
      socket.emit('locationAll', { riderId, lat, lng });     // new: fans out to all the rider's active jobs
      socket.emit('location', { jobId, riderId, lat, lng }); // compat: current job on older backends
    },
    close: () => socket.disconnect(),
  };
}
