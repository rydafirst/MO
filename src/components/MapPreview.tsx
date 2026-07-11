import { View } from 'react-native';
import { Map, type LatLng } from './Map';

/**
 * Static map preview for the booking screen — mirrors the web MapPreview (which has a 12px gap
 * below it before the pickup card). Shows pickup (dark) and drop-off pins as they're chosen.
 */
export function MapPreview({ pickup, dropoff }: { pickup?: LatLng | null; dropoff?: LatLng | null }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Map pickup={pickup ?? null} dropoff={dropoff ?? null} height={180} />
    </View>
  );
}
