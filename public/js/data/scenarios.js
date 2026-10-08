export const SPECIES = {
  mouse: {
    id: 'mouse', name: 'Field mouse', short: 'Mouse', mark: 'M', color: '#d5a466',
    role: 'Seed gatherer', diet: 'Seeds and meadow plants', eats: ['plant'], preyOf: ['fox', 'owl'],
    basePopulation: 30, matureAt: 16, lifespan: 360, gestation: 24, litter: 2,
    traits: { speed: .50, efficiency: .59, fertility: .63, resilience: .45, camouflage: .68, moisture: .45, tempOptimum: 17, tempTolerance: 15 },
    description: 'A quick seed gatherer. Open ground means abundant food, but leaves mice exposed to patient hunters.'
  },
  fox: {
    id: 'fox', name: 'Red fox', short: 'Fox', mark: 'F', color: '#df7750',
    role: 'Mesopredator', diet: 'Mice and frogs', eats: ['mouse', 'frog'], preyOf: [],
    basePopulation: 7, matureAt: 55, lifespan: 900, gestation: 51, litter: 1,
    traits: { speed: .73, efficiency: .50, fertility: .34, resilience: .70, camouflage: .72, moisture: .38, tempOptimum: 11, tempTolerance: 22 },
    description: 'An adaptable hunter. Foxes need steady prey, but too many hunters can empty their own larder.'
  },
  bee: {
    id: 'bee', name: 'Meadow bee', short: 'Bee', mark: 'B', color: '#e3c55b',
    role: 'Pollinator', diet: 'Nectar and pollen', eats: ['plant'], preyOf: ['frog'],
    basePopulation: 38, matureAt: 12, lifespan: 150, gestation: 18, litter: 3,
    traits: { speed: .83, efficiency: .72, fertility: .52, resilience: .42, camouflage: .35, moisture: .63, tempOptimum: 21, tempTolerance: 12 },
    description: 'A pollinator that prospers where flowers bloom. Bees help replenish the meadow as they forage.'
  },
  frog: {
    id: 'frog', name: 'Tree frog', short: 'Frog', mark: 'T', color: '#83aa77',
    role: 'Insectivore', diet: 'Meadow bees', eats: ['bee'], preyOf: ['fox', 'owl'],
    basePopulation: 15, matureAt: 30, lifespan: 480, gestation: 30, litter: 2,
    traits: { speed: .46, efficiency: .57, fertility: .48, resilience: .62, camouflage: .82, moisture: .88, tempOptimum: 17, tempTolerance: 14 },
    description: 'A moisture-loving insect hunter. Frogs retreat when wetlands dry and thrive through mild, rainy seasons.'
  },
  owl: {
    id: 'owl', name: 'Barn owl', short: 'Owl', mark: 'O', color: '#a995c5',
    role: 'Night hunter', diet: 'Mice and frogs', eats: ['mouse', 'frog'], preyOf: [],
    basePopulation: 4, matureAt: 80, lifespan: 1100, gestation: 64, litter: 1,
    traits: { speed: .76, efficiency: .64, fertility: .29, resilience: .76, camouflage: .88, moisture: .42, tempOptimum: 8, tempTolerance: 24 },
    description: 'A low-density night hunter. Owls can buffer rodent surges, but reproduction is slow.'
  }
};

export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];

export const SCENARIOS = [
  { id: 'meadow', name: 'Balanced meadow', note: 'A lively meadow with room for every guild.', icon: '✳', settings: { temperature: 18, rainfall: 62, seasonality: 68, resourceAbundance: 70, habitatQuality: 76, disturbance: 0 }, populations: { mouse: 60, fox: 4, bee: 50, frog: 26, owl: 2 } },
  { id: 'drought', name: 'Long dry spell', note: 'Thin rainfall tests the meadow and its pollinators.', icon: '☼', settings: { temperature: 23, rainfall: 29, seasonality: 82, resourceAbundance: 57, habitatQuality: 59, disturbance: 0 }, populations: { mouse: 24, fox: 7, bee: 33, frog: 11, owl: 4 } },
  { id: 'winter', name: 'Winter refuge', note: 'Begin in the cold; see who can weather it.', icon: '❄', settings: { temperature: 4, rainfall: 55, seasonality: 94, resourceAbundance: 53, habitatQuality: 64, disturbance: 0 }, populations: { mouse: 24, fox: 6, bee: 17, frog: 9, owl: 5 } },
  { id: 'predators', name: 'Hunters arrive', note: 'A sudden rise in predators changes the balance.', icon: '◈', settings: { temperature: 16, rainfall: 61, seasonality: 70, resourceAbundance: 66, habitatQuality: 72, disturbance: 26 }, populations: { mouse: 37, fox: 14, bee: 36, frog: 17, owl: 9 } }
];

export const DEFAULT_SETTINGS = { temperature: 18, rainfall: 62, seasonality: 68, resourceAbundance: 70, habitatQuality: 76, disturbance: 0 };
