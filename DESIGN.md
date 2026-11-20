# Upstairs — design

A personal prototype. The goal is to convey an emotion **through the mechanics alone**: mainly trust, plus acceptance and admiration. There is no narrative and no dialogue.

## 1. Core idea
- Under the hood it is an ordinary 2.5D beat 'em up: lanes with depth, a 3-hit combo, a jump attack, grab with knees and throws, arena locks and waves.
- Above the level sits a hidden floor. Someone is up there. You never see it until the very end.
- You find **sparks**: one universal consumable. Pressing `L` tosses a spark up through a crack.
- It catches the spark and does *something*. You cannot know exactly what. You can only guess from the machinery hanging from the ceiling (pipe, weight, claw, lamp, door) and from where its light goes.

## 2. Emotion formula
**Intent is always good; execution is imperfect.**
- **Trust** comes from vulnerability plus dependence. Tossing a spark means giving away a resource and waiting 1–3 seconds without control. Its good intent is never broken: rule 5 is absolute, and `cleanHurt` must stay 0.
- **Acceptance** comes from scripted and random clumsiness. It knocks twice afterwards (sorry) and drops a little light. You see it tried.
- **Reciprocity** comes from the rope. It runs ahead, gets snared, and two figures haul it down. You free it, or you walk past.
- **Teamwork** (v2) needs no sparks:
  - it covers your back;
  - it finishes what you throw into its light;
  - it answers your knocks;
  - in the sluice it has a goal of its own, and you two can reach it only together.
- **Being saved** (v3): in the dark you are knocked out. Helpless, you can only crawl. It cannot reach you, so it breaks through the ceiling to get its light to you. You saved it at the rope; now it saves you.
- **Admiration** comes once it is freed. A request can become a *miracle*: every machine in one sweep, steam knocking enemies toward the weight, then the claw, then the lamp. After that the ceiling opens.

## 3. The mind (hidden but readable)
You only ever see its light moving behind the cracks and which machine glows amber. The rules:
1. If you are hurt (HP below `lowHp`), it heals first: the lamp if one is near, otherwise a gift of light through a crack.
2. If enemies are around, it picks the machine with the most enemies under it right now, minus a little for distance. The claw always counts as one.
3. If nobody is under any machine, it goes to the machine nearest you and **waits** for someone to step under it. You can lure enemies there.
4. If it is quiet, it opens a nearby closed door, or gives you a gift.
5. It never drops the weight on you. It waits for you to step out, and gives up (switching to a gift) rather than hit you.

Flaws are rolled per request:
- `late`: it stumbles on the way.
- `clumsy`: the steam spills wide, the weight lands off-target, or the claw grabs air and then retries.
- `miracle`: only possible after you freed it.

The tuning panel (`` ` ``) logs every decision and its reason.

## 3b. Teamwork without sparks (v2)
- **Cover.** An enemy winds up behind your back. It knocks sharply (a louder, higher knock) and moves its light onto that enemy. The enemy's edge turns amber and a ring pulses under it.
- **Hit together.** Hit an enemy while its light is on it: double damage, a knockdown, a white+amber burst. In a busy fight it also shines on the one worth hitting from time to time (the heavy first).
- **Slam.** Throw an enemy so it lands in its light pool. It slams the enemy from above (3 s cooldown).
- **Knocks.** `L` with no sparks knocks on the ceiling. It knocks back (twice once the bond is strong) and hurries to you. While it is snared, it knocks faster. In the sluice, it knocks on the hatch: "this is the problem".

## 3c. The sluice (puzzle for two)
Elements:
- a gate across the floor;
- a winch upstairs that raises the gate;
- a hatch upstairs between it and the winch;
- a plate on the floor, linked to the hatch by a line on the wall that lights up white when pressed;
- a chain hanging next to the gate.

How it is meant to read:
1. Its light runs ahead and stops dead at the hatch. The light is cut off there, and it knocks on the hatch.
2. Standing on the plate opens the hatch. Without any spark, it runs through to the winch: here it has a goal of its own.
3. Alone it holds the gate only a little off the floor. It knocks over the chain, and the chain glows amber.
4. Hit the chain while it turns the winch. Each hit lifts the gate, and the gate sags back if you stop. Hitting the chain alone barely moves the gate.
5. The gate latches open and the hatch stays open from the far side.

Tossing a spark during the sluice gives it back (its hands are full). While the puzzle is unsolved, the camera frames the whole room.

## 3d. The dark: knockout and rescue (v3)
Between the rope and arena C. **It happens only if you freed it.** Otherwise you walk through the dark alone and nothing happens: nobody is up there to save you.
1. **No light.** The ceiling is solid here: the cracks taper shut and the floor is darker. Its light disappears; you only hear its steps. Lost contact creates unease.
2. **Ambush.** Deep in the dark only a red eye shows. Past the trigger, a brute charges and knocks you out in one blow (all HP, scripted). You are down, not dead.
3. **You are down.** The screen closes in to a circle around you, beating with a heartbeat and a faint red tint. A high ringing plays. The brute walks away without looking back.
4. **It searches.** It runs back and forth above you with distress knocks. The ceiling is solid, so it runs a little ahead (`holeOffset` 150 px) and hammers 7 heavy blows. Dust falls, and the ceiling breaks open.
5. **Its light.** A hard column of light and a bright pool on the floor: the only bright thing on screen. It knocks softly from there: "here".
6. **You crawl.** Direction keys move you in slow pulls (`crawlSpeed`). `L` knocks weakly, and it answers.
7. **The light heals you.** Crawl into the pool: the light swells, HP refills over 2.2 s, you get up, and it drops a spark as a gift.
8. **Payoff.** The brute comes back in wave 2 of arena C. It counts as the heavy, so it gets the spotlight first: answer it together.

Bot timing: ~8.5 s from the knockout to reaching the light, of which ~4.4 s is it breaking through.

## 4. Level (~3 minutes)
| Beat | Job |
|---|---|
| Corridor | Footsteps arrive from the left, light follows you, a spark on the floor, an `L ↑` hint |
| Arena A (pipe on a rail) | The first request with enemies is scripted clean; it slides the pipe over the crowd |
| Door alcove | A calm toss opens it: a spark and light inside |
| Arena B (claw + weight) | The first request is scripted clumsy, followed by the apology |
| Sluice | A puzzle for two (§3c) |
| Rope | It is snared; hit the haulers to free it. A spark tossed while it is snared comes back down |
| The dark | If it was freed: knockout, crawl, it breaks through and heals you (§3d) |
| Arena C (everything) | If it was freed, the first request is a scripted miracle. When cleared, the ceiling opens and it lowers a thread, and you rise |
| Exit | If it was never freed, you leave alone, and its knocking continues behind you |

The level is completable without ever tossing a spark.

## 5. Look and sound
- **Look:** harsh minimalism. Near-black room, white capsule (you), red-edged black shapes (them), grey machinery.
- **Amber belongs only to the one upstairs:** its light through the cracks, the shaft and the pool on the floor, the machine it works, the sparks. At the end it is revealed as your own shape in its colour.
- **Sound:** steps and knocks from upstairs are low-passed (muffled) and panned to its position. A chime plays on success, two soft knocks on a failure, and rapid knocks when it is in distress.
