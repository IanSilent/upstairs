// Boot and main loop: fixed-step simulation, events -> audio + renderer, scaling to the window.
var UP = UP || {};

(function () {
  var canvas = document.getElementById('game');
  var stage = document.getElementById('stage');
  var input = new UP.Input();
  var game = { world: new UP.World(), state: 'title', paused: false };
  var renderer = new UP.Renderer(canvas);
  var ui = new UP.UI(game);
  UP.game = game;

  function fit() {
    var k = Math.min(window.innerWidth / UP.W, window.innerHeight / UP.H);
    stage.style.width = Math.floor(UP.W * k) + 'px';
    stage.style.height = Math.floor(UP.H * k) + 'px';
    stage.style.fontSize = (k * 16) + 'px';
  }
  window.addEventListener('resize', fit);
  fit();

  function restart() {
    game.world = new UP.World();
    renderer = new UP.Renderer(canvas);
    game.paused = false; ui.showPause(false);
  }

  window.addEventListener('keydown', function (e) {
    if (e.code === 'Backquote') { ui.togglePanel(); e.preventDefault(); return; }
    if (game.state === 'title') {
      if (e.code === 'KeyJ' || e.code === 'KeyZ' || e.code === 'Enter' || e.code === 'Space') {
        UP.Audio.init();
        game.state = 'play'; ui.showTitle(false);
        input.queue = {};
      }
      return;
    }
    if (e.code === 'Escape') { game.paused = !game.paused; ui.showPause(game.paused); }
    if (e.code === 'KeyR' && (game.paused || game.world.mode === 'end')) restart();
    if (e.shiftKey && /^Digit[1-6]$/.test(e.code)) {
      UP.debugJump(game.world, UP.DEBUG_BEATS[+e.code.slice(5) - 1]);
    }
  });

  // Testing hook: advance the game by `sec` seconds synchronously (works in a hidden tab).
  game.advance = function (sec, inp) {
    var w = game.world;
    for (var t = 0; t < sec; t += UP.DT) {
      w.update(UP.DT, inp ? inp(w) : input.take());
      for (var i = 0; i < w.events.length; i++) renderer.event(w.events[i], w);
      w.events.length = 0;
      w = game.world;
    }
    renderer.draw(w, UP.DT);
  };

  var acc = 0, last = performance.now();
  function frame(now) {
    var dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    var w = game.world;
    if (game.state === 'play' && !game.paused) {
      acc += dt;
      var steps = 0;
      while (acc >= UP.DT && steps < 6) {
        w.update(UP.DT, input.take());
        acc -= UP.DT; steps++;
      }
      if (steps === 6) acc = 0;
    } else {
      input.take();
    }
    UP.Audio.setCam(w.camX + UP.W / 2);
    for (var i = 0; i < w.events.length; i++) {
      UP.Audio.play(w.events[i]);
      renderer.event(w.events[i], w);
    }
    w.events.length = 0;
    // Faint motes drifting down from the cracks, more of them near the light.
    if (game.state === 'play' && Math.random() < 0.25) w.puff(w.npc.x + (Math.random() - 0.5) * 200, UP.CEIL_Y, 'motes');
    renderer.draw(w, game.state === 'play' && !game.paused ? dt : 0);
    ui.update();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
