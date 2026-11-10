import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url)('../public/js/analysis.js');

// 3 días locales completos: día1 todo 10, día2 todo 40 (excede PM2.5 37), día3 solo 10 horas (inválido)
const d0 = 20000, h0 = d0 * 24 + R.TZ;
const pm25 = [], pm10 = [], no2 = [];
for (let i = 0; i < 72; i++) { const v = i < 24 ? 10 : i < 48 ? 40 : (i < 58 ? 80 : null); pm25.push(v); pm10.push(v === null ? null : v * 1.5); no2.push(i === 5 ? 250 : 20); }
const st = { h0, n: 72, pm25, pm10, no2 };
const a = R.analyze(st, d0, d0 + 3);
assert.equal(a.pm25.validDays, 2); assert.equal(+a.pm25.annualPM.toFixed(6), 25);
assert.equal(a.pm25.dexc, 1); assert.equal(a.pm25.dmax, 40); assert.equal(a.pm10.dexc, 0);          // PM10 60 < 75
assert.equal(a.no2.hexc, 1); assert.equal(a.no2.hmax, 250); assert.equal(a.pm25.dayCov, 2 / 3);
const rows = R.evalRows([a], '2018');
const get = (k) => rows.find((r) => r.key === k).cells[0];
assert.equal(get('pm25a').status, 'warn');     // 25 no excede 25 pero cobertura 67 % < 75 %
assert.equal(get('pm2524').status, 'bad');
assert.equal(get('no21').status, 'bad');
assert.equal(R.evalRows([a], '2030').find((r) => r.key === 'pm25a').limit, 15);
assert.equal(R.evalRows([a], '2030').find((r) => r.key === 'pm25a').cells[0].status, 'warnbad'); // 25 > 15, cobertura insuficiente
// valueAt / valueNear
assert.equal(R.valueAt(st, 'pm25_1h', h0 + 3), 10);
assert.equal(R.valueAt(st, 'pm25_24h', h0 + 23), 10);
assert.equal(R.valueAt(st, 'pm25_24h', h0 + 71), null);   // últimas 24 h con solo 10 válidas
assert.deepEqual(R.valueNear(st, 'pm25_1h', h0 + 60, 3), { v: 80, ago: 3 }); // hora 60 sin dato; las 58 y 59 tampoco; la 57 sí
console.log('analysis: todas las pruebas pasaron');
