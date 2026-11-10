import { STATION_SEED } from './_seed.mjs';

let ready = null;

/** Devuelve la función sql (plantilla etiquetada) y se asegura de que exista el esquema. */
export async function getSql() {
  if (globalThis.__SQL_OVERRIDE) return globalThis.__SQL_OVERRIDE; // pruebas
  const { neon } = await import('@netlify/neon');   // usa NETLIFY_DATABASE_URL
  const sql = neon();
  if (!ready) ready = ensureSchema(sql).catch((e) => { ready = null; throw e; });
  await ready;
  return sql;
}

async function ensureSchema(sql) {
  await sql`create table if not exists stations (
    id text primary key, datasource_id text, name text not null,
    lat double precision, lon double precision, created_at timestamptz not null default now())`;
  await sql`create table if not exists readings_hourly (
    station_id text not null references stations(id) on delete cascade,
    ts timestamptz not null, pm25 real, pm10 real, no2 real,
    primary key (station_id, ts))`;
  await sql`create index if not exists readings_hourly_ts_idx on readings_hourly (ts)`;
  await sql`create table if not exists import_log (
    id bigserial primary key, station_id text not null references stations(id) on delete cascade,
    file_name text, freq text, rows_in integer, pm_raw integer, pm_rej integer,
    no2_raw integer, no2_rej integer, hours_saved integer, imported_at timestamptz not null default now())`;
  for (const s of STATION_SEED) {
    await sql`insert into stations (id, datasource_id, name, lat, lon)
              values (${s.id}, ${s.datasource_id}, ${s.name}, ${s.lat}, ${s.lon})
              on conflict (id) do nothing`;
  }
}
