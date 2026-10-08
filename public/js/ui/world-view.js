import { HEIGHT, WIDTH } from '../core/world.js';
import { SPECIES } from '../data/scenarios.js';

const PALETTE = {
  water: ['#365c5c', '#416c67'], woodland: ['#3a5940', '#456445'], meadow: ['#78956a', '#849d70'], heath: ['#958b5d', '#a39562']
};

export class WorldCanvas {
  constructor(canvas, onSelect) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.world = null;
    this.onSelect = onSelect;
    this.selectedAnimal = null;
    this.selectedSpecies = null;
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.pointer = null;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.resizeObserver = new ResizeObserver(() => { this.resize(); this.draw(); });
    this.resizeObserver.observe(canvas);
    this.bindInput();
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.draw();
  }

  setWorld(world) { this.world = world; this.draw(); }
  setSelection(animalId, speciesId) { this.selectedAnimal = animalId || null; this.selectedSpecies = speciesId || null; this.draw(); }

  fit() {
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.draw();
  }

  focus(animal) {
    if (!animal) { this.fit(); return; }
    this.camera = { x: (WIDTH / 2 - animal.x) * .18, y: (HEIGHT / 2 - animal.y) * .18, zoom: Math.max(1.2, this.camera.zoom) };
    this.draw();
  }

  bindInput() {
    this.canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false };
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', event => {
      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      const dx = event.clientX - this.pointer.lastX;
      const dy = event.clientY - this.pointer.lastY;
      if (Math.abs(event.clientX - this.pointer.x) + Math.abs(event.clientY - this.pointer.y) > 4) this.pointer.moved = true;
      if (this.pointer.moved) {
        const scale = this.cellSize() * this.camera.zoom;
        this.camera.x += dx / scale;
        this.camera.y += dy / scale;
        this.draw();
      }
      this.pointer.lastX = event.clientX; this.pointer.lastY = event.clientY;
    });
    this.canvas.addEventListener('pointerup', event => {
      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      const p = this.pointer; this.pointer = null;
      if (!p.moved) this.selectAt(event.clientX, event.clientY);
    });
    this.canvas.addEventListener('pointercancel', () => { this.pointer = null; });
    this.canvas.addEventListener('wheel', event => {
      event.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const before = this.toWorld(event.clientX - rect.left, event.clientY - rect.top);
      this.camera.zoom = Math.max(.72, Math.min(4.2, this.camera.zoom * (event.deltaY < 0 ? 1.12 : .89)));
      const after = this.toWorld(event.clientX - rect.left, event.clientY - rect.top);
      this.camera.x += after.x - before.x;
      this.camera.y += after.y - before.y;
      this.draw();
    }, { passive: false });
    this.canvas.addEventListener('keydown', event => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault(); const step = .7 / this.camera.zoom;
        if (event.key === 'ArrowUp') this.camera.y += step;
        if (event.key === 'ArrowDown') this.camera.y -= step;
        if (event.key === 'ArrowLeft') this.camera.x += step;
        if (event.key === 'ArrowRight') this.camera.x -= step;
        this.draw();
      }
      if (event.key === '+' || event.key === '=') { this.camera.zoom = Math.min(4.2, this.camera.zoom * 1.15); this.draw(); }
      if (event.key === '-') { this.camera.zoom = Math.max(.72, this.camera.zoom * .87); this.draw(); }
    });
  }

  cellSize() {
    return Math.min(this.canvas.width / this.dpr / WIDTH, this.canvas.height / this.dpr / HEIGHT);
  }

  origin() {
    const cell = this.cellSize() * this.camera.zoom;
    const rect = this.canvas.getBoundingClientRect();
    return { x: (rect.width - WIDTH * cell) / 2 + this.camera.x * cell, y: (rect.height - HEIGHT * cell) / 2 + this.camera.y * cell, cell };
  }

  toWorld(px, py) {
    const { x, y, cell } = this.origin();
    return { x: (px - x) / cell, y: (py - y) / cell };
  }

  selectAt(clientX, clientY) {
    if (!this.world) return;
    const rect = this.canvas.getBoundingClientRect();
    const point = this.toWorld(clientX - rect.left, clientY - rect.top);
    const radius = 1.15 / this.camera.zoom;
    let nearest = null; let distance = radius;
    for (const animal of this.world.animals) {
      const d = Math.hypot(animal.x - point.x, animal.y - point.y);
      if (d < distance) { distance = d; nearest = animal; }
    }
    if (nearest) {
      this.selectedAnimal = nearest.id; this.selectedSpecies = nearest.species;
      this.onSelect({ animal: nearest, species: nearest.species });
    } else {
      const nearby = this.world.animals.filter(animal => Math.hypot(animal.x - point.x, animal.y - point.y) < 2.4 / this.camera.zoom);
      if (nearby.length) {
        const groups = Object.groupBy ? Object.groupBy(nearby, item => item.species) : nearby.reduce((acc, item) => ((acc[item.species] ||= []).push(item), acc), {});
        const species = Object.entries(groups).sort((a, b) => b[1].length - a[1].length)[0][0];
        this.selectedAnimal = null; this.selectedSpecies = species; this.onSelect({ animal: null, species });
      } else {
        this.selectedAnimal = null; this.onSelect({ animal: null, species: null });
      }
    }
    this.draw();
  }

  draw() {
    if (!this.world || !this.ctx || !this.canvas.width) return;
    const ctx = this.ctx; const ratio = this.dpr; const cw = this.canvas.width / ratio; const ch = this.canvas.height / ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#273e31'; ctx.fillRect(0, 0, cw, ch);
    const { x: ox, y: oy, cell } = this.origin();
    const size = cell * .985;
    const left = Math.max(0, Math.floor(-ox / cell)); const top = Math.max(0, Math.floor(-oy / cell));
    const right = Math.min(WIDTH, Math.ceil((cw - ox) / cell)); const bottom = Math.min(HEIGHT, Math.ceil((ch - oy) / cell));
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const tile = this.world.tiles[y * WIDTH + x]; if (!tile) continue;
      const tones = PALETTE[tile.type] || PALETTE.meadow;
      const v = (tile.elevation + tile.moisture * 2 + x * 7 + y * 13) % 13;
      ctx.fillStyle = v < 6 ? tones[0] : tones[1];
      ctx.fillRect(ox + x * cell, oy + y * cell, size, size);
      const grain = ((x * 17 + y * 41) % 23) / 23;
      if (tile.type !== 'water' && grain < tile.plant / 350) {
        ctx.fillStyle = tile.flowers > 35 && grain < tile.flowers / 350 ? 'rgba(228,207,127,.44)' : 'rgba(30,54,34,.17)';
        ctx.beginPath(); ctx.arc(ox + (x + .24 + grain * .5) * cell, oy + (y + .24 + grain * .5) * cell, Math.max(.45, cell * .045), 0, Math.PI * 2); ctx.fill();
      }
      if (tile.type === 'woodland' && cell > 6 && (x * 5 + y * 11) % 6 === 0) {
        ctx.fillStyle = 'rgba(21,52,33,.27)'; ctx.beginPath(); ctx.arc(ox + (x + .55) * cell, oy + (y + .48) * cell, cell * .24, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(233,231,203,.24)'; ctx.lineWidth = Math.max(.4, cell * .025); ctx.strokeRect(ox, oy, WIDTH * cell, HEIGHT * cell);
    this.drawAnimals(ctx, ox, oy, cell);
    this.drawCompass(ctx, cw, ch);
  }

  drawAnimals(ctx, ox, oy, cell) {
    const pulse = .5 + .5 * Math.sin((this.world.day || 0) * .22);
    const animalRadius = Math.max(1.6, Math.min(6, cell * .24));
    for (const animal of this.world.animals) {
      const spec = SPECIES[animal.species];
      if (!spec) continue;
      const x = ox + animal.x * cell; const y = oy + animal.y * cell;
      const selected = this.selectedAnimal === animal.id;
      const inSpecies = this.selectedSpecies === animal.species;
      const r = animalRadius * (animal.species === 'owl' ? 1.18 : 1);
      if (selected) {
        ctx.beginPath(); ctx.arc(x, y, r * (2.4 + pulse * .18), 0, Math.PI * 2); ctx.fillStyle = 'rgba(250,244,204,.22)'; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, Math.PI * 2); ctx.strokeStyle = '#f3e8a2'; ctx.lineWidth = 1.2; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(x + .45, y + .7, r * 1.18, 0, Math.PI * 2); ctx.fillStyle = 'rgba(19,33,24,.18)'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, y, r * (animal.species === 'fox' ? 1.35 : 1.08), r * (animal.species === 'bee' ? .8 : 1), 0, 0, Math.PI * 2);
      ctx.fillStyle = spec.color; ctx.fill(); ctx.lineWidth = selected ? 1.2 : .65; ctx.strokeStyle = selected ? '#fff6c7' : 'rgba(23,37,28,.74)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(x + r * .3, y - r * .22, Math.max(.55, r * .18), 0, Math.PI * 2); ctx.fillStyle = '#24332a'; ctx.fill();
      if (inSpecies && cell > 9) {
        ctx.beginPath(); ctx.arc(x, y, r * (1.8 + pulse * .12), 0, Math.PI * 2); ctx.strokeStyle = 'rgba(248,244,220,.5)'; ctx.lineWidth = .6; ctx.stroke();
      }
    }
  }

  drawCompass(ctx, width, height) {
    ctx.save(); ctx.translate(width - 25, height - 28); ctx.fillStyle = 'rgba(232,237,222,.68)'; ctx.font = '700 8px system-ui'; ctx.textAlign = 'center'; ctx.fillText('N', 0, -8);
    ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(-3, 2); ctx.lineTo(0, 0); ctx.lineTo(3, 2); ctx.closePath(); ctx.fill(); ctx.restore();
  }
}
