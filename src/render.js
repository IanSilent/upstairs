// Canvas2D renderer. Harsh minimalism: near-black room, white you, red-edged black shapes,
// grey machinery — and one warm colour, amber, that belongs only to the one upstairs.
// Its light leaks through the cracks of the ceiling and pools on the floor below it; the machine it
// is working glows amber. That light is the only window into its mind.
var UP = UP || {};

UP.Renderer = function (canvas) {
  this.cv = canvas;
  this.g = canvas.getContext('2d');
  this.time = 0;
  this.shakeX = 0; this.shakeY = 0;
  this.flashes = [];           // short screen-space flashes {x, sy, r, life, max, color}
  this.knockRings = [];        // ring pulses on the ceiling where it knocks
  this.hint = { spark: 0, tossed: false };
  this.crack = UP.Renderer.buildCrack(UP.LEVEL.len + 400);
};

// Deterministic crack geometry along the ceiling: a jagged seam plus scattered holes.
UP.Renderer.buildCrack = function (len) {
  var pts = [], holes = [], seed = 7;
  var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  var y = 78;
  for (var x = -400; x <= len; x += 18) {
    y += (rnd() - 0.5) * 9; y = UP.clamp(y, 58, 98);
    pts.push({ x: x, y: y, w: 1.2 + rnd() * 3.2 });
  }
  for (var hx = -300; hx < len; hx += 70 + rnd() * 120) {
    holes.push({ x: hx, y: 24 + rnd() * 70, r: 2 + rnd() * 5, a: rnd() * 6 });
  }
  return { pts: pts, holes: holes };
};

UP.Renderer.prototype.event = function (e, w) {
  var sy;
  switch (e.type) {
    case 'hit':
      sy = UP.zToY(e.z) - e.y;
      this.flashes.push({ x: e.x, sy: sy, r: e.kill ? 34 : 22, life: 0, max: 0.12, color: e.src === 'npc' ? UP.C.amber : '#ffffff' });
      w.burst(e.x, sy, e.src === 'npc' ? 'ember' : 'spark', e.kill ? 12 : 6);
      break;
    case 'playerHurt':
      this.flashes.push({ x: e.x, sy: UP.zToY(e.z) - 40, r: 26, life: 0, max: 0.12, color: e.src === 'npc' ? UP.C.amber : UP.C.enemyEdge });
      w.shake = Math.max(w.shake, 0.35);
      break;
    case 'crush':
      w.shake = Math.max(w.shake, 1.2);
      w.burst(e.x, UP.zToY(e.z), 'dust', 26);
      break;
    case 'knock':
      this.knockRings.push({ x: e.x, life: 0, max: 0.5, n: e.n, sorry: !!e.sorry, distress: !!e.distress });
      w.burst(e.x, UP.CEIL_Y - 2, 'dust', e.distress ? 4 : 8);
      break;
    case 'stumble': w.burst(e.x, UP.CEIL_Y - 2, 'dust', 18); break;
    case 'sparkIn':
      this.knockRings.push({ x: e.x, life: 0, max: 0.6, n: 0, spark: true });
      this.hint.tossed = true;
      break;
    case 'sparkGet': this.hint.spark = 1; break;
    case 'snare': w.burst(e.x, UP.CEIL_Y, 'dust', 30); w.shake = Math.max(w.shake, 0.5); break;
    case 'freed': w.burst(e.x, UP.CEIL_Y, 'ember', 30); break;
    case 'miracle': this.flashes.push({ x: e.x, sy: 60, r: 900, life: 0, max: 0.5, color: UP.C.amber, screen: true }); break;
    case 'land': w.burst(e.x, UP.zToY(e.z), 'dust', 3); break;
    case 'playerKnock': this.knockRings.push({ x: e.x, life: 0, max: 0.45, n: 1, white: true }); break;
    case 'stomp':
      w.burst(e.x, UP.CEIL_Y, 'dust', 24);
      w.burst(e.x, UP.zToY(e.z) - 10, 'ember', 14);
      this.flashes.push({ x: e.x, sy: UP.zToY(e.z) - 10, r: 40, life: 0, max: 0.18, color: UP.C.amber });
      w.shake = Math.max(w.shake, 0.7);
      break;
    case 'together':
      sy = UP.zToY(e.z) - e.y;
      this.flashes.push({ x: e.x, sy: sy, r: 30, life: 0, max: 0.22, color: '#ffffff' });
      this.flashes.push({ x: e.x, sy: sy, r: 52, life: 0, max: 0.3, color: UP.C.amber });
      w.burst(e.x, sy, 'ember', 16); w.burst(e.x, sy, 'spark', 10);
      w.shake = Math.max(w.shake, 0.6);
      break;
    case 'bump': w.burst(e.x - 10, UP.CEIL_Y - 2, 'dust', 10); break;
    case 'heave': w.burst(e.x, UP.CEIL_Y - 2, 'dust', 4); break;
    case 'gateOpen':
      w.burst(e.x, UP.FLOOR_BOT - 20, 'dust', 30);
      this.flashes.push({ x: e.x, sy: 60, r: 900, life: 0, max: 0.4, color: UP.C.amber, screen: true });
      break;
  }
};

UP.Renderer.prototype.draw = function (w, dt) {
  var g = this.g, C = UP.C;
  this.time += dt;
  var s = w.shake * w.shake * 7;
  this.shakeX = (Math.random() - 0.5) * s; this.shakeY = (Math.random() - 0.5) * s;
  var cam = Math.round(w.camX);

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = C.bg; g.fillRect(0, 0, UP.W, UP.H);
  g.setTransform(1, 0, 0, 1, this.shakeX - cam, this.shakeY);

  this.drawRoom(w, cam);
  this.drawLightShaft(w);
  this.drawMechsBack(w, cam);
  this.drawPuzzleBack(w, cam);
  this.drawFloorMarks(w);
  this.drawActors(w);
  this.drawParticles(w);
  this.drawCeiling(w, cam);
  this.drawMechsFront(w, cam);
  this.drawGate(w, cam);
  if (w.reveal && w.reveal.rise > 0 && w.mode === 'reveal') this.drawPlayer(w.player, w); // over the ceiling as you go up
  this.drawFlashes(dt);

  g.setTransform(1, 0, 0, 1, 0, 0);
  this.drawHud(w);
  this.drawOverlays(w);
};

// ------------------------------------------------------------------ room
UP.Renderer.prototype.drawRoom = function (w, cam) {
  var g = this.g, C = UP.C;
  // back wall
  g.fillStyle = C.wall; g.fillRect(cam - 20, UP.CEIL_Y, UP.W + 40, UP.FLOOR_TOP - UP.CEIL_Y);
  g.strokeStyle = C.wallLine; g.lineWidth = 1;
  for (var x = Math.floor((cam - 40) / 240) * 240; x < cam + UP.W + 40; x += 240) {
    g.beginPath(); g.moveTo(x + 0.5, UP.CEIL_Y); g.lineTo(x + 0.5, UP.FLOOR_TOP); g.stroke();
  }
  // floor
  var grd = g.createLinearGradient(0, UP.FLOOR_TOP, 0, UP.FLOOR_BOT);
  grd.addColorStop(0, '#121216'); grd.addColorStop(1, '#19191e');
  g.fillStyle = grd; g.fillRect(cam - 20, UP.FLOOR_TOP, UP.W + 40, UP.FLOOR_BOT - UP.FLOOR_TOP);
  g.strokeStyle = C.floorLine;
  for (var z = 30; z < UP.ZMAX; z += 30) {
    var y = Math.round(UP.zToY(z)) + 0.5;
    g.beginPath(); g.moveTo(cam - 20, y); g.lineTo(cam + UP.W + 20, y); g.stroke();
  }
  g.fillStyle = '#060607'; g.fillRect(cam - 20, UP.FLOOR_BOT, UP.W + 40, UP.H - UP.FLOOR_BOT);
  // the dark: the room itself is darker there (nothing lights it from above)
  var dk = w.ko.def;
  if (dk.x1 > cam - 100 && dk.x0 < cam + UP.W + 100) {
    var dg = g.createLinearGradient(dk.x0 - 80, 0, dk.x1 + 80, 0);
    var e0 = 80 / (dk.x1 - dk.x0 + 160);
    dg.addColorStop(0, 'rgba(0,0,0,0)'); dg.addColorStop(e0 * 2, 'rgba(0,0,0,0.5)');
    dg.addColorStop(1 - e0 * 2, 'rgba(0,0,0,0.5)'); dg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = dg; g.fillRect(dk.x0 - 80, UP.CEIL_Y, dk.x1 - dk.x0 + 160, UP.FLOOR_BOT - UP.CEIL_Y);
  }
  // floor edge line
  g.fillStyle = '#222228'; g.fillRect(cam - 20, UP.FLOOR_TOP, UP.W + 40, 1);
  // the exit: a faint pale strip at the end of the level
  var ex = UP.LEVEL.exitX + 40;
  if (ex < cam + UP.W + 100) {
    var eg = g.createLinearGradient(ex - 60, 0, ex + 60, 0);
    eg.addColorStop(0, 'rgba(236,233,226,0)'); eg.addColorStop(1, 'rgba(236,233,226,0.08)');
    g.fillStyle = eg; g.fillRect(ex - 60, UP.CEIL_Y, 160, UP.FLOOR_BOT - UP.CEIL_Y);
  }
};

// Light from upstairs pools on the floor below it. Brighter while it works, warmer with the bond.
UP.Renderer.prototype.npcLight = function (w) {
  var n = w.npc;
  if (n.state === 'arrive' && n.x < w.camX - 200) return 0;
  var base = 0.55 + Math.min(0.35, n.bond * 0.05);
  var busy = (n.state === 'go' || n.state === 'work' || n.state === 'fetch' || n.state === 'think') ? 0.3 : 0;
  var flick = n.state === 'stuck' ? 0.85 + 0.35 * Math.abs(Math.sin(this.time * 9)) * Math.sin(this.time * 31) : 1;
  if (n.state === 'falter') flick = 0.4 + 0.3 * Math.sin(this.time * 20);
  return (base + busy + n.joy * 0.4) * flick;
};

UP.Renderer.prototype.drawLightShaft = function (w) {
  var g = this.g, n = w.npc, I = this.npcLight(w);
  var hole = w.ko.hole;
  if (hole && hole.open > 0) this.drawHoleShaft(w, hole);
  if (I <= 0) return;
  // Over the solid ceiling of the dark no light gets through.
  if (w.inDark(n.x) && !(hole && hole.open > 0.3 && Math.abs(n.x - hole.x) < 30)) return;
  var x = n.x;
  var gr = g.createLinearGradient(0, UP.CEIL_Y, 0, UP.FLOOR_BOT);
  gr.addColorStop(0, 'rgba(' + UP.C.amberRGB + ',' + (0.07 * I) + ')');
  gr.addColorStop(1, 'rgba(' + UP.C.amberRGB + ',0)');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(x - 18, UP.CEIL_Y); g.lineTo(x + 18, UP.CEIL_Y);
  g.lineTo(x + 70, UP.FLOOR_BOT); g.lineTo(x - 70, UP.FLOOR_BOT); g.closePath(); g.fill();
  // pool on the floor
  var py = UP.zToY(75);
  var rg = g.createRadialGradient(x, py, 0, x, py, 130);
  rg.addColorStop(0, 'rgba(' + UP.C.amberRGB + ',' + (0.10 * I) + ')');
  rg.addColorStop(1, 'rgba(' + UP.C.amberRGB + ',0)');
  g.save(); g.translate(x, py); g.scale(1, 0.45); g.translate(-x, -py);
  g.fillStyle = rg; g.beginPath(); g.arc(x, py, 130, 0, Math.PI * 2); g.fill();
  g.restore();
};

// The hole it broke through: a hard column of light and a bright pool on the floor.
UP.Renderer.prototype.drawHoleShaft = function (w, h) {
  var g = this.g, o = h.open, healing = w.ko.state === 'healing';
  var fy = UP.zToY(h.z);
  var pulse = 0.85 + 0.15 * Math.sin(this.time * 3) + (healing ? 0.4 : 0);
  var gr = g.createLinearGradient(0, UP.CEIL_Y, 0, fy);
  gr.addColorStop(0, 'rgba(255,226,170,' + (0.42 * o * pulse) + ')');
  gr.addColorStop(1, 'rgba(255,214,150,' + (0.16 * o * pulse) + ')');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(h.x - 14 * o, UP.CEIL_Y); g.lineTo(h.x + 14 * o, UP.CEIL_Y);
  g.lineTo(h.x + 46, fy); g.lineTo(h.x - 46, fy); g.closePath(); g.fill();
  g.save(); g.translate(h.x, fy); g.scale(1, 0.55);
  var rg = g.createRadialGradient(0, 0, 0, 0, 0, 60);
  rg.addColorStop(0, 'rgba(255,236,200,' + (0.55 * o * pulse) + ')'); rg.addColorStop(1, 'rgba(255,214,150,0)');
  g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 60, 0, Math.PI * 2); g.fill();
  g.restore();
};

// ------------------------------------------------------------------ ceiling (cracks and light)
UP.Renderer.prototype.drawCeiling = function (w, cam) {
  var g = this.g, n = w.npc, C = UP.C, cr = this.crack;
  var r = w.reveal;
  var x0 = cam - 40, x1 = cam + UP.W + 40;
  g.fillStyle = C.ceil; g.fillRect(x0, 0, x1 - x0, UP.CEIL_Y);

  // Light behind the ceiling, shown only through the cracks (and the opening, at the end).
  g.save();
  g.beginPath();
  var pts = cr.pts, i;
  var first = -1, last = -1;
  for (i = 0; i < pts.length; i++) { if (pts[i].x >= x0 - 20 && first < 0) first = i; if (pts[i].x <= x1 + 20) last = i; }
  var dk = w.ko.def, hole = w.ko.hole;
  // The dark: the crack closes up (tapering over 60 px), except where it broke through.
  var cw = function (pt) {
    var f = 1;
    if (pt.x > dk.x0 - 60 && pt.x < dk.x1 + 60) f = UP.clamp(Math.max(dk.x0 - pt.x, pt.x - dk.x1) / 60, 0, 1);
    var hw = 0;
    if (hole && Math.abs(pt.x - hole.x) < 40) hw = hole.open * 16 * (1 - Math.abs(pt.x - hole.x) / 40);
    return Math.max(pt.w * f, hw);
  };
  if (first >= 0) {
    g.moveTo(pts[first].x, pts[first].y - cw(pts[first]));
    for (i = first; i <= last; i++) g.lineTo(pts[i].x, pts[i].y - cw(pts[i]));
    for (i = last; i >= first; i--) g.lineTo(pts[i].x, pts[i].y + cw(pts[i]));
    g.closePath();
  }
  cr.holes.forEach(function (h) {
    if (h.x < x0 || h.x > x1) return;
    if (h.x > dk.x0 - 20 && h.x < dk.x1 + 20) return;
    g.moveTo(h.x + h.r, h.y);
    for (var k = 1; k <= 5; k++) {
      var a = h.a + k * Math.PI * 2 / 5, rr = h.r * (k % 2 ? 0.6 : 1);
      g.lineTo(h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr);
    }
    g.closePath();
  });
  // the seam right above the room
  if (dk.x0 > x0) g.rect(x0, UP.CEIL_Y - 2, Math.min(x1, dk.x0) - x0, 1.5);
  if (dk.x1 < x1) g.rect(Math.max(x0, dk.x1), UP.CEIL_Y - 2, x1 - Math.max(x0, dk.x1), 1.5);
  g.clip();
  // faint ambient so cracks are always visible
  g.fillStyle = 'rgba(120,110,100,0.18)'; g.fillRect(x0, 0, x1 - x0, UP.CEIL_Y);
  var I = this.npcLight(w);
  var zp = w.puzzle;
  var hatchShut = zp && !zp.solved && zp.hatch < 0.7;
  if (hatchShut) {
    // The closed hatch stops its light too.
    g.save(); g.beginPath();
    if (n.x < zp.def.hatchX) g.rect(x0, 0, zp.def.hatchX - 7 - x0, UP.CEIL_Y);
    else g.rect(zp.def.hatchX + 7, 0, x1 - zp.def.hatchX, UP.CEIL_Y);
    g.clip();
  }
  if (I > 0) {
    var rad = 170 + Math.min(120, n.bond * 18);
    var gl = g.createRadialGradient(n.x, 70, 0, n.x, 70, rad);
    gl.addColorStop(0, 'rgba(255,214,150,' + Math.min(1, 0.95 * I) + ')');
    gl.addColorStop(0.35, 'rgba(' + C.amberRGB + ',' + (0.7 * I) + ')');
    gl.addColorStop(1, 'rgba(' + C.amberRGB + ',0)');
    g.fillStyle = gl; g.fillRect(n.x - rad, 0, rad * 2, UP.CEIL_Y);
  }
  if (hatchShut) g.restore();
  // spark traveling along inside the ceiling
  this.knockRings.forEach(function (k) {
    if (!k.spark) return;
    var a = 1 - k.life / k.max;
    var sg = g.createRadialGradient(k.x, 80, 0, k.x, 80, 90);
    sg.addColorStop(0, 'rgba(255,240,200,' + a + ')'); sg.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = sg; g.fillRect(k.x - 90, 0, 180, UP.CEIL_Y);
  });
  // machines being worked glow through the ceiling too
  w.mechs.forEach(function (m) {
    if (m.glow < 0.02) return;
    var mx = m.centerX();
    var mg = g.createRadialGradient(mx, 90, 0, mx, 90, 80);
    mg.addColorStop(0, 'rgba(' + C.amberRGB + ',' + (0.6 * m.glow) + ')'); mg.addColorStop(1, 'rgba(' + C.amberRGB + ',0)');
    g.fillStyle = mg; g.fillRect(mx - 80, 0, 160, UP.CEIL_Y);
  });
  g.restore();

  // Knock rings: a small shiver of the ceiling edge where it knocks.
  var t = this;
  this.knockRings.forEach(function (k) {
    k.life += 1 / 60;
    if (k.spark) return;
    var a = 1 - k.life / k.max;
    g.strokeStyle = k.white ? 'rgba(236,233,226,' + (0.6 * a) + ')'
      : k.distress ? 'rgba(' + C.amberRGB + ',' + (0.5 * a) + ')' : 'rgba(' + C.amberRGB + ',' + (0.35 * a) + ')';
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(k.x, UP.CEIL_Y - 1, 20 + k.life * 90, 3 + k.life * 6, 0, Math.PI, 0, true);
    g.stroke();
  });
  this.knockRings = this.knockRings.filter(function (k) { return k.life < k.max; });

  // The hole it broke through the solid ceiling.
  var bh = w.ko.hole;
  if (bh && bh.open > 0 && bh.x > x0 && bh.x < x1) {
    var o = bh.open, hw2 = 10 + 10 * o;
    g.fillStyle = 'rgba(255,226,170,' + (0.9 * o) + ')';
    g.beginPath();
    g.moveTo(bh.x - hw2, UP.CEIL_Y); g.lineTo(bh.x - hw2 * 0.6, UP.CEIL_Y - 30 * o); g.lineTo(bh.x - hw2 * 0.9, UP.CEIL_Y - 52 * o);
    g.lineTo(bh.x + hw2 * 0.2, UP.CEIL_Y - 70 * o); g.lineTo(bh.x + hw2 * 0.8, UP.CEIL_Y - 44 * o); g.lineTo(bh.x + hw2, UP.CEIL_Y);
    g.closePath(); g.fill();
  }

  // The sluice hatch: a slab across the crawlspace. It slides up into the ceiling while open.
  if (zp && zp.def.hatchX > x0 && zp.def.hatchX < x1) {
    var hx = zp.def.hatchX, lift = zp.hatch * 70;
    g.save(); g.beginPath(); g.rect(hx - 20, 0, 40, UP.CEIL_Y - 1); g.clip();
    g.fillStyle = '#1e1e24'; g.fillRect(hx - 7, 30 - lift, 14, UP.CEIL_Y - 30);
    g.fillStyle = zp.pressed ? '#ece9e2' : '#3a3a42';
    g.fillRect(hx - 7, 30 - lift, 14, 2); g.fillRect(hx - 7, UP.CEIL_Y - 4 - lift, 14, 2);
    g.restore();
  }

  // The opening (reveal).
  if (r && r.open > 0) {
    var ox = r.x, ow = 120 * r.open * r.open * (3 - 2 * r.open);
    var lg = g.createLinearGradient(0, 0, 0, UP.CEIL_Y);
    lg.addColorStop(0, 'rgba(255,226,170,1)'); lg.addColorStop(1, 'rgba(' + C.amberRGB + ',0.9)');
    g.fillStyle = lg; g.fillRect(ox - ow, 0, ow * 2, UP.CEIL_Y);
    // slabs sliding aside
    g.fillStyle = C.ceil;
    g.fillRect(ox - ow - 40, 0, 40, UP.CEIL_Y); g.fillRect(ox + ow, 0, 40, UP.CEIL_Y);
    // light falling into the room
    var fl = g.createLinearGradient(0, UP.CEIL_Y, 0, UP.FLOOR_BOT);
    fl.addColorStop(0, 'rgba(255,214,150,' + (0.35 * r.open) + ')'); fl.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = fl;
    g.beginPath(); g.moveTo(ox - ow, UP.CEIL_Y); g.lineTo(ox + ow, UP.CEIL_Y); g.lineTo(ox + ow * 1.6, UP.FLOOR_BOT); g.lineTo(ox - ow * 1.6, UP.FLOOR_BOT); g.fill();
    // Upstairs floor: the top of the slabs, lit from the opening.
    var FY = UP.CEIL_Y - 60;
    var sg = g.createLinearGradient(ox - ow - 220, 0, ox + ow + 220, 0);
    sg.addColorStop(0, 'rgba(' + C.amberRGB + ',0)'); sg.addColorStop(0.4, 'rgba(' + C.amberRGB + ',' + (0.5 * r.open) + ')');
    sg.addColorStop(0.6, 'rgba(' + C.amberRGB + ',' + (0.5 * r.open) + ')'); sg.addColorStop(1, 'rgba(' + C.amberRGB + ',0)');
    g.fillStyle = sg; g.fillRect(ox - ow - 220, FY, 440 + ow * 2, 1.5);
    // It: the same shape as you, in its own colour, standing at the edge and leaning over.
    if (r.open > 0.4) {
      var a = Math.min(1, (r.open - 0.4) * 1.7);
      var lean = Math.min(1, Math.max(0, (r.t - 4.2) / 1.2));
      var sx = ox + ow + 16;
      g.save();
      g.globalAlpha = a;
      g.translate(sx, FY); g.rotate(-0.55 * lean * lean * (3 - 2 * lean));
      this.capsule(0, 0, 22, 54, '#d98a2b');
      g.fillStyle = C.ceil; g.fillRect(-9, -45, 6, 3);
      g.restore();
      if (r.thread > 0) {
        var hx = sx - 30 * lean, hy = FY - 34;
        var py = UP.zToY(w.player.z) - w.player.y - 64;
        var ty = hy + r.thread * (py - hy);
        g.strokeStyle = 'rgba(255,236,200,0.95)'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(hx, hy);
        g.quadraticCurveTo(w.player.x + 10, hy + 10, w.player.x, ty); g.stroke();
        this.glowDot(w.player.x, ty, 2, 16, 0.8, '255,236,200');
      }
    }
  }
};

// ------------------------------------------------------------------ machinery
UP.Renderer.prototype.mechColor = function (m) {
  var a = m.glow;
  var r = Math.round(58 + (255 - 58) * a), gg = Math.round(58 + (179 - 58) * a), b = Math.round(66 + (71 - 66) * a);
  return 'rgb(' + r + ',' + gg + ',' + b + ')';
};

UP.Renderer.prototype.drawMechsBack = function (w, cam) {
  var g = this.g, self = this;
  w.mechs.forEach(function (m) {
    if (m.type === 'door') {
      var x = m.x, top = UP.CEIL_Y + 50, h = UP.FLOOR_TOP - top, wd = 70;
      if (x < cam - 100 || x > cam + UP.W + 100) return;
      g.fillStyle = '#08080a'; g.fillRect(x - wd / 2, top, wd, h);
      if (m.open > 0) {
        var ig = g.createLinearGradient(0, top, 0, UP.FLOOR_TOP);
        ig.addColorStop(0, 'rgba(255,214,150,0.05)'); ig.addColorStop(1, 'rgba(255,214,150,0.25)');
        g.fillStyle = ig; g.fillRect(x - wd / 2, top, wd, h);
      }
      g.fillStyle = self.mechColor(m);
      var sh = h * (1 - m.open);
      g.fillRect(x - wd / 2, top, wd, sh);
      g.fillStyle = '#1a1a1f';
      for (var yy = top + 8; yy < top + sh - 2; yy += 10) g.fillRect(x - wd / 2 + 4, yy, wd - 8, 1);
    }
    if (m.type === 'pipe') {
      var px = m.centerX();
      if (m.onRail() && !(m.x1 < cam - 50 || m.x0 > cam + UP.W + 50)) {
        g.fillStyle = '#26262c';
        g.fillRect(m.x0 - 10, UP.CEIL_Y + 2, m.x1 - m.x0 + 20, 3);
      }
      if (px < cam - 100 || px > cam + UP.W + 100) return;
      g.fillStyle = self.mechColor(m);
      g.fillRect(px - 5, UP.CEIL_Y, 10, 34);
      g.fillRect(px - 11, UP.CEIL_Y + 30, 22, 8);
      // the zone it covers: shown faintly only while it is armed
      if (m.glow > 0.05) {
        g.fillStyle = 'rgba(' + UP.C.amberRGB + ',' + (0.05 * m.glow) + ')';
        g.fillRect(px - (m.opts && m.opts.wide ? 110 : 62), UP.FLOOR_TOP, (m.opts && m.opts.wide ? 220 : 124), UP.FLOOR_BOT - UP.FLOOR_TOP);
      }
    }
    if (m.type === 'claw' || m.type === 'crusher') {
      if (m.x1 < cam - 50 || m.x0 > cam + UP.W + 50) return;
      // the rail
      g.fillStyle = '#26262c';
      g.fillRect(m.x0 - 10, UP.CEIL_Y + (m.type === 'claw' ? 2 : 10), m.x1 - m.x0 + 20, 3);
    }
    if (m.type === 'lamp') {
      g.strokeStyle = self.mechColor(m); g.lineWidth = 1;
      g.beginPath(); g.moveTo(m.x + 0.5, UP.CEIL_Y); g.lineTo(m.x + 0.5, UP.CEIL_Y + 60); g.stroke();
      g.fillStyle = m.glow > 0.1 ? UP.C.amber : '#4a4a52';
      g.beginPath(); g.arc(m.x, UP.CEIL_Y + 66, 7, 0, Math.PI * 2); g.fill();
    }
  });
};

// The sluice, downstairs: the plate, the white line on the wall up to the hatch, the winch wheel
// in the ceiling, the chain. (The gate is drawn in front of the actors, see drawGate.)
UP.Renderer.prototype.drawPuzzleBack = function (w, cam) {
  var z = w.puzzle, g = this.g;
  if (!z) return;
  var d = z.def;
  if (d.gateX < cam - 200 || d.plate.x > cam + UP.W + 200) return;
  // conduit: plate -> up the wall -> along under the ceiling -> into the hatch
  var py = UP.zToY(d.plate.z), wy = UP.CEIL_Y + 22;
  var lit = z.pressed ? 1 : (z.solved ? 0.35 : 0);
  g.strokeStyle = lit ? 'rgba(236,233,226,' + (0.25 + 0.6 * lit) + ')' : '#24242a';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(d.plate.x, py - 6); g.lineTo(d.plate.x, UP.FLOOR_TOP);
  g.lineTo(d.plate.x, wy); g.lineTo(d.hatchX, wy); g.lineTo(d.hatchX, UP.CEIL_Y);
  g.stroke();
  if (z.pressed) {
    // pulses running toward the hatch
    var L1 = py - UP.FLOOR_TOP + 6, L2 = UP.FLOOR_TOP - wy, L3 = d.hatchX - d.plate.x, L4 = wy - UP.CEIL_Y, tot = L1 + L2 + L3 + L4;
    for (var k = 0; k < 4; k++) {
      var u = ((this.time * 260 + k * tot / 4) % tot), qx, qy;
      if (u < L1 + L2) { qx = d.plate.x; qy = py - 6 - u; }
      else if (u < L1 + L2 + L3) { qx = d.plate.x + (u - L1 - L2); qy = wy; }
      else { qx = d.hatchX; qy = wy - (u - L1 - L2 - L3); }
      g.fillStyle = '#ffffff'; g.fillRect(qx - 2, qy - 2, 4, 4);
    }
  }
  // the plate
  g.save(); g.translate(d.plate.x, py); g.scale(1, 0.5);
  g.strokeStyle = z.pressed ? '#ece9e2' : '#4a4a52'; g.lineWidth = 2;
  g.strokeRect(-28, -30, 56, 60);
  if (z.pressed) { g.fillStyle = 'rgba(236,233,226,0.12)'; g.fillRect(-28, -30, 56, 60); }
  g.restore();
  // the winch wheel, peeking out of the ceiling
  var wx = d.winchX, wcy = UP.CEIL_Y - 2;
  var turning = z.npcAtWinch ? 1 : 0;
  var col = turning ? UP.C.amber : '#4a4a52';
  g.save(); g.beginPath(); g.rect(wx - 30, UP.CEIL_Y - 2, 60, 30); g.clip();
  g.strokeStyle = col; g.lineWidth = 2;
  g.beginPath(); g.arc(wx, wcy, 16, 0, Math.PI * 2); g.stroke();
  var rot = z.gate * 9 + (turning ? Math.sin(this.time * 7) * 0.15 : 0);
  for (var sp = 0; sp < 4; sp++) {
    var a = rot + sp * Math.PI / 2;
    g.beginPath(); g.moveTo(wx, wcy); g.lineTo(wx + Math.cos(a) * 16, wcy + Math.sin(a) * 16); g.stroke();
  }
  g.restore();
  // cable from the winch to the gate along the ceiling edge
  g.strokeStyle = '#2c2c33'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(wx + 16, UP.CEIL_Y + 3.5); g.lineTo(d.gateX, UP.CEIL_Y + 3.5); g.stroke();
};

UP.Renderer.prototype.drawChain = function (w) {
  var z = w.puzzle, g = this.g, ch = z.chain;
  var bottom = UP.zToY(ch.z) - 48 + z.gate * 8;
  var sw = Math.sin(this.time * 14) * ch.swing * 10;
  // It wants you here: while it turns the winch, the chain glows in its colour.
  var invite = z.npcAtWinch && !z.solved ? 0.5 + 0.5 * Math.sin(this.time * 5) : 0;
  if (invite) this.glowDot(ch.x + sw, bottom, 0, 30, 0.5 * invite);
  g.strokeStyle = invite ? 'rgba(' + UP.C.amberRGB + ',' + (0.5 + 0.5 * invite) + ')' : '#55555e';
  g.lineWidth = 2;
  g.setLineDash([4, 3]);
  g.beginPath(); g.moveTo(ch.x, UP.CEIL_Y); g.quadraticCurveTo(ch.x, (UP.CEIL_Y + bottom) / 2, ch.x + sw, bottom); g.stroke();
  g.setLineDash([]);
  g.beginPath(); g.arc(ch.x + sw, bottom + 7, 7, 0, Math.PI * 2); g.stroke();
};

UP.Renderer.prototype.drawGate = function (w, cam) {
  var z = w.puzzle, g = this.g;
  if (!z) return;
  var x = z.def.gateX;
  if (x < cam - 60 || x > cam + UP.W + 60) return;
  var top = UP.CEIL_Y + 6, bot = UP.FLOOR_BOT - z.gate * (UP.FLOOR_BOT - top - 16);
  g.fillStyle = 'rgba(10,10,12,0.55)'; g.fillRect(x - 8, top, 16, bot - top);
  g.strokeStyle = z.solved ? '#3a3a42' : '#6a6a74'; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x - 8, top); g.lineTo(x - 8, bot); g.moveTo(x + 8, top); g.lineTo(x + 8, bot);
  for (var y = bot; y > top; y -= 18) { g.moveTo(x - 8, y); g.lineTo(x + 8, y); }
  g.stroke();
  // slot in the floor
  g.fillStyle = '#050506'; g.fillRect(x - 4, UP.FLOOR_TOP, 8, UP.FLOOR_BOT - UP.FLOOR_TOP);
};

// Floor marks: the shadow of the weight before it falls.
UP.Renderer.prototype.drawFloorMarks = function (w) {
  var g = this.g;
  w.mechs.forEach(function (m) {
    if (m.type !== 'crusher' || m.glow < 0.05) return;
    var y = UP.zToY(m.cz);
    var a = m.state === 'arming' ? 0.25 + 0.35 * Math.min(1, m.t / UP.P.armTime) : 0.25 * m.glow;
    g.fillStyle = 'rgba(0,0,0,' + (0.6 * m.glow) + ')';
    g.beginPath(); g.ellipse(m.cx, y, 60, 30 * 0.7, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(' + UP.C.amberRGB + ',' + a + ')'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(m.cx, y, 60, 30 * 0.7, 0, 0, Math.PI * 2); g.stroke();
  });
};

// Front machinery (drawn over actors): claw cable and the weight.
UP.Renderer.prototype.drawMechsFront = function (w, cam) {
  var g = this.g, self = this;
  w.mechs.forEach(function (m) {
    if (m.type === 'claw') {
      if (m.cx < cam - 60 || m.cx > cam + UP.W + 60) return;
      var floorY = UP.zToY(m.cz) - 40;
      var y = UP.CEIL_Y + 10 + (floorY - UP.CEIL_Y - 10) * m.depth;
      g.strokeStyle = self.mechColor(m); g.lineWidth = 1;
      g.beginPath(); g.moveTo(m.cx + 0.5, UP.CEIL_Y + 4); g.lineTo(m.cx + 0.5, y); g.stroke();
      g.fillStyle = self.mechColor(m);
      g.fillRect(m.cx - 8, UP.CEIL_Y, 16, 6);
      g.lineWidth = 2;
      var open = m.held ? 4 : 10;
      g.beginPath();
      g.moveTo(m.cx - open, y + 14); g.lineTo(m.cx - 6, y); g.lineTo(m.cx + 6, y); g.lineTo(m.cx + open, y + 14);
      g.stroke();
    }
    if (m.type === 'crusher') {
      if (m.cx < cam - 80 || m.cx > cam + UP.W + 80) return;
      var restY = UP.CEIL_Y + 14;
      var groundY = UP.zToY(m.cz) - 36;
      var by = restY + (groundY - restY) * (m.drop * m.drop);
      g.strokeStyle = self.mechColor(m); g.lineWidth = 1;
      g.beginPath(); g.moveTo(m.cx - 20.5, UP.CEIL_Y + 10); g.lineTo(m.cx - 20.5, by); g.moveTo(m.cx + 20.5, UP.CEIL_Y + 10); g.lineTo(m.cx + 20.5, by); g.stroke();
      g.fillStyle = '#1d1d22';
      g.fillRect(m.cx - 40, by, 80, 36);
      g.fillStyle = self.mechColor(m);
      g.fillRect(m.cx - 40, by, 80, 3);
      g.fillRect(m.cx - 40, by + 33, 80, 3);
    }
  });
};

// ------------------------------------------------------------------ actors
UP.Renderer.prototype.drawActors = function (w) {
  var list = [], self = this;
  w.enemies.forEach(function (e) { list.push({ z: e.z, f: function () { self.drawEnemy(e, w); } }); });
  w.pickups.forEach(function (k) { list.push({ z: k.z, f: function () { self.drawPickup(k, w); } }); });
  if (w.puzzle) list.push({ z: w.puzzle.chain.z, f: function () { self.drawChain(w); } });
  var br = w.ko.brute;
  if (br && w.npc.freed && w.ko.state !== 'done') list.push({ z: br.z, f: function () { self.drawBrute(br, w); } });
  if (!(w.mode === 'end' && w.ending === 'together')) list.push({ z: w.player.z + 0.01, f: function () { self.drawPlayer(w.player, w); } });
  // shadows first
  var g = this.g;
  g.fillStyle = 'rgba(0,0,0,0.45)';
  w.enemies.forEach(function (e) { if (e.state !== 'lifted' || e.y < 200) self.shadow(e.x, e.z, e.def.w * 0.8, e.y); });
  self.shadow(w.player.x, w.player.z, 22, w.player.y);
  // the rope
  if (w.rope && w.rope.state !== 'gone') this.drawRope(w);
  list.sort(function (a, b) { return a.z - b.z; });
  list.forEach(function (it) { it.f(); });
  // tossed sparks
  w.tossed.forEach(function (s) { self.glowDot(s.x, UP.zToY(s.z) - s.y, 4, 26, 1); });
};

UP.Renderer.prototype.shadow = function (x, z, r, y) {
  var g = this.g, k = Math.max(0.3, 1 - y / 300);
  g.beginPath(); g.ellipse(x, UP.zToY(z), r * k, r * 0.28 * k, 0, 0, Math.PI * 2); g.fill();
};

UP.Renderer.prototype.capsule = function (x, footY, wdt, h, color) {
  var g = this.g, r = wdt / 2;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x - r, footY - r);
  g.lineTo(x - r, footY - h + r);
  g.arc(x, footY - h + r, r, Math.PI, 0);
  g.lineTo(x + r, footY - r);
  g.arc(x, footY - r, r, 0, Math.PI);
  g.fill();
};

UP.Renderer.prototype.drawPlayer = function (p, w) {
  var g = this.g, s = UP.zScale(p.z);
  var foot = UP.zToY(p.z) - p.y;
  if (p.inv > 0 && w.mode === 'play' && Math.floor(this.time * 20) % 2 === 0 && p.state !== 'hurt') return;
  g.save();
  g.translate(p.x, foot); g.scale(s, s);
  var lean = 0, sq = 1;
  if (p.state === 'attack') lean = p.face * (p.combo === 3 ? 0.22 : 0.12);
  if (p.state === 'hurt') lean = -p.face * 0.25;
  if (p.state === 'jump') sq = 1.06;
  if (p.state === 'toss') lean = -p.face * 0.08;
  if (p.state === 'walk') sq = 1 + Math.sin(p.t * 16) * 0.02;
  if (p.state === 'koAir') lean = -p.face * Math.min(Math.PI / 2, p.t * 7);
  if (p.state === 'downed' || p.state === 'healing') {
    // Lying on the floor, head toward where you crawl; each pull stretches you a little.
    g.translate(0, -12);
    lean = p.face * Math.PI / 2;
    if (p.state === 'downed') sq = 1 + 0.06 * Math.max(0, Math.sin(p.t * 6.5)) * (Math.abs(p.vx) > 1 ? 1 : 0);
  }
  if (p.state === 'getup') lean = p.face * Math.PI / 2 * Math.max(0, 1 - p.t / 0.6);
  g.rotate(lean);
  var col = p.flash > 0 ? '#ff8a80' : UP.C.player;
  this.capsule(0, 0, 26, 64 * sq, col);
  // eye notch: which way you face
  g.fillStyle = UP.C.bg;
  g.fillRect(p.face > 0 ? 4 : -10, -52 * sq, 6, 3);
  g.restore();

  // the swing
  if (p.state === 'attack') {
    var a = UP.ATTACKS[p.combo];
    if (p.t >= a.from - 0.02 && p.t <= a.to + 0.05) {
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = p.combo === 3 ? 3 : 2;
      g.beginPath();
      var cy = foot - 36 * s;
      g.arc(p.x + p.face * 16, cy, a.reach * 0.6, p.face > 0 ? -0.9 : Math.PI - 0.9, p.face > 0 ? 0.9 : Math.PI + 0.9);
      g.stroke();
    }
  }
  if (p.state === 'jump' && p.jumpAtk) {
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2;
    g.beginPath(); g.arc(p.x + p.face * 18, foot - 20, 26, 0, Math.PI * 2); g.stroke();
  }
  if (p.state === 'toss') {
    g.strokeStyle = 'rgba(' + UP.C.amberRGB + ',0.6)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(p.x + p.face * 6, foot - 60); g.lineTo(p.x + p.face * 6, foot - 90); g.stroke();
  }
  // first-time hint: you got a spark — toss it up
  if (p.sparks > 0 && !this.hint.tossed && w.mode === 'play' && !p.isDown()) {
    var ha = 0.5 + 0.5 * Math.sin(this.time * 5);
    g.fillStyle = 'rgba(' + UP.C.amberRGB + ',' + (0.4 + 0.5 * ha) + ')';
    g.font = '600 13px ui-monospace, Menlo, monospace'; g.textAlign = 'center';
    g.fillText('L ↑', p.x, foot - 84 - ha * 4);
  }
};

UP.Renderer.prototype.drawEnemy = function (e, w) {
  var g = this.g, d = e.def, s = UP.zScale(e.z);
  var foot = UP.zToY(e.z) - e.y;
  if (e.spot > 0 && e.hp > 0) {
    var pulse = 0.6 + 0.4 * Math.sin(this.time * 12);
    g.strokeStyle = 'rgba(' + UP.C.amberRGB + ',' + (0.7 * pulse) + ')'; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(e.x, UP.zToY(e.z), d.w * 0.9 + 6, (d.w * 0.9 + 6) * 0.3, 0, 0, Math.PI * 2); g.stroke();
  }
  g.save();
  g.globalAlpha = Math.max(0, e.fade);
  g.translate(e.x, foot); g.scale(s, s);
  var lean = 0, edge = UP.C.enemyEdge, lw = 1.5;
  if (e.state === 'windup') { lean = -e.face * 0.18 * Math.min(1, e.t / d.windup); edge = '#ff5a52'; lw = 2 + 1.5 * Math.min(1, e.t / d.windup); }
  if (e.state === 'strike') lean = e.face * 0.2;
  if (e.state === 'hurt') lean = -e.face * 0.2;
  if (e.state === 'pull') lean = -e.face * (0.28 + 0.08 * Math.sin(w.t * 6 + e.id));
  if (e.state === 'down' || (e.state === 'air' && e.vy < 0 && e.hp <= 0)) { lean = (e.vx >= 0 ? 1 : -1) * Math.PI / 2 * 0.95; }
  if (e.state === 'air') lean = (e.vx >= 0 ? 1 : -1) * Math.min(1.4, e.t * 5);
  if (e.state === 'getup') lean = (e.vx >= 0 ? 1 : -1) * (1 - e.t / 0.4) * 1.3;
  if (e.state === 'lifted') lean = Math.sin(w.t * 9) * 0.3;
  g.rotate(lean);
  var col = e.flash > 0 ? '#ffffff' : UP.C.enemy;
  if (e.spot > 0 && e.hp > 0) { edge = UP.C.amber; lw = Math.max(lw, 2.5); }
  g.fillStyle = col; g.strokeStyle = edge; g.lineWidth = lw;
  g.beginPath();
  var hw = d.w / 2, h = d.h;
  if (e.type === 'grunt') {
    g.moveTo(-hw, 0); g.lineTo(hw, 0); g.lineTo(hw * 0.3, -h); g.lineTo(-hw * 0.5, -h * 0.82); g.closePath();
  } else if (e.type === 'fast') {
    g.moveTo(-hw * 0.6, 0); g.lineTo(hw * 0.6, 0); g.lineTo(hw, -h * 0.75); g.lineTo(0, -h); g.lineTo(-hw, -h * 0.7); g.closePath();
  } else {
    g.moveTo(-hw, 0); g.lineTo(hw, 0); g.lineTo(hw * 0.9, -h * 0.9); g.lineTo(-hw * 0.2, -h); g.lineTo(-hw, -h * 0.85); g.closePath();
  }
  g.fill(); g.stroke();
  // eye slit
  if (e.hp > 0) {
    g.fillStyle = e.state === 'windup' ? '#ff6a60' : '#7a2427';
    if (e.type === 'brute') { g.fillStyle = '#ff4a42'; g.fillRect(e.face > 0 ? 4 : -16, -h * 0.72, 12, 2.5); }
    else g.fillRect(e.face > 0 ? 1 : -9, -h * 0.72, 8, 2);
  }
  g.restore();
  // hp tick for armored ones
  if (e.def.armor && e.hp > 0 && e.hp < e.maxHp) {
    g.fillStyle = 'rgba(181,58,60,0.6)';
    g.fillRect(e.x - 20, foot - d.h * s - 10, 40 * e.hp / e.maxHp, 2);
  }
};

// The brute in the dark: barely visible until it moves; only its eye shows.
UP.Renderer.prototype.drawBrute = function (b, w) {
  var g = this.g, s = UP.zScale(b.z), foot = UP.zToY(b.z);
  var waiting = b.state === 'wait';
  var body = waiting ? 0.12 : Math.max(0, b.fade);
  g.save();
  g.translate(b.x, foot); g.scale(s * 1.35, s * 1.35);
  g.rotate(b.state === 'charge' ? -0.2 : 0);
  g.globalAlpha = body;
  g.fillStyle = UP.C.enemy; g.strokeStyle = UP.C.enemyEdge; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-34, 0); g.lineTo(34, 0); g.lineTo(30, -66); g.lineTo(-6, -80); g.lineTo(-36, -62); g.closePath();
  g.fill(); g.stroke();
  g.globalAlpha = waiting ? 0.55 + 0.35 * Math.sin(this.time * 2) : Math.max(0, b.fade);
  g.fillStyle = '#ff4a42';
  g.fillRect(b.face > 0 ? 4 : -16, -58, 12, 2.5);
  g.restore();
};

UP.Renderer.prototype.drawRope = function (w) {
  var g = this.g, r = w.rope;
  var pull = r.pullers.filter(function (e) { return e.state === 'pull'; });
  if (r.state === 'free') {
    // slack rope being drawn back up
    r.slack = (r.slack || 0) + 1 / 60;
    var top = UP.CEIL_Y + r.slack * 260;
    if (top > UP.FLOOR_TOP + 60) { r.state = 'gone'; return; }
    g.strokeStyle = '#3a3a42'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(r.x, UP.CEIL_Y); g.lineTo(r.x + 4, UP.CEIL_Y + Math.max(0, 140 - r.slack * 260)); g.stroke();
    return;
  }
  var taut = r.state === 'taut';
  if (taut) {
    // Where the rope disappears into the ceiling, its light is pulled down through the gap.
    var tug = 4 + 3 * Math.abs(Math.sin(this.time * 6));
    this.glowDot(r.x, UP.CEIL_Y + tug - 4, 3, 46, 0.9);
  }
  g.strokeStyle = taut ? '#6b6b74' : '#34343b'; g.lineWidth = taut ? 2 : 1.5;
  pull.forEach(function (e) {
    var hy = UP.zToY(e.z) - e.def.h * 0.55 * UP.zScale(e.z);
    var hx = e.x + e.face * 10;
    g.beginPath(); g.moveTo(r.x, UP.CEIL_Y);
    if (taut) g.lineTo(hx, hy);
    else g.quadraticCurveTo((r.x + hx) / 2, hy + 40, hx, hy);
    g.stroke();
  });
};

UP.Renderer.prototype.drawPickup = function (k, w) {
  var bob = k.y > 0 ? 0 : Math.sin(this.time * 3 + k.x) * 3;
  var y = UP.zToY(k.z) - k.y - 14 - bob;
  if (k.kind === 'spark') {
    var g = this.g;
    this.glowDot(k.x, y, 0, 34, 0.8);
    g.fillStyle = '#ffd59a';
    g.beginPath(); g.moveTo(k.x, y - 7); g.lineTo(k.x + 5, y); g.lineTo(k.x, y + 7); g.lineTo(k.x - 5, y); g.closePath(); g.fill();
  } else {
    this.glowDot(k.x, y, k.big ? 6 : 4, k.big ? 40 : 28, 0.9, '255,226,170');
  }
};

UP.Renderer.prototype.glowDot = function (x, y, r, R, a, rgb) {
  var g = this.g;
  rgb = rgb || UP.C.amberRGB;
  var gr = g.createRadialGradient(x, y, 0, x, y, R);
  gr.addColorStop(0, 'rgba(' + rgb + ',' + (0.6 * a) + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
  g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
  if (r > 0) { g.fillStyle = 'rgba(255,240,210,' + a + ')'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
};

// ------------------------------------------------------------------ particles and flashes
UP.Renderer.prototype.drawParticles = function (w) {
  var g = this.g, C = UP.C;
  for (var i = 0; i < w.parts.length; i++) {
    var q = w.parts[i], a = 1 - q.life / q.max;
    switch (q.kind) {
      case 'dust': g.fillStyle = 'rgba(200,190,170,' + (0.35 * a) + ')'; g.fillRect(q.x, q.sy, q.size, q.size); break;
      case 'drip': g.fillStyle = 'rgba(200,200,210,' + (0.6 * a) + ')'; g.fillRect(q.x, q.sy, 1.5, 3); break;
      case 'steam': g.fillStyle = 'rgba(220,220,225,' + (0.08 * a) + ')'; g.beginPath(); g.arc(q.x, q.sy, q.size * (1.5 - a * 0.5), 0, Math.PI * 2); g.fill(); break;
      case 'trail': g.fillStyle = 'rgba(' + C.amberRGB + ',' + (0.7 * a) + ')'; g.fillRect(q.x - 1, q.sy - 1, 2, 2); break;
      case 'spark': g.fillStyle = 'rgba(255,255,255,' + a + ')'; g.fillRect(q.x, q.sy, 2, 2); break;
      case 'ember': g.fillStyle = 'rgba(' + C.amberRGB + ',' + a + ')'; g.fillRect(q.x, q.sy, 2, 2); break;
      case 'motes': g.fillStyle = 'rgba(255,226,170,' + (0.5 * a) + ')'; g.fillRect(q.x, q.sy, q.size, q.size); break;
    }
  }
};

UP.Renderer.prototype.drawFlashes = function (dt) {
  var g = this.g;
  this.flashes.forEach(function (f) {
    f.life += dt;
    var a = Math.max(0, 1 - f.life / f.max);
    if (f.screen) return;
    g.strokeStyle = f.color; g.globalAlpha = a; g.lineWidth = 2;
    g.beginPath(); g.arc(f.x, f.sy, f.r * (0.5 + f.life / f.max), 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
  });
};

// ------------------------------------------------------------------ HUD and overlays
UP.Renderer.prototype.drawHud = function (w) {
  var g = this.g, p = w.player, P = UP.P;
  var y = UP.H - 34;
  g.fillStyle = '#2a2a30'; g.fillRect(28, y, 220, 3);
  g.fillStyle = p.hp / P.maxHp < P.lowHp ? '#ff8a80' : UP.C.hud;
  if (p.isDown() && p.hp < 1) { g.fillStyle = 'rgba(255,138,128,' + (0.4 + 0.4 * Math.sin(this.time * 7)) + ')'; g.fillRect(28, y, 6, 3); }
  g.fillRect(28, y, 220 * p.hp / P.maxHp, 3);
  for (var i = 0; i < 3; i++) {
    var x = 280 + i * 20;
    g.fillStyle = i < p.sparks ? '#ffd59a' : '#2a2a30';
    g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 5, y + 1); g.lineTo(x, y + 8); g.lineTo(x - 5, y + 1); g.closePath(); g.fill();
  }
};

UP.Renderer.prototype.drawOverlays = function (w) {
  var g = this.g;
  this.flashes.forEach(function (f) {
    if (!f.screen) return;
    var a = Math.max(0, 1 - f.life / f.max);
    g.fillStyle = 'rgba(' + UP.C.amberRGB + ',' + (0.18 * a) + ')'; g.fillRect(0, 0, UP.W, UP.H);
  });
  this.flashes = this.flashes.filter(function (f) { return f.life < f.max; });

  if (w.mode === 'dead') {
    g.fillStyle = 'rgba(0,0,0,' + Math.min(0.85, w.modeT * 0.8) + ')'; g.fillRect(0, 0, UP.W, UP.H);
  }
  this.drawKoOverlay(w);
  if (w.reveal && w.reveal.fade > 0) {
    g.fillStyle = 'rgba(255,236,205,' + w.reveal.fade + ')'; g.fillRect(0, 0, UP.W, UP.H);
  }
  if (w.mode === 'end') this.drawEnd(w);
};

// Knocked out: the world closes in to a small circle around you, beating with the heart.
// The light it breaks through is the only other thing you can see.
UP.Renderer.prototype.drawKoOverlay = function (w) {
  var k = w.ko, p = w.player, g = this.g;
  var target = k.state === 'downed' ? 1 : k.state === 'healing' ? Math.max(0, 1 - k.t / 2.2) : 0;
  this.koFade = (this.koFade || 0) + (target - (this.koFade || 0)) * 0.08;
  var a = this.koFade;
  if (a < 0.01) return;
  var sx = p.x - w.camX + this.shakeX, sy = UP.zToY(p.z) - 20 + this.shakeY;
  var beat = k.beatT !== undefined ? Math.max(0, k.beatT - 0.7) * 3 : 0;
  var r = 150 + beat * 30;
  var gr = g.createRadialGradient(sx, sy, r * 0.3, sx, sy, r * 2.2);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.45, 'rgba(0,0,0,' + (0.6 * a) + ')'); gr.addColorStop(1, 'rgba(0,0,0,' + (0.92 * a) + ')');
  g.fillStyle = gr; g.fillRect(0, 0, UP.W, UP.H);
  g.fillStyle = 'rgba(120,0,0,' + (0.12 * a * (0.5 + beat)) + ')'; g.fillRect(0, 0, UP.W, UP.H);
  var h = k.hole;
  if (h && h.open > 0) {
    var hx = h.x - w.camX + this.shakeX, hy = UP.zToY(h.z) + this.shakeY;
    g.save(); g.globalCompositeOperation = 'lighter';
    var lg = g.createLinearGradient(0, UP.CEIL_Y, 0, hy);
    lg.addColorStop(0, 'rgba(255,214,150,' + (0.3 * h.open * a) + ')'); lg.addColorStop(1, 'rgba(255,214,150,' + (0.12 * h.open * a) + ')');
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(hx - 14, UP.CEIL_Y); g.lineTo(hx + 14, UP.CEIL_Y); g.lineTo(hx + 46, hy); g.lineTo(hx - 46, hy); g.closePath(); g.fill();
    g.translate(hx, hy); g.scale(1, 0.55);
    var rg = g.createRadialGradient(0, 0, 0, 0, 0, 64);
    rg.addColorStop(0, 'rgba(255,226,170,' + (0.5 * h.open * a) + ')'); rg.addColorStop(1, 'rgba(255,226,170,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 64, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  if (k.state === 'healing') {
    g.fillStyle = 'rgba(255,226,170,' + (0.12 * Math.min(1, k.t)) + ')'; g.fillRect(0, 0, UP.W, UP.H);
  }
};

UP.Renderer.prototype.drawEnd = function (w) {
  var g = this.g, t = w.modeT, together = w.ending === 'together';
  if (together) {
    var k = Math.min(1, t / 2);
    g.fillStyle = 'rgb(' + Math.round(255 - 245 * k) + ',' + Math.round(236 - 226 * k) + ',' + Math.round(205 - 193 * k) + ')';
  } else g.fillStyle = 'rgba(10,10,12,' + Math.min(1, t) + ')';
  g.fillRect(0, 0, UP.W, UP.H);
  var a = Math.min(1, Math.max(0, (t - 1.2) / 1.5));
  g.save(); g.globalAlpha = a;
  var cy = UP.H / 2 + 40;
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(UP.W / 2 - 120, cy, 240, 1);
  if (together) {
    this.capsule(UP.W / 2 - 22, cy, 26, 64, UP.C.player);
    this.capsule(UP.W / 2 + 22, cy, 22, 54, '#d98a2b');
  } else {
    this.capsule(UP.W / 2, cy, 26, 64, UP.C.player);
  }
  g.restore();
  if (t > 3.5) {
    g.fillStyle = 'rgba(236,233,226,' + Math.min(0.5, (t - 3.5) * 0.5) + ')';
    g.font = '12px ui-monospace, Menlo, monospace'; g.textAlign = 'center';
    g.fillText('R — ещё раз', UP.W / 2, UP.H - 40);
  }
};
