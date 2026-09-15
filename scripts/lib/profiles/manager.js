const fs = require('fs');
const { launch, launchArgs, locateApp } = require('./app');
const { DEFAULT_ALIAS, desktopProfileDir, isDefaultAlias, profilePath } = require('./paths');
const { groupProcesses, killPids, listClaudeProcesses } = require('./procs');
const registry = require('./registry');

function describe(alias) {
  return { alias, dir: profilePath(alias), isDefault: isDefaultAlias(alias) };
}

function allProfiles(data = registry.read()) {
  return [describe(DEFAULT_ALIAS), ...data.profiles.map(entry => ({ ...describe(entry.alias), ...entry }))];
}

function listProfiles() {
  const data = registry.read();
  const profiles = allProfiles(data);
  const groups = groupProcesses(listClaudeProcesses(), profiles, desktopProfileDir());
  return profiles.map(profile => {
    const pids = groups.get(profile.alias) || [];
    return {
      alias: profile.alias,
      dir: profile.dir,
      isDefault: Boolean(profile.isDefault),
      exists: fs.existsSync(profile.dir),
      createdAt: profile.createdAt || null,
      lastLaunchedAt: profile.lastLaunchedAt || null,
      running: pids.length > 0,
      pids,
    };
  });
}

function addProfile(alias) {
  const data = registry.add(registry.read(), alias);
  registry.write(data);
  fs.mkdirSync(profilePath(alias), { recursive: true });
  return describe(alias);
}

function removeProfile(alias) {
  if (isDefaultAlias(alias)) throw new Error('Cannot remove the default Claude Desktop profile.');
  const dir = profilePath(alias);
  const pids = groupProcesses(listClaudeProcesses(), allProfiles(), desktopProfileDir()).get(alias) || [];
  if (pids.length) throw new Error(`Profile "${alias}" is running. Stop it before removing.`);
  const data = registry.remove(registry.read(), alias);
  registry.write(data);
  fs.rmSync(dir, { recursive: true, force: true });
  return { alias, dir };
}

function launchProfile(alias) {
  const data = registry.read();
  if (!isDefaultAlias(alias) && !registry.find(data, alias)) throw new Error(`Profile "${alias}" not found.`);
  const dir = profilePath(alias);
  if (!isDefaultAlias(alias)) fs.mkdirSync(dir, { recursive: true });
  const exe = locateApp();
  const pid = launch(exe, launchArgs(dir, isDefaultAlias(alias)));
  if (!isDefaultAlias(alias)) registry.write(registry.touch(data, alias));
  return { alias, dir, pid, exe };
}

function stopProfile(alias) {
  const pids = groupProcesses(listClaudeProcesses(), allProfiles(), desktopProfileDir()).get(alias) || [];
  killPids(pids);
  return { alias, stopped: pids.length };
}

module.exports = {
  addProfile,
  allProfiles,
  describe,
  launchProfile,
  listProfiles,
  removeProfile,
  stopProfile,
};
