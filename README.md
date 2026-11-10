# Nodos Clarity Riverport

Seguimiento de los nodos Clarity de calidad del aire de Gesoltec Riverport frente a la
**Resolución 2254 de 2017** (MinAmbiente). Interfaz estática + Netlify Functions + Netlify Database (Postgres), igual que `operativos-en-via`.

Nodos: **Sur embarcadero** (`A4THKKHX`), **Carbon** (`A4THH3V9`), **Bascula** (`A9VXKKWG`).

## Qué incluye

| Vista | Para qué sirve |
|---|---|
| Datos recientes | Estado de cada nodo, valor actual en el mapa (OpenStreetMap) y comparación rápida con la norma |
| Datos históricos | Selector de métrica con escala ICA, periodo, hora seleccionada, serie de tiempo y tabla |
| Panel ejecutivo | Pantalla de inicio para directivos: 6 indicadores (cumplimiento normativo, PM2.5 de la red, días dentro de norma, excedencias, disponibilidad de datos, brecha a la meta 2030) con detalle al hacer clic, tendencia mensual, medidores, ICA por nodo, perfil horario, alertas con acción, semáforo normativo, ranking y resumen copiable. Cálculo en `public/js/kpis.js` |
| Cumplimiento de la norma | Matriz PM2.5/PM10/NO2 × nodo (anual, 24 h, 1 h), límites vigentes o meta 2030, calendario ICA |
| Ubicaciones | Renombrar nodos y ver coordenadas |
| Control de calidad | Lecturas descartadas, cobertura y método |
| Importar CSV | Carga de exportaciones de Clarity (individuales o promedios horarios) a la base |

## Estructura

```
public/                 sitio estático (index.html, css/, js/app.js, js/analysis.js, core.js)
netlify/functions/      API: stations, readings, import
netlify/database/migrations/  tablas y nodos iniciales (se aplican solas en cada despliegue)
scripts/import-csv.mjs  carga masiva de CSV por línea de comandos
scripts/dev-server.mjs  servidor local con base en memoria (sin Netlify ni base real)
test/                   pruebas de la API y del análisis (npm test)
```

`public/core.js` es el único código de procesamiento de CSV: lo usan el navegador y el script de carga.

## Despliegue en Netlify

1. **Repositorio.** Sube este proyecto a `kamober/nodos-clarity-riverport`.
2. **Sitio.** En Netlify: *Add new project → Import from Git* y elige el repositorio. `netlify.toml` ya
   define la carpeta publicada (`public`) y las funciones; no hay comando de build.
3. **Base de datos.** En el sitio: **Data & Storage → Database → Create a database** (o `netlify database init`).
   Las tablas y los tres nodos (Sur embarcadero, Carbon, Bascula) los crean las migraciones en el siguiente despliegue.
   No hay variable de conexión que configurar.
4. **Token de escritura y despliegue.** En *Project configuration → Environment variables* crea `IMPORT_TOKEN` con una
   clave larga (sin ella no se puede importar ni renombrar nodos) y luego **Deploys → Trigger deploy**.
5. **Cargar datos.** Abre el sitio, ve a *Importar CSV*, elige los archivos, escribe el token y guarda. O por consola:
   ```
   SITE_URL=https://tu-sitio.netlify.app IMPORT_TOKEN=... node scripts/import-csv.mjs data/*.csv
   ```
   Reimportar el mismo periodo es seguro: las horas ya cargadas se actualizan, no se duplican, y una lectura
   nula nunca pisa un dato existente.

## Desarrollo local

```
npm install
npx netlify dev          # levanta Postgres local y las funciones
npm run dev:mock         # sin base: datos en memoria. Token de importación: dev
node scripts/dev-server.mjs data/*.csv   # precarga CSV en el modo en memoria
npm test
```

## Qué se guarda y cómo se evalúa

- La base guarda **promedios horarios validados** por nodo (PM2.5, PM10, NO2 en µg/m³), no cada muestra de ~17 min,
  más una bitácora de cargas (`import_log`) con las lecturas descartadas.
- **Control de calidad:** se descartan lecturas de PM sobre 1.000 µg/m³ o con PM2.5 > PM10, y NO2 con error de calibración.
- **NO2:** Clarity lo entrega en ppb; se convierte con 1,88 (25 °C, 101,325 kPa). Confirma la unidad de tus exportaciones.
- **Validez:** hora con ≥ 3 muestras, día con ≥ 18 horas, evaluación con ≥ 75 % de cobertura; por debajo, el resultado es indicativo.
- **Alcance:** los nodos son sensores de bajo costo; la norma exige métodos de referencia o equivalentes.

## Seguridad y notas

- **Lectura abierta.** Cualquiera con la URL puede ver los datos; solo las escrituras exigen `IMPORT_TOKEN`.
  Si el cliente no quiere eso, protege el sitio en Netlify (contraseña o SSO del plan) o añade autenticación a las funciones de lectura.
- **Mapa.** Leaflet se carga desde unpkg y las teselas desde `tile.openstreetmap.org`. Para uso intensivo, OSM pide
  usar un proveedor de teselas propio o contratado. Si el CDN no carga, la app muestra un mapa esquemático a escala.
- **Pendiente de validar en producción:** las consultas SQL contra Postgres real y el mapa Leaflet. Las pruebas
  locales usan una base en memoria que imita las consultas.
