// The one level (~3 minutes). Seven beats, each with one emotional job:
//   corridor  — someone is up there (footsteps, a light in the cracks); a spark on the floor;
//   arena A   — first request is answered cleanly: it waits at the pipe until an enemy steps under;
//   arena B   — first request goes wrong (clumsy), it apologises; you decide whether to ask again;
//   the sluice — a puzzle for two: you hold its way open, it works the winch, you pull the chain;
//   the rope  — it is caught; you free it (or walk past);
//   the dark  — no cracks, no light; you are knocked out and crawl to the hole it breaks for you
//               (only if you freed it: otherwise you just walk through the dark alone);
//   arena C   — if freed: one request becomes a miracle; then the ceiling opens.
// In every fight it also helps for free: it shines on the one about to hit you from behind (hit it
// together), and it slams whatever you throw into its light. The level can be finished without
// ever tossing a spark.
var UP = UP || {};

UP.LEVEL = {
  len: 6540,
  start: { x: 120, z: 92 },
  npcStart: -300,
  exitX: 6460,

  pickups: [
    { kind: 'spark', x: 430, z: 96 },
    { kind: 'spark', x: 5370, z: 118 },
  ],

  // waves: [type, side ('L' | 'R'), z]
  arenas: [
    {
      id: 'A', x0: 560, trigger: 700, dropFirstKill: 'spark', script: 'firstClean',
      waves: [
        [['grunt', 'R', 60], ['grunt', 'R', 112]],
        [['grunt', 'L', 44], ['fast', 'R', 100]],
      ],
    },
    {
      id: 'B', x0: 1760, trigger: 1900, dropFirstKill: 'spark', script: 'clumsyOnce',
      waves: [
        [['grunt', 'R', 50], ['grunt', 'R', 112], ['fast', 'L', 80]],
        [['heavy', 'R', 80], ['grunt', 'L', 40]],
      ],
    },
    {
      id: 'C', x0: 5300, trigger: 5440, script: 'miracleOnce', final: true,
      waves: [
        [['grunt', 'R', 40], ['grunt', 'R', 118], ['fast', 'L', 80]],
        [['brute', 'R', 74], ['grunt', 'L', 30], ['fast', 'R', 124], ['grunt', 'L', 110]],
      ],
    },
  ],

  // Machinery hanging from the ceiling. Only the one upstairs can work it.
  //   pipe    — steam column over |dx| < 60, all depths (the first one slides on a rail x0..x1);
  //   crusher — a weight on a gantry; dragged along x0..x1, dropped on (x, z);
  //   claw    — on a rail x0..x1; picks one enemy up and away (a heavy one is only dropped);
  //   lamp    — lets down a ball of light that rolls to you and heals;
  //   door    — an alcove in the back wall with a spark and some light inside.
  mechs: [
    { type: 'pipe', x: 1040, x0: 700, x1: 1380 },
    { type: 'door', x: 1640, contents: [['spark', 0], ['heal', 30]] },
    { type: 'claw', x0: 1800, x1: 2680, x: 1980 },
    { type: 'crusher', x0: 2080, x1: 2540, x: 2300, z: 75 },
    { type: 'pipe', x: 5540 },
    { type: 'crusher', x0: 5700, x1: 6060, x: 5880, z: 75 },
    { type: 'claw', x0: 5340, x1: 6220, x: 6100 },
    { type: 'lamp', x: 6150 },
  ],

  // The sluice: a gate across the floor, opened only from upstairs by a winch. The winch is behind
  // a hatch the one upstairs cannot pass; the hatch opens while you stand on the plate (a white line
  // on the wall connects the two). The gate is too heavy for it alone: while it turns the winch,
  // you hit the chain. Together the gate goes up and stays up.
  puzzle: {
    zoneX: 2820,              // from here on it leads the way to the winch
    plate: { x: 2960, z: 104 },
    hatchX: 3270,
    winchX: 3500,
    chain: { x: 3560, z: 72 },
    gateX: 3640,
  },

  // A snare: two figures hold a rope that runs up into a crack. When the one upstairs runs ahead
  // and steps on it, they start hauling. Hit them and the rope goes slack.
  rope: { x: 4050, captureAt: 3830, pullers: [[3984, 66], [4118, 98]] },

  // The dark: a stretch with a solid ceiling (no cracks, so no light gets through). Deep in it a
  // brute waits (only its eye shows). It knocks you out in one blow and walks away. You can only
  // crawl. Up there it searches, then hammers a hole through the ceiling a little ahead of you;
  // crawl into that light and it heals you. Happens only if you freed it.
  dark: { x0: 4320, x1: 5000, trigger: 4560, bruteX: 4930, holeOffset: 150, holeMin: 4500, holeMax: 4900 },
};
