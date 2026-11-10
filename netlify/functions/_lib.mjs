export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }
  });

/** Las escrituras exigen el token IMPORT_TOKEN (variable de entorno de Netlify). */
export function checkToken(req) {
  const expected = (typeof process !== 'undefined' && process.env.IMPORT_TOKEN) || globalThis.__IMPORT_TOKEN;
  if (!expected) return json({ error: 'El servidor no tiene IMPORT_TOKEN configurado.' }, 500);
  if (req.headers.get('x-import-token') !== expected) return json({ error: 'Token de importación inválido.' }, 401);
  return null;
}

export const HOUR_MS = 3600000;
