import { SPECIES } from '../data/scenarios.js';

const TRAIT_LIMITS = {
  speed: [.08, 1], efficiency: [.08, 1], fertility: [.08, 1], resilience: [.08, 1],
  camouflage: [.05, 1], moisture: [.05, 1], tempOptimum: [-12, 38], tempTolerance: [5, 34]
};

export function inheritTraits(parent, world) {
  const offspring = {};
  for (const [key, limits] of Object.entries(TRAIT_LIMITS)) {
    const source = parent?.traits?.[key] ?? SPECIES[parent.species]?.traits[key] ?? 0.5;
    const mutationChance = key.startsWith('temp') ? .09 : .12;
    const drift = key.startsWith('temp') ? 1.05 : .055;
    const mutated = source + (worldRandom(world) < mutationChance ? (worldRandom(world) - .5) * drift : (worldRandom(world) - .5) * drift * .18);
    offspring[key] = Number(Math.min(limits[1], Math.max(limits[0], mutated)).toFixed(3));
  }
  return offspring;
}

function worldRandom(world) {
  let x = (world.rng || 1) >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  world.rng = x >>> 0;
  return world.rng / 4_294_967_296;
}

export function fitnessFor(animal, world, tile) {
  const species = SPECIES[animal.species];
  const temperature = world.weather.temperature;
  const climate = Math.max(.08, 1 - Math.max(0, Math.abs(temperature - animal.traits.tempOptimum) - 3) / (animal.traits.tempTolerance + 5));
  const moistureFit = Math.max(.12, 1 - Math.abs((tile?.moisture ?? 50) / 100 - animal.traits.moisture) * .85);
  const habitatFit = Math.max(.12, world.settings.habitatQuality / 100 * .68 + moistureFit * .32);
  const energyFit = Math.max(.12, Math.min(1, animal.energy / 82));
  const crowdFit = Math.max(.25, Math.min(1, world.settings.habitatQuality / 45));
  const roleFit = species?.eats?.some(food => food === 'plant') ? Math.max(.22, (tile?.plant ?? 20) / 72) : 1;
  return Math.min(1, Math.max(.03, climate * .34 + habitatFit * .2 + energyFit * .24 + crowdFit * .1 + roleFit * .12));
}

export function describeTrait(key, value) {
  const labels = {
    speed: ['measured', 'quick'], efficiency: ['wasteful', 'efficient'], fertility: ['slow to breed', 'prolific'],
    resilience: ['sensitive', 'hardy'], camouflage: ['conspicuous', 'well-hidden'], moisture: ['dryland-leaning', 'wetland-leaning'],
    tempOptimum: ['cool-climate', 'warm-climate'], tempTolerance: ['narrow-range', 'broad-range']
  };
  const bounds = key.startsWith('temp') ? (key === 'tempTolerance' ? [5, 34] : [-12, 38]) : [0, 1];
  const ratio = Math.max(0, Math.min(1, (value - bounds[0]) / (bounds[1] - bounds[0])));
  const [low, high] = labels[key] || ['low', 'high'];
  return ratio < .38 ? low : ratio > .68 ? high : 'balanced';
}

export function summarizeTraits(animals) {
  const result = {};
  for (const key of Object.keys(TRAIT_LIMITS)) {
    const values = animals.map(animal => animal.traits[key]).filter(Number.isFinite);
    if (!values.length) { result[key] = { mean: 0, spread: 0, min: 0, max: 0 }; continue; }
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    result[key] = { mean: Number(mean.toFixed(3)), spread: Number(Math.sqrt(variance).toFixed(3)), min: Math.min(...values), max: Math.max(...values) };
  }
  return result;
}
