// Upstairs — constants and tunable parameters.
// World space: x = position along the level (px), z = depth on the floor (0 = far wall, ZMAX = near
// edge), y = height above the floor (px, up is positive). Screen space is 960x540, y down.
var UP = UP || {};

UP.W = 960;
UP.H = 540;
UP.DT = 1 / 60;               // fixed simulation step
UP.CEIL_Y = 112;              // screen y of the ceiling's lower edge
UP.FLOOR_TOP = 262;           // screen y of depth z = 0
UP.FLOOR_BOT = 470;           // screen y of depth z = ZMAX
UP.ZMAX = 150;

UP.zToY = function (z) { return UP.FLOOR_TOP + z * (UP.FLOOR_BOT - UP.FLOOR_TOP) / UP.ZMAX; };
UP.zScale = function (z) { return 0.88 + 0.24 * z / UP.ZMAX; };

// [group, key, default, min, max, step, label]
UP.PARAMS_DEF = [
  ['Игрок', 'walkX', 230, 80, 500, 5, 'Скорость по X'],
  ['Игрок', 'walkZ', 150, 50, 400, 5, 'Скорость по глубине'],
  ['Игрок', 'jumpV', 560, 200, 1000, 10, 'Сила прыжка'],
  ['Игрок', 'gravity', 1700, 600, 4000, 50, 'Гравитация'],
  ['Игрок', 'maxHp', 100, 20, 400, 5, 'Здоровье'],
  ['Игрок', 'god', 0, 0, 1, 1, 'Бессмертие (0/1)'],
  ['Игрок', 'crawlSpeed', 40, 5, 200, 1, 'Нокаут: скорость ползком'],

  ['Бой', 'hitDmg', 8, 1, 40, 1, 'Удар 1–2: урон'],
  ['Бой', 'finDmg', 15, 1, 60, 1, 'Удар 3: урон'],
  ['Бой', 'jumpDmg', 14, 1, 60, 1, 'Удар в прыжке: урон'],
  ['Бой', 'kneeDmg', 7, 1, 40, 1, 'Колено в захвате: урон'],
  ['Бой', 'throwDmg', 16, 1, 60, 1, 'Бросок: урон'],
  ['Бой', 'hitstop', 0.055, 0, 0.2, 0.005, 'Стоп-кадр при попадании (с)'],
  ['Бой', 'knockV', 270, 50, 800, 10, 'Отброс'],

  ['Враги', 'enemyDmgMul', 1, 0, 3, 0.05, 'Урон врагов ×'],
  ['Враги', 'enemyHpMul', 1, 0.2, 3, 0.05, 'Здоровье врагов ×'],
  ['Враги', 'enemySpeedMul', 1, 0.3, 2, 0.05, 'Скорость врагов ×'],
  ['Враги', 'maxAttackers', 2, 1, 6, 1, 'Атакуют одновременно'],

  ['Сосед', 'npcWalk', 240, 60, 800, 10, 'Скорость: идёт следом'],
  ['Сосед', 'npcRun', 560, 100, 1400, 10, 'Скорость: бежит по делу'],
  ['Сосед', 'thinkTime', 0.4, 0, 2, 0.05, 'Пауза «подумать» (с)'],
  ['Сосед', 'armTime', 0.55, 0.1, 2, 0.05, 'Подготовка механизма (с)'],
  ['Сосед', 'waitMax', 3.5, 0, 10, 0.1, 'Ждёт врагов у механизма (с)'],
  ['Сосед', 'safeWait', 1.5, 0, 5, 0.1, 'Ждёт, пока игрок отойдёт (с)'],
  ['Сосед', 'lateChance', 0.12, 0, 1, 0.01, 'Шанс: замешкался'],
  ['Сосед', 'clumsyChance', 0.15, 0, 1, 0.01, 'Шанс: неуклюже'],
  ['Сосед', 'miracleChance', 0.25, 0, 1, 0.01, 'Шанс чуда (после спасения)'],
  ['Сосед', 'lowHp', 0.4, 0, 1, 0.05, 'Порог «игроку плохо» (доля HP)'],
  ['Сосед', 'clumsyDmg', 7, 0, 30, 1, 'Урон игроку от неуклюжести'],
  ['Сосед', 'steamDmg', 26, 1, 100, 1, 'Пар: урон'],
  ['Сосед', 'crushDmg', 45, 1, 150, 1, 'Груз: урон'],
  ['Сосед', 'lampHeal', 35, 0, 100, 1, 'Лампа: лечение'],
  ['Сосед', 'giftHeal', 15, 0, 100, 1, 'Подарок сквозь щель: лечение'],
];

UP.P = {};
UP.resetParams = function () {
  UP.PARAMS_DEF.forEach(function (d) { UP.P[d[1]] = d[2]; });
};
UP.resetParams();

// Palette: harsh minimalism. White is you, red-edged black is them, amber is the one upstairs.
UP.C = {
  bg: '#0a0a0c',
  wall: '#111114',
  wallLine: '#18181d',
  floor: '#151519',
  floorLine: '#1c1c22',
  ceil: '#050506',
  player: '#ece9e2',
  enemy: '#0b0b0d',
  enemyEdge: '#b53a3c',
  amber: '#ffb347',
  amberRGB: '255,179,71',
  mech: '#3a3a42',
  mechHi: '#6a6a74',
  hud: '#ece9e2',
};
