const fs = require('fs');
const path = require('path');
const { launch, launchArgs, locateApp } = require('./app');
const { readIdentity } = require('./identity');
const { codeCredentialsPath, deriveAlias, desktopProfileDir, sessionSlot } = require('./paths');
const { groupProcesses, killPids, listClaudeProcesses } = require('./procs');
const registry = require('./registry');
const session = require('./session');

const DESKTOP_SUBDIR = 'desktop';
const CODE_FILE = 'code.json';

function defaultDeps() {
  return {
    profileDir: desktopProfileDir(),
    credPath: codeCredentialsPath(),
    slotOf: alias => sessionSlot(alias),
    registryFile: undefined,
    readIdentity,
    listProcesses: listClaudeProcesses,
    kill: killPids,
    launch: (exe, args) => launch(exe, args),
    locate: locateApp,
    now: () => new Date(),
  };
}

function createSwitcher(overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };

  function readRegistry() {
    return registry.read(deps.registryFile);
  }

  function writeRegistry(data) {
    return registry.write(data, deps.registryFile);
  }

  function currentIdentity() {
    return fs.existsSync(deps.profileDir) ? deps.readIdentity(deps.profileDir) : null;
  }

  function desktopRunning() {
    const groups = groupProcesses(deps.listProcesses(), [{ alias: 'default', dir: deps.profileDir }], deps.profileDir);
    return groups.get('default') || [];
  }

  function saveInto(alias) {
    const slot = deps.slotOf(alias);
    const desktopItems = session.snapshotDesktop(deps.profileDir, path.join(slot, DESKTOP_SUBDIR));
    const codeSaved = session.snapshotCode(deps.credPath, path.join(slot, CODE_FILE));
    return { desktopItems, codeSaved };
  }

  function sync(options = {}) {
    const identity = currentIdentity();
    if (!identity) throw new Error('No Claude account detected. Sign in to Claude Desktop first, then save.');
    const alias = deriveAlias(identity.email);
    const stopped = options.stop === false ? 0 : stopDesktop();
    saveInto(alias);
    writeRegistry(registry.saveSession(readRegistry(), { alias, email: identity.email, name: identity.name }, deps.now()));
    let relaunched = false;
    if (stopped && options.relaunch !== false) {
      deps.launch(deps.locate(), launchArgs(deps.profileDir, true));
      relaunched = true;
    }
    return { alias, email: identity.email, name: identity.name, stopped, relaunched };
  }

  function desktopCaptured(alias) {
    return fs.existsSync(path.join(deps.slotOf(alias), DESKTOP_SUBDIR));
  }

  function autoSyncCode() {
    const identity = currentIdentity();
    if (!identity) return null;
    const known = registry.sessionByEmail(readRegistry(), identity.email);
    if (!known) return null;
    const slotCode = path.join(deps.slotOf(known.alias), CODE_FILE);
    try {
      const current = session.readCodeBlock(deps.credPath);
      if (!current) return null;
      const prev = fs.existsSync(slotCode) ? JSON.parse(fs.readFileSync(slotCode, 'utf8')) : null;
      if (JSON.stringify(prev) === JSON.stringify(current)) return { alias: known.alias, updated: false };
      session.snapshotCode(deps.credPath, slotCode);
      return { alias: known.alias, updated: true };
    } catch (err) {
      return null;
    }
  }

  function listSessions() {
    autoSyncCode();
    const data = readRegistry();
    const identity = currentIdentity();
    const activeEmail = identity ? identity.email.toLowerCase() : null;
    const running = desktopRunning().length > 0;
    return {
      running,
      current: identity,
      sessions: (data.sessions || []).map(entry => ({
        ...entry,
        active: activeEmail === entry.email.toLowerCase(),
        desktopCaptured: desktopCaptured(entry.alias),
      })),
    };
  }

  function stopDesktop() {
    const pids = desktopRunning();
    deps.kill(pids);
    return pids.length;
  }

  function restoreFrom(alias) {
    const slot = deps.slotOf(alias);
    if (!fs.existsSync(slot)) throw new Error(`No saved session for "${alias}". Sync it first.`);
    const desktopItems = session.restoreDesktop(path.join(slot, DESKTOP_SUBDIR), deps.profileDir);
    const codeRestored = session.restoreCode(path.join(slot, CODE_FILE), deps.credPath);
    return { desktopItems, codeRestored };
  }

  function switchTo(alias, options = {}) {
    const data = readRegistry();
    const target = registry.findSession(data, alias);
    if (!target) throw new Error(`No saved session for "${alias}".`);

    const identity = currentIdentity();
    const stopped = stopDesktop();

    const snapshotCurrent = options.snapshotCurrent !== false;
    if (snapshotCurrent && identity && identity.email.toLowerCase() !== target.email.toLowerCase()) {
      const known = registry.sessionByEmail(data, identity.email);
      if (known) saveInto(known.alias);
    }

    const result = restoreFrom(alias);

    let relaunched = false;
    if (options.relaunch !== false) {
      deps.launch(deps.locate(), launchArgs(deps.profileDir, true));
      relaunched = true;
    }
    return { alias: target.alias, email: target.email, name: target.name, stopped, relaunched, ...result };
  }

  function forget(alias) {
    const data = readRegistry();
    if (!registry.findSession(data, alias)) throw new Error(`No saved session for "${alias}".`);
    writeRegistry(registry.removeSession(data, alias));
    fs.rmSync(deps.slotOf(alias), { recursive: true, force: true });
    return { alias };
  }

  return {
    autoSyncCode,
    currentIdentity,
    forget,
    listSessions,
    switchTo,
    sync,
  };
}

module.exports = {
  CODE_FILE,
  DESKTOP_SUBDIR,
  createSwitcher,
};
