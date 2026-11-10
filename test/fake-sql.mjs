// Base de datos en memoria que imita las consultas de las funciones. Sirve para pruebas y para `npm run dev:mock`.
// No valida el SQL contra Postgres: solo el enrutamiento y la forma de las respuestas.
import { STATION_SEED } from '../netlify/functions/_seed.mjs';

export function createFakeSql() {
  const stations = new Map(STATION_SEED.map((s) => [s.id, { ...s }]));
  const readings = new Map();   // "id|iso" -> {station_id, ts, pm25, pm10, no2}
  const logs = [];
  async function sql(strings, ...v) {
    const t = strings.join('?').replace(/\s+/g, ' ').trim().toLowerCase();
    if (t.startsWith('select s.id, s.datasource_id')) {
      return [...stations.values()].map((s) => {
        const rs = [...readings.values()].filter((r) => r.station_id === s.id).map((r) => r.ts).sort();
        const L = logs.filter((l) => l.station_id === s.id), sum = (k) => L.reduce((a, l) => a + (l[k] || 0), 0);
        return { id: s.id, datasource_id: s.datasource_id, name: s.name, lat: s.lat, lon: s.lon,
          first_ts: rs[0] || null, last_ts: rs[rs.length - 1] || null, hours: rs.length,
          pm_raw: sum('pm_raw'), pm_rej: sum('pm_rej'), no2_raw: sum('no2_raw'), no2_rej: sum('no2_rej'), rows_in: sum('rows_in'),
          files: [...new Set(L.map((l) => l.file_name))], freq: L.length ? L[L.length - 1].freq : null };
      }).sort((a, b) => a.name.localeCompare(b.name));
    }
    if (t.startsWith('update stations set name')) {
      const [name, id] = v; const s = stations.get(id); if (!s) return []; s.name = name; return [{ id, name }];
    }
    if (t.startsWith('select station_id, ts, pm25')) {
      const [from, to] = v;
      return [...readings.values()].filter((r) => r.ts >= from && r.ts < to)
        .sort((a, b) => (a.station_id + a.ts).localeCompare(b.station_id + b.ts));
    }
    if (t.startsWith('insert into stations')) {
      const [id, ds, name, lat, lon] = v; const s = stations.get(id);
      if (s) { s.datasource_id = ds || s.datasource_id; s.lat = lat ?? s.lat; s.lon = lon ?? s.lon; }
      else stations.set(id, { id, datasource_id: ds, name, lat, lon });
      return [];
    }
    if (t.startsWith('insert into readings_hourly')) {
      const [id, part] = v;
      for (const x of JSON.parse(part)) {
        const k = id + '|' + x.ts, old = readings.get(k) || {};
        readings.set(k, { station_id: id, ts: x.ts, pm25: x.pm25 ?? old.pm25 ?? null, pm10: x.pm10 ?? old.pm10 ?? null, no2: x.no2 ?? old.no2 ?? null });
      }
      return [];
    }
    if (t.startsWith('insert into import_log')) {
      const [station_id, file_name, freq, rows_in, pm_raw, pm_rej, no2_raw, no2_rej, hours_saved] = v;
      logs.push({ station_id, file_name, freq, rows_in, pm_raw, pm_rej, no2_raw, no2_rej, hours_saved }); return [];
    }
    throw new Error('Consulta no soportada por la base de prueba: ' + t.slice(0, 60));
  }
  return sql;
}
