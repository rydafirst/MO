import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as Location from 'expo-location';
import { autocomplete, details, newSessionToken, placesConfigured, reverseGeocode, type Prediction } from '../lib/google-places';
import { Card, Input, Mono, PressableScale, useToast } from '../ui';
import { t } from '../theme';

export interface Place { lat: number; lng: number; label: string; area: string }

/**
 * Address card matching the web AddressInput: labelled card, a "USE MY LOCATION" chip, a search
 * field, and a live Google Places autocomplete dropdown. Falls back to the on-device geocoder only
 * if no Google key is configured.
 */
export function AddressField({ label, placeholder, onSelect, onFocus, autoLocate }: {
  label: string; placeholder?: string; onSelect: (p: Place | null) => void; onFocus?: () => void;
  autoLocate?: number; // bump to trigger "use my location" from a parent prompt
}) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [busy, setBusy] = useState(false);
  const session = useRef(newSessionToken());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chosen = useRef(false); // suppress the autocomplete fetch triggered by selecting a result

  // Debounced autocomplete as the user types.
  useEffect(() => {
    if (!placesConfigured() || chosen.current) { chosen.current = false; return; }
    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length < 2) { setPreds([]); return; }
    timer.current = setTimeout(async () => {
      try { setPreds(await autocomplete(text, session.current)); }
      catch (e) { console.warn('[AddressField]', (e as Error).message); toast((e as Error).message); }
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [text]);

  const pick = async (p: Prediction) => {
    chosen.current = true;
    setText(p.description);
    setPreds([]);
    setBusy(true);
    try {
      const r = await details(p.placeId, session.current);
      session.current = newSessionToken(); // end the billing session
      onSelect({ lat: r.lat, lng: r.lng, label: r.label, area: r.area });
    } catch (e) { toast((e as Error).message); onSelect(null); } finally { setBusy(false); }
  };

  // Fallback path when no Google key is configured: on-device geocoding of the typed text.
  const submitFallback = async () => {
    if (placesConfigured() || !text.trim()) return;
    setBusy(true);
    try {
      const res = await Location.geocodeAsync(text.trim());
      if (!res.length) { toast('Could not find that address'); onSelect(null); return; }
      const { latitude: lat, longitude: lng } = res[0];
      let area = '';
      try { const g = (await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }))[0]; area = [g?.city || g?.district, g?.region].filter(Boolean).join(', '); } catch { /* best effort */ }
      onSelect({ lat, lng, label: text.trim(), area });
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  const useMyLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { toast('Location permission needed'); return; }
    setBusy(true);
    try {
      const loc = await Location.getCurrentPositionAsync({});
      chosen.current = true;
      if (placesConfigured()) {
        const r = await reverseGeocode(loc.coords.latitude, loc.coords.longitude);
        setText(r.label); setPreds([]);
        onSelect({ lat: r.lat, lng: r.lng, label: r.label, area: r.area });
      } else {
        const g = (await Location.reverseGeocodeAsync(loc.coords))[0];
        const lbl = [g?.name || g?.street, g?.city || g?.district, g?.region].filter(Boolean).join(', ') || 'Current location';
        setText(lbl);
        onSelect({ lat: loc.coords.latitude, lng: loc.coords.longitude, label: lbl, area: [g?.city || g?.district, g?.region].filter(Boolean).join(', ') });
      }
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  // Parent-triggered "use my location" (e.g. the Home location prompt). Runs on each bump.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (autoLocate) useMyLocation(); }, [autoLocate]);

  return (
    <Card style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Mono style={{ fontSize: t.size.caption, letterSpacing: 0.7 }}>{label}</Mono>
        <PressableScale onPress={useMyLocation} style={{ borderWidth: 1, borderColor: t.line, borderRadius: t.radius.sm, paddingVertical: 3, paddingHorizontal: 8, backgroundColor: t.bg }}>
          <Mono style={{ color: t.ink, fontSize: t.size.caption }}>USE MY LOCATION</Mono>
        </PressableScale>
      </View>
      <Input
        value={text}
        onChangeText={(v) => { chosen.current = false; setText(v); }}
        onFocus={onFocus}
        onSubmitEditing={submitFallback}
        returnKeyType="search"
        autoCorrect={false}
        placeholder={placeholder ?? (busy ? 'Locating…' : 'Search address…')}
      />
      {preds.length > 0 && (
        <View style={{ borderWidth: 1, borderColor: t.line, borderTopWidth: 0, borderBottomLeftRadius: t.radius.md, borderBottomRightRadius: t.radius.md, overflow: 'hidden' }}>
          {preds.map((p) => (
            <PressableScale key={p.placeId} onPress={() => pick(p)} style={{ paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: t.line2 }}>
              <Text style={{ fontSize: t.size.body, color: t.ink }} numberOfLines={1}>{p.primary}</Text>
              {p.secondary ? <Text style={{ fontSize: t.size.caption, color: t.ink2, marginTop: 1 }} numberOfLines={1}>{p.secondary}</Text> : null}
            </PressableScale>
          ))}
        </View>
      )}
    </Card>
  );
}
