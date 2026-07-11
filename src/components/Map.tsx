import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

// Loose alias: react-native-webview's JSX prop types don't line up with this React version's
// overloads; the runtime component is correct, so we render it via a permissive alias.
const WV = WebView as unknown as React.ComponentType<Record<string, unknown>>;

export interface LatLng { lat: number; lng: number }

// Keyless Leaflet + OpenStreetMap (Carto) map inside a WebView — no API key, works in Expo Go.
// Pickup/drop-off are baked into the HTML once; the live rider marker is updated via injectJavaScript
// (no reloads), so tracking stays smooth.
export function Map({ pickup, dropoff, rider, height = 200 }: {
  pickup?: LatLng | null; dropoff?: LatLng | null; rider?: LatLng | null; height?: number;
}) {
  const ref = useRef<WebView | null>(null);
  const center = pickup ?? dropoff ?? { lat: 6.5244, lng: 3.3792 };

  const html = useMemo(() => {
    const mk = (p: LatLng | null | undefined, c: string) =>
      p ? `L.marker([${p.lat},${p.lng}],{icon:dot('${c}')}).addTo(map);` : '';
    const pts: string[] = [];
    if (pickup) pts.push(`[${pickup.lat},${pickup.lng}]`);
    if (dropoff) pts.push(`[${dropoff.lat},${dropoff.lng}]`);
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#m{height:100%;margin:0;background:#FAFAFA}</style></head>
<body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map=L.map('m',{zoomControl:false,attributionControl:false}).setView([${center.lat},${center.lng}],13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:20}).addTo(map);
function dot(c){return L.divIcon({className:'',html:'<div style="width:14px;height:14px;border-radius:50%;background:'+c+';border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15)"></div>',iconSize:[14,14],iconAnchor:[7,7]});}
${mk(pickup, '#111111')}${mk(dropoff, '#111111')}
var pts=[${pts.join(',')}];
if(pts.length>1){L.polyline(pts,{color:'#111',weight:2,opacity:.25,dashArray:'4 6'}).addTo(map);map.fitBounds(pts,{padding:[40,40],maxZoom:15});}
var rd=null,trail=[];
window.setRider=function(lat,lng){var ll=[lat,lng];trail.push(ll);
 if(rd){rd.setLatLng(ll);}else{rd=L.marker(ll,{icon:dot('#ff5a1f')}).addTo(map);}
 if(trail.length>1){if(window._tl){window._tl.setLatLngs(trail);}else{window._tl=L.polyline(trail,{color:'#ff5a1f',weight:3.5,opacity:.9}).addTo(map);}}};
true;
</script></body></html>`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng]);

  useEffect(() => {
    if (rider) ref.current?.injectJavaScript(`window.setRider && window.setRider(${rider.lat},${rider.lng});true;`);
  }, [rider?.lat, rider?.lng]);

  return (
    <View style={{ height, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#DADADA' }}>
      <WV ref={ref} originWhitelist={['*']} source={{ html }} scrollEnabled={false} style={{ flex: 1 }} />
    </View>
  );
}
