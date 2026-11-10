import { getSql } from './_db.mjs';
import { json, HOUR_MS } from './_lib.mjs';

// GET /api/readings?from=2026-01-01&to=2026-12-31  (ambos opcionales)
// Devuelve, por nodo, series horarias en una cuadrícula continua: { id, h0, n, pm25[], pm10[], no2[] }
// donde h0 es la hora UTC como entero (epoch / 3600000) y los huecos son null.
export default async (req) => {
  try {
    const sql = await getSql();
    const q = new URL(req.url).searchParams;
    const from = q.get('from') ? new Date(q.get('from')) : new Date('1970-01-01');
    const to = q.get('to') ? new Date(q.get('to')) : new Date('2100-01-01');
    if (isNaN(from) || isNaN(to)) return json({ error: 'Fechas inválidas.' }, 400);

    const rows = await sql`
      select station_id, ts, pm25, pm10, no2
      from readings_hourly where ts >= ${from.toISOString()} and ts < ${to.toISOString()}
      order by station_id, ts`;

    const by = new Map();
    for (const r of rows) {
      if (!by.has(r.station_id)) by.set(r.station_id, []);
      by.get(r.station_id).push(r);
    }
    const stations = [];
    for (const [id, list] of by) {
      const hs = list.map((r) => Math.floor(new Date(r.ts).getTime() / HOUR_MS));
      const h0 = hs[0], n = hs[hs.length - 1] - h0 + 1;
      const pm25 = new Array(n).fill(null), pm10 = new Array(n).fill(null), no2 = new Array(n).fill(null);
      list.forEach((r, i) => { const k = hs[i] - h0; pm25[k] = r.pm25; pm10[k] = r.pm10; no2[k] = r.no2; });
      stations.push({ id, h0, n, pm25, pm10, no2 });
    }
    return json({ stations });   // sin caché: tras importar, la vista debe ver los datos nuevos de inmediato
  } catch (e) {
    return json({ error: 'Error de base de datos: ' + e.message }, 500);
  }
};
