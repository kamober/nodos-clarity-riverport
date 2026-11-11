import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../public/js/analysis.js'), K = require('../public/js/kpis.js');

// --- sintético: nodo A (3 días: 10, 40, inválido) y nodo B (3 días de 10)
const d0 = 20000, h0 = d0 * 24 + R.TZ, mk = (f) => Array.from({ length: 72 }, (_, i) => f(i));
const A = { id: 'A', name: 'Nodo A', h0, n: 72, pm25: mk((i) => i < 24 ? 10 : i < 48 ? 40 : i < 58 ? 80 : null), pm10: mk((i) => i < 24 ? 15 : i < 48 ? 60 : i < 58 ? 120 : null), no2: mk(() => 20), qc: { pm: { raw: 100, rej: 30 } } };
const B = { id: 'B', name: 'Nodo B', h0, n: 72, pm25: mk(() => 10), pm10: mk(() => 15), no2: mk(() => 30), qc: { pm: { raw: 100, rej: 0 } } };
const stations = [A, B], analyses = stations.map((s) => R.analyze(s, d0, d0 + 3));
const nowH = h0 + 72;
const k = K.compute({ stations, analyses, d0, d1: d0 + 3, lim: '2018', hidden: {}, nowH });

assert.equal(k.cumplimiento.total, 12);                         // 6 estándares x 2 nodos
assert.equal(k.diasNorma.pm25.valid, 5); assert.equal(k.diasNorma.pm25.within, 4);   // A: 10 ok, 40 excede; B: 3 ok
assert.equal(k.excedencias.pm25, 1); assert.equal(k.excedencias.pm10, 0); assert.equal(k.excedencias.no2, 0);
assert.equal(k.eventos.length, 1); assert.equal(k.eventos[0].node, 'Nodo A'); assert.equal(k.eventos[0].date, R.dayToDate(d0 + 1));
// nodo B tiene cobertura 100 %, A 67 %: la media usa solo B
assert.equal(k.medias.pm25.mean, 10); assert.equal(k.medias.pm25.n, 1); assert.equal(k.medias.pm25.partial, false);
assert.equal(k.meta2030.below, true);
assert.equal(k.disponibilidad.online, 2);
assert.deepEqual(k.ica[0].counts, [1, 0, 1, 0, 0, 0]);         // A: 10 -> Buena, 40 -> Dañina sensibles (38-55)
assert.equal(k.months.length, 1);
assert.equal(k.monthly.pm25[1][0].v, 10);
assert.equal(k.hourly.pm25[1].length, 24); assert.equal(k.hourly.pm25[1][0], 10);
assert.ok(k.alertas.some((a) => a.title.includes('Nodo A') && a.title.includes('cobertura')));
assert.ok(k.alertas.some((a) => a.title.includes('descartadas')));
assert.ok(k.resumen.includes('2 nodos') && k.resumen.includes('Atención: Nodo A'));
// filtro de nodos
const k2 = K.compute({ stations, analyses, d0, d1: d0 + 3, lim: '2030', hidden: { A: true }, nowH });
assert.equal(k2.nodes.length, 1); assert.equal(k2.excedencias.total, 0); assert.equal(k2.medias.pm25.limit, 15);
assert.equal(k2.cumplimiento.index, 1);
assert.deepEqual(k2.excluidos, ['Nodo A']); assert.equal(k2.total, 2);
assert.ok(k2.resumen.startsWith('Vista filtrada: se muestran 1 de 2 nodos (Nodo B); excluidos: Nodo A.'));
assert.equal(k.excluidos.length, 0); assert.ok(!k.resumen.includes('Vista filtrada'));

// --- datos reales (solo si están disponibles): debe coincidir con el cálculo independiente en pandas
const U = '/mnt/user-data/uploads/', files = ['aa59dadc-JBXWQEMWEQ.csv', 'e845f1ee-JB72VQIKWA.csv', '6abfea8c-JBXYK18HAZ.csv'];
if (files.every((f) => fs.existsSync(U + f))) {
  const core = require('../public/core.js');
  const st = files.map((f) => core.processClarityCsv(fs.readFileSync(U + f, 'utf8'), f)).map((s) => ({ ...s, name: s.id }));
  const endDay = Math.max(...st.map((s) => R.hourToDay(R.lastH(s)))) + 1, e0 = endDay - 365;
  const an = st.map((s) => R.analyze(s, e0, endDay));
  const kk = K.compute({ stations: st, analyses: an, d0: e0, d1: endDay, lim: '2018', hidden: {}, nowH: Math.max(...st.map(R.lastH)) });
  // pandas: A9VXKKWG 12.73 (65 d), A4THH3V9 9.79 (331 d), A4THKKHX 11.46 (304 d); solo cuentan los de cobertura >= 75 %
  assert.ok(Math.abs(kk.medias.pm25.mean - (9.79 + 11.46) / 2) < 0.02);
  assert.equal(kk.excedencias.pm25, 1 + 1 + 2); assert.equal(kk.excedencias.pm10, 0); assert.equal(kk.excedencias.no2, 0);
  assert.equal(kk.diasNorma.pm25.valid, 65 + 331 + 304);
  console.log('kpis con datos reales: coinciden con pandas (PM2.5 red', kk.medias.pm25.mean.toFixed(2), '| índice', (kk.cumplimiento.index * 100).toFixed(0) + ' % | días en norma', (kk.diasNorma.pm25.pct * 100).toFixed(1) + ' %)');
}
console.log('kpis: todas las pruebas pasaron');
