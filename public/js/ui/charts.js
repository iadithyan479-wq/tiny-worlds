import { SPECIES } from '../data/scenarios.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 700, H = 132, L = 42, R = 10, T = 8, B = 23;
const COLORS = Object.fromEntries(Object.entries(SPECIES).map(([id, item]) => [id, item.color]));
const LABELS = Object.fromEntries(Object.entries(SPECIES).map(([id, item]) => [id, item.name]));
const TRAITS = { speed: 'Speed', efficiency: 'Foraging efficiency', fertility: 'Fertility', resilience: 'Resilience', camouflage: 'Camouflage', moisture: 'Moisture affinity', tempOptimum: 'Climate optimum', tempTolerance: 'Climate tolerance', fitness: 'Fitness' };

function el(tag, attrs = {}, text = null) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = String(text);
  return node;
}

function seriesFor(history, mode, focusedSpecies, traitKey) {
  if (!history.length) return [];
  if (mode === 'meadow') return [{ id: 'plant', label: 'Plant cover', color: '#759568', values: history.map(row => row.plant || 0) }, { id: 'health', label: 'World health', color: '#d7a05d', values: history.map(row => row.health || 0) }];
  if (mode === 'diversity') return [{ id: 'diversity', label: 'Biodiversity', color: '#7f9f69', values: history.map(row => row.diversity || 0) }, { id: 'species', label: 'Species present', color: '#bd8c6c', values: history.map(row => row.speciesPresent || 0) }];
  if (mode === 'traits') {
    const ids = focusedSpecies ? [focusedSpecies] : Object.keys(SPECIES);
    return ids.map(id => ({
      id, label: `${LABELS[id]} · ${TRAITS[traitKey] || TRAITS.efficiency}`, color: COLORS[id],
      values: history.map(row => row.traitProfile?.[id]?.[traitKey]?.mean || 0),
      spread: history.map(row => row.traitProfile?.[id]?.[traitKey]?.spread || 0)
    }));
  }
  const ids = focusedSpecies ? [focusedSpecies, ...Object.keys(SPECIES).filter(id => id !== focusedSpecies)] : Object.keys(SPECIES);
  return ids.map(id => ({ id, label: LABELS[id] || id, color: COLORS[id], values: history.map(row => row.populations?.[id] || 0) }));
}

export function renderHistoryChart(container, history, mode = 'population', focusedSpecies = null, onSeek = () => {}, traitKey = 'efficiency') {
  const rows = history.length > 160 ? history.filter((_, index) => index % Math.ceil(history.length / 160) === 0 || index === history.length - 1) : history;
  container.replaceChildren();
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${mode} history, day ${rows[0]?.day ?? 0} through day ${rows.at(-1)?.day ?? 0}` });
  const series = seriesFor(rows, mode, focusedSpecies, traitKey);
  const traitMode = mode === 'traits';
  const traitIsTemperature = ['tempOptimum', 'tempTolerance'].includes(traitKey);
  const all = series.flatMap(item => item.values.flatMap((value, index) => [value, value - (item.spread?.[index] || 0), value + (item.spread?.[index] || 0)]));
  const maxValue = traitMode ? (traitIsTemperature ? 38 : 1) : Math.max(1, ...all);
  const minValue = traitMode ? (traitIsTemperature ? -12 : 0) : 0;
  const top = T, bottom = H - B, height = bottom - top, width = W - L - R;
  const xAt = index => L + (rows.length <= 1 ? .5 : index / (rows.length - 1)) * width;
  const yAt = value => bottom - ((value - minValue) / Math.max(1, maxValue - minValue)) * height;

  for (let i = 0; i <= 3; i++) {
    const y = top + (height * i) / 3;
    svg.append(el('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'chart-grid' }));
    const value = maxValue - ((maxValue - minValue) * i) / 3;
    const label = traitMode ? `${value.toFixed(traitIsTemperature ? 0 : 1)}${traitIsTemperature ? '°' : ''}` : Math.round(value);
    svg.append(el('text', { x: L - 8, y: y + 3, 'text-anchor': 'end', class: 'chart-label' }, label));
  }
  svg.append(el('line', { x1: L, x2: W - R, y1: bottom, y2: bottom, class: 'chart-axis' }));
  const startDay = rows[0]?.day || 0, endDay = rows.at(-1)?.day || startDay;
  svg.append(el('text', { x: L, y: H - 5, class: 'chart-label' }, `DAY ${String(startDay).padStart(3, '0')}`));
  svg.append(el('text', { x: W - R, y: H - 5, 'text-anchor': 'end', class: 'chart-label' }, `DAY ${String(endDay).padStart(3, '0')}`));

  for (const item of series) {
    if (traitMode && item.spread) {
      const upper = item.values.map((value, index) => value + item.spread[index]);
      const lower = item.values.map((value, index) => value - item.spread[index]);
      const area = [...upper.map((value, index) => `${index ? 'L' : 'M'}${xAt(index).toFixed(2)},${yAt(value).toFixed(2)}`), ...lower.map((value, index) => `L${xAt(index).toFixed(2)},${yAt(value).toFixed(2)}`).reverse()].join(' ');
      svg.append(el('path', { d: `${area} Z`, fill: item.color, 'fill-opacity': focusedSpecies ? .16 : .08, stroke: 'none' }));
    }
    const d = item.values.map((value, index) => `${index ? 'L' : 'M'}${xAt(index).toFixed(2)},${yAt(value).toFixed(2)}`).join(' ');
    svg.append(el('path', { d, class: 'chart-line', stroke: item.color, 'stroke-width': item.id === focusedSpecies ? 2.8 : 1.9, opacity: item.id === focusedSpecies || !focusedSpecies ? .95 : .48 }));
    if (rows.length) svg.append(el('circle', { cx: xAt(rows.length - 1), cy: yAt(item.values.at(-1)), r: item.id === focusedSpecies ? 3.2 : 2.3, fill: item.color, class: 'chart-dot' }));
  }
  const hit = el('rect', { x: L, y: T, width, height, fill: 'transparent', 'pointer-events': 'all', class: 'chart-hit' });
  let crosshair = null;
  hit.addEventListener('pointermove', event => {
    const rect = svg.getBoundingClientRect();
    const local = (event.clientX - rect.left) / rect.width * W;
    const index = Math.max(0, Math.min(rows.length - 1, Math.round((local - L) / width * Math.max(0, rows.length - 1))));
    const row = rows[index]; if (!row) return;
    crosshair?.remove(); crosshair = el('line', { x1: xAt(index), x2: xAt(index), y1: T, y2: bottom, stroke: '#586c53', 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: .75 });
    svg.insertBefore(crosshair, hit);
    const values = series.map(item => {
      const value = item.values[index];
      const spread = item.spread?.[index];
      const display = traitMode ? `${value.toFixed(traitIsTemperature ? 1 : 2)}${traitIsTemperature ? '°' : ''}${spread > 0 ? ` ±${spread.toFixed(2)}` : ''}` : item.id === 'plant' ? `${row.plant}%` : item.id === 'health' ? `${row.health}%` : item.id === 'diversity' ? (row.diversity || 0).toFixed(2) : item.id === 'species' ? row.speciesPresent : row.populations?.[item.id] || 0;
      return `${item.label} ${display}`;
    }).join('  ·  ');
    container.dispatchEvent(new CustomEvent('chartpoint', { bubbles: true, detail: { day: row.day, message: `DAY ${String(row.day).padStart(3, '0')}  ·  ${values}` } }));
  });
  hit.addEventListener('pointerleave', () => { crosshair?.remove(); crosshair = null; container.dispatchEvent(new CustomEvent('chartpoint', { bubbles: true, detail: { day: null, message: 'Choose a point on the chart to revisit that day.' } })); });
  hit.addEventListener('click', event => {
    const rect = svg.getBoundingClientRect();
    const local = (event.clientX - rect.left) / rect.width * W;
    const index = Math.max(0, Math.min(rows.length - 1, Math.round((local - L) / width * Math.max(0, rows.length - 1))));
    if (rows[index]) onSeek(rows[index].day);
  });
  svg.append(hit); container.append(svg);
  return series.map(item => ({ id: item.id, label: item.label, color: item.color }));
}

export function renderLegend(container, items) {
  container.replaceChildren();
  for (const item of items) {
    const label = document.createElement('span'); label.className = 'legend-item';
    const swatch = document.createElement('i'); swatch.className = 'legend-swatch'; swatch.style.background = item.color;
    const text = document.createElement('span'); text.textContent = item.label;
    label.append(swatch, text); container.append(label);
  }
}
