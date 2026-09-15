const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function renderPage(token) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ClaudeDeck</title>
<style>
:root{
  --bg:#f6f7f9;
  --surface:#ffffff;
  --surface-2:#eef0f4;
  --line:#dfe3ea;
  --line-strong:#c3cad6;
  --text:#1c2230;
  --muted:#5d6779;
  --faint:#8c94a4;
  --accent:#0f6f86;
  --accent-ink:#ffffff;
  --accent-soft:#e2f2f6;
  --live:#1d7a4d;
  --live-soft:#e1f3e9;
  --busy:#8a5a08;
  --busy-soft:#fbf0d9;
  --danger:#a52a2a;
  --danger-soft:#fbe9e9;
  --mono:ui-monospace,SFMono-Regular,"Cascadia Mono",Consolas,monospace;
}
html[data-theme=dark]{
  --bg:#0f1318;
  --surface:#171c24;
  --surface-2:#1e242e;
  --line:#2a313c;
  --line-strong:#3d4653;
  --text:#e7eaef;
  --muted:#9aa4b4;
  --faint:#6d7787;
  --accent:#63cfe2;
  --accent-ink:#06222a;
  --accent-soft:#12303a;
  --live:#5ec08a;
  --live-soft:#12301f;
  --busy:#e0ad4b;
  --busy-soft:#2e2412;
  --danger:#e98c8c;
  --danger-soft:#2e1a1a;
}
*{box-sizing:border-box}
body{
  margin:0;background:var(--bg);color:var(--text);
  font:15px/1.55 ui-sans-serif,system-ui,"Segoe UI",sans-serif;
  -webkit-font-smoothing:antialiased;
}
.wrap{max-width:1140px;margin:0 auto;padding:26px 22px 64px}

header{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:18px}
header h1{font-size:20px;margin:0;letter-spacing:-.015em}
header .where{font:12px/1.4 var(--mono);color:var(--faint);word-break:break-all}
header .spacer{margin-left:auto}

.strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(154px,1fr));gap:10px;margin:0 0 24px;padding:0}
.cell{background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:11px 13px}
.cell dt{font-size:12px;color:var(--muted);margin:0 0 3px}
.cell dd{margin:0;font-size:15px;font-weight:600;display:flex;align-items:center;gap:7px}
.cell dd small{font-weight:400;font-size:12px;color:var(--faint)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--faint);flex:none}
.dot.live{background:var(--live)}
.dot.busy{background:var(--busy)}
.skeleton .cell{opacity:.5}
.skeleton dd{color:transparent;background:var(--surface-2);border-radius:4px;width:60%;height:18px}

.cols{display:grid;grid-template-columns:1fr;gap:20px;align-items:start}
@media(min-width:920px){.cols{grid-template-columns:minmax(0,1.12fr) minmax(0,1fr)}}

section{border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden}
section > h2{margin:0;padding:13px 16px;font-size:15px;font-weight:600;border-bottom:1px solid var(--line)}
.body{padding:16px}
.body + .body{border-top:1px solid var(--line)}
.hint{margin:0 0 12px;font-size:13px;color:var(--muted)}

.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
button{
  font:inherit;font-size:14px;padding:7px 13px;border-radius:7px;
  border:1px solid var(--line-strong);background:var(--surface);color:var(--text);
  cursor:pointer;transition:border-color .12s,background .12s;
}
button:hover:not(:disabled){border-color:var(--accent);background:var(--accent-soft)}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button:disabled{opacity:.45;cursor:not-allowed}
button[aria-busy=true]{opacity:.7;cursor:progress}
button.primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent);font-weight:600}
button.primary:hover:not(:disabled){filter:brightness(1.08)}
button.quiet{border-color:transparent;background:transparent;color:var(--muted)}
button.quiet:hover:not(:disabled){color:var(--text);background:var(--surface-2);border-color:transparent}
button.danger{color:var(--danger);border-color:var(--line-strong)}
button.danger:hover:not(:disabled){border-color:var(--danger);background:var(--danger-soft)}
button.icon{padding:6px 10px;font-size:13px}

label{display:block;font-size:13px;color:var(--muted);margin-bottom:6px}
input[type=text],textarea{
  width:100%;font:inherit;padding:8px 11px;border-radius:7px;
  border:1px solid var(--line-strong);background:var(--bg);color:var(--text);
}
input[type=text]{font:14px/1.4 var(--mono)}
textarea{min-height:66px;resize:vertical}
input:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:-1px;border-color:var(--accent)}
.check{display:flex;align-items:center;gap:9px;font-size:14px;color:var(--text);margin-bottom:9px}
.check input{accent-color:var(--accent);width:16px;height:16px}
.grid2{display:grid;gap:16px;grid-template-columns:1fr}
@media(min-width:580px){.grid2{grid-template-columns:1fr 1fr}}

.block{border:1px solid var(--line);border-radius:8px;padding:13px;margin-bottom:12px}
.block header{display:flex;align-items:center;margin:0 0 10px}
.block h3{margin:0;font-size:14px;font-weight:600}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{
  font:13px/1 var(--mono);padding:7px 10px;border-radius:6px;
  border:1px solid var(--line-strong);background:var(--surface);color:var(--muted);cursor:pointer;
}
.chip:hover{border-color:var(--accent)}
.chip[aria-pressed=true]{background:var(--accent);color:var(--accent-ink);border-color:var(--accent);font-weight:600}
.chip.time{cursor:default;display:inline-flex;align-items:center;gap:8px;color:var(--text)}
.chip.time button{padding:0 2px;border:0;background:none;color:var(--faint);font-size:15px;line-height:1}
.chip.time button:hover{color:var(--danger);background:none}
.addtime{display:flex;gap:6px;margin-top:10px}
.addtime input{width:94px}

.rows{display:flex;flex-direction:column}
.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:13px 16px;border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:0}
.row .who{flex:1;min-width:150px}
.row .name{font-weight:600;font-size:15px}
.row .path{font:12px/1.45 var(--mono);color:var(--faint);overflow-wrap:anywhere}
.state{font-size:13px;color:var(--muted);display:flex;align-items:center;gap:7px;white-space:nowrap}
.state.live{color:var(--live)}
.tagline{font-size:12px;color:var(--faint);font-weight:400;margin-left:7px}

.empty{padding:16px;color:var(--muted);font-size:14px;border-top:1px solid var(--line)}
form.add{display:flex;gap:8px;padding:14px 16px;border-top:1px solid var(--line);background:var(--surface-2)}
form.add input{flex:1}

pre.log{margin:0;padding:14px 16px;max-height:300px;overflow:auto;font:12.5px/1.6 var(--mono);color:var(--muted);white-space:pre-wrap;overflow-wrap:anywhere}

#flash{
  position:fixed;left:50%;bottom:20px;transform:translateX(-50%);
  max-width:min(560px,92vw);padding:11px 16px;border-radius:8px;
  border:1px solid var(--line-strong);background:var(--surface);color:var(--text);
  font-size:14px;box-shadow:0 6px 20px rgba(0,0,0,.18);
  opacity:0;pointer-events:none;transition:opacity .16s;
}
#flash.show{opacity:1}
#flash.bad{border-color:var(--danger);color:var(--danger);background:var(--danger-soft)}

footer{margin-top:24px;font-size:13px;color:var(--faint)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>ClaudeDeck</h1>
  <span class="spacer"></span>
  <span class="where" id="configpath"></span>
  <button id="theme" class="icon quiet" aria-label="Switch colour theme">Theme</button>
</header>

<dl class="strip skeleton" id="strip">
  <div class="cell"><dt>Background</dt><dd>loading</dd></div>
  <div class="cell"><dt>Right now</dt><dd>loading</dd></div>
  <div class="cell"><dt>Last run</dt><dd>loading</dd></div>
  <div class="cell"><dt>Next run</dt><dd>loading</dd></div>
  <div class="cell"><dt>Runs</dt><dd>loading</dd></div>
</dl>

<div class="cols">
  <section aria-labelledby="sched-h">
    <h2 id="sched-h">Schedule</h2>
    <div class="body">
      <div class="bar">
        <button id="b-start" class="primary">Start background</button>
        <button id="b-stop">Stop background</button>
        <button id="b-run">Run once now</button>
      </div>
    </div>
    <div class="body">
      <p class="hint" id="weekcount"></p>
      <div id="blocks"></div>
      <button id="b-addblock" class="quiet">Add another schedule block</button>
    </div>
    <div class="body">
      <div class="grid2">
        <div>
          <label for="prompt">Prompt sent to Claude</label>
          <textarea id="prompt"></textarea>
        </div>
        <div>
          <label id="beh">Run behaviour</label>
          <div role="group" aria-labelledby="beh">
            <label class="check"><input type="checkbox" id="wake"> Wake the machine to run</label>
            <label class="check"><input type="checkbox" id="locked"> Run while the screen is locked</label>
          </div>
        </div>
      </div>
      <div class="bar" style="margin-top:14px">
        <button id="b-save" class="primary">Save schedule</button>
        <span class="hint" style="margin:0" id="dirty"></span>
      </div>
    </div>
  </section>

  <section aria-labelledby="acct-h">
    <h2 id="acct-h">Claude Desktop accounts</h2>
    <div class="rows" id="profiles"></div>
    <form class="add" id="addform">
      <label class="sr" for="newname">Name for the new account</label>
      <input type="text" id="newname" placeholder="work@example.com" autocomplete="off" required>
      <button type="submit">Add account</button>
    </form>
  </section>
</div>

<section style="margin-top:20px" aria-labelledby="log-h">
  <h2 id="log-h">Run log <button id="b-log" class="quiet icon" style="float:right;margin-top:-2px">Refresh</button></h2>
  <pre class="log" id="log" tabindex="0" aria-live="off">Loading the log...</pre>
</section>

<footer id="footnote"></footer>
</div>

<div id="flash" role="status" aria-live="polite"></div>

<script>
var TOKEN = ${JSON.stringify(token)};
var DAYS = ${JSON.stringify(DAYS)};
var state = null;
var draft = null;
var flashTimer = null;

function applyTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  try { localStorage.setItem('claudedeck-theme', mode); } catch (e) {}
  document.getElementById('theme').textContent = mode === 'dark' ? 'Light theme' : 'Dark theme';
}
(function () {
  var saved = null;
  try { saved = localStorage.getItem('claudedeck-theme'); } catch (e) {}
  var system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved || system);
})();
document.getElementById('theme').onclick = function () {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
};

function api(path, body) {
  return fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-claudedeck-token': TOKEN, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (!res.ok) throw new Error(data.error || res.statusText);
      return data;
    });
  });
}

function flash(text, bad) {
  var box = document.getElementById('flash');
  box.textContent = text;
  box.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(function () { box.className = ''; }, 4000);
}

function el(tag, cls, text) {
  var node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function busy(button, on, label) {
  button.setAttribute('aria-busy', on ? 'true' : 'false');
  button.disabled = on;
  if (on) { button.dataset.idle = button.textContent; button.textContent = label || 'Working...'; }
  else if (button.dataset.idle) { button.textContent = button.dataset.idle; }
}

function cell(term, valueNode, extra) {
  var box = el('div', 'cell');
  var dd = el('dd');
  dd.appendChild(valueNode);
  if (extra) dd.appendChild(el('small', null, extra));
  box.append(el('dt', null, term), dd);
  return box;
}

function withDot(text, kind) {
  var frag = document.createDocumentFragment();
  frag.appendChild(el('span', 'dot' + (kind ? ' ' + kind : '')));
  frag.appendChild(document.createTextNode(text));
  return frag;
}

function renderStrip(s) {
  var counts = s.counts || {};
  var strip = document.getElementById('strip');
  strip.classList.remove('skeleton');
  strip.replaceChildren(
    cell('Background', withDot(s.enabled ? 'On' : 'Off', s.enabled ? 'live' : null)),
    cell('Right now', withDot(s.running ? 'Running' : 'Idle', s.running ? 'busy' : null)),
    cell('Last run', document.createTextNode(s.lastRun || 'Never')),
    cell('Next run', document.createTextNode(s.nextRun || 'Not scheduled')),
    cell('Runs', document.createTextNode(String(counts.runs || 0)), (counts.failed || 0) + ' failed')
  );
  document.getElementById('configpath').textContent = s.configPath;
  document.getElementById('weekcount').textContent = s.entryCount + ' runs scheduled per week.';
  document.getElementById('footnote').textContent = 'This page is served from your machine and the server stops when you close the tab. Log file: ' + s.logPath;
  document.getElementById('b-stop').disabled = !s.installed;
}

function renderBlocks() {
  var host = document.getElementById('blocks');
  host.replaceChildren();
  draft.schedules.forEach(function (block, index) {
    var box = el('div', 'block');
    var head = el('header');
    head.appendChild(el('h3', null, 'Block ' + (index + 1)));
    if (draft.schedules.length > 1) {
      var del = el('button', 'quiet icon', 'Remove block');
      del.type = 'button';
      del.style.marginLeft = 'auto';
      del.onclick = function () { draft.schedules.splice(index, 1); renderBlocks(); markDirty(); };
      head.appendChild(del);
    }
    box.appendChild(head);

    var days = el('div', 'chips');
    DAYS.forEach(function (day) {
      var on = block.days.indexOf(day) !== -1;
      var chip = el('button', 'chip', day.slice(0, 3));
      chip.type = 'button';
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      chip.setAttribute('aria-label', day);
      chip.onclick = function () {
        if (on) block.days = block.days.filter(function (d) { return d !== day; });
        else block.days = DAYS.filter(function (d) { return block.days.indexOf(d) !== -1 || d === day; });
        renderBlocks();
        markDirty();
      };
      days.appendChild(chip);
    });
    box.appendChild(days);

    var times = el('div', 'chips');
    times.style.marginTop = '10px';
    block.times.forEach(function (time, ti) {
      var chip = el('span', 'chip time');
      chip.appendChild(document.createTextNode(time));
      var x = el('button', null, '\\u00d7');
      x.type = 'button';
      x.setAttribute('aria-label', 'Remove ' + time);
      x.onclick = function () { block.times.splice(ti, 1); renderBlocks(); markDirty(); };
      chip.appendChild(x);
      times.appendChild(chip);
    });
    if (!block.times.length) times.appendChild(el('span', 'hint', 'No times yet.'));
    box.appendChild(times);

    var adder = el('div', 'addtime');
    var input = el('input');
    input.type = 'text';
    input.placeholder = '09:30';
    input.setAttribute('aria-label', 'New time for block ' + (index + 1));
    var addBtn = el('button', null, 'Add time');
    addBtn.type = 'button';
    addBtn.onclick = function () {
      var value = input.value.trim();
      if (!/^([01]\\d|2[0-3]):([0-5]\\d)$/.test(value)) { flash('Times use 24-hour HH:mm, for example 09:30.', true); input.focus(); return; }
      if (block.times.indexOf(value) === -1) block.times.push(value);
      block.times.sort();
      renderBlocks();
      markDirty();
    };
    input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); } };
    adder.append(input, addBtn);
    box.appendChild(adder);
    host.appendChild(box);
  });
}

function markDirty() {
  document.getElementById('dirty').textContent = 'Unsaved changes.';
}

function renameRow(row, p) {
  var form = el('form');
  form.style.cssText = 'display:flex;gap:8px;flex:1;min-width:200px';
  var input = el('input');
  input.type = 'text';
  input.value = p.label || p.alias;
  input.setAttribute('aria-label', 'New name for ' + (p.label || p.alias));
  var save = el('button', 'primary', 'Save');
  var cancel = el('button', 'quiet', 'Cancel');
  cancel.type = 'button';
  cancel.onclick = refresh;
  form.append(input, save, cancel);
  form.onsubmit = function (event) {
    event.preventDefault();
    busy(save, true, 'Saving');
    api('/api/profiles/label', { alias: p.alias, label: input.value }).then(function () {
      flash('Renamed to ' + input.value.trim());
      return refresh();
    }).catch(function (err) { busy(save, false); flash(err.message, true); });
  };
  row.replaceChildren(form);
  input.focus();
  input.select();
}

function confirmRow(row, p) {
  var note = el('div', 'who');
  note.appendChild(el('div', 'name', 'Delete ' + (p.label || p.alias) + '?'));
  note.appendChild(el('div', 'path', 'Its saved login and local data are erased. This cannot be undone.'));
  var yes = el('button', 'danger', 'Delete it');
  var no = el('button', 'quiet', 'Keep it');
  no.onclick = refresh;
  yes.onclick = function () {
    busy(yes, true, 'Deleting');
    api('/api/profiles/remove', { alias: p.alias }).then(function () {
      flash('Deleted ' + (p.label || p.alias));
      return refresh();
    }).catch(function (err) { busy(yes, false); flash(err.message, true); });
  };
  row.replaceChildren(note, yes, no);
  yes.focus();
}

function profileRow(p) {
  var row = el('div', 'row');
  var who = el('div', 'who');
  var name = el('div', 'name');
  name.appendChild(document.createTextNode(p.label || p.alias));
  if (p.isDefault) name.appendChild(el('span', 'tagline', 'the account you are signed into now'));
  who.append(name, el('div', 'path', p.dir));

  var stateText = el('span', 'state' + (p.running ? ' live' : ''));
  stateText.appendChild(el('span', 'dot' + (p.running ? ' live' : '')));
  stateText.appendChild(document.createTextNode(p.running ? 'Open, ' + p.pids.length + ' processes' : 'Not running'));

  var launch = el('button', 'primary', 'Launch');
  launch.onclick = function () {
    busy(launch, true, 'Launching');
    api('/api/profiles/launch', { alias: p.alias }).then(function () {
      flash('Launched ' + (p.label || p.alias) + '. A new Claude Desktop window is opening.');
      return refresh();
    }).catch(function (err) { busy(launch, false); flash(err.message, true); });
  };

  var stop = el('button', null, 'Stop');
  stop.disabled = !p.running;
  stop.onclick = function () {
    busy(stop, true, 'Stopping');
    api('/api/profiles/stop', { alias: p.alias }).then(function () {
      flash('Stopped ' + (p.label || p.alias));
      return refresh();
    }).catch(function (err) { busy(stop, false); flash(err.message, true); });
  };

  row.append(who, stateText, launch, stop);

  if (!p.isDefault) {
    var rename = el('button', 'quiet icon', 'Rename');
    rename.onclick = function () { renameRow(row, p); };
    var del = el('button', 'quiet icon danger', 'Delete');
    del.disabled = p.running;
    del.title = p.running ? 'Stop this account before deleting it' : '';
    del.onclick = function () { confirmRow(row, p); };
    row.append(rename, del);
  }
  return row;
}

function renderProfiles(profiles) {
  var host = document.getElementById('profiles');
  host.replaceChildren.apply(host, profiles.map(profileRow));
  if (profiles.length === 1) {
    host.appendChild(el('div', 'empty', 'Only the account you are already signed into. Add a name below, press Launch, then sign in with your other account in the window that opens.'));
  }
}

function refresh() {
  return api('/api/state').then(function (data) {
    state = data;
    if (!draft) resetDraft();
    renderStrip(data.schedule);
    renderProfiles(data.profiles);
  }).catch(function (err) { flash(err.message, true); });
}

function resetDraft() {
  draft = JSON.parse(JSON.stringify({
    prompt: state.schedule.prompt,
    wakeToRun: state.schedule.wakeToRun,
    runWhenLocked: state.schedule.runWhenLocked,
    schedules: state.schedule.schedules
  }));
  document.getElementById('prompt').value = draft.prompt;
  document.getElementById('wake').checked = draft.wakeToRun;
  document.getElementById('locked').checked = draft.runWhenLocked;
  document.getElementById('dirty').textContent = '';
  renderBlocks();
}

function loadLog() {
  return api('/api/schedule/log').then(function (data) {
    var pre = document.getElementById('log');
    pre.textContent = data.lines.length ? data.lines.join('\\n') : 'Nothing logged yet. The log fills in after the first run.';
    pre.scrollTop = pre.scrollHeight;
  }).catch(function (err) { flash(err.message, true); });
}

function wire(id, path, label, done) {
  var button = document.getElementById(id);
  button.onclick = function () {
    busy(button, true, label);
    api(path, {}).then(function () {
      busy(button, false);
      flash(done);
      return refresh();
    }).catch(function (err) { busy(button, false); flash(err.message, true); });
  };
}
wire('b-start', '/api/schedule/start', 'Starting', 'Background task started.');
wire('b-stop', '/api/schedule/stop', 'Stopping', 'Background task stopped.');
wire('b-run', '/api/schedule/run', 'Running', 'Triggered one run. The log updates when it finishes.');

document.getElementById('b-log').onclick = loadLog;
document.getElementById('prompt').oninput = markDirty;
document.getElementById('wake').onchange = markDirty;
document.getElementById('locked').onchange = markDirty;
document.getElementById('b-addblock').onclick = function () {
  draft.schedules.push({ days: ['Monday'], times: ['09:00'] });
  renderBlocks();
  markDirty();
};
document.getElementById('b-save').onclick = function () {
  var button = document.getElementById('b-save');
  draft.prompt = document.getElementById('prompt').value;
  draft.wakeToRun = document.getElementById('wake').checked;
  draft.runWhenLocked = document.getElementById('locked').checked;
  busy(button, true, 'Saving');
  api('/api/schedule/save', draft).then(function () {
    busy(button, false);
    flash('Schedule saved.');
    draft = null;
    return refresh();
  }).catch(function (err) { busy(button, false); flash(err.message, true); });
};
document.getElementById('addform').onsubmit = function (event) {
  event.preventDefault();
  var input = document.getElementById('newname');
  var name = input.value.trim();
  if (!name) return;
  api('/api/profiles/add', { name: name }).then(function (created) {
    input.value = '';
    flash('Added ' + created.label + '. Press Launch next, then sign in with that account.');
    return refresh();
  }).catch(function (err) { flash(err.message, true); });
};

setInterval(function () { api('/api/ping', {}).catch(function () {}); }, 3000);
setInterval(function () { if (!draft || !document.getElementById('dirty').textContent) refresh(); }, 6000);
addEventListener('pagehide', function () {
  navigator.sendBeacon('/api/close?token=' + encodeURIComponent(TOKEN));
});
refresh().then(loadLog);
</script>
</body>
</html>`;
}

module.exports = {
  DAYS,
  renderPage,
};
