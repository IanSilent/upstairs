// The one upstairs, and the machinery it works.
//
// Its mind is hidden but readable: you only ever see a warm light moving behind the cracks and
// which machine starts to glow. The rules (DESIGN.md §3) are fixed and simple:
//   1. If you are hurt (HP below lowHp), it heals you first: the lamp if one is near, else a gift
//      of light through a crack.
//   2. If enemies are around, it picks the machine with the most enemies under it right now
//      (minus a little for distance). The claw always counts as one.
//   3. If nobody is under any machine, it goes to the machine nearest to you and WAITS for someone
//      to step under it (you can lure them there).
//   4. If it is quiet, it opens a closed door nearby, or drops you a gift.
//   5. It never drops a weight on you on purpose: it waits for you to step out first.
// Intent is always good; only the execution can fail (rolled per request):
//   late   — it stumbles on the way, so it arrives late;
//   clumsy — steam spills wide, the weight lands off-target, the claw grabs air;
//   miracle (only after you freed it) — it runs every machine in one sweep.
// After a failure it knocks twice (sorry) and drops a little light for you.
//
// Teamwork that costs no spark:
//   cover    — an enemy winds up behind your back: it knocks sharply and shines on it;
//              hit an enemy while it shines on it and you hit it together (double, knockdown);
//   slam     — throw an enemy into its light and it slams it from above;
//   knocks   — knock on the ceiling (L with no sparks) and it knocks back and comes closer;
//   sluice   — it has its own goal there (the winch) and leads you to it.
//   rescue   — in the dark you are knocked out; it searches, hammers a hole through the solid
//              ceiling a little ahead of you, and heals you once you crawl into its light.
var UP = UP || {};

// ------------------------------------------------------------------ machinery
UP.Mech = function (d) {
  for (var k in d) this[k] = d[k];
  this.state = 'idle';
  this.t = 0;
  this.glow = 0;            // amber highlight 0..1: the machine it is working
  this.busy = false;
  this.done = false;
  this.hits = 0;
  this.hurtPlayer = false;
  this.cx = d.x;            // carriage position (crusher / claw)
  this.cz = d.z || 75;
  this.drop = 0;            // crusher: 0 = raised, 1 = on the floor
  this.depth = 0;           // claw: 0 = up, 1 = on the floor
  this.held = null;
  this.open = 0;            // door
  this.hitIds = [];
};

UP.Mech.prototype.damaging = function () {
  return this.type === 'pipe' || this.type === 'crusher' || this.type === 'claw';
};
UP.Mech.prototype.onRail = function () { return this.x0 !== undefined; };
UP.Mech.prototype.centerX = function () { return this.onRail() ? this.cx : this.x; };
UP.Mech.prototype.inPipe = function (x, wide, at) {
  return Math.abs(x - (at === undefined ? this.centerX() : at)) < (wide ? 110 : 62);
};
// Rail pipe: the best spot along the rail and how many enemies it covers.
UP.Mech.prototype.pipeAim = function (enemies) {
  var m = this, best = null, n = 0;
  enemies.forEach(function (c) {
    if (c.x < m.x0 - 60 || c.x > m.x1 + 60) return;
    var at = UP.clamp(c.x, m.x0, m.x1);
    var k = enemies.filter(function (e) { return m.inPipe(e.x, false, at); }).length;
    if (k > n) { n = k; best = c; }
  });
  return { target: best, n: n };
};
UP.Mech.prototype.inCrush = function (x, z, cx, cz) {
  var dx = (x - cx) / 60, dz = (z - cz) / 30;
  return dx * dx + dz * dz < 1;
};

UP.Mech.prototype.start = function (opts) {
  this.opts = opts || {};
  this.state = this.type === 'claw' ? 'descend' : this.type === 'lamp' ? 'drop' : this.type === 'door' ? 'opening' : 'arming';
  this.t = 0; this.done = false; this.hits = 0; this.hurtPlayer = false; this.hitIds = [];
};

UP.Mech.prototype.update = function (dt, w) {
  var P = UP.P, p = w.player, o = this.opts || {};
  this.t += dt;
  this.glow += ((this.busy ? 1 : 0) - this.glow) * Math.min(1, dt * 6);
  var arm = P.armTime * (o.fast ? 0.45 : 1);

  switch (this.type) {
    case 'pipe':
      if (this.state === 'arming') {
        if (o.track && o.track.alive() && this.t < arm * 0.6) this.cx += UP.clamp(UP.clamp(o.track.x, this.x0, this.x1) - this.cx, -5, 5);
        if (Math.random() < 0.4) w.puff(this.centerX() + (Math.random() - 0.5) * 8, UP.CEIL_Y + 44, 'drip');
        if (this.t >= arm) { this.state = 'steam'; this.t = 0; w.emit('steam', { x: this.centerX(), wide: o.wide }); }
      } else if (this.state === 'steam') {
        var wide = o.wide;
        for (var i = 0; i < w.enemies.length; i++) {
          var e = w.enemies[i];
          if (!e.alive() || e.state === 'grabbed' || this.hitIds.indexOf(e.id) >= 0) continue;
          if (this.inPipe(e.x, wide)) {
            this.hitIds.push(e.id); this.hits++;
            var dir = o.pushDir || (Math.sign(e.x - this.centerX()) || 1);
            w.hitEnemy(e, P.steamDmg, { knock: true, dir: dir, src: 'npc', power: o.pushDir ? 1.6 : 1 });
          }
        }
        if (wide && !this.hurtPlayer && this.inPipe(p.x, true) && this.t > 0.15) {
          this.hurtPlayer = p.hurt(w, P.clumsyDmg, Math.sign(p.x - this.centerX()) || 1, 'npc') || this.hurtPlayer;
        }
        for (var s = 0; s < 4; s++) w.puff(this.centerX() + (Math.random() - 0.5) * (wide ? 200 : 100), UP.CEIL_Y + 40 + Math.random() * 300, 'steam');
        if (this.t > 1.0) { this.state = 'idle'; this.done = true; }
      }
      break;

    case 'crusher':
      if (this.state === 'arming') {
        if (o.track && o.track.alive() && this.t < arm * 0.6) {
          this.cx += UP.clamp(UP.clamp(o.track.x, this.x0, this.x1) - this.cx, -6, 6);
          this.cz += UP.clamp(o.track.z - this.cz, -3, 3);
        }
        if (this.t >= arm) {
          // Careful drops hold while you are under the weight, and give up rather than hit you.
          if (o.careful && this.inCrush(p.x, p.z, this.cx, this.cz)) {
            o.holdT = (o.holdT || 0) + dt;
            if (o.holdT > P.safeWait) { this.state = 'idle'; this.done = true; this.cancelled = true; }
          } else { this.state = 'falling'; this.t = 0; }
        }
      } else if (this.state === 'falling') {
        this.drop = Math.min(1, this.t / 0.16);
        if (this.drop >= 1) {
          this.state = 'down'; this.t = 0;
          for (var j = 0; j < w.enemies.length; j++) {
            var en = w.enemies[j];
            if (!en.alive() || en.state === 'grabbed') continue;
            if (this.inCrush(en.x, en.z, this.cx, this.cz)) {
              this.hits++;
              w.hitEnemy(en, P.crushDmg, { knock: true, dir: Math.sign(en.x - this.cx) || 1, src: 'npc', power: 0.7 });
            }
          }
          if (!o.careful && this.inCrush(p.x, p.z, this.cx, this.cz) && p.y < 60) {
            // Clumsy drops only: careful ones wait for you to step out, and if you step in during
            // the last 0.16 s of the fall, it still misses you (rule 5 is absolute).
            this.hurtPlayer = p.hurt(w, P.clumsyDmg, Math.sign(p.x - this.cx) || 1, 'npc') || this.hurtPlayer;
          }
          w.emit('crush', { x: this.cx, z: this.cz });
        }
      } else if (this.state === 'down') {
        if (this.t > 0.7) { this.state = 'raise'; this.t = 0; }
      } else if (this.state === 'raise') {
        this.drop = Math.max(0, 1 - this.t / 0.7);
        if (this.drop <= 0) { this.state = 'idle'; this.done = true; }
      }
      break;

    case 'claw':
      if (this.state === 'descend') {
        this.depth = Math.min(1, this.t / (o.slow ? 0.7 : 0.42));
        if (this.depth >= 1) {
          this.state = 'ascend'; this.t = 0;
          var best = null, bd = 1e9;
          for (var k = 0; k < w.enemies.length; k++) {
            var c = w.enemies[k];
            if (!c.alive() || c.state === 'grabbed' || c.state === 'enter') continue;
            var dx = Math.abs(c.x - this.cx), dz = Math.abs(c.z - this.cz);
            if (dx < 30 + c.def.w * 0.4 && dz < 20 && dx + dz < bd) { bd = dx + dz; best = c; }
          }
          if (best) {
            this.hits = 1;
            if (best.def.armor) {
              this.held = best; best.state = 'lifted'; best.liftDrop = true;
            } else {
              this.held = best; best.state = 'lifted';
              w.killEnemy(best);
            }
            w.emit('clawGrab', { x: this.cx });
          } else {
            w.emit('clawMiss', { x: this.cx });
          }
        }
      } else if (this.state === 'ascend') {
        this.depth = Math.max(0, 1 - this.t / 0.65);
        var h = this.held;
        if (h) {
          h.x = this.cx; h.z = this.cz; h.y = (1 - this.depth) * 300;
          if (h.liftDrop && this.depth < 0.6) {
            // Too heavy: it slips out of the claw and lands hard.
            h.liftDrop = false; h.state = 'air'; h.vy = 0; h.vx = 0;
            w.hitEnemy(h, 20, { knock: true, dir: 1, src: 'npc', power: 0.3, force: true });
            this.held = null;
          }
        }
        if (this.depth <= 0) {
          if (this.held) { this.held.state = 'dead'; w.enemyGone(this.held); this.held = null; }
          this.state = 'idle'; this.done = true;
        }
      }
      break;

    case 'lamp':
      if (this.state === 'drop' && this.t > 0.35) {
        var off = o.clumsy ? (Math.sign(this.x - p.x) || 1) * 170 : 0;
        w.spawnPickup('heal', this.x, 80, { amount: P.lampHeal, fromY: 230, tx: p.x + off, tz: p.z, big: true });
        w.emit('lamp', { x: this.x });
        this.state = 'idle'; this.done = true;
      }
      break;

    case 'door':
      if (this.state === 'opening') {
        var jam = o.clumsy ? 1.2 : 0;
        if (o.clumsy && !this.knocked && this.t > 0.5) { this.knocked = true; w.emit('knock', { x: this.x, n: 2, soft: false }); }
        if (this.t > jam) this.open = Math.min(1, this.open + dt / 0.9);
        if (this.open >= 1) {
          this.state = 'open';
          this.done = true;
          for (var q = 0; q < this.contents.length; q++) {
            var it = this.contents[q];
            w.spawnPickup(it[0], this.x + (q ? 24 : -24), 14, { amount: it[1] });
          }
          w.emit('doorOpen', { x: this.x });
        }
      }
      break;
  }
};

// ------------------------------------------------------------------ the one upstairs
UP.Npc = function (w) {
  this.w = w;
  this.x = UP.LEVEL.npcStart;
  this.vx = 0;
  this.state = 'arrive';
  this.t = 0;
  this.pending = 0;          // sparks received and not yet answered
  this.sparkX = 0;
  this.plan = null;
  this.bond = 0;             // grows with every good moment; the light gets warmer and wider
  this.worry = 0;
  this.joy = 0;
  this.sorry = 0;
  this.stepT = 0;
  this.tapCd = 8;
  this.knockT = 0;
  this.captured = false;
  this.freed = false;
  this.log = [];
  this.spotCd = 4;
  this.spotTarget = null;
  this.stompCd = 0;
  this.answerT = 0;
  this.answerN = 1;
  this.knockBond = 0;
  this.leadKnockT = 0.6;
  this.blockedSaid = false;
};

UP.Npc.prototype.say = function (text) {
  this.log.push({ t: this.w.t, text: text });
  if (this.log.length > 14) this.log.shift();
};

UP.Npc.prototype.setState = function (s) { this.state = s; this.t = 0; };

UP.Npc.prototype.moveTo = function (tx, speed, dt) {
  var dx = tx - this.x;
  var step = speed * dt;
  if (Math.abs(dx) <= step) { this.vx = dx / dt * 0.5; this.x = tx; return true; }
  this.vx = Math.sign(dx) * speed;
  this.x += this.vx * dt;
  return false;
};

UP.Npc.prototype.available = function () {
  return this.state !== 'stuck' && this.state !== 'arrive';
};

// A spark came up through the ceiling at x.
UP.Npc.prototype.receive = function (x) {
  if (this.state === 'lead' || this.state === 'winch') {
    this.say('Занят шлюзом — искру возвращает');
    this.w.spawnPickup('spark', x + 30, 10, { fromY: 240 });
    this.w.emit('reject', { x: this.x });
    return;
  }
  if (this.state === 'stuck') {
    this.say('Держат за верёвку — не может взять искру, возвращает её');
    this.w.spawnPickup('spark', x + 30, 10, { fromY: 240 });
    this.w.emit('reject', { x: this.x });
    return;
  }
  this.pending++;
  this.sparkX = x;
  if (this.state === 'follow' || this.state === 'arrive') this.setState('fetch');
};

UP.Npc.prototype.update = function (dt) {
  var w = this.w, p = w.player, P = UP.P;
  this.t += dt;
  this.vx = 0;
  this.worry = Math.max(0, this.worry - dt * 0.6);
  this.joy = Math.max(0, this.joy - dt * 0.7);
  this.sorry = Math.max(0, this.sorry - dt * 0.5);
  this.tapCd -= dt;
  this.spotCd -= dt;
  this.stompCd -= dt;
  var prevX = this.x;
  if (this.answerT > 0) {
    this.answerT -= dt;
    if (this.answerT <= 0) w.emit('knock', { x: this.x, n: this.answerN, soft: false, answer: true });
  }

  switch (this.state) {
    case 'arrive':
      if (this.t > 1.0 && this.moveTo(p.x - 40, P.npcWalk, dt)) this.setState('follow');
      if (this.t > 1.0 && Math.abs(p.x - this.x) < 60) this.setState('follow');
      break;

    case 'follow': {
      var tx = p.x - 34 * p.face;
      if (Math.abs(tx - this.x) > 26) this.moveTo(tx, P.npcWalk * (this.worry > 0.2 ? 1.7 : 1) * (Math.abs(tx - this.x) > 300 ? 2 : 1), dt);
      if (this.pending > 0) this.setState('fetch');
      // Quiet presence: if you stand still for a while, it taps once.
      if (p.idleT > 4.5 && this.tapCd <= 0) { this.tapCd = 12; w.emit('knock', { x: this.x, n: 1, soft: true }); }
      var rope = w.rope;
      if (!this.captured && rope && rope.armed && p.x > rope.captureAt) {
        this.captured = true;
        this.say('Убежал вперёд…');
        this.setState('runAhead');
        break;
      }
      var z = w.puzzle;
      if (z && !z.solved && p.x > z.def.zoneX && p.x < z.def.gateX + 40) { this.setState('lead'); break; }
      this.watchFight(dt);
      break;
    }

    case 'spot': {
      // Shining on one enemy. While the light is on it, your hit lands together with its.
      var e = this.spotTarget;
      if (!e || !e.alive() || e.state === 'enter' || this.t > 2.6 || this.pending > 0) { this.spotTarget = null; this.setState(this.pending > 0 ? 'fetch' : 'follow'); break; }
      this.moveTo(e.x, P.npcRun * 1.2, dt);
      if (Math.abs(e.x - this.x) < 30) e.spot = Math.max(e.spot, 0.15);
      break;
    }

    case 'lead': {
      // The sluice: it wants to reach the winch. The hatch stops it unless you stand on the plate.
      var zz = w.puzzle, d = zz.def;
      if (zz.solved) { this.setState('follow'); break; }
      if (p.x < d.zoneX - 160 && this.x < d.hatchX) { this.setState('follow'); break; }
      if (this.pending > 0) { this.pending = 0; }
      var open = zz.hatch >= 0.7;
      if (this.x < d.hatchX && !open) {
        if (!this.blockedSaid && this.x > d.hatchX - 60) { this.blockedSaid = true; this.say('Хочет к вороту, но люк закрыт — стучит в него'); }
        this.moveTo(d.hatchX - 34 + Math.sin(this.t * 2.6) * 12, P.npcWalk, dt);
        this.leadKnockT -= dt;
        if (this.leadKnockT <= 0 && this.x > d.hatchX - 70) {
          this.leadKnockT = 2.4;
          w.emit('knock', { x: d.hatchX - 10, n: 2, soft: false });
          w.emit('bump', { x: d.hatchX });
        }
      } else if (this.moveTo(d.winchX, P.npcRun, dt)) {
        zz.npcAtWinch = true;
        this.setState('winch');
        this.say('Добрался до ворота. Один не поднимет — зовёт к цепи');
        w.emit('winchStart', { x: d.winchX });
      }
      break;
    }

    case 'frantic': {
      // Right above you, but the ceiling here is solid. It runs back and forth.
      this.moveTo(p.x + Math.sin(this.t * 4.5) * 90, P.npcRun * 1.2, dt);
      this.knockT -= dt;
      if (this.knockT <= 0) { this.knockT = 0.5 + Math.random() * 0.3; w.emit('knock', { x: this.x, n: 3, soft: false, distress: true }); }
      if (this.t > 1.7) {
        var D = w.ko.def;
        this.holeX = UP.clamp(p.x + D.holeOffset, D.holeMin, D.holeMax);
        this.holeZ = UP.clamp(p.z, 30, 120);
        this.say('Потолок глухой. Бежит чуть вперёд — будет пробивать');
        this.setState('toHole');
      }
      break;
    }

    case 'toHole':
      if (this.moveTo(this.holeX, P.npcRun * 1.3, dt)) { this.setState('hammer'); this.hits = 0; this.knockT = 0.15; }
      break;

    case 'hammer':
      this.x = this.holeX + Math.sin(w.t * 30) * 2;
      this.knockT -= dt;
      if (this.knockT <= 0) {
        this.knockT = 0.36;
        this.hits++;
        w.emit('knock', { x: this.x, n: 1, soft: false, hammer: true });
        w.burst(this.x + (Math.random() - 0.5) * 30, UP.CEIL_Y, 'dust', 6 + this.hits * 2);
        w.shake = Math.max(w.shake, 0.25 + this.hits * 0.05);
        if (this.hits >= 7) {
          w.breakCeiling(this.holeX, this.holeZ);
          this.say('Пробил потолок. Свет вниз — ползи сюда');
          this.setState('beacon');
          this.knockT = 1.2;
        }
      }
      break;

    case 'beacon':
    case 'healGlow':
      // Stays at the hole. Knocks softly now and then: here.
      this.x = this.holeX;
      this.knockT -= dt;
      if (this.state === 'beacon' && this.knockT <= 0) { this.knockT = 1.5; w.emit('knock', { x: this.x, n: 2, soft: false }); }
      break;

    case 'winch': {
      var zw = w.puzzle;
      this.x = zw.def.winchX + Math.sin(w.t * 9) * 2;
      this.vx = 0;
      this.leadKnockT -= dt;
      if (this.leadKnockT <= 0 && zw.gate < 0.35) {
        this.leadKnockT = 1.8;
        w.emit('knock', { x: zw.def.chain.x, n: 3, soft: false });
      }
      break;
    }

    case 'runAhead':
      if (this.moveTo(w.rope.x, P.npcRun * 0.9, dt)) {
        if (w.rope.pullersLeft() > 0) {
          w.rope.state = 'taut';
          this.setState('stuck');
          this.say('Попал в петлю. Двое тянут верёвку вниз');
          w.emit('snare', { x: this.x });
        } else { this.setState('follow'); }
      }
      break;

    case 'fetch':
      if (this.moveTo(this.sparkX, P.npcRun, dt)) { this.setState('think'); w.emit('catch', { x: this.x }); }
      break;

    case 'think':
      if (this.t >= P.thinkTime) {
        this.pending--;
        this.plan = this.decide();
        this.say(this.plan.reason + (this.plan.flaw !== 'clean' ? '  [' + UP.FLAW_RU[this.plan.flaw] + ']' : ''));
        w.stats.requests++;
        this.beginPlan(this.plan);
      }
      break;

    case 'go': {
      var pl = this.plan.kind === 'miracle' ? this.plan.cur : this.plan, gx = this.goalX(this.plan);
      if (pl.flaw === 'late' && !pl.faltered && Math.abs(gx - this.x) < Math.abs(gx - pl.fromX) * 0.55) {
        pl.faltered = true; this.plan.falterT = 0.9 + Math.random() * 0.6;
        this.setState('falter'); w.emit('stumble', { x: this.x });
        break;
      }
      if (this.moveTo(gx, P.npcRun * (pl.fast ? 1.7 : 1), dt)) { this.setState('work'); pl.phase = 'start'; pl.t = 0; }
      break;
    }

    case 'falter':
      this.worry = Math.max(this.worry, 0.3);
      if (this.t > this.plan.falterT) this.setState('go');
      break;

    case 'work': {
      var r = this.work(this.plan, dt);
      if (r) this.finish(this.plan, r);
      break;
    }

    case 'react':
      if (this.t > 0.6) this.setState(this.pending > 0 ? 'think' : 'follow');
      break;

    case 'stuck':
      this.x = w.rope.x + Math.sin(w.t * 23) * 3;
      this.knockT -= dt;
      if (this.knockT <= 0) {
        this.knockT = 0.7 + Math.random() * 0.8;
        w.emit('knock', { x: this.x, n: 3, soft: false, distress: true });
      }
      if (w.rope.pullersLeft() === 0) {
        this.freed = true;
        w.rope.state = 'free';
        this.bond += 2; this.joy = 1.5;
        this.say('Свободен. Спасибо — искра и свет вниз');
        w.stats.freed = true;
        w.emit('freed', { x: this.x });
        w.spawnPickup('spark', p.x + 40 * p.face, p.z, { fromY: 240 });
        w.spawnPickup('heal', p.x - 30 * p.face, p.z, { amount: P.giftHeal, fromY: 240 });
        this.setState('react');
      }
      break;

    case 'reveal':
      this.moveTo(p.x, P.npcWalk, dt);
      break;
  }

  // The closed hatch is a wall up there.
  var zh = w.puzzle;
  if (zh && !zh.solved && zh.hatch < 0.7) {
    if (prevX < zh.def.hatchX) this.x = Math.min(this.x, zh.def.hatchX - 22);
    else this.x = Math.max(this.x, zh.def.hatchX + 22);
  }

  // Footsteps (heard, not seen). Faster and heavier when it runs.
  var sp = Math.abs(this.vx);
  if (sp > 20) {
    this.stepT -= dt * Math.max(1, sp / 200);
    if (this.stepT <= 0) {
      this.stepT = 0.3;
      w.emit('step', { x: this.x, run: sp > 320 });
      if (Math.random() < 0.5) w.puff(this.x + (Math.random() - 0.5) * 30, UP.CEIL_Y - 2, 'dust');
    }
  }
};

UP.FLAW_RU = { clean: 'чисто', late: 'замешкался', clumsy: 'неуклюже', miracle: 'чудо' };

UP.Npc.prototype.rollFlaw = function () {
  var w = this.w, P = UP.P, a = w.arena;
  var hasEnemies = w.enemies.some(function (e) { return e.alive() && e.state !== 'pull' && Math.abs(e.x - w.player.x) < 900; });
  if (a && hasEnemies && !a.scriptUsed) {
    var s = a.def.script;
    if (s === 'firstClean') { a.scriptUsed = true; return 'cleanSure'; }
    if (s === 'clumsyOnce') { a.scriptUsed = true; return 'clumsy'; }
    if (s === 'miracleOnce' && this.freed) { a.scriptUsed = true; return 'miracle'; }
  }
  if (this.freed && hasEnemies && Math.random() < P.miracleChance) return 'miracle';
  var r = Math.random();
  if (r < P.clumsyChance) return 'clumsy';
  if (r < P.clumsyChance + P.lateChance) return 'late';
  return 'clean';
};

// The readable mind. Returns a plan: {kind, mech, flaw, reason, ...}.
UP.Npc.prototype.decide = function () {
  var w = this.w, p = w.player, P = UP.P, self = this;
  var flaw = this.rollFlaw();
  var waitMul = 1;
  if (flaw === 'cleanSure') { flaw = 'clean'; waitMul = 2.5; }
  var enemies = w.enemies.filter(function (e) { return e.present() && Math.abs(e.x - p.x) < 700; });
  // Enemies still walking in count as "not quiet" (they are just not under anything yet).
  var threat = w.enemies.some(function (e) { return e.alive() && e.state !== 'grabbed' && Math.abs(e.x - p.x) < 900; });
  var near = w.mechs.filter(function (m) { return Math.abs(m.centerX() - p.x) < 650 || (m.x0 !== undefined && p.x > m.x0 - 200 && p.x < m.x1 + 200); });
  var hpPct = Math.round(100 * p.hp / P.maxHp);
  // A scripted miracle that cannot happen right now is kept for the next request.
  var unMiracle = function () {
    if (flaw !== 'miracle') return;
    flaw = 'clean';
    if (w.arena && w.arena.def.script === 'miracleOnce') w.arena.scriptUsed = false;
  };
  var mk = function (kind, mech, reason, extra) {
    var o = { kind: kind, mech: mech, flaw: flaw, reason: reason, fromX: self.x, retries: 1, waitMax: P.waitMax * waitMul };
    for (var k in extra || {}) o[k] = extra[k];
    return o;
  };

  // 1. You are hurt: heal first.
  if (p.hp < P.lowHp * P.maxHp) {
    var lamp = near.filter(function (m) { return m.type === 'lamp' && m.state === 'idle'; })[0];
    unMiracle();
    if (lamp) return mk('lamp', lamp, 'Игроку плохо (HP ' + hpPct + '%) → лампа рядом: большое лечение');
    return mk('gift', null, 'Игроку плохо (HP ' + hpPct + '%) → свет сквозь щель');
  }

  // 4. Quiet: a door, or a gift.
  if (!threat) {
    unMiracle();
    var door = w.mechs.filter(function (m) { return m.type === 'door' && m.state === 'idle' && Math.abs(m.x - p.x) < 700; })[0];
    if (door) return mk('door', door, 'Тихо, рядом закрытая дверь → открывает');
    return mk('gift', null, 'Тихо → просто дарит свет');
  }

  var dmg = near.filter(function (m) { return m.damaging() && m.state === 'idle'; });
  if (!dmg.length) {
    unMiracle();
    return mk('gift', null, 'Враги есть, но механизмов рядом нет → хотя бы свет');
  }

  // Miracle: every machine in one sweep, nearest first.
  if (flaw === 'miracle' && dmg.length >= 2) {
    var all = near.filter(function (m) { return m.state === 'idle' && m.type !== 'door'; });
    all.sort(function (a, b) { return Math.abs(a.centerX() - self.x) - Math.abs(b.centerX() - self.x); });
    var crusher = all.filter(function (m) { return m.type === 'crusher'; })[0];
    var steps = all.map(function (m) {
      return mk(m.type, m, '', { fast: true, waitMax: 0, flaw: 'clean', pushDir: crusher && m.type === 'pipe' ? (Math.sign(crusher.cx - m.x) || 1) : 0 });
    });
    return mk('miracle', null, 'Все механизмы разом: ' + all.map(function (m) { return UP.MECH_RU[m.type]; }).join(' → '), { steps: steps, idx: -1 });
  }
  unMiracle();

  // 2. The machine with the most enemies under it right now.
  var best = null;
  dmg.forEach(function (m) {
    var s = 0, target = null, n = 0;
    if (m.type === 'pipe' && m.onRail()) {
      var aim = m.pipeAim(enemies); n = aim.n; target = aim.target; s = n;
    } else if (m.type === 'pipe') {
      n = enemies.filter(function (e) { return m.inPipe(e.x); }).length; s = n;
    } else if (m.type === 'crusher') {
      enemies.forEach(function (c) {
        if (c.x < m.x0 - 50 || c.x > m.x1 + 50) return;
        var cx = UP.clamp(c.x, m.x0, m.x1);
        var k = enemies.filter(function (e) { return m.inCrush(e.x, e.z, cx, c.z); }).length;
        if (k > n) { n = k; target = c; }
      });
      s = n * 1.2;
    } else if (m.type === 'claw') {
      var cand = enemies.filter(function (e) { return e.x > m.x0 - 20 && e.x < m.x1 + 20; });
      cand.sort(function (a, b) { return Math.abs(a.x - p.x) - Math.abs(b.x - p.x); });
      cand.sort(function (a, b) { return (a.def.armor ? 1 : 0) - (b.def.armor ? 1 : 0); });
      if (cand.length) { target = cand[0]; n = 1; s = target.def.armor ? 0.6 : 0.9; }
    }
    s -= Math.abs(m.centerX() - self.x) / 1500;
    if (n > 0 && (!best || s > best.s)) best = { m: m, s: s, n: n, target: target };
  });
  if (best) {
    var why = best.m.type === 'pipe' ? 'Под трубой врагов: ' + best.n + ' → пар'
      : best.m.type === 'crusher' ? 'Кучка из ' + best.n + ' у груза → груз'
      : 'Ближайший к игроку под рельсом → клешня';
    return mk(best.m.type, best.m, why, { target: best.target });
  }

  // 3. Nobody under anything: wait in ambush at the machine nearest to you.
  var amb = dmg.filter(function (m) { return m.type !== 'claw'; });
  amb.sort(function (a, b) { return Math.abs(a.centerX() - p.x) - Math.abs(b.centerX() - p.x); });
  if (amb.length) {
    return mk(amb[0].type, amb[0], 'Никого под механизмами → ждёт у «' + UP.MECH_RU[amb[0].type] + '», пока кто-то зайдёт', { ambush: true });
  }
  return mk('gift', null, 'Не во что целиться → хотя бы свет');
};

UP.MECH_RU = { pipe: 'трубы', crusher: 'груза', claw: 'клешни', lamp: 'лампы', door: 'двери' };

UP.Npc.prototype.beginPlan = function (pl) {
  pl.fromX = this.x;
  if (pl.kind === 'miracle') { this.nextStep(pl); return; }
  if (pl.mech) pl.mech.busy = true;
  this.setState('go');
};

UP.Npc.prototype.nextStep = function (pl) {
  pl.idx++;
  if (pl.idx >= pl.steps.length) { this.finish(pl, { hits: pl.totalHits || 0, hurt: false, ok: true }); return; }
  var s = pl.steps[pl.idx];
  s.fromX = this.x;
  s.mech.busy = true;
  pl.cur = s;
  this.setState('go');
};

UP.Npc.prototype.goalX = function (pl) {
  if (pl.kind === 'miracle') pl = pl.cur;
  if (pl.kind === 'gift') return this.w.player.x;
  return pl.mech.centerX();
};

// Runs one plan step; returns a result {hits, hurt, ok} when finished, else null.
UP.Npc.prototype.work = function (pl, dt) {
  if (pl.kind === 'miracle') {
    var r = this.work(pl.cur, dt);
    if (r) {
      pl.totalHits = (pl.totalHits || 0) + r.hits;
      pl.cur.mech.busy = false;
      this.nextStep(pl);
    }
    return null;
  }
  var w = this.w, p = w.player, P = UP.P, m = pl.mech;
  pl.t = (pl.t || 0) + dt;
  var clumsy = pl.flaw === 'clumsy';
  var present = w.enemies.filter(function (e) { return e.present(); });

  switch (pl.kind) {
    case 'gift':
      if (pl.phase === 'start') {
        var off = clumsy ? (Math.random() < 0.5 ? -1 : 1) * 150 : 20 * p.face;
        w.spawnPickup('heal', p.x + off, UP.clamp(p.z + (clumsy ? 30 : 0), 10, 140), { amount: P.giftHeal, fromY: 240 });
        w.emit('gift', { x: this.x });
        pl.phase = 'wait';
      }
      return pl.t > 0.3 ? { hits: 0, hurt: false, ok: true } : null;

    case 'lamp':
    case 'door':
      if (pl.phase === 'start') { m.start({ clumsy: clumsy }); pl.phase = 'run'; }
      if (m.done) return { hits: 0, hurt: false, ok: true };
      return null;

    case 'pipe':
      if (m.onRail() && pl.phase === 'start') {
        // A pipe on a rail: it slides the pipe over the crowd, then lets the steam go.
        if (!pl.target || !pl.target.present()) pl.target = m.pipeAim(present).target;
        if (!pl.target) {
          if (pl.t > pl.waitMax || pl.fast) { m.start({ wide: clumsy, fast: pl.fast }); pl.phase = 'run'; }
          return null;
        }
        pl.phase = 'drag';
      }
      if (pl.phase === 'drag') {
        if (!pl.target.present()) { pl.target = m.pipeAim(present).target; if (!pl.target) { pl.phase = 'start'; return null; } }
        var px = UP.clamp(pl.target.x, m.x0, m.x1);
        var ps = P.npcRun * (pl.fast ? 1.7 : 0.8) * dt;
        m.cx += UP.clamp(px - m.cx, -ps, ps);
        this.x = m.cx;
        this.vx = Math.abs(px - m.cx) > 2 ? 200 : 0;
        if (Math.abs(px - m.cx) < 4) {
          m.start({ wide: clumsy, pushDir: pl.pushDir, fast: pl.fast, track: clumsy || pl.flaw === 'late' ? null : pl.target });
          pl.phase = 'run';
        }
        return null;
      }
      if (pl.phase === 'start') {
        var under = present.filter(function (e) { return m.inPipe(e.x); }).length;
        if (under > 0 || pl.t > pl.waitMax || pl.fast) {
          m.start({ wide: clumsy, pushDir: pl.pushDir, fast: pl.fast });
          pl.phase = 'run';
          if (!under && !pl.fast) this.say('Никто не зашёл — пускает пар всё равно');
        }
        return null;
      }
      return m.done ? { hits: m.hits, hurt: m.hurtPlayer } : null;

    case 'crusher': {
      if (pl.phase === 'start') {
        // Choose where to drop: the target (or the best cluster now), clamped to the gantry.
        var t = pl.target && pl.target.present() ? pl.target : null;
        if (!t) {
          var bestN = 0;
          present.forEach(function (c) {
            var cx = UP.clamp(c.x, m.x0, m.x1);
            var k = present.filter(function (e) { return m.inCrush(e.x, e.z, cx, c.z); }).length;
            if (k > bestN) { bestN = k; t = c; }
          });
        }
        if (!t) {
          if (pl.t > pl.waitMax || pl.fast) return { hits: 0, hurt: false };
          return null; // ambush: wait for someone
        }
        pl.target = t;
        pl.phase = 'drag';
      }
      if (pl.phase === 'drag') {
        var tx = UP.clamp(pl.target.x, m.x0, m.x1), tz = pl.target.z;
        if (clumsy) { var s = Math.sign(p.x - tx) || 1; tx = UP.clamp(tx + s * 46, m.x0, m.x1); tz += (p.z - tz) * 0.5; }
        var spd = P.npcRun * (pl.fast ? 1.7 : 0.8) * dt;
        m.cx += UP.clamp(tx - m.cx, -spd, spd);
        m.cz += UP.clamp(tz - m.cz, -spd * 0.5, spd * 0.5);
        this.x = m.cx;
        this.vx = Math.abs(tx - m.cx) > 2 ? 200 : 0;
        if (Math.abs(tx - m.cx) < 3 && Math.abs(tz - m.cz) < 3) { pl.phase = 'safe'; pl.safeT = 0; }
        return null;
      }
      if (pl.phase === 'safe') {
        // Rule 5: never on purpose. A clumsy drop simply doesn't check.
        if (!clumsy && m.inCrush(p.x, p.z, m.cx, m.cz)) {
          pl.safeT += dt;
          if (pl.safeT > P.safeWait) {
            this.say('Игрок под грузом — не рискует, вместо этого свет');
            pl.kind = 'gift'; pl.phase = 'start'; pl.t = 0; m.busy = false;
          }
          return null;
        }
        m.cancelled = false;
        m.start({ track: clumsy || pl.flaw === 'late' ? null : pl.target, fast: pl.fast, careful: !clumsy });
        pl.phase = 'run';
        return null;
      }
      if (m.done && m.cancelled) {
        this.say('Игрок встал под груз — не роняет, вместо этого свет');
        pl.kind = 'gift'; pl.phase = 'start'; pl.t = 0; m.busy = false;
        return null;
      }
      return m.done ? { hits: m.hits, hurt: m.hurtPlayer } : null;
    }

    case 'claw': {
      if (pl.phase === 'start') {
        if (!pl.target || !pl.target.present()) {
          var cand = present.filter(function (e) { return e.x > m.x0 - 20 && e.x < m.x1 + 20; });
          cand.sort(function (a, b) { return Math.abs(a.x - p.x) - Math.abs(b.x - p.x); });
          pl.target = cand[0];
        }
        if (!pl.target) return { hits: 0, hurt: false };
        pl.phase = 'drag';
      }
      if (pl.phase === 'drag') {
        var gx = UP.clamp(pl.target.x, m.x0, m.x1);
        var sp = P.npcRun * (pl.fast ? 1.7 : 0.9) * dt;
        m.cx += UP.clamp(gx - m.cx, -sp, sp);
        this.x = m.cx;
        this.vx = Math.abs(gx - m.cx) > 2 ? 220 : 0;
        if (Math.abs(gx - m.cx) < 6 || !pl.target.present()) {
          m.cz = pl.target.z;
          if (clumsy) { m.cx += (Math.random() < 0.5 ? -1 : 1) * 48; m.cx = UP.clamp(m.cx, m.x0, m.x1); }
          m.start({ slow: pl.flaw === 'late' });
          pl.phase = 'run';
        }
        return null;
      }
      if (m.done) {
        if (!m.hits && pl.retries > 0) {
          pl.retries--; pl.target = null; pl.phase = 'start'; clumsy = false; pl.flaw = 'clean';
          this.say('Промахнулся клешнёй — пробует ещё раз');
          m.done = false;
          return null;
        }
        return { hits: m.hits, hurt: false, retried: pl.retries === 0 };
      }
      return null;
    }
  }
  return { hits: 0, hurt: false };
};

UP.Npc.prototype.finish = function (pl, r) {
  var w = this.w, P = UP.P, p = w.player;
  if (pl.mech) pl.mech.busy = false;
  var good = (r.ok || r.hits > 0) && !r.hurt;
  if (pl.kind === 'miracle') {
    good = true;
    w.emit('miracle', { x: this.x });
    this.bond += 2;
  }
  if (good) {
    this.joy = 1; this.bond += 1;
    w.stats.good++;
    w.emit('chime', { x: this.x, big: pl.kind === 'miracle' });
    this.say('  ✓ ' + (r.hits ? 'попаданий: ' + r.hits : 'получилось'));
  } else {
    this.sorry = 1;
    w.stats.flawed++;
    if (r.hurt) w.stats.npcHurtPlayer++;
    if (r.hurt && pl.flaw !== 'clumsy') w.stats.cleanHurt = (w.stats.cleanHurt || 0) + 1;  // must stay 0 (rule 5)
    w.emit('knock', { x: this.x, n: 2, soft: true, sorry: true });
    w.spawnPickup('heal', p.x + 26 * p.face, p.z, { amount: Math.round(P.giftHeal * 0.6), fromY: 240 });
    this.say('  ✗ ' + (r.hurt ? 'задел игрока' : 'мимо') + ' → два тихих стука и немного света');
  }
  this.plan = null;
  this.setState('react');
};

// ------------------------------------------------------------------ teamwork without sparks
// Called from 'follow' during fights: cover your back, or point at the one worth hitting.
UP.Npc.prototype.watchFight = function (dt) {
  var w = this.w, p = w.player;
  if (this.spotCd > 0) return;
  var behind = null, bestD = 1e9;
  for (var i = 0; i < w.enemies.length; i++) {
    var e = w.enemies[i];
    if (e.state !== 'windup') continue;
    var dx = e.x - p.x;
    if (Math.sign(dx) === -p.face && Math.abs(dx) < 150 && Math.abs(e.z - p.z) < 30 && Math.abs(dx) < bestD) { bestD = Math.abs(dx); behind = e; }
  }
  if (behind) {
    this.spotTarget = behind; this.spotCd = 3;
    this.setState('spot');
    this.say('Сзади замахиваются → резкий стук и свет на него');
    w.emit('knock', { x: this.x, n: 2, soft: false, warn: true });
    return;
  }
  // Now and then, in a real fight, it points out the one worth hitting (the heavy first).
  var engaged = w.enemies.filter(function (e) { return e.engaged && e.alive() && e.state !== 'enter'; });
  if (engaged.length >= 2 && Math.random() < dt * 0.3) {
    var heavy = w.enemies.filter(function (e) { return e.def.armor && e.alive() && e.state !== 'enter' && Math.abs(e.x - p.x) < 400; })[0];
    var t = heavy || engaged[Math.floor(Math.random() * engaged.length)];
    this.spotTarget = t; this.spotCd = 6;
    this.setState('spot');
    this.say('Подсвечивает ' + (heavy ? (heavy.type === 'brute' ? 'того, из темноты' : 'тяжёлого') : 'одного из нападающих') + ' — бей вместе');
  }
};

UP.Npc.prototype.together = function (e) {
  this.joy = Math.max(this.joy, 1);
  this.bond += 0.5;
  this.spotTarget = null;
  if (this.state === 'spot') this.setState('follow');
  this.say('  ✦ ударили вместе');
};

// A thrown enemy landed. If it landed in its light, it slams it from above.
UP.Npc.prototype.maybeStomp = function (e) {
  var w = this.w;
  if (this.stompCd > 0 || e.hp <= 0 || !e.alive()) return;
  if (this.state !== 'follow' && this.state !== 'spot') return;
  if (Math.abs(e.x - this.x) > 75) return;
  this.stompCd = 3;
  this.joy = Math.max(this.joy, 0.7);
  this.bond += 0.25;
  w.stats.together++;
  w.emit('stomp', { x: e.x, z: e.z });
  w.hitEnemy(e, 14, { knock: true, dir: Math.sign(e.x - this.x) || 1, src: 'npc', power: 0.25 });
  this.say('  ✦ бросил врага в мой свет → добиваю сверху');
};

// You knocked on the ceiling.
UP.Npc.prototype.hearKnock = function (x) {
  var w = this.w;
  if (this.state === 'stuck') { this.knockT = 0.1; return; }
  if (this.state === 'lead' && w.puzzle && w.puzzle.hatch < 0.7) {
    this.leadKnockT = 0.3;  // "here — this is the problem"
    return;
  }
  this.answerT = 0.35;
  this.answerN = this.bond >= 3 ? 2 : 1;
  this.joy = Math.max(this.joy, 0.5);
  this.worry = Math.max(this.worry, 0.5);   // hurries to you
  if (this.knockBond < 1) { this.knockBond += 0.25; this.bond += 0.25; }
};

UP.Npc.prototype.heave = function () {
  this.joy = Math.max(this.joy, 0.5);
  this.w.emit('heave', { x: this.x });
};

UP.Npc.prototype.puzzleSolved = function () {
  this.joy = 1.5;
  this.bond += 2;
  this.say('Вместе подняли решётку. Люк теперь открыт с той стороны');
  this.w.emit('chime', { x: this.x, big: true });
  this.leadKnockT = 0.6;
  this.setState('follow');
};

// ------------------------------------------------------------------ the dark: knockout and rescue
UP.Npc.prototype.alarm = function () {
  // It hears it coming a moment too late.
  this.worry = 1;
  this.w.emit('knock', { x: this.x, n: 3, soft: false, warn: true });
  this.say('Слышит, как что-то несётся из темноты — стучит, но поздно');
};

UP.Npc.prototype.startRescue = function () {
  if (this.plan) {
    if (this.plan.mech) this.plan.mech.busy = false;
    if (this.plan.cur && this.plan.cur.mech) this.plan.cur.mech.busy = false;
    this.plan = null;
  }
  this.spotTarget = null;
  this.worry = 1;
  this.knockT = 0.2;
  this.say('Игрока сбили с ног');
  this.setState('frantic');
};

UP.Npc.prototype.rescueHeal = function () {
  this.joy = 1.5;
  this.say('Игрок дополз до света → лечит');
  this.setState('healGlow');
};

UP.Npc.prototype.rescued = function () {
  this.joy = 1.5;
  this.bond += 2;
  this.say('  ✓ поднялся. Ещё и искра в подарок');
  this.w.emit('chime', { x: this.x, big: true });
  this.setState('follow');
};
