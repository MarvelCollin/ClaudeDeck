const { spawnSync } = require('child_process');

const SEPARATOR = '|::|';

function parseProcessLines(text) {
  return String(text)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const index = line.indexOf(SEPARATOR);
      if (index === -1) return null;
      const pid = Number(line.slice(0, index).trim());
      const commandLine = line.slice(index + SEPARATOR.length).trim();
      return Number.isInteger(pid) && pid > 0 ? { pid, commandLine } : null;
    })
    .filter(Boolean);
}

function parsePosixProcessLines(text) {
  return String(text)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^(\d+)\s+(.*)$/);
      if (!match) return null;
      return { pid: Number(match[1]), commandLine: match[2] };
    })
    .filter(Boolean);
}

function userDataDirOf(commandLine) {
  const quoted = commandLine.match(/--user-data-dir="([^"]+)"/);
  if (quoted) return quoted[1];
  const bare = commandLine.match(/--user-data-dir=(\S+)/);
  return bare ? bare[1] : null;
}

function samePath(left, right) {
  if (!left || !right) return false;
  const clean = value => String(value).replace(/[\\/]+$/, '').toLowerCase();
  return clean(left) === clean(right);
}

function aliasForCommandLine(commandLine, profiles, defaultDir) {
  const dir = userDataDirOf(commandLine);
  if (!dir) return 'default';
  const match = profiles.find(profile => samePath(profile.dir, dir));
  if (match) return match.alias;
  if (samePath(dir, defaultDir)) return 'default';
  return null;
}

function listClaudeProcesses(platform = process.platform) {
  if (platform === 'win32') {
    const command = `Get-CimInstance Win32_Process -Filter "Name='claude.exe'" | ForEach-Object { "$($_.ProcessId)${SEPARATOR}$($_.CommandLine)" }`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' });
    if (result.status !== 0) return [];
    return parseProcessLines(result.stdout || '');
  }
  if (platform === 'darwin') {
    const result = spawnSync('ps', ['-ax', '-o', 'pid=,command='], { encoding: 'utf8' });
    if (result.status !== 0) return [];
    return parsePosixProcessLines(result.stdout || '').filter(entry => /Claude\.app\/Contents\/MacOS\/Claude/.test(entry.commandLine));
  }
  return [];
}

function groupProcesses(processes, profiles, defaultDir) {
  const groups = new Map();
  for (const entry of processes) {
    const alias = aliasForCommandLine(entry.commandLine, profiles, defaultDir);
    if (!alias) continue;
    if (!groups.has(alias)) groups.set(alias, []);
    groups.get(alias).push(entry.pid);
  }
  return groups;
}

function killPids(pids, platform = process.platform) {
  if (!pids.length) return 0;
  if (platform === 'win32') {
    const list = pids.join(',');
    const command = `Get-Process -Id ${list} -ErrorAction SilentlyContinue | Stop-Process -Force`;
    spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' });
    return pids.length;
  }
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (err) {
      if (err.code !== 'ESRCH') throw err;
    }
  }
  return pids.length;
}

module.exports = {
  SEPARATOR,
  aliasForCommandLine,
  groupProcesses,
  killPids,
  listClaudeProcesses,
  parsePosixProcessLines,
  parseProcessLines,
  samePath,
  userDataDirOf,
};
