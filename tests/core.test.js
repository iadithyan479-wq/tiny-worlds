import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, summarizeWorld } from '../public/js/core/world.js';
import { changeEnvironment, stepWorld, triggerDisturbance } from '../public/js/core/simulation.js';
import { seekWorld } from '../public/js/core/history.js';
import { inheritTraits } from '../public/js/core/evolution.js';
import { normalizeWorld, parseWorldJSON, serializeWorld } from '../public/js/core/storage.js';

function coreState(world) {
  return { day: world.day, rng: world.rng, weather: world.weather, settings: world.settings, tiles: world.tiles, animals: world.animals, metrics: world.history.at(-1) };
}

test('seeded worlds have reproducible maps, populations, and traits', () => {
  const first = createWorld({ seed: 99117 });
  const second = createWorld({ seed: 99117 });
  assert.equal(first.rng, second.rng);
  assert.deepEqual(first.tiles, second.tiles);
  assert.deepEqual(first.animals, second.animals);
  assert.equal(first.animals.length, 142);
  assert.equal(first.history[0].speciesPresent, 5);
  assert.ok(first.history[0].traitProfile.mouse.efficiency.mean > 0);
  assert.ok(first.history[0].traitProfile.mouse.efficiency.spread >= 0);
  assert.ok(first.history[0].traitProfile.fox.fitness.mean > 0);
});

test('the daily step advances seasons, history, and living populations', () => {
  const world = createWorld({ seed: 44 });
  const before = summarizeWorld(world);
  stepWorld(world);
  assert.equal(world.day, 1);
  assert.equal(world.history.length, 2);
  assert.equal(world.weather.season, 'Spring');
  assert.ok(world.animals.length <= before.total + 5);
  assert.ok(world.animals.every(animal => animal.health >= 0 && animal.health <= 100));
  assert.ok(world.tiles.every(tile => tile.plant >= 0 && tile.plant <= 100));
});

test('the balanced meadow sustains all five species through a full annual cycle', () => {
  const world = createWorld({ scenarioId: 'meadow', seed: 400 });
  for (let i = 0; i < 365; i++) stepWorld(world);
  const summary = summarizeWorld(world);
  assert.ok(summary.total > 0, 'the whole ecosystem should not collapse');
  assert.equal(summary.speciesPresent, 5, 'all five species should remain represented');
  assert.ok(summary.populations.mouse > 0 && summary.populations.bee > 0, 'both producer-dependent guilds should have food');
  assert.ok(world.events.some(event => event.type === 'birth'), 'successful reproduction should be observable');
});

test('inherited traits stay bounded and mutations allow line-level variation', () => {
  const world = createWorld({ seed: 120 });
  const parent = world.animals.find(animal => animal.species === 'mouse');
  const children = Array.from({ length: 45 }, () => inheritTraits(parent, world));
  for (const child of children) {
    for (const key of ['speed', 'efficiency', 'fertility', 'resilience', 'camouflage', 'moisture']) assert.ok(child[key] >= 0 && child[key] <= 1);
    assert.ok(child.tempOptimum >= -12 && child.tempOptimum <= 38);
  }
  assert.ok(new Set(children.map(child => child.speed)).size > 1);
});

test('checkpoint replay reproduces the same state after a season of simulation', () => {
  const world = createWorld({ seed: 7721 });
  for (let i = 0; i < 37; i++) stepWorld(world);
  const restored = seekWorld(world, world.day);
  assert.deepEqual(coreState(restored), coreState(world));
});

test('environment changes and disturbances persist and replay from the same checkpoint', () => {
  const world = createWorld({ seed: 611 });
  changeEnvironment(world, { temperature: 25, rainfall: 44, habitatQuality: 58 });
  for (let i = 0; i < 7; i++) stepWorld(world);
  assert.equal(triggerDisturbance(world, 'rain'), true);
  for (let i = 0; i < 17; i++) stepWorld(world);
  const restored = seekWorld(world, world.day);
  assert.deepEqual(coreState(restored), coreState(world));
  assert.equal(restored.settings.rainfall, world.settings.rainfall);
});

test('replay honors multiple environment edits and disturbances made on the same day', () => {
  const world = createWorld({ seed: 2609 });
  changeEnvironment(world, { temperature: 25 });
  changeEnvironment(world, { rainfall: 10, resourceAbundance: 34 });
  triggerDisturbance(world, 'rain');
  triggerDisturbance(world, 'heatwave');
  stepWorld(world);
  const replay = seekWorld(world, 1);
  assert.deepEqual(coreState(replay), coreState(world));
  assert.equal(replay.settings.temperature, world.settings.temperature);
  assert.equal(replay.settings.rainfall, world.settings.rainfall);
});

test('save exports round-trip and malformed maps or replay data are rejected', () => {
  const world = createWorld({ seed: 812 });
  for (let i = 0; i < 14; i++) stepWorld(world);
  const data = serializeWorld(world);
  const restored = parseWorldJSON(data);
  assert.deepEqual(coreState(restored), coreState(world));
  assert.throws(() => normalizeWorld({ schemaVersion: 1, tiles: [], animals: [] }), /invalid habitat map/i);
  assert.throws(() => parseWorldJSON('{not valid'), /valid JSON/i);
  const incomplete = structuredClone(world); incomplete.checkpoints = [];
  assert.throws(() => normalizeWorld(incomplete), /replay checkpoint/i);
});

test('save validation restores required counters and fields from complete data', () => {
  const world = createWorld({ seed: 55 });
  const malformed = structuredClone(world);
  delete malformed.rng; delete malformed.nextId; delete malformed.nextEventId;
  delete malformed.animals[0].hunger;
  malformed.animals[0].reproductionCooldown = 12;
  const restored = normalizeWorld(malformed);
  assert.ok(Number.isInteger(restored.rng) && restored.rng > 0);
  assert.ok(Number.isInteger(restored.nextId) && restored.nextId > 1);
  assert.ok(Number.isInteger(restored.nextEventId) && restored.nextEventId > 0);
  assert.ok(Number.isFinite(restored.animals[0].hunger));
  assert.equal(restored.animals[0].reproductionCooldown, 12);
});
