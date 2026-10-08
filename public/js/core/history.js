import { SPECIES } from '../data/scenarios.js';
import { cloneWorld, initialSnapshot, recordEvent, summarizeWorld } from './world.js';
import { stepWorld, applyTimelineAction } from './simulation.js';

export function sampleHistory(world, limit = 180) {
  const rows = world.history;
  if (rows.length <= limit) return [...rows];
  const stride = (rows.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, i) => rows[Math.round(i * stride)]);
}

export function eventsAt(world, day) {
  return world.events.filter(event => event.day === day);
}

export function seekWorld(world, targetDay) {
  const target = Math.max(0, Math.min(world.day, Math.floor(targetDay)));
  const saved = (world.checkpoints || []).filter(item => item.day <= target).sort((a, b) => b.day - a.day || (b.timelineIndex || 0) - (a.timelineIndex || 0))[0];
  if (!saved || saved.day > target) throw new Error('This world has no replay checkpoint for that day.');
  const replay = cloneWorld(world);
  Object.assign(replay, {
    day: saved.day, rng: saved.rng, nextId: saved.nextId, nextEventId: saved.nextEventId,
    weather: structuredClone(saved.weather), settings: structuredClone(saved.settings),
    animals: structuredClone(saved.animals), tiles: structuredClone(saved.tiles),
    history: world.history.filter(item => item.day <= saved.day),
    events: world.events.filter(item => item.day <= saved.day),
    checkpoints: [structuredClone(saved)], replay: { position: saved.day, playing: false }
  });
  const actions = world.timeline.slice(saved.timelineIndex || 0).filter(item => item.day >= saved.day && item.day <= target).sort((a, b) => a.day - b.day);
  let cursor = 0;
  while (replay.day < target) {
    const nextDay = replay.day + 1;
    while (cursor < actions.length && actions[cursor].day <= nextDay) applyTimelineAction(replay, actions[cursor++]);
    stepWorld(replay, { recordHistory: true, recordSnapshots: false, recordEvents: true });
  }
  replay.history = world.history.filter(item => item.day <= target);
  replay.events = world.events.filter(item => item.day <= target);
  replay.timeline = world.timeline.filter(item => item.day <= target);
  replay.checkpoints = world.checkpoints.filter(item => item.day <= target);
  replay.replay = { position: target, playing: false };
  return replay;
}

export function populationRows(world) {
  return SPECIES;
}

export function metricAt(world, day) {
  let best = null;
  for (const item of world.history) if (!best || Math.abs(item.day - day) < Math.abs(best.day - day)) best = item;
  return best;
}

export function currentSummary(world) {
  const latest = world.history.at(-1);
  return latest || summarizeWorld(world);
}

export function registerCheckpoint(world) {
  const last = world.checkpoints.at(-1);
  if (!last || last.day !== world.day) world.checkpoints.push(initialSnapshot(world));
  recordEvent(world, 'checkpoint', { text: `Replay checkpoint saved at day ${world.day}.` });
}
