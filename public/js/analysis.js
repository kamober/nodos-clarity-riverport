/* Análisis y norma (sin DOM, probado en node). Resolución 2254 de 2017, MinAmbiente. */
(function (root) {
  'use strict';
  var TZ = 5;                                            // Colombia: UTC-5 fijo
  var NORM = {
    pm25: { name: 'PM2.5', d24: 37, annual: { 2018: 25, 2030: 15 } },   // 24 h: 37 desde 1-jul-2018
    pm10: { name: 'PM10', d24: 75, annual: { 2018: 50, 2030: 30 } },    // 24 h: 75 desde 1-jul-2018
    no2:  { name: 'NO2',  h1: 200, annual: { 2018: 60, 2030: 40 } }
  };
  var ICA = [
    { n: 'Buena', c: '--ica1' }, { n: 'Aceptable', c: '--ica2' }, { n: 'Dañina a la salud de grupos sensibles', c: '--ica3' },
    { n: 'Dañina para la salud', c: '--ica4' }, { n: 'Muy dañina para la salud', c: '--ica5' }, { n: 'Peligrosa', c: '--ica6' }
  ];
  // Puntos de corte del ICA (Res. 2254/2017, Tabla 6): PM 24 h y NO2 1 h, en µg/m³
  var CUT = { pm25: [12, 37, 55, 150, 250, 500], pm10: [54, 154, 254, 354, 424, 604], no2: [100, 189, 677, 1221, 2349, 3853] };
  function icaIdx(pol, v) { var c = CUT[pol]; for (var i = 0; i < c.length; i++) if (v <= c[i] + 0.999) return i; return 5; }

  var METRICS = {
    pm25_1h:  { pol: 'pm25', win: 1,  label: 'PM2.5 · promedio 1 hora [µg/m³]' },
    pm25_24h: { pol: 'pm25', win: 24, label: 'PM2.5 · promedio 24 horas [µg/m³]' },
    pm10_1h:  { pol: 'pm10', win: 1,  label: 'PM10 · promedio 1 hora [µg/m³]' },
    pm10_24h: { pol: 'pm10', win: 24, label: 'PM10 · promedio 24 horas [µg/m³]' },
    no2_1h:   { pol: 'no2',  win: 1,  label: 'NO2 · promedio 1 hora [µg/m³]' }
  };

  function dayToDate(d) { return new Date(d * 86400000).toISOString().slice(0, 10); }
  function dateToDay(s) { var p = s.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
  function hourToDay(h) { return Math.floor((h - TZ) / 24); }
  function hourLabel(h) { var d = new Date((h - TZ) * 3600000).toISOString(); return d.slice(0, 10) + ' ' + d.slice(11, 16); }
  function lastH(st) { return st.n ? st.h0 + st.n - 1 : -Infinity; }
  function firstH(st) { return st.n ? st.h0 : Infinity; }

  /* Valor de una métrica en la hora endH: 1 h = lectura de esa hora; 24 h = media de las 24 h previas con >=18 válidas. */
  function valueAt(st, metric, endH) {
    var m = METRICS[metric], arr = st[m.pol];
    if (!st.n || endH < st.h0 || endH > lastH(st)) return null;
    if (m.win === 1) return arr[endH - st.h0];
    var s = 0, c = 0;
    for (var h = endH - 23; h <= endH; h++) { var i = h - st.h0; if (i >= 0 && i < st.n && arr[i] !== null) { s += arr[i]; c++; } }
    return c >= 18 ? s / c : null;
  }

  /* Como valueAt, pero para promedios de 1 h usa la última lectura de las `back` horas previas si la hora exacta no tiene dato. */
  function valueNear(st, metric, endH, back) {
    var v = valueAt(st, metric, endH);
    if (v !== null || METRICS[metric].win !== 1) return { v: v, ago: 0 };
    for (var k = 1; k <= back; k++) { var w = valueAt(st, metric, endH - k); if (w !== null) return { v: w, ago: k }; }
    return { v: null, ago: 0 };
  }

  /* Evaluación de un nodo en el periodo de días locales [d0, d1). */
  function analyze(st, d0, d1) {
    var D = d1 - d0, hFrom = d0 * 24 + TZ, hTo = d1 * 24 + TZ;
    var out = { D: D, daily: { pm25: new Array(D).fill(null), pm10: new Array(D).fill(null), no2: new Array(D).fill(null) } };
    ['pm25', 'pm10', 'no2'].forEach(function (k) {
      var arr = st[k], sum = new Array(D).fill(0), cnt = new Array(D).fill(0), hv = 0, hs = 0, hexc = 0, hmax = null;
      var i0 = Math.max(0, hFrom - st.h0), i1 = Math.min(st.n, hTo - st.h0);
      for (var i = i0; i < i1; i++) {
        var v = arr[i]; if (v === null) continue;
        var di = Math.floor((st.h0 + i - TZ) / 24) - d0; sum[di] += v; cnt[di]++; hv++; hs += v;
        if (hmax === null || v > hmax) hmax = v;
        if (k === 'no2' && v > NORM.no2.h1) hexc++;
      }
      var vd = 0, ds = 0, dmax = null, dexc = 0;
      for (var j = 0; j < D; j++) {
        if (cnt[j] >= 18) {
          var m = sum[j] / cnt[j]; out.daily[k][j] = m; vd++; ds += m;
          if (dmax === null || m > dmax) dmax = m;
          if (NORM[k].d24 && m > NORM[k].d24) dexc++;
        }
      }
      out[k] = { validDays: vd, dayCov: D ? vd / D : 0, annualPM: vd ? ds / vd : null, validHours: hv, hourCov: D ? hv / (D * 24) : 0,
                 annualHr: hv ? hs / hv : null, hmax: hmax, hexc: hexc, dmax: dmax, dexc: dexc };
    });
    return out;
  }

  /* Filas de la matriz de cumplimiento. analyses[i] corresponde a stations[i]. */
  function evalRows(analyses, lim) {
    var rows = [
      { key: 'pm25a', pol: 'pm25', std: 'PM2.5', t: 'Anual', limit: NORM.pm25.annual[lim] },
      { key: 'pm2524', pol: 'pm25', std: 'PM2.5', t: '24 horas', limit: NORM.pm25.d24 },
      { key: 'pm10a', pol: 'pm10', std: 'PM10', t: 'Anual', limit: NORM.pm10.annual[lim] },
      { key: 'pm1024', pol: 'pm10', std: 'PM10', t: '24 horas', limit: NORM.pm10.d24 },
      { key: 'no2a', pol: 'no2', std: 'NO2', t: 'Anual', limit: NORM.no2.annual[lim] },
      { key: 'no21', pol: 'no2', std: 'NO2', t: '1 hora', limit: NORM.no2.h1 }
    ];
    rows.forEach(function (r) {
      r.cells = analyses.map(function (an) {
        var a = an[r.pol], c = {};
        if (r.t === 'Anual') {
          c.value = r.pol === 'no2' ? a.annualHr : a.annualPM;
          c.cov = r.pol === 'no2' ? a.hourCov : a.dayCov;
          c.n = r.pol === 'no2' ? a.validHours : a.validDays; c.unit = r.pol === 'no2' ? 'h' : 'días';
          if (c.value === null) c.status = 'na';
          else if (c.cov >= 0.75) c.status = c.value > r.limit ? 'bad' : 'ok';
          else c.status = c.value > r.limit ? 'warnbad' : 'warn';
        } else if (r.t === '24 horas') {
          c.value = a.dmax; c.cov = a.dayCov; c.exc = a.dexc; c.n = a.validDays; c.unit = 'días';
          c.status = a.validDays === 0 ? 'na' : a.dexc > 0 ? 'bad' : c.cov >= 0.75 ? 'ok' : 'warn';
        } else {
          c.value = a.hmax; c.cov = a.hourCov; c.exc = a.hexc; c.n = a.validHours; c.unit = 'h';
          c.status = a.validHours === 0 ? 'na' : a.hexc > 0 ? 'bad' : c.cov >= 0.75 ? 'ok' : 'warn';
        }
        return c;
      });
    });
    return rows;
  }

  var api = { TZ: TZ, NORM: NORM, ICA: ICA, CUT: CUT, METRICS: METRICS, icaIdx: icaIdx, dayToDate: dayToDate, dateToDay: dateToDay,
              hourToDay: hourToDay, hourLabel: hourLabel, lastH: lastH, firstH: firstH, valueAt: valueAt, valueNear: valueNear, analyze: analyze, evalRows: evalRows };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RV = api;
})(typeof window !== 'undefined' ? window : globalThis);
