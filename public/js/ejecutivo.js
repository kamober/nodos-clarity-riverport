/* Panel ejecutivo: tablero de KPIs de cumplimiento ambiental (Res. 2254/2017). Usa RV.kpis (js/kpis.js) y RVApp (js/app.js). */
(function () {
'use strict';
var A = window.RVApp, R = window.RV, S = A.S, esc = A.esc, fmt = A.fmt, $ = A.$, css = A.css, NORM = R.NORM, ICA = R.ICA;
var E = { pol: 'pm25', table: false, k: null };
var POLN = { pm25: 'PM2.5', pm10: 'PM10', no2: 'NO2' };
var SEV = { crit: ['▲', 'Crítico', 'bad'], warn: ['●', 'Atención', 'warn'], info: ['◆', 'Informativo', 'na'], ok: ['✓', 'Bien', 'ok'] };

function pc(v, d) { return v === null || v === undefined || !isFinite(v) ? '–' : fmt(v * 100, d === undefined ? 0 : d) + ' %'; }
function nowH() { return Math.floor(Date.now() / 3600000); }
function compute() {
  E.k = R.kpis.compute({ stations: S.stations, analyses: A.analyses(), d0: S.d0, d1: S.d1, lim: S.lim, hidden: S.hidden, nowH: nowH() });
  return E.k;
}
function statusOf(ratio) { return ratio === null ? ['na', 'Sin datos'] : ratio <= 0.75 ? ['ok', '✓ Holgado'] : ratio <= 1 ? ['warn', '● Cerca del límite'] : ['bad', '▲ Sobre el límite']; }

/* ---------- piezas SVG ---------- */
function ring(frac, size) {
  var r = size / 2 - 7, c = 2 * Math.PI * r, f = frac === null ? 0 : Math.max(0, Math.min(1, frac));
  return '<svg class="ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="8"/>' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + (c * f).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>';
}
function arcPath(cx, cy, r, t0, t1) {
  function pt(t) { return [cx - r * Math.cos(Math.PI * t), cy - r * Math.sin(Math.PI * t)]; }
  var a = pt(t0), b = pt(t1);
  return 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1);
}
function gauge(pol, m) {
  var max = 1.5, ratio = m.ratio, t = ratio === null ? 0 : Math.min(ratio, max) / max, st = statusOf(ratio), col = 'var(--' + st[0] + ')', tick = 1 / max;
  var tx = 100 - 78 * Math.cos(Math.PI * tick), ty = 92 - 78 * Math.sin(Math.PI * tick), tx2 = 100 - 66 * Math.cos(Math.PI * tick), ty2 = 92 - 66 * Math.sin(Math.PI * tick);
  return '<div class="gauge"><svg viewBox="0 0 200 112" role="img" aria-label="' + POLN[pol] + ': ' + (ratio === null ? 'sin datos' : Math.round(ratio * 100) + ' por ciento del límite anual') + '">' +
    '<path d="' + arcPath(100, 92, 72, 0, 1) + '" fill="none" stroke="var(--soft)" stroke-width="14" stroke-linecap="round"/>' +
    (ratio === null ? '' : '<path d="' + arcPath(100, 92, 72, 0, Math.max(t, 0.015)) + '" fill="none" stroke="' + col + '" stroke-width="14" stroke-linecap="round"/>') +
    '<line x1="' + tx.toFixed(1) + '" y1="' + ty.toFixed(1) + '" x2="' + tx2.toFixed(1) + '" y2="' + ty2.toFixed(1) + '" stroke="var(--ink)" stroke-width="2"/>' +
    '<text x="100" y="82" text-anchor="middle" class="gv">' + (ratio === null ? '–' : Math.round(ratio * 100) + ' %') + '</text></svg>' +
    '<div class="gl"><b>' + POLN[pol] + '</b> · ' + fmt(m.mean, 1) + ' de ' + m.limit + ' µg/m³</div><span class="pill ' + st[0] + '">' + st[1] + '</span>' + (m.partial ? '<div class="note">Cobertura menor a 75 %: indicativo</div>' : '') + '</div>';
}

/* ---------- gráfico de líneas (mensual / perfil horario) ---------- */
function lineChart(cv, labels, series, limit, unit, fmtX) {
  var g = A.setupCanvas(cv, 260), ctx = g.ctx, w = g.w, h = g.h, ml = 44, mr = 22, mt = 12, mb = 28, pw = w - ml - mr, ph = h - mt - mb, n = labels.length;
  var max = limit || 0; series.forEach(function (s) { s.vals.forEach(function (v) { if (v !== null && v > max) max = v; }); });
  var stp = A.niceMax((max * 1.08 || 1) / 4); max = stp * 4;
  var ink = css('--ink2'), line = css('--line'), X = function (i) { return ml + (n === 1 ? pw / 2 : pw * i / (n - 1)); }, Y = function (v) { return mt + ph * (1 - v / max); };
  ctx.clearRect(0, 0, w, h); ctx.font = '11px ' + css('--mono'); ctx.fillStyle = ink; ctx.strokeStyle = line; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.lineWidth = 1;
  for (var t = 0; t <= 4; t++) { var v = max * t / 4, y = Y(v); ctx.beginPath(); ctx.moveTo(ml, y); ctx.lineTo(w - mr, y); ctx.stroke(); ctx.fillText(fmt(v, v < 10 ? 1 : 0), ml - 6, y); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; var step = Math.max(1, Math.ceil(n / Math.floor(pw / 56)));
  for (var i = 0; i < n; i += step) { ctx.textAlign = i === 0 ? 'left' : (i + step >= n && n > 6 ? 'right' : 'center'); ctx.fillText(fmtX(labels[i]), i === 0 ? ml - 4 : (i + step >= n && n > 6 ? w - 4 : X(i)), h - mb + 8); }
  if (limit) { ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = css('--bad'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ml, Y(limit)); ctx.lineTo(w - mr, Y(limit)); ctx.stroke(); ctx.restore(); ctx.fillStyle = css('--bad'); ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('Límite ' + limit, w - mr, Y(limit) - 3); }
  series.forEach(function (s) {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; var pen = false;
    ctx.beginPath(); s.vals.forEach(function (v, i2) { if (v === null) { pen = false; return; } if (!pen) { ctx.moveTo(X(i2), Y(v)); pen = true; } else ctx.lineTo(X(i2), Y(v)); }); ctx.stroke();
    s.vals.forEach(function (v, i2) { if (v !== null) { ctx.beginPath(); ctx.arc(X(i2), Y(v), 3.2, 0, 6.3); ctx.fill(); } });
  });
  var tip = cv.parentNode.querySelector('.tip');
  cv.onmousemove = function (e) {
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, i3 = Math.max(0, Math.min(n - 1, Math.round((x - ml) / (pw / Math.max(1, n - 1)))));
    tip.innerHTML = '<div class="t">' + esc(fmtX(labels[i3], true)) + '</div>' + series.map(function (s) { return '<div class="r"><span><span class="sw" style="--c:' + s.color + '"></span>' + esc(s.name) + '</span><b class="num">' + (s.vals[i3] === null ? 'sin dato' : fmt(s.vals[i3], 1) + ' ' + unit) + '</b></div>'; }).join('');
    tip.style.display = 'block'; tip.style.left = Math.min(Math.max(4, X(i3) + 12), Math.max(4, w - 170)) + 'px'; tip.style.top = '6px';
  };
  cv.onmouseleave = function () { tip.style.display = 'none'; };
}
var MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function monthLabel(ym, long) { var p = ym.split('-'); return MES[+p[1] - 1] + (long || p[1] === '01' ? ' ' + p[0] : ' ' + p[0].slice(2)); }

/* ---------- ventana de detalle ---------- */
function openDetail(id) {
  var k = E.k, m = k.medias, body = '', title = '';
  function nodeRows(fn) { return k.nodes.map(function (s, i) { return '<tr><td><span class="sw" style="--c:var(' + A.colorVar(s) + ')"></span>' + esc(s.name) + '</td>' + fn(s, i) + '</tr>'; }).join(''); }
  if (id === 'cumpl') {
    title = 'Índice de cumplimiento normativo';
    body = '<p>Proporción de evaluaciones de la matriz que cumplen la Resolución 2254 de 2017. Se evalúan 6 estándares (PM2.5, PM10 y NO2, anual y de corto plazo) por cada nodo. Las evaluaciones sin datos suficientes no se cuentan.</p><p class="formula num">Índice = cumplen ÷ (cumplen + no cumplen) = ' + k.cumplimiento.ok + ' ÷ ' + (k.cumplimiento.ok + k.cumplimiento.bad) + ' = ' + pc(k.cumplimiento.index) + '</p>' +
      '<div class="twrap"><table class="t"><thead><tr><th>Estándar</th>' + k.nodes.map(function (s) { return '<th>' + esc(s.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      k.rows.map(function (r) { return '<tr><td>' + r.std + ' · ' + r.t + ' (' + r.limit + ')</td>' + r.cells.map(function (c) { var t = { ok: '✓ Cumple', bad: '▲ Excede', warnbad: '▲ Excede (indicativo)', warn: '● Indicativo', na: '– Sin datos' }[c.status]; return '<td>' + t + '<div class="note">' + fmt(c.value, 1) + ' · cobertura ' + pc(c.cov) + '</div></td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  } else if (id === 'pm25' || id === 'pm10' || id === 'no2') {
    var pol = id; title = POLN[pol] + ' · promedio anual por nodo';
    body = '<p>Promedio de la red: <b class="num">' + fmt(m[pol].mean, 1) + ' µg/m³</b> frente al límite anual de ' + m[pol].limit + ' µg/m³ (' + (S.lim === '2030' ? 'meta 2030' : 'vigente') + ') = ' + pc(m[pol].ratio) + '. Se promedian los nodos con cobertura de al menos 75 %.</p><div class="twrap"><table class="t"><thead><tr><th>Nodo</th><th class="r">Promedio</th><th class="r">% del límite</th><th class="r">Cobertura</th></tr></thead><tbody>' +
      nodeRows(function (s, i) { var a = k.analyses[i][pol], v = pol === 'no2' ? a.annualHr : a.annualPM, cov = pol === 'no2' ? a.hourCov : a.dayCov; return '<td class="r num">' + fmt(v, 1) + '</td><td class="r num">' + (v === null ? '–' : pc(v / m[pol].limit)) + '</td><td class="r num">' + pc(cov) + '</td>'; }) + '</tbody></table></div>';
  } else if (id === 'dias') {
    title = 'Días dentro de la norma (24 h)';
    body = '<p>Porcentaje de días-nodo válidos con promedio de 24 h igual o menor al límite (PM2.5 ' + NORM.pm25.d24 + ', PM10 ' + NORM.pm10.d24 + ' µg/m³).</p><div class="twrap"><table class="t"><thead><tr><th>Nodo</th><th class="r">Días válidos PM2.5</th><th class="r">Excedencias PM2.5</th><th class="r">Excedencias PM10</th></tr></thead><tbody>' +
      nodeRows(function (s, i) { var a = k.analyses[i]; return '<td class="r num">' + fmt(a.pm25.validDays, 0) + '</td><td class="r num">' + a.pm25.dexc + '</td><td class="r num">' + a.pm10.dexc + '</td>'; }) + '</tbody></table></div>';
    if (k.eventos.length) body += '<h3 style="margin:14px 0 6px">Días de excedencia</h3><div class="twrap"><table class="t"><thead><tr><th>Fecha</th><th>Nodo</th><th>Contaminante</th><th class="r">Valor</th></tr></thead><tbody>' + k.eventos.map(function (e) { return '<tr><td class="num">' + e.date + '</td><td>' + esc(e.node) + '</td><td>' + POLN[e.pol] + '</td><td class="r num">' + fmt(e.value, 1) + ' / ' + e.limit + '</td></tr>'; }).join('') + '</tbody></table></div>';
  } else if (id === 'disp') {
    title = 'Disponibilidad de datos';
    body = '<p>Cobertura de días válidos de PM2.5 en el periodo y estado de transmisión de cada nodo. Con menos de 75 % la evaluación es indicativa.</p><div class="twrap"><table class="t"><thead><tr><th>Nodo</th><th class="r">Cobertura PM2.5</th><th class="r">Lecturas PM descartadas</th><th>Último dato</th></tr></thead><tbody>' +
      nodeRows(function (s, i) { var q = s.qc && s.qc.pm && s.qc.pm.raw ? s.qc.pm.rej / s.qc.pm.raw : null; return '<td class="r num">' + pc(k.analyses[i].pm25.dayCov) + '</td><td class="r num">' + (q === null ? '–' : pc(q)) + '</td><td class="num">' + (s.n ? R.hourLabel(R.lastH(s)) : 'sin datos') + '</td>'; }) + '</tbody></table></div>';
  } else if (id === 'meta') {
    title = 'Brecha hacia la meta 2030';
    body = '<p>La Resolución 2254 fija metas anuales más exigentes para 2030: PM2.5 ' + NORM.pm25.annual[2030] + ', PM10 ' + NORM.pm10.annual[2030] + ' y NO2 ' + NORM.no2.annual[2030] + ' µg/m³. La brecha compara el promedio actual de la red con cada meta.</p><div class="twrap"><table class="t"><thead><tr><th>Contaminante</th><th class="r">Promedio red</th><th class="r">Meta 2030</th><th class="r">Brecha</th></tr></thead><tbody>' +
      ['pm25', 'pm10', 'no2'].map(function (p) { var mm = m[p].mean, g = NORM[p].annual[2030], d = mm === null ? null : mm - g; return '<tr><td>' + POLN[p] + '</td><td class="r num">' + fmt(mm, 1) + '</td><td class="r num">' + g + '</td><td class="r num">' + (d === null ? '–' : (d <= 0 ? '✓ ' + fmt(-d, 1) + ' por debajo' : '▲ ' + fmt(d, 1) + ' por reducir')) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  var dlg = $('dlg'); dlg.querySelector('.dbody').innerHTML = '<h2>' + esc(title) + '</h2>' + body; if (!dlg.open) dlg.showModal();
}

/* ---------- vista ---------- */
function tile(id, cls, label, big, unit, sub, status, extra) {
  return '<button class="tile ' + cls + '" data-d="' + id + '" aria-label="' + esc(label + ': ' + big + ' ' + unit + '. ' + status + '. Ver detalle') + '"><div class="tl">' + esc(label) + '</div><div class="tm"><div><span class="tv num">' + big + '</span><span class="tu">' + unit + '</span></div>' + (extra || '') + '</div><div class="ts">' + sub + '</div><div class="tst">' + status + '</div></button>';
}

function view(el) {
  if (!A.bounds()) { el.innerHTML = '<div class="pagehead"><h1>Panel ejecutivo</h1></div>' + A.banner(); return; }
  var k = compute(), m = k.medias, ci = k.cumplimiento.index, dn = k.diasNorma.pm25;
  var okc = ci === null ? 'na' : ci >= 0.9 ? 'ok' : ci >= 0.7 ? 'warn' : 'bad';
  var chips = S.stations.map(function (s) { var on = !S.hidden[s.id]; return '<button class="chip" data-n="' + esc(s.id) + '" aria-pressed="' + on + '"><span class="sw" style="--c:var(' + A.colorVar(s) + ')"></span>' + esc(s.name) + '</button>'; }).join('');
  var covOk = k.disponibilidad.cov !== null && k.disponibilidad.cov >= 0.75;
  var tiles = '<div class="tiles">' +
    tile('cumpl', 't-navy', 'Cumplimiento normativo', ci === null ? '–' : Math.round(ci * 100), '%', k.cumplimiento.ok + ' de ' + (k.cumplimiento.ok + k.cumplimiento.bad) + ' evaluaciones cumplen', ci === null ? 'Sin datos' : ci >= 0.9 ? '✓ Nivel alto' : ci >= 0.7 ? '● Con observaciones' : '▲ Requiere acción', ring(ci, 64)) +
    tile('pm25', 't-teal', 'PM2.5 promedio de la red', fmt(m.pm25.mean, 1), 'µg/m³', pc(m.pm25.ratio) + ' del límite anual de ' + m.pm25.limit, m.pm25.ratio === null ? 'Sin datos' : m.pm25.ratio <= 1 ? '✓ Dentro de la norma' : '▲ Sobre la norma') +
    tile('dias', 't-green', 'Días dentro de la norma', dn.pct === null ? '–' : fmt(dn.pct * 100, 1), '%', fmt(dn.within, 0) + ' de ' + fmt(dn.valid, 0) + ' días-nodo (PM2.5 24 h)', dn.pct === null ? 'Sin datos' : dn.pct >= 0.95 ? '✓ Muy alto' : '● Revisar excedencias') +
    tile('dias', 't-orange', 'Excedencias del periodo', fmt(k.excedencias.total, 0), 'eventos', 'PM2.5 ' + k.excedencias.pm25 + ' · PM10 ' + k.excedencias.pm10 + ' · NO2 ' + k.excedencias.no2 + ' h', k.excedencias.total === 0 ? '✓ Sin excedencias' : '▲ Hay eventos por revisar') +
    tile('disp', 't-purple', 'Disponibilidad de datos', k.disponibilidad.cov === null ? '–' : Math.round(k.disponibilidad.cov * 100), '%', k.disponibilidad.online + ' de ' + k.disponibilidad.total + ' nodos transmitiendo', covOk ? '✓ Cobertura suficiente' : '● Cobertura baja') +
    tile('meta', 't-blue', 'Brecha a la meta 2030 (PM2.5)', k.meta2030.gap === null ? '–' : (k.meta2030.gap <= 0 ? '−' : '+') + fmt(Math.abs(k.meta2030.gap), 1), 'µg/m³', 'Meta ' + k.meta2030.target + ' µg/m³ · hoy ' + fmt(k.meta2030.mean, 1), k.meta2030.mean === null ? 'Sin datos' : k.meta2030.below ? '✓ Meta alcanzada' : '● Falta reducir') + '</div>';

  var icaRows = k.ica.map(function (r) {
    var tot = r.valid + r.nodata || 1;
    var segs = r.counts.map(function (n, j) { return n ? '<div style="flex:' + n + ';background:var(' + ICA[j].c + ')" title="' + ICA[j].n + ': ' + n + ' días"><span>' + (n / tot > 0.08 ? n : '') + '</span></div>' : ''; }).join('') + (r.nodata ? '<div style="flex:' + r.nodata + ';background:var(--nodata)" title="Sin datos válidos: ' + r.nodata + ' días"></div>' : '');
    return '<div class="icarow"><div class="icalab">' + esc(r.node) + '</div><div class="stack2" role="img" aria-label="' + esc(r.node) + ': ' + r.counts.map(function (n, j) { return n + ' días ' + ICA[j].n; }).join(', ') + '">' + segs + '</div></div>';
  }).join('');

  var alerts = k.alertas.map(function (a) { var s = SEV[a.sev]; return '<li class="al ' + s[2] + '"><span class="ai" aria-hidden="true">' + s[0] + '</span><div><b>' + esc(a.title) + '</b> <span class="pill ' + s[2] + '">' + s[1] + '</span><div class="note" style="color:var(--ink2)">' + esc(a.text) + '</div><div class="act">Acción: ' + esc(a.action) + '</div></div></li>'; }).join('') || '<li class="note">Sin alertas.</li>';

  function bar(label, val, max, markers, txt, st) {
    var f = val === null ? 0 : Math.min(1, val / max), col = 'var(--' + st + ')';
    return '<div class="sb"><div class="sbh"><span>' + label + '</span><b class="num">' + txt + '</b></div><div class="sbt"><i style="width:' + (f * 100).toFixed(1) + '%;background:' + col + '"></i>' + markers.map(function (mk) { return '<u style="left:' + (Math.min(1, mk[0] / max) * 100).toFixed(1) + '%" title="' + esc(mk[1]) + '"></u>'; }).join('') + '</div></div>';
  }
  var strat = '';
  ['pm25', 'pm10', 'no2'].forEach(function (p) {
    var g = NORM[p].annual[2030], l = NORM[p].annual[2018], v = m[p].mean, max = l * 1.25, st = v === null ? 'na' : v <= g ? 'ok' : v <= l ? 'warn' : 'bad';
    strat += bar(POLN[p] + ' promedio anual', v, max, [[g, 'Meta 2030: ' + g], [l, 'Límite vigente: ' + l]], fmt(v, 1) + ' µg/m³ · meta 2030 ' + g + ' · vigente ' + l, st);
  });
  strat += bar('Días dentro de la norma PM2.5', dn.pct, 1, [[0.95, 'Objetivo 95 %']], pc(dn.pct, 1) + ' · objetivo 95 %', dn.pct === null ? 'na' : dn.pct >= 0.95 ? 'ok' : 'warn');
  strat += bar('Disponibilidad de datos', k.disponibilidad.cov, 1, [[0.75, 'Mínimo 75 %']], pc(k.disponibilidad.cov) + ' · mínimo 75 %', k.disponibilidad.cov === null ? 'na' : covOk ? 'ok' : 'warn');

  var rank = k.nodes.map(function (s, i) { var a = k.analyses[i]; return { s: s, v: a.pm25.annualPM, cov: a.pm25.dayCov, exc: a.pm25.dexc + a.pm10.dexc + a.no2.hexc, max: a.pm25.dmax }; }).sort(function (a, b) { return (a.v === null) - (b.v === null) || a.v - b.v; });
  var rankT = '<div class="twrap"><table class="t"><thead><tr><th>#</th><th>Nodo</th><th class="r">PM2.5 prom.</th><th class="r">Máx. diario</th><th class="r">Excedencias</th><th class="r">Cobertura</th></tr></thead><tbody>' + rank.map(function (r, i) { return '<tr><td class="num">' + (i + 1) + '</td><td><span class="sw" style="--c:var(' + A.colorVar(r.s) + ')"></span>' + esc(r.s.name) + '</td><td class="r num">' + fmt(r.v, 1) + '</td><td class="r num">' + fmt(r.max, 1) + '</td><td class="r num">' + r.exc + '</td><td class="r num">' + pc(r.cov) + '</td></tr>'; }).join('') + '</tbody></table></div><p class="note" style="margin:8px 0 0">Orden de menor a mayor PM2.5 promedio. Con cobertura menor a 75 % el promedio es indicativo.</p>';

  var matrix = '<div class="twrap"><table class="t"><thead><tr><th>Estándar</th>' + k.nodes.map(function (s) { return '<th><span class="sw" style="--c:var(' + A.colorVar(s) + ')"></span>' + esc(s.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    k.rows.map(function (r) { return '<tr><td>' + r.std + ' · ' + r.t + '<div class="note">Límite ' + r.limit + ' µg/m³</div></td>' + r.cells.map(function (c) { var t = { ok: ['ok', '✓ Cumple'], bad: ['bad', '▲ Excede'], warnbad: ['bad', '▲ Excede*'], warn: ['warn', '● Indicativo'], na: ['na', '– Sin datos'] }[c.status]; return '<td><span class="pill ' + t[0] + '">' + t[1] + '</span><div class="note num">' + fmt(c.value, 1) + '</div></td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div><p class="note" style="margin:8px 0 0">* Excede con cobertura menor a 75 %. Indicativo: cumple pero con cobertura insuficiente.</p>';

  el.innerHTML = '<div class="pagehead"><div><h1>Panel ejecutivo · Cumplimiento ambiental</h1><div class="note">Riverport Sociedad Portuaria · Resolución 2254 de 2017 (MinAmbiente) · seguimiento con nodos Clarity</div></div><span class="note">Del ' + R.dayToDate(S.d0) + ' al ' + R.dayToDate(S.d1 - 1) + ' · ' + (S.d1 - S.d0) + ' días</span></div>' + A.banner() +
    '<div class="card ctlbar"><div class="ctl"><span class="lab">Periodo</span><div class="seg" id="presets">' + ['365:12 meses', '90:90 días', '30:30 días', 'all:Todo'].map(function (x) { var p = x.split(':'); return '<button data-p="' + p[0] + '" aria-pressed="' + (S.preset === p[0]) + '">' + p[1] + '</button>'; }).join('') + '</div></div>' +
    '<div class="ctl"><label for="dfrom">Desde</label><input type="date" id="dfrom" value="' + R.dayToDate(S.d0) + '"></div><div class="ctl"><label for="dto">Hasta</label><input type="date" id="dto" value="' + R.dayToDate(S.d1 - 1) + '"></div>' +
    '<div class="ctl"><span class="lab">Límites anuales</span><div class="seg" id="lim"><button data-l="2018" aria-pressed="' + (S.lim === '2018') + '">Vigentes</button><button data-l="2030" aria-pressed="' + (S.lim === '2030') + '">Meta 2030</button></div></div>' +
    '<div class="ctl grow"><span class="lab">Nodos incluidos</span><div class="chips" id="chips">' + chips + '</div></div></div>' +
    tiles +
    '<div class="g2"><div class="card"><header><h2>Tendencia mensual</h2><div class="row" style="gap:8px"><div class="seg" id="pols">' + ['pm25', 'pm10', 'no2'].map(function (p) { return '<button data-p="' + p + '" aria-pressed="' + (E.pol === p) + '">' + POLN[p] + '</button>'; }).join('') + '</div><button class="btn" id="tt">' + (E.table ? 'Ver gráfico' : 'Ver tabla') + '</button></div></header><div id="trend"></div><p class="note" style="margin:6px 0 0">Promedio mensual por nodo; un mes se muestra si tiene al menos 75 % de días válidos. Línea roja: límite anual.</p></div>' +
    '<div class="card"><header><h2>% del límite anual</h2><span class="note">Marca = 100 % del límite</span></header><div class="gauges">' + gauge('pm25', m.pm25) + gauge('pm10', m.pm10) + gauge('no2', m.no2) + '</div></div></div>' +
    '<div class="g2"><div class="card"><header><h2>Calidad del aire por día (ICA, PM2.5)</h2><span class="note">Días por categoría</span></header>' + icaRows + '<div class="legend">' + ICA.map(function (c) { return '<span class="ica" style="--c:var(' + c.c + ')"><i></i>' + c.n + '</span>'; }).join('') + '<span class="ica" style="--c:var(--nodata)"><i></i>Sin datos válidos</span></div>' +
    '<p class="note" style="margin:8px 0 0">Buena o Aceptable: ' + pc(k.icaTotal.okPct, 1) + ' de los días con datos válidos.</p></div>' +
    '<div class="card"><header><h2>Perfil horario promedio</h2><div class="seg" id="pols2">' + ['pm25', 'pm10', 'no2'].map(function (p) { return '<button data-p="' + p + '" aria-pressed="' + (E.pol === p) + '">' + POLN[p] + '</button>'; }).join('') + '</div></header><div class="canvaswrap"><canvas id="hp" role="img" aria-label="Perfil horario promedio por nodo"></canvas><div class="tip"></div></div><div class="legend" id="hpl"></div></div></div>' +
    '<div class="g2"><div class="card"><header><h2>Alertas y acciones</h2><span class="note">' + k.alertas.length + ' avisos</span></header><ul class="alerts">' + alerts + '</ul></div>' +
    '<div class="card"><header><h2>Indicadores estratégicos</h2><span class="note">Marcas: meta y límite</span></header>' + strat + '</div></div>' +
    '<div class="g2"><div class="card"><header><h2>Semáforo normativo</h2><a class="btn" href="#cumplimiento">Ver matriz completa</a></header>' + matrix + '</div>' +
    '<div class="card"><header><h2>Ranking de nodos</h2></header>' + rankT + '</div></div>' +
    '<div class="card narr"><header><h2>Resumen ejecutivo</h2><button class="btn" id="cp">Copiar resumen</button></header><p id="narr">' + esc(k.resumen) + '</p></div>' +
    '<dialog id="dlg" aria-label="Detalle del indicador"><div class="dbody"></div><form method="dialog" class="dfoot"><button class="btn primary">Cerrar</button></form></dialog>';

  A.bindPeriod(function () { view(el); });
  $('lim').addEventListener('click', function (e) { var l = e.target.dataset && e.target.dataset.l; if (!l) return; S.lim = l; view(el); });
  $('chips').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (!b) return; var id = b.dataset.n; if (S.hidden[id]) delete S.hidden[id]; else if (S.stations.filter(function (s) { return !S.hidden[s.id]; }).length > 1) S.hidden[id] = true; view(el); });
  [].forEach.call(el.querySelectorAll('.tile'), function (b) { b.addEventListener('click', function () { openDetail(b.dataset.d); }); });
  [$('pols'), $('pols2')].forEach(function (g) { g.addEventListener('click', function (e) { var p = e.target.dataset && e.target.dataset.p; if (!p) return; E.pol = p; view(el); }); });
  $('tt').addEventListener('click', function () { E.table = !E.table; view(el); });
  $('cp').addEventListener('click', function () { var b = this; try { navigator.clipboard.writeText(k.resumen).then(function () { b.textContent = 'Copiado'; setTimeout(function () { b.textContent = 'Copiar resumen'; }, 1500); }, function () { b.textContent = 'No se pudo copiar'; }); } catch (x) { b.textContent = 'No se pudo copiar'; } });
  $('dlg').addEventListener('click', function (e) { if (e.target === this) this.close(); });
  drawCharts(k);
}

function drawCharts(k) {
  var pol = E.pol, unit = 'µg/m³', limit = k.medias[pol].limit, tr = $('trend');
  var series = k.nodes.map(function (s, i) { return { name: s.name, color: css(A.colorVar(s)), vals: k.monthly[pol][i].map(function (x) { return x.v; }) }; });
  if (E.table) {
    tr.innerHTML = '<div class="twrap"><table class="t"><thead><tr><th>Mes</th>' + k.nodes.map(function (s) { return '<th class="r">' + esc(s.name) + '</th>'; }).join('') + '</tr></thead><tbody>' + k.months.map(function (mo, j) { return '<tr><td>' + monthLabel(mo, true) + '</td>' + series.map(function (s, i) { var x = k.monthly[pol][i][j]; return '<td class="r num">' + (x.v === null ? '<span class="note">' + x.days + '/' + x.of + ' d</span>' : fmt(x.v, 1)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  } else {
    tr.innerHTML = '<div class="canvaswrap"><canvas id="tc" role="img" aria-label="Tendencia mensual de ' + POLN[pol] + ' por nodo"></canvas><div class="tip"></div></div><div class="legend">' + k.nodes.map(function (s) { return '<span><span class="sw" style="--c:var(' + A.colorVar(s) + ')"></span>' + esc(s.name) + '</span>'; }).join('') + '</div>';
    lineChart($('tc'), k.months, series, limit, unit, monthLabel);
  }
  var hs = k.nodes.map(function (s, i) { return { name: s.name, color: css(A.colorVar(s)), vals: k.hourly[pol][i] }; }), hrs = []; for (var h = 0; h < 24; h++) hrs.push(h);
  lineChart($('hp'), hrs, hs, null, unit, function (h2, long) { return (h2 < 10 ? '0' : '') + h2 + (long ? ':00' : 'h'); });
  $('hpl').innerHTML = k.nodes.map(function (s) { return '<span><span class="sw" style="--c:var(' + A.colorVar(s) + ')"></span>' + esc(s.name) + '</span>'; }).join('') + '<span class="note">Hora local (UTC−5)</span>';
}

A.VIEWS.ejecutivo = view;
})();
