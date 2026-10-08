# Architecture

## 1. System layers

```
Command UI  →  Mission Orchestrator  →  Squad { Leader → Followers }
                                              ↑
                                        Reserve pool (replacements)
```

- **Command UI** — operator submits an area (coordinates), a disaster
  type, and available drone count. Not yet built (Phase 5); the CLI demo
  in `main.py` stands in for it today.
- **Mission Orchestrator** — partitions the area into zones and spawns one
  squad per zone. Implemented as a LangGraph `StateGraph` in `graph.py`.
- **Squad** — a leader drone plus followers, one per category, operating
  a single zone.
- **Reserve pool** — unassigned drones held back to replace failed or
  compromised ones.

## 2. Data model (`drone_swarm/models.py`)

| Model | Purpose |
|---|---|
| `Coordinate`, `BoundingArea` | Geography. Bounding box today; swap for a polygon if the covered area isn't rectangular. |
| `Drone` | id, category, position, battery, status, `trust_score` (0–100), squad membership, `is_leader` flag. |
| `DroneCategory` | `SCOUT`, `MEDICAL`, `SUPPLY`, `COMMS_RELAY`. |
| `Zone` | A sub-area with a `cleared` flag. |
| `Squad` | A leader id + member ids operating one zone. |
| `Task` | A unit of work (search / deliver medical / deliver supply / relay comms) assigned to one drone. |
| `MissionState` | The full state passed through the LangGraph graph — drones, zones, squads, tasks, reserve pool, tick counter, event log. |

`MissionState` is deliberately the single source of truth the whole graph
operates on, so every subsystem below (trust, election, validation, FL)
extends the same state object rather than introducing a parallel one.

## 3. Orchestration graph (`drone_swarm/graph.py`) — Phase 1, built

```
START → partition_zones → form_squads → leader_delegate_tasks → execute_tasks → aggregate_report
                                                ↑                                       │
                                                └──────────── should_continue ──────────┤
                                                                                          ↓
                                                                                         END
```

- `partition_zones` — grid-splits the mission's bounding box into
  `num_squads` sub-zones.
- `form_squads` — pulls one drone per category from the reserve pool for
  each zone, forms a squad, and elects a leader (highest trust score among
  members — currently a no-op since all drones start at equal trust, but
  this becomes meaningful once scores diverge across ticks).
- `leader_delegate_tasks` — each squad's leader assigns each follower a
  task matching its category.
- `execute_tasks` — tasks run against a `DroneController` (see §6), which
  mutates drone position/battery and returns success/failure.
- `aggregate_report` — logs squad status and increments the tick counter.
- `should_continue` — conditional edge: loop back to
  `leader_delegate_tasks` unless every zone is cleared or the tick budget
  (`max_ticks`) is exhausted.

This loop is why LangGraph rather than a simpler pipeline: leader
election, fault injection, and the validator layer (Phases 2–3) all hook
into the same cycle without restructuring it.

## 4. Trust score — Phase 2, not yet built

Score components, combined as an exponential moving average so one bad
reading doesn't disqualify a drone permanently, while a sustained pattern
does:

- Task success/failure (implemented today as a flat ±5/−10 adjustment —
  the EMA smoothing is the Phase 2 refinement)
- Response latency
- Validator agreement rate (see §5)
- Peer corroboration (other drones confirming a report)

**Leader election on compromise:** when a leader goes dark or fails
validation, the squad elects a replacement from its members — highest
trust score above a threshold, ties broken by battery/uptime. This is a
Raft-style election weighted by trust instead of term number, and plugs
into the existing `should_continue` cycle as an extra branch: detect
leader failure → re-run a leader-selection step → resume delegation.

## 5. Digital-twin validator — Phase 3, not yet built

Running a full LLM on physical edge hardware isn't realistic given drone
power/compute budgets — but since this project is simulation-first, that
constraint doesn't apply yet, which works in our favor for prototyping.

Planned design: each drone carries a lightweight "twin" that watches the
command/report stream to and from the leader and checks it against
expected behavior — does the task match the drone's category, does it stay
inside the mission geofence, is it consistent with resource limits.
Anomalies get flagged, and flags feed directly into trust score. In
simulation this can be a real (small) LLM call or an embedding-similarity
classifier; on real hardware later it would need to shrink to something
edge-deployable — a distilled classifier rather than a general LLM.

## 6. Hardware abstraction (`drone_swarm/simulator.py`)

```python
class DroneController(ABC):
    def move_to(self, drone, target): ...
    def execute_task(self, drone, task) -> TaskStatus: ...
```

`SimulatedDroneController` is the only implementation today — success
probability is weighted by battery level, so low-battery drones fail more
often, giving the trust system something real to react to once Phase 2
lands.

This interface is the deliberate seam for the "eventually real drones"
goal: a future `MavsdkDroneController` implementing the same interface
would talk to PX4 SITL over MAVSDK/MAVLink first (still simulated physics,
but real flight-stack software), and then to real ArduPilot/PX4 hardware —
with zero changes to `graph.py`.

## 7. Federated learning — Phase 4, not yet built

FL doesn't map cleanly onto request validation — it needs an actual
learning task with local data. The planned fit: each drone runs a small
perception model (e.g. person detection) trained on its own local camera
feed; only model weight updates get sent to a central aggregator (FedAvg),
never raw imagery. Planned tooling: [Flower](https://flower.ai) with a
small PyTorch model, run as a separate subsystem from the orchestration
graph, not a node inside it.

## 8. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Agent orchestration | LangGraph | Leader election, replacement, and validation are state-machine-shaped problems — LangGraph's explicit graph/state model and cycles fit better than a simpler role-delegation framework. |
| Local drone models (later) | Flower + small PyTorch models | Standard FL framework, works with small edge-sized models. |
| Backend API (later) | FastAPI | For real coordinate input and mission control endpoints. |
| Live map UI (later) | React + Leaflet/Mapbox | Coordinate input + live drone/zone status. |
| Comms bus (later) | MQTT or Redis pub/sub | Simulates the mesh comms real drone swarms use; MQTT specifically because real drone fleets often use it too. |
| Flight stack (later) | MAVSDK against PX4 SITL, then real PX4/ArduPilot | Concrete path from simulation to real hardware without changing orchestration logic. |

## 9. Known scope decisions

- **General disaster type for now** — search/rescue and epidemic response
  have different task profiles; the model already supports adding new
  `TaskType`/`DroneCategory` values without restructuring, so this can
  specialize later without a rewrite.
- **Simulation-first, real hardware later** — the `DroneController` seam
  exists specifically so this transition doesn't require touching the
  orchestration graph.
- **Rectangular zone partitioning for now** — a real disaster area is
  rarely a clean rectangle; a polygon-aware or Voronoi partition is a
  reasonable later upgrade to `partition_area`.
