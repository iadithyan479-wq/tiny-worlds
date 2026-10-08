import { createWorld, summarizeWorld } from './core/world.js';
import { changeEnvironment, triggerDisturbance } from './core/simulation.js';
import { seekWorld } from './core/history.js';
import { autosave, deleteSave, listSaves, loadAutosave, loadSave, parseWorldJSON, saveWorld, serializeWorld } from './core/storage.js';
import { SPECIES, SCENARIOS } from './data/scenarios.js';
import { WorldCanvas } from './ui/world-view.js';
import { renderHistoryChart, renderLegend } from './ui/charts.js';
import { getStarterPopulations, narrativeFor, renderEvents, renderInspector, renderMetrics, renderScenarios, renderSpecies, renderStarterSliders } from './ui/panels.js';

const $ = id => document.getElementById(id);
let world = loadAutosave() || createWorld();
let previewWorld = null;
let selectedSpecies = null;
let selectedAnimal = null;
let playing = false;
let speedIndex = 0;
let chartMode = 'population';
let traitKey = 'efficiency';
let tickHandle = null;
let toastHandle = null;
let lastPresentedEvent = 0;
let customStart = { ...SCENARIOS[0].populations };
const speeds = [{ label: '1×', days: 1, interval: 760 }, { label: '3×', days: 2, interval: 480 }, { label: '8×', days: 5, interval: 340 }];

const chart = $('history-chart');
const canvas = new WorldCanvas($('world-canvas'), selection => {
  selectedSpecies = selection.species;
  selectedAnimal = selection.animal?.id || null;
  renderAll();
});

function current() { return previewWorld || world; }
function showToast(message, error = false) {
  const region = $('toast-region'); const node = document.createElement('div');
  node.className = `toast${error ? ' is-error' : ''}`; node.textContent = message;
  region.append(node); clearTimeout(toastHandle);
  setTimeout(() => node.classList.add('is-fade'), 3000);
  toastHandle = setTimeout(() => node.remove(), 3350);
}
function fmtDay(day) { return `DAY ${String(Math.max(0, Math.floor(day))).padStart(3, '0')}`; }
function seasonFor(day) { return ['Spring', 'Summer', 'Autumn', 'Winter'][Math.floor((day % (world.seasonLength * 4)) / world.seasonLength)] || 'Spring'; }
function saveQuietly() { if (!autosave(world)) showToast('This browser is low on storage. Export a world to keep a portable copy.', true); }
function setPlaying(value) {
  playing = Boolean(value) && !previewWorld;
  clearInterval(tickHandle); tickHandle = null;
  if (playing) tickHandle = setInterval(() => advanceWorld(speeds[speedIndex].days), speeds[speedIndex].interval);
  renderTransport();
}
function advanceWorld(days) {
  if (previewWorld) {
    const next = Math.min(world.day, previewWorld.day + days);
    previewWorld = next === world.day ? null : seekWorld(world, next);
  } else {
    advanceWorldEngine(days);
    if (world.day % 4 === 0) saveQuietly();
  }
  renderAll();
}
function advanceWorldEngine(days) {
  advanceWorldCore(world, days);
}
import { advanceWorld as advanceWorldCore } from './core/simulation.js';

function seekTo(day) {
  setPlaying(false);
  const minDay = world.history[0]?.day ?? 0;
  const clamped = Math.max(minDay, Math.min(world.day, Math.floor(day)));
  previewWorld = clamped === world.day ? null : seekWorld(world, clamped);
  if (previewWorld) { selectedAnimal = null; }
  renderAll();
}

function renderTransport() {
  const active = current();
  const oldest = world.history[0]?.day ?? 0;
  $('play-icon').textContent = playing ? 'Ⅱ' : '▶';
  $('play-toggle').setAttribute('aria-label', playing ? 'Pause simulation' : 'Play simulation');
  $('run-status').textContent = previewWorld ? `Revisiting day ${previewWorld.day}` : playing ? 'World in motion' : 'Observing';
  $('live-dot').classList.toggle('is-paused', !playing && !previewWorld);
  $('speed-toggle').textContent = speeds[speedIndex].label;
  $('timeline-slider').min = String(oldest);
  $('timeline-slider').max = String(Math.max(oldest, world.day));
  $('timeline-slider').value = String(active.day);
  $('timeline-start').textContent = fmtDay(oldest);
  $('timeline-end').textContent = fmtDay(world.day);
  $('return-live').disabled = !previewWorld;
  $('world-season').textContent = `${(active.weather?.season || seasonFor(active.day)).toUpperCase()} · ${fmtDay(active.day)}`;
  const temp = Math.round(active.weather?.temperature ?? active.settings.temperature);
  const wind = active.weather?.wind ?? 0;
  $('world-weather').textContent = `${temp}° · ${wind < 10 ? 'still air' : wind < 24 ? 'light breeze' : 'windy'}`;
  const ticks = $('timeline-ticks');
  ticks.replaceChildren();
  const span = Math.max(1, world.day - oldest);
  world.events.filter(event => event.day >= oldest && event.day <= world.day && !['checkpoint', 'world'].includes(event.type)).slice(-120).forEach(event => {
    const dot = document.createElement('i'); dot.className = 'timeline-mark';
    dot.style.left = `${((event.day - oldest) / span) * 100}%`; dot.title = `${fmtDay(event.day)} · ${event.text || event.type}`; ticks.append(dot);
  });
}

function renderEnvironment(worldState) {
  for (const input of document.querySelectorAll('input[data-setting]')) {
    const key = input.dataset.setting;
    if (document.activeElement !== input) input.value = String(worldState.settings[key]);
    input.disabled = Boolean(previewWorld);
    const value = Number(input.value);
    $(`out-${key}`).textContent = key === 'temperature' ? `${value}°C` : `${value}%`;
  }
}

function renderChart(worldState) {
  const legends = renderHistoryChart(chart, worldState.history, chartMode, selectedSpecies, seekTo, traitKey);
  renderLegend($('chart-legend'), legends);
  const aria = { population: 'Population history over time', meadow: 'Plant cover and ecosystem health over time', diversity: 'Biodiversity and species richness over time', traits: 'Average inherited foraging efficiency over time' }[chartMode];
  chart.setAttribute('aria-label', aria);
}

function renderAll() {
  const active = current();
  if (selectedAnimal && !active.animals.some(animal => animal.id === selectedAnimal)) selectedAnimal = null;
  const metricRoot = document;
  const summary = renderMetrics(metricRoot, active);
  $('world-name').textContent = world.name;
  $('world-title').textContent = previewWorld ? `A moment in the past` : active.day === 0 ? 'A meadow in motion' : `A meadow in motion`;
  $('world-narrative').textContent = narrativeFor(active, summary);
  $('map-coordinates').textContent = `${active.width} × ${active.height}`;
  $('species-insight').textContent = renderSpecies($('species-list'), active, selectedSpecies, speciesId => {
    selectedSpecies = speciesId; selectedAnimal = null; canvas.setSelection(null, speciesId); renderAll();
  });
  renderInspector($('inspector-content'), $('inspector-title'), active, selectedAnimal, selectedSpecies);
  renderEvents($('event-feed'), active, seekTo);
  $('notes-count').textContent = active.events.filter(event => event.day <= active.day && event.type !== 'checkpoint').length;
  renderTransport(); renderEnvironment(active.settings); renderChart(active);
  canvas.setWorld(active); canvas.setSelection(selectedAnimal, selectedSpecies);
  if (active.day > 0) {
    const keyEvent = active.events.at(-1);
    if (keyEvent && keyEvent.id !== lastPresentedEvent && ['birth', 'death', 'extinction', 'fire', 'flood', 'heatwave', 'coldSnap', 'population'].includes(keyEvent.type)) {
      lastPresentedEvent = keyEvent.id;
      const pill = $('map-event'); pill.textContent = keyEvent.text || 'A change rippled through the meadow.';
      pill.classList.add('is-visible'); setTimeout(() => pill.classList.remove('is-visible'), 2400);
    }
  }
}

function prepareCustomSliders() {
  const defaultSpecies = Object.fromEntries(Object.entries(SPECIES).map(([id, spec]) => [id, spec.basePopulation]));
  renderStarterSliders($('population-starters'), customStart || defaultSpecies);
}
function openScenarioDialog() {
  renderScenarios($('scenario-grid'), startScenario);
  customStart = { ...SCENARIOS[0].populations };
  prepareCustomSliders();
  if (!$('scenario-dialog').open) $('scenario-dialog').showModal();
}
function startScenario(scenarioId) {
  if (world.day > 0 && !window.confirm('Start a new world? Your current world will remain in the named save list only if you save it first.')) return;
  const scenario = SCENARIOS.find(item => item.id === scenarioId) || SCENARIOS[0];
  setPlaying(false); previewWorld = null; selectedSpecies = null; selectedAnimal = null;
  world = createWorld({ scenarioId, seed: (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0 });
  lastPresentedEvent = 0; saveQuietly(); $('scenario-dialog').close(); renderAll(); showToast(`${scenario.name} is ready. Watch a few seasons unfold.`);
}

function makeCustomWorld() {
  if (world.day > 0 && !window.confirm('Start a custom world? Save the current world first if you want to keep it in this browser.')) return;
  const numeric = id => Number($(id).value);
  const settings = {
    temperature: Math.max(-8, Math.min(34, numeric('custom-temperature'))),
    rainfall: Math.max(0, Math.min(100, numeric('custom-rainfall'))),
    seasonality: 68, resourceAbundance: Math.max(0, Math.min(100, numeric('custom-resources'))),
    habitatQuality: Math.max(0, Math.min(100, numeric('custom-habitat'))), disturbance: 0
  };
  setPlaying(false); previewWorld = null; selectedSpecies = null; selectedAnimal = null;
  world = createWorld({ scenarioId: 'meadow', seed: (Date.now() ^ 0x5bd1e995) >>> 0, settings, populations: getStarterPopulations($('population-starters')) });
  world.name = 'Custom meadow'; world.events[0].text = 'Your custom meadow is ready for observation.'; lastPresentedEvent = 0;
  saveQuietly(); $('scenario-dialog').close(); renderAll(); showToast('Custom meadow planted. Small changes can have long echoes.');
}

function openSaveDialog() {
  $('save-name').value = world.name;
  renderSaves();
  $('save-dialog').showModal();
  $('save-name').focus();
}
function renderSaves() {
  const list = listSaves();
  $('save-list').innerHTML = list.length ? list.map(item => `<div class="saved-world"><span class="observation-mark">✳</span><div class="saved-world-copy"><strong>${escapeHTML(item.name)}</strong><small>${fmtDay(item.day)} · ${item.total} animals · ${new Date(item.updatedAt).toLocaleDateString()}</small></div><div class="saved-world-actions"><button data-load="${escapeHTML(item.id)}">Open</button><button class="delete-save" data-delete="${escapeHTML(item.id)}" aria-label="Delete saved world ${escapeHTML(item.name)}">Remove</button></div></div>`).join('') : '<div class="empty-saves">No named worlds yet. Save this meadow to return to it later.</div>';
  $('save-list').querySelectorAll('[data-load]').forEach(button => button.addEventListener('click', () => {
    try { world = loadSave(button.dataset.load); previewWorld = null; selectedAnimal = null; selectedSpecies = null; setPlaying(false); renderAll(); $('save-dialog').close(); showToast(`Opened “${world.name}”.`); }
    catch (error) { showToast(error.message, true); }
  }));
  $('save-list').querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => {
    const target = button.closest('.saved-world')?.querySelector('strong')?.textContent || 'this world';
    if (!window.confirm(`Remove “${target}” from this browser's saved worlds?`)) return;
    deleteSave(button.dataset.delete); renderSaves(); showToast('Saved world removed from this browser.');
  }));
}
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function exportCurrent() {
  try {
    const blob = new Blob([serializeWorld(world)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${world.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'tiny-world'}-day-${world.day}.json`;
    anchor.click(); URL.revokeObjectURL(url); showToast('Portable world file exported.');
  } catch (error) { showToast(error.message, true); }
}
async function importFile(file) {
  if (!file) return;
  try {
    if (file.size > 8_000_000) throw new Error('This world file is larger than the 8 MB import limit.');
    const restored = parseWorldJSON(await file.text());
    if (!window.confirm(`Replace the current world with “${restored.name}”, last at day ${restored.day}? Save this meadow first if you want to keep it.`)) return;
    setPlaying(false); previewWorld = null; world = restored; selectedAnimal = null; selectedSpecies = null;
    saveQuietly(); renderAll(); $('save-dialog').close(); showToast(`“${world.name}” is back in your field journal.`);
  } catch (error) { showToast(error.message || 'Could not open that world file.', true); }
  finally { $('import-world').value = ''; }
}

$('play-toggle').addEventListener('click', () => setPlaying(!playing));
$('step-forward').addEventListener('click', () => advanceWorld(1));
$('step-back').addEventListener('click', () => { if (current().day > (world.history[0]?.day ?? 0)) seekTo(current().day - 1); });
$('speed-toggle').addEventListener('click', () => { speedIndex = (speedIndex + 1) % speeds.length; if (playing) setPlaying(true); else renderTransport(); });
$('timeline-slider').addEventListener('input', event => seekTo(Number(event.target.value)));
$('return-live').addEventListener('click', () => { previewWorld = null; selectedAnimal = null; renderAll(); showToast('Returned to the present day.'); });
$('focus-home').addEventListener('click', () => canvas.fit());
$('clear-inspector').addEventListener('click', () => { selectedAnimal = null; selectedSpecies = null; canvas.setSelection(null, null); renderAll(); });
$('scenarios-open').addEventListener('click', openScenarioDialog);
$('create-custom').addEventListener('click', makeCustomWorld);
$('save-open').addEventListener('click', openSaveDialog);
$('save-confirm').addEventListener('click', () => {
  try { saveWorld(world, $('save-name').value); renderSaves(); showToast(`“${$('save-name').value.trim() || world.name}” is in your field journal.`); }
  catch (error) { showToast(error.message, true); }
});
$('save-name').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('save-confirm').click(); } });
$('export-world').addEventListener('click', exportCurrent);
$('import-world').addEventListener('change', event => importFile(event.target.files?.[0]));
$('help-open').addEventListener('click', () => $('guide-dialog').showModal());
$('footer-guide').addEventListener('click', () => $('guide-dialog').showModal());
$('guide-close').addEventListener('click', () => $('guide-dialog').close());
$('chart-tooltip').textContent = 'Choose a point on the chart to revisit that day.';
chart.addEventListener('chartpoint', event => {
  $('chart-tooltip').textContent = event.detail.message;
  chart.dataset.hoverDay = event.detail.day ?? '';
});
document.querySelectorAll('[data-chart]').forEach(button => button.addEventListener('click', () => {
  chartMode = button.dataset.chart;
  document.querySelectorAll('[data-chart]').forEach(tab => { const active = tab === button; tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', String(active)); });
  $('trait-selector').hidden = chartMode !== 'traits';
  renderChart(current());
}));
$('trait-selector').addEventListener('change', event => { traitKey = event.target.value; renderChart(current()); });
document.querySelectorAll('input[data-setting]').forEach(input => {
  input.addEventListener('input', () => {
    const value = Number(input.value); $(`out-${input.dataset.setting}`).textContent = input.dataset.setting === 'temperature' ? `${value}°C` : `${value}%`;
  });
  input.addEventListener('change', () => {
    if (previewWorld) { showToast('Return to the present before changing this habitat.', true); renderEnvironment(world); return; }
    changeEnvironment(world, { [input.dataset.setting]: Number(input.value) });
    saveQuietly(); renderAll(); showToast(`${input.dataset.setting === 'temperature' ? 'Temperature' : input.dataset.setting.replace(/[A-Z]/g, letter => ` ${letter.toLowerCase()}`)} changed. Watch the next few days for a response.`);
  });
});
document.querySelectorAll('[data-disturbance]').forEach(button => button.addEventListener('click', () => {
  if (previewWorld) { showToast('Return to the present before changing this habitat.', true); return; }
  const type = button.dataset.disturbance;
  const labels = { rain: 'rain', heatwave: 'heatwave', coldSnap: 'cold snap', fire: 'grass fire', flood: 'flood' };
  if (['fire', 'flood', 'coldSnap'].includes(type) && !window.confirm(`Bring on a ${labels[type]}? This sudden disturbance can injure animals and damage vegetation.`)) return;
  triggerDisturbance(world, type); saveQuietly(); renderAll(); showToast(`${labels[type]} has changed the habitat. Follow the event in the history.`);
}));
document.addEventListener('keydown', event => {
  const target = event.target;
  if (target.matches('input,textarea,select,[contenteditable="true"]') || $('scenario-dialog').open || $('save-dialog').open || $('guide-dialog').open) return;
  if (event.code === 'Space') { event.preventDefault(); setPlaying(!playing); }
  if (event.key === 'ArrowRight' && (event.altKey || event.metaKey)) { event.preventDefault(); advanceWorld(1); }
  if (event.key.toLowerCase() === 'g') { canvas.fit(); showToast('Fitted the whole habitat.'); }
});
window.addEventListener('beforeunload', () => { if (tickHandle) clearInterval(tickHandle); autosave(world); });
window.addEventListener('pagehide', () => { autosave(world); });

prepareCustomSliders();
$('custom-temperature').value = world.settings.temperature;
$('custom-rainfall').value = world.settings.rainfall;
$('custom-resources').value = world.settings.resourceAbundance;
$('custom-habitat').value = world.settings.habitatQuality;
renderAll();
setInterval(() => { if (!playing && !previewWorld && world.day > 0) saveQuietly(); }, 45_000);
