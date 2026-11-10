import { getSql } from './_db.mjs';
import { json, checkToken } from './_lib.mjs';

export default async (req) => {
  try {
    const sql = await getSql();

    if (req.method === 'GET') {
      const rows = await sql`
        select s.id, s.datasource_id, s.name, s.lat, s.lon,
               min(r.ts) as first_ts, max(r.ts) as last_ts, count(r.ts)::int as hours,
               (select coalesce(sum(pm_raw),0)::int  from import_log l where l.station_id = s.id) as pm_raw,
               (select coalesce(sum(pm_rej),0)::int  from import_log l where l.station_id = s.id) as pm_rej,
               (select coalesce(sum(no2_raw),0)::int from import_log l where l.station_id = s.id) as no2_raw,
               (select coalesce(sum(no2_rej),0)::int from import_log l where l.station_id = s.id) as no2_rej,
               (select coalesce(sum(rows_in),0)::int from import_log l where l.station_id = s.id) as rows_in,
               (select array_agg(distinct file_name) from import_log l where l.station_id = s.id) as files,
               (select freq from import_log l where l.station_id = s.id order by imported_at desc limit 1) as freq
        from stations s left join readings_hourly r on r.station_id = s.id
        group by s.id order by s.name`;
      return json({
        stations: rows.map((r) => ({
          id: r.id, datasourceId: r.datasource_id, name: r.name, lat: r.lat, lon: r.lon,
          firstTs: r.first_ts, lastTs: r.last_ts, hours: r.hours,
          qc: { pm: { raw: r.pm_raw, rej: r.pm_rej }, no2: { raw: r.no2_raw, rej: r.no2_rej } },
          rows: r.rows_in, files: (r.files || []).filter(Boolean), freq: r.freq || ''
        }))
      });
    }

    if (req.method === 'PUT') {                       // renombrar un nodo
      const denied = checkToken(req); if (denied) return denied;
      const id = new URL(req.url).searchParams.get('id');
      const { name } = await req.json();
      if (!id || !name || !String(name).trim()) return json({ error: 'Falta id o nombre.' }, 400);
      const out = await sql`update stations set name = ${String(name).trim().slice(0, 80)} where id = ${id} returning id, name`;
      if (!out.length) return json({ error: 'Nodo no encontrado.' }, 404);
      return json(out[0]);
    }

    return json({ error: 'Método no permitido.' }, 405);
  } catch (e) {
    return json({ error: 'Error de base de datos: ' + e.message }, 500);
  }
};
