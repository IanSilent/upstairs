// Headless playthrough: a simple bot plays the level many times with the real simulation.
// Reports completion, time, deaths, and what the one upstairs decided. Usage:
//   node tools/check.js [runs=20] [--log] [--notoss] [--nofree]
var fs = require('fs'), path = require('path'), vm = require('vm');

var args = process.argv.slice(2);
var RUNS = parseInt(args.find(function (a) { return /^\d+$/.test(a); }) || '20', 10);
var NOPUZZLE = args.indexOf('--nopuzzle') >= 0;
var LOG = args.indexOf('--log') >= 0, NOTOSS = args.indexOf('--notoss') >= 0, NOFREE = args.indexOf('--nofree') >= 0;

var ctx = { console: console, Math: Math, window: { addEventListener: function () {} }, performance: { now: function () { return 0; } } };
vm.createContext(ctx);
['config', 'level', 'input', 'actors', 'npc', 'world'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
});
var UP = vm.runInContext('UP', ctx);

function bot(w, mem) {
  var p = w.player, inp = { dx: 0, dz: 0, attack: false, jump: false, toss: false };
  if (p.isDown()) {
    // Knocked out: crawl into the light once there is one.
    var h = w.ko.hole;
    if (p.state === 'downed' && h && h.open > 0.6) {
      inp.dx = Math.abs(h.x - p.x) > 8 ? Math.sign(h.x - p.x) : 0;
      inp.dz = Math.abs(h.z - p.z) > 6 ? Math.sign(h.z - p.z) : 0;
    }
    return inp;
  }
  var foes = w.enemies.filter(function (e) {
    if (e.state === 'pull' && (NOFREE || w.npc.state !== 'stuck')) return false;
    return e.alive() && e.state !== 'lifted' && Math.abs(e.x - p.x) < 600;
  });
  // pick up anything close
  var pick = w.pickups.filter(function (k) { return Math.abs(k.x - p.x) < 260 && k.y < 5 && !(k.kind === 'spark' && p.sparks >= 3); })[0];
  if (foes.length) {
    foes.sort(function (a, b) { return Math.abs(a.x - p.x) + Math.abs(a.z - p.z) - Math.abs(b.x - p.x) - Math.abs(b.z - p.z); });
    var e = foes[0];
    var dx = e.x - p.x, dz = e.z - p.z;
    if (Math.abs(dx) > 50) inp.dx = Math.sign(dx);
    else if (Math.abs(dx) < 30) inp.dx = -Math.sign(dx) || 1;
    if (Math.abs(dz) > 8) inp.dz = Math.sign(dz);
    if (Math.abs(dx) < 75 && Math.abs(dz) < 18 && e.hittable()) {
      if (Math.sign(dx) !== p.face) inp.dx = Math.sign(dx);
      inp.attack = (mem.t++ % 4) === 0;
    }
    if (!NOTOSS && p.sparks > 0 && w.npc.state === 'follow' && mem.tossCd <= 0 && foes.length >= 2) { inp.toss = true; mem.tossCd = 4; }
  } else if (w.puzzle && !w.puzzle.solved && p.x > w.puzzle.def.zoneX - 60 && !NOPUZZLE) {
    // The sluice: stand on the plate while it is blocked; pull the chain while it turns the winch.
    var d = w.puzzle.def, goal;
    if (w.npc.state === 'winch') goal = { x: d.chain.x - 40, z: d.chain.z };
    else if (w.npc.state === 'lead' && w.npc.x < d.hatchX) goal = { x: d.plate.x, z: d.plate.z };
    else goal = { x: d.zoneX + 200, z: 90 };
    var gdx = goal.x - p.x, gdz = goal.z - p.z;
    inp.dx = Math.abs(gdx) > 6 ? Math.sign(gdx) : 0;
    inp.dz = Math.abs(gdz) > 5 ? Math.sign(gdz) : 0;
    if (w.npc.state === 'winch' && !inp.dx && !inp.dz) { if (p.face < 0) inp.dx = 1; inp.attack = (mem.t++ % 6) === 0; }
  } else if (pick) {
    inp.dx = Math.abs(pick.x - p.x) > 6 ? Math.sign(pick.x - p.x) : 0;
    inp.dz = Math.abs(pick.z - p.z) > 6 ? Math.sign(pick.z - p.z) : 0;
  } else {
    inp.dx = 1;
    inp.dz = Math.abs(p.z - 90) > 6 ? -Math.sign(p.z - 90) : 0;
    // toss in calm near the door once
    var door = w.mechs.filter(function (m) { return m.type === 'door' && m.state === 'idle'; })[0];
    if (!NOTOSS && door && Math.abs(door.x - p.x) < 200 && p.sparks > 1 && w.npc.state === 'follow' && mem.tossCd <= 0) { inp.toss = true; mem.tossCd = 4; }
  }
  mem.tossCd -= UP.DT;
  return inp;
}

var results = [], errors = 0;
for (var r = 0; r < RUNS; r++) {
  var w = new UP.World(), mem = { t: 0, tossCd: 0 }, steps = 0, err = null;
  try {
    while (w.mode !== 'end' && steps < 60 * 60 * 6) {
      w.update(UP.DT, bot(w, mem));
      w.events.length = 0;
      steps++;
    }
  } catch (e) { err = e; errors++; }
  results.push({ end: w.mode === 'end' ? w.ending : 'TIMEOUT@x=' + Math.round(w.player.x) + ' npc=' + w.npc.state + '@' + Math.round(w.npc.x) + ' ko=' + w.ko.state + ' gate=' + w.puzzle.gate.toFixed(2) + ' hatch=' + w.puzzle.hatch.toFixed(2) + ' pstate=' + w.player.state + ' z=' + Math.round(w.player.z) + ' arena=' + (w.arena && w.arena.def.id) + ' wave=' + (w.arena && w.arena.wave), secs: steps * UP.DT, stats: w.stats, err: err, log: w.npc.log.slice() });
  if (err) console.log('run', r, 'ERROR', err.stack);
  if (LOG && r === 0) w.npc.log.forEach(function (l) { console.log('  ' + l.t.toFixed(1) + 's ' + l.text); });
}
results.forEach(function (x, i) {
  console.log('#' + i, x.end, x.secs.toFixed(0) + 's', 'deaths=' + x.stats.deaths, 'req=' + x.stats.requests, 'good=' + x.stats.good, 'flawed=' + x.stats.flawed, 'hurtByNpc=' + x.stats.npcHurtPlayer, 'freed=' + x.stats.freed, 'together=' + x.stats.together, 'puzzle=' + x.stats.puzzleT.toFixed(0) + 's', 'crawl=' + x.stats.koCrawlT.toFixed(0) + 's', x.stats.cleanHurt ? 'CLEAN_HURT=' + x.stats.cleanHurt : '');
});
console.log('errors:', errors);
