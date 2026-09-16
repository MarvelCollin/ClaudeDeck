var TOKEN = '__CLAUDEDECK_TOKEN__';
var DAYS = __CLAUDEDECK_DAYS__;
var REQUEST_TIMEOUT = 12000;
var state = null;
var draft = null;
var flashTimer = null;
var failures = 0;
var stateLoaded = false;

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

function describeError(err) {
  if (!err) return 'Something went wrong. Try again.';
  if (err.name === 'AbortError') return 'The panel server did not answer within ' + (REQUEST_TIMEOUT / 1000) + ' seconds.';
  if (err.name === 'TypeError') return 'Cannot reach the panel server. It may have stopped, or the tab was left open too long.';
  return err.message || 'Something went wrong. Try again.';
}

function api(path, body) {
  var control = new AbortController();
  var timer = setTimeout(function () { control.abort(); }, REQUEST_TIMEOUT);
  return fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-claudedeck-token': TOKEN, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: control.signal
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (res.status === 401 || res.status === 403) throw new Error('This tab lost its access token. Reload the page to get a new one.');
      if (!res.ok) throw new Error(data.error || ('The server answered ' + res.status + ' ' + res.statusText + '.'));
      return data;
    });
  }).then(function (data) {
    clearTimeout(timer);
    return data;
  }, function (err) {
    clearTimeout(timer);
    throw new Error(describeError(err));
  });
}

function flash(text, bad) {
  var box = document.getElementById('flash');
  box.setAttribute('role', bad ? 'alert' : 'status');
  box.setAttribute('aria-live', bad ? 'assertive' : 'polite');
  box.textContent = text;
  box.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(function () { box.className = ''; }, bad ? 7000 : 4000);
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

function settled(id) {
  var host = document.getElementById(id);
  if (host) host.setAttribute('aria-busy', 'false');
}

function showNotice(id, message, retryLabel, retry) {
  var host = document.getElementById(id);
  host.replaceChildren(el('span', 'msg', message));
  if (retry) {
    var again = el('button', 'icon', retryLabel);
    again.type = 'button';
    again.onclick = function () {
      busy(again, true, 'Retrying');
      retry();
    };
    host.appendChild(again);
  }
  host.hidden = false;
}

function hideNotice(id) {
  var host = document.getElementById(id);
  if (host.hidden) return;
  host.hidden = true;
  host.replaceChildren();
}

function setConnection(message) {
  var host = document.getElementById('conn');
  if (!message) {
    if (!host.hidden) { host.hidden = true; host.replaceChildren(); }
    return;
  }
  host.replaceChildren(el('span', 'msg', message));
  var again = el('button', 'icon', 'Reconnect');
  again.type = 'button';
  again.onclick = function () {
    busy(again, true, 'Reconnecting');
    refresh().then(function () { busy(again, false); });
  };
  host.appendChild(again);
  host.hidden = false;
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
  strip.setAttribute('aria-busy', 'false');
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
      var del = el('button', 'quiet icon push', 'Remove block');
      del.type = 'button';
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

    var times = el('div', 'chips times');
    block.times.forEach(function (time, ti) {
      var chip = el('span', 'chip time');
      chip.appendChild(document.createTextNode(time));
      var x = el('button', null, '\u00d7');
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
      if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) {
        input.setAttribute('aria-invalid', 'true');
        flash('Times use 24-hour HH:mm, for example 09:30.', true);
        input.focus();
        return;
      }
      input.removeAttribute('aria-invalid');
      if (block.times.indexOf(value) === -1) block.times.push(value);
      block.times.sort();
      renderBlocks();
      markDirty();
    };
    input.oninput = function () { input.removeAttribute('aria-invalid'); };
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
  var parts = String(text).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarFor(name, active) {
  return el('div', 'avatar' + (active ? '' : ' idle'), initialsOf(name));
}

function installRow(install) {
  var row = el('div', 'row');
  row.appendChild(avatarFor(install.name || '?', install.signedIn));

  var who = el('div', 'who');
  var name = el('div', 'name');
  name.appendChild(document.createTextNode(install.label));
  if (install.saved) name.appendChild(el('span', 'tagline live', 'saved'));
  who.appendChild(name);
  if (install.signedIn) who.appendChild(el('div', 'sub', install.name + ' · ' + install.email));
  else who.appendChild(el('div', 'sub muted', 'Not signed in on this machine.'));
  row.appendChild(who);

  var save = el('button', install.saved ? 'quiet' : 'primary', install.saved ? 'Re-save' : 'Save');
  save.disabled = !install.signedIn;
  save.title = install.signedIn ? '' : 'Sign in to ' + install.label + ' first';
  save.onclick = function () {
    if (!confirm('Save ' + install.email + ' from ' + install.label + '?\n\nClaude Desktop will briefly close and reopen so its session can be copied.')) return;
    busy(save, true, 'Saving');
    api('/api/accounts/sync', { install: install.id }).then(function (r) {
      flash('Saved ' + r.name + '. You can switch back to it any time.');
      return refresh();
    }).catch(function (err) { busy(save, false); flash(err.message, true); });
  };
  row.appendChild(save);
  return row;
}

function renderCurrent(accounts) {
  var host = document.getElementById('current');
  host.setAttribute('aria-busy', 'false');
  var installs = accounts.installs || [];

  if (installs.some(function (i) { return i.signedIn; })) {
    host.replaceChildren.apply(host, installs.map(installRow));
    return;
  }

  host.replaceChildren();
  var box = el('div', 'row');
  box.appendChild(avatarFor('?', false));
  var note = el('div', 'who');
  if (accounts.unknownAccount) {
    note.append(
      el('div', 'name', 'Signed in, account not recognised yet'),
      el('div', 'sub muted', 'Claude Desktop is on account ' + accounts.accountUuid + '. Open Claude Code once on this account so its email can be read, then reload.')
    );
  } else {
    note.append(el('div', 'name', 'No account detected'), el('div', 'sub muted', 'Sign in to Claude Desktop or Claude Code, then reload this page.'));
  }
  box.appendChild(note);
  host.appendChild(box);
}

function meter(label, window) {
  var box = el('div', 'meter');
  var head = el('div', 'meter-head');
  head.append(el('span', 'meter-label', label), el('span', 'meter-value', window.leftPercent + '% left'));
  var track = el('div', 'meter-track');
  var fill = el('div', 'meter-fill' + (window.leftPercent <= 10 ? ' low' : window.leftPercent <= 30 ? ' warn' : ''));
  fill.style.width = window.leftPercent + '%';
  track.appendChild(fill);
  box.append(head, track);
  return box;
}

function usageBar(usage, who) {
  var box = el('div', 'usage');
  if (!usage) {
    box.appendChild(el('div', 'sub muted', 'Usage unknown. It is read the next time ' + who + ' is the signed-in account.'));
    return box;
  }
  if (usage.session) box.appendChild(meter('5-hour limit', usage.session));
  if (usage.weekly) box.appendChild(meter('Weekly limit', usage.weekly));
  var when = new Date(usage.sampledAt);
  box.appendChild(el('div', 'sub muted', 'Measured ' + when.toLocaleString() + '.'));
  return box;
}

function switchRow(s, labels) {
  var row = el('div', 'row');
  row.appendChild(avatarFor(s.name, s.active));
  var who = el('div', 'who');
  var name = el('div', 'name');
  name.appendChild(document.createTextNode(s.name));
  if (s.active) name.appendChild(el('span', 'tagline live', 'active'));
  who.append(name, el('div', 'sub', s.email));
  row.appendChild(who);

  if (s.installs && s.installs.length) {
    var where = s.installs.map(function (id) { return (labels && labels[id]) || id; });
    who.appendChild(el('div', 'sub muted', 'Saved from ' + where.join(' and ') + '.'));
  }
  if (!s.desktopCaptured && !s.active) who.appendChild(el('div', 'sub muted', 'Desktop session not saved yet. Press Save while signed in as ' + s.name + '.'));
  who.appendChild(usageBar(s.usage, s.name));

  var swap = el('button', 'primary', 'Switch');
  swap.disabled = s.active || !s.desktopCaptured;
  swap.title = s.active ? 'This account is already active' : (!s.desktopCaptured ? 'Save this account\'s desktop session first' : '');
  swap.onclick = function () {
    if (!confirm('Switch to ' + s.name + '?\n\nClaude Desktop will close and reopen on this account. Claude Code switches too.')) return;
    busy(swap, true, 'Switching');
    api('/api/accounts/switch', { alias: s.alias }).then(function () {
      flash('Switched to ' + s.name + '. Claude Desktop is reopening.');
      return refresh();
    }).catch(function (err) { busy(swap, false); flash(err.message, true); });
  };

  var forget = el('button', 'quiet icon danger', 'Forget');
  forget.onclick = function () {
    if (!confirm('Forget the saved session for ' + s.name + '? You would sign in again next time.')) return;
    busy(forget, true, 'Forgetting');
    api('/api/accounts/forget', { alias: s.alias }).then(function () {
      flash('Forgot ' + s.name);
      return refresh();
    }).catch(function (err) { busy(forget, false); flash(err.message, true); });
  };

  row.append(swap, forget);
  return row;
}

function renderSessions(accounts) {
  var host = document.getElementById('sessions');
  host.setAttribute('aria-busy', 'false');
  var labels = {};
  (accounts.installs || []).forEach(function (i) { labels[i.id] = i.label; });
  host.replaceChildren.apply(host, accounts.sessions.map(function (s) { return switchRow(s, labels); }));
  if (!accounts.sessions.length) {
    host.appendChild(el('div', 'empty', 'No saved accounts yet. Save the current one, then follow the steps below to add another.'));
  }
}

function renderSharing(accounts) {
  var box = document.getElementById('share');
  box.checked = accounts.shareSession;
  var toggle = box.closest('label');
  if (toggle) toggle.style.display = accounts.sharedItems.length ? '' : 'none';
  var hint = document.getElementById('share-hint');
  var common = accounts.sharedCodeItems.join(', ') + ' in Claude Code stay common for every account.';
  if (accounts.sharedItems.length) {
    hint.textContent = 'Kept common for every account: ' + accounts.sharedItems.join(', ') +
      ' in Claude Desktop, and ' + accounts.sharedCodeItems.join(', ') + ' in Claude Code.';
    return;
  }
  hint.textContent = 'Claude Desktop keeps its whole profile per account, because its local storage holds the signed-in session. ' +
    common + ' Your chats live on claude.ai and follow the account you switch to.';
}

function refresh(silent) {
  return api('/api/state').then(function (data) {
    state = data;
    failures = 0;
    stateLoaded = true;
    setConnection(null);
    hideNotice('stateerror');
    if (!draft) resetDraft();
    renderStrip(data.schedule);
    renderCurrent(data.accounts);
    renderSessions(data.accounts);
    renderSharing(data.accounts);
  }).catch(function (err) {
    failures += 1;
    settled('strip');
    settled('current');
    settled('sessions');
    if (!stateLoaded) {
      showNotice('stateerror', err.message, 'Try again', function () { refresh(); });
    } else if (failures >= 2) {
      setConnection('Lost contact with the panel server, so these figures may be stale. ' + err.message);
    }
    if (!silent) flash(err.message, true);
  });
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
  var pre = document.getElementById('log');
  return api('/api/schedule/log').then(function (data) {
    hideNotice('logerror');
    pre.setAttribute('aria-busy', 'false');
    pre.textContent = data.lines.length ? data.lines.join('\n') : 'Nothing logged yet. The log fills in after the first run.';
    pre.scrollTop = pre.scrollHeight;
  }).catch(function (err) {
    pre.setAttribute('aria-busy', 'false');
    pre.textContent = 'The log was not read, so nothing is shown here.';
    showNotice('logerror', err.message, 'Try again', function () { loadLog(); });
  });
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

document.getElementById('b-log').onclick = function () {
  var button = document.getElementById('b-log');
  busy(button, true, 'Refreshing');
  loadLog().then(function () { busy(button, false); });
};
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
var live = null;
function holdOpen() {
  if (live || typeof EventSource === 'undefined') return;
  live = new EventSource('/api/events?token=' + encodeURIComponent(TOKEN));
  live.onerror = function () {
    if (live && live.readyState === EventSource.CLOSED) { live = null; setTimeout(holdOpen, 2000); }
  };
}
holdOpen();
setInterval(function () { if (!draft || !document.getElementById('dirty').textContent) refresh(true); }, 6000);
addEventListener('pagehide', function () {
  if (live) { live.close(); live = null; }
  navigator.sendBeacon('/api/close?token=' + encodeURIComponent(TOKEN));
});
refresh().then(loadLog);
