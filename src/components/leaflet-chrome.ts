import { t } from '../theme';

/**
 * Shared chrome for the Leaflet-in-WebView maps.
 *
 * Both maps (`Map` for a single delivery, `JobsMap` for the nearby-jobs pins) previously carried
 * their own copy of the stylesheet, base CSS and colours — which is how one of them ended up with a
 * rider-trail orange that exists nowhere in the design system, and how only one of them got the
 * zoom/pan buttons testers asked for. Defining the chrome once means a change to map styling or
 * controls happens in one place and cannot land on only half the app.
 *
 * These emit HTML/JS strings because the maps are rendered inside a WebView; everything colour- or
 * size-related is interpolated from the design tokens rather than hard-coded.
 */

/** Stylesheet link plus the base + control CSS, tokenised. */
export function leafletHead(): string {
  return `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
html,body,#m{height:100%;margin:0;background:${t.bg2}}
.rf-ctl{position:absolute;z-index:500;display:flex;gap:6px}
.rf-zoom{right:8px;bottom:8px;flex-direction:column}
.rf-pan{left:8px;bottom:8px;flex-direction:column;align-items:center}
.rf-pan-row{display:flex;gap:6px}
.rf-b{width:34px;height:34px;border:1px solid ${t.line};border-radius:${t.radius.md}px;background:${t.bg};
 color:${t.ink};font:600 17px/1 monospace;display:flex;align-items:center;justify-content:center;
 -webkit-user-select:none;user-select:none;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.rf-b:active{background:${t.line2}}
</style>`;
}

/** The Carto light basemap layer — keyless, so no API key ever ships in the app. */
export function leafletTileLayer(): string {
  return `L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:20}).addTo(map);`;
}

/**
 * Zoom + pan buttons.
 *
 * Pinch and drag already work; the buttons exist because a rider one-handed at a junction, or
 * wearing gloves, cannot reliably pinch-zoom. Returns '' when disabled so callers can inline it.
 */
export function leafletControls(enabled = true): string {
  if (!enabled) return '';
  return `
(function(){
 function btn(label,fn){var b=document.createElement('div');b.className='rf-b';b.textContent=label;
  b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();fn();});return b;}
 var PAN=80;
 var z=document.createElement('div');z.className='rf-ctl rf-zoom';
 z.appendChild(btn('+',function(){map.zoomIn();}));
 z.appendChild(btn('\\u2212',function(){map.zoomOut();}));
 var p=document.createElement('div');p.className='rf-ctl rf-pan';
 p.appendChild(btn('\\u2191',function(){map.panBy([0,-PAN]);}));
 var row=document.createElement('div');row.className='rf-pan-row';
 row.appendChild(btn('\\u2190',function(){map.panBy([-PAN,0]);}));
 row.appendChild(btn('\\u2192',function(){map.panBy([PAN,0]);}));
 p.appendChild(row);
 p.appendChild(btn('\\u2193',function(){map.panBy([0,PAN]);}));
 document.body.appendChild(z);document.body.appendChild(p);
})();`;
}
