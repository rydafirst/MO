import { Map, type LatLng } from './Map';

/**
 * Static map preview for the booking screen — mirrors the web MapPreview.
 * Reuses the keyless Leaflet map; shows pickup (dark) and drop-off pins as they're chosen.
 */
export function MapPreview({ pickup, dropoff }: { pickup?: LatLng | null; dropoff?: LatLng | null }) {
  return <Map pickup={pickup ?? null} dropoff={dropoff ?? null} height={180} />;
}
