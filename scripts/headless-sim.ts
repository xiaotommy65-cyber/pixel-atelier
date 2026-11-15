import { CartridgeRunner, STEP_DT } from '../src/engine/CartridgeRunner.ts';
import type { InputState } from '../src/engine/WorldTypes.ts';

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

testCloudberryHop();
testSugarStarlight();
testSandboxAndGpuBenchmark();
console.log('[SIM ALL PASSED] Pixel Atelier deterministic simulation & GPU batch check passed!');
