import { useEffect, useState } from 'react';
import { BASE, type GeoPoint } from '../api';
import { getToken } from './session';

/**
 * Road-routing client. Calls the Rydafirst backend's authenticated `/geo/route` proxy — the routing
 * vendor is only ever reached server-side, so no map/routing key ships in the app bundle. Best-effort
 * by design: the map falls back to a straight line, so every failure resolves to `null` rather than
 * throwing.
 */
export interface RoutePath { points: GeoPoint[]; distanceMeters: number; durationSeconds: number }

export async function fetchRoute(origin: GeoPoint, dest: GeoPoint): Promise<RoutePath | null> {
  try {
    const token = await getToken();
    const q = `olat=${origin.lat}&olng=${origin.lng}&dlat=${dest.lat}&dlng=${dest.lng}`;
    const res = await fetch(`${BASE}/geo/route?${q}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return (await res.json()) as RoutePath;
  } catch {
    return null;
  }
}

/**
 * The road route between two points, fetched once per distinct origin→destination pair (keyed on the
 * coordinates, so a moving rider marker never re-triggers it). Returns `null` until it resolves, and
 * stays `null` on failure — callers draw a straight-line fallback in the meantime.
 */
export function useRoute(origin?: GeoPoint | null, dest?: GeoPoint | null): RoutePath | null {
  const [route, setRoute] = useState<RoutePath | null>(null);
  const key = origin && dest ? `${origin.lat},${origin.lng};${dest.lat},${dest.lng}` : '';
  useEffect(() => {
    if (!origin || !dest) { setRoute(null); return; }
    let live = true;
    void fetchRoute(origin, dest).then((r) => { if (live) setRoute(r); });
    return () => { live = false; };
    // Keyed on the coordinate pair only — see doc above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return route;
}
