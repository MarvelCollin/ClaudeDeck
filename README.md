# ClaudeDeck

Switch the active Claude account across Claude Desktop and Claude Code, and schedule background Claude runs, from one local control panel.

## Install

```bash
npm i -g claudedeck
claudedeck
```

To run it from a clone instead, link it once:

```bash
npm link
```

`claudedeck` on its own opens the control panel in your browser. Everything else is a subcommand, and `claudedeck help` lists them all.

Run Claude CLI login first if Claude is not authenticated yet.

```bash
claude auth
```

## Two commands

`cdeck` is the short alias for `claudedeck`. Either one on its own opens the control panel in your browser.

```bash
cdeck
claudedeck
```

`claudedeck menu` opens the terminal menu, which does the same things without a browser.

Both names accept the same subcommands, so `cdeck list`, `claudedeck list`, and `claudedeck web list` are equivalent.

## macOS

ClaudeDeck supports macOS through `launchd`.

```bash
npm i -g claudedeck
claude auth
claudedeck menu
```

Choose `Configure Schedule` to edit the JSON config, then choose `Run Background` to install or update the LaunchAgent at:

```text
~/Library/LaunchAgents/com.claudedeck.plist
```

The Mac must be powered on and signed in for local scheduled runs. It cannot run after a full shutdown.

## Manage Schedule

```bash
claudedeck menu
```

Use the arrow keys to choose `Configure Schedule`, `Run Background`, `Stop Background`, `Run once now`, or `Open log`. The menu shows whether the background schedule is on, whether a run is active, the last run time, the next run time, and run counts.

## Config Tutorial

On first run, ClaudeDeck creates `claudedeck.config.json` in your user app data folder.

Windows:

```text
%APPDATA%\ClaudeDeck\claudedeck.config.json
```

macOS:

```text
~/Library/Application Support/ClaudeDeck/claudedeck.config.json
```

Use `Configure Schedule` in the menu for the easiest setup. It opens the real JSON config file; save and close the editor, then choose whether to apply the updated background schedule.

You can also edit the config file manually.

```json
{
  "taskName": "ClaudeDeck",
  "macLabel": "com.claudedeck",
  "prompt": "hi",
  "model": "haiku",
  "logFile": "claude-run.log",
  "wakeToRun": true,
  "runWhenLocked": true,
  "schedules": [
    {
      "days": ["Wednesday", "Thursday"],
      "times": ["00:00", "05:00", "10:00", "15:00", "20:00"]
    },
    {
      "days": ["Friday", "Saturday", "Sunday", "Monday", "Tuesday"],
      "times": ["00:00", "05:00", "10:00", "15:00", "20:00"]
    }
  ]
}
```

Use English day names: `Monday`, `Tuesday`, `Wednesday`, `Thursday`, `Friday`, `Saturday`, `Sunday`. Use 24-hour `HH:mm` times. Add another schedule block when different days need different times. Keep `"model": "haiku"` because the runner enforces Haiku only.

After changing the config manually, run `claudedeck` and choose `Run Background` so Windows Task Scheduler or macOS launchd is updated.

## Control Panel

Everything ClaudeDeck does is also available as a page in your browser. Run:

```bash
cdeck
```

That serves a page on `127.0.0.1`, opens it, and prints the address. The server waits up to two minutes for the browser to load the page, so a cold browser start or a pasted URL still gets through. Once the tab is open the server only lives while it stays open, and stops about ten seconds after you close it. There is no tray icon, no background service and no port left listening. Every request needs a session token that is generated per run, and requests from other hostnames are refused.

From the page you can edit the schedule, start or stop the background task, trigger a single run, read the log, and manage Claude Desktop accounts. The terminal menu still works and its `Open Control Panel` entry opens the same page.

## Switch Claude accounts

ClaudeDeck keeps one Claude Desktop and swaps the active account in place, so Claude Desktop and Claude Code always sit on the same login. It saves the session files each account produces after you sign in, then restores them on demand. Nothing is decrypted, no password is typed, and nothing leaves your machine.

Three stores make up an account session:

- Claude **Code** reads `~/.claude/.credentials.json`. This file is never locked, so ClaudeDeck keeps the active account's copy in sync automatically.
- Claude **Desktop** chat reads its Chromium session files under `%APPDATA%\Claude`. Windows locks these while the app runs, so capturing or restoring them needs Claude Desktop to close and reopen, about two seconds.
- Claude **Desktop** also keeps its OAuth token cache and the active account id in `%APPDATA%\Claude\config.json`. ClaudeDeck swaps only the `oauth:` keys and `lastKnownAccountUuid` out of that file and leaves your window layout and other preferences alone.

Because of that lock, switching restarts Claude Desktop. Claude Code picks up the new login on its next message without a restart.

### How the signed-in account is detected

Claude Desktop does not store your email in plain text. ClaudeDeck reads `lastKnownAccountUuid` from `%APPDATA%\Claude\config.json` to learn which account is active, then puts a name to that id in this order:

1. `~/.claude.json`, where Claude Code records `oauthAccount` with the email and display name, when its account id matches.
2. The ClaudeDeck registry, for any account you have already saved.
3. A scan of the claude.ai IndexedDB files, which older Claude Desktop builds used.

If Claude Desktop is signed in but the id is new to both Claude Code and ClaudeDeck, the panel says so and names the id. Open Claude Code once on that account and reload.

Claude Desktop is not required. When no Desktop profile is found, ClaudeDeck reads the account straight from `~/.claude.json`, so a machine with only Claude Code still shows its account and can save and switch it. Desktop session files are simply skipped.

Windows has two Claude Desktop layouts. The classic installer uses `%APPDATA%\Claude`. The Store and MSIX build redirects that folder into its package container at `%LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Roaming\Claude`. ClaudeDeck prefers the classic path and falls back to the packaged one, so both installs are detected.

### Two Claude Code installs

The stable and insiders builds of Claude Code keep separate logins, so they can sit on different accounts at the same time:

| Install | Account file | Credentials |
|---|---|---|
| Claude Desktop and Claude Code | `~/.claude.json` | `~/.claude/.credentials.json` |
| Claude Code Insiders | `~/.claude-insiders/.claude.json` | `~/.claude-insiders/.credentials.json` |

The panel lists both under **Signed in on this machine** and each one saves and switches on its own. A saved account records which installs it covers, so switching restores only those. If the same account is signed in to both, one saved entry holds a credential file per install and switching restores both at once.

```bash
claudedeck list
claudedeck save
claudedeck switch work-example.com
claudedeck forget work-example.com
claudedeck share off
```

The older `claudedeck web <command>` spelling still works.

To set up two accounts:

1. Signed in as the first account, run `save` (or press **Save this account**). Claude Desktop restarts once to capture its session.
2. In Claude Desktop, sign out and sign in with the second account.
3. Run `save` again.
4. Use `switch` to jump between them. Switching saves the account you are leaving first, so you never lose a session.

Saved sessions live in:

```text
%APPDATA%\ClaudeDeck\sessions                            Windows
~/Library/Application Support/ClaudeDeck/sessions        macOS
```

## What is shared and what is swapped

Switching swaps the login, not your work.

- Claude **Code** keeps `projects`, `history.jsonl`, `todos`, and `statsig` under `~/.claude` untouched. Only the `claudeAiOauth` block inside `.credentials.json` is swapped, so transcripts, todos, and settings carry across accounts.
- Claude **Desktop** keeps its whole Chromium profile per account: `Local State`, `Preferences`, `Network`, `Local Storage`, `Session Storage`, `WebStorage`, and `IndexedDB`, plus the `oauth:` keys and `lastKnownAccountUuid` in `config.json`.

Your chats are not local. They live on claude.ai and follow whichever account you switch to, so nothing is lost by keeping the profile per account.

Earlier versions shared `Local Storage` and `Session Storage` across accounts to preserve local history. That is what forced a fresh Google sign-in on every switch: claude.ai keeps part of the signed-in session in local storage, so pairing one account's cookies with another account's local storage made the app throw the session away. Those stores are now per account and `claudedeck share on` no longer moves any Claude Desktop file.

`forget` deletes a saved session. Before overwriting `~/.claude/.credentials.json`, ClaudeDeck copies it to `.credentials.json.claudedeck.bak`.

## Develop

ClaudeDeck is written in TypeScript. `src` compiles to `dist`, which is what the `bin` entry points and the published package load.

```bash
npm install
npm run build        # tsc, then copy the control panel assets into dist
npm run dev          # run the CLI straight from src through tsx
npm test             # node:test over tests/*.test.ts
npm run check        # typecheck plus the config and PowerShell parse checks
```

Layout:

```text
src/core        config, logging, paths, process helpers
src/accounts    identity, registry, session snapshots, switcher
src/scheduler   Windows Task Scheduler and macOS launchd adapters
src/web         control panel server, service, and HTML/CSS/JS assets
src/cli         command router, terminal menu, entry points
```

Every folder keeps its types in an `interfaces` directory, one `I{Name}.ts` file per interface, re-exported from `interfaces/index.ts`. The control panel markup lives in real `src/web/assets/panel.html`, `panel.css`, and `panel.js` files rather than inline strings.

## Publish

Add an npm automation token to GitHub Actions as `NPM_TOKEN`. To publish a new version:

```bash
npm version patch
git push --follow-tags
```

The workflow publishes to npm when a `v*` tag is pushed. Do not publish every normal push because npm rejects the same package version twice.
