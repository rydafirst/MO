export interface LatLng { lat: number; lng: number }

const R = 6_371_000; // earth radius (m)
const rad = (d: number): number => (d * Math.PI) / 180;

/** Great-circle distance in metres between two points (matches the server's haversine). */
export function metersBetween(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}
