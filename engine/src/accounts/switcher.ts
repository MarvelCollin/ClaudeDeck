import fs from 'node:fs';
import path from 'node:path';
import { launch, launchTarget, locateApp } from './desktop-app';
import { readCodeAccount, readDesktopAccountUuid, readIdentity } from './identity';
import { accountFileName, CODE_INSTALL, claudeInstalls, installFileName, PRIMARY_INSTALL_LABEL } from './installs';
import {
  IAccountIdentity,
  IAutoSyncResult,
  IClaudeInstall,
  ICodeSwitchOptions,
  ICodeSwitchResult,
  IInstallState,
  IRegistry,
  IRestoreResult,
  ISaveResult,
  ISavedSession,
  ISessionListing,
  ISwitchOptions,
  ISwitchResult,
  ISwitcher,
  ISwitcherDeps,
  ISyncOptions,
  ISyncResult,
} from './interfaces';
import {
  codeAccountPath,
  codeCredentialsPath,
  deriveAlias,
  desktopConfigPath,
  desktopProfileDir,
  sessionSlot,
} from './paths';
import { killPids, listClaudeProcesses, pauseSync } from './processes';
import * as usage from './usage';
import * as registry from './registry';
import * as session from './session-store';

export const DESKTOP_SUBDIR = 'desktop';
export const CODE_FILE = 'code.json';
export const CONFIG_FILE = session.CONFIG_FILE;
export const EXIT_TIMEOUT_MS = 20_000;
export const EXIT_POLL_MS = 250;
export const SETTLE_MS = 750;

function sameEmail(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function defaultDeps(): ISwitcherDeps {
  return {
    profileDir: desktopProfileDir(),
    credPath: codeCredentialsPath(),
    accountPath: codeAccountPath(),
    installs: claudeInstalls(),
    slotOf: alias => sessionSlot(alias),
    registryFile: undefined,
    readIdentity,
    listProcesses: listClaudeProcesses,
    kill: killPids,
    launch,
    locate: locateApp,
    pause: pauseSync,
    now: () => new Date(),
  };
}

export function createSwitcher(overrides: Partial<ISwitcherDeps> = {}): ISwitcher {
  const deps: ISwitcherDeps = { ...defaultDeps(), ...overrides };

  const readRegistry = (): IRegistry => registry.read(deps.registryFile);
  const writeRegistry = (data: IRegistry): IRegistry => registry.write(data, deps.registryFile);
  const lookupSavedAccount = (uuid: string) => registry.sessionByUuid(readRegistry(), uuid);

  const installs: IClaudeInstall[] = [
    { id: CODE_INSTALL, label: PRIMARY_INSTALL_LABEL, accountPath: deps.accountPath, credPath: deps.credPath },
    ...(deps.installs ?? []).filter(entry => entry.id !== CODE_INSTALL),
  ];

  function installFor(id: string | undefined): IClaudeInstall {
    const wanted = id || CODE_INSTALL;
    const found = installs.find(entry => entry.id === wanted);
    if (!found) throw new Error(`Unknown Claude install "${wanted}".`);
    return found;
  }

  function accountOf(install: IClaudeInstall): IAccountIdentity | null {
    return install.id === CODE_INSTALL ? currentIdentity() : readCodeAccount(install.accountPath);
  }

  function installStates(data: IRegistry): IInstallState[] {
    return installs.map(install => {
      const account = accountOf(install);
      const saved = account ? registry.sessionByEmail(data, account.email) : null;
      return {
        id: install.id,
        label: install.label,
        signedIn: Boolean(account),
        email: account?.email ?? null,
        name: account?.name ?? null,
        accountUuid: account?.accountUuid ?? null,
        alias: saved?.alias ?? null,
        saved: Boolean(saved?.installs.includes(install.id)),
      };
    });
  }

  function currentIdentity(): IAccountIdentity | null {
    return deps.readIdentity(deps.profileDir, { codeAccountPath: deps.accountPath, lookup: lookupSavedAccount });
  }

  function currentAccountUuid(): string | null {
    return readDesktopAccountUuid(deps.profileDir);
  }

  function desktopRunning(): number[] {
    return deps.listProcesses().map(entry => entry.pid);
  }

  function emailOfAlias(alias: string, data: IRegistry): string | null {
    return registry.findSession(data, alias)?.email ?? null;
  }

  function saveCodeInto(
    alias: string,
    data: IRegistry,
    install: IClaudeInstall,
    email: string | null
  ): { codeSaved: boolean; accountSaved: boolean } {
    const slot = deps.slotOf(alias);
    return {
      codeSaved: session.snapshotCode(install.credPath, path.join(slot, installFileName(install.id))),
      accountSaved: session.snapshotAccount(
        install.accountPath,
        path.join(slot, accountFileName(install.id)),
        email ?? emailOfAlias(alias, data)
      ),
    };
  }

  function saveDesktopInto(alias: string): { desktopItems: string[]; configSaved: boolean } {
    const slot = deps.slotOf(alias);
    return {
      desktopItems: session.snapshotDesktop(deps.profileDir, path.join(slot, DESKTOP_SUBDIR)),
      configSaved: session.snapshotConfig(desktopConfigPath(deps.profileDir), path.join(slot, CONFIG_FILE)),
    };
  }

  function saveInto(
    alias: string,
    data: IRegistry,
    install: IClaudeInstall = installFor(CODE_INSTALL),
    email: string | null = null
  ): ISaveResult {
    const desktop = saveDesktopInto(alias);
    const code = saveCodeInto(alias, data, install, email);
    return {
      desktopItems: desktop.desktopItems,
      codeSaved: code.codeSaved,
      accountSaved: code.accountSaved,
      configSaved: desktop.configSaved,
    };
  }

  function currentCodeIdentity(install: string = CODE_INSTALL): IAccountIdentity | null {
    return readCodeAccount(installFor(install).accountPath);
  }

  function fallbackAccount(target: ISavedSession): Record<string, unknown> {
    const account: Record<string, unknown> = { emailAddress: target.email, displayName: target.name };
    if (target.accountUuid) account.accountUuid = target.accountUuid;
    if (target.orgUuid) account.organizationUuid = target.orgUuid;
    return account;
  }

  function restoreAccountFor(slot: string, install: IClaudeInstall, target: ISavedSession): boolean {
    return session.restoreAccount(path.join(slot, accountFileName(install.id)), install.accountPath, fallbackAccount(target));
  }

  function stopDesktop(): number {
    const pids = desktopRunning();
    if (!pids.length) return 0;
    deps.kill(pids);
    let waited = 0;
    while (desktopRunning().length) {
      if (waited >= EXIT_TIMEOUT_MS) throw new Error('Claude Desktop did not close. Quit it from the tray and try again.');
      deps.pause(EXIT_POLL_MS);
      waited += EXIT_POLL_MS;
    }
    deps.pause(SETTLE_MS);
    return pids.length;
  }

  function relaunchDesktop(): void {
    const target = launchTarget(deps.locate());
    deps.launch(target.command, target.args);
  }

  function syncCode(install: IClaudeInstall): ISyncResult {
    const identity = readCodeAccount(install.accountPath);
    if (!identity) throw new Error(`${install.label} is not signed in. Run "claude auth login" first, then save.`);
    const data = readRegistry();
    const known = registry.sessionByEmail(data, identity.email);
    const alias = known?.alias ?? deriveAlias(identity.email);
    saveCodeInto(alias, data, install, identity.email);
    writeRegistry(
      registry.saveSession(
        data,
        {
          alias,
          email: identity.email,
          name: known?.name ?? identity.name,
          accountUuid: identity.accountUuid ?? known?.accountUuid ?? null,
          orgUuid: known?.orgUuid ?? null,
          installs: [install.id],
        },
        deps.now()
      )
    );
    return { alias, email: identity.email, name: known?.name ?? identity.name, accountUuid: identity.accountUuid, install: install.id, stopped: 0, relaunched: false };
  }

  function sync(options: ISyncOptions = {}): ISyncResult {
    const install = installFor(options.install);
    if (options.codeOnly) return syncCode(install);
    const identity = accountOf(install);
    if (!identity) {
      throw new Error(
        install.id === CODE_INSTALL
          ? 'No Claude account detected. Sign in to Claude Desktop or Claude Code first, then save.'
          : `No account signed in to ${install.label}. Sign in there first, then save.`
      );
    }
    const data = readRegistry();
    const alias = registry.sessionByEmail(data, identity.email)?.alias ?? deriveAlias(identity.email);
    const codeAccount = readCodeAccount(install.accountPath);
    const codeMatches = !codeAccount || sameEmail(codeAccount.email, identity.email);
    const stopped = options.stop === false ? 0 : stopDesktop();
    const relaunched = Boolean(stopped) && options.relaunch !== false;
    try {
      saveDesktopInto(alias);
      if (codeMatches) saveCodeInto(alias, data, install, identity.email);
      writeRegistry(
        registry.saveSession(
          data,
          {
            alias,
            email: identity.email,
            name: identity.name,
            accountUuid: identity.accountUuid,
            orgUuid: activeOrgUuid() ?? registry.findSession(data, alias)?.orgUuid ?? null,
            installs: codeMatches ? [install.id] : registry.findSession(data, alias)?.installs ?? [],
          },
          deps.now()
        )
      );
    } finally {
      if (relaunched) relaunchDesktop();
    }
    return {
      alias,
      email: identity.email,
      name: identity.name,
      accountUuid: identity.accountUuid,
      install: install.id,
      stopped,
      relaunched,
    };
  }

  function desktopCaptured(alias: string): boolean {
    try {
      return fs.readdirSync(path.join(deps.slotOf(alias), DESKTOP_SUBDIR)).length > 0;
    } catch {
      return false;
    }
  }

  function checkDesktopSwitch(alias: string): ISavedSession {
    const target = registry.findSession(readRegistry(), alias);
    if (!target) throw new Error(`No saved session for "${alias}".`);
    if (!desktopCaptured(target.alias)) {
      throw new Error(`${target.name} has no saved Claude Desktop login yet. Sign in to Claude Desktop with it once and save it.`);
    }
    deps.locate();
    return target;
  }

  function checkDesktopSave(): IAccountIdentity {
    const identity = currentIdentity();
    if (!identity) throw new Error('Claude Desktop is not signed in. Sign in first, then save its login.');
    deps.locate();
    return identity;
  }

  function autoSyncCode(): IAutoSyncResult | null {
    const identity = currentCodeIdentity() ?? currentIdentity();
    if (!identity) return null;
    const known = registry.sessionByEmail(readRegistry(), identity.email);
    if (!known) return null;
    const slotCode = path.join(deps.slotOf(known.alias), CODE_FILE);
    try {
      const current = session.readCodeBlock(deps.credPath);
      if (!current) return null;
      const previous: unknown = fs.existsSync(slotCode) ? JSON.parse(fs.readFileSync(slotCode, 'utf8')) : null;
      if (JSON.stringify(previous) === JSON.stringify(current)) return { alias: known.alias, updated: false };
      session.snapshotCode(deps.credPath, slotCode);
      session.snapshotAccount(deps.accountPath, path.join(deps.slotOf(known.alias), accountFileName(CODE_INSTALL)), known.email);
      return { alias: known.alias, updated: true };
    } catch {
      return null;
    }
  }

  function activeOrgUuid(): string | null {
    return usage.activeOrgUuid(usage.readSamples(deps.profileDir));
  }

  function rememberActiveOrg(data: IRegistry, activeAlias: string | null, orgUuid: string | null): IRegistry {
    if (!activeAlias || !orgUuid) return data;
    const known = registry.findSession(data, activeAlias);
    if (!known || known.orgUuid === orgUuid) return data;
    return writeRegistry(registry.saveSession(data, { ...known, orgUuid }, deps.now()));
  }

  function listSessions(): ISessionListing {
    autoSyncCode();
    let data = readRegistry();
    const identity = currentIdentity();
    const activeUuid = currentAccountUuid();
    const activeEmail = identity ? identity.email.toLowerCase() : null;
    const isActive = (entry: { accountUuid: string | null; email: string }): boolean =>
      activeUuid && entry.accountUuid ? entry.accountUuid === activeUuid : activeEmail === entry.email.toLowerCase();

    const samples = usage.readSamples(deps.profileDir);
    const liveOrg = usage.activeOrgUuid(samples);
    const activeAlias = (data.sessions ?? []).find(isActive)?.alias ?? null;
    data = rememberActiveOrg(data, activeAlias, liveOrg);

    return {
      running: desktopRunning().length > 0,
      current: identity,
      accountUuid: activeUuid,
      unknownAccount: Boolean(activeUuid && !identity),
      installs: installStates(data),
      sessions: (data.sessions ?? []).map(entry => ({
        ...entry,
        active: isActive(entry),
        desktopCaptured: desktopCaptured(entry.alias),
        usage: usage.usageFor(samples, entry.orgUuid),
      })),
    };
  }

  function restoreFrom(alias: string, data: IRegistry, target: ISavedSession): IRestoreResult {
    const slot = deps.slotOf(alias);
    if (!fs.existsSync(slot)) throw new Error(`No saved session for "${alias}". Sync it first.`);
    const restoredInstalls = target.installs
      .filter(id => installs.some(entry => entry.id === id))
      .filter(id => session.restoreCode(path.join(slot, installFileName(id)), installFor(id).credPath));
    for (const id of restoredInstalls) restoreAccountFor(slot, installFor(id), target);
    return {
      desktopItems: session.restoreDesktop(path.join(slot, DESKTOP_SUBDIR), deps.profileDir),
      codeRestored: restoredInstalls.length > 0,
      configRestored: session.restoreConfig(path.join(slot, CONFIG_FILE), desktopConfigPath(deps.profileDir)),
    };
  }

  function installsSignedInAs(email: string): IClaudeInstall[] {
    const wanted = email.toLowerCase();
    return installs.filter(install => {
      const account = readCodeAccount(install.accountPath);
      return Boolean(account && account.email.toLowerCase() === wanted);
    });
  }

  function switchTo(alias: string, options: ISwitchOptions = {}): ISwitchResult {
    const data = readRegistry();
    const target = registry.findSession(data, alias);
    if (!target) throw new Error(`No saved session for "${alias}".`);

    const identity = currentIdentity();
    const relaunched = options.relaunch !== false;
    const stopped = stopDesktop();
    try {
      return { ...swapLogins(target, identity, data, options), stopped, relaunched };
    } finally {
      if (relaunched) relaunchDesktop();
    }
  }

  function swapLogins(
    target: ISavedSession,
    identity: IAccountIdentity | null,
    saved: IRegistry,
    options: ISwitchOptions
  ): Omit<ISwitchResult, 'stopped' | 'relaunched'> {
    let data = saved;
    const codeIdentity = currentCodeIdentity();
    const splitLogins = Boolean(codeIdentity && identity && !sameEmail(codeIdentity.email, identity.email));
    if (options.snapshotCurrent !== false && splitLogins) {
      const desktopKnown =
        identity && !sameEmail(identity.email, target.email) ? registry.sessionByEmail(data, identity.email) : null;
      if (desktopKnown) saveDesktopInto(desktopKnown.alias);
      const codeKnown =
        codeIdentity && !sameEmail(codeIdentity.email, target.email) ? registry.sessionByEmail(data, codeIdentity.email) : null;
      if (codeKnown) saveCodeInto(codeKnown.alias, data, installFor(CODE_INSTALL), codeKnown.email);
    } else if (options.snapshotCurrent !== false && identity && !sameEmail(identity.email, target.email)) {
      const known = registry.sessionByEmail(data, identity.email);
      if (known) {
        const matching = installsSignedInAs(identity.email);
        const capture = matching.length ? matching : [installFor(CODE_INSTALL)];
        for (const install of capture) saveInto(known.alias, data, install, known.email);
        data = writeRegistry(
          registry.saveSession(data, { ...known, installs: capture.map(install => install.id) }, deps.now())
        );
      }
    }

    const restored = restoreFrom(target.alias, data, target);
    return { alias: target.alias, email: target.email, name: target.name, ...restored };
  }

  function switchCode(alias: string, options: ICodeSwitchOptions = {}): ICodeSwitchResult {
    const data = readRegistry();
    const target = registry.findSession(data, alias);
    if (!target) throw new Error(`No saved session for "${alias}".`);
    const install = installFor(options.install);
    const slot = deps.slotOf(target.alias);
    const slotFile = path.join(slot, installFileName(install.id));
    if (!fs.existsSync(slotFile)) throw new Error(`No saved Claude Code login for "${target.alias}".`);

    let previous: string | null = null;
    const current = readCodeAccount(install.accountPath);
    if (current && !sameEmail(current.email, target.email)) {
      const known = registry.sessionByEmail(data, current.email);
      if (known) {
        saveCodeInto(known.alias, data, install, known.email);
        previous = known.alias;
      }
    }

    session.restoreCode(slotFile, install.credPath);
    const accountRestored = restoreAccountFor(slot, install, target);
    return { alias: target.alias, email: target.email, name: target.name, install: install.id, previous, accountRestored };
  }

  function forget(alias: string): { alias: string } {
    const data = readRegistry();
    if (!registry.findSession(data, alias)) throw new Error(`No saved session for "${alias}".`);
    writeRegistry(registry.removeSession(data, alias));
    fs.rmSync(deps.slotOf(alias), { recursive: true, force: true });
    return { alias };
  }

  return {
    autoSyncCode,
    checkDesktopSave,
    checkDesktopSwitch,
    currentAccountUuid,
    currentIdentity,
    forget,
    listSessions,
    switchTo,
    switchCode,
    currentCodeIdentity,
    sync,
  };
}
