import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { t } from '../theme';
import type { VehicleTrack } from '../api';
import { leafletControls, leafletHead, leafletTileLayer } from './leaflet-chrome';

// Loose alias: react-native-webview's JSX prop types don't line up with this React version's
// overloads; the runtime component is correct, so we render it via a permissive alias.
const WV = WebView as unknown as React.ComponentType<Record<string, unknown>>;

export interface LatLng { lat: number; lng: number }

/** Emoji marker for the rider by vehicle class — legible at small size, no icon assets to bundle. */
const VEHICLE_GLYPH: Record<VehicleTrack, string> = { BIKE: '🏍️', CAR: '🚗', KEKE: '🛺', BICYCLE: '🚲' };

/** "3.2 km" / "450 m" and "12 min" for the route summary. */
function fmtDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
function fmtDuration(s: number): string {
  const min = Math.max(1, Math.round(s / 60));
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`;
}

/**
 * Keyless Leaflet + OpenStreetMap map inside a WebView (no API key ever ships in the app). Shows a
 * distinct origin (pickup) and destination (drop-off) marker, the live rider as a vehicle badge, and
 * the road-following route when one is supplied — falling back to a light straight line otherwise. The
 * rider marker is moved via injectJavaScript (no reloads) so live tracking stays smooth.
 */
/** #4 MULTI-STOP: an extra drop-off beyond the primary one, with its progress state for map styling. */
export interface MapStop { lat: number; lng: number; label?: string; done?: boolean; current?: boolean }

export function Map({
  pickup, dropoff, rider, route, vehicle, distanceMeters, durationSeconds, height = 220, controls = true, stops,
}: {
  pickup?: LatLng | null;
  dropoff?: LatLng | null;
  rider?: LatLng | null;
  /** Road-following polyline (from useRoute). When absent, a straight dashed line is drawn instead. */
  route?: LatLng[] | null;
  /** Rider's vehicle class, for the moving marker's icon. */
  vehicle?: VehicleTrack | null;
  /** Optional route summary shown as an overlay pill. */
  distanceMeters?: number;
  durationSeconds?: number;
  height?: number;
  /** Zoom + pan buttons. On by default; opt out for small inline previews. */
  controls?: boolean;
  /** #4 MULTI-STOP: extra drop-offs (stop 2..N). Drawn as numbered markers with progressive legs. */
  stops?: MapStop[] | null;
}) {
  const ref = useRef<WebView | null>(null);
  const center = pickup ?? dropoff ?? { lat: 6.5244, lng: 3.3792 };
  const glyph = vehicle ? VEHICLE_GLYPH[vehicle] : '🛵';
  const routeKey = route && route.length > 1 ? `${route.length}:${route[0].lat},${route[0].lng}` : '';
  const stopList = (stops ?? []).filter((s) => s && typeof s.lat === 'number' && typeof s.lng === 'number');
  const stopsKey = stopList.map((s) => `${s.lat},${s.lng},${s.done ? 'd' : s.current ? 'c' : 'p'}`).join('|');

  const html = useMemo(() => {
    const routeJs = route && route.length > 1 ? route.map((p) => `[${p.lat},${p.lng}]`).join(',') : '';
    const stopsJs = stopList
      .map((s, i) => `{ll:[${s.lat},${s.lng}],n:${i + 2},state:'${s.done ? 'done' : s.current ? 'current' : 'pending'}',label:${JSON.stringify(s.label ?? `Stop ${i + 2}`)}}`)
      .join(',');
    const pickupJs = pickup ? `[${pickup.lat},${pickup.lng}]` : 'null';
    const dropoffJs = dropoff ? `[${dropoff.lat},${dropoff.lng}]` : 'null';
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
${leafletHead()}
<style>
.rf-badge{display:flex;align-items:center;justify-content:center;border:3px solid ${t.bg};box-shadow:0 1px 4px rgba(0,0,0,.35)}
.rf-veh{width:34px;height:34px;border-radius:50%;background:${t.bg};border:2px solid ${t.primary};box-shadow:0 1px 5px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1}
</style></head>
<body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map=L.map('m',{zoomControl:false,attributionControl:false}).setView([${center.lat},${center.lng}],13);
${leafletTileLayer()}
function endpoint(bg,inner){return L.divIcon({className:'',html:'<div class="rf-badge" style="width:20px;height:20px;border-radius:50%;background:'+bg+'">'+inner+'</div>',iconSize:[20,20],iconAnchor:[10,10]});}
function veh(g){return L.divIcon({className:'',html:'<div class="rf-veh">'+g+'</div>',iconSize:[34,34],iconAnchor:[17,17]});}
var pickup=${pickupJs},dropoff=${dropoffJs};
var whiteDot='<div style="width:7px;height:7px;border-radius:50%;background:${t.bg}"></div>';
if(pickup){L.marker(pickup,{icon:endpoint('${t.success}','')}).addTo(map).bindTooltip('Pickup',{direction:'top',offset:[0,-10]});}
if(dropoff){L.marker(dropoff,{icon:endpoint('${t.ink}',whiteDot)}).addTo(map).bindTooltip('Drop-off',{direction:'top',offset:[0,-10]});}

var route=[${routeJs}];
var fitPts=[];
if(route.length>1){
  L.polyline(route,{color:'${t.bg}',weight:8,opacity:.9,lineJoin:'round',lineCap:'round'}).addTo(map); // casing
  L.polyline(route,{color:'${t.ink}',weight:4.5,opacity:.95,lineJoin:'round',lineCap:'round'}).addTo(map);
  fitPts=route;
}else{
  if(pickup&&dropoff){L.polyline([pickup,dropoff],{color:'${t.ink}',weight:2,opacity:.3,dashArray:'4 6'}).addTo(map);}
  if(pickup)fitPts.push(pickup); if(dropoff)fitPts.push(dropoff);
}
// #4 MULTI-STOP: numbered markers for the extra drop-offs, with legs that read as progress —
// done = faded thin, current = bold with a ring, still-pending = thin dashed.
var stops=[${stopsJs}];
if(stops.length){
  var prev = dropoff || pickup;
  stops.forEach(function(s){
    var w = s.state==='current' ? 4 : (s.state==='done' ? 2 : 1.6);
    var op = s.state==='pending' ? .45 : (s.state==='done' ? .5 : .9);
    var dash = s.state==='pending' ? '4 6' : null;
    if(prev){ L.polyline([prev,s.ll],{color:'${t.ink}',weight:w,opacity:op,dashArray:dash,lineJoin:'round',lineCap:'round'}).addTo(map); }
    var bg = s.state==='done' ? '${t.success}' : (s.state==='current' ? '${t.ink}' : '${t.bg}');
    var fg = s.state==='pending' ? '${t.ink}' : '#fff';
    var ring = s.state==='current' ? 'box-shadow:0 0 0 3px ${t.ink}33,0 1px 5px rgba(0,0,0,.4);' : '';
    var label = s.state==='done' ? '✓' : String(s.n);
    var mk='<div class="rf-badge" style="width:22px;height:22px;border-radius:50%;background:'+bg+';color:'+fg+';font-family:monospace;font-weight:700;font-size:12px;'+ring+'">'+label+'</div>';
    L.marker(s.ll,{icon:L.divIcon({className:'',html:mk,iconSize:[22,22],iconAnchor:[11,11]}),zIndexOffset:500}).addTo(map).bindTooltip(s.label,{direction:'top',offset:[0,-12]});
    fitPts.push(s.ll);
    prev = s.ll;
  });
}
if(fitPts.length>1){map.fitBounds(fitPts,{padding:[46,46],maxZoom:16});}
else if(fitPts.length===1){map.setView(fitPts[0],15);}

var rd=null;
// Just move the vehicle marker — no breadcrumb trail. Connecting every raw GPS fix drew the jagged
// zig-zag from noisy pings; inDrive-style is a clean route + a single moving vehicle marker.
window.setRider=function(lat,lng){var ll=[lat,lng];
 if(rd){rd.setLatLng(ll);}else{rd=L.marker(ll,{icon:veh('${glyph}'),zIndexOffset:1000}).addTo(map);}};
${rider ? `window.setRider(${rider.lat},${rider.lng});` : ''}
${leafletControls(controls)}
true;
</script></body></html>`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng, routeKey, glyph, controls, stopsKey]);

  useEffect(() => {
    // Push live rider moves without reloading the WebView (kept smooth for tracking).
    if (rider) ref.current?.injectJavaScript(`window.setRider && window.setRider(${rider.lat},${rider.lng});true;`);
  }, [rider?.lat, rider?.lng]);

  if (Platform.OS === 'web') {
    return (
      <View style={{ height, borderRadius: t.radius.lg, borderWidth: 1, borderColor: t.line, backgroundColor: t.line2, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.mid, fontSize: t.size.caption }}>Map preview (native only)</Text>
      </View>
    );
  }

  const hasSummary = typeof distanceMeters === 'number' && distanceMeters > 0;
  return (
    <View style={{ height, borderRadius: t.radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: t.line }}>
      <WV ref={ref} originWhitelist={['*']} source={{ html }} scrollEnabled={false} style={{ flex: 1 }} />
      {hasSummary && (
        <View style={{ position: 'absolute', top: 10, left: 10, backgroundColor: t.bg, borderRadius: t.radius.pill, borderWidth: 1, borderColor: t.line, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', gap: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 }}>
          <Text style={{ fontFamily: t.mono, fontSize: t.size.caption, fontWeight: '700', color: t.ink }}>{fmtDistance(distanceMeters!)}</Text>
          {typeof durationSeconds === 'number' && durationSeconds > 0 && (
            <Text style={{ fontFamily: t.mono, fontSize: t.size.caption, color: t.ink2 }}>· {fmtDuration(durationSeconds)}</Text>
          )}
        </View>
      )}
    </View>
  );
}
