import { DEFAULT_SETTINGS, SCENARIOS, SPECIES } from '../data/scenarios.js';
import { fitnessFor } from './evolution.js';

export const WIDTH = 64;
export const HEIGHT = 38;
export const MAX_ANIMALS = 460;
export const HISTORY_LIMIT = 900;
export const EVENT_LIMIT = 1_800;

export function randomFor(world) {
  let x = (world.rng || 1) >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  world.rng = x >>> 0;
  return world.rng / 4_294_967_296;
}

export function makeId(world) {
  const id = `a${String(world.nextId++).padStart(6, '0')}`;
  return id;
}

function makeTiles(world) {
  const tiles = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const ridge = .5 + .26 * Math.sin(x * .105) + .16 * Math.cos(y * .16) + (randomFor(world) - .5) * .18;
      const river = Math.abs(y - (HEIGHT * .53 + Math.sin(x * .09) * 5));
      const wetness = Math.max(0, Math.min(1, .46 + (1 - Math.min(1, river / 13)) * .34 + (randomFor(world) - .5) * .28));
      const type = river < 1.7 ? 'water' : ridge > .68 ? 'woodland' : ridge > .46 ? 'meadow' : 'heath';
      const plant = type === 'water' ? 0 : Math.max(8, Math.min(98, 24 + wetness * 40 + (randomFor(world) - .5) * 36));
      tiles.push({ x, y, type, elevation: Math.max(0, Math.round(ridge * 100)), moisture: Math.round(wetness * 100), plant: Math.round(plant), flowers: Math.round(plant * (.5 + randomFor(world) * .5)), water: Math.round((1 - wetness) * 22) });
    }
  }
  return tiles;
}

function makeAnimal(world, speciesId, x, y, generation = 0, parents = []) {
  const species = SPECIES[speciesId];
  const traits = {};
  for (const [key, value] of Object.entries(species.traits)) {
    const spread = key.startsWith('temp') ? 1.4 : .12;
    traits[key] = Number((value + (randomFor(world) - .5) * spread).toFixed(3));
  }
  return {
    id: makeId(world), species: speciesId,
    x: Number(Math.max(0, Math.min(WIDTH - .001, x)).toFixed(3)),
    y: Number(Math.max(0, Math.min(HEIGHT - .001, y)).toFixed(3)),
    energy: Number((46 + randomFor(world) * 40).toFixed(1)), health: Math.round(68 + randomFor(world) * 32),
    age: Math.floor(randomFor(world) * Math.min(species.lifespan * .42, species.matureAt * 2)), reproductionCooldown: 0,
    generation, parents: [...parents], traits, hunger: Math.round(randomFor(world) * 35), lastAction: 'exploring', alive: true
  };
}

export function recordEvent(world, type, detail = {}) {
  world.events.push({ id: `e${world.nextEventId++}`, day: world.day, type, ...detail });
  if (world.events.length > EVENT_LIMIT) world.events.splice(0, world.events.length - EVENT_LIMIT);
}

export function initialSnapshot(world) {
  return { day: world.day, timelineIndex: world.timeline?.length || 0, rng: world.rng, nextId: world.nextId, nextEventId: world.nextEventId, weather: structuredClone(world.weather), settings: structuredClone(world.settings), animals: structuredClone(world.animals), tiles: structuredClone(world.tiles) };
}

function makeMetrics(world) {
  const populations = Object.fromEntries(Object.keys(SPECIES).map(id => [id, 0]));
  const traitKeys = ['speed', 'efficiency', 'fertility', 'resilience', 'camouflage', 'moisture', 'tempOptimum', 'tempTolerance', 'fitness'];
  const aggregate = Object.fromEntries(Object.keys(SPECIES).map(id => [id, Object.fromEntries(traitKeys.map(key => [key, { values: [], sum: 0, square: 0 }]))]));
  let traitSum = 0; let healthSum = 0;
  for (const animal of world.animals) {
    populations[animal.species]++; traitSum += animal.traits.efficiency; healthSum += animal.health;
    const traits = aggregate[animal.species];
    for (const key of traitKeys.slice(0, -1)) {
      const value = animal.traits[key];
      const bucket = traits[key]; bucket.sum += value; bucket.square += value * value; bucket.values.push(value);
    }
    const tile = world.tiles[Math.max(0, Math.min(world.tiles.length - 1, Math.floor(animal.y) * WIDTH + Math.floor(animal.x)))];
    const fitness = fitnessFor(animal, world, tile);
    traits.fitness.sum += fitness; traits.fitness.square += fitness * fitness; traits.fitness.values.push(fitness);
  }
  const traitProfile = {};
  for (const [speciesId, traits] of Object.entries(aggregate)) {
    traitProfile[speciesId] = {};
    for (const [key, bucket] of Object.entries(traits)) {
      const count = bucket.values.length;
      const mean = count ? bucket.sum / count : 0;
      const spread = count ? Math.sqrt(Math.max(0, bucket.square / count - mean * mean)) : 0;
      traitProfile[speciesId][key] = { mean: Number(mean.toFixed(4)), spread: Number(spread.toFixed(4)), min: count ? Math.min(...bucket.values) : 0, max: count ? Math.max(...bucket.values) : 0 };
    }
  }
  const present = Object.values(populations).filter(n => n > 0).length;
  const total = Object.values(populations).reduce((a, b) => a + b, 0);
  const plant = Math.round(world.tiles.reduce((sum, tile) => sum + tile.plant, 0) / world.tiles.length);
  const diversity = total ? Number((-Object.values(populations).reduce((sum, count) => count ? sum + (count / total) * Math.log(count / total) : sum, 0)).toFixed(2)) : 0;
  const health = Math.round(Math.max(0, Math.min(100, (present / Object.keys(SPECIES).length) * 34 + Math.min(100, diversity * 22) + plant * .25 + (total ? healthSum / total * .17 : 0))));
  return { day: world.day, populations, total, speciesPresent: present, plant, diversity, health, meanEfficiency: total ? Number((traitSum / total).toFixed(3)) : 0, traitProfile };
}

export function createWorld({ scenarioId = 'meadow', seed = Date.now(), settings: settingOverrides = null, populations: populationOverrides = null } = {}) {
  const scenario = SCENARIOS.find(item => item.id === scenarioId) || SCENARIOS[0];
  const world = {
    schemaVersion: 1, name: scenario.name, scenarioId: scenario.id, seed: Number(seed) >>> 0 || 1,
    rng: Number(seed) >>> 0 || 1, nextId: 1, nextEventId: 1, day: 0,
    seasonLength: 90, width: WIDTH, height: HEIGHT,
    settings: { ...DEFAULT_SETTINGS, ...scenario.settings, ...(settingOverrides || {}) },
    weather: { temperature: 18, rainfall: 62, wind: 12, season: 'Spring' },
    animals: [], tiles: [], history: [], events: [], timeline: [], checkpoints: [],
    replay: { position: 0, playing: false }, createdAt: new Date().toISOString()
  };
  world.tiles = makeTiles(world);
  const populations = { ...scenario.populations, ...(populationOverrides || {}) };
  for (const [speciesId, count] of Object.entries(populations)) {
    const safeCount = Math.max(0, Math.min(120, Math.floor(Number(count) || 0)));
    for (let i = 0; i < safeCount && world.animals.length < MAX_ANIMALS; i++) {
      world.animals.push(makeAnimal(world, speciesId, randomFor(world) * WIDTH, randomFor(world) * HEIGHT));
    }
  }
  world.weather.temperature = world.settings.temperature;
  world.weather.rainfall = world.settings.rainfall;
  world.history.push(makeMetrics(world));
  world.checkpoints.push(initialSnapshot(world));
  recordEvent(world, 'world', { title: 'A world takes shape', text: `${scenario.name} is ready for observation.`, scenarioId: scenario.id });
  return world;
}

export function summarizeWorld(world) { return makeMetrics(world); }
export function createAnimal(world, speciesId, x, y, generation = 0, parents = []) { return makeAnimal(world, speciesId, x, y, generation, parents); }

export function cloneWorld(world) {
  return structuredClone(world);
}
