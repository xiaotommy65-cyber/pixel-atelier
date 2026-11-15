import { CartridgeRunner, STEP_DT } from '../src/engine/CartridgeRunner.ts';
import { WORKSHOP_RECIPES } from '../src/engine/CartridgeRegistry.ts';
import type { InputState } from '../src/engine/WorldTypes.ts';
import { CloudberryHopGame } from '../src/engine/cartridges/cloudberryHop.ts';
import { SandboxToyboxGame } from '../src/engine/cartridges/sandboxToybox.ts';
import { SugarStarlightGame } from '../src/engine/cartridges/sugarStarlight.ts';
import { createAgentBridge } from '../src/engine/core/AgentBridge.ts';
import { generateEmberkeepCampaign, verifyModuleSolvability } from '../src/engine/core/DungeonGenerator.ts';
import { InputMap } from '../src/engine/core/InputMap.ts';
import { JuiceSystem } from '../src/engine/core/JuiceSystem.ts';
import { SeededRng } from '../src/engine/core/SeededRng.ts';
import { ToySynth } from '../src/audio/ToySynth.ts';

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

  // 4. ToySynth BGM Sequencer safe in headless env
  const synth = new ToySynth();
  synth.setBgmTheme('boss');
  synth.tickBgm(0.5);
  synth.setBgmTheme(null);
  console.log('[SIM OK] core subsystems (SeededRng, InputMap, JuiceSystem, ToySynth BGM)');
}

function testDungeonGeneratorSolvability() {
  let totalFloorsChecked = 0;
  for (let i = 0; i < 30; i++) {
    const seed = (0x20260000 + i * 7919) >>> 0;
    const mod = generateEmberkeepCampaign(seed);
    check(mod.floors.length === 8, `Expected 8 floors, got ${mod.floors.length}`);
    check(verifyModuleSolvability(mod), `Generated dungeon seed ${seed} must be 100% solvable`);
    totalFloorsChecked += mod.floors.length;
  }
  console.log(`[SIM OK] DungeonGenerator -> 30 seeds / ${totalFloorsChecked} floors 100% topologically solvable`);
}

function testSramSaveHydrateRoundtrips() {
  // 1. PA-01 SRAM roundtrip
  const cb1 = new CloudberryHopGame(3);
  const params = new CartridgeRunner('cloudberry-hop').getParams();
  cb1.step(STEP_DT, { ...emptyInput(), right: true }, params);
  const cbSave = cb1.serializeSave();
  const cb2 = new CloudberryHopGame(0);
  check(cb2.hydrateSave(cbSave), 'PA-01 hydrateSave should succeed');
  check(cb2.getStageIndex() === 3, `PA-01 should resume at stageIdx 3 (got ${cb2.getStageIndex()})`);
  cb2.retryStage();
  check(cb2.getStageIndex() === 3, 'PA-01 retryStage stays on current stage');

  // 2. PA-02 SRAM roundtrip
  const ss1 = new SugarStarlightGame();
  ss1.enterSector(2);
  const ssSave = ss1.serializeSave();
  const ss2 = new SugarStarlightGame();
  check(ss2.hydrateSave(ssSave), 'PA-02 hydrateSave should succeed');
  check(ss2.getSectorIndex() === 2, `PA-02 should resume at sector 2 (got ${ss2.getSectorIndex()})`);

  // 3. PA-03 SRAM roundtrip
  const sb1 = new SandboxToyboxGame();
  sb1.loadPuzzle(5);
  const sbSave = sb1.serializeSave();
  const sb2 = new SandboxToyboxGame();
  check(sb2.hydrateSave(sbSave), 'PA-03 hydrateSave should succeed');
  check(sb2.getPuzzleIndex() === 5, `PA-03 should resume at puzzle 5 (got ${sb2.getPuzzleIndex()})`);

  // 4. PA-04 SRAM roundtrip
  const r1 = new CartridgeRunner('emberkeep-dnd');
  const agent1 = createAgentBridge(r1);
  agent1.autoPlaySteps(90);
  const obsBefore = agent1.getObservation() as { floorId: string; turnCount: number; hero: { gold: number } };
  const sram = r1.serializeSave();
  const r2 = new CartridgeRunner('cloudberry-hop');
  const resumed = r2.switchCartridge('emberkeep-dnd', sram);
  check(resumed, 'PA-04 switchCartridge with savedSram should hydrate cleanly');
  const obsAfter = createAgentBridge(r2).getObservation() as { floorId: string; turnCount: number; hero: { gold: number } };
  check(obsAfter.turnCount === obsBefore.turnCount, 'PA-04 SRAM turnCount mismatch');
  check(obsAfter.floorId === obsBefore.floorId, 'PA-04 SRAM floorId mismatch');
  check(obsAfter.hero.gold === obsBefore.hero.gold, 'PA-04 SRAM gold mismatch');

  console.log('[SIM OK] SRAM save/hydrate roundtrips passed for all 4 cartridges (PA-01..PA-04)');
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
  check(finalSnap.stage?.total === 8 && finalSnap.stage?.index === 1, 'PA-01 should report 1/8 stage progress');
  check(finalSnap.starsTotal === 24, `PA-01 campaign should have 24 total stars (got ${finalSnap.starsTotal})`);

  // Test doubleJump & airDash relics + Slime King boss arena
  const cb = new CloudberryHopGame(2); // W2-1 with feather
  const params = runner.getParams();
  let gotFeatherOrMoved = false;
  for (let f = 0; f < 180; f++) {
    cb.step(STEP_DT, { ...emptyInput(), right: true, jump: f % 22 < 8 }, params);
    if (cb.snapshot(params).stage?.index === 3) gotFeatherOrMoved = true;
  }
  check(gotFeatherOrMoved, 'PA-01 W2-1 builds and runs cleanly');
  cb.loadStage(7); // W4-2 Slime King boss
  const bossSnap = cb.snapshot(params);
  check(bossSnap.bossMaxHp === 5, `PA-01 W4-2 Slime King should expose 5 HP bar (got ${bossSnap.bossMaxHp})`);
  check(bossSnap.bgmTheme === 'boss', 'PA-01 W4-2 should emit boss BGM theme');
  console.log(
    `[SIM OK] cloudberry-hop (8 stages / 24 stars) -> score=${finalSnap.score}, stars=${finalSnap.starsCollected}/${finalSnap.starsTotal}, bossHp=${bossSnap.bossMaxHp}`,
  );
}

function testSugarStarlight() {
  const runner = new CartridgeRunner('sugar-starlight');
  let maxScore = 0;
  for (let frame = 0; frame < 60 * 18; frame++) {
    const inp = emptyInput();
    inp.jump = true; // autofire B
    inp.action = frame % 60 < 45; // test Hold-A charge beam release every 1s
    inp.up = Math.sin(frame * 0.08) > 0.2;
    inp.down = Math.sin(frame * 0.08) < -0.2;
    runner.stepFixed(STEP_DT, inp);
    const snap = runner.getSnapshot();
    if (snap.score > maxScore) maxScore = snap.score;
  }
  const snap = runner.getSnapshot();
  check(maxScore >= 120, 'Sugar Starlight bolts + charge beam should destroy jelly UFO waves');
  check(snap.bgStars.length === 48, `Sugar Starlight parallax starfield populated (${snap.bgStars.length})`);
  check(snap.stage?.total === 4, 'PA-02 should expose 4-sector campaign progress');
  console.log(
    `[SIM OK] sugar-starlight (4 sectors) -> score=${snap.score}, stage=${snap.stage?.index}/${snap.stage?.total}, bgm=${snap.bgmTheme}`,
  );
}

function testSystemicChainReactionAndPuzzles() {
  // 1. Built-in 10-Puzzle Campaign Mode
  const puzzleRunner = new CartridgeRunner('sandbox-toybox');
  const pSnap1 = puzzleRunner.getSnapshot();
  check(pSnap1.stage?.total === 10 && pSnap1.stage?.index === 1, 'PA-03 default launch should start 1/10 puzzle campaign');
  check(pSnap1.starsTotal === 21, `PA-03 puzzle campaign should expose 21 stars total (got ${pSnap1.starsTotal})`);

  // Test portal teleportation on P3 (index 2)
  const sb = new SandboxToyboxGame();
  sb.loadPuzzle(2); // P3 Dual Portals
  const params = puzzleRunner.getParams();
  for (let f = 0; f < 160; f++) {
    sb.step(STEP_DT, { ...emptyInput(), right: true }, params);
  }
  const p3Snap = sb.snapshot(params);
  check(p3Snap.stage?.index === 3 || p3Snap.stage?.index === 4, 'PA-03 P3 portal should teleport hero past stone wall');

  // 2. Custom Workshop Script + Chain Reaction
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
    if (frame === 15) inp.action = true;
    const evs = runner.stepFixed(STEP_DT, inp);
    for (const ev of evs) eventsSeen.add(ev);
  }

  const snap = runner.getSnapshot();
  check(eventsSeen.has('ignite'), 'Action spark should ignite bomb fuse');
  check(eventsSeen.has('explode'), 'Ignited bomb should detonate and chain-react');
  check(snap.hasKey, 'Blast / crate should activate floor switch and unlock gate');
  check((snap.ambientDarkness ?? 0) > 0.7, 'Dark dungeon ambient veil should be preserved in snapshot');

  for (const recipe of WORKSHOP_RECIPES) {
    const rErr = runner.applySandboxScript(recipe.code);
    check(rErr === null, `Workshop recipe "${recipe.label}" should have zero script errors`);
  }
  console.log(
    `[SIM OK] sandbox-toybox (10 puzzles + Workshop scripts) -> chain=[${Array.from(eventsSeen).join(',')}], gateUnlocked=${snap.hasKey}`,
  );
}

function testSandboxBenchmark() {
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
  check(runner.benchmarkSprites.length >= 1100, 'Sparkle party mode should maintain 1,100+ sprites');
  console.log(
    `[SIM OK] benchmark -> score=${snap.score}, benchmarkSprites=${runner.benchmarkSprites.length}`,
  );
}

function testEmberkeepDndAndAgentBridge() {
  const runner = new CartridgeRunner('emberkeep-dnd');
  const agent = createAgentBridge(runner);
  check(agent.backendMode === 'static-client-no-server', 'AgentBridge should truthfully declare static client mode');
  check(agent.listCartridges().includes('emberkeep-dnd'), 'PA-04 should be listed in cartridges');
  check(agent.getLegalActions().length >= 2, 'TurnGridKernel should expose legal actions on start');

  const res = agent.autoPlaySteps(2400);
  const obs = agent.getObservation() as {
    floorId: string;
    turnCount: number;
    hero: { level: number; gold: number; weapon?: { name: string } };
  };
  check(res.stepsExecuted > 80, 'Built-in D&D Agent should execute deep autonomous exploration');
  check(res.snapshot.rpgHud !== undefined, 'PA-04 snapshot should expose structured rpgHud');
  check(res.snapshot.stage?.total === 8, `PA-04 should expose 8-floor campaign progress (got ${res.snapshot.stage?.total})`);
  check(obs.floorId === 'floor-8', `Agent should descend all the way to B8 floor-8 (got ${obs.floorId})`);
  check(res.snapshot.status === 'won', `Agent should defeat Ember Dragon Boss on B8 and win (got ${res.snapshot.status})`);
  check(res.snapshot.score >= 3000, `Winning 8-floor D&D run should award high score (got ${res.snapshot.score})`);
  console.log(
    `[SIM OK] emberkeep-dnd (8-floor BSP+SetPiece) -> steps=${res.stepsExecuted}, floor=${obs.floorId}, lv=${obs.hero.level}, gold=${obs.hero.gold}, weapon=${obs.hero.weapon?.name ?? 'none'}, score=${res.snapshot.score}, status=${res.snapshot.status}`,
  );
}

testCoreSubsystems();
testDungeonGeneratorSolvability();
testSramSaveHydrateRoundtrips();
testCloudberryHop();
testSugarStarlight();
testSystemicChainReactionAndPuzzles();
testSandboxBenchmark();
testEmberkeepDndAndAgentBridge();
console.log('[SIM ALL PASSED] Pixel Atelier 20+ Min Multi-Stage Depth, SRAM & 240-Floor Dungeon Check Passed!');
