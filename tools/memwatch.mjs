// Memory watchdog for long multi-agent sessions on this 16 GB laptop.
// Every 30 s: logs available RAM; below the threshold it kills the oldest headless screenshot browsers
// (user-data-dir cf-shot-* / cf-mp-* / cf-net-*), which are always safe to recreate.
//   node tools/memwatch.mjs [thresholdMB=900]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const threshold = +(process.argv[2] || 900);
const logFile = 'build/memwatch.log';
fs.mkdirSync('build', { recursive: true });
const ps = (cmd) => execFileSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8', timeout: 60000 }).trim();

function availableMB() {
  try { return +ps("[math]::Round((Get-Counter '\\Memory\\Available MBytes').CounterSamples[0].CookedValue)"); } catch { return -1; }
}

function headlessRoots() {
  try {
    const out = ps("Get-CimInstance Win32_Process -Filter \"name='msedge.exe'\" | Where-Object { $_.CommandLine -match 'cf-(shot|mp|net)' -and $_.CommandLine -notmatch '--type=' } | ForEach-Object { '{0} {1}' -f $_.ProcessId, [int]((Get-Date) - $_.CreationDate).TotalSeconds }");
    return out.split(/\r?\n/).filter(Boolean).map((l) => l.trim().split(/\s+/).map(Number)).map(([pid, age]) => ({ pid, age })).sort((a, b) => b.age - a.age);
  } catch { return []; }
}

const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** Headless shot browsers whose tools/shot.mjs owner died (killed by an agent's command timeout) never get cleaned up. */
function killOrphans() {
  let out = '';
  try { out = ps("Get-CimInstance Win32_Process -Filter \"name='msedge.exe'\" | Where-Object { $_.CommandLine -match 'cf-shot-[0-9]' -and $_.CommandLine -notmatch '--type=' } | ForEach-Object { '{0} {1} {2}' -f $_.ProcessId, [int]((Get-Date) - $_.CreationDate).TotalSeconds, [regex]::Match($_.CommandLine, 'cf-shot-[0-9]+').Value }"); } catch { return; }
  for (const l of out.split(/\r?\n/).filter(Boolean)) {
    const [pid, age, name] = l.trim().split(/\s+/);
    if (+age < 45 || !name) continue;   // still starting up
    let owner = 0;
    try { owner = +fs.readFileSync(path.join(os.tmpdir(), name, 'owner.pid'), 'utf8'); } catch { /* no owner file: launched by an older shot.mjs */ }
    if (owner ? pidAlive(owner) : +age < 900) continue;
    try { execFileSync('taskkill', ['/F', '/T', '/PID', pid], { stdio: 'ignore' }); fs.appendFileSync(logFile, `  killed orphan browser ${pid} (age ${age}s, owner ${owner || '?'})\n`); } catch { /* gone */ }
  }
}

function tick() {
  killOrphans();
  const mb = availableMB();
  const line = `${new Date().toISOString()} available=${mb}MB`;
  fs.appendFileSync(logFile, line + '\n');
  if (mb >= 0 && mb < threshold) {
    const roots = headlessRoots();
    // kill browsers older than 90 s first (a fresh one is probably mid-screenshot)
    for (const r of roots.filter((x) => x.age > 90).slice(0, 2)) {
      try { execFileSync('taskkill', ['/F', '/T', '/PID', String(r.pid)], { stdio: 'ignore' }); fs.appendFileSync(logFile, `  killed headless browser ${r.pid} (age ${r.age}s)\n`); } catch { /* gone */ }
    }
  }
}
tick();
setInterval(tick, 20000);
