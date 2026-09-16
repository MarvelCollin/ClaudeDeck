const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export { DAYS };

export function renderClientScript(token: string): string {
  return `var TOKEN = ${JSON.stringify(token)};
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

function initialsOf(text) {
  var parts = String(text).trim().split(/\\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarFor(name, active) {
  return el('div', 'avatar' + (active ? '' : ' idle'), initialsOf(name));
}

function renderCurrent(accounts) {
  var host = document.getElementById('current');
  host.replaceChildren();
  var box = el('div', 'current-row');
  if (accounts.current) {
    box.appendChild(avatarFor(accounts.current.name, true));
    var who = el('div', 'who');
    var name = el('div', 'name');
    name.appendChild(document.createTextNode(accounts.current.name));
    name.appendChild(el('span', 'tagline', 'signed in now'));
    who.append(name, el('div', 'sub', accounts.current.email));
    box.appendChild(who);

    var active = accounts.sessions.filter(function (s) { return s.active; })[0];
    var captured = active && active.desktopCaptured;
    var save = el('button', 'primary', captured ? 'Re-save desktop session' : 'Save this account');
    if (captured) save.className = 'button quiet';
    save.onclick = function () {
      if (!confirm('Save ' + accounts.current.name + '?\\n\\nClaude Desktop will briefly close and reopen so its session can be copied.')) return;
      busy(save, true, 'Saving');
      api('/api/accounts/sync', {}).then(function (r) {
        flash('Saved ' + r.name + '. You can switch back to it any time.');
        return refresh();
      }).catch(function (err) { busy(save, false); flash(err.message, true); });
    };
    box.appendChild(save);
    if (active) box.appendChild(el('span', 'sub muted', 'Code login auto-syncs'));
  } else {
    box.appendChild(avatarFor('?', false));
    var note = el('div', 'who');
    if (accounts.unknownAccount) {
      note.append(
        el('div', 'name', 'Signed in, account not recognised yet'),
        el('div', 'sub muted', 'Claude Desktop is on account ' + accounts.accountUuid + '. Open Claude Code once on this account so its email can be read, then reload.')
      );
    } else {
      note.append(el('div', 'name', 'No account detected'), el('div', 'sub muted', 'Sign in to Claude Desktop, then reload this page.'));
    }
    box.appendChild(note);
  }
  host.appendChild(box);
}

function switchRow(s) {
  var row = el('div', 'row');
  row.appendChild(avatarFor(s.name, s.active));
  var who = el('div', 'who');
  var name = el('div', 'name');
  name.appendChild(document.createTextNode(s.name));
  if (s.active) name.appendChild(el('span', 'tagline live', 'active'));
  who.append(name, el('div', 'sub', s.email));
  row.appendChild(who);

  if (!s.desktopCaptured && !s.active) who.appendChild(el('div', 'sub muted', 'Desktop session not saved yet. Press Save this account while signed in as ' + s.name + '.'));

  var swap = el('button', 'primary', 'Switch');
  swap.disabled = s.active || !s.desktopCaptured;
  swap.title = s.active ? 'This account is already active' : (!s.desktopCaptured ? 'Save this account\\'s desktop session first' : '');
  swap.onclick = function () {
    if (!confirm('Switch to ' + s.name + '?\\n\\nClaude Desktop will close and reopen on this account. Claude Code switches too.')) return;
    busy(swap, true, 'Switching');
    api('/api/accounts/switch', { alias: s.alias }).then(function () {
      flash('Switched to ' + s.name + '. Claude Desktop is reopening.');
      return refresh();
    }).catch(function (err) { busy(swap, false); flash(err.message, true); });
  };

  var forget = el('button', 'quiet icon danger', 'Forget');
  forget.onclick = function () {
    if (!confirm('Forget the saved session for ' + s.name + '? You would sign in again next time.')) return;
    api('/api/accounts/forget', { alias: s.alias }).then(function () {
      flash('Forgot ' + s.name);
      return refresh();
    }).catch(function (err) { flash(err.message, true); });
  };

  row.append(swap, forget);
  return row;
}

function renderSessions(accounts) {
  var host = document.getElementById('sessions');
  host.replaceChildren.apply(host, accounts.sessions.map(switchRow));
  if (!accounts.sessions.length) {
    host.appendChild(el('div', 'empty', 'No saved accounts yet. Save the current one, then follow the steps below to add another.'));
  }
}

function renderSharing(accounts) {
  var box = document.getElementById('share');
  box.checked = accounts.shareSession;
  var hint = document.getElementById('share-hint');
  if (accounts.shareSession) {
    hint.textContent = 'Kept common for every account: ' + accounts.sharedItems.join(', ') +
      ' in Claude Desktop, and ' + accounts.sharedCodeItems.join(', ') + ' in Claude Code. Only the login itself is swapped.';
  } else {
    hint.textContent = 'Each account keeps its own Claude Desktop history and app state. Claude Code files stay common either way.';
  }
}

function refresh() {
  return api('/api/state').then(function (data) {
    state = data;
    if (!draft) resetDraft();
    renderStrip(data.schedule);
    renderCurrent(data.accounts);
    renderSessions(data.accounts);
    renderSharing(data.accounts);
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
document.getElementById('share').onchange = function () {
  var box = document.getElementById('share');
  var wanted = box.checked;
  box.disabled = true;
  api('/api/accounts/sharing', { enabled: wanted }).then(function () {
    flash(wanted ? 'Every account now shares the same history and app state.' : 'Each account keeps its own history again.');
    return refresh();
  }).catch(function (err) {
    box.checked = !wanted;
    flash(err.message, true);
  }).then(function () { box.disabled = false; });
};

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
setInterval(function () { api('/api/ping', {}).catch(function () {}); }, 3000);
setInterval(function () { if (!draft || !document.getElementById('dirty').textContent) refresh(); }, 6000);
addEventListener('pagehide', function () {
  navigator.sendBeacon('/api/close?token=' + encodeURIComponent(TOKEN));
});
refresh().then(loadLog);`;
}
