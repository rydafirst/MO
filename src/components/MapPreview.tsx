import { View } from 'react-native';
import { Map, type LatLng } from './Map';
import { useRoute } from '../lib/routing';

/**
 * Static map preview for the booking screen — mirrors the web MapPreview (which has a 12px gap below
 * it before the pickup card). Shows the pickup (green) and drop-off pins, and once both are chosen,
 * the road-following route with a distance/ETA summary so the customer sees the trip before booking.
 */
export function MapPreview({ pickup, dropoff }: { pickup?: LatLng | null; dropoff?: LatLng | null }) {
  const route = useRoute(pickup, dropoff);
  return (
    <View style={{ marginBottom: 12 }}>
      <Map
        pickup={pickup ?? null}
        dropoff={dropoff ?? null}
        route={route?.points ?? null}
        distanceMeters={route?.distanceMeters}
        durationSeconds={route?.durationSeconds}
        height={180}
      />
    </View>
  );
}
