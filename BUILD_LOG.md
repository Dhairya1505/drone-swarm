# Build Log

## 2026-09-15 — Concept exploration & architecture

- Defined the core concept: an operator submits disaster-area coordinates,
  an AI orchestrator forms squads (one leader + several category-specialized
  followers) per zone, with trust-scored fault tolerance, LLM-based
  "digital twin" validation, and federated learning across drones.
- Sketched the layered architecture (Command UI → Mission Orchestrator →
  Squad { Leader, Followers }) and walked it as a diagram.
- Raised and resolved several feasibility questions:
  - Full onboard LLM inference on real edge hardware isn't realistic given
    drone power/compute budgets → decided the digital-twin validator will
    be simulated first, with a path to a distilled/edge-sized model later.
  - Federated learning doesn't fit "request validation" — redirected it to
    a concrete task (local perception models, FedAvg on weights only).
  - "Natural disaster" and "epidemic" have different task profiles →
    decided to keep scope general for now rather than commit early, since
    the data model already generalizes across `TaskType`/`DroneCategory`.
- Decisions locked in for this build phase:
  - Scope: general disaster type (not epidemic-specific yet).
  - Target: simulation now, real drones later via ArduPilot/PX4 + MAVSDK.
  - Framework: LangGraph over CrewAI — leader election, fault injection,
    and replacement are state-machine-shaped problems that fit LangGraph's
    explicit graph/cycle model better than a simpler delegation framework.
  - Build order: (1) core orchestrator + squad delegation, (2) trust score
    + leader election + fault injection, (3) digital-twin validator,
    (4) federated learning demo, (5) UI/live map, (6) real hardware.

## 2026-09-15 — Phase 1 build: core orchestrator + squad delegation

1. **Environment setup**
   ```
   mkdir -p disaster_drone_swarm/drone_swarm disaster_drone_swarm/tests
   pip install --break-system-packages langgraph pydantic
   ```
   Installed `langgraph==1.2.11`, `langchain-core==1.6.3`,
   `pydantic==2.13.5`. Verified the `StateGraph` / `add_conditional_edges`
   API directly in the sandbox before writing code against it, rather than
   assuming a remembered API shape (LangGraph's surface has moved around
   across versions).

2. **`drone_swarm/models.py`** — domain models with no framework coupling:
   `Coordinate`, `BoundingArea`, `Drone` (+ `DroneCategory`, `DroneStatus`),
   `Task` (+ `TaskType`, `TaskStatus`), `Zone`, `Squad`, and the
   `MissionState` TypedDict that LangGraph threads through the whole graph.
   Added `num_squads` to `MissionState` after realizing the zone-partition
   step needs to know the target zone count up front.

3. **`drone_swarm/simulator.py`** — the hardware abstraction seam:
   - `DroneController` (abstract): `move_to`, `execute_task`.
   - `SimulatedDroneController`: pure-software implementation; success
     probability is weighted by battery level so low-battery drones fail
     more often — this is what the trust system (Phase 2) will react to.
   - `partition_area`: grid-splits a bounding box into N sub-zones.
   - `generate_fleet`: builds one drone per category per squad, plus a
     configurable reserve pool.

4. **`drone_swarm/graph.py`** — the LangGraph orchestrator:
   `partition_zones → form_squads → leader_delegate_tasks → execute_tasks
   → aggregate_report`, with a conditional edge back to
   `leader_delegate_tasks` (loop = one "tick") until every zone is cleared
   or `max_ticks` is hit. Chose a looping graph over a straight-line
   pipeline specifically so Phase 2's leader election and Phase 3's
   validator can hook into the same cycle later without restructuring it.

5. **`drone_swarm/main.py`** — CLI demo wiring a sample mission through the
   graph and printing the event log / final zone / final drone status.

6. **Verification**
   - `python3 -m drone_swarm.main` — ran a 3-squad flood-response demo
     end-to-end; all 3 zones cleared in a single tick (seed 42).
   - Re-ran with a different seed and with a 2-squad mission to confirm
     the result wasn't a fluke of one seed.
   - Wrote a controller that force-fails each drone's first attempt to
     specifically exercise the multi-tick loop path — confirmed the graph
     correctly loops (`tick 0` → not cleared → `tick 1` → cleared) rather
     than only ever taking the single-pass route.
   - Added `tests/test_models.py` (zone partitioning, fleet generation) and
     `tests/test_graph.py` (mission terminates within tick budget, one
     squad per zone, exactly one leader per squad).
   - `python3 -m pytest tests/ -v` → **6 passed**.

7. **Docs**: wrote `README.md` (refined pitch + how to run), this file,
   and `ARCHITECTURE.md` (full design across all phases, including the
   ones not yet built, so the trust/election/validator/FL work has a
   target to build toward).

### State at end of this session

- Phase 1 complete and tested: coordinates → zones → squads → task
  delegation → simulated execution → reporting, running as a real
  LangGraph state machine.
- `trust_score` exists on every drone and is already adjusted on
  success/failure, but nothing yet *acts* on low trust (no election, no
  replacement, no validator) — that's Phase 2.
- No UI, no FastAPI backend, no real MAVSDK/PX4 integration yet — the CLI
  demo and the `DroneController` seam are the placeholders for those.

### Next session should start with

Phase 2: replace the flat ±5/−10 trust adjustment with an EMA, add a
`request_replacement` path when a drone's status is `OFFLINE`/
`COMPROMISED`, add a leader-failure branch to `should_continue` that
triggers a trust-weighted election, and add fault-injection tests that
force a leader failure mid-mission.
