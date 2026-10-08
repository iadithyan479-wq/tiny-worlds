import { DEFAULT_SETTINGS, SEASONS, SPECIES } from '../data/scenarios.js';
import { EVENT_LIMIT, HISTORY_LIMIT, MAX_ANIMALS, WIDTH, HEIGHT, cloneWorld, summarizeWorld } from './world.js';

const SAVES_KEY = 'tinyworlds:saves:v1';
const AUTOSAVE_KEY = 'tinyworlds:autosave:v1';
const MAX_SAVES = 12;
const SETTING_KEYS = ['temperature', 'rainfall', 'seasonality', 'resourceAbundance', 'habitatQuality', 'disturbance'];
const DISTURBANCES = new Set(['rain', 'heatwave', 'coldSnap', 'fire', 'flood']);
const EVENT_TYPES = new Set(['world', 'birth', 'death', 'predation', 'migration', 'mutation', 'extinction', 'population', 'environment', 'rain', 'heatwave', 'coldSnap', 'fire', 'flood', 'checkpoint']);
const clamp = (value, low, high, fallback) => { const number = Number(value); return Number.isFinite(number) ? Math.max(low, Math.min(high, number)) : fallback; };
const int = (value, low, high, fallback) => Math.floor(clamp(value, low, high, fallback));
const validCounter = (value, fallback) => Number.isSafeInteger(value) && value > 0 ? value : fallback;

function normalizeSettings(source = {}) {
  const settings = { ...DEFAULT_SETTINGS };
  settings.temperature = clamp(source.temperature, -8, 34, DEFAULT_SETTINGS.temperature);
  for (const key of SETTING_KEYS.slice(1)) settings[key] = clamp(source[key], 0, 100, DEFAULT_SETTINGS[key]);
  return settings;
}

function normalizeWeather(source = {}, settings = DEFAULT_SETTINGS) {
  const season = SEASONS.includes(source.season) ? source.season : 'Spring';
  return { temperature: clamp(source.temperature, -20, 50, settings.temperature), rainfall: int(source.rainfall, 0, 100, settings.rainfall), wind: int(source.wind, 0, 100, 12), season, seasonIndex: int(source.seasonIndex, 0, 3, SEASONS.indexOf(season)) };
}

function normalizeTiles(source) {
  if (!Array.isArray(source) || source.length !== WIDTH * HEIGHT) throw new Error('The save has an invalid habitat map.');
  return source.map((tile, index) => ({
    x: index % WIDTH, y: Math.floor(index / WIDTH), type: ['water', 'woodland', 'meadow', 'heath'].includes(tile?.type) ? tile.type : 'meadow',
    elevation: int(tile?.elevation, 0, 100, 50), moisture: int(tile?.moisture, 0, 100, 50),
    plant: clamp(tile?.plant, 0, 100, 0), flowers: clamp(tile?.flowers, 0, 100, 0), water: int(tile?.water, 0, 100, 0)
  }));
}

function normalizeAnimals(source) {
  if (!Array.isArray(source) || source.length > MAX_ANIMALS) throw new Error('The save has an invalid population count.');
  const seen = new Set();
  return source.filter(animal => {
    const valid = SPECIES[animal?.species] && typeof animal.id === 'string' && animal.id.length > 0 && animal.id.length <= 64 && !seen.has(animal.id);
    if (valid) seen.add(animal.id);
    return valid;
  }).map(animal => ({
    id: animal.id, species: animal.species,
    x: clamp(animal.x, 0, WIDTH - .01, 0), y: clamp(animal.y, 0, HEIGHT - .01, 0),
    energy: clamp(animal.energy, 0, 120, 40), health: clamp(animal.health, 0, 100, 70), hunger: clamp(animal.hunger, 0, 100, 0),
    age: int(animal.age, 0, 1_000_000, 0), reproductionCooldown: int(animal.reproductionCooldown, 0, 1_000_000, 0), generation: int(animal.generation, 0, 100_000, 0),
    parents: Array.isArray(animal.parents) ? animal.parents.filter(value => typeof value === 'string').slice(0, 4) : [],
    traits: Object.fromEntries(Object.entries(SPECIES[animal.species].traits).map(([key, fallback]) => [key, clamp(animal.traits?.[key], key.startsWith('temp') ? (key === 'tempTolerance' ? 5 : -12) : .05, key === 'tempOptimum' ? 38 : key === 'tempTolerance' ? 34 : 1, fallback)])),
    lastAction: typeof animal.lastAction === 'string' ? animal.lastAction.slice(0, 80) : 'exploring', alive: true
  }));
}

function normalizeTimeline(source, worldDay) {
  if (!Array.isArray(source)) return [];
  return source.filter(action => action && Number.isFinite(action.day) && ['settings', 'disturbance'].includes(action.type)).slice(-1_600).map(action => {
    const day = int(action.day, 0, worldDay, 0);
    if (action.type === 'disturbance') return DISTURBANCES.has(action.disturbance) ? { day, type: 'disturbance', disturbance: action.disturbance } : null;
    const changes = {};
    if (action.changes && typeof action.changes === 'object') for (const key of SETTING_KEYS) {
      if (Object.hasOwn(action.changes, key)) changes[key] = key === 'temperature' ? clamp(action.changes[key], -8, 34, DEFAULT_SETTINGS[key]) : clamp(action.changes[key], 0, 100, DEFAULT_SETTINGS[key]);
    }
    return Object.keys(changes).length ? { day, type: 'settings', changes } : null;
  }).filter(Boolean);
}

function normalizeHistory(source, currentWorld) {
  if (!Array.isArray(source)) return [summarizeWorld(currentWorld)];
  const rows = source.filter(item => item && Number.isFinite(item.day)).slice(-HISTORY_LIMIT).map(item => {
    const populations = Object.fromEntries(Object.keys(SPECIES).map(id => [id, int(item.populations?.[id], 0, MAX_ANIMALS, 0)]));
    const total = Object.values(populations).reduce((a, b) => a + b, 0);
    const traitProfile = {};
    for (const [speciesId, species] of Object.entries(SPECIES)) {
      traitProfile[speciesId] = {};
      for (const key of [...Object.keys(species.traits), 'fitness']) {
        const stat = item.traitProfile?.[speciesId]?.[key] || {};
        const low = key === 'tempOptimum' ? -12 : key === 'tempTolerance' ? 5 : 0;
        const high = key === 'tempOptimum' ? 38 : key === 'tempTolerance' ? 34 : 1;
        traitProfile[speciesId][key] = {
          mean: clamp(stat.mean, low, high, 0),
          spread: clamp(stat.spread, 0, high - low, 0),
          min: clamp(stat.min, low, high, 0), max: clamp(stat.max, low, high, 0)
        };
      }
    }
    return { day: int(item.day, 0, currentWorld.day, 0), populations, total, speciesPresent: int(item.speciesPresent, 0, Object.keys(SPECIES).length, Object.values(populations).filter(value => value > 0).length), plant: int(item.plant, 0, 100, 0), diversity: clamp(item.diversity, 0, 3, 0), health: int(item.health, 0, 100, 0), meanEfficiency: clamp(item.meanEfficiency, 0, 1, 0), traitProfile };
  });
  return rows.length ? rows : [summarizeWorld(currentWorld)];
}

function normalizeEvents(source, worldDay) {
  if (!Array.isArray(source)) return [];
  return source.filter(event => event && Number.isFinite(event.day) && EVENT_TYPES.has(event.type)).slice(-EVENT_LIMIT).map((event, index) => ({
    id: typeof event.id === 'string' && event.id.length <= 64 ? event.id : `e${index + 1}`,
    day: int(event.day, 0, worldDay, 0), type: event.type,
    text: typeof event.text === 'string' ? event.text.slice(0, 500) : 'An observation was recorded.',
    ...(SPECIES[event.species] ? { species: event.species } : {}),
    ...(SPECIES[event.prey] ? { prey: event.prey } : {}),
    ...(typeof event.animalId === 'string' ? { animalId: event.animalId.slice(0, 64) } : {}),
    ...(typeof event.parentId === 'string' ? { parentId: event.parentId.slice(0, 64) } : {}),
    ...(Number.isFinite(event.generation) ? { generation: int(event.generation, 0, 100_000, 0) } : {}),
    ...(Number.isFinite(event.change) ? { change: int(event.change, -MAX_ANIMALS, MAX_ANIMALS, 0) } : {}),
    ...(Number.isFinite(event.x) ? { x: clamp(event.x, 0, WIDTH, 0) } : {}),
    ...(Number.isFinite(event.y) ? { y: clamp(event.y, 0, HEIGHT, 0) } : {})
  }));
}

function normalizeCheckpoint(source, worldDay, timelineLength, events) {
  if (!source || !Number.isFinite(source.day) || source.day < 0 || source.day > worldDay || !Number.isSafeInteger(source.rng) || !Array.isArray(source.animals) || !Array.isArray(source.tiles) || source.tiles.length !== WIDTH * HEIGHT) return null;
  const animals = normalizeAnimals(source.animals);
  const nextId = deriveNextId(animals);
  const nextEventId = deriveNextEventId(events.filter(event => event.day <= source.day));
  return {
    day: int(source.day, 0, worldDay, 0), timelineIndex: int(source.timelineIndex, 0, timelineLength, 0),
    rng: source.rng >>> 0 || 1, nextId: Math.max(validCounter(source.nextId, nextId), nextId),
    nextEventId: Math.max(validCounter(source.nextEventId, nextEventId), nextEventId), settings: normalizeSettings(source.settings),
    weather: normalizeWeather(source.weather, normalizeSettings(source.settings)),
    animals, tiles: normalizeTiles(source.tiles)
  };
}

function deriveNextId(animals) {
  let max = 0;
  for (const animal of animals) { const match = /^a(\d+)$/.exec(animal.id); if (match) max = Math.max(max, Number(match[1])); }
  return max + 1;
}
function deriveNextEventId(events) {
  let max = 0;
  for (const event of events) { const match = /^e(\d+)$/.exec(event.id); if (match) max = Math.max(max, Number(match[1])); }
  return max + 1;
}

export function normalizeWorld(input) {
  if (!input || typeof input !== 'object' || input.schemaVersion !== 1) throw new Error('This save is not a supported Tiny Worlds file.');
  const world = cloneWorld(input);
  world.name = String(world.name || 'Untitled world').slice(0, 44);
  world.scenarioId = String(world.scenarioId || 'meadow').slice(0, 32);
  world.day = int(world.day, 0, 1_000_000, 0);
  world.width = WIDTH; world.height = HEIGHT;
  world.settings = normalizeSettings(world.settings);
  world.tiles = normalizeTiles(world.tiles);
  world.animals = normalizeAnimals(world.animals);
  world.rng = Number.isSafeInteger(world.rng) ? (world.rng >>> 0 || 1) : 1;
  world.nextId = Math.max(validCounter(world.nextId, deriveNextId(world.animals)), deriveNextId(world.animals));
  world.timeline = normalizeTimeline(world.timeline, world.day);
  world.events = normalizeEvents(world.events, world.day);
  world.nextEventId = validCounter(world.nextEventId, deriveNextEventId(world.events));
  world.history = normalizeHistory(world.history, world);
  const checkpoints = Array.isArray(world.checkpoints) ? world.checkpoints.map(item => normalizeCheckpoint(item, world.day, world.timeline.length, world.events)).filter(Boolean) : [];
  if (!checkpoints.some(item => item.day === 0)) throw new Error('This world is missing its replay checkpoint. Import a complete Tiny Worlds export.');
  const ordered = checkpoints.sort((a, b) => a.day - b.day || a.timelineIndex - b.timelineIndex);
  const initial = ordered.find(item => item.day === 0);
  world.checkpoints = [initial, ...ordered.filter(item => item !== initial).slice(-75)];
  world.weather = normalizeWeather(world.weather, world.settings);
  world.replay = { position: world.day, playing: false };
  return world;
}

function safeRead(key, fallback) {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}

function saveList() {
  const value = safeRead(SAVES_KEY, []);
  return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string' && item.world) : [];
}

export function listSaves() {
  return saveList().map(({ id, name, updatedAt, world }) => ({ id, name, updatedAt, day: world.day, total: world.animals?.length || 0 }));
}

export function saveWorld(world, name) {
  const label = String(name || world.name || 'Untitled world').trim().slice(0, 44) || 'Untitled world';
  const slot = { id: `save-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: label, updatedAt: new Date().toISOString(), world: normalizeWorld({ ...world, name: label }) };
  const list = saveList();
  list.unshift(slot);
  try { localStorage.setItem(SAVES_KEY, JSON.stringify(list.slice(0, MAX_SAVES))); }
  catch { throw new Error('Browser storage is full. Export a world or remove an older save, then try again.'); }
  return slot.id;
}

export function loadSave(id) {
  const slot = saveList().find(item => item.id === id);
  if (!slot) throw new Error('That saved world could not be found in this browser.');
  return normalizeWorld(slot.world);
}

export function deleteSave(id) {
  const next = saveList().filter(item => item.id !== id);
  localStorage.setItem(SAVES_KEY, JSON.stringify(next));
  return next.length;
}

export function autosave(world) {
  try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ updatedAt: new Date().toISOString(), world: normalizeWorld(world) })); return true; }
  catch { return false; }
}

export function loadAutosave() {
  const entry = safeRead(AUTOSAVE_KEY, null);
  if (!entry?.world) return null;
  try { return normalizeWorld(entry.world); } catch { return null; }
}

export function serializeWorld(world) {
  return JSON.stringify({ format: 'tiny-worlds-save', version: 1, exportedAt: new Date().toISOString(), world: normalizeWorld(world) }, null, 2);
}

export function parseWorldJSON(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  const candidate = data?.format === 'tiny-worlds-save' ? data.world : data;
  return normalizeWorld(candidate);
}
