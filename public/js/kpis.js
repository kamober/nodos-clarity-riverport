/* Indicadores ejecutivos (sin DOM, probado en node). Todo se calcula con las mismas reglas de analysis.js. */
(function (root) {
  'use strict';
  var R = (typeof module !== 'undefined' && module.exports) ? require('./analysis.js') : root.RV;
  var TZ = R.TZ, NORM = R.NORM, ICA = R.ICA;
  var POLS = ['pm25', 'pm10', 'no2'];

  function annualLimit(pol, lim) { return NORM[pol].annual[lim]; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ym(day) { var d = new Date(day * 86400000); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1); }
  function fnum(v, d) { return v === null || v === undefined || !isFinite(v) ? '–' : v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d }); }

  /* o: { stations, analyses, d0, d1, lim, hidden:{id:true}, nowH } */
  function compute(o) {
    var idx = [], i;
    for (i = 0; i < o.stations.length; i++) if (!(o.hidden && o.hidden[o.stations[i].id])) idx.push(i);
    var st = idx.map(function (k) { return o.stations[k]; }), an = idx.map(function (k) { return o.analyses[k]; });
    var D = o.d1 - o.d0, lim = o.lim, out = { D: D, nodes: st, analyses: an, lim: lim };

    // 1) Cumplimiento por estándar (misma regla que la matriz)
    var rows = R.evalRows(an, lim), c = { ok: 0, bad: 0, warn: 0, na: 0 };
    rows.forEach(function (r) { r.cells.forEach(function (x) {
      if (x.status === 'ok') c.ok++; else if (x.status === 'bad' || x.status === 'warnbad') c.bad++; else if (x.status === 'warn') c.warn++; else c.na++;
    }); });
    out.rows = rows;
    out.cumplimiento = { ok: c.ok, bad: c.bad, warn: c.warn, na: c.na, total: c.ok + c.bad + c.warn + c.na, index: (c.ok + c.bad) ? c.ok / (c.ok + c.bad) : null };

    // 2) Días dentro de norma (24 h) y excedencias
    out.diasNorma = {};
    ['pm25', 'pm10'].forEach(function (pol) {
      var valid = 0, within = 0;
      an.forEach(function (a) { a.daily[pol].forEach(function (v) { if (v !== null) { valid++; if (v <= NORM[pol].d24) within++; } }); });
      out.diasNorma[pol] = { valid: valid, within: within, pct: valid ? within / valid : null };
    });
    out.excedencias = {
      pm25: an.reduce(function (s, a) { return s + a.pm25.dexc; }, 0),
      pm10: an.reduce(function (s, a) { return s + a.pm10.dexc; }, 0),
      no2: an.reduce(function (s, a) { return s + a.no2.hexc; }, 0)
    };
    out.excedencias.total = out.excedencias.pm25 + out.excedencias.pm10 + out.excedencias.no2;
    var ev = [];
    st.forEach(function (s, k) { ['pm25', 'pm10'].forEach(function (pol) {
      an[k].daily[pol].forEach(function (v, j) { if (v !== null && v > NORM[pol].d24) ev.push({ node: s.name, id: s.id, pol: pol, value: v, limit: NORM[pol].d24, date: R.dayToDate(o.d0 + j) }); });
    }); });
    ev.sort(function (a, b) { return b.value / b.limit - a.value / a.limit; });
    out.eventos = ev;

    // 3) Promedios de la red (peso igual por nodo; solo nodos con cobertura suficiente si los hay)
    out.medias = {};
    POLS.forEach(function (pol) {
      var cand = st.map(function (s, k) { var a = an[k][pol]; return { name: s.name, v: pol === 'no2' ? a.annualHr : a.annualPM, cov: pol === 'no2' ? a.hourCov : a.dayCov }; })
        .filter(function (x) { return x.v !== null; });
      var good = cand.filter(function (x) { return x.cov >= 0.75; }), use = good.length ? good : cand, mean = use.length ? use.reduce(function (s, x) { return s + x.v; }, 0) / use.length : null, L = annualLimit(pol, lim);
      out.medias[pol] = { mean: mean, n: use.length, partial: !good.length && cand.length > 0, limit: L, ratio: mean === null ? null : mean / L, nodes: cand };
    });
    var m25 = out.medias.pm25.mean, g30 = NORM.pm25.annual[2030];
    out.meta2030 = { target: g30, mean: m25, below: m25 !== null && m25 <= g30, gap: m25 === null ? null : m25 - g30, ratio: m25 === null ? null : m25 / g30 };

    // 4) Disponibilidad y estado de nodos
    var covs = an.map(function (a) { return a.pm25.dayCov; });
    var online = st.filter(function (s) { return s.n && o.nowH !== undefined && R.lastH(s) >= o.nowH - 6; }).length;
    out.disponibilidad = { cov: covs.length ? covs.reduce(function (s, v) { return s + v; }, 0) / covs.length : null, online: online, total: st.length, perNode: covs };

    // 5) Distribución del ICA (PM2.5 24 h) por nodo
    out.ica = st.map(function (s, k) {
      var cnt = [0, 0, 0, 0, 0, 0], valid = 0;
      an[k].daily.pm25.forEach(function (v) { if (v !== null) { cnt[R.icaIdx('pm25', v)]++; valid++; } });
      return { node: s.name, id: s.id, counts: cnt, valid: valid, nodata: D - valid };
    });
    var tot = [0, 0, 0, 0, 0, 0], tv = 0; out.ica.forEach(function (r) { r.counts.forEach(function (n, j) { tot[j] += n; }); tv += r.valid; });
    out.icaTotal = { counts: tot, valid: tv, goodPct: tv ? tot[0] / tv : null, okPct: tv ? (tot[0] + tot[1]) / tv : null };

    // 6) Tendencia mensual y perfil horario por contaminante
    out.monthly = {}; out.hourly = {};
    var months = [], seen = {}, d;
    for (d = o.d0; d < o.d1; d++) { var m = ym(d); if (!seen[m]) { seen[m] = { ym: m, days: 0 }; months.push(seen[m]); } seen[m].days++; }
    out.months = months.map(function (x) { return x.ym; });
    POLS.forEach(function (pol) {
      out.monthly[pol] = st.map(function (s, k) {
        var sum = {}, cnt = {};
        an[k].daily[pol].forEach(function (v, j) { if (v !== null) { var mm = ym(o.d0 + j); sum[mm] = (sum[mm] || 0) + v; cnt[mm] = (cnt[mm] || 0) + 1; } });
        return months.map(function (x) { var n = cnt[x.ym] || 0; return { ym: x.ym, v: n >= 0.75 * x.days ? sum[x.ym] / n : null, days: n, of: x.days }; });
      });
      out.hourly[pol] = st.map(function (s) {
        var sum = new Array(24).fill(0), cnt = new Array(24).fill(0), a = Math.max(0, o.d0 * 24 + TZ - s.h0), b = Math.min(s.n, o.d1 * 24 + TZ - s.h0);
        for (var i2 = a; i2 < b; i2++) { var v = s[pol][i2]; if (v !== null) { var hr = (((s.h0 + i2 - TZ) % 24) + 24) % 24; sum[hr] += v; cnt[hr]++; } }
        return sum.map(function (x, h) { return cnt[h] >= Math.min(20, Math.ceil(0.5 * D)) ? x / cnt[h] : null; });
      });
    });

    out.alertas = alertas(o, out);
    out.resumen = narrativa(o, out);
    return out;
  }

  function alertas(o, k) {
    var A = [], D = k.D;
    k.nodes.forEach(function (s, i) {
      var a = k.analyses[i], q = s.qc && s.qc.pm && s.qc.pm.raw ? s.qc.pm.rej / s.qc.pm.raw : 0;
      if (!s.n) { A.push({ sev: 'warn', title: s.name + ': sin datos cargados', text: 'Importa las lecturas de este nodo para incluirlo en la evaluación.', action: 'Importar CSV' }); return; }
      if (o.nowH !== undefined && R.lastH(s) < o.nowH - 24) {
        A.push({ sev: 'crit', title: s.name + ': sin transmitir desde ' + R.hourLabel(R.lastH(s)).slice(0, 10), text: 'No hay datos recientes; el nodo no aporta a la evaluación actual.', action: 'Revisar energía y conectividad del nodo' });
      }
      if (a.pm25.dayCov < 0.75) {
        A.push({ sev: 'warn', title: s.name + ': cobertura PM2.5 de ' + Math.round(a.pm25.dayCov * 100) + ' %', text: 'Con menos de 75 % de días válidos, el cumplimiento anual de este nodo no es concluyente.', action: 'Recuperar datos o ampliar el periodo' });
      }
      if (q > 0.2) {
        A.push({ sev: 'warn', title: s.name + ': ' + Math.round(q * 100) + ' % de lecturas de PM descartadas', text: 'Valores sobre 1.000 µg/m³ o con PM2.5 mayor que PM10 indican una posible falla del sensor.', action: 'Inspeccionar y calibrar el sensor' });
      }
    });
    k.eventos.slice(0, 3).forEach(function (e) {
      A.push({ sev: 'crit', title: (e.pol === 'pm25' ? 'PM2.5' : 'PM10') + ' ' + fnum(e.value, 1) + ' µg/m³ en ' + e.node, text: e.date + ': ' + Math.round(e.value / e.limit * 100) + ' % del límite diario de ' + e.limit + ' µg/m³.', action: 'Revisar fuentes y actividad portuaria ese día' });
    });
    if (k.excedencias.pm25 + k.excedencias.pm10 > 3) A.push({ sev: 'info', title: (k.excedencias.pm25 + k.excedencias.pm10) + ' días de excedencia en total', text: 'Solo se listan los tres más altos. El calendario del cumplimiento muestra todos.', action: 'Ver Cumplimiento de la norma' });
    if (k.excedencias.no2 > 0) A.push({ sev: 'crit', title: 'NO2: ' + k.excedencias.no2 + ' horas sobre 200 µg/m³', text: 'Excedencia del límite horario de NO2.', action: 'Revisar fuentes de combustión' });
    var m = k.medias.pm25;
    if (m.mean !== null) {
      if (k.meta2030.below) A.push({ sev: 'ok', title: 'PM2.5 ya está por debajo de la meta 2030', text: 'Promedio de ' + fnum(m.mean, 1) + ' µg/m³ frente a la meta de ' + k.meta2030.target + ' µg/m³ (indicativo, según cobertura).', action: 'Mantener y documentar' });
      else A.push({ sev: 'warn', title: 'PM2.5 supera la meta 2030 por ' + fnum(k.meta2030.gap, 1) + ' µg/m³', text: 'Promedio de ' + fnum(m.mean, 1) + ' frente a la meta de ' + k.meta2030.target + ' µg/m³.', action: 'Definir plan de reducción' });
    }
    if (k.excedencias.no2 === 0 && k.medias.no2.mean !== null) A.push({ sev: 'ok', title: 'Sin excedencias horarias de NO2', text: 'Máximo de la red por debajo de 200 µg/m³.', action: 'Sin acción' });
    return A;
  }

  function narrativa(o, k) {
    var m = k.medias, parts = [], red = 'la red de ' + k.nodes.length + ' nodo' + (k.nodes.length === 1 ? '' : 's');
    if (!k.nodes.length) return 'No hay nodos seleccionados.';
    parts.push('Del ' + R.dayToDate(o.d0) + ' al ' + R.dayToDate(o.d1 - 1) + ', ' + red + ' registró un PM2.5 promedio de ' + fnum(m.pm25.mean, 1) + ' µg/m³ (' + (m.pm25.ratio === null ? '–' : Math.round(m.pm25.ratio * 100)) + ' % del límite anual de ' + m.pm25.limit + '), un PM10 de ' + fnum(m.pm10.mean, 1) + ' µg/m³ (' + (m.pm10.ratio === null ? '–' : Math.round(m.pm10.ratio * 100)) + ' % de ' + m.pm10.limit + ') y un NO2 de ' + fnum(m.no2.mean, 1) + ' µg/m³ (' + (m.no2.ratio === null ? '–' : Math.round(m.no2.ratio * 100)) + ' % de ' + m.no2.limit + ').');
    var dn = k.diasNorma.pm25;
    if (dn.valid) parts.push('El ' + fnum(dn.pct * 100, 1) + ' % de los ' + fnum(dn.valid, 0) + ' días-nodo evaluados cumplió el límite diario de PM2.5 de ' + NORM.pm25.d24 + ' µg/m³; hubo ' + k.excedencias.pm25 + ' excedencia' + (k.excedencias.pm25 === 1 ? '' : 's') + ' de PM2.5, ' + k.excedencias.pm10 + ' de PM10 y ' + k.excedencias.no2 + ' horas de NO2 sobre su límite.');
    if (k.meta2030.mean !== null) parts.push(k.meta2030.below ? 'El PM2.5 promedio ya está por debajo de la meta 2030 de ' + k.meta2030.target + ' µg/m³.' : 'Para la meta 2030 de ' + k.meta2030.target + ' µg/m³ falta reducir ' + fnum(k.meta2030.gap, 1) + ' µg/m³.');
    var insuf = k.nodes.filter(function (s, i) { return k.analyses[i].pm25.dayCov < 0.75; }).map(function (s) { return s.name; });
    if (insuf.length) parts.push('Atención: ' + insuf.join(', ') + (insuf.length === 1 ? ' tiene' : ' tienen') + ' cobertura inferior al 75 %, por lo que su cumplimiento anual es solo indicativo.');
    parts.push('Seguimiento indicativo con sensores de bajo costo; no sustituye el reporte oficial con métodos de referencia o equivalentes.');
    return parts.join(' ');
  }

  var api = { compute: compute };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RV.kpis = api;
})(typeof window !== 'undefined' ? window : globalThis);
