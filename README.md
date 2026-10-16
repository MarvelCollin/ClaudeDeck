# ClaudeDeck

Switch the active Claude account across Claude Desktop and Claude Code, and schedule background Claude runs, from a pane beside the chat in Claude Desktop.

## Install

ClaudeDeck is a Claude Code mod. At the prompt of a Claude Code terminal session:

```
/plugin install claudedeck --marketplace MarvelCollin/ClaudeDeck
```

From a shell:

```bash
claude plugin install claudedeck --marketplace MarvelCollin/ClaudeDeck
```

In Claude Desktop, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `MarvelCollin/ClaudeDeck`, then Add plugin. Answer `y` to add the marketplace and pick the user scope, so the pane opens in every session.

It needs Node.js 18 or later on the PATH, and Claude Code signed in at least once (`claude auth login`).

## The engine

The mod draws the pane. The work happens in `engine/`, a small Node program the mod runs as `node engine/bin/claudedeck.js api ...`. The same program has a command line, and the auto switch task and the background runs use it too. To call it as `claudedeck` from a terminal, link it once:

```bash
cd engine
npm link
```

`claudedeck help` lists every command. The commands in the rest of this README use that name.

On macOS the background runs use `launchd` and install a LaunchAgent at `~/Library/LaunchAgents/com.claudedeck.plist`. The Mac must be powered on and signed in for local scheduled runs.

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

Set `CLAUDEDECK_HOME` to keep every ClaudeDeck file somewhere else. On Windows with the Store build of Claude Desktop this matters: anything started from inside Claude Desktop, such as the ClaudeDeck mod or a Claude Code shell, has its writes to `%APPDATA%` redirected into the app's package folder, so it would see a different ClaudeDeck than your terminal. A folder outside `AppData` avoids that. ClaudeDeck also uses `%USERPROFILE%\.claudedeck` by itself whenever that folder exists, so apps started before the variable was set still agree, and an empty `CLAUDEDECK_HOME` turns that off:

```bash
setx CLAUDEDECK_HOME %USERPROFILE%\.claudedeck
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
  "warmAllAccounts": false,
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

### Warm every account

A scheduled run normally sends the prompt once, from the account Claude Code is signed in to. Set `"warmAllAccounts": true` to also start the 5 hour window of every other saved account at the same slot, so each one is ready when auto switch moves to it. The **Warm every account** button in the **Background runs** tab of the mod flips the same flag.

After the main run, ClaudeDeck checks live usage for every saved account and skips the ones that:

- are the account Claude Code is on, since the main run already covers it
- already have a running 5 hour window
- are held out of auto switch
- need a new sign in, have no saved Claude Code login, or used up their week

For each account left it makes a temporary folder with that account's saved login (`code.json` as `.credentials.json` and `account.json` as `oauthAccount` in `.claude.json`) and runs `claude -p <prompt> --model haiku` with `CLAUDE_CONFIG_DIR` pointing at it, without `ANTHROPIC_API_KEY` or other token variables. An expired token is refreshed first. If Claude rotates the token during the run, the new one is saved back to the account's slot, and the folder is deleted afterwards. Your own `~/.claude/.credentials.json` and the Claude Code login are never touched.

Each account gets one line in the run log, followed by a total:

```text
[2026-10-16T15:00:04.120Z] warm work: warmed, started the 5h window
[2026-10-16T15:00:04.121Z] warm side: skipped, 5h window already running until 2026-10-16T17:12:00Z
[2026-10-16T15:00:04.121Z] warm done: 1 warmed, 0 failed, 3 skipped
```

The run's exit code stays the main run's, so a failed warm shows in the log without marking the scheduled task as failed. Claude Code on macOS keeps its login in the Keychain instead of `.credentials.json`, so warming other accounts is built and tested for Windows.

## The pane

The pane opens beside the chat with every Claude Desktop session and has three tabs:

- **Accounts**: one card per account with its live session and weekly usage, when each resets, and which account Claude Code and Desktop are on. **Use now** moves Claude Code without restarting Desktop, **Use next** picks the account auto switch moves to next, **Hold** keeps it out, **Sign in again** walks a dead login through a fresh sign in, and **More** opens it in its own Desktop window, switches Desktop too, or forgets it.
- **Background runs**: turn the scheduled runs on or off, run once now, and edit the prompt and the times.
- **Run log**: the last runs.

`/deck` reopens the pane. `/deck use <name>`, `/deck next <name>`, `/deck hold <name>`, `/deck auto on` and `/deck refresh` do the same from the prompt.

To work on the mod from a clone, point Claude Code at the folder in `~/.claude/settings.json` instead of installing it:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "C:/path/to/ClaudeDeck"
  }
}
```

## Switch Claude accounts

ClaudeDeck keeps one Claude Desktop and swaps the active account in place, so Claude Desktop and Claude Code always sit on the same login. It saves the session files each account produces after you sign in, then restores them on demand. Nothing is decrypted, no password is typed, and nothing leaves your machine.

Three stores make up an account session:

- Claude **Code** reads `~/.claude/.credentials.json`. This file is never locked, so ClaudeDeck keeps the active account's copy in sync automatically.
- Claude **Desktop** chat reads its Chromium session files under `%APPDATA%\Claude`. Windows locks these while the app runs, so capturing or restoring them needs Claude Desktop to close and reopen, about two seconds.
- Claude **Desktop** also keeps its OAuth token cache and the active account id in `%APPDATA%\Claude\config.json`. ClaudeDeck swaps only the `oauth:` keys and `lastKnownAccountUuid` out of that file and leaves your window layout and other preferences alone.

Because of that lock, switching restarts Claude Desktop. Claude Code picks up the new login on its next message without a restart.

### Switch Claude Code only

```bash
claudedeck switch work-example.com code
```

This moves only Claude Code to another account. Claude Desktop stays open on its own login, so nothing restarts and a running Code session picks up the new login on its next message. The token in `~/.claude/.credentials.json` and the `oauthAccount` block in `~/.claude.json` are swapped together, and the login you leave is saved to its own account first.

Because Desktop and Code can now sit on different accounts, ClaudeDeck tracks the Code account by `~/.claude.json` and saves each login into its own slot. Every save keeps the `oauthAccount` block in the slot as `account.json`.

### How the signed-in account is detected

Claude Desktop does not store your email in plain text. ClaudeDeck reads `lastKnownAccountUuid` from `%APPDATA%\Claude\config.json` to learn which account is active, then puts a name to that id in this order:

1. `~/.claude.json`, where Claude Code records `oauthAccount` with the email and display name, when its account id matches.
2. The ClaudeDeck registry, for any account you have already saved.
3. A scan of the claude.ai IndexedDB files, which older Claude Desktop builds used.

If Claude Desktop is signed in but the id is new to both Claude Code and ClaudeDeck, `claudedeck list` says so and names the id. Open Claude Code once on that account and reload.

Claude Desktop is not required. When no Desktop profile is found, ClaudeDeck reads the account straight from `~/.claude.json`, so a machine with only Claude Code still shows its account and can save and switch it. Desktop session files are simply skipped.

Windows has two Claude Desktop layouts. The classic installer uses `%APPDATA%\Claude`. The Store and MSIX build redirects that folder into its package container at `%LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Roaming\Claude`. ClaudeDeck prefers the classic path and falls back to the packaged one, so both installs are detected.

### Two Claude Code installs

The stable and insiders builds of Claude Code keep separate logins, so they can sit on different accounts at the same time:

| Install | Account file | Credentials |
|---|---|---|
| Claude Desktop and Claude Code | `~/.claude.json` | `~/.claude/.credentials.json` |
| Claude Code Insiders | `~/.claude-insiders/.claude.json` | `~/.claude-insiders/.credentials.json` |

Both are listed and each one saves and switches on its own. A saved account records which installs it covers, so switching restores only those. If the same account is signed in to both, one saved entry holds a credential file per install and switching restores both at once.

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

### Auto switch before a limit

```bash
claudedeck auto install
claudedeck auto status
claudedeck next work-example.com
claudedeck hold work-example.com
```

`auto` keeps Claude Code on the best account and moves it with `switch <alias> code`, so Claude Desktop never restarts. `auto install` registers a Windows task that starts it hidden at every sign in, and starts it now.

How it picks:

1. An account whose 5 hour session is already running is used until that session is done. A move only happens when the active account reaches 95 percent, or when another running session resets at least 15 minutes sooner.
2. Among idle accounts, the one with the most weekly quota about to expire goes first: hours until the weekly reset divided by the weekly percent still unused. Accounts burning their week ahead of pace go last.
3. An account only takes over while it is below 85 percent. When every account is near its limit, auto switch stays put, and only escapes an account that has actually hit 100 percent.

`next <alias>` puts an account first in line for the next move, `next clear` returns to the ranking. `hold <alias>` keeps an account out entirely, `release <alias>` brings it back. `auto set threshold 95`, `auto set landing 85`, `auto set cooldown 60` and `auto set interval 20` tune the rules, and `auto dry` shows what it would do right now. Every move is written to `auto.log`.

### Bring accounts over from claude-swap

```bash
claudedeck import cswap
```

Runs `cswap export` into a temporary file, copies each account's Claude Code token and `oauthAccount` into its ClaudeDeck slot, and deletes the file. An account already saved here keeps its alias and only takes the imported token when it is fresher. Stop `cswap auto` first, or it keeps rotating the tokens you just copied.

## Run accounts side by side

Switching closes and reopens Claude Desktop. If you would rather keep every account signed in at once, open each one in its own window instead:

```bash
claudedeck open marvelcollin7-gmail.com
claudedeck open work-example.com
claudedeck close work-example.com
```

In the Desktop pane, **More** on each account card does the same thing.

Each account gets its own Claude Desktop profile directory:

```text
%APPDATA%\ClaudeDeck\profiles\<alias>                   Windows
~/Library/Application Support/ClaudeDeck/profiles/<alias> macOS
```

Claude Desktop is an Electron app, and its single instance lock lives inside the profile directory, so one window per directory runs happily alongside the others. The first `open` seeds the new profile from that account's saved session, including the `oauth:` keys in `config.json`, so it starts already signed in rather than asking you to log in again. If a window is still signed out the next `open` repairs it from the saved session.

Because nothing is swapped, nothing can go stale: every window stays signed in for as long as you leave it alone, and `switch` is only needed if you want a single window instead.

Two things to know:

- Claude **Code** still has one login at a time, because it reads a single `~/.claude/.credentials.json`. Side by side windows cover Claude Desktop only.
- Each window is a full Claude Desktop, so several at once use more memory than one.

`claudedeck list` marks an open account with `>`:

```text
> kowlin   marvelgamerzgt@gmail.com    open            5h 85% left  week 48% left
* kolin    marvelcollin7@gmail.com     ready           5h 76% left  week 73% left
  Bet      bertrand13022005@gmail.com  not opened yet  usage unknown
```

## Signing in inside an account window

An account with no saved desktop session has to sign in from its own window, and that login ends on a `claude://` link. Windows hands that link to whichever Claude Desktop the registry points at, which is the default profile, so the window that started the login keeps waiting and never finishes.

ClaudeDeck can take that link over:

```bash
claudedeck deeplink install
claudedeck deeplink status
claudedeck deeplink remove
```

`install` points `HKCU\Software\Classes\claude\shell\open\command` at ClaudeDeck and remembers the previous command. Every `claude://` link then goes to the account window that is open and still signed out, launched as `Claude.exe --user-data-dir=<profile> <link>`. With no window waiting, the link goes to Claude Desktop exactly as before. `remove` puts the old command back.

Claude Desktop claims that handler back every time it starts, so `claudedeck open` takes it again a few seconds after the window comes up. Sign in while that window is the newest one: starting another Claude Desktop hands the handler back to it, and the link follows.

A saved login that has expired leaves a window asking to sign in that ClaudeDeck still reads as signed in. Start it over from an empty profile:

```bash
claudedeck open marvelcollin7-gmail.com fresh
```

That closes the window, deletes `profiles\<alias>`, and opens a plain sign in screen. The saved session in `sessions\<alias>` is untouched.

This is Windows only. On macOS the login already returns to the app that asked for it.

## Usage left per account

Every saved account shows how much of its plan is still available:

```text
* kolin    marvelcollin7@gmail.com     5h 97% left  week 76% left
  kowlin   marvelgamerzgt@gmail.com    usage unknown
```

The Desktop pane draws live usage as bars on each account card instead, see [Live usage with reset times](#live-usage-with-reset-times).

The figures come from Claude Desktop itself. It keeps a rolling record in `plan-usage-history.json` inside its profile:

```json
{"t":1787799753872,"org":"167e0b5e-...","u":{"fh":1,"sd":35}}
```

`fh` is the five hour limit and `sd` is the weekly one, both as a percentage already used, so ClaudeDeck shows `100 - value` as the amount left. Nothing is fetched over the network and no token is spent reading it.

An account opened in its own window reads its own profile's file directly, so its figures are exact and need no organisation lookup at all.

For accounts that share the single swapped profile, samples are tagged by organisation rather than by account, so ClaudeDeck records which organisation an account was using when you saved it, and refreshes that link whenever the account is the signed-in one. Two consequences:

- An account saved before this feature reads `usage unknown` until the next time it is signed in.
- If one account belongs to several organisations, the figures follow whichever organisation it used most recently. `claudedeck list` prints the measurement time so you can tell how fresh it is.

Claude Desktop only writes a sample while it is running, so the numbers stop moving once it is closed.

### Live usage with reset times

The Desktop history above has no reset times and goes stale for accounts you are not signed in to. `usage` asks Anthropic directly for every saved account, using the Claude Code login saved with it:

```bash
claudedeck usage
claudedeck usage refresh
claudedeck list --json --refresh
```

```text
* kolin    5h 41% left, resets in 1h 36m  week 67% left, resets in 4d 4h
  kowlin   5h 100% left  week 52% left, resets in 6h 40m
```

Each account is checked at most once a minute and the answers are kept in `usage-live.json` beside the registry. The account Claude Code is signed in to is read with its live token and never refreshed, because Claude Code owns that token. An idle account whose token has expired is refreshed and the rotated token is saved back to its slot. A login the server rejects shows as needing a new sign in.

## What is shared and what is swapped

Switching swaps the login, not your work.

- Claude **Code** keeps `projects`, `history.jsonl`, `todos`, and `statsig` under `~/.claude` untouched. Only the `claudeAiOauth` block inside `.credentials.json` is swapped, so transcripts, todos, and settings carry across accounts.
- Claude **Desktop** keeps its whole Chromium profile per account: `Local State`, `Preferences`, `Network`, `Local Storage`, `Session Storage`, `WebStorage`, and `IndexedDB`, plus the `oauth:` keys and `lastKnownAccountUuid` in `config.json`.

Your chats are not local. They live on claude.ai and follow whichever account you switch to, so nothing is lost by keeping the profile per account.

Earlier versions shared `Local Storage` and `Session Storage` across accounts to preserve local history. That is what forced a fresh Google sign-in on every switch: claude.ai keeps part of the signed-in session in local storage, so pairing one account's cookies with another account's local storage made the app throw the session away. Those stores are now per account and `claudedeck share on` no longer moves any Claude Desktop file.

`forget` deletes a saved session. Before overwriting `~/.claude/.credentials.json`, ClaudeDeck copies it to `.credentials.json.claudedeck.bak`.

## Develop

The repository root is the mod and `engine/` is the Node program it runs.

```text
.claude-plugin           plugin.json and the marketplace file
hooks                    the mod: register.tsx draws the pane, view.ts holds the SVG and text helpers
types                    the mod's state contract
scripts/relogin.ps1      the sign in again window
engine/src/accounts      identity, registry, sessions, switcher, live usage, auto switch
engine/src/scheduler     Windows Task Scheduler and macOS launchd adapters
engine/src/service       schedule and account actions shared by the CLI and the api command
engine/src/cli           command router and the api command the mod calls
```

```bash
cd engine
npm install
npm run build        # tsc into engine/dist
npm test             # node:test over engine/tests/*.spec.ts
npm run check        # typecheck plus the config and PowerShell parse checks
cd ..
claude plugin validate .
claude plugin test .  # the mod's hooks/*.test.ts
```

Engine tests are named `*.spec.ts` because `claude plugin test` runs every `*.test.ts` in the repository. Every engine folder keeps its types in an `interfaces` directory, one `I{Name}.ts` file per interface, re-exported from `interfaces/index.ts`.
