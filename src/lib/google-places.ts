/**
 * Address search for the mobile app. Calls the Rydafirst backend's authenticated geo proxy
 * (`/places/autocomplete`, `/places/details`, `/geo/reverse`) — the Google Maps key lives ONLY on
 * the server, never in the app bundle, so it can't be extracted and abused. Same exported surface as
 * before, so callers (AddressField) are unchanged.
 */
import { BASE } from '../api';
import { getToken } from './session';

export interface Prediction { placeId: string; description: string; primary: string; secondary: string }
export interface ResolvedPlace { lat: number; lng: number; label: string; area: string }

/** Address search is served by our backend, which is always present — so it's always "configured". */
export function placesConfigured(): boolean {
  return true;
}

/** A session token groups autocomplete keystrokes + the final details call for correct billing. */
export function newSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function get<T>(path: string): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    throw new Error(msg ?? `Address lookup failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/** Autocomplete predictions for a typed query (restricted to Nigeria, server-side). */
export async function autocomplete(input: string, sessionToken: string): Promise<Prediction[]> {
  if (input.trim().length < 2) return [];
  return get<Prediction[]>(
    `/places/autocomplete?input=${encodeURIComponent(input)}&sessiontoken=${encodeURIComponent(sessionToken)}`,
  );
}

/** Resolve a chosen prediction to coordinates + a locality label. */
export async function details(placeId: string, sessionToken: string): Promise<ResolvedPlace> {
  return get<ResolvedPlace>(
    `/places/details?placeId=${encodeURIComponent(placeId)}&sessiontoken=${encodeURIComponent(sessionToken)}`,
  );
}

/** Reverse-geocode a GPS fix (for "use my location") into a formatted address + locality. */
export async function reverseGeocode(lat: number, lng: number): Promise<ResolvedPlace> {
  return get<ResolvedPlace>(`/geo/reverse?lat=${lat}&lng=${lng}`);
}
