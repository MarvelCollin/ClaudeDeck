# ClaudeDeck

Command-line scheduler for running Claude CLI prompts in the background.

## Install

```bash
npm i -g claudedeck-cli
claudedeck
```

Run Claude CLI login first if Claude is not authenticated yet.

```bash
claude auth
```

## macOS

ClaudeDeck supports macOS through `launchd`.

```bash
npm i -g claudedeck-cli
claude auth
claudedeck
```

Choose `Configure Schedule` to edit the JSON config, then choose `Run Background` to install or update the LaunchAgent at:

```text
~/Library/LaunchAgents/com.claudedeck.plist
```

The Mac must be powered on and signed in for local scheduled runs. It cannot run after a full shutdown.

## Manage Schedule

```bash
claudedeck
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
claudedeck web
```

That serves a page on `127.0.0.1`, opens it, and prints the address. The server only lives while the tab is open and stops about ten seconds after you close it. There is no tray icon, no background service and no port left listening. Every request needs a session token that is generated per run, and requests from other hostnames are refused.

From the page you can edit the schedule, start or stop the background task, trigger a single run, read the log, and manage Claude Desktop accounts. The terminal menu still works and its `Open Control Panel` entry opens the same page.

## Switch Claude Desktop Accounts

Claude Desktop keeps its login in a Chromium profile directory. ClaudeDeck creates extra profile directories and launches Claude Desktop against them with `--user-data-dir`, so several accounts run side by side in separate windows. Nothing is decrypted and no token is copied.

Add an account in the Control Panel, or from the command line:

```bash
claudedeck web list
claudedeck web add work@example.com
claudedeck web launch work-example.com
claudedeck web label work-example.com Work Account
claudedeck web stop work-example.com
claudedeck web remove work-example.com
```

The name you type is kept as the display name. A folder name is derived from it, and that derived name is the alias the other commands take. `default` is your existing Claude Desktop login and cannot be removed.

A new profile starts signed out, so launch it once and sign in with the other account. Extra profiles live in:

```text
%APPDATA%\ClaudeDeck\profiles                            Windows
~/Library/Application Support/ClaudeDeck/profiles        macOS
```

`remove` deletes that directory, including the saved login. A profile must be stopped before it can be removed.

Claude Code sessions are not covered by this. They read `~/.claude/.credentials.json`, which is shared by every profile, so the Code tab uses the same login in all windows.

## Publish

Add an npm automation token to GitHub Actions as `NPM_TOKEN`. To publish a new version:

```bash
npm version patch
git push --follow-tags
```

The workflow publishes to npm when a `v*` tag is pushed. Do not publish every normal push because npm rejects the same package version twice.
