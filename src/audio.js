// Procedural audio (WebAudio, no files). One short synthesized sound per world event, plus a low
// room drone. Sounds from upstairs (steps, knocks) are muffled through a lowpass and panned by
// where the light is, so you can follow it with your ears.
// Every method is a safe no-op before init() or without WebAudio.
var UP = UP || {};

UP.Audio = (function () {
  var ctx = null, master, sfx, above, noiseBuf, drone;
  var camCenter = 0;
  var volume = 0.8;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = volume;
    comp.connect(master); master.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(comp);
    // "Through the ceiling": muffled.
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.7;
    above = ctx.createGain(); above.gain.value = 1.2; above.connect(lp); lp.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startDrone(comp);
  }

  function startDrone(out) {
    var g = ctx.createGain(); g.gain.value = 0.0; g.connect(out);
    g.gain.setTargetAtTime(0.05, ctx.currentTime, 2);
    [55, 55.4, 82.5].forEach(function (f) {
      var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start();
    });
    var n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    var bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 180;
    var ng = ctx.createGain(); ng.gain.value = 0.25;
    n.connect(bp); bp.connect(ng); ng.connect(g); n.start();
    drone = g;
  }

  function pan(x) {
    var p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) p.pan.value = UP.clamp((x - camCenter) / 520, -1, 1);
    return p;
  }

  // Tiny voice helpers --------------------------------------------------------
  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function tone(o) {
    var t = ctx.currentTime + (o.delay || 0);
    var osc = ctx.createOscillator(); osc.type = o.wave || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.slide || o.dec));
    var g = ctx.createGain(); env(g, t, o.a || 0.005, o.v || 0.3, o.dec || 0.2);
    osc.connect(g);
    route(g, o);
    osc.start(t); osc.stop(t + (o.a || 0.005) + (o.dec || 0.2) + 0.05);
  }
  function noise(o) {
    var t = ctx.currentTime + (o.delay || 0);
    var s = ctx.createBufferSource(); s.buffer = noiseBuf;
    var f = ctx.createBiquadFilter(); f.type = o.ft || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t); f.Q.value = o.q || 1;
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.dec || 0.2));
    var g = ctx.createGain(); env(g, t, o.a || 0.003, o.v || 0.3, o.dec || 0.15);
    s.connect(f); f.connect(g);
    route(g, o);
    s.start(t, Math.random() * 0.5); s.stop(t + (o.a || 0.003) + (o.dec || 0.15) + 0.05);
  }
  function route(node, o) {
    var dest = o.above ? above : sfx;
    if (o.x !== undefined) { var p = pan(o.x); if (p) { node.connect(p); p.connect(dest); return; } }
    node.connect(dest);
  }

  var PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];

  function knock(e) {
    var n = e.n || 1;
    var gap = e.slow ? 0.5 : e.distress ? 0.11 : e.sorry ? 0.22 : 0.16;
    for (var i = 0; i < n; i++) {
      var d = i * gap + (e.distress ? Math.random() * 0.05 : 0);
      var v = e.soft ? 0.35 : (e.warn || e.hammer) ? 1.0 : 0.7;
      tone({ f: e.warn ? 220 : e.hammer ? 95 : 140, f2: e.hammer ? 40 : 70, dec: e.hammer ? 0.2 : 0.12, v: v, delay: d, x: e.x, above: true });
      if (e.hammer) noise({ f: 700, q: 0.6, dec: 0.12, v: 0.5, delay: d, x: e.x });
      noise({ f: 300, q: 2, dec: 0.05, v: v * 0.6, delay: d, x: e.x, above: true });
    }
  }

  function play(e) {
    if (!ctx) return;
    var x = e.x;
    switch (e.type) {
      case 'swing': noise({ f: 1800, f2: 600, q: 0.8, dec: 0.08, v: 0.08, x: x }); break;
      case 'hit':
        tone({ f: e.heavy ? 90 : 130, f2: 50, dec: 0.12, v: e.src === 'npc' ? 0.5 : 0.4, x: x });
        noise({ f: 900, q: 0.7, dec: 0.07, v: 0.35, x: x });
        if (e.kill) tone({ f: 220, f2: 110, wave: 'triangle', dec: 0.3, v: 0.12, x: x, delay: 0.05 });
        break;
      case 'kill': break;
      case 'thud': tone({ f: e.heavy ? 60 : 80, f2: 40, dec: 0.15, v: 0.3, x: x }); break;
      case 'jump': noise({ f: 600, q: 0.6, dec: 0.06, v: 0.06, x: x }); break;
      case 'land': noise({ f: 300, q: 0.6, dec: 0.05, v: 0.1, x: x }); break;
      case 'grab': noise({ f: 500, q: 1, dec: 0.06, v: 0.2, x: x }); break;
      case 'throw': noise({ f: 1200, f2: 300, q: 0.6, dec: 0.25, v: 0.15, x: x }); break;
      case 'windup': tone({ f: 330, f2: 360, wave: 'square', dec: 0.06, v: 0.035, x: x }); break;
      case 'playerHurt':
        tone({ f: 200, f2: 90, wave: 'triangle', dec: 0.18, v: 0.35, x: x });
        noise({ f: 700, q: 0.8, dec: 0.1, v: 0.3, x: x });
        break;
      case 'heal': tone({ f: 659.25, dec: 0.5, v: 0.12 }); tone({ f: 987.77, dec: 0.6, v: 0.08, delay: 0.08 }); break;
      case 'sparkGet': tone({ f: 784, dec: 0.25, v: 0.15 }); tone({ f: 1175, dec: 0.4, v: 0.1, delay: 0.07 }); break;
      case 'toss': noise({ f: 600, f2: 3000, q: 2, dec: 0.3, v: 0.12, x: x }); tone({ f: 523, f2: 1046, dec: 0.3, v: 0.08, x: x }); break;
      case 'sparkIn': tone({ f: 1318, dec: 0.4, v: 0.06, x: x }); break;
      case 'catch': tone({ f: 392, dec: 0.25, v: 0.12, x: x, above: true }); break;
      case 'step':
        noise({ f: e.run ? 220 : 160, q: 1.5, dec: 0.05, v: e.run ? 0.5 : 0.32, x: x, above: true });
        tone({ f: 70, f2: 50, dec: 0.05, v: e.run ? 0.25 : 0.15, x: x, above: true });
        break;
      case 'stumble':
        for (var s = 0; s < 4; s++) noise({ f: 200, q: 1.2, dec: 0.06, v: 0.4, x: x, above: true, delay: s * 0.07 + Math.random() * 0.03 });
        tone({ f: 90, f2: 45, dec: 0.25, v: 0.4, x: x, above: true, delay: 0.3 });
        break;
      case 'knock': knock(e); break;
      case 'steam': noise({ f: 3000, q: 0.4, a: 0.05, dec: e.wide ? 1.4 : 1.0, v: 0.3, x: x }); break;
      case 'crush':
        tone({ f: 70, f2: 30, dec: 0.5, v: 0.8, x: x });
        noise({ f: 400, q: 0.4, dec: 0.4, v: 0.5, x: x });
        break;
      case 'clawGrab': tone({ f: 1400, wave: 'square', dec: 0.05, v: 0.06, x: x }); tone({ f: 900, wave: 'square', dec: 0.05, v: 0.06, x: x, delay: 0.06 }); break;
      case 'clawMiss': tone({ f: 1400, wave: 'square', dec: 0.04, v: 0.05, x: x }); break;
      case 'lamp': tone({ f: 523.25, dec: 0.8, v: 0.1, x: x }); break;
      case 'gift': tone({ f: 880, dec: 0.5, v: 0.06, x: x }); break;
      case 'doorOpen': noise({ f: 200, q: 0.5, a: 0.2, dec: 0.8, v: 0.25, x: x }); break;
      case 'chime': {
        var base = Math.floor(Math.random() * 3), n = e.big ? 6 : 3;
        for (var i = 0; i < n; i++) tone({ f: PENTA[(base + i * 2) % PENTA.length] / (i % 2 ? 1 : 2) * 2, wave: 'triangle', dec: 0.6, v: 0.09, delay: i * 0.09, x: x });
        break;
      }
      case 'miracle':
        [261.63, 329.63, 392, 523.25].forEach(function (f, i) { tone({ f: f, wave: 'triangle', a: 0.05, dec: 1.8, v: 0.1, delay: i * 0.05 }); });
        break;
      case 'snare':
        noise({ f: 900, q: 3, dec: 0.3, v: 0.4, x: x });
        tone({ f: 300, f2: 120, wave: 'sawtooth', dec: 0.3, v: 0.08, x: x });
        break;
      case 'ropeLetGo': noise({ f: 1500, f2: 400, q: 2, dec: 0.2, v: 0.2, x: x }); break;
      case 'freed':
        [392, 493.88, 587.33, 783.99].forEach(function (f, i) { tone({ f: f, wave: 'triangle', dec: 0.9, v: 0.1, delay: i * 0.08, x: x }); });
        break;
      case 'reject': tone({ f: 330, f2: 220, dec: 0.3, v: 0.1, x: x, above: true }); break;
      case 'lock': tone({ f: 110, wave: 'triangle', dec: 0.4, v: 0.15 }); break;
      case 'clear': tone({ f: 220, wave: 'triangle', dec: 0.6, v: 0.1 }); tone({ f: 330, wave: 'triangle', dec: 0.8, v: 0.08, delay: 0.1 }); break;
      case 'death': tone({ f: 220, f2: 55, wave: 'triangle', dec: 1.2, v: 0.25 }); break;
      case 'ceilingOpen': noise({ f: 150, q: 0.5, a: 0.4, dec: 2.0, v: 0.35 }); break;
      case 'rise':
        [196, 261.63, 329.63, 392, 523.25, 659.25].forEach(function (f, i) { tone({ f: f, wave: 'sine', a: 0.6, dec: 4, v: 0.08, delay: i * 0.25 }); });
        break;
      case 'playerKnock':
        // Your knock, from below: drier and brighter than its knocks from above (weak when you are down).
        tone({ f: e.weak ? 200 : 260, f2: 160, dec: 0.07, v: e.weak ? 0.15 : 0.35, x: x });
        noise({ f: 1400, q: 2, dec: 0.04, v: e.weak ? 0.12 : 0.3, x: x });
        break;
      case 'ambush':
        tone({ f: 58, f2: 40, wave: 'sawtooth', a: 0.05, dec: 0.7, v: 0.12, x: x });
        noise({ f: 300, q: 0.6, a: 0.1, dec: 0.5, v: 0.25, x: x });
        break;
      case 'knockout':
        tone({ f: 60, f2: 25, dec: 0.8, v: 1.0, x: x });
        noise({ f: 250, q: 0.4, dec: 0.5, v: 0.7, x: x });
        tone({ f: 2600, a: 0.02, dec: 3.0, v: 0.04 });    // ringing in the ears
        if (drone) { drone.gain.setTargetAtTime(0.01, ctx.currentTime, 0.3); drone.gain.setTargetAtTime(0.05, ctx.currentTime + 6, 2); }
        break;
      case 'heartbeat':
        tone({ f: 55, f2: 40, dec: 0.12, v: e.slow ? 0.35 : 0.6 });
        tone({ f: 50, f2: 38, dec: 0.12, v: e.slow ? 0.25 : 0.45, delay: 0.22 });
        break;
      case 'crawl': noise({ f: 400, f2: 200, q: 0.8, dec: 0.18, v: 0.12, x: x }); break;
      case 'ceilingBreak':
        noise({ f: 200, q: 0.4, dec: 0.9, v: 0.8, x: x });
        tone({ f: 50, f2: 30, dec: 0.6, v: 0.8, x: x });
        for (var rb = 0; rb < 6; rb++) noise({ f: 900 + Math.random() * 1500, q: 3, dec: 0.05, v: 0.2, x: x, delay: 0.15 + rb * 0.09 + Math.random() * 0.05 });
        [392, 523.25, 659.25].forEach(function (f, i) { tone({ f: f, wave: 'triangle', a: 0.2, dec: 1.6, v: 0.07, delay: 0.3 + i * 0.1, x: x }); });
        break;
      case 'rescueHeal':
        [196, 261.63, 329.63, 392, 493.88].forEach(function (f, i) { tone({ f: f, wave: 'sine', a: 0.5, dec: 2.4, v: 0.09, delay: i * 0.18 }); });
        break;
      case 'rescued': tone({ f: 784, wave: 'triangle', dec: 0.8, v: 0.1 }); tone({ f: 1046.5, wave: 'triangle', dec: 1.0, v: 0.08, delay: 0.1 }); break;
      case 'stomp':
        tone({ f: 90, f2: 40, dec: 0.3, v: 0.8, x: x, above: true });
        noise({ f: 500, q: 0.5, dec: 0.25, v: 0.5, x: x });
        break;
      case 'together':
        tone({ f: 110, f2: 55, dec: 0.2, v: 0.6, x: x });
        tone({ f: 659.25, wave: 'triangle', dec: 0.5, v: 0.12, x: x });
        tone({ f: 987.77, wave: 'triangle', dec: 0.6, v: 0.1, x: x, delay: 0.04 });
        break;
      case 'bump': tone({ f: 80, f2: 50, dec: 0.15, v: 0.5, x: x, above: true }); break;
      case 'heave':
        tone({ f: 70, f2: 55, dec: 0.25, v: 0.5, x: x, above: true });
        tone({ f: 180 + Math.random() * 30, f2: 240, wave: 'sawtooth', dec: 0.25, v: 0.04, x: x });
        break;
      case 'chain':
        tone({ f: 1800, wave: 'square', dec: 0.03, v: 0.05, x: x });
        tone({ f: 2400, wave: 'square', dec: 0.03, v: 0.04, x: x, delay: 0.03 });
        noise({ f: 3000, q: 3, dec: 0.08, v: 0.15, x: x });
        if (!e.together) tone({ f: 120, f2: 100, dec: 0.2, v: 0.15, x: x });
        break;
      case 'hatch': noise({ f: e.open ? 300 : 200, f2: e.open ? 700 : 150, q: 1, a: 0.05, dec: 0.4, v: 0.3, x: x, above: true }); break;
      case 'plateDown': tone({ f: 200, dec: 0.06, v: 0.2, x: x }); noise({ f: 800, q: 1, dec: 0.04, v: 0.15, x: x }); break;
      case 'plateUp': tone({ f: 160, dec: 0.05, v: 0.12, x: x }); break;
      case 'winchStart': tone({ f: 150, f2: 260, wave: 'sawtooth', dec: 0.6, v: 0.05, x: x }); break;
      case 'gateOpen':
        noise({ f: 400, f2: 2000, q: 0.8, a: 0.1, dec: 1.0, v: 0.35, x: x });
        [261.63, 392, 523.25, 659.25].forEach(function (f, i) { tone({ f: f, wave: 'triangle', dec: 1.2, v: 0.09, delay: 0.3 + i * 0.08, x: x }); });
        break;
      case 'end':
        if (drone) drone.gain.setTargetAtTime(e.how === 'together' ? 0.03 : 0.07, ctx.currentTime, 1);
        break;
    }
  }

  return {
    init: init,
    play: play,
    setCam: function (cx) { camCenter = cx; },
    setVolume: function (v) { volume = v; if (master) master.gain.value = v; },
    getVolume: function () { return volume; },
  };
})();
