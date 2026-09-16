import fs from 'node:fs';
import path from 'node:path';
import { launch, launchArgs, locateApp } from './desktop-app';
import { readCodeAccount, readDesktopAccountUuid, readIdentity } from './identity';
import { CODE_INSTALL, claudeInstalls, installFileName, PRIMARY_INSTALL_LABEL } from './installs';
import {
  IAccountIdentity,
  IAutoSyncResult,
  IClaudeInstall,
  IInstallState,
  IRegistry,
  IRestoreResult,
  ISaveResult,
  ISavedSession,
  ISessionListing,
  ISharingResult,
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
  DEFAULT_ALIAS,
  deriveAlias,
  desktopConfigPath,
  desktopProfileDir,
  sessionSlot,
  sharedRoot,
} from './paths';
import { groupProcesses, killPids, listClaudeProcesses } from './processes';
import * as registry from './registry';
import * as session from './session-store';
import * as shared from './shared-store';

export const DESKTOP_SUBDIR = 'desktop';
export const CODE_FILE = 'code.json';
export const CONFIG_FILE = 'config.json';

function defaultDeps(): ISwitcherDeps {
  return {
    profileDir: desktopProfileDir(),
    credPath: codeCredentialsPath(),
    accountPath: codeAccountPath(),
    installs: claudeInstalls(),
    sharedDir: sharedRoot(),
    slotOf: alias => sessionSlot(alias),
    registryFile: undefined,
    readIdentity,
    listProcesses: listClaudeProcesses,
    kill: killPids,
    launch,
    locate: locateApp,
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
    const profiles = [{ alias: DEFAULT_ALIAS, dir: deps.profileDir }];
    return groupProcesses(deps.listProcesses(), profiles, deps.profileDir).get(DEFAULT_ALIAS) ?? [];
  }

  function sharingEnabledIn(data: IRegistry): boolean {
    return registry.settingsOf(data).shareSession;
  }

  function swappedDesktopItemsIn(data: IRegistry): string[] {
    return shared.swappedItems(session.DESKTOP_ITEMS, shared.SHARED_DESKTOP_ITEMS, sharingEnabledIn(data));
  }

  const captureShared = (): string[] => shared.capture(deps.profileDir, deps.sharedDir);
  const applyShared = (): string[] => shared.apply(deps.sharedDir, deps.profileDir);

  function saveInto(alias: string, data: IRegistry, install: IClaudeInstall = installFor(CODE_INSTALL)): ISaveResult {
    const slot = deps.slotOf(alias);
    return {
      desktopItems: session.snapshotDesktop(deps.profileDir, path.join(slot, DESKTOP_SUBDIR), swappedDesktopItemsIn(data)),
      codeSaved: session.snapshotCode(install.credPath, path.join(slot, installFileName(install.id))),
      configSaved: session.snapshotConfig(desktopConfigPath(deps.profileDir), path.join(slot, CONFIG_FILE)),
    };
  }

  function stopDesktop(): number {
    const pids = desktopRunning();
    deps.kill(pids);
    return pids.length;
  }

  function relaunchDesktop(): void {
    deps.launch(deps.locate(), launchArgs(deps.profileDir, true));
  }

  function setSharing(enabled: boolean): ISharingResult {
    writeRegistry(registry.setSetting(readRegistry(), 'shareSession', Boolean(enabled)));
    if (!enabled) return { shareSession: false, captured: [], pruned: [] };
    const captured = captureShared();
    const slots = (readRegistry().sessions ?? []).map(entry => path.join(deps.slotOf(entry.alias), DESKTOP_SUBDIR));
    return { shareSession: true, captured, pruned: shared.clearFromSlots(slots) };
  }

  function sync(options: ISyncOptions = {}): ISyncResult {
    const install = installFor(options.install);
    const identity = accountOf(install);
    if (!identity) {
      throw new Error(
        install.id === CODE_INSTALL
          ? 'No Claude account detected. Sign in to Claude Desktop or Claude Code first, then save.'
          : `No account signed in to ${install.label}. Sign in there first, then save.`
      );
    }
    const alias = deriveAlias(identity.email);
    const data = readRegistry();
    const stopped = options.stop === false ? 0 : stopDesktop();
    saveInto(alias, data, install);
    if (sharingEnabledIn(data)) captureShared();
    writeRegistry(
      registry.saveSession(
        data,
        {
          alias,
          email: identity.email,
          name: identity.name,
          accountUuid: identity.accountUuid,
          installs: [install.id],
        },
        deps.now()
      )
    );
    const relaunched = Boolean(stopped) && options.relaunch !== false;
    if (relaunched) relaunchDesktop();
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
    return fs.existsSync(path.join(deps.slotOf(alias), DESKTOP_SUBDIR));
  }

  function autoSyncCode(): IAutoSyncResult | null {
    const identity = currentIdentity();
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
      return { alias: known.alias, updated: true };
    } catch {
      return null;
    }
  }

  function listSessions(): ISessionListing {
    autoSyncCode();
    const data = readRegistry();
    const identity = currentIdentity();
    const activeUuid = currentAccountUuid();
    const activeEmail = identity ? identity.email.toLowerCase() : null;
    const isActive = (entry: { accountUuid: string | null; email: string }): boolean =>
      activeUuid && entry.accountUuid ? entry.accountUuid === activeUuid : activeEmail === entry.email.toLowerCase();
    return {
      running: desktopRunning().length > 0,
      current: identity,
      accountUuid: activeUuid,
      unknownAccount: Boolean(activeUuid && !identity),
      shareSession: sharingEnabledIn(data),
      sharedItems: shared.SHARED_DESKTOP_ITEMS,
      sharedCodeItems: shared.SHARED_CODE_ITEMS,
      installs: installStates(data),
      sessions: (data.sessions ?? []).map(entry => ({
        ...entry,
        active: isActive(entry),
        desktopCaptured: desktopCaptured(entry.alias),
      })),
    };
  }

  function restoreFrom(alias: string, data: IRegistry, target: ISavedSession): IRestoreResult {
    const slot = deps.slotOf(alias);
    if (!fs.existsSync(slot)) throw new Error(`No saved session for "${alias}". Sync it first.`);
    const restoredInstalls = target.installs
      .filter(id => installs.some(entry => entry.id === id))
      .filter(id => session.restoreCode(path.join(slot, installFileName(id)), installFor(id).credPath));
    return {
      desktopItems: session.restoreDesktop(path.join(slot, DESKTOP_SUBDIR), deps.profileDir, swappedDesktopItemsIn(data)),
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
    let data = readRegistry();
    const target = registry.findSession(data, alias);
    if (!target) throw new Error(`No saved session for "${alias}".`);

    const identity = currentIdentity();
    const stopped = stopDesktop();
    const sharing = sharingEnabledIn(data);

    if (options.snapshotCurrent !== false && identity && identity.email.toLowerCase() !== target.email.toLowerCase()) {
      const known = registry.sessionByEmail(data, identity.email);
      if (known) {
        const matching = installsSignedInAs(identity.email);
        const capture = matching.length ? matching : [installFor(CODE_INSTALL)];
        for (const install of capture) saveInto(known.alias, data, install);
        data = writeRegistry(
          registry.saveSession(data, { ...known, installs: capture.map(install => install.id) }, deps.now())
        );
      }
    }

    if (sharing) captureShared();
    const restored = restoreFrom(alias, data, target);
    const sharedItems = sharing ? applyShared() : [];

    const relaunched = options.relaunch !== false;
    if (relaunched) relaunchDesktop();

    return { alias: target.alias, email: target.email, name: target.name, stopped, relaunched, sharedItems, ...restored };
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
    currentAccountUuid,
    currentIdentity,
    forget,
    listSessions,
    setSharing,
    sharingEnabled: () => sharingEnabledIn(readRegistry()),
    swappedDesktopItems: () => swappedDesktopItemsIn(readRegistry()),
    switchTo,
    sync,
  };
}
