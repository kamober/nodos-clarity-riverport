// Netlify Database (Postgres). Las tablas las crean las migraciones de netlify/database/migrations en cada despliegue.
export async function getSql() {
  if (globalThis.__SQL_OVERRIDE) return globalThis.__SQL_OVERRIDE;   // pruebas y modo en memoria
  const { getDatabase } = await import('@netlify/database');
  const db = getDatabase();
  return (strings, ...values) => db.sql(strings, ...values);
}
