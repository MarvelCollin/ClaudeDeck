# ClaudeCron

Command-line scheduler for running Claude CLI prompts in the background.

## Install

```bash
npm i -g claudecron-cli
claudecron
```

Run Claude CLI login first if Claude is not authenticated yet.

```bash
claude auth
```

## macOS

ClaudeCron supports macOS through `launchd`.

```bash
npm i -g claudecron-cli
claude auth
claudecron
```

Choose `Configure Schedule` to edit the JSON config, then choose `Run Background` to install or update the LaunchAgent at:

```text
~/Library/LaunchAgents/com.claudecron.plist
```

The Mac must be powered on and signed in for local scheduled runs. It cannot run after a full shutdown.

## Manage Schedule

```bash
claudecron
```

Use the arrow keys to choose `Configure Schedule`, `Run Background`, `Stop Background`, `Run once now`, or `Open log`. The menu shows whether the background schedule is on, whether a run is active, the last run time, the next run time, and run counts.

## Config Tutorial

On first run, ClaudeCron creates `claudecron.config.json` in your user app data folder.

Windows:

```text
%APPDATA%\ClaudeCron\claudecron.config.json
```

macOS:

```text
~/Library/Application Support/ClaudeCron/claudecron.config.json
```

Use `Configure Schedule` in the menu for the easiest setup. It opens the real JSON config file; save and close the editor, then choose whether to apply the updated background schedule.

You can also edit the config file manually.

```json
{
  "taskName": "ClaudeCron",
  "macLabel": "com.claudecron",
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

After changing the config manually, run `claudecron` and choose `Run Background` so Windows Task Scheduler or macOS launchd is updated.

## Publish

Add an npm automation token to GitHub Actions as `NPM_TOKEN`. To publish a new version:

```bash
npm version patch
git push --follow-tags
```

The workflow publishes to npm when a `v*` tag is pushed. Do not publish every normal push because npm rejects the same package version twice.
