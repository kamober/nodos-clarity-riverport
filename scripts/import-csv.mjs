// Carga CSV de Clarity en la base a través del sitio desplegado (no necesita conectarse a la base).
// Uso:  SITE_URL=https://tu-sitio.netlify.app IMPORT_TOKEN=... node scripts/import-csv.mjs data/*.csv
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const core = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/core.js'));
const site = (process.env.SITE_URL || '').replace(/\/$/, ''), token = process.env.IMPORT_TOKEN;
const files = process.argv.slice(2);
if (!site || !token || !files.length) { console.error('Uso: SITE_URL=https://... IMPORT_TOKEN=... node scripts/import-csv.mjs archivo.csv [...]'); process.exit(1); }

const CHUNK = 4000;
for (const f of files) {
  const s = core.processClarityCsv(fs.readFileSync(f, 'utf8'), path.basename(f));
  let saved = 0;
  for (let i = 0; i < s.n; i += CHUNK) {
    const body = { station: { id: s.id, datasourceId: s.datasourceId, lat: s.lat, lon: s.lon }, freq: s.freq, file: s.files[0],
      rows: i === 0 ? s.rows : 0, qc: i === 0 ? s.qc : { pm: {}, no2: {} },
      h0: s.h0 + i, pm25: s.pm25.slice(i, i + CHUNK), pm10: s.pm10.slice(i, i + CHUNK), no2: s.no2.slice(i, i + CHUNK) };
    const r = await fetch(site + '/api/import', { method: 'POST', headers: { 'content-type': 'application/json', 'x-import-token': token }, body: JSON.stringify(body) });
    const out = await r.json();
    if (!r.ok) { console.error(path.basename(f), 'falló:', out.error); process.exit(1); }
    saved += out.hoursSaved;
  }
  console.log(path.basename(f), '->', s.id, saved, 'horas guardadas');
}
