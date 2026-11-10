import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createFakeSql } from './fake-sql.mjs';
import { STATION_SEED } from './seed.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.__SQL_OVERRIDE = createFakeSql();
globalThis.__IMPORT_TOKEN = 'secreto';
const load = async (n) => (await import(pathToFileURL(path.join(root, `netlify/functions/${n}.mjs`)))).default;
const [stations, readings, imp] = await Promise.all(['stations', 'readings', 'import'].map(load));
const post = (body, token = 'secreto') => imp(new Request('http://x/api/import', { method: 'POST', headers: { 'x-import-token': token }, body: JSON.stringify(body) }));

// la migración SQL siembra los mismos nodos (id, nombre, coordenadas) que usa la base de prueba
const mig = fs.readFileSync(path.join(root, 'netlify/database/migrations/0002_nodos_iniciales.sql'), 'utf8').replace(/\s+/g, ' ');
for (const s of STATION_SEED) assert.ok(mig.includes(`'${s.id}', '${s.datasource_id}', '${s.name}', ${s.lat}, ${s.lon}`), 'migración desalineada: ' + s.id);

// nodos sembrados con nombre de campo
let r = await (await stations(new Request('http://x/api/stations'))).json();
assert.deepEqual(r.stations.map((s) => s.name).sort(), ['Bascula', 'Carbon', 'Sur embarcadero']);

// token inválido
assert.equal((await post({}, 'malo')).status, 401);
// cuerpo inválido
assert.equal((await post({ station: { id: 'A4THH3V9' }, h0: 1, pm25: [1], pm10: [], no2: [] })).status, 400);

// importación y lectura (con hueco)
const h0 = Math.floor(Date.parse('2026-05-01T00:00:00Z') / 3600000);
const ok = await post({ station: { id: 'A4THH3V9', lat: 10.99, lon: -74.77 }, freq: 'Promedios horarios', file: 't.csv', rows: 5,
  qc: { pm: { raw: 5, rej: 1 }, no2: { raw: 5, rej: 0 } }, h0, pm25: [10, null, null, 12.5], pm10: [15, null, null, 20], no2: [20, null, null, 22] });
assert.equal(ok.status, 200); assert.equal((await ok.json()).hoursSaved, 2);
let rd = await (await readings(new Request('http://x/api/readings'))).json();
assert.equal(rd.stations.length, 1);
assert.deepEqual(rd.stations[0], { id: 'A4THH3V9', h0, n: 4, pm25: [10, null, null, 12.5], pm10: [15, null, null, 20], no2: [20, null, null, 22] });

// reimportar solo completa los huecos y no pisa con null
await post({ station: { id: 'A4THH3V9' }, h0, pm25: [null, 11, null, null], pm10: [null, 16, null, null], no2: [null, null, null, null] });
rd = await (await readings(new Request('http://x/api/readings?from=2026-05-01&to=2026-06-01'))).json();
assert.deepEqual(rd.stations[0].pm25, [10, 11, null, 12.5]);
assert.equal((await (await readings(new Request('http://x/api/readings?from=2027-01-01'))).json()).stations.length, 0);

// estadísticas y calidad
r = await (await stations(new Request('http://x/api/stations'))).json();
const c = r.stations.find((s) => s.id === 'A4THH3V9');
assert.equal(c.hours, 3); assert.equal(c.qc.pm.rej, 1); assert.deepEqual(c.files, ['t.csv']);

// renombrar
assert.equal((await stations(new Request('http://x/api/stations?id=A4THH3V9', { method: 'PUT', headers: { 'x-import-token': 'secreto' }, body: JSON.stringify({ name: 'Carbón' }) }))).status, 200);
assert.equal((await stations(new Request('http://x/api/stations?id=ZZZ', { method: 'PUT', headers: { 'x-import-token': 'secreto' }, body: JSON.stringify({ name: 'x' }) }))).status, 404);
assert.equal((await stations(new Request('http://x/api/stations?id=A4THH3V9', { method: 'PUT', body: JSON.stringify({ name: 'x' }) }))).status, 401);
console.log('API: todas las pruebas pasaron');
