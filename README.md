# Tiny Worlds

A local-first, interactive ecosystem simulator. Watch a meadow change as seasons, resources, predators, and inherited traits shape the lives of field mice, red foxes, meadow bees, tree frogs, and barn owls.

## Run it

Requires Node.js 20 or newer; there are no third-party packages.

```sh
npm start       # local server at http://localhost:3000
npm test        # deterministic engine and save-format tests
npm run build   # static site in dist/
```

## Explore

- Choose a starting scenario (balanced meadow, drought, winter refuge, predator pulse, or a custom world).
- Play, pause, step a day, change pace, and scrub the eventful history.
- Drag to pan and use the wheel/pinch to zoom. Select an organism or species to inspect its needs, health, ancestry, and inherited traits.
- Adjust temperature, rainfall, seasonal swing, meadow fertility, habitat quality, and disturbances; the meadow explains the consequences in its field notes.
- Follow population, vegetation, diversity, and trait trends in the history panel. Trait charts compare species means with shaded variation bands, including fitness. Replay resumes from saved checkpoints.
- Save named worlds in this browser, restore them later, or export/import portable JSON files.

## Ecology model

Plant biomass grows from rain, warmth, and habitat, while dry conditions and trampling reduce it. Pollinators and mice use plant resources; frogs hunt pollinators; foxes and owls hunt small mammals and frogs. Every animal carries inherited speed, foraging efficiency, fertility, climate resilience, camouflage, and moisture affinity. Energy, habitat, crowding, age, and climate stress shape survival and reproduction. Offspring inherit traits with small mutations; fitness-dependent survival lets selection emerge rather than being scripted.

The simulation is educational and intentionally simplified; it is not a scientific forecasting tool. Everything runs on-device. Named saves, replay history, and the autosave stay in browser local storage unless you explicitly export data.

## Project structure

- `public/js/core/`: deterministic world generation, ecological updates, evolution, history, and persistence.
- `public/js/ui/`: canvas habitat view, SVG history charts, and accessible information panels.
- `public/js/data/scenarios.js`: species definitions, scenario presets, and custom-world parameters.
- `tests/`: Node's built-in test suite; `server.js` and `build.js` use only Node built-ins.

## License

MIT. See [LICENSE](LICENSE).
