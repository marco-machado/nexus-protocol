# Mission-interior events are sim-side

Compounding-objective expansions, the Counter-Broadcast pressure meter, and every other in-mission trigger evaluate as seeded state predicates inside the sim's `step`, never as app-injected commands and never from wall-clock reads. This keeps mission interiors unscripted (Pillar 2), keeps every outcome reproducible by replays and headless bot probes from the command stream plus the mission seed alone, and keeps the app-layer wall-clock economy fully outside mission outcomes.

## Considered Options

App-layer injection through the command stream was rejected. It is technically replayable (the Recorder captures commands), but it would make mission outcomes depend on app logic, so determinism tests and bot probes would need the app layer to reproduce a mission, and it would open a scripting side channel into the mission interior.

## Consequences

New contract types put their triggers and counters in `SimState`, so they carry golden-hash re-pins with rationale per constitution Principle I. Meta-layer consequences of in-mission facts (for example a territory flip after a failed Counter-Broadcast) are applied at debrief, not during the mission.
