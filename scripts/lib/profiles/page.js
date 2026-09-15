function renderPage(token) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ClaudeCron Profiles</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0b1120;color:#e2e8f0;font:14px/1.5 ui-sans-serif,system-ui,Segoe UI,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 20px 64px}
h1{font-size:18px;margin:0 0 4px;color:#67e8f9;letter-spacing:.3px}
p.sub{margin:0 0 24px;color:#64748b;font-size:12px}
.row{display:flex;align-items:center;gap:12px;padding:14px 16px;border:1px solid #1e293b;border-radius:10px;margin-bottom:10px;background:#0f172a}
.row.on{border-color:#155e75}
.meta{flex:1;min-width:0}
.alias{font-weight:600;color:#f1f5f9}
.dir{color:#475569;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:rtl;text-align:left}
.tag{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid #334155;color:#94a3b8;white-space:nowrap}
.tag.run{border-color:#0e7490;color:#22d3ee}
button{font:inherit;padding:6px 12px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;cursor:pointer}
button:hover{border-color:#0891b2}
button:disabled{opacity:.4;cursor:default}
button.danger:hover{border-color:#b91c1c;color:#fca5a5}
form{display:flex;gap:8px;margin-top:20px}
input{flex:1;font:inherit;padding:8px 12px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#e2e8f0}
input:focus{outline:none;border-color:#0891b2}
#msg{min-height:20px;margin-top:16px;font-size:12px;color:#94a3b8}
#msg.err{color:#fca5a5}
footer{margin-top:28px;color:#475569;font-size:11px}
</style>
</head>
<body>
<main>
<h1>Claude Desktop Profiles</h1>
<p class="sub">Each profile is a separate login. They run side by side. Close this tab to shut the server down.</p>
<div id="list"></div>
<form id="add">
<input id="alias" placeholder="new profile name" autocomplete="off" pattern="[a-zA-Z0-9][a-zA-Z0-9._\\-]{0,31}" required>
<button type="submit">Add</button>
</form>
<div id="msg"></div>
<footer>ClaudeCron &middot; server stops when this tab closes</footer>
</main>
<script>
const TOKEN = ${JSON.stringify(token)};
const list = document.getElementById('list');
const msg = document.getElementById('msg');

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-claudecron-token': TOKEN, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function say(text, isError) {
  msg.textContent = text;
  msg.className = isError ? 'err' : '';
}

function row(p) {
  const el = document.createElement('div');
  el.className = 'row' + (p.running ? ' on' : '');
  const meta = document.createElement('div');
  meta.className = 'meta';
  const alias = document.createElement('div');
  alias.className = 'alias';
  alias.textContent = p.alias + (p.isDefault ? ' (current login)' : '');
  const dir = document.createElement('div');
  dir.className = 'dir';
  dir.textContent = p.dir;
  meta.append(alias, dir);

  const tag = document.createElement('span');
  tag.className = 'tag' + (p.running ? ' run' : '');
  tag.textContent = p.running ? p.pids.length + ' procs' : 'idle';

  const launch = document.createElement('button');
  launch.textContent = 'Launch';
  launch.onclick = () => act('/api/launch', p.alias, 'launched ' + p.alias);

  const stop = document.createElement('button');
  stop.textContent = 'Stop';
  stop.disabled = !p.running;
  stop.onclick = () => act('/api/stop', p.alias, 'stopped ' + p.alias);

  el.append(meta, tag, launch, stop);

  if (!p.isDefault) {
    const del = document.createElement('button');
    del.className = 'danger';
    del.textContent = 'Delete';
    del.disabled = p.running;
    del.onclick = () => {
      if (!confirm('Delete profile "' + p.alias + '"? Its login and local data are erased.')) return;
      act('/api/remove', p.alias, 'deleted ' + p.alias);
    };
    el.append(del);
  }
  return el;
}

async function act(path, alias, done) {
  try {
    say('working...');
    await api(path, { alias });
    say(done);
    await refresh();
  } catch (err) {
    say(err.message, true);
  }
}

async function refresh() {
  try {
    const data = await api('/api/state');
    list.replaceChildren(...data.profiles.map(row));
  } catch (err) {
    say(err.message, true);
  }
}

document.getElementById('add').onsubmit = async event => {
  event.preventDefault();
  const input = document.getElementById('alias');
  const alias = input.value.trim();
  if (!alias) return;
  try {
    await api('/api/add', { alias });
    input.value = '';
    say('added ' + alias + '. Launch it, then sign in with the other account.');
    await refresh();
  } catch (err) {
    say(err.message, true);
  }
};

setInterval(() => { api('/api/ping', {}).catch(() => {}); }, 3000);
setInterval(refresh, 5000);
addEventListener('pagehide', () => navigator.sendBeacon('/api/close?token=' + encodeURIComponent(TOKEN)));
refresh();
</script>
</body>
</html>`;
}

module.exports = {
  renderPage,
};
