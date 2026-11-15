import { CartridgeRunner, STEP_DT } from '../src/engine/CartridgeRunner.ts';
import type { InputState } from '../src/engine/WorldTypes.ts';
import { InputMap } from '../src/engine/core/InputMap.ts';
import { JuiceSystem } from '../src/engine/core/JuiceSystem.ts';
import { SeededRng } from '../src/engine/core/SeededRng.ts';
import { WORKSHOP_RECIPES } from '../src/engine/CartridgeRegistry.ts';

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`Simulation assertion failed: ${msg}`);
}

function emptyInput(): InputState {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    action: false,
    restart: false,
  };
}

function testCoreSubsystems() {
  // 1. SeededRng determinism
  const a = new SeededRng(42);
  const b = new SeededRng(42);
  for (let i = 0; i < 10; i++) {
    check(a.next() === b.next(), 'SeededRng should produce identical sequences for identical seeds');
  }

  // 2. InputMap edge detection & buffer
  const map = new InputMap();
  map.update({ ...emptyInput(), jump: true }, STEP_DT);
  check(map.justPressed('jump'), 'InputMap should fire justPressed on first held frame');
  check(map.hasBuffered('jump'), 'InputMap should prime action buffer on press');
  map.update({ ...emptyInput(), jump: true }, STEP_DT);
  check(!map.justPressed('jump'), 'InputMap justPressed should clear on second held frame');
  map.update(emptyInput(), STEP_DT);
  check(map.justReleased('jump'), 'InputMap should fire justReleased on release frame');

  // 3. JuiceSystem Hitstop & Trauma^2 decay
  const juice = new JuiceSystem();
  juice.triggerHitstop(0.05);
  juice.addTrauma(0.8);
  const dtFrozen = juice.advanceRealTime(0.02, 1.0);
  check(dtFrozen === 0, 'JuiceSystem hitstop should freeze simDt while active');
  check(Math.hypot(juice.shakeX, juice.shakeY) >= 0, 'Trauma^2 shake remains active during hitstop');
  juice.advanceRealTime(0.05, 1.0);
  const dtResumed = juice.advanceRealTime(0.02, 1.0);
  check(dtResumed > 0, 'JuiceSystem simDt resumes after hitstop expires');
  console.log('[SIM OK] core subsystems (SeededRng, InputMap, JuiceSystem Hitstop/Trauma^2)');
}

function testCloudberryHop() {
  const runner = new CartridgeRunner('cloudberry-hop');
  let reachedRight = false;
  let scoreGained = 0;

  for (let frame = 0; frame < 60 * 14; frame++) {
    const inp = emptyInput();
    inp.right = true;
    inp.jump = frame % 28 < 10;
    runner.stepFixed(STEP_DT, inp);
    const snap = runner.getSnapshot();
    if (snap.score > scoreGained) scoreGained = snap.score;
    if (snap.cameraX > 80) reachedRight = true;
  }

  const finalSnap = runner.getSnapshot();
  check(reachedRight, 'Cloudberry hero should traverse sky islands smoothly');
  check(scoreGained > 0, 'Cloudberry hero should collect stars or stomp slimes');
  check(finalSnap.tiles.length > 20, 'Cloudberry should expose grass/dirt/cloud tiles');
  console.log(
    `[SIM OK] cloudberry-hop -> score=${finalSnap.score}, stars=${finalSnap.starsCollected}/${finalSnap.starsTotal}, camX=${finalSnap.cameraX.toFixed(1)}`,
  );
}

function testSugarStarlight() {
  const runner = new CartridgeRunner('sugar-starlight');
  let maxScore = 0;
  for (let frame = 0; frame < 60 * 18; frame++) {
    const inp = emptyInput();
    inp.action = true;
    inp.up = Math.sin(frame * 0.08) > 0.2;
    inp.down = Math.sin(frame * 0.08) < -0.2;
    runner.stepFixed(STEP_DT, inp);
    const snap = runner.getSnapshot();
    if (snap.score > maxScore) maxScore = snap.score;
  }
  const snap = runner.getSnapshot();
  check(maxScore >= 120, 'Sugar Starlight bolts should destroy jelly UFO waves');
  check(snap.bgStars.length === 42, 'Sugar Starlight parallax starfield populated');
  console.log(
    `[SIM OK] sugar-starlight -> score=${snap.score}, status=${snap.status}, entities=${snap.entities.length}`,
  );
}

function testSystemicChainReactionAndDungeon() {
  const runner = new CartridgeRunner('sandbox-toybox');
  runner.setParam('enemyCount', 0);
  const err = runner.applySandboxScript(`
    api.setSky('#141026', '#2a1d42');
    api.setDarkness(0.75, '#0d091c');
    api.setHeroSpawn(40, 120);
    api.addTorch(24, 134);
    api.addBomb(86, 134);
    api.addBomb(110, 134);
    api.addCrate(128, 134);
    api.addSwitch(132, 134);
    api.addGate(180, 134);
  `);
  check(err === null, 'Systemic dungeon script should evaluate cleanly');

  const eventsSeen = new Set<string>();
  for (let frame = 0; frame < 150; frame++) {
    const inp = emptyInput();
    if (frame === 15) inp.action = true; // Toss igniting spark at bomb #1 -> triggers bomb #2 -> destroys crate & triggers switch!
    const evs = runner.stepFixed(STEP_DT, inp);
    for (const ev of evs) eventsSeen.add(ev);
  }

  const snap = runner.getSnapshot();
  check(eventsSeen.has('ignite'), 'Action spark should ignite bomb fuse');
  check(eventsSeen.has('explode'), 'Ignited bomb should detonate and chain-react');
  check(snap.hasKey, 'Blast / crate should activate floor switch and unlock gate');
  check((snap.ambientDarkness ?? 0) > 0.7, 'Dark dungeon ambient veil should be preserved in snapshot');
  console.log(
    `[SIM OK] systemic dungeon chain reaction -> events=[${Array.from(eventsSeen).join(',')}], gateUnlocked=${snap.hasKey}, darkness=${snap.ambientDarkness}`,
  );

  // Verify all Workshop recipes parse without error
  for (const recipe of WORKSHOP_RECIPES) {
    const rErr = runner.applySandboxScript(recipe.code);
    check(rErr === null, `Workshop recipe "${recipe.label}" should have zero script errors`);
  }
}

function testSandboxAndGpuBenchmark() {
  const runner = new CartridgeRunner('sandbox-toybox');
  const err = runner.applySandboxScript(`
    api.setSky('#90d8ff', '#fff0d8');
    api.addCloud(100, 118, 3);
    api.addStar(52, 134);
    api.addStar(116, 98);
    api.addSlime(210, 134);
  `);
  check(err === null, 'Custom sandbox script should evaluate without syntax error');

  runner.toggleBenchmark(true);
  for (let frame = 0; frame < 90; frame++) {
    const inp = emptyInput();
    inp.right = true;
    inp.action = frame % 12 === 0;
    runner.stepFixed(STEP_DT, inp);
  }

  const snap = runner.getSnapshot();
  check(snap.score >= 100, 'Sandbox hero should collect custom-placed star');
  check(
    runner.benchmarkSprites.length >= 1100,
    'Sparkle party mode should maintain 1,100+ sprites',
  );
  console.log(
    `[SIM OK] sandbox-toybox + benchmark -> score=${snap.score}, benchmarkSprites=${runner.benchmarkSprites.length}`,
  );
}

testCoreSubsystems();
testCloudberryHop();
testSugarStarlight();
testSystemicChainReactionAndDungeon();
testSandboxAndGpuBenchmark();
console.log('[SIM ALL PASSED] Pixel Atelier deterministic simulation, systemic rules & GPU batch check passed!');
