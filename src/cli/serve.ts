// npm run serve [-- --port 8080]
// Serves the gallery (output/) on all network interfaces so a phone on the same Wi-Fi can open it.

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, paths, ROOT } from '../config.ts';
import { applyAction, readControls, writeControls } from '../controls.ts';
import { parseAction, type ControlAction } from '../controlsSchema.ts';
import { readManifests } from '../gallery/build.ts';
import { rebuildGallery } from '../gallery/rebuild.ts';
import { planUnits } from '../publish/plan.ts';
import { readPublished } from '../publish/state.ts';

const { values: args } = parseArgs({ options: { port: { type: 'string', default: '8080' }, 'allow-publish': { type: 'boolean', default: false } } });
const port = Number(args.port);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ttf': 'font/ttf',
  '.zip': 'application/zip',
  '.txt': 'text/plain; charset=utf-8',
};

const root = path.resolve(paths.output);

// Dashboard actions. Anyone on the Wi-Fi can open the page, so actions need this PIN (shown only in
// this terminal). Changes go to the local config/controls.json; in production the cloud dashboard is used.
// Publishing from here is off by default: the cloud keeps its own publish log, and publishing from two
// places could post the same item twice.
const PIN = String(crypto.randomInt(100000, 1000000));
let publishing = false;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => resolve(body));
  });
}

async function handleAction(req: http.IncomingMessage, res: http.ServerResponse) {
  const reply = (status: number, body: object) => res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
  if (req.headers['x-pin'] !== PIN) return reply(401, { needPin: true, error: 'Feil PIN-kode.' });
  let action: ControlAction;
  try {
    action = parseAction((JSON.parse(await readBody(req)) as { action?: unknown }).action);
  } catch (e) {
    return reply(400, { error: (e as Error).message });
  }

  if (action.type !== 'publish-now') {
    writeControls(ROOT, applyAction(readControls(ROOT), action, 'lokalt'));
    rebuildGallery();
    console.log(`Dashboard: ${action.type}`);
    return reply(200, { ok: true, mode: 'local' });
  }

  if (!args['allow-publish']) return reply(409, { error: 'Publisering skjer i skyen. Bruk skydashboardet (eller start serve med --allow-publish).' });
  const config = loadConfig();
  if (!config.publish.enabled) return reply(409, { error: 'Publisering er slått av (publish.enabled i config/club.json).' });
  const unit = readManifests().flatMap((m) => planUnits(m, config)).find((u) => u.key === action.key);
  if (!unit) return reply(404, { error: 'Fant ikke innlegget.' });
  if (readPublished()[unit.key]) return reply(409, { error: 'Allerede publisert.' });
  if (publishing) return reply(429, { error: 'En publisering pågår allerede – vent litt.' });

  publishing = true;
  writeControls(ROOT, applyAction(readControls(ROOT), action, 'lokalt'));
  console.log(`Publishing from dashboard: ${unit.key}`);
  const child = spawn('npm', ['run', 'publish', '--', '--only', unit.key, '--now'], { cwd: ROOT, shell: true });
  let log = '';
  child.stdout.on('data', (c) => (log += c));
  child.stderr.on('data', (c) => (log += c));
  child.on('close', (code) => {
    publishing = false;
    rebuildGallery();
    const entry = readPublished()[unit.key];
    if (entry) reply(200, { ok: true, mode: 'local', permalink: entry.permalink });
    else reply(500, { error: (log.match(/✗ .*/)?.[0] ?? `Publisering feilet (kode ${code}).`).slice(0, 300) });
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/api/action') {
    void handleAction(req, res);
    return;
  }
  let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Ikke funnet. Har du kjørt npm run generate?');
    return;
  }
  const ext = path.extname(file).toLowerCase();
  const headers: Record<string, string> = { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' };
  if (ext === '.zip') headers['Content-Disposition'] = `attachment; filename="${path.basename(file)}"`;
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
});

server.listen(port, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
  console.log(`Gallery running.\n  On this PC:   http://localhost:${port}/`);
  for (const ip of lan) console.log(`  On your phone: http://${ip}:${port}/   (same Wi-Fi)`);
  console.log('\nIf the phone cannot connect, allow Node.js through Windows Firewall for Private networks (see README).');
  console.log(`PIN for dashboard actions: ${PIN}`);
  console.log('Stop with Ctrl+C.');
});
