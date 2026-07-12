/**
 * Google Places (Web Service REST) client for the mobile app — the native equivalent of the web's
 * Google Places Autocomplete widget. React Native fetch is not subject to browser CORS, so we call
 * the REST endpoints directly. Requires EXPO_PUBLIC_GOOGLE_MAPS_API_KEY with Places API + Geocoding
 * API enabled (the key must NOT be locked to HTTP referrers, or mobile calls are rejected).
 */
const KEY = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '').trim();
const BASE = 'https://maps.googleapis.com/maps/api';

export interface Prediction { placeId: string; description: string; primary: string; secondary: string }
export interface ResolvedPlace { lat: number; lng: number; label: string; area: string }

export function placesConfigured(): boolean {
  return KEY.length > 0;
}

/** A session token groups autocomplete keystrokes + the final details call for correct billing. */
export function newSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

interface RawComponent { long_name: string; types: string[] }

/** Neighbourhood/locality from Google's structured components (reliable, unlike string parsing). */
function localityOf(components: RawComponent[]): string {
  const byType = (type: string) => components.find((c) => c.types.includes(type))?.long_name;
  return (
    byType('neighborhood') || byType('sublocality_level_1') || byType('sublocality') ||
    byType('locality') || byType('administrative_area_level_2') || ''
  );
}

/** Autocomplete predictions for a typed query, restricted to Nigeria. */
export async function autocomplete(input: string, sessionToken: string): Promise<Prediction[]> {
  if (!KEY) { console.warn('[places] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is empty — Google autocomplete is off'); return []; }
  if (input.trim().length < 2) return [];
  const url =
    `${BASE}/place/autocomplete/json?input=${encodeURIComponent(input)}` +
    `&key=${KEY}&components=country:ng&language=en&sessiontoken=${sessionToken}`;
  const res = await fetch(url);
  const json = (await res.json()) as {
    status: string; error_message?: string;
    predictions?: { place_id: string; description: string; structured_formatting?: { main_text: string; secondary_text: string } }[];
  };
  if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
    console.warn('[places] autocomplete failed:', json.status, json.error_message);
    throw new Error(`${json.status}: ${json.error_message ?? 'Address lookup failed'}`);
  }
  return (json.predictions ?? []).map((p) => ({
    placeId: p.place_id,
    description: p.description,
    primary: p.structured_formatting?.main_text ?? p.description,
    secondary: p.structured_formatting?.secondary_text ?? '',
  }));
}

/** Resolve a chosen prediction to coordinates + a locality label. */
export async function details(placeId: string, sessionToken: string): Promise<ResolvedPlace> {
  const url =
    `${BASE}/place/details/json?place_id=${placeId}` +
    `&fields=geometry,formatted_address,name,address_components&key=${KEY}&sessiontoken=${sessionToken}`;
  const res = await fetch(url);
  const json = (await res.json()) as {
    status: string;
    result?: { geometry?: { location?: { lat: number; lng: number } }; formatted_address?: string; name?: string; address_components?: RawComponent[] };
  };
  const loc = json.result?.geometry?.location;
  if (json.status !== 'OK' || !loc) throw new Error('Could not resolve that address');
  return {
    lat: loc.lat, lng: loc.lng,
    label: json.result?.formatted_address ?? json.result?.name ?? '',
    area: localityOf(json.result?.address_components ?? []),
  };
}

/** Reverse-geocode a GPS fix (for "use my location") into a formatted address + locality. */
export async function reverseGeocode(lat: number, lng: number): Promise<ResolvedPlace> {
  if (!KEY) return { lat, lng, label: 'Current location', area: '' };
  const res = await fetch(`${BASE}/geocode/json?latlng=${lat},${lng}&key=${KEY}&language=en`);
  const json = (await res.json()) as {
    status: string;
    results?: { formatted_address?: string; address_components?: RawComponent[] }[];
  };
  const first = json.results?.[0];
  return {
    lat, lng,
    label: first?.formatted_address ?? 'Current location',
    area: localityOf(first?.address_components ?? []),
  };
}
