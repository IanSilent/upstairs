// Player and enemies: movement, combo, grab/throw, enemy AI with attack tokens, damage.
// Pure simulation: no drawing, no audio. Side effects go out as world.emit(type, data).
var UP = UP || {};

// ------------------------------------------------------------------ player
UP.Player = function (x, z) {
  this.x = x; this.z = z; this.y = 0;
  this.vx = 0; this.vz = 0; this.vy = 0;
  this.face = 1;
  this.hp = UP.P.maxHp;
  this.state = 'idle';       // idle walk attack jump hurt grab toss
  this.t = 0;
  this.combo = 0;            // 1..3 within the current string
  this.comboOpen = 0;        // time left to chain the next hit
  this.queued = false;       // attack pressed during an attack
  this.hitSet = [];          // enemies already hit by the current swing
  this.jumpAtk = false;
  this.inv = 0;
  this.sparks = 0;
  this.grabbed = null;
  this.grabHold = 0;
  this.grabT = 0;
  this.knees = 0;
  this.tossed = false;
  this.flash = 0;
  this.idleT = 0;
};

UP.ATTACKS = [
  null,
  { dur: 0.22, from: 0.05, to: 0.12, reach: 62, dmg: 'hitDmg', knock: false, lunge: 40 },
  { dur: 0.22, from: 0.05, to: 0.12, reach: 62, dmg: 'hitDmg', knock: false, lunge: 40 },
  { dur: 0.36, from: 0.08, to: 0.17, reach: 72, dmg: 'finDmg', knock: true, lunge: 90 },
];

UP.Player.prototype.free = function () {
  return this.state === 'idle' || this.state === 'walk';
};

UP.Player.prototype.update = function (dt, inp, w) {
  var P = UP.P;
  this.inv = Math.max(0, this.inv - dt);
  this.flash = Math.max(0, this.flash - dt);
  this.comboOpen = Math.max(0, this.comboOpen - dt);
  this.t += dt;
  var moving = inp.dx || inp.dz;
  this.idleT = (moving || inp.attack || inp.jump || inp.toss) ? 0 : this.idleT + dt;

  switch (this.state) {
    case 'hurt':
      this.vx *= 0.85; this.vz = 0;
      if (this.t > 0.32) this.setState('idle');
      break;

    case 'attack': {
      var a = UP.ATTACKS[this.combo];
      var lungeT = this.t < a.to ? 1 : 0;
      // No lunge right in front of the sluice chain: you stay on it and keep pulling.
      var ch = w.puzzle && w.puzzle.chain, cd = ch ? (ch.x - this.x) * this.face : 99;
      if (ch && cd > -10 && cd < 70 && Math.abs(ch.z - this.z) < 26) lungeT = 0;
      this.vx = this.face * a.lunge * lungeT; this.vz = 0;
      if (inp.attack) this.queued = true;
      if (this.t >= a.from && this.t <= a.to) this.swing(w, a.reach, P[a.dmg], a.knock, 22);
      if (this.t >= a.dur) {
        if (this.queued && this.combo < 3) { this.startAttack(this.combo + 1, inp, w); }
        else { this.comboOpen = this.combo < 3 ? 0.28 : 0; this.setState('idle'); }
      }
      break;
    }

    case 'jump':
      this.vx = inp.dx * P.walkX * 0.9;
      this.vz = inp.dz * P.walkZ * 0.6;
      if (inp.dx) this.face = inp.dx;
      if (inp.attack && !this.jumpAtk) { this.jumpAtk = true; this.hitSet = []; }
      if (this.jumpAtk) this.swing(w, 56, P.jumpDmg, true, 24);
      break;

    case 'toss':
      this.vx = 0; this.vz = 0;
      if (!this.tossed && this.t > 0.12) {
        this.tossed = true;
        w.tossSpark(this);
      }
      if (this.t > 0.32) this.setState('idle');
      break;

    case 'koAir':
      // Knocked out: flying back. Lands lying down (see integrate below).
      this.vx *= Math.pow(0.4, dt); this.vz = 0;
      break;

    case 'downed': {
      // Knocked out: you can only crawl, in slow pulls. L still knocks (weakly).
      var pull = Math.max(0, Math.sin(this.t * 6.5));
      var cs = P.crawlSpeed * (0.15 + 1.6 * pull);
      this.vx = inp.dx * cs; this.vz = inp.dz * cs * 0.5;
      if (inp.dx) this.face = inp.dx;
      this.crawlT = (this.crawlT || 0) - dt;
      if ((inp.dx || inp.dz) && this.crawlT <= 0 && pull > 0.9) { this.crawlT = 0.4; w.emit('crawl', { x: this.x }); }
      this.knockCd = (this.knockCd || 0) - dt;
      if (inp.toss && this.knockCd <= 0) { this.knockCd = 0.7; w.playerKnock(this, true); }
      break;
    }

    case 'healing':
      this.vx = 0; this.vz = 0;
      break;

    case 'getup':
      this.vx = 0; this.vz = 0;
      if (this.t > 0.8) this.setState('idle');
      break;

    case 'knock':
      // No sparks: knock on the ceiling. It answers.
      this.vx = 0; this.vz = 0;
      if (!this.tossed && this.t > 0.1) { this.tossed = true; w.playerKnock(this); }
      if (this.t > 0.28) this.setState('idle');
      break;

    case 'grab': {
      var e = this.grabbed;
      this.vx = 0; this.vz = 0;
      this.grabT += dt;
      if (!e || e.state !== 'grabbed') { this.release(); break; }
      e.x = this.x + this.face * 30; e.z = this.z; e.face = -this.face;
      if (inp.attack) {
        if (inp.dx) { this.face = inp.dx; this.throwGrabbed(w); }
        else {
          this.knees++;
          w.hitEnemy(e, P.kneeDmg, { knock: false, dir: this.face, src: 'player', keepGrab: true });
          if (e.hp <= 0 || this.knees >= 3) this.throwGrabbed(w);
        }
      } else if (inp.jump) {
        this.throwGrabbed(w);
      } else if (this.grabT > 2.2) {
        e.state = 'idle'; e.t = 0; e.vx = -this.face * 160; e.cd = 0.4;
        this.release();
      }
      break;
    }

    default: // idle / walk
      if (inp.toss && this.sparks > 0) { this.setState('toss'); this.tossed = false; this.sparks--; break; }
      if (inp.toss) { this.setState('knock'); this.tossed = false; break; }
      if (inp.jump) { this.vy = P.jumpV; this.y = 0.01; this.jumpAtk = false; this.setState('jump'); w.emit('jump', { x: this.x }); break; }
      if (inp.attack) {
        this.startAttack(this.comboOpen > 0 ? Math.min(3, this.combo + 1) : 1, inp, w);
        break;
      }
      this.vx = inp.dx * P.walkX;
      this.vz = inp.dz * P.walkZ;
      if (inp.dx) this.face = inp.dx;
      this.state = moving ? 'walk' : 'idle';
      this.tryGrab(dt, inp, w);
  }

  // integrate
  this.x += this.vx * dt;
  this.z = UP.clamp(this.z + this.vz * dt, 4, UP.ZMAX - 4);
  if (this.y > 0 || this.vy > 0) {
    this.vy -= P.gravity * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      this.y = 0; this.vy = 0;
      if (this.state === 'jump') { this.setState('idle'); w.emit('land', { x: this.x, z: this.z }); }
      if (this.state === 'koAir') { this.setState('downed'); this.vx = 0; w.emit('thud', { x: this.x, z: this.z, heavy: true }); w.shake = Math.max(w.shake, 0.9); }
    }
  }
  var b = w.bounds(this);
  this.x = UP.clamp(this.x, b[0] + 18, b[1] - 18);
};

UP.Player.prototype.setState = function (s) { this.state = s; this.t = 0; };

UP.Player.prototype.startAttack = function (n, inp, w) {
  if (inp && inp.dx) this.face = inp.dx;
  this.combo = n; this.queued = false; this.hitSet = [];
  this.setState('attack');
  w.emit('swing', { x: this.x, n: n });
};

UP.Player.prototype.swing = function (w, reach, dmg, knock, dzMax) {
  var ch = w.puzzle && w.puzzle.chain;
  if (ch && this.hitSet.indexOf(ch) < 0) {
    var cdx = (ch.x - this.x) * this.face;
    if (cdx > -10 && cdx < reach + 10 && Math.abs(ch.z - this.z) < dzMax + 4) { this.hitSet.push(ch); w.hitChain(this); }
  }
  for (var i = 0; i < w.enemies.length; i++) {
    var e = w.enemies[i];
    if (!e.hittable() || this.hitSet.indexOf(e) >= 0) continue;
    var dx = (e.x - this.x) * this.face;
    if (dx > -12 && dx < reach + e.def.w * 0.4 && Math.abs(e.z - this.z) < dzMax && Math.abs(e.y - this.y) < 60) {
      this.hitSet.push(e);
      w.hitEnemy(e, dmg, { knock: knock, dir: this.face, src: 'player' });
    }
  }
};

UP.Player.prototype.tryGrab = function (dt, inp, w) {
  if (!inp.dx) { this.grabHold = 0; return; }
  for (var i = 0; i < w.enemies.length; i++) {
    var e = w.enemies[i];
    if (!e.grabbable()) continue;
    var dx = e.x - this.x;
    if (Math.sign(dx) === inp.dx && Math.abs(dx) < 38 && Math.abs(e.z - this.z) < 12) {
      this.grabHold += dt;
      if (this.grabHold > 0.16) {
        this.grabHold = 0;
        this.grabbed = e; this.knees = 0; this.grabT = 0;
        e.state = 'grabbed'; e.t = 0; e.engaged = false;
        this.setState('grab');
        w.emit('grab', { x: e.x });
      }
      return;
    }
  }
  this.grabHold = 0;
};

UP.Player.prototype.throwGrabbed = function (w) {
  var e = this.grabbed;
  this.release();
  if (!e) return;
  e.x = this.x + this.face * 20;
  e.thrown = true;
  w.hitEnemy(e, UP.P.throwDmg, { knock: true, dir: this.face, src: 'throw', power: 1.5 });
  w.emit('throw', { x: e.x });
};

UP.Player.prototype.release = function () {
  this.grabbed = null;
  if (this.state === 'grab') this.setState('idle');
};

// Scripted knockout (the dark): every HP gone at once, but you are down, not dead.
UP.Player.prototype.knockout = function (w, dir) {
  if (this.grabbed) { var e = this.grabbed; e.state = 'idle'; e.t = 0; this.release(); }
  this.hp = 0; this.inv = 0; this.flash = 0.3;
  this.vx = dir * 260; this.vy = 420; this.y = Math.max(this.y, 1);
  this.setState('koAir');
};
UP.Player.prototype.isDown = function () {
  return this.state === 'koAir' || this.state === 'downed' || this.state === 'healing';
};

UP.Player.prototype.hurt = function (w, dmg, dir, src) {
  if (this.isDown()) return false;
  if (this.inv > 0 || UP.P.god) { if (UP.P.god) this.flash = 0.15; return false; }
  if (this.grabbed) { var e = this.grabbed; e.state = 'idle'; e.t = 0; this.release(); }
  this.hp = Math.max(0, this.hp - dmg);
  this.inv = 0.6; this.flash = 0.2;
  this.vx = dir * 160; this.vy = 0; this.y = 0;
  this.setState('hurt');
  w.emit('playerHurt', { x: this.x, z: this.z, dmg: dmg, src: src || 'enemy' });
  if (this.hp <= 0) w.playerDied();
  return true;
};

UP.Player.prototype.heal = function (w, n) {
  var before = this.hp;
  this.hp = Math.min(UP.P.maxHp, this.hp + n);
  w.emit('heal', { x: this.x, z: this.z, n: this.hp - before });
};

// ------------------------------------------------------------------ enemies
UP.ENEMY = {
  grunt: { hp: 34, speed: 95, reach: 50, windup: 0.5, strike: 0.12, recover: 0.5, dmg: 8, w: 30, h: 56, armor: false, lunge: 60 },
  fast:  { hp: 22, speed: 170, reach: 54, windup: 0.32, strike: 0.14, recover: 0.42, dmg: 6, w: 20, h: 64, armor: false, lunge: 300 },
  heavy: { hp: 90, speed: 62, reach: 64, windup: 0.85, strike: 0.16, recover: 0.75, dmg: 16, w: 52, h: 72, armor: true, lunge: 40 },
  // The one from the dark. Comes back in the finale, so you can answer it together.
  brute: { hp: 130, speed: 70, reach: 72, windup: 0.9, strike: 0.16, recover: 0.8, dmg: 18, w: 66, h: 94, armor: true, lunge: 60 },
};

UP.Enemy = function (type, x, z, opts) {
  this.type = type;
  this.def = UP.ENEMY[type];
  this.x = x; this.z = z; this.y = 0;
  this.vx = 0; this.vz = 0; this.vy = 0;
  this.face = -1;
  this.maxHp = Math.round(this.def.hp * UP.P.enemyHpMul);
  this.hp = this.maxHp;
  this.state = 'enter';      // enter idle windup strike recover hurt air down getup grabbed lifted dead pull
  this.t = 0;
  this.cd = 0.6 + Math.random() * 0.6;
  this.engaged = false;
  this.hoverZ = 20 + Math.random() * 110;
  this.hoverT = 0;
  this.thrown = false;
  this.flash = 0;
  this.spot = 0;              // > 0 while the one upstairs shines on it (hit it together)
  this.fade = 1;
  this.struck = false;
  this.entryX = opts && opts.entryX;   // walk to here before fighting
  this.tag = opts && opts.tag;
  this.drop = opts && opts.drop;
  this.id = UP.Enemy.nextId++;
  this.seed = Math.random() * 100;
};
UP.Enemy.nextId = 1;

UP.Enemy.prototype.alive = function () { return this.state !== 'dead' && this.state !== 'lifted'; };
UP.Enemy.prototype.hittable = function () {
  return this.alive() && this.state !== 'down' && this.state !== 'getup' && this.state !== 'grabbed' && this.state !== 'air';
};
UP.Enemy.prototype.grabbable = function () {
  return !this.def.armor && (this.state === 'idle' || this.state === 'recover' || this.state === 'hurt');
};
// Counts for "is anybody standing here" checks made by the one upstairs.
UP.Enemy.prototype.present = function () {
  return this.alive() && this.state !== 'enter' && this.state !== 'grabbed';
};

UP.Enemy.prototype.update = function (dt, w) {
  var d = this.def, p = w.player, P = UP.P;
  var spd = d.speed * P.enemySpeedMul;
  this.t += dt;
  this.cd -= dt;
  this.flash = Math.max(0, this.flash - dt);
  this.spot = this.alive() ? Math.max(0, this.spot - dt) : 0;

  switch (this.state) {
    case 'enter': {
      var tx = this.entryX;
      var dx = tx - this.x;
      this.face = Math.sign(dx) || this.face;
      this.vx = Math.sign(dx) * spd; this.vz = 0;
      if (Math.abs(dx) < 6) { this.state = 'idle'; this.t = 0; }
      break;
    }
    case 'pull':
      // Hauling on the rope that holds the one upstairs. Leans back rhythmically, ignores the player.
      this.vx = 0; this.vz = 0;
      this.face = Math.sign(w.rope.x - this.x) || 1;
      break;

    case 'idle': {
      if (p.hp <= 0) { this.vx = this.vz = 0; break; }
      var side = Math.sign(this.x - p.x) || 1;
      var gx, gz, s;
      if (this.engaged) {
        gx = p.x + side * (d.reach - 8 + d.w * 0.3); gz = p.z; s = spd;
      } else {
        this.hoverT -= dt;
        if (this.hoverT <= 0) { this.hoverT = 1.5 + Math.random() * 1.5; this.hoverZ = 15 + Math.random() * 120; }
        gx = p.x + side * (170 + (this.id % 3) * 30); gz = this.hoverZ; s = spd * 0.55;
      }
      var b = w.bounds();
      gx = UP.clamp(gx, b[0] + 24, b[1] - 24);
      var ex = gx - this.x, ez = gz - this.z;
      this.vx = Math.abs(ex) > 6 ? Math.sign(ex) * s : 0;
      this.vz = Math.abs(ez) > 4 ? Math.sign(ez) * s * 0.7 : 0;
      this.face = Math.sign(p.x - this.x) || this.face;
      if (this.engaged && this.cd <= 0 && Math.abs(p.x - this.x) < d.reach + 10 && Math.abs(p.z - this.z) < 14) {
        this.state = 'windup'; this.t = 0; this.vx = this.vz = 0;
        w.emit('windup', { x: this.x, type: this.type });
      }
      break;
    }
    case 'windup':
      this.vx = this.vz = 0;
      if (this.t >= d.windup) { this.state = 'strike'; this.t = 0; this.struck = false; this.vx = this.face * d.lunge; }
      break;
    case 'strike':
      this.vx *= 0.85;
      if (!this.struck && this.t > 0.04) {
        var ddx = (p.x - this.x) * this.face;
        if (ddx > -8 && ddx < d.reach + 6 && Math.abs(p.z - this.z) < 16 && p.y < 40) {
          this.struck = true;
          p.hurt(w, Math.round(d.dmg * P.enemyDmgMul), this.face, 'enemy');
        }
      }
      if (this.t >= d.strike) { this.state = 'recover'; this.t = 0; this.vx = 0; }
      break;
    case 'recover':
      this.vx = this.vz = 0;
      if (this.t >= d.recover) {
        this.state = 'idle'; this.t = 0; this.engaged = false;
        this.cd = 0.5 + Math.random() * 0.7;
      }
      break;
    case 'hurt':
      this.vx *= 0.82; this.vz = 0;
      if (this.t >= 0.3) { this.state = 'idle'; this.t = 0; this.cd = Math.max(this.cd, 0.25); }
      break;
    case 'air':
      if (this.thrown) w.thrownCollide(this);
      break;
    case 'down':
      this.vx *= 0.8;
      if (this.hp <= 0) {
        this.fade -= dt * 1.6;
        if (this.fade <= 0) { this.state = 'dead'; w.enemyGone(this); }
      } else if (this.t > 0.7) { this.state = 'getup'; this.t = 0; }
      break;
    case 'getup':
      this.vx = 0;
      if (this.t > 0.4) { this.state = 'idle'; this.t = 0; this.cd = 0.5; }
      break;
    case 'grabbed':
      this.vx = this.vz = 0;
      break;
  }

  if (this.state !== 'grabbed' && this.state !== 'lifted') {
    this.x += this.vx * dt;
    this.z = UP.clamp(this.z + this.vz * dt, 4, UP.ZMAX - 4);
  }
  if (this.state === 'air') {
    this.vy -= UP.P.gravity * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      var wasThrown = this.thrown;
      this.y = 0; this.vy = 0; this.thrown = false;
      this.state = 'down'; this.t = 0;
      w.enemyLanded(this, wasThrown);
    }
  }
  if (this.state !== 'enter' && this.state !== 'pull') {
    var bb = w.bounds();
    this.x = UP.clamp(this.x, bb[0] + 10, bb[1] - 10);
  }
};

UP.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
