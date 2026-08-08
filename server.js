/**
 * Taskboard - a deliberately small full-stack application used to demonstrate
 * Ephemera preview environments.
 *
 * It exists to make one thing visible in a browser: this is a real application
 * talking to a real PostgreSQL database, and the database is not shared with
 * any other preview environment. Tasks survive a refresh, and the counter in
 * the corner shows how many rows this environment's own database holds.
 */

import { createServer } from 'node:http';
import pg from 'pg';

const { Pool } = pg;

const PORT = Number(process.env.PORT ?? 3000);

/* ------------------------------------------------------------------ *
 * Theme
 *
 * These three constants are what a pull request changes to make the
 * preview environment visibly different from production. Changing them
 * is the entire point of the demo.
 * ------------------------------------------------------------------ */
const THEME = {
  name: 'Taskboard',
  accent: '#3b82f6',
  tagline: 'Plan the work. Work the plan.',
};

const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  database: process.env.DB_NAME ?? 'db',
  user: process.env.DB_USER ?? 'db',
  password: process.env.DB_PASS ?? '',
  port: Number(process.env.DB_PORT ?? 5432),
  max: 5,
  connectionTimeoutMillis: 10_000,
});

async function initialise() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id         SERIAL PRIMARY KEY,
      text       TEXT NOT NULL,
      done       BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

const escape = (value) =>
  String(value).replace(/[&<>"']/g, (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function page(tasks, slug) {
  const rows = tasks
    .map(
      (task) => `
      <li class="${task.done ? 'done' : ''}">
        <form method="POST" action="/toggle">
          <input type="hidden" name="id" value="${task.id}" />
          <button class="tick" type="submit">${task.done ? '✓' : ''}</button>
        </form>
        <span>${escape(task.text)}</span>
      </li>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${THEME.name}</title>
<style>
  :root { color-scheme: dark; --accent: ${THEME.accent}; }
  * { box-sizing: border-box; }
  body { margin:0; background:#0b0e14; color:#e6edf7; display:flex;
         justify-content:center; padding:56px 20px;
         font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }
  .wrap { width:100%; max-width:560px; }
  .banner { background:var(--accent); height:6px; border-radius:99px; margin-bottom:24px; }
  h1 { margin:0; font-size:30px; letter-spacing:-.02em; }
  h1 em { font-style:normal; color:var(--accent); }
  p.tag { color:#8b98ad; margin:6px 0 26px; }
  form.add { display:flex; gap:10px; margin-bottom:22px; }
  input[type=text] { flex:1; background:#141922; border:1px solid #262e3b;
    color:#e6edf7; padding:12px 14px; border-radius:9px; font-size:15px; }
  input[type=text]:focus { outline:none; border-color:var(--accent); }
  button.add { background:var(--accent); color:#04101f; border:0; font-weight:650;
    padding:0 20px; border-radius:9px; cursor:pointer; font-size:15px; }
  ul { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px; }
  li { display:flex; align-items:center; gap:12px; background:#141922;
       border:1px solid #262e3b; border-radius:9px; padding:12px 14px; }
  li.done span { text-decoration:line-through; color:#8b98ad; }
  .tick { width:22px; height:22px; border-radius:6px; border:1px solid #3a4557;
    background:#0b0e14; color:var(--accent); cursor:pointer; font-size:13px; line-height:1; }
  .meta { margin-top:28px; padding-top:18px; border-top:1px solid #262e3b;
    color:#8b98ad; font-size:13px;
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  .meta b { color:#e6edf7; }
  .empty { color:#8b98ad; text-align:center; padding:28px; border:1px dashed #262e3b;
    border-radius:9px; }
</style></head>
<body><div class="wrap">
  <div class="banner"></div>
  <h1>Task<em>board</em></h1>
  <p class="tag">${escape(THEME.tagline)}</p>

  <form class="add" method="POST" action="/add">
    <input type="text" name="text" placeholder="Add a task…" required autocomplete="off" />
    <button class="add" type="submit">Add</button>
  </form>

  ${rows ? `<ul>${rows}</ul>` : `<div class="empty">No tasks yet. Add one, then refresh — it persists.</div>`}

  <div class="meta">
    <b>${tasks.length}</b> task${tasks.length === 1 ? '' : 's'} in this environment's own PostgreSQL database.<br />
    environment <b>${escape(slug)}</b> · database <b>${escape(process.env.DB_HOST ?? 'local')}</b>
  </div>
</div></body></html>`;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return new URLSearchParams(Buffer.concat(chunks).toString());
}

const server = createServer(async (request, response) => {
  try {
    const slug = process.env.EPHEMERA_SLUG ?? 'local';

    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end(JSON.stringify({ status: 'ok' }));
    }

    if (request.method === 'POST' && request.url === '/add') {
      const body = await readBody(request);
      const text = (body.get('text') ?? '').trim();
      if (text) await pool.query('INSERT INTO tasks (text) VALUES ($1)', [text.slice(0, 200)]);
      response.writeHead(303, { location: '/' });
      return response.end();
    }

    if (request.method === 'POST' && request.url === '/toggle') {
      const body = await readBody(request);
      const id = Number(body.get('id'));
      if (Number.isInteger(id)) {
        await pool.query('UPDATE tasks SET done = NOT done WHERE id = $1', [id]);
      }
      response.writeHead(303, { location: '/' });
      return response.end();
    }

    const { rows } = await pool.query(
      'SELECT id, text, done FROM tasks ORDER BY done ASC, id DESC',
    );
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(page(rows, slug));
  } catch (error) {
    console.error(error);
    response.writeHead(500, { 'content-type': 'text/plain' });
    return response.end(`Taskboard error: ${error.message}`);
  }
});

initialise()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () =>
      console.log(`taskboard listening on ${PORT}`),
    );
  })
  .catch((error) => {
    console.error('failed to initialise database:', error);
    process.exit(1);
  });
