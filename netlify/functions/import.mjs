import { getSql } from './_db.mjs';
import { json, checkToken, HOUR_MS } from './_lib.mjs';

const CHUNK = 4000;
const isNum = (v) => v === null || (typeof v === 'number' && isFinite(v));

// POST /api/import  (cabecera x-import-token)
// Cuerpo: { station:{id,datasourceId,lat,lon}, freq, file, rows, qc:{pm:{raw,rej},no2:{raw,rej}},
//           h0, pm25:[], pm10:[], no2:[] }   -> el navegador (o el script) ya agregó a promedios horarios.
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  const denied = checkToken(req); if (denied) return denied;
  try {
    const b = await req.json();
    const id = b?.station?.id;
    if (!id || !Number.isInteger(b.h0) || !Array.isArray(b.pm25) || !Array.isArray(b.pm10) || !Array.isArray(b.no2)
        || b.pm25.length !== b.pm10.length || b.pm25.length !== b.no2.length) {
      return json({ error: 'Cuerpo inválido: se esperan station.id, h0 y arreglos pm25/pm10/no2 de igual largo.' }, 400);
    }
    for (const arr of [b.pm25, b.pm10, b.no2]) if (!arr.every(isNum)) return json({ error: 'Los arreglos solo admiten números o null.' }, 400);
    if (b.pm25.length > 60000) return json({ error: 'Demasiadas horas en una sola carga (máximo 60.000).' }, 413);

    const sql = await getSql();
    const st = b.station;
    await sql`insert into stations (id, datasource_id, name, lat, lon)
              values (${id}, ${st.datasourceId || null}, ${'Nodo ' + id}, ${isFinite(st.lat) ? st.lat : null}, ${isFinite(st.lon) ? st.lon : null})
              on conflict (id) do update set
                datasource_id = coalesce(excluded.datasource_id, stations.datasource_id),
                lat = coalesce(excluded.lat, stations.lat), lon = coalesce(excluded.lon, stations.lon)`;

    const rows = [];
    for (let i = 0; i < b.pm25.length; i++) {
      if (b.pm25[i] === null && b.pm10[i] === null && b.no2[i] === null) continue;
      rows.push({ ts: new Date((b.h0 + i) * HOUR_MS).toISOString(), pm25: b.pm25[i], pm10: b.pm10[i], no2: b.no2[i] });
    }
    for (let i = 0; i < rows.length; i += CHUNK) {
      const part = JSON.stringify(rows.slice(i, i + CHUNK));
      await sql`
        insert into readings_hourly (station_id, ts, pm25, pm10, no2)
        select ${id}, x.ts, x.pm25, x.pm10, x.no2
        from jsonb_to_recordset(${part}::jsonb) as x(ts timestamptz, pm25 real, pm10 real, no2 real)
        on conflict (station_id, ts) do update set
          pm25 = coalesce(excluded.pm25, readings_hourly.pm25),
          pm10 = coalesce(excluded.pm10, readings_hourly.pm10),
          no2  = coalesce(excluded.no2,  readings_hourly.no2)`;
    }
    const q = b.qc || { pm: {}, no2: {} };
    await sql`insert into import_log (station_id, file_name, freq, rows_in, pm_raw, pm_rej, no2_raw, no2_rej, hours_saved)
              values (${id}, ${b.file || null}, ${b.freq || null}, ${b.rows || null},
                      ${q.pm?.raw || 0}, ${q.pm?.rej || 0}, ${q.no2?.raw || 0}, ${q.no2?.rej || 0}, ${rows.length})`;
    return json({ ok: true, station: id, hoursSaved: rows.length });
  } catch (e) {
    return json({ error: 'No se pudo guardar: ' + e.message }, 500);
  }
};
