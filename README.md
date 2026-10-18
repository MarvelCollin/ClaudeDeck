# ClaudeDeck

A Claude mod that keeps several Claude accounts working for you. It shows live usage for every saved account, moves Claude Code to another account without a restart, gives every account its own Claude Desktop window so nothing ever closes, and auto switches to the account whose weekly quota runs out first.

Everything lives in a sidebar beside the chat in Claude Desktop, and in any Claude Code session.

## Install

At the prompt of a Claude Code session:

```
/plugin install claudedeck --marketplace MarvelCollin/ClaudeDeck
```

From a shell:

```bash
claude plugin install claudedeck --marketplace MarvelCollin/ClaudeDeck
```

In Claude Desktop, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `MarvelCollin/ClaudeDeck`, then **Add plugin**. Pick the user scope so the deck opens in every session. It shows up in the next session you start.

You need Node.js 18.19 or later on the PATH and Claude Code signed in at least once (`claude auth login`).

On Windows with the Microsoft Store build of Claude Desktop, create a `.claudedeck` folder in your user profile once:

```bat
mkdir %USERPROFILE%\.claudedeck
```

The Store build redirects anything started inside Claude Desktop away from `%APPDATA%`, so without this folder the deck and the background tasks would keep their data in two different places.

## The deck

A slim strip sits above the message box in every session: the account Claude Code is on, its session and weekly use, the account that goes next, and an **Open** button. **Open** brings up the deck as a sidebar beside the chat. It has three tabs.

**Accounts** has one card per saved account with its live session and weekly usage, when each one resets, and which account Claude Code and Claude Desktop are on.

| Button | What it does |
|---|---|
| **Use now** | Moves Claude Code to this account. Nothing restarts, a running session picks up the new login on its next message. |
| **Use next** | Makes this account the next one auto switch moves to. **Clear next** goes back to the ranking. |
| **Hold** | Keeps the account out of auto switch. **Release** brings it back. |
| **Open in Desktop** | Opens this account in its own Claude Desktop window, next to the one you are in. Nothing closes. **Show Desktop window** brings it forward once it is open. |
| **Continue in terminal** | Inside Claude Desktop: moves the terminal Claude Code to this account and continues a copy of this session there, in a new terminal window. |
| **Sign in again** | Walks an expired login through a fresh sign in. |
| **Forget** | Deletes the saved account. It asks first. |
| **Save signed-in account** | Saves the Claude Code login you are on now. |
| **Save Desktop login** | Saves the login Claude Desktop is on now, so **Open in Desktop** can give it its own window. |
| **Add Desktop account** | Saves the login Claude Desktop is on now and opens Claude Desktop on a clean sign in screen, without signing anything out. |
| **Turn on auto switch** | Starts auto switch now and at every sign in (Windows). |

**Background runs** sends a short prompt on a schedule so a 5 hour session is already running when you sit down. Turn it on or off, run it once, and edit the prompt and the times.

**Run log** shows the last background runs.

The same things work from the prompt:

```
/deck                 open or close the sidebar
/deck use <name>      move Claude Code to that account now
/deck desktop <name>  open that account in its own Claude Desktop window
/deck continue <name> continue this session on that account in a terminal
/deck next <name>     use that account next, /deck next clear to undo
/deck hold <name>     keep an account out of auto switch, /deck release <name>
/deck auto on         start auto switch now and at every sign in
/deck refresh         fetch live usage for every account
/deck import          bring in every account saved by claude-swap
```

## Adding accounts

1. Sign in to Claude Code with the first account (`claude auth login`) and press **Save signed-in account**.
2. If you also use Claude Desktop with it, press **Save Desktop login** while Claude Desktop is signed in to that account.
3. For the next Claude Code account, sign in with `claude auth login` and press **Save signed-in account** again.
4. For the next Claude Desktop account, press **Add Desktop account**. Claude Desktop reopens on a sign in screen. Sign in with the other account, open the deck and press **Save Desktop login**.

Do not use **Log out** in Claude Desktop to change accounts. Logging out ends that login on Anthropic's side too, so the copy ClaudeDeck saved stops working and switching back lands on a sign in screen.

Already using claude-swap? `/deck import` copies each account's Claude Code login into ClaudeDeck. Stop `cswap auto` first, or it keeps rotating the tokens you just copied.

## Claude Desktop, one window per account

Claude Desktop holds its login in memory, so no tool can swap the account under a running window, and closing it stops every reply that is running. ClaudeDeck never does that. Each account gets a Claude Desktop window of its own instead:

1. **Open in Desktop** copies the saved Desktop login of that account once into its own profile folder, `desktop-profiles/<account>` in the ClaudeDeck folder, and starts Claude Desktop on it with `--user-data-dir`. From then on the login lives only there, so two windows never spend the same login.
2. The window you were in keeps running, with its sessions. Every account can have its window open at the same time.
3. Pressing it again, or **Show Desktop window**, brings that window forward. Your first Claude Desktop stays the window of the account it was signed in with.

When the account of the window you are in runs out, the strip above the prompt says **Out of usage** and offers **Open <next account>**, picked the same way auto switch picks.

A session in Claude Desktop belongs to the window it runs in. **Continue in terminal** carries it to another account anyway: it moves the terminal Claude Code to that account and runs `claude --resume <session> --fork-session` in a new terminal window, in the session's folder. That is a copy of the conversation, so the Desktop session stays as it was.

Adding a new account still goes through the window you are in: **Add Desktop account** opens it on a sign in screen, and **Save Desktop login** keeps the login. Both close and reopen that one window, once. After that, **Open in Desktop** gives the account its own window.

## How auto switch picks the account

Auto switch moves Claude Code only, so Claude Desktop never restarts. For Claude Desktop it only works out which window to offer once the current one runs out. It checks every 20 seconds and writes every move to `auto.log`.

The weekly quota is the part that is lost when it is not used, so the ranking spends first the account whose week resets soonest:

1. **Soonest weekly reset first.** An account whose week resets in 6 hours goes before one that resets in 3 days. An account whose week has not started yet goes last, because its quota is not running out.
2. **Ties within the same hour** go to the account with a 5 hour session already running, then to the one with the most of its week left.
3. **Your pick wins.** An account set with **Use next** goes first. A held account is never picked.
4. **Only accounts with room take over.** Both its session and its week must be under 85 percent.

Claude Code moves when:

- the account it is on reaches 95 percent, to the top account with room. If no account has room it stays, and only leaves an account that has hit its limit, for the one with the most room left.
- another account with room has its week resetting within 48 hours and at least 12 hours before the current account's week. It moves early so that quota is spent before it is lost, but never within a minute of the last move.

## Background runs

The **Background runs** tab is the easy way to change the prompt and the times. They are kept in `claudedeck.config.json` in the ClaudeDeck folder:

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
      "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      "times": ["00:00", "05:00", "10:00", "15:00", "20:00"]
    }
  ]
}
```

Use English day names and 24 hour `HH:mm` times. Add another block when different days need different times. The runner always uses Haiku. Windows uses Task Scheduler, macOS uses a LaunchAgent at `~/Library/LaunchAgents/com.claudedeck.plist`, and the computer has to be on and signed in for a run.

### Warm every account

**Warm every account** in the Background runs tab makes each scheduled run also start the 5 hour session of every other saved account, so each one is ready when auto switch moves to it. It skips the account Claude Code is on, accounts whose session is already running, held accounts, and accounts that need a new sign in or used up their week.

Each warm runs `claude -p <prompt> --model haiku` in a temporary folder that holds only that account's saved login, so your own Claude Code login is never touched. A rotated token is saved back to the account, and the folder is deleted afterwards. Each account gets one line in the run log:

```text
[2026-10-16T15:00:04.120Z] warm work: warmed, started the 5h window
[2026-10-16T15:00:04.121Z] warm side: skipped, 5h window already running until 2026-10-16T17:12:00Z
[2026-10-16T15:00:04.121Z] warm done: 1 warmed, 0 failed, 3 skipped
```

Claude Code on macOS keeps its login in the Keychain, so warming other accounts works on Windows.

## Where ClaudeDeck keeps its data

```text
%USERPROFILE%\.claudedeck                          when that folder exists
%APPDATA%\ClaudeDeck                               Windows otherwise
~/Library/Application Support/ClaudeDeck           macOS
```

`CLAUDEDECK_HOME` points it anywhere else. Inside are the saved accounts (`profiles.json` and one folder per account under `sessions`), the Claude Desktop window of each account under `desktop-profiles`, the live usage cache, the auto switch state and log, the schedule config and the run log.

## What is swapped and what is not

- Claude **Code**: only the login, the `claudeAiOauth` block in `~/.claude/.credentials.json` and the `oauthAccount` block in `~/.claude.json`. Projects, history, todos and settings stay. The credentials file is backed up to `.credentials.json.claudedeck.bak` before it is replaced.
- Claude **Desktop**: its Chromium session stores (`Local State`, `Preferences`, `Network`, `Local Storage`, `Session Storage`, `WebStorage`, `IndexedDB`) and the `oauth:` keys and `lastKnownAccountUuid` in `config.json`. Window layout and other preferences stay.
- The Claude Code Insiders build keeps its own login in `~/.claude-insiders`, and ClaudeDeck saves and switches it on its own.

Nothing is decrypted and no password is typed. Live usage is read from Anthropic with each account's own saved login, and nothing is sent anywhere else.

## Develop

The repository root is the mod. `engine/` is the Node program the mod runs for everything that touches files, processes and the network.

```text
.claude-plugin           plugin.json and the marketplace file
hooks                    the mod: register.tsx draws the deck, view.ts holds the SVG and text helpers
types                    the mod's state contract
scripts/relogin.ps1      the sign in again window
engine/src/accounts      identity, saved accounts, switching, the Desktop job, live usage, auto switch
engine/src/scheduler     Windows Task Scheduler and macOS launchd
engine/src/service       the background run schedule
engine/src/cli           the api the mod calls, the auto switch loop and the Desktop job entry
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

`engine/dist` is committed, because an installed mod has no build step, so run `npm run build` and commit the result with every engine change. Engine tests are named `*.spec.ts` because `claude plugin test` runs every `*.test.ts` in the repository. Every engine folder keeps its types in an `interfaces` directory, one `I{Name}.ts` file per interface.
