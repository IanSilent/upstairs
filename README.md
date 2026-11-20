# Upstairs (Наверху)

**Play in the browser: https://iansilent.github.io/upstairs/**

A personal prototype: a small 2.5D beat 'em up in which an unseen helper upstairs conveys trust through mechanics. See [DESIGN.md](DESIGN.md).

## Run
Open `index.html` in a browser by double-clicking it. There is no build step and nothing to install.

## Controls
| Key | Action |
|---|---|
| WASD / arrows | Move |
| J / Z | Attack (press 3 times for a combo; in the air: jump attack) |
| K / X / Space | Jump |
| Walk into an enemy | Grab |
| J while grabbing | Knee |
| direction + J, or K, while grabbing | Throw |
| L / C / E | Toss a spark upstairs (with no sparks: knock on the ceiling) |
| Esc | Pause |
| R | Restart (while paused, or on the end screen) |
| `` ` `` | Tuning panel and decision log |
| Shift+1..6 | Jump to arena A / arena B / the sluice / the rope / the dark / the finale |
| Arrows while knocked out | Crawl |

## Share
`node tools/build.js` writes `dist/naverhu.html`: one self-contained file (CSS and scripts inlined) that a friend can open with a double click.

## Tools
- `node tools/check.js [runs] [--log] [--notoss] [--nofree] [--nopuzzle]` runs a headless bot playthrough on the real simulation. It reports the ending, time, deaths and NPC request outcomes. The `CLEAN_HURT` flag must never appear.
- In the browser, `UP.game.advance(seconds, inputFn)` steps the game synchronously, so it works even in a hidden tab.
