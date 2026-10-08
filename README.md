# SwarmAid — Agentic Disaster-Relief Drone Swarm

## Refined idea

SwarmAid is an agentic multi-drone system for natural-disaster response. An
operator submits the coordinates of an affected area through a UI. A mission
orchestrator splits that area into zones and spins up one **squad** per zone.
Each squad has a **leader drone** and several **follower drones**, each
specialized by category (search, medical supply, general supply, comms
relay). The leader delegates tasks to its followers and reports results
back up the chain.

Two systems sit on top of that basic hierarchy:

- **Trust and fault tolerance.** Every drone carries a trust score built
  from task outcomes and peer/validator feedback. If a drone's score drops
  too low (bad behavior, going dark, failing validation), it's pulled from
  duty and replaced from a reserve pool. If the *leader* is compromised, the
  squad elects a new one from among its members, weighted by trust score.
- **Federated learning.** Each drone runs a small local perception model
  (e.g. person detection) trained on its own sensor data. Only model
  weights — never raw imagery — go up to a central aggregator, which is a
  reasonable real justification for FL here: bandwidth in a disaster zone
  is scarce, and you don't want raw footage of victims leaving the device.

The project intentionally targets **simulation first, real hardware
later**. Every drone interaction goes through a `DroneController`
interface; today it's implemented by a pure-software simulator, and later
an identical interface can be implemented against PX4 SITL and then real
ArduPilot/PX4 hardware over MAVSDK, without touching the orchestration
logic.

## Current status: Phase 1 complete

Phase 1 — the core orchestrator and squad-delegation loop, built on
LangGraph — is implemented, tested, and runnable. See `BUILD_LOG.md` for
the detailed build record and `ARCHITECTURE.md` for full design docs,
including the phases that haven't been built yet (trust-based leader
election, the digital-twin validator, and the federated-learning demo).

## Project structure

```
disaster_drone_swarm/
├── drone_swarm/
│   ├── models.py      # Domain models: Coordinate, Drone, Zone, Squad, Task, MissionState
│   ├── simulator.py   # DroneController interface + simulated backend, zone partitioning, fleet generation
│   ├── graph.py        # LangGraph StateGraph: the orchestrator + squad delegation loop
│   └── main.py         # CLI demo entry point
├── tests/
│   ├── test_models.py
│   └── test_graph.py
├── requirements.txt
├── README.md
├── ARCHITECTURE.md
└── BUILD_LOG.md

```

## Running it

```bash
pip install -r requirements.txt
python3 -m drone_swarm.main       # run a demo mission and print the event log
python3 -m pytest tests/ -v       # run the test suite
```

The demo (`main.py`) creates a sample flood-response mission over a small
bounding box, generates a fleet of drones, and runs it through the graph
until every zone is marked cleared or the tick budget runs out — printing
the full event log, final zone status, and final drone status.

## Roadmap

1. ~~Core orchestrator + squad delegation (LangGraph)~~ — **done**
2. Trust score evolution, fault injection, and trust-weighted leader
   election within the graph
3. Digital-twin validator layer (semantic firewall on leader↔follower
   messages)
4. Federated learning demo on a toy perception task (via Flower)
5. Live map UI + FastAPI backend for real coordinate input
6. Swap `SimulatedDroneController` for a MAVSDK-backed controller talking
   to PX4 SITL, then real hardware
