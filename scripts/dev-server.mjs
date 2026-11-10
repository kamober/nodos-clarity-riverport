// Servidor local sin base de datos real: sirve /public y las funciones de /netlify/functions
// con una base en memoria. Uso: node scripts/dev-server.mjs [archivo.csv ...]   (PORT=8888 por defecto)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createFakeSql } from '../test/fake-sql.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const core = require(path.join(root, 'public/core.js'));

globalThis.__SQL_OVERRIDE = createFakeSql();
globalThis.__IMPORT_TOKEN = 'dev';

const handlers = {};
for (const n of ['stations', 'readings', 'import']) handlers[n] = (await import(pathToFileURL(path.join(root, `netlify/functions/${n}.mjs`)))).default;

export async function loadCsv(file) {
  const s = core.processClarityCsv(fs.readFileSync(file, 'utf8'), path.basename(file));
  const body = { station: { id: s.id, datasourceId: s.datasourceId, lat: s.lat, lon: s.lon }, freq: s.freq, file: s.files[0],
    rows: s.rows, qc: s.qc, h0: s.h0, pm25: s.pm25, pm10: s.pm10, no2: s.no2 };
  const r = await handlers.import(new Request('http://local/api/import', { method: 'POST', headers: { 'x-import-token': 'dev' }, body: JSON.stringify(body) }));
  console.log('CSV', path.basename(file), '->', await r.text());
}
for (const f of process.argv.slice(2)) await loadCsv(f);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    if (url.pathname.startsWith('/api/')) {
      const h = handlers[url.pathname.slice(5)];
      if (!h) { res.writeHead(404); return res.end('{}'); }
      const chunks = []; for await (const c of req) chunks.push(c);
      const r = await h(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }));
      res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer()));
    }
    let p = path.join(root, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
    if (!p.startsWith(path.join(root, 'public')) || !fs.existsSync(p)) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(fs.readFileSync(p));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
const port = +process.env.PORT || 8888;
server.listen(port, () => console.log('Nodos Clarity Riverport (datos en memoria) en http://localhost:' + port + '  token de importación: dev'));
