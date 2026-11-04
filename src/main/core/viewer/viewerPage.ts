// The public status page. Served as separate files so the Content-Security-Policy can forbid
// inline scripts, and every value from the server goes in through textContent, so a task title
// written by a player can never become markup or script.
import { viewerDictionaries } from '@shared/i18n';

export const VIEWER_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MineOffice</title>
<link rel="stylesheet" href="/viewer.css">
</head>
<body>
<header class="top">
  <img src="/assets/logo.png" alt="" width="44" height="44">
  <div class="brand"><h1 id="title">MineOffice</h1><p data-i18n="viewer.readOnly"></p></div>
  <p id="updated" class="updated" role="status"></p>
</header>
<main id="app">
  <form id="key-form" class="card key-form" hidden>
    <h2 data-i18n="viewer.enterKey"></h2>
    <p data-i18n="viewer.askOwner"></p>
    <label for="key" data-i18n="viewer.key"></label>
    <input id="key" type="password" autocomplete="off" required>
    <p id="key-error" class="error" role="alert"></p>
    <button type="submit" data-i18n="viewer.view"></button>
  </form>
  <div id="status" hidden>
    <section class="card"><h2><span data-i18n="viewer.team"></span> <span id="online" class="count"></span></h2><div id="agents" class="agents"></div></section>
    <div class="columns">
      <section class="card"><h2 data-i18n="viewer.tasks"></h2><ul id="tasks" class="list"></ul></section>
      <section class="card"><h2 data-i18n="viewer.activity"></h2><ul id="events" class="list"></ul></section>
    </div>
  </div>
</main>
<script src="/viewer.js"></script>
</body>
</html>`;

export const VIEWER_CSS = `
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:#EEF2F8 linear-gradient(#E4EAF3 1px,transparent 1px) 0 0/32px 32px;color:#0F1C33;font:400 15px/1.5 'IBM Plex Sans Thai','Noto Sans Thai',system-ui,sans-serif}
.top{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:14px clamp(16px,3vw,40px);background:#fff;border-bottom:1px solid #D8E0EC}
.brand{flex:1 1 220px}
.brand h1{margin:0;font-size:20px;line-height:1.2}
.brand p,.updated{margin:0;font-size:13px;color:#48566E}
main{max-width:1240px;margin:0 auto;padding:24px clamp(16px,3vw,40px) 48px}
#status{display:flex;flex-direction:column;gap:16px}
.card{background:#fff;border:1px solid #D8E0EC;border-radius:16px;padding:20px}
.card h2{margin:0 0 12px;font-size:18px}
.count{font-size:14px;font-weight:500;color:#48566E}
.agents{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:12px}
.agent{display:flex;gap:12px;padding:12px;border:1px solid #C6D1E1;border-radius:12px;min-width:0}
.agent.lead{background:#FFF8E8;border:2px solid #F2A516}
.slot{display:flex;align-items:center;justify-content:center;width:52px;height:52px;flex:none;background:#DFE6F1;box-shadow:inset 2px 2px 0 #AEBBCF,inset -2px -2px 0 #FBFDFF}
.slot img,.role img{image-rendering:pixelated}
.info{min-width:0;display:flex;flex-direction:column;gap:2px}
.name{font-weight:700}
.role{display:flex;align-items:center;gap:5px;font-size:13px;color:#48566E}
.state{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:500}
.detail{font-size:13px;color:#48566E;overflow-wrap:anywhere}
.lamp{display:inline-block;width:10px;height:10px;flex:none;background:#8896AB;box-shadow:0 0 0 2px #E1E7F0}
.lamp.ok{background:#1B8A4B;box-shadow:0 0 0 2px #CFEBDB}
.lamp.work{background:#F2A516;box-shadow:0 0 0 2px #FFE7B3}
.lamp.wait{background:#1557E6;box-shadow:0 0 0 2px #CFDEFB}
.lamp.bad{background:#C4312B;box-shadow:0 0 0 2px #F6D2CF}
.columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr));gap:16px;align-items:start}
.list{list-style:none;margin:0;padding:0}
.list li{display:flex;gap:10px;align-items:baseline;justify-content:space-between;padding:9px 0;border-top:1px solid #EDF1F7;overflow-wrap:anywhere}
.list li:first-child{border-top:0}
.meta{flex:none;font-size:13px;color:#48566E}
.empty{color:#48566E}
.key-form{max-width:420px;margin:48px auto;display:flex;flex-direction:column;gap:8px}
.key-form[hidden],#status[hidden]{display:none}
.key-form h2,.key-form p{margin:0}
.key-form input{min-height:44px;padding:0 12px;border:2px solid #C6D1E1;border-radius:8px;font:inherit}
.key-form button{min-height:44px;margin-top:6px;border:0;border-radius:8px;background:#1557E6;color:#fff;font:600 15px inherit;font-family:inherit;box-shadow:0 3px 0 #0C3CA6;cursor:pointer}
.error{min-height:20px;font-size:14px;color:#8A1F1A}
:focus-visible{outline:3px solid #19B8D9;outline-offset:2px}
`;

export const VIEWER_JS = `
(function () {
  var DICTIONARIES = ${JSON.stringify(viewerDictionaries())};
  var code = (navigator.language || 'en').toLowerCase().split('-')[0];
  if (!DICTIONARIES[code]) code = 'en';
  var words = DICTIONARIES[code];
  document.documentElement.lang = code;
  function tr(key, params) {
    var text = words[key] === undefined ? key : words[key];
    return text.replace(/\\{(\\w+)\\}/g, function (match, name) {
      return params && params[name] !== undefined ? params[name] : match;
    });
  }
  document.querySelectorAll('[data-i18n]').forEach(function (node) {
    node.textContent = tr(node.getAttribute('data-i18n'));
  });
  var LAMPS = { idle: 'ok', planning: 'work', working: 'work', waiting_approval: 'wait', error: 'bad', resting: 'ok' };
  var byId = function (id) { return document.getElementById(id); };
  var delay = 2000, key = '', lastOk = 0;

  try { key = sessionStorage.getItem('mo-viewer-key') || ''; } catch (e) {}
  var fromLink = location.hash.match(/key=([A-Za-z0-9_-]+)/);
  if (fromLink) {
    key = fromLink[1];
    remember(key);
    history.replaceState(null, '', location.pathname); // Keep the key out of history and screenshots
  }

  function remember(value) { try { sessionStorage.setItem('mo-viewer-key', value); } catch (e) {} }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function image(src, size) {
    var node = document.createElement('img');
    node.src = src; node.alt = ''; node.width = size; node.height = size;
    return node;
  }

  function agentCard(agent) {
    var card = el('article', 'agent' + (agent.role === 'commander' ? ' lead' : ''));
    var slot = el('div', 'slot');
    slot.appendChild(image('/assets/' + encodeURIComponent(agent.id) + '.png', 38));
    card.appendChild(slot);

    var info = el('div', 'info');
    info.appendChild(el('span', 'name', agent.name));
    var role = el('span', 'role');
    role.appendChild(image('/assets/role_' + encodeURIComponent(agent.role) + '.png', 14));
    role.appendChild(document.createTextNode(tr('role.' + agent.role + '.name')));
    info.appendChild(role);

    var label = tr('viewer.status.' + agent.status), lamp = LAMPS[agent.status] || 'ok';
    if (agent.inGame && !agent.online) { label = tr('viewer.notInGame'); lamp = ''; }
    var state = el('span', 'state');
    state.appendChild(el('span', 'lamp ' + lamp));
    state.appendChild(document.createTextNode(label));
    info.appendChild(state);

    if (agent.online) {
      var vitals = tr('viewer.vitals', { health: Math.round(agent.health), food: agent.food });
      info.appendChild(el('span', 'detail', vitals));
    }
    if (agent.position) {
      info.appendChild(el('span', 'detail', tr('viewer.coordinates', agent.position)));
    }
    if (agent.activity) info.appendChild(el('span', 'detail', agent.activity));
    card.appendChild(info);
    return card;
  }

  function fill(list, items, emptyText, render) {
    list.replaceChildren();
    if (!items.length) { list.appendChild(el('li', 'empty', emptyText)); return; }
    items.forEach(function (item) { list.appendChild(render(item)); });
  }

  function render(data) {
    byId('title').textContent = data.title;
    document.title = data.title + ' ' + tr('viewer.pageTitle');
    byId('online').textContent = tr('viewer.botsOnline', { online: data.botsOnline, total: data.botsTotal });
    var agents = byId('agents');
    agents.replaceChildren();
    data.agents.forEach(function (agent) { agents.appendChild(agentCard(agent)); });

    fill(byId('tasks'), data.tasks.slice().reverse(), tr('viewer.noTasks'), function (task) {
      var row = el('li');
      row.appendChild(el('span', '', task.title));
      row.appendChild(el('span', 'meta', (task.assignee ? task.assignee + ' · ' : '') + tr('task.' + task.status)));
      return row;
    });
    fill(byId('events'), data.events.slice().reverse(), tr('viewer.noActivity'), function (event) {
      var row = el('li');
      row.appendChild(el('span', '', (event.agent ? event.agent + ' ' : '') + tr('event.' + event.kind, { detail: event.detail })));
      row.appendChild(el('span', 'meta', new Date(event.time).toLocaleTimeString()));
      return row;
    });
  }

  function showKeyForm(message) {
    byId('status').hidden = true;
    byId('key-form').hidden = false;
    byId('key-error').textContent = message || '';
    byId('updated').textContent = '';
  }

  function tick() {
    var headers = key ? { Authorization: 'Bearer ' + key } : {};
    fetch('/api/status', { headers: headers, cache: 'no-store' }).then(function (response) {
      if (response.status === 401) {
        return response.json().then(function (body) {
          showKeyForm(body.error === 'bad-key' ? tr('viewer.badKey') : '');
          return false;
        });
      }
      if (response.status === 429) {
        delay = 30000;
        byId('updated').textContent = tr('viewer.rateLimited');
        return true;
      }
      return response.json().then(function (data) {
        delay = 2000; lastOk = Date.now();
        byId('key-form').hidden = true;
        byId('status').hidden = false;
        render(data);
        byId('updated').textContent = tr('viewer.updated', { time: new Date().toLocaleTimeString() });
        return true;
      });
    }).catch(function () {
      if (lastOk) byId('updated').textContent = tr('viewer.disconnected');
      return true;
    }).then(function (keepPolling) {
      if (keepPolling) setTimeout(tick, delay);
    });
  }

  byId('key-form').addEventListener('submit', function (event) {
    event.preventDefault();
    key = byId('key').value.trim();
    remember(key);
    tick();
  });

  tick();
})();
`;
