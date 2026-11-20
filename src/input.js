// Keyboard input. Presses are queued on keydown so taps shorter than a frame are never lost;
// the simulation consumes them once per step via take().
//
// Layout: WASD / arrows move, J / Z attack, K / X / Space jump, L / C / E toss a spark upstairs.
var UP = UP || {};

UP.KEYMAP = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  attack: ['KeyJ', 'KeyZ'],
  jump: ['KeyK', 'KeyX', 'Space'],
  toss: ['KeyL', 'KeyC', 'KeyE'],
};

UP.Input = function () {
  var self = this;
  this.down = {};
  this.queue = {};
  this.codeToAction = {};
  this.lastInput = 0;          // performance.now() of the last game key press
  Object.keys(UP.KEYMAP).forEach(function (a) {
    UP.KEYMAP[a].forEach(function (c) { self.codeToAction[c] = a; });
  });
  window.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target && (e.target.tagName === 'INPUT')) return;
    var a = self.codeToAction[e.code];
    if (a) {
      e.preventDefault();
      if (!e.repeat) self.queue[a] = true;
      self.lastInput = performance.now();
    }
    self.down[e.code] = true;
  });
  window.addEventListener('keyup', function (e) { self.down[e.code] = false; });
  window.addEventListener('blur', function () { self.down = {}; });
};

UP.Input.prototype.held = function (a) {
  var codes = UP.KEYMAP[a];
  for (var i = 0; i < codes.length; i++) if (this.down[codes[i]]) return true;
  return false;
};

// Snapshot for one simulation step: held directions plus presses queued since the last take().
UP.Input.prototype.take = function () {
  var s = {
    dx: (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0),
    dz: (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0),
    attack: !!this.queue.attack,
    jump: !!this.queue.jump,
    toss: !!this.queue.toss,
  };
  this.queue = {};
  return s;
};

UP.Input.idle = function () { return { dx: 0, dz: 0, attack: false, jump: false, toss: false }; };
