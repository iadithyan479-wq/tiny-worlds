import { SPECIES, SCENARIOS } from '../data/scenarios.js';
import { summarizeWorld } from '../core/world.js';
import { describeTrait, summarizeTraits } from '../core/evolution.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const fmtDay = value => String(Math.max(0, Math.floor(value || 0))).padStart(3, '0');
const TRAITS = [
  ['speed', 'Speed'], ['efficiency', 'Foraging'], ['fertility', 'Fertility'], ['resilience', 'Resilience'], ['camouflage', 'Camouflage'], ['moisture', 'Moisture affinity']
];

export function renderSpecies(container, world, selectedSpecies, onSelect) {
  const summary = summarizeWorld(world);
  container.innerHTML = Object.values(SPECIES).map(species => {
    const n = summary.populations[species.id] || 0;
    const older = [...world.history].reverse().find(row => row.day < world.day && row.populations?.[species.id] !== undefined);
    const shift = older && n > older.populations[species.id] ? 'RISING' : older && n < older.populations[species.id] ? 'FALLING' : n === 0 ? 'ABSENT' : 'STEADY';
    return `<button class="species-row ${selectedSpecies === species.id ? 'is-selected' : ''}" data-species="${species.id}" aria-pressed="${selectedSpecies === species.id}"><span class="species-emblem" style="color:${species.color};background:${species.color}18">${species.mark}</span><span class="species-copy"><strong>${esc(species.name)}</strong><small>${esc(species.role)} · ${shift}</small></span><span class="species-count">${n}<small>ALIVE</small></span></button>`;
  }).join('');
  container.querySelectorAll('[data-species]').forEach(button => button.addEventListener('click', () => onSelect(button.dataset.species)));
  const sum = summary.total;
  return sum ? `${summary.speciesPresent} of ${Object.keys(SPECIES).length} animal species share this meadow.` : 'No animals remain. The plants and terrain still hold a trace of what was here.';
}

function traitMarkup(traits) {
  return TRAITS.map(([key, label]) => {
    const value = Number(traits?.[key] ?? 0);
    const percent = key.startsWith('temp') ? Math.max(0, Math.min(100, (value + 12) / 50 * 100)) : Math.max(0, Math.min(100, value * 100));
    return `<div class="trait-chip"><small>${label}</small><strong>${esc(describeTrait(key, value))}</strong><div class="trait-meter"><i style="width:${percent.toFixed(1)}%"></i></div></div>`;
  }).join('');
}

function organismInspector(animal, world) {
  const species = SPECIES[animal.species];
  const stage = animal.age < species.matureAt * .28 ? 'Young' : animal.age < species.matureAt ? 'Growing' : animal.age > species.lifespan * .7 ? 'Elder' : 'Adult';
  const tile = world.tiles[Math.max(0, Math.min(world.tiles.length - 1, Math.floor(animal.y) * world.width + Math.floor(animal.x)))];
  const fitness = Math.round((animal.health * .36 + animal.energy / 1.2 * .28 + (tile?.plant || 0) * .14 + (tile?.moisture || 0) * .08 + world.settings.habitatQuality * .14));
  const needs = [['Health', animal.health], ['Energy', animal.energy / 1.2], ['Habitat fit', fitness]];
  const parents = animal.parents?.length ? animal.parents.map(id => `#${esc(id.slice(-4))}`).join(', ') : 'Ancestral line unknown';
  const age = animal.age < 90 ? `${animal.age} days` : `${(animal.age / 90).toFixed(1)} seasons`;
  const speciesPopulation = world.animals.filter(item => item.species === animal.species).length;
  const explanation = animal.energy < 25 ? `${species.name} is low on energy and needs to find food soon.` : animal.health < 45 ? `Stress is showing. Conditions may be testing this ${species.role.toLowerCase()}.` : fitness > 75 ? `Current conditions suit this ${species.role.toLowerCase()}; it has room to recover and reproduce.` : `It is ${animal.lastAction || 'exploring'} in ${tile?.type || 'the habitat'}; food and shelter shape its next day.`;
  return `<div class="inspector-identity"><span class="inspector-mark" style="color:${species.color};background:${species.color}20">${species.mark}</span><span><strong>${esc(species.name)} <span style="font:500 11px system-ui;color:#99a193">#${esc(animal.id.slice(-4))}</span></strong><small>${stage} · ${age} · generation ${animal.generation}</small></span></div><div class="inspector-tags"><span class="tag">${esc(species.role)}</span><span class="tag">${speciesPopulation} in the meadow</span><span class="tag">${esc(animal.lastAction || 'exploring')}</span></div><p class="inspector-description">${esc(explanation)}</p>${needs.map(([label,value]) => `<div class="need-row"><span>${label}</span><span class="need-track"><i class="need-fill ${value < 35 ? 'low' : ''}" style="width:${Math.max(0,Math.min(100,value))}%"></i></span><strong>${Math.round(value)}%</strong></div>`).join('')}<div class="trait-grid">${traitMarkup(animal.traits)}</div><p class="inspector-description">Parent: ${parents}. A little variation in inherited traits gives this line a different way to meet the same pressures.</p>`;
}

function speciesInspector(speciesId, world) {
  const species = SPECIES[speciesId]; const members = world.animals.filter(animal => animal.species === speciesId);
  const traits = summarizeTraits(members.length ? members : [Object.assign({ traits: species.traits }, {})]);
  const avgTraits = Object.fromEntries(Object.entries(traits).map(([key, value]) => [key, value.mean || species.traits[key]]));
  const metrics = world.history.slice(-30).map(row => row.populations?.[speciesId] || 0);
  const delta = metrics.length > 1 ? metrics.at(-1) - metrics[0] : 0;
  const direction = delta > 2 ? `has grown by ${delta}` : delta < -2 ? `has declined by ${Math.abs(delta)}` : 'has remained relatively steady';
  const headline = members.length ? `${species.name} ${direction} over the recent observation window.` : `${species.name} is absent from this world. Its return depends on conditions and a surviving lineage.`;
  return `<div class="inspector-identity"><span class="inspector-mark" style="color:${species.color};background:${species.color}20">${species.mark}</span><span><strong>${esc(species.name)}</strong><small>${esc(species.role)} · ${members.length} observed</small></span></div><div class="inspector-tags"><span class="tag">Eats ${esc(species.diet.toLowerCase())}</span><span class="tag">${members.length ? `${members.length} alive` : 'Not present'}</span></div><p class="inspector-description">${esc(headline)} ${esc(species.description)}</p><div class="trait-grid">${traitMarkup(avgTraits)}</div><p class="inspector-description">Habitat preference: ${avgTraits.moisture > .68 ? 'damp ground and wetland edges' : avgTraits.moisture < .34 ? 'drier, open ground' : 'a mix of cover and open ground'}. Reproductive pace: ${avgTraits.fertility > .62 ? 'quick' : avgTraits.fertility < .37 ? 'slow' : 'moderate'}.</p>`;
}

export function renderInspector(container, title, world, selectedAnimal, selectedSpecies) {
  const animal = selectedAnimal ? world.animals.find(item => item.id === selectedAnimal) : null;
  if (!animal && !selectedSpecies) {
    title.textContent = 'Field notes';
    container.innerHTML = '<div class="empty-observation"><span class="observation-mark">✳</span><p>Choose a species or a small life in the meadow. Its current needs, traits, and story will appear here.</p></div>';
  } else if (animal) {
    title.textContent = 'Individual study'; container.innerHTML = organismInspector(animal, world);
  } else {
    title.textContent = 'Species study'; container.innerHTML = speciesInspector(selectedSpecies, world);
  }
}

export function renderMetrics(container, world) {
  const summary = summarizeWorld(world);
  container.querySelector('#species-total').textContent = summary.total;
  container.querySelector('#metric-animals').textContent = summary.total.toLocaleString();
  container.querySelector('#metric-species').textContent = `${summary.speciesPresent} / ${Object.keys(SPECIES).length}`;
  container.querySelector('#metric-plants').textContent = `${summary.plant}%`;
  container.querySelector('#metric-diversity').textContent = summary.diversity.toFixed(2);
  container.querySelector('#world-health').textContent = `${summary.health}%`;
  return summary;
}

const EVENT_TITLES = { birth: 'NEW LIFE', death: 'DEATH', predation: 'FOOD WEB', migration: 'MIGRATION', mutation: 'MUTATION', extinction: 'EXTINCTION', population: 'POPULATION', environment: 'ENVIRONMENT', rain: 'RAIN', heatwave: 'HEATWAVE', coldSnap: 'COLD SNAP', fire: 'FIRE', flood: 'FLOOD', world: 'BEGINNING' };
export function renderEvents(container, world, onSeek) {
  const events = [...world.events].filter(event => event.day <= world.day && event.type !== 'checkpoint').slice(-9).reverse();
  container.innerHTML = events.length ? events.map(event => `<article class="event-row event-${esc(event.type)}"><span class="event-day">D${fmtDay(event.day)}</span><div><div class="event-text"><b>${esc(EVENT_TITLES[event.type] || 'OBSERVATION')}</b> · ${esc(event.text || 'Something changed in the habitat.')}</div><button class="event-action" data-day="${event.day}">REVISIT DAY ${fmtDay(event.day)} →</button></div></article>`).join('') : '<div class="no-events">Let a few days pass. The first changes will find their way into the notes.</div>';
  container.querySelectorAll('[data-day]').forEach(button => button.addEventListener('click', () => onSeek(Number(button.dataset.day))));
  return events.length;
}

export function narrativeFor(world, summary) {
  const recent = world.events.filter(event => event.day >= Math.max(0, world.day - 8) && event.day <= world.day);
  const event = recent.find(item => ['fire', 'flood', 'heatwave', 'coldSnap', 'extinction', 'birth', 'population'].includes(item.type));
  if (event) return event.text;
  const previous = world.history.length > 5 ? world.history.at(-6) : null;
  if (previous && summary.plant < previous.plant - 8) return 'Plant cover is thinning. Follow the energy needs of the grazers and pollinators.';
  if (summary.speciesPresent <= 2) return 'Only a few animal lineages remain. The meadow is entering a fragile chapter.';
  if (summary.health >= 78) return 'Several food-web layers are thriving. Look closely for subtle shifts in their balance.';
  if (summary.total === 0) return 'No animals remain in this world. A fresh scenario can begin a new observation.';
  return `${summary.speciesPresent} species share the meadow. Every season carries a different pressure.`;
}

export function renderScenarios(container, onChoose) {
  container.innerHTML = SCENARIOS.map((scenario, index) => {
    const total = Object.values(scenario.populations).reduce((a,b) => a + b, 0);
    const hot = scenario.id === 'meadow';
    return `<button class="scenario-card ${hot ? 'is-recommended' : ''}" data-scenario="${scenario.id}"><span class="scenario-card-top"><i class="scenario-icon">${scenario.icon}</i><strong>${esc(scenario.name)}</strong></span><p>${esc(scenario.note)}</p><span class="scenario-stats"><span>${total} starting animals</span><span>${scenario.settings.temperature}°C · ${scenario.settings.rainfall}% rain</span></span><span class="scenario-launch">${hot ? 'A gentle beginning →' : 'Begin here →'}</span></button>`;
  }).join('');
  container.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click', () => onChoose(button.dataset.scenario)));
}

export function renderStarterSliders(container, populations) {
  container.innerHTML = Object.entries(SPECIES).map(([id, item]) => `<div class="starter-count"><span style="color:${item.color}">${item.mark} ${esc(item.short)}</span><label>STARTING COUNT<input type="range" min="0" max="80" step="1" data-start-species="${id}" value="${populations[id] || 0}" aria-label="Starting ${esc(item.name)} count"></label><output>${populations[id] || 0}</output></div>`).join('');
  container.querySelectorAll('input[data-start-species]').forEach(input => input.addEventListener('input', () => { input.nextElementSibling.textContent = input.value; }));
}

export function getStarterPopulations(container) {
  return Object.fromEntries([...container.querySelectorAll('input[data-start-species]')].map(input => [input.dataset.startSpecies, Number(input.value)]));
}
