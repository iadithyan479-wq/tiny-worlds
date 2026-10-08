import { SEASONS, SPECIES } from '../data/scenarios.js';
import { createAnimal, recordEvent, randomFor, summarizeWorld, WIDTH, HEIGHT, MAX_ANIMALS, HISTORY_LIMIT, initialSnapshot } from './world.js';
import { fitnessFor, inheritTraits } from './evolution.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const tileAt = (world, x, y) => world.tiles[clamp(Math.floor(y), 0, HEIGHT - 1) * WIDTH + clamp(Math.floor(x), 0, WIDTH - 1)];

function counts(world) {
  const result = Object.fromEntries(Object.keys(SPECIES).map(id => [id, 0]));
  for (const animal of world.animals) result[animal.species]++;
  return result;
}

function seasonFor(day, length) { return SEASONS[Math.floor((day % (length * 4)) / length)] || 'Spring'; }

function updateWeather(world) {
  const seasonIndex = SEASONS.indexOf(seasonFor(world.day, world.seasonLength));
  const angle = ((world.day % (world.seasonLength * 4)) / (world.seasonLength * 4)) * Math.PI * 2 - Math.PI / 2;
  const seasonWave = Math.cos(angle);
  const seasonOffset = seasonWave * (world.settings.seasonality / 100) * 13;
  const temp = world.settings.temperature + seasonOffset + (randomFor(world) - .5) * 3.2;
  const rainSeason = Math.cos(angle - Math.PI / 3) * world.settings.seasonality * .11;
  const rainfall = clamp(world.settings.rainfall + rainSeason + (randomFor(world) - .5) * 26, 0, 100);
  world.weather = { temperature: Number(temp.toFixed(1)), rainfall: Math.round(rainfall), wind: Math.round(5 + randomFor(world) * 37), season: SEASONS[seasonIndex], seasonIndex };
}

function growPlants(world) {
  const { rainfall, temperature } = world.weather;
  const thermal = clamp(1 - Math.abs(temperature - 18) / 34, .06, 1);
  const rainFactor = .22 + rainfall / 115;
  const abundance = world.settings.resourceAbundance / 100;
  const habitat = world.settings.habitatQuality / 100;
  const disturbance = world.settings.disturbance / 100;
  for (const tile of world.tiles) {
    if (tile.type === 'water') continue;
    const localRain = rainfall * (.64 + tile.moisture / 280);
    const growth = (.25 + thermal * rainFactor * (1.2 + abundance * .65) * (.44 + habitat * .55)) * (tile.moisture / 100 + localRain / 250);
    tile.plant = Math.round(clamp(tile.plant + growth - disturbance * 1.15 - (temperature > 31 ? .6 : 0), 0, 100));
    tile.flowers = Math.round(clamp(tile.flowers + growth * (tile.moisture / 110) - disturbance * .8, 0, tile.plant));
    tile.moisture = Math.round(clamp(tile.moisture + rainfall * .012 - .48 - (temperature > 24 ? .2 : 0), 7, 100));
  }
}

function findFoodTile(world, animal, radius = 3) {
  const own = tileAt(world, animal.x, animal.y);
  const wantsFlowers = animal.species === 'bee';
  let best = own;
  let score = wantsFlowers ? own.flowers * .45 + own.plant * .18 : own.plant * .45 + own.flowers * .13;
  for (let i = 0; i < 6; i++) {
    const x = clamp(animal.x + (randomFor(world) - .5) * radius * 2, 0, WIDTH - 1);
    const y = clamp(animal.y + (randomFor(world) - .5) * radius * 2, 0, HEIGHT - 1);
    const tile = tileAt(world, x, y);
    if (tile.type === 'water') continue;
    const candidate = (wantsFlowers ? tile.flowers * .45 : tile.plant * .45) + tile.moisture * animal.traits.moisture * .12 - Math.hypot(x - animal.x, y - animal.y) * 1.8;
    if (candidate > score) { score = candidate; best = tile; }
  }
  return best;
}

function moveToward(world, animal, target, pace = 1) {
  const speed = (.05 + animal.traits.speed * .21) * pace;
  let dx = target.x - animal.x; let dy = target.y - animal.y;
  if (Math.hypot(dx, dy) > 0.001) { const length = Math.hypot(dx, dy); dx /= length; dy /= length; }
  else { dx = randomFor(world) - .5; dy = randomFor(world) - .5; }
  animal.x = clamp(animal.x + dx * speed + (randomFor(world) - .5) * .13, .02, WIDTH - .02);
  animal.y = clamp(animal.y + dy * speed + (randomFor(world) - .5) * .13, .02, HEIGHT - .02);
}

function nearestPrey(world, predator, preyIds, maxDistance = 1.6) {
  let selected = null;
  let nearest = maxDistance;
  const populations = Object.fromEntries(preyIds.map(id => [id, 0]));
  let hunters = 0;
  for (const candidate of world.animals) {
    if (candidate.alive === false) continue;
    if (candidate.species === predator.species) hunters++;
    if (Object.hasOwn(populations, candidate.species)) populations[candidate.species]++;
  }
  const viablePrey = new Set(preyIds.filter(id => populations[id] >= Math.max(4, Math.ceil(hunters * .55))));
  const eligiblePrey = viablePrey.size ? viablePrey : new Set(preyIds.filter(id => populations[id] === Math.max(...Object.values(populations))));
  for (const candidate of world.animals) {
    if (candidate === predator || candidate.alive === false || !eligiblePrey.has(candidate.species)) continue;
    const d = distance(candidate, predator);
    if (d < nearest) { nearest = d; selected = candidate; }
  }
  return { animal: selected, distance: nearest };
}

function removeAnimal(world, animal, reason, options) {
  if (!animal.alive) return;
  animal.alive = false;
  if (options.recordEvents) recordEvent(world, 'death', { species: animal.species, animalId: animal.id, x: animal.x, y: animal.y, text: `${SPECIES[animal.species].name} ${reason}.` });
}

function forage(world, animal) {
  const tile = tileAt(world, animal.x, animal.y);
  const plantDiet = SPECIES[animal.species].eats.includes('plant');
  const stock = animal.species === 'bee' ? tile.flowers : tile.plant;
  if (!plantDiet || stock < 2) return false;
  const bite = Math.min(stock, 2.2 + animal.traits.efficiency * 2.4);
  if (animal.species === 'bee') tile.flowers -= bite;
  else tile.plant -= bite;
  animal.energy = clamp(animal.energy + bite * animal.traits.efficiency * .82, 0, 118);
  animal.hunger = Math.max(0, animal.hunger - 23);
  animal.lastAction = animal.species === 'bee' ? 'gathering nectar' : 'foraging';
  if (animal.species === 'bee' && randomFor(world) < .24) {
    tile.plant = clamp(tile.plant + 1, 0, 100);
    tile.flowers = clamp(tile.flowers + 1, 0, tile.plant);
  }
  return true;
}

function animalTick(world, animal, options) {
  const species = SPECIES[animal.species];
  const tile = tileAt(world, animal.x, animal.y);
  const thermalFitness = Math.max(.1, 1 - Math.max(0, Math.abs(world.weather.temperature - animal.traits.tempOptimum) - 2) / (animal.traits.tempTolerance + 4));
  const wetFitness = Math.max(.25, 1 - Math.abs(tile.moisture / 100 - animal.traits.moisture) * .9);
  const stress = (1 - thermalFitness) * 1.9 + (1 - wetFitness) * .55 + world.settings.disturbance / 100 * .65;
  animal.energy = clamp(animal.energy - (.62 + (1 - animal.traits.resilience) * .33 + stress * .56), 0, 120);
  animal.hunger = clamp(animal.hunger + 5 + stress * 4, 0, 100);
  animal.age++;
  animal.reproductionCooldown = Math.max(0, (animal.reproductionCooldown || 0) - 1);

  const prey = species.eats.some(food => food !== 'plant') ? nearestPrey(world, animal, species.eats.filter(food => food !== 'plant'), 14) : { animal: null, distance: Infinity };
  if (prey.animal) {
    const preyDistance = prey.distance;
    const preySpecies = SPECIES[prey.animal.species];
    moveToward(world, animal, prey.animal, 1.6);
    if (preyDistance < 2.1 && (animal.hunger >= 80 || animal.energy < 22)) {
      const success = .36 + animal.traits.speed * .22 + animal.traits.efficiency * .15 - prey.animal.traits.camouflage * .2;
      if (randomFor(world) < success) {
        removeAnimal(world, prey.animal, `was taken by a ${species.name.toLowerCase()}`, options);
        animal.energy = clamp(animal.energy + 55 + animal.traits.efficiency * 24, 0, 120);
        animal.hunger = Math.max(0, animal.hunger - 100);
        animal.lastAction = `hunting ${preySpecies.short.toLowerCase()}`;
        if (options.recordEvents) recordEvent(world, 'predation', { species: animal.species, prey: prey.animal.species, animalId: animal.id, x: animal.x, y: animal.y, text: `${species.name} caught a ${preySpecies.name.toLowerCase()}.` });
      } else animal.lastAction = `stalking ${preySpecies.short.toLowerCase()}`;
    } else if (preyDistance < 2.1) animal.lastAction = `watching ${preySpecies.short.toLowerCase()}`;
    else animal.lastAction = `tracking ${preySpecies.short.toLowerCase()}`;
  } else if (species.eats.includes('plant')) {
    const target = findFoodTile(world, animal);
    const here = tileAt(world, animal.x, animal.y);
    if ((animal.species === 'bee' ? here.flowers : here.plant) < 8) moveToward(world, animal, target);
    if (!forage(world, animal)) animal.lastAction = 'searching for food';
  } else {
    const waterPreference = animal.traits.moisture;
    let target = tile;
    let score = tile.moisture * waterPreference;
    for (let i = 0; i < 4; i++) {
      const candidate = tileAt(world, clamp(animal.x + (randomFor(world) - .5) * 5, 0, WIDTH - 1), clamp(animal.y + (randomFor(world) - .5) * 5, 0, HEIGHT - 1));
      const value = candidate.moisture * waterPreference + candidate.plant * .12;
      if (value > score) { score = value; target = candidate; }
    }
    if (randomFor(world) < .3 || animal.energy < 33) moveToward(world, animal, target);
    animal.lastAction = 'patrolling';
  }

  const fitness = fitnessFor(animal, world, tile);
  if (animal.health < 100 && animal.energy > 30 && fitness > .35) animal.health = clamp(animal.health + fitness * .8, 0, 100);
  if (animal.energy < 12) animal.health = clamp(animal.health - (12 - animal.energy) * .32, 0, 100);
  if (thermalFitness < .35) animal.health = clamp(animal.health - .5, 0, 100);
  if (animal.health <= 0 || animal.energy <= 0) { removeAnimal(world, animal, animal.energy <= 1 ? 'succumbed to hunger' : 'succumbed to stress', options); return; }
  if (animal.age > species.lifespan * (.85 + animal.traits.resilience * .35)) { removeAnimal(world, animal, 'reached the end of its life', options); return; }

  if (animal.age >= species.matureAt && animal.reproductionCooldown === 0 && animal.energy > 82 && animal.health > 52 && fitness > .32 && world.animals.length < MAX_ANIMALS) {
    const currentPopulation = world.animals.filter(item => item.alive && item.species === animal.species).length;
    const habitat = world.settings.habitatQuality / 100;
    const plantFactor = world.settings.resourceAbundance / 100;
    const cap = Math.max(4, Math.floor((world.width * world.height / 100) * (1.3 + habitat * 3.7) * (.55 + plantFactor * .65) / Math.max(1, species.eats.length * .64)));
    const chance = animal.traits.fertility * fitness * (currentPopulation < cap ? .072 : .006) * (species.litter > 1 ? 1.35 : .8);
    if (randomFor(world) < chance) {
      const child = createAnimal(world, animal.species, animal.x + (randomFor(world) - .5), animal.y + (randomFor(world) - .5), animal.generation + 1, [animal.id]);
      child.traits = inheritTraits(animal, world);
      child.age = 0; child.energy = 48; child.health = 93;
      world.animals.push(child);
      animal.reproductionCooldown = species.gestation;
      animal.energy -= 13;
      animal.lastAction = 'raising young';
      if (options.recordEvents) {
        recordEvent(world, 'birth', { species: animal.species, animalId: child.id, parentId: animal.id, generation: child.generation, x: child.x, y: child.y, text: `A new ${species.name.toLowerCase()} is born.` });
        if (randomFor(world) < .22) recordEvent(world, 'mutation', { species: animal.species, animalId: child.id, generation: child.generation, x: child.x, y: child.y, text: `A new trait appeared in the ${species.name.toLowerCase()} line.` });
      }
    }
  }
  if (animal.energy < 36 && animal.health < 65 && randomFor(world) < .11) {
    const before = { x: animal.x, y: animal.y };
    const destination = findFoodTile(world, animal, 8);
    moveToward(world, animal, destination, 1.4);
    if (options.recordEvents && distance(before, animal) > 2.5) recordEvent(world, 'migration', { species: animal.species, animalId: animal.id, x: animal.x, y: animal.y, text: `${species.name} moved toward better habitat.` });
  }
}

function applyPopulationEvents(world, before, after, enabled) {
  if (!enabled) return;
  for (const speciesId of Object.keys(SPECIES)) {
    const oldCount = before[speciesId] || 0; const newCount = after[speciesId] || 0;
    if (oldCount > 0 && newCount === 0) recordEvent(world, 'extinction', { species: speciesId, text: `${SPECIES[speciesId].name} has disappeared from this world.` });
    else if (oldCount > 5 && Math.abs(newCount - oldCount) >= Math.max(5, Math.round(oldCount * .3))) recordEvent(world, 'population', { species: speciesId, change: newCount - oldCount, text: `${SPECIES[speciesId].name} ${newCount > oldCount ? 'population rose' : 'population fell'} to ${newCount}.` });
  }
}

export function stepWorld(world, { recordHistory = true, recordSnapshots = true, recordEvents = true } = {}) {
  const before = counts(world);
  world.day++;
  updateWeather(world);
  growPlants(world);
  const current = [...world.animals];
  for (const animal of current) if (animal.alive) animalTick(world, animal, { recordEvents });
  world.animals = world.animals.filter(animal => animal.alive);
  const after = counts(world);
  applyPopulationEvents(world, before, after, recordEvents);
  const metric = summarizeWorld(world);
  if (recordHistory) {
    world.history.push(metric);
    if (world.history.length > HISTORY_LIMIT) world.history.splice(0, world.history.length - HISTORY_LIMIT);
  }
  if (recordSnapshots && world.day % 12 === 0) {
    world.checkpoints.push(initialSnapshot(world));
    if (world.checkpoints.length > 76) world.checkpoints.splice(1, 1);
  }
  return metric;
}

export function advanceWorld(world, days = 1, options) {
  const metrics = [];
  for (let i = 0; i < Math.max(0, Math.min(500, Math.floor(days))); i++) metrics.push(stepWorld(world, options));
  return metrics;
}

export function changeEnvironment(world, changes) {
  const allowed = ['temperature', 'rainfall', 'seasonality', 'resourceAbundance', 'habitatQuality', 'disturbance'];
  const accepted = {};
  for (const key of allowed) {
    if (!Number.isFinite(Number(changes[key]))) continue;
    const [low, high] = key === 'temperature' ? [-8, 34] : [0, 100];
    accepted[key] = clamp(Number(changes[key]), low, high);
  }
  if (!Object.keys(accepted).length) return world;
  Object.assign(world.settings, accepted);
  world.timeline.push({ day: world.day, type: 'settings', changes: structuredClone(accepted) });
  if (world.timeline.length > 1600) world.timeline.splice(0, world.timeline.length - 1600);
  world.checkpoints.push(initialSnapshot(world));
  if (world.checkpoints.length > 76) world.checkpoints.splice(1, 1);
  recordEvent(world, 'environment', { changes: accepted, text: 'The habitat settings shifted.' });
  return world;
}

export function triggerDisturbance(world, type) {
  const presets = {
    rain: { label: 'A welcome rain', rainfall: Math.min(100, world.settings.rainfall + 27), plantLoss: 0, moisture: 16 },
    heatwave: { label: 'A brief heatwave', temperature: Math.min(34, world.settings.temperature + 8), plantLoss: 8, moisture: -12 },
    coldSnap: { label: 'A sudden cold snap', temperature: Math.max(-8, world.settings.temperature - 9), plantLoss: 3, moisture: 1 },
    fire: { label: 'A fast-moving grass fire', temperature: Math.min(34, world.settings.temperature + 4), plantLoss: 34, moisture: -28 },
    flood: { label: 'A flooded riverside', rainfall: Math.min(100, world.settings.rainfall + 36), plantLoss: 7, moisture: 24 }
  };
  return applyDisturbance(world, type, presets[type], true);
}

export function applyTimelineAction(world, action) {
  if (action.type === 'settings') Object.assign(world.settings, action.changes);
  else if (action.type === 'disturbance') triggerDisturbanceForReplay(world, action.disturbance);
}

function applyDisturbance(world, type, preset, record) {
  if (!preset) return false;
  if ('temperature' in preset) world.settings.temperature = preset.temperature;
  if ('rainfall' in preset) world.settings.rainfall = preset.rainfall;
  for (const tile of world.tiles) {
    if (tile.type === 'water') continue;
    tile.plant = clamp(tile.plant - preset.plantLoss * (.4 + randomFor(world)), 0, 100);
    tile.flowers = clamp(tile.flowers - preset.plantLoss * (.45 + randomFor(world)), 0, tile.plant);
    tile.moisture = clamp(tile.moisture + preset.moisture, 7, 100);
  }
  const casualties = type === 'fire' ? .1 : type === 'flood' ? .035 : type === 'coldSnap' ? .05 : 0;
  for (const animal of [...world.animals]) if (randomFor(world) < casualties * (1 - animal.traits.resilience * .45)) {
    animal.alive = false;
    if (record) recordEvent(world, 'death', { species: animal.species, animalId: animal.id, x: animal.x, y: animal.y, text: `${SPECIES[animal.species].name} was lost in the ${type === 'fire' ? 'fire' : type === 'flood' ? 'flood' : 'extreme weather'}.` });
  }
  world.animals = world.animals.filter(animal => animal.alive);
  if (record) {
    world.timeline.push({ day: world.day, type: 'disturbance', disturbance: type });
    world.checkpoints.push(initialSnapshot(world));
    recordEvent(world, type, { text: `${preset.label} reshaped the meadow.` });
  }
  return true;
}

function triggerDisturbanceForReplay(world, type) {
  const presets = {
    rain: { label: 'A welcome rain', rainfall: Math.min(100, world.settings.rainfall + 27), plantLoss: 0, moisture: 16 },
    heatwave: { label: 'A brief heatwave', temperature: Math.min(34, world.settings.temperature + 8), plantLoss: 8, moisture: -12 },
    coldSnap: { label: 'A sudden cold snap', temperature: Math.max(-8, world.settings.temperature - 9), plantLoss: 3, moisture: 1 },
    fire: { label: 'A fast-moving grass fire', temperature: Math.min(34, world.settings.temperature + 4), plantLoss: 34, moisture: -28 },
    flood: { label: 'A flooded riverside', rainfall: Math.min(100, world.settings.rainfall + 36), plantLoss: 7, moisture: 24 }
  };
  return applyDisturbance(world, type, presets[type], false);
}
