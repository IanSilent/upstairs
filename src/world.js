// World: level state, arenas and waves, damage, pickups, tossed sparks, the rope, the reveal.
// Pure simulation. Audio and screen effects listen to world.events (drained by main.js each frame).
var UP = UP || {};

UP.World = function () { this.reset(); };

UP.World.prototype.reset = function () {
  var L = UP.LEVEL, self = this;
  this.events = [];
  this.t = 0;
  this.len = L.len;
  this.mode = 'play';          // play dead reveal end
  this.modeT = 0;
  this.ending = null;          // 'together' | 'alone'
  this.player = new UP.Player(L.start.x, L.start.z);
  this.enemies = [];
  this.pickups = [];
  this.tossed = [];
  this.parts = [];
  this.mechs = L.mechs.map(function (d) { return new UP.Mech(d); });
  this.npc = new UP.Npc(this);
  this.arenas = L.arenas.map(function (d) { return { def: d, state: 'wait', wave: -1, scriptUsed: false, dropped: false }; });
  this.arena = null;
  this.camX = 0;
  this.shake = 0;
  this.hitstop = 0;
  this.reveal = null;
  this.stats = { requests: 0, good: 0, flawed: 0, npcHurtPlayer: 0, freed: false, deaths: 0, together: 0, knocks: 0, puzzleT: 0, koCrawlT: 0 };
  this.checkpoint = { x: L.start.x, z: L.start.z, sparks: 0 };
  L.pickups.forEach(function (d) { self.spawnPickup(d.kind, d.x, d.z, {}); });

  // The sluice.
  var Z = L.puzzle;
  this.puzzle = {
    def: Z, chain: { x: Z.chain.x, z: Z.chain.z, swing: 0 },
    pressed: false, hatch: 0, gate: 0, solved: false, npcAtWinch: false, enteredT: -1,
  };

  // The dark (knockout and rescue).
  var D = L.dark;
  this.ko = {
    def: D, state: 'idle', t: 0, beatT: 0, hole: null,
    brute: { x: D.bruteX, z: 90, state: 'wait', t: 0, fade: 1, face: -1 },
  };

  // The snare.
  var R = L.rope;
  this.rope = {
    x: R.x, captureAt: R.captureAt, armed: true, state: 'set', pullers: [],
    pullersLeft: function () { return this.pullers.filter(function (e) { return e.state === 'pull'; }).length; },
  };
  R.pullers.forEach(function (pz) {
    var e = new UP.Enemy('grunt', pz[0], pz[1], { tag: 'puller' });
    e.state = 'pull';
    self.enemies.push(e);
    self.rope.pullers.push(e);
  });
};

UP.World.prototype.emit = function (type, data) {
  data = data || {};
  data.type = type;
  this.events.push(data);
};

// who: pass the player to also get the sluice gate (enemies are never on both sides of it).
UP.World.prototype.bounds = function (who) {
  var b = this.arena ? [this.arena.def.x0, this.arena.def.x0 + UP.W] : [0, this.len];
  var z = this.puzzle;
  if (who && z && z.gate < 0.85 && who.x < z.def.gateX) b = [b[0], Math.min(b[1], z.def.gateX - 4)];
  return b;
};

// ------------------------------------------------------------------ step
UP.World.prototype.update = function (dt, inp) {
  this.t += dt;
  this.modeT += dt;
  this.shake = Math.max(0, this.shake - dt * 2.5);
  this.updateParts(dt);
  if (this.hitstop > 0) { this.hitstop -= dt; return; }

  if (this.mode === 'dead') {
    inp = UP.Input.idle();
    if (this.modeT > 1.8) this.respawn();
  } else if (this.mode === 'reveal') {
    inp = UP.Input.idle();
    this.updateReveal(dt);
  } else if (this.mode === 'end') {
    inp = UP.Input.idle();
  }

  var p = this.player;
  if (this.mode !== 'dead' && !(this.reveal && this.reveal.rising)) p.update(dt, inp, this);

  this.updateArenas();
  this.assignAttackers();
  for (var i = 0; i < this.enemies.length; i++) this.enemies[i].update(dt, this);
  this.separate();
  this.enemies = this.enemies.filter(function (e) { return e.state !== 'dead'; });

  this.updatePuzzle(dt);
  this.updateKo(dt);
  this.updatePickups(dt);
  this.updateTossed(dt);
  for (var m = 0; m < this.mechs.length; m++) this.mechs[m].update(dt, this);
  this.npc.update(dt);
  this.updateCamera(dt);

  if (this.mode === 'play' && !this.arena && p.x > UP.LEVEL.exitX) this.end(this.npc.freed ? 'together' : 'alone');
};

UP.World.prototype.updateCamera = function (dt) {
  var target;
  var z = this.puzzle, d = z.def;
  if (this.arena) target = this.arena.def.x0;
  else if (!z.solved && this.player.x > d.zoneX - 60 && this.player.x < d.gateX) target = (d.plate.x + d.gateX) / 2 - UP.W / 2 + 20; // the whole sluice in view
  else target = this.player.x - UP.W * 0.42;
  target = UP.clamp(target, 0, this.len - UP.W);
  this.camX += (target - this.camX) * Math.min(1, dt * 5);
};

// ------------------------------------------------------------------ arenas
UP.World.prototype.updateArenas = function () {
  var p = this.player;
  for (var i = 0; i < this.arenas.length; i++) {
    var a = this.arenas[i];
    if (a.state === 'wait' && p.x > a.def.trigger && this.mode === 'play') {
      a.state = 'active';
      this.arena = a;
      this.checkpoint = { x: a.def.x0 + 90, z: p.z, sparks: p.sparks };
      this.nextWave(a);
      this.emit('lock', { x: p.x });
    }
  }
  var cur = this.arena;
  if (cur && cur.state === 'active') {
    var left = this.enemies.filter(function (e) { return e.tag === cur.def.id && e.alive(); }).length;
    if (left === 0) {
      if (cur.wave + 1 < cur.def.waves.length) this.nextWave(cur);
      else {
        cur.state = 'clear';
        this.arena = null;
        this.emit('clear', { x: p.x });
        if (cur.def.final && this.npc.freed) this.startReveal();
      }
    }
  }
};

UP.World.prototype.nextWave = function (a) {
  a.wave++;
  this.spawnWave(a);
};

UP.World.prototype.spawnWave = function (a) {
  var x0 = a.def.x0, self = this;
  var nL = 0, nR = 0;
  a.def.waves[a.wave].forEach(function (s) {
    var right = s[1] === 'R';
    var k = right ? nR++ : nL++;
    var x = right ? x0 + UP.W + 50 + k * 60 : x0 - 50 - k * 60;
    var ex = right ? x0 + UP.W - 90 - Math.random() * 140 : x0 + 90 + Math.random() * 140;
    var e = new UP.Enemy(s[0], x, s[2], { tag: a.def.id, entryX: ex });
    e.face = right ? -1 : 1;
    self.enemies.push(e);
  });
};

// Who may attack right now: the nearest few, the rest circle at a distance.
UP.World.prototype.assignAttackers = function () {
  var p = this.player, n = 0, free = [];
  for (var i = 0; i < this.enemies.length; i++) {
    var e = this.enemies[i];
    if (e.state === 'idle' || e.state === 'windup' || e.state === 'strike' || e.state === 'recover') {
      if (e.engaged) n++; else if (e.state === 'idle') free.push(e);
    } else e.engaged = false;
  }
  free.sort(function (a, b) { return Math.abs(a.x - p.x) - Math.abs(b.x - p.x); });
  for (var j = 0; j < free.length && n < UP.P.maxAttackers; j++) { free[j].engaged = true; n++; }
};

UP.World.prototype.separate = function () {
  var es = this.enemies;
  for (var i = 0; i < es.length; i++) {
    var a = es[i];
    if (a.state !== 'idle') continue;
    for (var j = 0; j < es.length; j++) {
      var b = es[j];
      if (i === j || !b.alive() || b.state === 'lifted' || b.state === 'enter') continue;
      var dx = a.x - b.x, dz = a.z - b.z;
      var mx = (a.def.w + b.def.w) * 0.5 + 4;
      if (Math.abs(dx) < mx && Math.abs(dz) < 12) {
        a.z = UP.clamp(a.z + (dz >= 0 ? 1 : -1) * 1.2, 4, UP.ZMAX - 4);
        a.x += (dx >= 0 ? 1 : -1) * 0.6;
      }
    }
  }
};

// ------------------------------------------------------------------ damage
UP.World.prototype.hitEnemy = function (e, dmg, o) {
  if (!e.alive() || e.state === 'enter') return;
  if (o.src === 'player' && !e.hittable() && !o.keepGrab) return;
  var P = UP.P;
  if (o.src === 'player' && e.spot > 0 && !o.keepGrab) {
    // Together: it shines on the enemy, you hit it. Double damage and a knockdown.
    dmg *= 2;
    o = { knock: true, dir: o.dir, src: 'player', power: 1.3 };
    e.spot = 0;
    this.stats.together++;
    this.npc.together(e);
    this.emit('together', { x: e.x, z: e.z, y: e.y + e.def.h * 0.6 });
  }
  if (e.state === 'pull') { e.state = 'idle'; e.t = 0; this.emit('ropeLetGo', { x: e.x }); }
  e.hp -= dmg;
  e.flash = 0.12;
  var power = o.power || 1;
  var heavy = e.def.armor;
  if (o.keepGrab && e.hp > 0) {
    // knee in a grab: no reaction
  } else if (o.knock || e.hp <= 0) {
    if (this.player.grabbed === e && !o.keepGrab) this.player.release();
    e.state = 'air'; e.t = 0; e.engaged = false;
    e.vy = 320 * power * (heavy ? 0.6 : 1);
    e.vx = o.dir * P.knockV * power * (heavy ? 0.5 : 1);
    e.y = Math.max(e.y, 1);
  } else if (!(heavy && o.src === 'player')) {
    e.state = 'hurt'; e.t = 0; e.vx = o.dir * 90;
  }
  this.hitstop = Math.max(this.hitstop, (o.src === 'npc' ? 0.035 : P.hitstop) * (o.knock ? 1.6 : 1));
  if (o.src !== 'player') this.shake = Math.max(this.shake, o.src === 'npc' ? 0.6 : 0.3);
  this.emit('hit', { x: e.x, z: e.z, y: e.y + e.def.h * 0.6, src: o.src, knock: !!o.knock, kill: e.hp <= 0, heavy: heavy });
  if (e.hp <= 0) this.killEnemy(e);
};

UP.World.prototype.killEnemy = function (e) {
  if (e.killed) return;
  e.killed = true;
  e.hp = 0;
  var a = this.arenas.filter(function (x) { return x.def.id === e.tag; })[0];
  if (a && a.def.dropFirstKill && !a.dropped) {
    a.dropped = true;
    this.spawnPickup(a.def.dropFirstKill, e.x, e.z, { fromY: 60 });
  }
  this.emit('kill', { x: e.x, z: e.z });
};

UP.World.prototype.enemyGone = function (e) { e.state = 'dead'; };

UP.World.prototype.enemyLanded = function (e, wasThrown) {
  this.emit('thud', { x: e.x, z: e.z, heavy: e.def.armor });
  if (wasThrown) this.npc.maybeStomp(e);
};

// ------------------------------------------------------------------ talking and the sluice
UP.World.prototype.playerKnock = function (p, weak) {
  this.stats.knocks++;
  this.emit('playerKnock', { x: p.x, weak: !!weak });
  this.burst(p.x, UP.CEIL_Y, 'dust', 5);
  this.npc.hearKnock(p.x);
};

UP.World.prototype.updatePuzzle = function (dt) {
  var z = this.puzzle, p = this.player, d = z.def;
  if (z.enteredT < 0 && p.x > d.zoneX) z.enteredT = this.t;
  var on = this.mode === 'play' && Math.abs(p.x - d.plate.x) < 30 && Math.abs(p.z - d.plate.z) < 18 && p.y < 4;
  if (on !== z.pressed) { z.pressed = on; this.emit(on ? 'plateDown' : 'plateUp', { x: d.plate.x }); }
  var wasOpen = z.hatch >= 0.7;
  if (z.pressed || z.solved) z.hatch = Math.min(1, z.hatch + dt * 2.5);
  else z.hatch = Math.max(0, z.hatch - dt * 1.6);
  if ((z.hatch >= 0.7) !== wasOpen) this.emit('hatch', { x: d.hatchX, open: !wasOpen });
  z.chain.swing *= Math.pow(0.03, dt);
  if (z.solved) return;
  if (z.gate >= 1) {
    z.gate = 1; z.solved = true; z.npcAtWinch = false;
    this.stats.puzzleT = this.t - z.enteredT;
    this.emit('gateOpen', { x: d.gateX });
    this.npc.puzzleSolved();
    return;
  }
  if (z.npcAtWinch) {
    // Alone it can only hold the gate a little off the floor; it sags back to that.
    var base = 0.18 + 0.03 * Math.sin(this.t * 7);
    if (z.gate > base) z.gate = Math.max(base, z.gate - dt * 0.18);
    else z.gate = Math.min(base, z.gate + dt * 0.5);
  } else z.gate = Math.max(0, z.gate - dt * 0.5);
};

// ------------------------------------------------------------------ the dark: knockout and rescue
UP.World.prototype.inDark = function (x) { var d = this.ko.def; return x > d.x0 && x < d.x1; };

UP.World.prototype.inHoleLight = function (x, z) {
  var h = this.ko.hole;
  if (!h || h.open < 0.6) return false;
  var dx = (x - h.x) / 44, dz = (z - h.z) / 26;
  return dx * dx + dz * dz < 1;
};

UP.World.prototype.updateKo = function (dt) {
  var k = this.ko, d = k.def, p = this.player, n = this.npc, b = k.brute;
  k.t += dt;
  if (b) {
    b.t += dt;
    if (b.state === 'charge') {
      b.x -= 600 * dt;
      b.z += UP.clamp(p.z - b.z, -200 * dt, 200 * dt);
      if (b.x - p.x < 46) {
        b.state = 'leave'; b.t = 0;
        p.knockout(this, -1);
        this.shake = 1.6; this.hitstop = 0.12;
        k.state = 'downed'; k.t = 0; k.beatT = 0.4; k.downAt = this.t;
        this.emit('knockout', { x: p.x, z: p.z });
        this.emit('hit', { x: p.x, z: p.z, y: 40, src: 'enemy', knock: true, kill: true, heavy: true });
        n.startRescue();
      }
    } else if (b.state === 'leave') {
      // It does not even look back.
      b.face = 1;
      if (b.t > 0.8) { b.x += 70 * dt; b.fade -= dt * 0.35; }
      if (b.fade <= 0) k.brute = null;
    }
  }
  switch (k.state) {
    case 'idle':
      if (this.mode === 'play' && n.freed && p.x > d.trigger && !this.arena) {
        k.state = 'ambush'; k.t = 0;
        b.state = 'charge'; b.z = p.z;
        this.emit('ambush', { x: b.x });
        n.alarm();
      }
      break;
    case 'downed':
    case 'healing':
      k.beatT -= dt;
      if (k.beatT <= 0) { k.beatT = k.state === 'healing' ? 1.2 : 0.95; this.emit('heartbeat', { slow: k.state === 'healing' }); }
      if (k.hole && k.hole.open < 1 && k.hole.broken) k.hole.open = Math.min(1, k.hole.open + dt * 2);
      if (k.state === 'downed' && p.state === 'downed' && this.inHoleLight(p.x, p.z)) {
        k.state = 'healing'; k.t = 0;
        this.stats.koCrawlT = this.t - k.downAt;
        p.setState('healing');
        this.emit('rescueHeal', { x: p.x });
        n.rescueHeal();
      }
      if (k.state === 'healing') {
        p.hp = Math.min(UP.P.maxHp, p.hp + UP.P.maxHp * dt / 2.2);
        if (Math.random() < 0.6) this.puff(p.x + (Math.random() - 0.5) * 50, UP.zToY(p.z) - Math.random() * 30, 'motes');
        if (k.t > 2.4) {
          k.state = 'done';
          p.hp = UP.P.maxHp; p.inv = 1;
          p.setState('getup');
          this.emit('rescued', { x: p.x });
          this.spawnPickup('spark', k.hole.x + 20, k.hole.z, { fromY: 240 });
          n.rescued();
        }
      }
      break;
  }
};

// Called by the one upstairs when its hammering breaks through.
UP.World.prototype.breakCeiling = function (x, z) {
  this.ko.hole = { x: x, z: z, open: 0, broken: true };
  this.emit('ceilingBreak', { x: x });
  this.burst(x, UP.CEIL_Y, 'dust', 60);
  this.burst(x, UP.CEIL_Y, 'ember', 20);
  this.shake = Math.max(this.shake, 1.0);
};

UP.World.prototype.hitChain = function (p) {
  var z = this.puzzle;
  z.chain.swing = 1;
  if (z.solved) { this.emit('chain', { x: z.chain.x, together: false }); return; }
  if (z.npcAtWinch) {
    z.gate = Math.min(1, z.gate + 0.14);
    this.emit('chain', { x: z.chain.x, together: true });
    this.npc.heave();
  } else {
    z.gate = Math.min(0.06, z.gate + 0.04);   // alone: it barely shudders
    this.emit('chain', { x: z.chain.x, together: false });
  }
};

UP.World.prototype.thrownCollide = function (e) {
  e.hitList = e.hitList || [];
  for (var i = 0; i < this.enemies.length; i++) {
    var o = this.enemies[i];
    if (o === e || !o.hittable() || e.hitList.indexOf(o) >= 0) continue;
    if (Math.abs(o.x - e.x) < 34 && Math.abs(o.z - e.z) < 18 && e.y < 70) {
      e.hitList.push(o);
      this.hitEnemy(o, 12, { knock: true, dir: Math.sign(e.vx) || 1, src: 'throw' });
    }
  }
};

UP.World.prototype.playerDied = function () {
  this.mode = 'dead'; this.modeT = 0;
  this.stats.deaths++;
  this.emit('death', { x: this.player.x });
};

UP.World.prototype.respawn = function () {
  var p = this.player, c = this.checkpoint, a = this.arena;
  if (a) { p.x = c.x; p.z = c.z; }
  p.y = 0; p.vy = 0;
  p.hp = UP.P.maxHp; p.inv = 1.2; p.setState('idle'); p.grabbed = null;
  // Soft: you always come back with at least one spark if someone is up there to catch it.
  p.sparks = Math.max(c.sparks, this.npc.available() ? 1 : 0);
  if (a) {
    this.enemies = this.enemies.filter(function (e) { return e.tag !== a.def.id; });
    this.spawnWave(a);
  }
  this.mode = 'play'; this.modeT = 0;
  this.emit('respawn', {});
};

// ------------------------------------------------------------------ pickups and sparks
// opts: amount, fromY (start height, falls), tx/tz (rolls there after landing), big
UP.World.prototype.spawnPickup = function (kind, x, z, opts) {
  opts = opts || {};
  this.pickups.push({
    kind: kind, x: x, z: UP.clamp(z, 6, UP.ZMAX - 6), y: opts.fromY || 0, vy: 0,
    amount: opts.amount || 0, tx: opts.tx, tz: opts.tz, big: !!opts.big, t: 0, taken: false,
    fromAbove: (opts.fromY || 0) > 120,
  });
};

UP.World.prototype.updatePickups = function (dt) {
  var p = this.player;
  for (var i = 0; i < this.pickups.length; i++) {
    var k = this.pickups[i];
    k.t += dt;
    if (k.y > 0) {
      k.vy -= (k.fromAbove ? 500 : 1200) * dt;
      k.vy = Math.max(k.vy, -380);
      k.y = Math.max(0, k.y + k.vy * dt);
      if (k.y === 0) this.emit('pickupLand', { x: k.x, kind: k.kind });
    } else if (k.tx !== undefined) {
      var dx = k.tx - k.x, dz = k.tz - k.z, d = Math.hypot(dx, dz);
      if (d < 4) k.tx = undefined;
      else { var s = Math.min(d, 200 * dt); k.x += dx / d * s; k.z += dz / d * s; }
    }
    if (k.y < 30 && k.t > 0.3 && !p.isDown() && Math.abs(k.x - p.x) < 28 && Math.abs(k.z - p.z) < 18 && p.y < 40 && this.mode === 'play') {
      if (k.kind === 'spark') {
        if (p.sparks >= 3) continue;
        p.sparks++;
        this.emit('sparkGet', { x: k.x });
      } else {
        p.heal(this, k.amount);
      }
      k.taken = true;
    }
  }
  this.pickups = this.pickups.filter(function (k) { return !k.taken; });
};

UP.World.prototype.tossSpark = function (p) {
  this.tossed.push({ x: p.x + p.face * 6, z: p.z, y: 70, vy: 520 });
  this.emit('toss', { x: p.x });
};

UP.World.prototype.updateTossed = function (dt) {
  for (var i = 0; i < this.tossed.length; i++) {
    var s = this.tossed[i];
    s.vy += 900 * dt;
    s.y += s.vy * dt;
    if (Math.random() < 0.8) this.puff(s.x, UP.zToY(s.z) - s.y, 'trail');
    if (UP.zToY(s.z) - s.y < UP.CEIL_Y - 6) {
      s.done = true;
      this.emit('sparkIn', { x: s.x });
      this.npc.receive(s.x);
    }
  }
  this.tossed = this.tossed.filter(function (s) { return !s.done; });
};

// ------------------------------------------------------------------ particles (world x, screen y)
UP.World.prototype.puff = function (x, sy, kind) {
  var r = Math.random;
  var q = { x: x, sy: sy, vx: 0, vy: 0, life: 0, max: 0.5, kind: kind, size: 2 };
  switch (kind) {
    case 'dust': q.vx = (r() - 0.5) * 10; q.vy = 30 + r() * 40; q.max = 1.6 + r(); q.size = 1 + r() * 1.5; q.g = 40; break;
    case 'drip': q.vy = 60; q.max = 0.6; q.size = 1.5; q.g = 600; break;
    case 'steam': q.vx = (r() - 0.5) * 60; q.vy = -20 - r() * 40; q.max = 0.5 + r() * 0.5; q.size = 10 + r() * 16; break;
    case 'trail': q.vx = (r() - 0.5) * 20; q.vy = 20; q.max = 0.4; q.size = 2; break;
    case 'spark': q.vx = (r() - 0.5) * 320; q.vy = -r() * 260; q.max = 0.25 + r() * 0.2; q.size = 2; q.g = 900; break;
    case 'ember': q.vx = (r() - 0.5) * 140; q.vy = -40 - r() * 120; q.max = 0.6 + r() * 0.5; q.size = 2; q.g = 200; break;
    case 'motes': q.vx = (r() - 0.5) * 30; q.vy = 10 + r() * 30; q.max = 2 + r() * 2; q.size = 1 + r() * 2; break;
  }
  this.parts.push(q);
  if (this.parts.length > 700) this.parts.shift();
};

UP.World.prototype.burst = function (x, sy, kind, n) { for (var i = 0; i < n; i++) this.puff(x, sy, kind); };

UP.World.prototype.updateParts = function (dt) {
  for (var i = 0; i < this.parts.length; i++) {
    var q = this.parts[i];
    q.life += dt;
    if (q.g) q.vy += q.g * dt;
    q.x += q.vx * dt; q.sy += q.vy * dt;
  }
  this.parts = this.parts.filter(function (q) { return q.life < q.max; });
};

// ------------------------------------------------------------------ reveal and end
UP.World.prototype.startReveal = function () {
  this.mode = 'reveal'; this.modeT = 0;
  this.reveal = { t: 0, open: 0, thread: 0, rise: 0, fade: 0, knocks: 0, rising: false, x: this.player.x };
  this.npc.setState('reveal');
  this.player.vx = this.player.vz = 0;
  this.emit('revealStart', {});
};

UP.World.prototype.updateReveal = function (dt) {
  var r = this.reveal, p = this.player, n = this.npc;
  r.t += dt;
  r.x += (p.x - r.x) * Math.min(1, dt * 3);
  var knockAt = [1.3, 1.9, 2.5];
  if (r.knocks < 3 && r.t > knockAt[r.knocks]) { r.knocks++; this.emit('knock', { x: n.x, n: 1, soft: false, slow: true }); }
  if (r.t > 2.9) r.open = Math.min(1, r.open + dt / 2.2);
  if (r.t > 2.9 && !r.openSfx) { r.openSfx = true; this.emit('ceilingOpen', { x: p.x }); this.burst(p.x, UP.CEIL_Y, 'dust', 40); }
  if (r.t > 5.3) r.thread = Math.min(1, r.thread + dt / 1.4);
  if (r.t > 6.9) {
    if (!r.rising) { r.rising = true; this.emit('rise', {}); }
    r.rise = Math.min(1, r.rise + dt / 3.2);
    var top = UP.zToY(p.z) - UP.CEIL_Y + 60;
    p.y = top * r.rise * r.rise * (3 - 2 * r.rise);
    p.state = 'idle';
  }
  if (r.t > 9.4) r.fade = Math.min(1, r.fade + dt / 1.6);
  if (r.fade >= 1 && this.mode === 'reveal') this.end('together');
};

UP.World.prototype.end = function (how) {
  this.mode = 'end'; this.modeT = 0; this.ending = how;
  this.emit('end', { how: how });
};
