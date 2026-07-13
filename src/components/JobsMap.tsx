import React, { useMemo } from 'react';
import { Platform, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { t } from '../theme';

const WV = WebView as unknown as React.ComponentType<Record<string, unknown>>;

export interface JobPin { id: string; lat: number; lng: number; label: string }

// Keyless Leaflet map showing a price pin per nearby available job (approximate, area-level
// locations from the backend). Purely visual — accepting still happens from the list below.
export function JobsMap({ pins, height = 190 }: { pins: JobPin[]; height?: number }) {
  const html = useMemo(() => {
    const center = pins[0] ? { lat: pins[0].lat, lng: pins[0].lng } : { lat: 6.5244, lng: 3.3792 };
    const markers = pins.map((p) =>
      `L.marker([${p.lat},${p.lng}],{icon:tag(${JSON.stringify(p.label)})}).addTo(map);`).join('');
    const pts = pins.map((p) => `[${p.lat},${p.lng}]`).join(',');
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#m{height:100%;margin:0;background:#FAFAFA}
.tag{background:#ff5a1f;color:#fff;font:700 11px -apple-system,system-ui;padding:3px 8px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.3)}</style></head>
<body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map=L.map('m',{zoomControl:false,attributionControl:false}).setView([${center.lat},${center.lng}],13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:20}).addTo(map);
function tag(txt){return L.divIcon({className:'',html:'<div class=\\'tag\\'>'+txt+'</div>',iconSize:null,iconAnchor:[20,10]});}
${markers}
var pts=[${pts}];
if(pts.length===1){map.setView(pts[0],14);}
else if(pts.length>1){map.fitBounds(pts,{padding:[36,36],maxZoom:15});}
true;
</script></body></html>`;
  }, [pins]);

  if (Platform.OS === 'web') {
    return (
      <View style={{ height, borderRadius: t.radius.md, borderWidth: 1, borderColor: t.line, backgroundColor: t.bg2, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.mid, fontSize: 12 }}>Job map (native only)</Text>
      </View>
    );
  }
  return (
    <View style={{ height, borderRadius: t.radius.md, overflow: 'hidden', borderWidth: 1, borderColor: t.line }}>
      <WV key={pins.map((p) => p.id).join(',')} originWhitelist={['*']} source={{ html }} scrollEnabled={false} style={{ flex: 1 }} />
    </View>
  );
}
