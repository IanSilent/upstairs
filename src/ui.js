// HTML overlays: title, pause, and the tuning panel (backquote) with the decision log —
// "what the one upstairs decided and why", for reading playtests.
var UP = UP || {};

UP.UI = function (game) {
  this.game = game;
  this.root = document.getElementById('ui');
  this.title = this.el('div', 'title', this.root);
  this.title.innerHTML =
    '<div class="t-name">наверху</div>' +
    '<div class="t-keys">' +
    '<span><b>WASD</b> / <b>стрелки</b> — идти</span>' +
    '<span><b>J</b> — бить (три раза — серия)</span>' +
    '<span><b>K</b> / <b>пробел</b> — прыжок</span>' +
    '<span>прижаться к врагу — захват, <b>J</b> / <b>K</b> — бросок</span>' +
    '<span><b>L</b> — подбросить искру наверх (без искр — постучать)</span>' +
    '</div>' +
    '<div class="t-go">J — начать</div>';
  this.pause = this.el('div', 'pause hidden', this.root);
  this.pause.innerHTML = '<div class="t-name small">пауза</div><div class="t-go">Esc — продолжить · R — заново</div>';
  this.panel = this.el('div', 'panel hidden', this.root);
  this.buildPanel();
};

UP.UI.prototype.el = function (tag, cls, parent) {
  var e = document.createElement(tag);
  e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
};

UP.UI.prototype.showTitle = function (v) { this.title.classList.toggle('hidden', !v); };
UP.UI.prototype.showPause = function (v) { this.pause.classList.toggle('hidden', !v); };
UP.UI.prototype.togglePanel = function () { this.panel.classList.toggle('hidden'); };

UP.UI.prototype.buildPanel = function () {
  var self = this, p = this.panel;
  p.innerHTML = '';
  var head = this.el('div', 'p-head', p);
  head.textContent = 'Тюнинг · ` закрыть';
  var row = this.el('div', 'p-row', p);
  [['A', 'Арена A'], ['B', 'Арена B'], ['puzzle', 'Шлюз'], ['rope', 'Верёвка'], ['dark', 'Темнота'], ['C', 'Финал']].forEach(function (j) {
    var b = self.el('button', '', row); b.textContent = j[1];
    b.onclick = function () { UP.debugJump(self.game.world, j[0]); };
  });
  var row2 = this.el('div', 'p-row', p);
  var b1 = this.el('button', '', row2); b1.textContent = '+3 искры';
  b1.onclick = function () { self.game.world.player.sparks = 3; };
  var b2 = this.el('button', '', row2); b2.textContent = 'Сбросить параметры';
  b2.onclick = function () { UP.resetParams(); self.buildPanel(); };

  this.logEl = this.el('div', 'p-log', p);
  this.statEl = this.el('div', 'p-stat', p);

  var group = null, box = null;
  UP.PARAMS_DEF.forEach(function (d) {
    if (d[0] !== group) {
      group = d[0];
      var gh = self.el('div', 'p-group', p); gh.textContent = group;
      box = self.el('div', 'p-box', p);
    }
    var r = self.el('label', 'p-param', box);
    var name = self.el('span', 'p-label', r); name.textContent = d[6];
    var inp = self.el('input', '', r);
    inp.type = 'range'; inp.min = d[3]; inp.max = d[4]; inp.step = d[5]; inp.value = UP.P[d[1]];
    var val = self.el('span', 'p-val', r); val.textContent = UP.P[d[1]];
    inp.oninput = function () { UP.P[d[1]] = parseFloat(inp.value); val.textContent = inp.value; };
  });
};

UP.UI.prototype.update = function () {
  if (this.panel.classList.contains('hidden')) return;
  var w = this.game.world, n = w.npc;
  var html = '<div class="p-sub">Сосед сейчас: <b>' + n.state + '</b> · ожидает искр: ' + n.pending + ' · связь: ' + n.bond + '</div>';
  for (var i = n.log.length - 1; i >= 0; i--) {
    html += '<div>' + n.log[i].t.toFixed(1) + 'с · ' + n.log[i].text.replace(/</g, '&lt;') + '</div>';
  }
  if (this.logEl._last !== html) { this.logEl.innerHTML = html; this.logEl._last = html; }
  var s = w.stats;
  this.statEl.textContent = 'Просьб: ' + s.requests + ' · удачно: ' + s.good + ' · неудачно: ' + s.flawed +
    ' · задел игрока: ' + s.npcHurtPlayer + ' · вместе: ' + s.together + ' · стуков: ' + s.knocks +
    ' · шлюз: ' + (w.puzzle.solved ? s.puzzleT.toFixed(0) + 'с' : '—') +
    ' · ползком: ' + (s.koCrawlT ? s.koCrawlT.toFixed(0) + 'с' : '—') +
    ' · освобождён: ' + (s.freed ? 'да' : 'нет') + ' · смертей: ' + s.deaths;
};

// Debug teleport to a beat of the level.
UP.DEBUG_BEATS = ['A', 'B', 'puzzle', 'rope', 'dark', 'C'];
UP.debugJump = function (w, where) {
  var L = UP.LEVEL, order = UP.DEBUG_BEATS;
  var idx = order.indexOf(where);
  w.arenas.forEach(function (a) {
    var ai = order.indexOf(a.def.id);
    if (ai < idx) { a.state = 'clear'; a.dropped = true; } else { a.state = 'wait'; a.wave = -1; a.scriptUsed = false; a.dropped = false; }
  });
  w.arena = null;
  var z = w.puzzle;
  if (idx > 2) { z.solved = true; z.gate = 1; z.hatch = 1; z.npcAtWinch = false; }
  else { z.solved = false; z.gate = 0; z.hatch = 0; z.npcAtWinch = false; z.enteredT = -1; w.npc.blockedSaid = false; }
  var k = w.ko, D = UP.LEVEL.dark;
  if (idx > 4) { k.state = 'done'; k.brute = null; }
  else { k.state = 'idle'; k.hole = null; k.brute = { x: D.bruteX, z: 90, state: 'wait', t: 0, fade: 1, face: -1 }; }
  w.enemies = w.enemies.filter(function (e) { return e.tag === 'puller' && idx <= 3; });
  if (idx > 3 && w.rope.state !== 'free' && w.rope.state !== 'gone') {
    w.rope.state = 'gone'; w.rope.armed = false; w.npc.captured = true; w.npc.freed = true; w.stats.freed = true;
  }
  var x = where === 'rope' ? L.rope.captureAt - 200
    : where === 'puzzle' ? L.puzzle.zoneX - 120
    : where === 'dark' ? L.dark.x0 - 120
    : L.arenas.filter(function (a) { return a.id === where; })[0].x0 + 60;
  w.player.x = x; w.player.hp = UP.P.maxHp; w.player.sparks = Math.max(w.player.sparks, 2);
  w.npc.x = x - 40;
  if (w.npc.state !== 'stuck') { w.npc.setState('follow'); w.npc.pending = 0; }
  w.mechs.forEach(function (m) { m.busy = false; });
  w.mode = 'play'; w.reveal = null;
  w.camX = UP.clamp(x - UP.W * 0.42, 0, w.len - UP.W);
};
