/* Nodos Clarity Riverport - núcleo de procesamiento (se usa igual en el navegador y en node) */
var NO2_PPB_TO_UGM3 = 1.88;   // NO2: 46.01 g/mol a 25 °C y 101.325 kPa (condiciones de referencia)
var HOUR_MS = 3600000;
var PM_MAX = 1000;            // µg/m3: por encima se considera lectura inválida
var PM_RATIO = 1.05;          // PM2.5 no puede superar a PM10 (tolerancia 5 %)
var MIN_SAMPLES_HOUR = 3;     // muestras mínimas para promediar una hora (nodos con muestreo ~17 min)

function splitLine(line) {
  if (line.indexOf('"') < 0) return line.split(',');
  var out = [], cur = '', q = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function num(s) {
  if (s === undefined || s === '') return NaN;
  var v = +s;
  return isFinite(v) ? v : NaN;
}

function median(a) {
  if (!a.length) return NaN;
  var b = a.slice().sort(function (x, y) { return x - y; });
  var m = b.length >> 1;
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
}

/* Valida el par PM2.5 / PM10 de una lectura. Devuelve {p25, p10} con NaN en lo inválido. */
function qcPM(p25, p10) {
  var bad = false;
  if (isFinite(p25) && (p25 < 0 || p25 > PM_MAX)) bad = true;
  if (isFinite(p10) && (p10 < 0 || p10 > PM_MAX)) bad = true;
  if (isFinite(p25) && isFinite(p10) && p25 > p10 * PM_RATIO) bad = true;
  return bad ? null : { p25: p25, p10: p10 };
}

/* Procesa el texto de un CSV exportado de Clarity y devuelve una estación con serie horaria. */
function processClarityCsv(text, fileName) {
  var lines = text.split(/\r?\n/);
  var header = splitLine(lines[0]);
  var ix = {};
  header.forEach(function (h, i) { ix[h.trim()] = i; });

  var fmt, C;
  if (ix['time'] !== undefined && ix['pm2_5ConcMassIndividual.value'] !== undefined) {
    fmt = 'individual';
    C = { t: ix['time'], p25: ix['pm2_5ConcMassIndividual.value'], p10: ix['pm10ConcMassIndividual.value'],
          no2: ix['no2ConcIndividual.value'], no2s: ix['no2ConcIndividual.status'] };
  } else if (ix['startOfPeriod'] !== undefined && ix['pm2_5ConcMass1HourMean.value'] !== undefined) {
    fmt = 'hourly';
    C = { t: ix['startOfPeriod'], p25: ix['pm2_5ConcMass1HourMean.value'], p10: ix['pm10ConcMass1HourMean.value'],
          no2: ix['no2Conc1HourMean.value'], no2s: ix['no2Conc1HourMean.status'] };
  } else {
    throw new Error('No reconozco el formato de ' + fileName + '. Se esperan columnas de Clarity como "time" o "startOfPeriod" y "pm2_5ConcMass…value".');
  }
  var iId = ix['sourceId'], iDs = ix['datasourceId'], iLat = ix['locationLatitude'], iLon = ix['locationLongitude'];
  if (iId === undefined) throw new Error('Falta la columna sourceId en ' + fileName + '.');

  var buckets = {};           // hora (entero) -> acumuladores
  var lats = [], lons = [];
  var sourceId = null, dsId = null;
  var qc = { pm: { raw: 0, rej: 0 }, no2: { raw: 0, rej: 0 } };
  var minH = Infinity, maxH = -Infinity, rows = 0;

  for (var r = 1; r < lines.length; r++) {
    var line = lines[r];
    if (!line) continue;
    var f = splitLine(line);
    var ts = Date.parse(f[C.t]);
    if (!isFinite(ts)) continue;
    rows++;
    if (sourceId === null) { sourceId = f[iId]; dsId = iDs !== undefined ? f[iDs] : ''; }
    var la = num(f[iLat]), lo = num(f[iLon]);
    if (isFinite(la) && isFinite(lo)) { lats.push(la); lons.push(lo); }

    var h = Math.floor(ts / HOUR_MS);
    var b = buckets[h];
    if (!b) b = buckets[h] = { s25: 0, s10: 0, nPM: 0, sN: 0, nN: 0 };
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;

    var p25 = num(f[C.p25]), p10 = num(f[C.p10]);
    if (isFinite(p25) || isFinite(p10)) {
      qc.pm.raw++;
      var ok = qcPM(p25, p10);
      if (!ok || !isFinite(p25) || !isFinite(p10)) qc.pm.rej++;
      else { b.s25 += p25; b.s10 += p10; b.nPM++; }
    }
    var n2 = num(f[C.no2]);
    if (isFinite(n2)) {
      qc.no2.raw++;
      var st = (f[C.no2s] || '').toLowerCase();
      if (st.indexOf('error') >= 0 || n2 < 0) qc.no2.rej++;
      else { b.sN += n2; b.nN++; }
    }
  }
  if (!rows) throw new Error('El archivo ' + fileName + ' no tiene filas con fecha válida.');

  var need = fmt === 'individual' ? MIN_SAMPLES_HOUR : 1;
  var n = maxH - minH + 1;
  var pm25 = new Array(n).fill(null), pm10 = new Array(n).fill(null), no2 = new Array(n).fill(null);
  for (var k in buckets) {
    var i = (+k) - minH, bb = buckets[k];
    if (bb.nPM >= need) {
      pm25[i] = Math.round(bb.s25 / bb.nPM * 10) / 10;
      pm10[i] = Math.round(bb.s10 / bb.nPM * 10) / 10;
    }
    if (bb.nN >= need) no2[i] = Math.round(bb.sN / bb.nN * NO2_PPB_TO_UGM3 * 10) / 10;
  }
  return {
    id: sourceId, datasourceId: dsId, freq: fmt === 'individual' ? 'Muestras individuales (~17 min)' : 'Promedios horarios',
    lat: median(lats), lon: median(lons), h0: minH, n: n, pm25: pm25, pm10: pm10, no2: no2,
    qc: qc, files: [fileName], rows: rows
  };
}

/* Une dos cargas de la misma estación; los datos nuevos reemplazan a los anteriores en las horas que traen. */
function mergeStations(a, b) {
  var h0 = Math.min(a.h0, b.h0), end = Math.max(a.h0 + a.n, b.h0 + b.n), n = end - h0;
  var out = {};
  for (var k in b) out[k] = b[k];
  out.h0 = h0; out.n = n;
  ['pm25', 'pm10', 'no2'].forEach(function (key) {
    var arr = new Array(n).fill(null), i;
    for (i = 0; i < a.n; i++) arr[a.h0 - h0 + i] = a[key][i];
    for (i = 0; i < b.n; i++) if (b[key][i] !== null) arr[b.h0 - h0 + i] = b[key][i];
    out[key] = arr;
  });
  out.qc = {
    pm: { raw: a.qc.pm.raw + b.qc.pm.raw, rej: a.qc.pm.rej + b.qc.pm.rej },
    no2: { raw: a.qc.no2.raw + b.qc.no2.raw, rej: a.qc.no2.rej + b.qc.no2.rej }
  };
  out.files = a.files.concat(b.files);
  out.rows = a.rows + b.rows;
  return out;
}

if (typeof module !== 'undefined') module.exports = { processClarityCsv: processClarityCsv, mergeStations: mergeStations, qcPM: qcPM };
