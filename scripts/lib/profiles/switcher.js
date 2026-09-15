const fs = require('fs');
const path = require('path');
const { launch, launchArgs, locateApp } = require('./app');
const { readDesktopAccountUuid, readIdentity } = require('./identity');
const { codeAccountPath, codeCredentialsPath, deriveAlias, desktopConfigPath, desktopProfileDir, sessionSlot, sharedRoot } = require('./paths');
const { groupProcesses, killPids, listClaudeProcesses } = require('./procs');
const registry = require('./registry');
const session = require('./session');
const shared = require('./shared');

const DESKTOP_SUBDIR = 'desktop';
const CODE_FILE = 'code.json';
const CONFIG_FILE = 'config.json';

function defaultDeps() {
  return {
    profileDir: desktopProfileDir(),
    credPath: codeCredentialsPath(),
    accountPath: codeAccountPath(),
    sharedDir: sharedRoot(),
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

  function lookupSavedAccount(uuid) {
    return registry.sessionByUuid(readRegistry(), uuid);
  }

  function currentIdentity() {
    if (!fs.existsSync(deps.profileDir)) return null;
    return deps.readIdentity(deps.profileDir, { codeAccountPath: deps.accountPath, lookup: lookupSavedAccount });
  }

  function currentAccountUuid() {
    return fs.existsSync(deps.profileDir) ? readDesktopAccountUuid(deps.profileDir) : null;
  }

  function desktopRunning() {
    const groups = groupProcesses(deps.listProcesses(), [{ alias: 'default', dir: deps.profileDir }], deps.profileDir);
    return groups.get('default') || [];
  }

  function sharingEnabled(data = readRegistry()) {
    return registry.settingsOf(data).shareSession;
  }

  function swappedDesktopItems(data) {
    return shared.swappedItems(session.DESKTOP_ITEMS, shared.SHARED_DESKTOP_ITEMS, sharingEnabled(data));
  }

  function captureShared() {
    return shared.capture(deps.profileDir, deps.sharedDir);
  }

  function applyShared() {
    return shared.apply(deps.sharedDir, deps.profileDir);
  }

  function saveInto(alias, data) {
    const slot = deps.slotOf(alias);
    const desktopItems = session.snapshotDesktop(deps.profileDir, path.join(slot, DESKTOP_SUBDIR), swappedDesktopItems(data));
    const codeSaved = session.snapshotCode(deps.credPath, path.join(slot, CODE_FILE));
    const configSaved = session.snapshotConfig(desktopConfigPath(deps.profileDir), path.join(slot, CONFIG_FILE));
    return { desktopItems, codeSaved, configSaved };
  }

  function setSharing(enabled) {
    const data = readRegistry();
    writeRegistry(registry.setSetting(data, 'shareSession', Boolean(enabled)));
    if (!enabled) return { shareSession: false, captured: [], pruned: [] };
    const captured = captureShared();
    const slots = (readRegistry().sessions || []).map(entry => path.join(deps.slotOf(entry.alias), DESKTOP_SUBDIR));
    const pruned = shared.clearFromSlots(slots);
    return { shareSession: true, captured, pruned };
  }

  function sync(options = {}) {
    const identity = currentIdentity();
    if (!identity) throw new Error('No Claude account detected. Sign in to Claude Desktop first, then save.');
    const alias = deriveAlias(identity.email);
    const data = readRegistry();
    const stopped = options.stop === false ? 0 : stopDesktop();
    saveInto(alias, data);
    if (sharingEnabled(data)) captureShared();
    writeRegistry(
      registry.saveSession(
        data,
        { alias, email: identity.email, name: identity.name, accountUuid: identity.accountUuid || null },
        deps.now()
      )
    );
    let relaunched = false;
    if (stopped && options.relaunch !== false) {
      deps.launch(deps.locate(), launchArgs(deps.profileDir, true));
      relaunched = true;
    }
    return { alias, email: identity.email, name: identity.name, accountUuid: identity.accountUuid || null, stopped, relaunched };
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
    const activeUuid = currentAccountUuid();
    const activeEmail = identity ? identity.email.toLowerCase() : null;
    const running = desktopRunning().length > 0;
    const isActive = entry => (activeUuid && entry.accountUuid ? entry.accountUuid === activeUuid : activeEmail === entry.email.toLowerCase());
    return {
      running,
      current: identity,
      accountUuid: activeUuid,
      unknownAccount: Boolean(activeUuid && !identity),
      shareSession: sharingEnabled(data),
      sharedItems: shared.SHARED_DESKTOP_ITEMS,
      sharedCodeItems: shared.SHARED_CODE_ITEMS,
      sessions: (data.sessions || []).map(entry => ({
        ...entry,
        active: isActive(entry),
        desktopCaptured: desktopCaptured(entry.alias),
      })),
    };
  }

  function stopDesktop() {
    const pids = desktopRunning();
    deps.kill(pids);
    return pids.length;
  }

  function restoreFrom(alias, data) {
    const slot = deps.slotOf(alias);
    if (!fs.existsSync(slot)) throw new Error(`No saved session for "${alias}". Sync it first.`);
    const desktopItems = session.restoreDesktop(path.join(slot, DESKTOP_SUBDIR), deps.profileDir, swappedDesktopItems(data));
    const codeRestored = session.restoreCode(path.join(slot, CODE_FILE), deps.credPath);
    const configRestored = session.restoreConfig(path.join(slot, CONFIG_FILE), desktopConfigPath(deps.profileDir));
    return { desktopItems, codeRestored, configRestored };
  }

  function switchTo(alias, options = {}) {
    const data = readRegistry();
    const target = registry.findSession(data, alias);
    if (!target) throw new Error(`No saved session for "${alias}".`);

    const identity = currentIdentity();
    const stopped = stopDesktop();
    const sharing = sharingEnabled(data);

    const snapshotCurrent = options.snapshotCurrent !== false;
    if (snapshotCurrent && identity && identity.email.toLowerCase() !== target.email.toLowerCase()) {
      const known = registry.sessionByEmail(data, identity.email);
      if (known) saveInto(known.alias, data);
    }

    if (sharing) captureShared();
    const result = restoreFrom(alias, data);
    const sharedItems = sharing ? applyShared() : [];

    let relaunched = false;
    if (options.relaunch !== false) {
      deps.launch(deps.locate(), launchArgs(deps.profileDir, true));
      relaunched = true;
    }
    return { alias: target.alias, email: target.email, name: target.name, stopped, relaunched, sharedItems, ...result };
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
    currentAccountUuid,
    currentIdentity,
    forget,
    listSessions,
    setSharing,
    sharingEnabled,
    swappedDesktopItems,
    switchTo,
    sync,
  };
}

module.exports = {
  CODE_FILE,
  DESKTOP_SUBDIR,
  createSwitcher,
};
