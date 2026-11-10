-- Esquema de Nodos Clarity Riverport (Postgres / Netlify DB).
-- Las funciones lo aplican solas la primera vez (netlify/functions/_db.mjs);
-- este archivo queda como referencia y para ejecutarlo a mano si se prefiere.

create table if not exists stations (
  id            text primary key,              -- sourceId de Clarity
  datasource_id text,
  name          text not null,
  lat           double precision,
  lon           double precision,
  created_at    timestamptz not null default now()
);

-- Una fila por nodo y hora (promedios horarios ya validados). NO2 en µg/m³ (25 °C, 101,325 kPa).
create table if not exists readings_hourly (
  station_id text not null references stations(id) on delete cascade,
  ts         timestamptz not null,             -- inicio de la hora (UTC)
  pm25       real,
  pm10       real,
  no2        real,
  primary key (station_id, ts)
);
create index if not exists readings_hourly_ts_idx on readings_hourly (ts);

-- Bitácora de cargas: sirve para auditar y para contar lecturas descartadas por control de calidad.
create table if not exists import_log (
  id          bigserial primary key,
  station_id  text not null references stations(id) on delete cascade,
  file_name   text,
  freq        text,
  rows_in     integer,
  pm_raw      integer,
  pm_rej      integer,
  no2_raw     integer,
  no2_rej     integer,
  hours_saved integer,
  imported_at timestamptz not null default now()
);
