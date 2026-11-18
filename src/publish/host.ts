import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

export interface ImageHost {
  /** Public URL for a file in the hosted directory. */
  url(file: string): string;
  close(): Promise<void>;
}

/** Use an existing public web host that serves `dir` at `baseUrl`. */
export function staticHost(baseUrl: string): ImageHost {
  return { url: (f) => `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(f)}`, close: async () => {} };
}

/** cloudflared on PATH, or in its default install folders (a terminal opened before the install has an old PATH). */
export function cloudflaredPath(): string | null {
  if (spawnSync('cloudflared', ['--version'], { shell: true }).status === 0) return 'cloudflared';
  const candidates = [
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe'),
  ];
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

export const cloudflaredAvailable = () => cloudflaredPath() !== null;

/**
 * Serve only the JPEGs in `dir`, under a random path, through a temporary Cloudflare quick tunnel
 * (no account needed). Meta downloads the images from there; the tunnel is closed right after.
 */
export async function tunnelHost(dir: string, log = console.log): Promise<ImageHost> {
  const exe = cloudflaredPath();
  if (!exe) {
    throw new Error(
      'Instagram downloads the images from a public URL. Install the Cloudflare tunnel tool once:\n' +
        '  winget install --id Cloudflare.cloudflared\n' +
        'and open a new terminal. Or set "publish.imageBaseUrl" in config/club.json to a web host that serves output/.',
    );
  }
  const secret = crypto.randomBytes(12).toString('hex');
  const server = http.createServer((req, res) => {
    const m = (req.url ?? '').match(/^\/([0-9a-f]+)\/([\w.-]+\.(?:jpg|mp4))$/);
    const file = m && m[1] === secret ? path.join(dir, m[2]) : null;
    if (!file || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': file.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg', 'Content-Length': fs.statSync(file).size });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;

  const closeServer = () => new Promise((r) => server.close(r));
  const probe = fs.readdirSync(dir).find((f) => f.endsWith('.jpg') || f.endsWith('.mp4'));

  // A quick tunnel's address can take a minute or two before the rest of the internet finds it, and Instagram
  // gives up on an image it cannot fetch (Strøm i morgen, 18 November 2026: "Only photo or video can be
  // accepted"). So no address is handed out until the tunnel answers from outside, looked up through public
  // DNS (the runner's own DNS may have cached "no such name"). A tunnel that never answers is replaced.
  for (let attempt = 1; ; attempt++) {
    const tunnel = await startTunnel(exe, port).catch(async (e) => {
      await closeServer();
      throw e;
    });
    const host: ImageHost = {
      url: (f) => `${tunnel.base}/${secret}/${f}`,
      close: async () => {
        tunnel.proc.kill();
        await closeServer();
      },
    };
    if (!probe || (await reachable(host.url(probe), READY_WITHIN_MS))) {
      log(`Images served temporarily via ${tunnel.base}`);
      return host;
    }
    if (attempt >= TUNNEL_ATTEMPTS) {
      log(`Note: ${tunnel.base} did not answer from outside within ${READY_WITHIN_MS / 1000} s (try ${attempt} of ${TUNNEL_ATTEMPTS}); continuing, Instagram checks it itself.`);
      return host;
    }
    log(`Note: ${tunnel.base} did not answer within ${READY_WITHIN_MS / 1000} s; starting a new tunnel (try ${attempt + 1} of ${TUNNEL_ATTEMPTS}).`);
    tunnel.proc.kill();
  }
}

const TUNNEL_ATTEMPTS = 3;
const READY_WITHIN_MS = 90_000;

/** Starts cloudflared and waits until it has registered a connection; the URL is printed before that. */
function startTunnel(exe: string, port: number): Promise<{ base: string; proc: ReturnType<typeof spawn> }> {
  // No shell: then kill() stops cloudflared itself, not just a cmd.exe wrapper.
  const proc = spawn(exe, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`]);
  let output = '';
  return new Promise<{ base: string; proc: ReturnType<typeof spawn> }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('cloudflared did not connect within 60 s')), 60_000);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const url = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (url && /Registered tunnel connection/.test(output)) {
        clearTimeout(timer);
        resolve({ base: url[0], proc });
      }
    };
    proc.stderr?.on('data', onData);
    proc.stdout?.on('data', onData);
    proc.on('exit', (code) => reject(new Error(`cloudflared exited (${code})`)));
  }).catch((e) => {
    proc.kill();
    throw e;
  });
}

/** The IPv4 addresses public DNS (Cloudflare's resolver, asked by IP) gives for a name; [] while it has none. */
export async function publicAddresses(name: string, fetchFn: typeof fetch = fetch): Promise<string[]> {
  try {
    const r = await fetchFn(`https://1.1.1.1/dns-query?name=${encodeURIComponent(name)}&type=A`, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(10_000) });
    const j = (await r.json()) as { Answer?: { type: number; data: string }[] };
    return (j.Answer ?? []).filter((a) => a.type === 1).map((a) => a.data);
  } catch {
    return [];
  }
}

/** One HEAD request to `url`, sent to `ip` (so the local DNS cache plays no part). */
function headVia(url: string, ip: string): Promise<boolean> {
  const u = new URL(url);
  return new Promise((resolve) => {
    const req = https.request({ host: ip, servername: u.hostname, path: u.pathname, method: 'HEAD', headers: { Host: u.hostname }, timeout: 10_000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
    req.end();
  });
}

/** True once `url` answers 200 from outside, checked every 5 s for up to `withinMs`. */
async function reachable(url: string, withinMs: number): Promise<boolean> {
  const until = Date.now() + withinMs;
  const name = new URL(url).hostname;
  while (Date.now() < until) {
    const ips = await publicAddresses(name);
    for (const ip of ips) if (await headVia(url, ip)) return true;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}
