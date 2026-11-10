/* Nodos Clarity Riverport - interfaz. Depende de core.js (importación CSV), analysis.js (norma) y, opcionalmente, Leaflet. */
(function () {
'use strict';
var R = window.RV, TZ = R.TZ, HOUR = 3600000, NORM = R.NORM, ICA = R.ICA, METRICS = R.METRICS;
var S = { stations: [], err: null, metric: 'pm25_1h', d0: 0, d1: 0, preset: '365', lim: '2018', res: 'day',
          sliderH: null, hidden: {}, tableMode: false, sel: null, token: '', lastView: null };
try { S.token = sessionStorage.getItem('riverport-token') || ''; } catch (e) {}

function $(id) { return document.getElementById(id); }
function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function fmt(v, d) { return v === null || v === undefined || !isFinite(v) ? '–' : v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function pct(v) { return Math.round(v * 100) + ' %'; }
function colorVar(st) { return '--s' + (st._ci % 8 + 1); }
function icaOf(pol, v) { return v === null || v === undefined ? null : ICA[R.icaIdx(pol, v)]; }

/* ---------- datos ---------- */
function apiFetch(path, opts) {
  return fetch(path, opts).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok) throw new Error(j.error || ('Error ' + r.status));
      return j;
    });
  });
}

function loadData() {
  return Promise.all([apiFetch('/api/stations'), apiFetch('/api/readings')]).then(function (res) {
    var by = {}; res[1].stations.forEach(function (s) { by[s.id] = s; });
    S.stations = res[0].stations.map(function (s) {
      var r = by[s.id] || { h0: 0, n: 0, pm25: [], pm10: [], no2: [] };
      s.h0 = r.h0; s.n = r.n; s.pm25 = r.pm25; s.pm10 = r.pm10; s.no2 = r.no2;
      return s;
    });
    S.stations.slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; }).forEach(function (s, i) { s._ci = i; });
    S.err = null;
    var b = bounds(); if (b) { if (!S.d1) applyPreset(S.preset); else clampRange(b); }
  }).catch(function (e) { S.err = e.message; S.stations = []; });
}

function bounds() {
  var lo = Infinity, hi = -Infinity;
  S.stations.forEach(function (s) { if (s.n) { lo = Math.min(lo, R.hourToDay(R.firstH(s))); hi = Math.max(hi, R.hourToDay(R.lastH(s))); } });
  return lo === Infinity ? null : { lo: lo, hi: hi + 1 };
}
function endHour() { var h = -Infinity; S.stations.forEach(function (s) { h = Math.max(h, R.lastH(s)); }); return h; }
function applyPreset(p) {
  var b = bounds(); if (!b) return; S.preset = p; S.d1 = b.hi;
  S.d0 = p === 'all' ? b.lo : Math.max(b.lo, b.hi - (+p));
  S.sliderH = Math.min(endHour(), S.d1 * 24 + TZ - 1);
}
function clampRange(b) { if (S.d1 <= S.d0) applyPreset('365'); }
function sliderBounds() { return { lo: S.d0 * 24 + TZ, hi: S.d1 * 24 + TZ - 1 }; }
function analyses() { return S.stations.map(function (s) { return R.analyze(s, S.d0, S.d1); }); }

/* ---------- piezas de interfaz ---------- */
function metricCard() {
  var opts = Object.keys(METRICS).map(function (k) { return '<option value="' + k + '"' + (k === S.metric ? ' selected' : '') + '>' + METRICS[k].label + '</option>'; }).join('');
  var pol = METRICS[S.metric].pol, cuts = R.CUT[pol];
  var seg = ICA.map(function (c, i) { return '<div><i style="--c:var(' + c.c + ')"></i><span>' + cuts[i] + '</span></div>'; }).join('');
  return '<div class="card"><label class="sr" for="metric" style="position:absolute;left:-9999px">Métrica</label>' +
    '<select id="metric" class="metric">' + opts + '</select><div class="scale" aria-label="Escala del ICA por categoría">' + seg + '</div>' +
    '<p class="note" style="margin:8px 0 0">Colores: categorías del ICA de la Resolución 2254 (límite superior de cada una, µg/m³).</p></div>';
}
function bindMetric(after) {
  $('metric').addEventListener('change', function () { S.metric = this.value; after(); });
}

function periodCard(withSlider) {
  var sb = sliderBounds();
  var h = '<div class="card"><header><h2>Periodo</h2><div class="seg" id="presets" role="group" aria-label="Periodo">' +
    ['365:12 meses', '90:90 días', '30:30 días', 'all:Todo'].map(function (x) { var p = x.split(':'); return '<button data-p="' + p[0] + '" aria-pressed="' + (S.preset === p[0]) + '">' + p[1] + '</button>'; }).join('') + '</div></header>' +
    '<div class="row"><div class="ctl"><label for="dfrom">Desde</label><input type="date" id="dfrom" value="' + R.dayToDate(S.d0) + '"></div>' +
    '<div class="ctl"><label for="dto">Hasta</label><input type="date" id="dto" value="' + R.dayToDate(S.d1 - 1) + '"></div></div>';
  if (withSlider) {
    h += '<div class="ctl" style="margin-top:12px"><label for="slider">Hora seleccionada <b class="num" id="sliderlab">' + R.hourLabel(S.sliderH) + '</b></label>' +
      '<input type="range" id="slider" min="' + sb.lo + '" max="' + sb.hi + '" step="1" value="' + S.sliderH + '"></div>';
  }
  return h + '<p class="note" style="margin:8px 0 0">Hora de Colombia (UTC−5).</p></div>';
}
function bindPeriod(after) {
  $('presets').addEventListener('click', function (e) { var p = e.target.dataset && e.target.dataset.p; if (!p) return; applyPreset(p); after(true); });
  function custom() {
    var a = $('dfrom').value, b = $('dto').value; if (!a || !b) return;
    var d0 = R.dateToDay(a), d1 = R.dateToDay(b) + 1; if (d1 <= d0) return;
    S.d0 = d0; S.d1 = d1; S.preset = 'custom'; S.sliderH = Math.min(endHour(), d1 * 24 + TZ - 1); after(true);
  }
  $('dfrom').addEventListener('change', custom); $('dto').addEventListener('change', custom);
}

function banner() {
  if (S.err) return '<div class="banner err" role="alert"><b>No se pudo leer la base de datos.</b> ' + esc(S.err) + '<br><span class="note">Revisa que Netlify DB esté creada y conectada al sitio (README, paso 3).</span></div>';
  if (!bounds()) return '<div class="banner">Todavía no hay lecturas. Carga los CSV en <a href="#importar">Importar CSV</a> para empezar a alimentar la base.</div>';
  return '';
}

/* ---------- mapa (Leaflet + OpenStreetMap, con respaldo esquemático) ---------- */
var MapV = { map: null, el: null, markers: {} };
function mapDestroy() { if (MapV.map) { MapV.map.remove(); } MapV.map = null; MapV.el = null; MapV.markers = {}; }
function markerHtml(r) {
  return '<div class="mk' + (r.off ? ' off' : '') + (r.st.id === S.sel ? ' sel' : '') + '" style="--c:' + (r.off ? 'var(--nodata)' : r.color) + '">' + esc(r.text) + '</div>';
}
function popupHtml(r) { return '<b>' + esc(r.st.name) + '</b><br>' + esc(r.line || ''); }
function mapRender(el, rows) {
  var withPos = rows.filter(function (r) { return isFinite(r.st.lat) && isFinite(r.st.lon); });
  if (window.L) {
    var fresh = !MapV.map || MapV.el !== el;
    if (fresh) {
      mapDestroy(); el.innerHTML = '';
      MapV.map = L.map(el); MapV.el = el;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(MapV.map);
    }
    withPos.forEach(function (r) {
      var icon = L.divIcon({ className: '', html: markerHtml(r), iconSize: [44, 44], iconAnchor: [22, 22] });
      var m = MapV.markers[r.st.id];
      if (m) { m.setIcon(icon); m.setPopupContent(popupHtml(r)); }
      else {
        m = L.marker([r.st.lat, r.st.lon], { icon: icon, title: r.st.name }).addTo(MapV.map).bindPopup(popupHtml(r));
        m.on('click', function () { pick(r.st.id); });
        MapV.markers[r.st.id] = m;
      }
    });
    if (fresh) {
      var pts = withPos.map(function (r) { return [r.st.lat, r.st.lon]; });
      if (pts.length > 1) MapV.map.fitBounds(pts, { padding: [70, 70], maxZoom: 17 }); else MapV.map.setView(pts[0] || [10.99, -74.766], 16);
    }
    return;
  }
  el.innerHTML = svgMap(withPos) + '<div class="mapnote">Mapa base no disponible (sin conexión a OpenStreetMap). Se muestra un esquema a escala.</div>';
  [].forEach.call(el.querySelectorAll('g[data-id]'), function (g) { g.addEventListener('click', function () { pick(g.dataset.id); }); });
}
function svgMap(rows) {
  var W = 640, H = 480, pad = 80;
  if (!rows.length) return '<div class="empty">Sin coordenadas</div>';
  var la = rows.map(function (r) { return r.st.lat; }), lo = rows.map(function (r) { return r.st.lon; });
  var cLat = (Math.min.apply(0, la) + Math.max.apply(0, la)) / 2, cLon = (Math.min.apply(0, lo) + Math.max.apply(0, lo)) / 2;
  var mLat = 111320, mLon = 111320 * Math.cos(cLat * Math.PI / 180);
  var xs = rows.map(function (r) { return (r.st.lon - cLon) * mLon; }), ys = rows.map(function (r) { return (r.st.lat - cLat) * mLat; });
  var span = Math.max(Math.max.apply(0, xs) - Math.min.apply(0, xs), Math.max.apply(0, ys) - Math.min.apply(0, ys), 200);
  var sc = (Math.min(W, H) - 2 * pad) / span, bar = 100; while (bar * sc > 140) bar /= 2; while (bar * sc < 60) bar *= 2;
  var g = '<svg class="fallback" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa esquemático de los nodos"><rect width="' + W + '" height="' + H + '" fill="var(--soft)"/>';
  for (var i = 1; i < 6; i++) g += '<line x1="' + W * i / 6 + '" y1="0" x2="' + W * i / 6 + '" y2="' + H + '" stroke="var(--line)"/><line x1="0" y1="' + H * i / 6 + '" x2="' + W + '" y2="' + H * i / 6 + '" stroke="var(--line)"/>';
  var placed = [];
  rows.forEach(function (r) {
    var x = W / 2 + (r.st.lon - cLon) * mLon * sc, y = H / 2 - (r.st.lat - cLat) * mLat * sc;
    var tw = r.st.name.length * 7.6, bx = Math.max(6, Math.min(W - tw - 6, x - tw / 2)), ty = y + 42, k = 0, tries = [y + 42, y - 32, y + 60, y - 50];
    for (; k < tries.length; k++) { var box = { a: bx, b: bx + tw, c: tries[k] - 12, d: tries[k] + 4 }; if (!placed.some(function (p) { return box.a < p.b && box.b > p.a && box.c < p.d && box.d > p.c; })) { ty = tries[k]; break; } }
    placed.push({ a: bx, b: bx + tw, c: ty - 12, d: ty + 4 });
    g += '<g data-id="' + esc(r.st.id) + '" style="cursor:pointer"><circle cx="' + x + '" cy="' + y + '" r="22" fill="var(--surface)" stroke="' + (r.off ? 'var(--nodata)' : r.color) + '" stroke-width="' + (r.st.id === S.sel ? 7 : 4) + '"/>' +
      '<text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)" font-family="IBM Plex Mono,monospace">' + esc(r.text) + '</text>' +
      '<text x="' + (bx + tw / 2) + '" y="' + ty + '" text-anchor="middle" font-size="13" font-weight="600" fill="var(--ink)" font-family="IBM Plex Sans,sans-serif">' + esc(r.st.name) + '</text><title>' + esc(r.st.name) + '</title></g>';
  });
  return g + '<line x1="16" y1="' + (H - 20) + '" x2="' + (16 + bar * sc) + '" y2="' + (H - 20) + '" stroke="var(--ink)" stroke-width="2"/><text x="16" y="' + (H - 28) + '" font-size="12" fill="var(--ink2)" font-family="IBM Plex Mono,monospace">' + bar + ' m</text></svg>';
}

function markerRows(valueFn) {
  var pol = METRICS[S.metric].pol;
  return S.stations.map(function (st) {
    var r = valueFn(st), v = r.v, cat = icaOf(pol, v);
    return { st: st, off: v === null, text: v === null ? 'N/A' : fmt(v, 1), color: cat ? 'var(' + cat.c + ')' : 'var(--nodata)',
             line: v === null ? 'Sin dato en las últimas 3 h' : METRICS[S.metric].label.split(' [')[0] + ': ' + fmt(v, 1) + ' µg/m³' + (cat ? ' · ' + cat.n : '') + (r.ago ? ' (lectura de hace ' + r.ago + ' h)' : '') };
  });
}

function pick(id) { S.sel = id; if (S.onPick) S.onPick(); }

/* ---------- vista: datos recientes ---------- */
function viewRecientes(el) {
  var nowH = Math.floor(Date.now() / HOUR), online = function (s) { return s.n && R.lastH(s) >= nowH - 6; };
  function value(s) { return { v: online(s) ? R.valueAt(s, S.metric, R.lastH(s)) : null, ago: 0 }; }
  var on = S.stations.filter(online).length, off = S.stations.length - on;
  var rows = S.stations.map(function (s) {
    if (!online(s)) return '<tr><td><span class="dot" style="--c:var(' + colorVar(s) + ')"></span>' + esc(s.name) + '</td><td colspan="3" class="note">Sin datos recientes' + (s.n ? ' (último: ' + R.hourLabel(R.lastH(s)) + ')' : '') + '</td></tr>';
    var h = R.lastH(s);
    function c(metric, limit, pol) { var v = R.valueAt(s, metric, h); return v === null ? '<td class="r note">–</td>' : '<td class="r"><span class="pill ' + (v > limit ? 'bad' : 'ok') + ' num">' + fmt(v, 1) + '</span></td>'; }
    return '<tr><td><span class="dot" style="--c:var(' + colorVar(s) + ')"></span>' + esc(s.name) + '</td>' + c('pm25_24h', NORM.pm25.d24) + c('pm10_24h', NORM.pm10.d24) + c('no2_1h', NORM.no2.h1) + '</tr>';
  }).join('');
  el.innerHTML = '<div class="pagehead"><h1>Datos recientes</h1><span class="note">Estado de los nodos al abrir la página</span></div>' + banner() +
    '<div class="split"><div class="col">' + metricCard() +
    '<div class="card"><div class="bigcount">' + S.stations.length + '</div><div class="muted">ubicaciones de monitoreo</div>' +
    '<h3 style="margin-top:14px">Últimas mediciones</h3><div class="stack" style="margin-top:6px" aria-hidden="true">' +
    (on ? '<div style="flex:' + on + ';background:var(--accent)">' + Math.round(on / Math.max(1, S.stations.length) * 100) + '%</div>' : '') +
    (off ? '<div style="flex:' + off + ';background:var(--nodata);color:var(--ink)">' + Math.round(off / Math.max(1, S.stations.length) * 100) + '%</div>' : '') + '</div>' +
    '<div style="margin-top:8px"><div class="kvrow"><span><span class="dot" style="--c:var(--accent)"></span>En línea</span><b class="num">' + on + '</b></div>' +
    '<div class="kvrow"><span><span class="dot" style="--c:var(--nodata)"></span>Sin datos en las últimas 6 h</span><b class="num">' + off + '</b></div></div></div>' +
    '<div class="card"><header><h2>Frente a la norma</h2></header><div class="twrap"><table class="t"><thead><tr><th>Nodo</th><th class="r">PM2.5 24 h</th><th class="r">PM10 24 h</th><th class="r">NO2 1 h</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p class="note" style="margin:8px 0 0">Verde: dentro del límite (PM2.5 37, PM10 75, NO2 200 µg/m³). Rojo: lo excede. Detalle por periodo en <a href="#cumplimiento">Cumplimiento</a>.</p></div></div>' +
    '<div class="card mapcard"><div class="mapwrap"><div id="map"></div></div></div></div>';
  bindMetric(function () { viewRecientes(el); });
  S.onPick = null;
  mapRender($('map'), markerRows(value));
}

/* ---------- vista: datos históricos ---------- */
function viewHistorico(el, keepMap) {
  var sb = sliderBounds(), nA = analyses();
  if (S.sliderH < sb.lo || S.sliderH > sb.hi) S.sliderH = sb.hi;
  var pol = METRICS[S.metric].pol;
  function rows() {
    return S.stations.map(function (s, i) {
      var nr = R.valueNear(s, S.metric, S.sliderH, 3), v = nr.v, cat = icaOf(pol, v), a = nA[i][pol];
      return '<tr class="pick' + (s.id === S.sel ? ' on' : '') + '" data-id="' + esc(s.id) + '"><td><input type="checkbox" data-vis="' + esc(s.id) + '" ' + (S.hidden[s.id] ? '' : 'checked') + ' aria-label="Mostrar ' + esc(s.name) + ' en el gráfico"> ' +
        '<span class="dot" style="--c:var(' + colorVar(s) + ')"></span>' + esc(s.name) + '</td>' +
        '<td class="r num">' + (v === null ? 'N/A' : fmt(v, 1)) + (nr.ago ? '<span class="note" title="Lectura de hace ' + nr.ago + ' h"> −' + nr.ago + ' h</span>' : '') + '</td><td>' + (cat ? '<span class="ica" style="--c:var(' + cat.c + ')"><i></i>' + cat.n.split(' ')[0] + '</span>' : '') + '</td>' +
        '<td class="r num">' + pct(a.hourCov) + '</td></tr>';
    }).join('');
  }
  function tableMode() {
    return '<div class="twrap" style="padding:10px"><table class="t"><thead><tr><th>Nodo</th><th class="r">Media periodo</th><th class="r">Máximo</th><th class="r">Horas válidas</th><th>Último dato</th></tr></thead><tbody>' +
      S.stations.map(function (s, i) { var a = nA[i][pol]; return '<tr><td><span class="dot" style="--c:var(' + colorVar(s) + ')"></span>' + esc(s.name) + '</td><td class="r num">' + fmt(a.annualHr, 1) + '</td><td class="r num">' + fmt(a.hmax, 1) + '</td><td class="r num">' + fmt(a.validHours, 0) + '</td><td class="num">' + (s.n ? R.hourLabel(R.lastH(s)) : '–') + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }
  el.innerHTML = '<div class="pagehead"><h1>Datos históricos</h1></div>' + banner() +
    '<div class="split"><div class="col">' + metricCard() + periodCard(true) +
    '<div class="card"><header><h2>Ubicaciones seleccionadas</h2><span class="note">' + S.stations.length + ' nodos</span></header><div class="twrap"><table class="t"><thead><tr><th>Nombre</th><th class="r">Valor</th><th>ICA</th><th class="r">Cobertura</th></tr></thead><tbody id="locrows">' + rows() + '</tbody></table></div></div>' +
    '<div class="card"><header><h2>Serie de tiempo</h2><div class="seg" id="res" role="group" aria-label="Resolución">' +
    '<button data-r="day" aria-pressed="' + (S.res === 'day') + '">Diaria</button><button data-r="hour" aria-pressed="' + (S.res === 'hour') + '">Horaria</button></div></header>' +
    '<div class="canvaswrap"><canvas id="ts" height="280" role="img" aria-label="Serie de tiempo por nodo"></canvas><div class="tip" id="tip1"></div></div><div class="legend" id="tslegend"></div><p class="note" id="tsnote" style="margin:8px 0 0"></p></div>' +
    '</div><div class="card mapcard"><div class="maptools"><span class="note">Valor en la hora seleccionada · borde: categoría del ICA</span><div class="seg" id="mm" role="group" aria-label="Vista"><button data-m="map" aria-pressed="' + !S.tableMode + '">Mapa</button><button data-m="table" aria-pressed="' + S.tableMode + '">Tabla</button></div></div>' +
    '<div class="mapwrap"><div id="map"' + (S.tableMode ? ' hidden' : '') + '></div><div id="tbl"' + (S.tableMode ? '' : ' hidden') + '>' + tableMode() + '</div></div></div></div>';
  mapDestroy();
  bindMetric(function () { viewHistorico(el); });
  bindPeriod(function () { viewHistorico(el); });
  $('res').addEventListener('click', function (e) { var r = e.target.dataset && e.target.dataset.r; if (!r) return; S.res = r; viewHistorico(el); });
  $('mm').addEventListener('click', function (e) { var m = e.target.dataset && e.target.dataset.m; if (!m) return; S.tableMode = m === 'table'; viewHistorico(el); });
  function refresh() {
    $('locrows').innerHTML = rows(); bindRows();
    $('sliderlab').textContent = R.hourLabel(S.sliderH);
    if (!S.tableMode) mapRender($('map'), markerRows(function (s) { return R.valueNear(s, S.metric, S.sliderH, 3); }));
  }
  function bindRows() {
    [].forEach.call($('locrows').querySelectorAll('tr.pick'), function (tr) {
      tr.addEventListener('click', function (e) { if (e.target.tagName === 'INPUT') return; pick(tr.dataset.id); });
    });
    [].forEach.call($('locrows').querySelectorAll('input[data-vis]'), function (cb) {
      cb.addEventListener('change', function () { S.hidden[cb.dataset.vis] = !cb.checked; drawChart(); });
    });
  }
  S.onPick = function () { refresh(); var m = MapV.markers[S.sel]; if (m && MapV.map) { m.openPopup(); } };
  $('slider').addEventListener('input', function () { S.sliderH = +this.value; refresh(); });
  bindRows();
  if (!S.tableMode) mapRender($('map'), markerRows(function (s) { return R.valueNear(s, S.metric, S.sliderH, 3); }));
  function drawChart() { renderTS(nA, pol); }
  drawChart();
}

/* ---------- gráfico de series ---------- */
var tsGeo = null;
function setupCanvas(cv, h) {
  var w = cv.parentNode.clientWidth, dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + 'px';
  var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx: ctx, w: w, h: h };
}
function niceMax(v) { var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p, s = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]; for (var i = 0; i < s.length; i++) if (f <= s[i] + 1e-9) return s[i] * p; return 10 * p; }
function seriesFor(s, an, pol) {
  var pts = [];
  if (S.res === 'day') { var d = an.daily[pol]; for (var i = 0; i < d.length; i++) if (d[i] !== null) pts.push([(S.d0 + i) * 24 + TZ + 12, d[i]]); }
  else { var arr = s[pol], a = S.d0 * 24 + TZ, b = S.d1 * 24 + TZ; for (var h = Math.max(a, s.h0); h < Math.min(b, s.h0 + s.n); h++) { var v = arr[h - s.h0]; if (v !== null) pts.push([h + 0.5, v]); } }
  return pts;
}
function renderTS(nA, pol) {
  var cv = $('ts'); if (!cv) return;
  var g = setupCanvas(cv, 280), ctx = g.ctx, W = g.w, H = g.h, m = { l: 46, r: 14, t: 12, b: 28 };
  var N = NORM[pol], L = S.lim, lines = [];
  if (pol === 'no2') { if (S.res === 'hour') lines.push({ v: N.h1, l: 'Límite 1 h ' + N.h1 }); lines.push({ v: N.annual[L], l: 'Anual ' + N.annual[L], dash: true }); }
  else { lines.push({ v: N.d24, l: 'Límite 24 h ' + N.d24 }); lines.push({ v: N.annual[L], l: 'Anual ' + N.annual[L], dash: true }); }
  var all = S.stations.map(function (s, i) { return S.hidden[s.id] ? [] : seriesFor(s, nA[i], pol); }), vals = [];
  all.forEach(function (p) { p.forEach(function (q) { vals.push(q[1]); }); }); vals.sort(function (a, b) { return a - b; });
  var top = vals.length ? (S.res === 'day' ? vals[vals.length - 1] : vals[Math.floor(vals.length * 0.995)]) : 10;
  var ymax = niceMax(Math.max(Math.max.apply(0, lines.map(function (x) { return x.v; })) * 1.25, top * 1.1));
  var t0 = S.d0 * 24 + TZ, t1 = S.d1 * 24 + TZ;
  var X = function (t) { return m.l + (t - t0) / (t1 - t0) * (W - m.l - m.r); }, Y = function (v) { return m.t + (1 - Math.min(v, ymax) / ymax) * (H - m.t - m.b); };
  var line = css('--line'), ink2 = css('--ink2'), ink = css('--ink');
  ctx.clearRect(0, 0, W, H); ctx.font = '11px IBM Plex Mono, monospace'; ctx.strokeStyle = line; ctx.fillStyle = ink2; ctx.lineWidth = 1; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  var pw = Math.pow(10, Math.floor(Math.log10(ymax))), step = pw; [pw / 5, pw / 2, pw, pw * 2].some(function (c) { if (ymax / c <= 6) { step = c; return true; } return false; });
  for (var y = 0; y <= ymax + 1e-9; y += step) { ctx.beginPath(); ctx.moveTo(m.l, Y(y)); ctx.lineTo(W - m.r, Y(y)); ctx.stroke(); ctx.fillText(fmt(y, step < 1 ? 1 : 0), m.l - 6, Y(y)); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  var days = S.d1 - S.d0, nt = Math.max(2, Math.min(6, Math.floor((W - m.l) / 90)));
  for (var i = 0; i <= nt; i++) { var tt = t0 + (t1 - t0) * i / nt, lab = R.dayToDate(Math.floor((tt - (i === nt ? 1 : 0) - TZ) / 24)).slice(days > 200 ? 0 : 5); ctx.fillStyle = ink2; ctx.fillText(lab, Math.min(Math.max(X(tt), m.l + 20), W - m.r - 20), H - m.b + 8); }
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  lines.forEach(function (ln) { ctx.strokeStyle = ink; ctx.lineWidth = 1.25; ctx.setLineDash(ln.dash ? [2, 4] : [6, 4]); ctx.beginPath(); ctx.moveTo(m.l, Y(ln.v)); ctx.lineTo(W - m.r, Y(ln.v)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = ink; ctx.fillText(ln.l, m.l + 6, Y(ln.v) - 3); });
  var clipped = 0;
  S.stations.forEach(function (s, si) {
    var pts = all[si]; if (!pts.length) return; var col = css(colorVar(s));
    ctx.strokeStyle = col; ctx.lineWidth = S.res === 'day' ? 2 : 1.25; ctx.lineJoin = 'round'; ctx.beginPath(); var prev = null;
    pts.forEach(function (q) { if (q[1] > ymax) clipped++; var gap = S.res === 'day' ? 36 : 6; if (prev === null || q[0] - prev > gap) ctx.moveTo(X(q[0]), Y(q[1])); else ctx.lineTo(X(q[0]), Y(q[1])); prev = q[0]; });
    ctx.stroke();
    if (S.res === 'day' || pts.length < 400) { ctx.fillStyle = col; pts.forEach(function (q) { ctx.beginPath(); ctx.arc(X(q[0]), Y(q[1]), S.res === 'day' ? 2.2 : 1.6, 0, 6.3); ctx.fill(); }); }
  });
  if (all.every(function (p) { return !p.length; })) { ctx.fillStyle = ink2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Sin datos válidos en este periodo', W / 2, H / 2); }
  tsGeo = { m: m, W: W, H: H, t0: t0, t1: t1, all: all };
  $('tslegend').innerHTML = S.stations.map(function (s) { return '<span><span class="sw" style="--c:var(' + colorVar(s) + ')"></span>' + esc(s.name) + '</span>'; }).join('') + '<span>Línea: límite de la norma</span>';
  $('tsnote').textContent = (clipped ? clipped + ' valores por encima del eje se muestran recortados. ' : '') + (S.res === 'day' ? 'Promedio diario con al menos 18 horas válidas.' : 'Promedio horario; el límite de 24 h es solo referencia.');
  cv.setAttribute('aria-label', 'Serie de tiempo de ' + N.name + ' por nodo');
  if (!cv._bound) {
    cv._bound = true;
    cv.addEventListener('mousemove', function (e) {
      var gg = tsGeo, r = cv.getBoundingClientRect(), x = e.clientX - r.left, tip = $('tip1'); if (!gg) return;
      if (x < gg.m.l || x > gg.W - gg.m.r) { tip.style.display = 'none'; return; }
      var t = gg.t0 + (x - gg.m.l) / (gg.W - gg.m.l - gg.m.r) * (gg.t1 - gg.t0), tol = S.res === 'day' ? 18 : 2, h = '', any = false, tx = null;
      S.stations.forEach(function (s, i) {
        var pts = gg.all[i]; if (!pts.length) return; var lo = 0, hi = pts.length - 1;
        while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (pts[mid][0] < t) lo = mid; else hi = mid; }
        var q = Math.abs(pts[lo][0] - t) <= Math.abs(pts[hi][0] - t) ? pts[lo] : pts[hi];
        if (Math.abs(q[0] - t) <= tol) { any = true; tx = tx === null ? q[0] : tx; h += '<div class="r"><span><span class="sw" style="--c:var(' + colorVar(s) + ')"></span>' + esc(s.name) + '</span><b class="num">' + fmt(q[1], 1) + '</b></div>'; }
      });
      if (!any) { tip.style.display = 'none'; return; }
      tip.innerHTML = '<div class="t num">' + (S.res === 'hour' ? R.hourLabel(Math.floor(tx)) : R.dayToDate(Math.floor((tx - TZ) / 24))) + '</div>' + h + '<div class="note">µg/m³</div>';
      tip.style.display = 'block'; tip.style.left = Math.min(Math.max(x + 12, 0), gg.W - tip.offsetWidth) + 'px'; tip.style.top = '8px';
    });
    cv.addEventListener('mouseleave', function () { $('tip1').style.display = 'none'; });
  }
}

/* ---------- vista: cumplimiento de la norma ---------- */
var STATUS = { ok: { cls: 'ok', t: '✓ Cumple' }, bad: { cls: 'bad', t: '✕ Excede' }, warn: { cls: 'warn', t: '! Datos insuficientes' }, warnbad: { cls: 'bad', t: '✕ Excede (indicativo)' }, na: { cls: 'na', t: '– Sin datos' } };
function viewCumplimiento(el) {
  var nA = analyses(), rows = R.evalRows(nA, S.lim), h = '';
  h += '<thead><tr><th class="std">Estándar</th>' + S.stations.map(function (s) { return '<th><span class="sw" style="--c:var(' + colorVar(s) + ')"></span>' + esc(s.name) + '</th>'; }).join('') + '</tr></thead><tbody>';
  rows.forEach(function (r) {
    var lbl = r.t === 'Anual' ? 'Promedio anual' : r.t === '24 horas' ? 'Máximo diario' : 'Máximo horario';
    h += '<tr><th class="std" scope="row">' + r.std + ' · ' + r.t + '<small>Límite ' + r.limit + ' µg/m³ · ' + lbl + (r.t === 'Anual' && S.lim === '2030' ? ' (meta 2030)' : '') + '</small></th>';
    r.cells.forEach(function (c) {
      var st = STATUS[c.status], ratio = c.value === null ? 0 : c.value / r.limit, col = c.status === 'bad' || c.status === 'warnbad' ? 'var(--bad)' : c.status === 'ok' ? 'var(--ok)' : 'var(--na)';
      var sub = r.t === 'Anual' ? fmt(c.n, 0) + ' ' + c.unit + ' válidos' : fmt(c.exc, 0) + ' de ' + fmt(c.n, 0) + ' ' + c.unit + ' sobre el límite';
      h += '<td><div class="cell"><div class="v">' + fmt(c.value, 1) + '<small>µg/m³</small></div><div class="bar2" aria-hidden="true"><i style="width:' + Math.min(100, ratio * 50) + '%;background:' + col + '"></i><u style="left:50%"></u></div><div><span class="pill ' + st.cls + '">' + st.t + '</span></div><div class="note">' + sub + ' · cobertura ' + pct(c.cov) + '</div></div></td>';
    });
    h += '</tr>';
  });
  el.innerHTML = '<div class="pagehead"><h1>Cumplimiento de la norma colombiana</h1><span class="note">Resolución 2254 de 2017 · MinAmbiente</span></div>' + banner() +
    '<div class="card" style="margin-bottom:12px"><div class="row" style="align-items:flex-end"><div class="ctl"><span class="lab">Periodo</span><div class="seg" id="presets">' +
    ['365:12 meses', '90:90 días', '30:30 días', 'all:Todo'].map(function (x) { var p = x.split(':'); return '<button data-p="' + p[0] + '" aria-pressed="' + (S.preset === p[0]) + '">' + p[1] + '</button>'; }).join('') + '</div></div>' +
    '<div class="ctl"><label for="dfrom">Desde</label><input type="date" id="dfrom" value="' + R.dayToDate(S.d0) + '"></div><div class="ctl"><label for="dto">Hasta</label><input type="date" id="dto" value="' + R.dayToDate(S.d1 - 1) + '"></div>' +
    '<div class="ctl"><span class="lab">Límites anuales</span><div class="seg" id="lim"><button data-l="2018" aria-pressed="' + (S.lim === '2018') + '">Vigentes (2018)</button><button data-l="2030" aria-pressed="' + (S.lim === '2030') + '">Meta 2030</button></div></div></div>' +
    '<p class="note" style="margin:10px 0 0">Evaluando del ' + R.dayToDate(S.d0) + ' al ' + R.dayToDate(S.d1 - 1) + ' (' + (S.d1 - S.d0) + ' días). Los límites de 24 h y 1 h no cambian en 2030.</p></div>' +
    '<div class="card"><header><h2>Matriz de cumplimiento</h2><button class="btn" id="copy">Copiar tabla</button></header><div class="twrap"><table class="m">' + h + '</tbody></table></div>' +
    '<p class="note" style="margin:10px 0 0">La barra muestra el valor como porcentaje del límite (la marca vertical es el 100 %). Una evaluación exige al menos 75 % de datos válidos; con menos cobertura el resultado es indicativo.</p></div>' +
    '<div class="card" style="margin-top:12px"><header><h2>Calendario diario de PM2.5 por categoría del ICA</h2><span class="note">Gris: día sin datos válidos suficientes</span></header><div class="canvaswrap"><canvas id="cal" role="img" aria-label="Calendario diario de PM2.5 por nodo"></canvas><div class="tip" id="tip2"></div></div><div class="legend">' +
    ICA.map(function (c) { return '<span class="ica" style="--c:var(' + c.c + ')"><i></i>' + c.n + '</span>'; }).join('') + '<span class="ica" style="--c:var(--nodata)"><i></i>Sin datos válidos</span></div></div>';
  bindPeriod(function () { viewCumplimiento(el); });
  $('lim').addEventListener('click', function (e) { var l = e.target.dataset && e.target.dataset.l; if (!l) return; S.lim = l; viewCumplimiento(el); });
  $('copy').addEventListener('click', function () {
    var btn = this, lines = ['Estándar\tTiempo\tLímite µg/m3\t' + S.stations.map(function (s) { return s.name; }).join('\t')];
    rows.forEach(function (r) { lines.push(r.std + '\t' + r.t + '\t' + r.limit + '\t' + r.cells.map(function (c) { return fmt(c.value, 1) + ' (' + STATUS[c.status].t.replace(/^[^ ]+ /, '') + ', cobertura ' + pct(c.cov) + ')'; }).join('\t')); });
    try { navigator.clipboard.writeText(lines.join('\n')).then(function () { btn.textContent = 'Copiada'; setTimeout(function () { btn.textContent = 'Copiar tabla'; }, 1500); }, function () { btn.textContent = 'No se pudo copiar'; }); } catch (e) { btn.textContent = 'No se pudo copiar'; }
  });
  window.__matrix = rows;
  renderCal(nA);
}
var calGeo = null;
function renderCal(nA) {
  var cv = $('cal'); if (!cv || !S.stations.length) return;
  var D = S.d1 - S.d0, rowH = 26, gap = 6, mL = 120, mT = 20, H = mT + S.stations.length * (rowH + gap) + 22, g = setupCanvas(cv, H), ctx = g.ctx, W = g.w, cw = (W - mL - 8) / D;
  ctx.clearRect(0, 0, W, H); ctx.font = '11px IBM Plex Sans, sans-serif';
  S.stations.forEach(function (s, si) {
    var y = mT + si * (rowH + gap), d = nA[si].daily.pm25; ctx.fillStyle = css('--ink'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    var nm = s.name; if (nm.length > 16) nm = nm.slice(0, 15) + '…'; ctx.fillText(nm, 0, y + rowH / 2);
    for (var i = 0; i < D; i++) { ctx.fillStyle = d[i] === null ? css('--nodata') : css(ICA[R.icaIdx('pm25', d[i])].c); ctx.fillRect(mL + i * cw, y, Math.max(1, cw - (cw > 4 ? 1 : 0)), rowH); }
  });
  ctx.fillStyle = css('--ink2'); ctx.textBaseline = 'top';
  var nt = Math.max(2, Math.min(8, Math.floor((W - mL) / 110)));
  for (var k = 0; k <= nt; k++) { var di = Math.round((D - 1) * k / nt); ctx.textAlign = k === 0 ? 'left' : k === nt ? 'right' : 'center'; ctx.fillText(R.dayToDate(S.d0 + di), mL + di * cw + (k === nt ? cw : k === 0 ? 0 : cw / 2), H - 18); }
  calGeo = { mL: mL, mT: mT, rowH: rowH, gap: gap, cw: cw, D: D, W: W, nA: nA };
  cv.onmousemove = function (e) {
    var gg = calGeo, r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, tip = $('tip2');
    var i = Math.floor((x - gg.mL) / gg.cw), si = Math.floor((y - gg.mT) / (gg.rowH + gg.gap));
    if (i < 0 || i >= gg.D || si < 0 || si >= S.stations.length || y - gg.mT - si * (gg.rowH + gg.gap) > gg.rowH) { tip.style.display = 'none'; return; }
    var v = gg.nA[si].daily.pm25[i], c = v === null ? null : ICA[R.icaIdx('pm25', v)];
    tip.innerHTML = '<div class="t num">' + R.dayToDate(S.d0 + i) + '</div><div>' + esc(S.stations[si].name) + '</div>' + (v === null ? '<div class="note">Sin datos válidos suficientes</div>' : '<div class="r"><span>PM2.5 24 h</span><b class="num">' + fmt(v, 1) + ' µg/m³</b></div><div class="ica" style="--c:var(' + c.c + ')"><i></i>' + c.n + '</div><div class="note">' + (v > NORM.pm25.d24 ? 'Excede' : 'Cumple') + ' el límite de ' + NORM.pm25.d24 + ' µg/m³</div>');
    tip.style.display = 'block'; tip.style.left = Math.min(Math.max(x + 12, 0), gg.W - tip.offsetWidth) + 'px'; tip.style.top = Math.max(0, y - 70) + 'px';
  };
  cv.onmouseleave = function () { $('tip2').style.display = 'none'; };
}

/* ---------- vista: ubicaciones (renombrar) ---------- */
function tokenField() {
  return '<div class="ctl"><label for="token">Token de importación</label><input type="password" id="token" value="' + esc(S.token) + '" autocomplete="off" placeholder="IMPORT_TOKEN de Netlify"></div>';
}
function bindToken() {
  $('token').addEventListener('input', function () { S.token = this.value; try { sessionStorage.setItem('riverport-token', S.token); } catch (e) {} });
}
function viewUbicaciones(el) {
  el.innerHTML = '<div class="pagehead"><h1>Ubicaciones</h1><span class="note">Nombres de campo de cada nodo</span></div>' + banner() +
    '<div class="split"><div class="col"><div class="card"><header><h2>Nodos</h2></header>' + tokenField() + '<div class="twrap" style="margin-top:10px"><table class="t"><thead><tr><th>Nombre</th><th>ID Clarity</th><th>Coordenadas</th><th>Datos</th></tr></thead><tbody>' +
    S.stations.map(function (s) {
      return '<tr class="pick' + (s.id === S.sel ? ' on' : '') + '" data-id="' + esc(s.id) + '"><td><div class="row" style="flex-wrap:nowrap;align-items:center"><span class="dot" style="--c:var(' + colorVar(s) + ')"></span><input type="text" value="' + esc(s.name) + '" data-name="' + esc(s.id) + '" aria-label="Nombre del nodo ' + esc(s.id) + '" style="min-width:120px"><button class="btn" data-save="' + esc(s.id) + '">Guardar</button></div></td>' +
        '<td class="num">' + esc(s.id) + '<div class="note">' + esc(s.datasourceId || '') + '</div></td><td class="num">' + fmt(s.lat, 5) + ', ' + fmt(s.lon, 5) + '</td><td class="num">' + (s.n ? R.hourLabel(R.firstH(s)).slice(0, 10) + ' a ' + R.hourLabel(R.lastH(s)).slice(0, 10) : '–') + '</td></tr>';
    }).join('') + '</tbody></table></div><p class="note" id="usv" style="margin:8px 0 0"></p></div></div>' +
    '<div class="card mapcard"><div class="mapwrap"><div id="map"></div></div></div></div>';
  bindToken(); mapDestroy();
  S.onPick = function () { mapRender($('map'), rowsFor()); [].forEach.call(el.querySelectorAll('tr.pick'), function (tr) { tr.classList.toggle('on', tr.dataset.id === S.sel); }); };
  function rowsFor() { return S.stations.map(function (s) { return { st: s, off: false, text: s.name.slice(0, 3).toUpperCase(), color: 'var(' + colorVar(s) + ')', line: s.id }; }); }
  mapRender($('map'), rowsFor());
  [].forEach.call(el.querySelectorAll('tr.pick'), function (tr) { tr.addEventListener('click', function (e) { if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return; pick(tr.dataset.id); }); });
  [].forEach.call(el.querySelectorAll('button[data-save]'), function (b) {
    b.addEventListener('click', function () {
      var id = b.dataset.save, name = el.querySelector('input[data-name="' + id + '"]').value.trim(), msg = $('usv');
      if (!name) { msg.textContent = 'El nombre no puede estar vacío.'; return; }
      apiFetch('/api/stations?id=' + encodeURIComponent(id), { method: 'PUT', headers: { 'content-type': 'application/json', 'x-import-token': S.token }, body: JSON.stringify({ name: name }) })
        .then(function () { var s = S.stations.filter(function (x) { return x.id === id; })[0]; s.name = name; msg.textContent = 'Nombre guardado.'; }, function (e) { msg.textContent = 'No se pudo guardar: ' + e.message; });
    });
  });
}

/* ---------- vista: control de calidad ---------- */
function viewCalidad(el) {
  var nA = analyses();
  var rows = S.stations.map(function (s, i) {
    var q = s.qc.pm, qn = s.qc.no2, hv = 0; for (var k = 0; k < s.n; k++) if (s.pm25[k] !== null) hv++;
    return '<tr><td><span class="dot" style="--c:var(' + colorVar(s) + ')"></span>' + esc(s.name) + '</td><td>' + esc(s.freq || '–') + '</td><td class="r num">' + fmt(s.rows, 0) + '</td>' +
      '<td class="r num">' + fmt(q.rej, 0) + ' de ' + fmt(q.raw, 0) + ' (' + pct(q.raw ? q.rej / q.raw : 0) + ')</td><td class="r num">' + fmt(qn.rej, 0) + ' de ' + fmt(qn.raw, 0) + '</td>' +
      '<td class="r num">' + fmt(hv, 0) + ' de ' + fmt(s.n, 0) + '</td><td class="r num">' + pct(nA[i].pm25.dayCov) + '</td><td>' + esc((s.files || []).join(', ')) + '</td></tr>';
  }).join('');
  el.innerHTML = '<div class="pagehead"><h1>Control de calidad</h1></div>' + banner() +
    '<div class="card"><div class="twrap"><table class="t"><thead><tr><th>Nodo</th><th>Fuente</th><th class="r">Filas cargadas</th><th class="r">Lecturas PM descartadas</th><th class="r">Lecturas NO2 descartadas</th><th class="r">Horas con PM2.5 válido</th><th class="r">Cobertura PM2.5 (periodo)</th><th>Archivos</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p class="note" style="margin:8px 0 0">Cobertura sobre el periodo de ' + R.dayToDate(S.d0) + ' a ' + R.dayToDate(S.d1 - 1) + '. Cambia el periodo en <a href="#cumplimiento">Cumplimiento</a>.</p></div>' +
    '<div class="card" style="margin-top:12px"><details class="meta" open><summary>Método y supuestos</summary><ul>' +
    '<li><b>Norma:</b> Resolución 2254 de 2017, Tabla 1 (vigente desde 2018; PM 24 h de 75 y 37 µg/m³ desde julio de 2018) y Tabla 2 (metas anuales 2030). La Resolución 0858 de 2026 trata del Cesar y no modifica estos niveles.</li>' +
    '<li><b>Contaminantes evaluados:</b> PM2.5, PM10 y NO2. SO2, O3 y CO no se miden en estos nodos.</li>' +
    '<li><b>NO2:</b> Clarity lo entrega en ppb; se convierte a µg/m³ con 1,88 (25 °C, 101,325 kPa) al importar. Confirma que tus exportaciones estén en ppb.</li>' +
    '<li><b>Control de calidad:</b> se descartan lecturas de PM sobre 1.000 µg/m³ o con PM2.5 mayor que PM10, y las de NO2 con error de calibración.</li>' +
    '<li><b>Promedios:</b> hora válida con al menos 3 muestras (muestreo cada ~17 min); día válido (hora local) con al menos 18 horas; PM anual como media de días válidos; NO2 anual como media de horas válidas.</li>' +
    '<li><b>Alcance:</b> los nodos Clarity son sensores de bajo costo. La norma exige métodos de referencia o equivalentes: este seguimiento es indicativo, no un reporte oficial de cumplimiento.</li></ul></details></div>';
}

/* ---------- vista: importar CSV ---------- */
var pending = [];
function viewImportar(el) {
  el.innerHTML = '<div class="pagehead"><h1>Importar CSV</h1><span class="note">Exportaciones de Clarity: muestras individuales o promedios horarios</span></div>' + banner() +
    '<div class="card"><div class="dropzone" id="drop"><label class="btn primary" for="file">Elegir CSV</label><input id="file" type="file" accept=".csv,text/csv" multiple hidden>' +
    '<span id="msg">Arrastra aquí uno o varios archivos. Se procesan en tu navegador y se guardan como promedios horarios validados.</span></div>' +
    '<div class="row" style="margin-top:12px">' + tokenField() + '<button class="btn primary" id="save" disabled>Guardar en la base de datos</button></div><p class="note" id="savemsg" style="margin:8px 0 0"></p>' +
    '<div class="twrap" style="margin-top:10px" id="plist"></div></div>';
  bindToken(); drawPending();
  function handle(files) {
    files = [].slice.call(files); if (!files.length) return; var done = 0;
    $('msg').textContent = 'Procesando ' + files.length + ' archivo' + (files.length > 1 ? 's' : '') + '…';
    files.forEach(function (f) {
      var rd = new FileReader();
      rd.onload = function () {
        try { var s = processClarityCsv(rd.result, f.name); pending = pending.filter(function (p) { return p.file !== f.name; }); pending.push({ file: f.name, s: s, status: 'Listo para guardar' }); }
        catch (err) { pending.push({ file: f.name, s: null, status: err.message }); }
        if (++done === files.length) { $('msg').textContent = 'Revisa el resumen y guarda.'; drawPending(); }
      };
      rd.readAsText(f);
    });
  }
  $('file').addEventListener('change', function () { handle(this.files); this.value = ''; });
  var dz = $('drop');
  ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); }); });
  dz.addEventListener('drop', function (e) { handle(e.dataTransfer.files); });
  $('save').addEventListener('click', saveAll);
}
function nameFor(id) { var s = S.stations.filter(function (x) { return x.id === id; })[0]; return s ? s.name : 'Nodo nuevo ' + id; }
function drawPending() {
  var box = $('plist'); if (!box) return;
  $('save').disabled = !pending.some(function (p) { return p.s && !p.saved; });
  if (!pending.length) { box.innerHTML = ''; return; }
  box.innerHTML = '<table class="t"><thead><tr><th>Archivo</th><th>Nodo</th><th>Fuente</th><th class="r">Filas</th><th class="r">Horas con datos</th><th>Periodo</th><th class="r">PM descartadas</th><th>Estado</th></tr></thead><tbody>' +
    pending.map(function (p) {
      if (!p.s) return '<tr><td>' + esc(p.file) + '</td><td colspan="6"></td><td><span class="pill bad">' + esc(p.status) + '</span></td></tr>';
      var s = p.s, hv = 0; for (var i = 0; i < s.n; i++) if (s.pm25[i] !== null || s.no2[i] !== null) hv++;
      return '<tr><td>' + esc(p.file) + '</td><td>' + esc(nameFor(s.id)) + '<div class="note num">' + esc(s.id) + '</div></td><td>' + esc(s.freq) + '</td><td class="r num">' + fmt(s.rows, 0) + '</td><td class="r num">' + fmt(hv, 0) + '</td><td class="num">' + R.hourLabel(s.h0).slice(0, 10) + ' a ' + R.hourLabel(s.h0 + s.n - 1).slice(0, 10) + '</td><td class="r num">' + pct(s.qc.pm.raw ? s.qc.pm.rej / s.qc.pm.raw : 0) + '</td><td><span class="pill ' + (p.saved ? 'ok' : p.error ? 'bad' : 'warn') + '">' + esc(p.status) + '</span></td></tr>';
    }).join('') + '</tbody></table>';
}
function saveAll() {
  var msg = $('savemsg'), CH = 4000, jobs = pending.filter(function (p) { return p.s && !p.saved; });
  if (!S.token) { msg.textContent = 'Escribe el token de importación.'; return; }
  $('save').disabled = true; msg.textContent = 'Guardando…';
  var chain = Promise.resolve();
  jobs.forEach(function (p) {
    chain = chain.then(function () {
      var s = p.s, saved = 0, seq = Promise.resolve();
      p.status = 'Guardando…'; p.error = false; drawPending();
      for (var i = 0; i < s.n; i += CH) (function (i) {
        seq = seq.then(function () {
          var body = { station: { id: s.id, datasourceId: s.datasourceId, lat: s.lat, lon: s.lon }, freq: s.freq, file: s.files[0], rows: i === 0 ? s.rows : 0,
            qc: i === 0 ? s.qc : { pm: {}, no2: {} }, h0: s.h0 + i, pm25: s.pm25.slice(i, i + CH), pm10: s.pm10.slice(i, i + CH), no2: s.no2.slice(i, i + CH) };
          return apiFetch('/api/import', { method: 'POST', headers: { 'content-type': 'application/json', 'x-import-token': S.token }, body: JSON.stringify(body) }).then(function (r) { saved += r.hoursSaved; });
        });
      })(i);
      return seq.then(function () { p.saved = true; p.status = fmt(saved, 0) + ' horas guardadas'; drawPending(); },
        function (e) { p.error = true; p.status = e.message; drawPending(); });
    });
  });
  chain.then(function () {
    var failed = pending.some(function (p) { return p.error; });
    msg.textContent = failed ? 'Algunos archivos no se guardaron; revisa el estado de cada uno.' : 'Listo. Los datos ya están en la base.';
    return loadData().then(function () { drawPending(); });
  });
}

/* ---------- navegación y arranque ---------- */
var VIEWS = { recientes: viewRecientes, historico: viewHistorico, cumplimiento: viewCumplimiento, ubicaciones: viewUbicaciones, calidad: viewCalidad, importar: viewImportar };
window.RVApp = { S: S, VIEWS: VIEWS, $: $, css: css, esc: esc, fmt: fmt, pct: pct, colorVar: colorVar, analyses: analyses, bindPeriod: bindPeriod, banner: banner, setupCanvas: setupCanvas, niceMax: niceMax, endHour: endHour, bounds: bounds };
function route() {
  var v = (location.hash || '#ejecutivo').slice(1); if (!VIEWS[v]) v = 'ejecutivo';
  [].forEach.call(document.querySelectorAll('.side a'), function (a) { if (a.dataset.v === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (S.lastView !== v) { mapDestroy(); S.onPick = null; }
  S.lastView = v; VIEWS[v]($('view'));
}
function rerenderCanvases() { var v = S.lastView; if (v === 'historico' || v === 'cumplimiento' || v === 'ejecutivo') route(); }
window.addEventListener('hashchange', route);
$('burger').addEventListener('click', function () { $('app').classList.toggle('collapsed'); if (MapV.map) setTimeout(function () { MapV.map.invalidateSize(); }, 50); });
$('theme').addEventListener('click', function () {
  var cur = document.documentElement.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  var next = cur === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('riverport-theme', next); } catch (e) {} rerenderCanvases();
});
try { var th = localStorage.getItem('riverport-theme'); if (th) document.documentElement.setAttribute('data-theme', th); } catch (e) {}
if (window.innerWidth <= 980) $('app').classList.add('collapsed');
var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(rerenderCanvases, 150); });

$('view').innerHTML = '<div class="empty">Cargando datos…</div>';
loadData().then(route);
})();
