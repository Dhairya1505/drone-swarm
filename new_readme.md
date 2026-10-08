# 🚁 SwarmAid — Agentic Disaster-Relief Drone Swarm

> **Simulation-first**, agentic multi-drone system for natural-disaster response — built on LangGraph, FastAPI, and React.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Use Cases](#2-use-cases)
3. [Architecture](#3-architecture)
4. [Project Structure](#4-project-structure)
5. [Tech Stack](#5-tech-stack)
6. [Prerequisites](#6-prerequisites)
7. [Running the Project](#7-running-the-project)
   - [Quick Start (Batch Scripts)](#71-quick-start-batch-scripts)
   - [Manual Step-by-Step](#72-manual-step-by-step)
   - [Running Tests](#73-running-tests)
   - [CLI Demo (No UI)](#74-cli-demo-no-ui)
8. [API Reference](#8-api-reference)
9. [UI Components](#9-ui-components)
10. [Configuration & Environment Variables](#10-configuration--environment-variables)
11. [Known Issues & Notes](#11-known-issues--notes)
12. [Roadmap](#12-roadmap)

---

## 1. Project Overview

**SwarmAid** is an agentic multi-drone coordination system designed for natural-disaster response scenarios. An operator draws a mission area on a live map UI; the backend mission orchestrator automatically:

1. **Partitions** the area into sub-zones
2. **Forms squads** — one leader drone + specialist followers per zone
3. **Delegates tasks** — leaders assign work matching each drone's category (Scout, Medical, Supply, Comms Relay)
4. **Executes and monitors** — drones fly, consume battery, succeed or fail
5. **Aggregates reports** — event log updates in real-time via the UI

Two advanced systems layer on top (Phase 2–4, partially implemented):

- **Trust & Fault Tolerance** — each drone carries a trust score. Failing drones are pulled from duty; if a leader is compromised, the squad elects a replacement (Raft-style, weighted by trust score).
- **Federated Learning** — drones train local perception models (e.g. person detection) and share only weight updates — never raw imagery — preserving privacy over scarce disaster-zone bandwidth.

---

## 2. Use Cases

| Scenario | How SwarmAid Helps |
|---|---|
| 🌊 **Flood Response** | Scout drones map inundated areas; supply drones deliver emergency kits to isolated survivors |
| 🔥 **Wildfire Monitoring** | Comms-relay drones extend radio coverage; scouts track fire front in real time |
| 🏚️ **Earthquake Search & Rescue** | Scouts identify rubble sites with survivors; medical drones drop first-aid payloads |
| 🌀 **Hurricane Aftermath** | Grid-coverage sweep identifies road damage; supply drones prioritize delivery by trust-scored path |
| 🧪 **Epidemic Response** | Medical drones deliver test kits or vaccines to remote communities autonomously |
| 🛰️ **Comms Blackout Zone** | Comms-relay drones form an ad-hoc mesh network restoring operator communications |

---

## 3. Architecture

### 3.1 System Layers

```
Operator (Web UI)
      │
      ▼
FastAPI Backend (api/server.py)
      │
      ▼
Mission Orchestrator (LangGraph StateGraph — generation/graph.py)
      │
      ├──▶ Squad 1 [ Leader → Scout | Medical | Supply | Comms ]
      ├──▶ Squad 2 [ Leader → Scout | Medical | Supply | Comms ]
      └──▶ Squad N [ Leader → ... ]
                         │
                   Reserve Pool
                 (replacement drones)
```

### 3.2 Orchestration Graph (LangGraph)

```
START
  │
  ▼
partition_zones          ← splits bounding box into N sub-zones
  │
  ▼
form_squads              ← pulls drones from reserve pool, elects leader
  │
  ▼
leader_delegate_tasks    ◀──────────────────────────────────┐
  │                                                          │
  ▼                                                          │
execute_tasks            ← DroneController.execute_task()   │
  │                         (simulated or real hardware)    │
  ▼                                                          │
aggregate_report         ← logs outcomes, updates trust     │
  │                                                          │
  ▼                                                          │
should_continue ─── zones remain & ticks left ──────────────┘
  │
  └─── all zones cleared OR tick budget exhausted ───▶ END
```

### 3.3 Data Models (`drone_swarm/models.py`)

| Model | Key Fields |
|---|---|
| `Coordinate` | `lat`, `lon` |
| `BoundingArea` | `sw: Coordinate`, `ne: Coordinate`, `center()` |
| `Drone` | `id`, `category`, `position`, `battery`, `status`, `trust_score`, `is_leader`, `squad_id` |
| `DroneCategory` | `SCOUT`, `MEDICAL`, `SUPPLY`, `COMMS_RELAY` |
| `Zone` | `id`, `area: BoundingArea`, `cleared: bool` |
| `Squad` | `id`, `zone_id`, `leader_id`, `member_ids` |
| `Task` | `id`, `type`, `assigned_drone_id`, `zone_id`, `status` |
| `MissionState` | Full graph state: drones, zones, squads, tasks, reserve_pool, tick, event_log |

### 3.4 Hardware Abstraction (`drone_swarm/simulator.py`)

```python
class DroneController(ABC):
    def move_to(self, drone, target): ...
    def execute_task(self, drone, task) -> TaskStatus: ...
```

- **Today:** `SimulatedDroneController` — success probability weighted by battery level
- **Future:** `MavsdkDroneController` → PX4 SITL → real ArduPilot/PX4 hardware

Zero changes to `graph.py` needed when swapping the controller.

### 3.5 Trust Score System (Phase 2)

Score components combined as an exponential moving average:
- Task success / failure (`±5 / −10` adjustments)
- Response latency
- Validator agreement rate
- Peer corroboration

Leader election: highest trust score above threshold; ties broken by battery/uptime.

### 3.6 AI Chat Assistant

The backend proxies chat messages to a local **Ollama** LLM (`qwen2.5:3b` by default), injecting real-time mission context (tick, zones cleared, recent events) as the system prompt. The UI's chat panel lets operators query the AI mid-mission.

---

## 4. Project Structure

```
drone-swarm/
├── api/
│   ├── __init__.py
│   └── server.py           # FastAPI app — mission & chat endpoints
│
├── drone_swarm/
│   ├── models.py           # Domain models (Drone, Zone, Squad, Task, MissionState)
│   ├── simulator.py        # DroneController ABC + SimulatedDroneController
│   └── graph.py / main.py  # LangGraph orchestration + CLI demo
│
├── generation/
│   └── graph.py            # build_graph() factory used by the API
│
├── ui/                     # React + Vite frontend
│   ├── .env                # VITE_GOOGLE_MAPS_KEY, VITE_API_URL
│   ├── src/
│   │   ├── App.jsx         # Root component, tab routing
│   │   ├── api.js          # Fetch helpers (startMission, getMission, chat)
│   │   ├── components/
│   │   │   ├── MapView.jsx       # Interactive map, zone overlay, drone markers
│   │   │   ├── ControlPanel.jsx  # Mission config form (squads, ticks, disaster type)
│   │   │   ├── MissionPanel.jsx  # Live status: zones, squads, drones, event log
│   │   │   └── ChatPanel.jsx     # AI chat assistant panel
│   │   └── index.css / App.css
│   └── package.json
│
├── test/
│   └── test_graph.py       # Pytest test suite for the LangGraph orchestrator
│
├── requirements.txt        # Python dependencies
├── start_api.bat           # One-click API server launcher (Windows)
├── start_ui.bat            # One-click UI dev server launcher (Windows)
├── ARCHITECTURE.md         # Full design document
├── BUILD_LOG.md            # Development build history
└── README.md               # Original README
```

---

## 5. Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Agent Orchestration | **LangGraph** | Cyclic state-machine graph fits leader election, fault injection, and validation loops |
| Backend API | **FastAPI** + Uvicorn | Async, typed, auto-docs at `/docs` |
| AI Chat | **Ollama** (`qwen2.5:3b`) | Local LLM, no API key required |
| Frontend | **React** + Vite | Fast HMR dev server, component-based UI |
| Map | **Google Maps JS API** (with SVG canvas fallback) | Real coordinate input and drone visualization |
| Data Validation | **Pydantic v2** | Strict typed models throughout |
| Testing | **pytest** | Orchestrator unit & integration tests |
| Future FL | **Flower** + PyTorch | Federated learning for on-drone perception |
| Future Hardware | **MAVSDK** → PX4 SITL | Path to real flight stack without graph changes |

---

## 6. Prerequisites

### Python (Backend)

| Requirement | Version |
|---|---|
| Python | 3.10+ |
| pip | any recent |

### Node.js (Frontend)

| Requirement | Version |
|---|---|
| Node.js | 18+ |
| npm | 9+ |

### Optional (for AI Chat)

| Requirement | Notes |
|---|---|
| [Ollama](https://ollama.ai) | Run `ollama serve` and `ollama pull qwen2.5:3b` |

### Optional (for real Google Maps)

| Requirement | Notes |
|---|---|
| Google Maps API Key | Set `VITE_GOOGLE_MAPS_KEY` in `ui/.env` — SVG canvas fallback works without it |

---

## 7. Running the Project

### 7.1 Quick Start (Batch Scripts)

Open **two separate terminals** in the project root and run:

**Terminal 1 — API Server:**
```bat
start_api.bat
```

**Terminal 2 — UI Dev Server:**
```bat
start_ui.bat
```

Then open **http://localhost:5173** in your browser.

---

### 7.2 Manual Step-by-Step

#### Step 1 — Set up Python virtual environment

```powershell
# Create and activate venv
python -m venv venv
.\venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt
```

#### Step 2 — Start the FastAPI backend

```powershell
# With venv activated:
python -m uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at:
- **API Base:** http://localhost:8000
- **Interactive Docs (Swagger):** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

#### Step 3 — Install and start the React frontend

```powershell
# In a new terminal:
cd ui
npm install       # first time only
npm run dev
```

The UI will be available at **http://localhost:5173**

#### Step 4 — (Optional) Start Ollama for AI Chat

```powershell
# In a third terminal:
ollama serve

# Pull the default model (one-time):
ollama pull qwen2.5:3b
```

---

### 7.3 Running Tests

```powershell
# With venv activated, from project root:
pytest test/ -v
```

Expected output: all tests pass — covers zone partitioning, squad formation, task delegation, and execution flow.

---

### 7.4 CLI Demo (No UI)

Run a complete simulated flood-response mission entirely in the terminal:

```powershell
# With venv activated:
python -m drone_swarm.main
```

Prints:
- Full tick-by-tick event log
- Final zone status (cleared / not cleared)
- Final drone status (battery, trust score, category)

---

## 8. API Reference

Base URL: `http://localhost:8000`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Health check |
| `POST` | `/api/mission/start` | Start a new mission |
| `GET` | `/api/mission/{id}` | Poll mission state |
| `POST` | `/api/chat` | Chat with AI about a mission |

### POST `/api/mission/start`

**Request body:**
```json
{
  "boundary": [
    { "lat": 28.60, "lon": 77.20 },
    { "lat": 28.65, "lon": 77.25 }
  ],
  "num_squads": 3,
  "max_ticks": 5,
  "disaster_type": "flood",
  "reserves_per_squad": 1
}
```

**Response:**
```json
{ "mission_id": "mission-abc123", "status": "running" }
```

### GET `/api/mission/{mission_id}`

**Response:**
```json
{
  "mission_id": "mission-abc123",
  "status": "done",
  "tick": 5,
  "max_ticks": 5,
  "num_squads": 3,
  "zones": [ { "id": "...", "cleared": true, "sw": {}, "ne": {} } ],
  "squads": [ { "id": "...", "leader_id": "...", "member_ids": [] } ],
  "drones": [ { "id": "...", "category": "SCOUT", "battery": 72.3, "trust_score": 85.0, "is_leader": true } ],
  "event_log": ["Tick 1: Squad sq-1 formed in zone z-1", "..."]
}
```

### POST `/api/chat`

**Request body:**
```json
{
  "mission_id": "mission-abc123",
  "message": "Which zone has the most drone failures?",
  "model": "qwen2.5:3b"
}
```

**Response:**
```json
{ "reply": "Zone z-2 recorded 3 task failures due to low battery on Scout drone..." }
```

---

## 9. UI Components

| Component | File | Purpose |
|---|---|---|
| `App` | `App.jsx` | Root layout, tab routing between Map / Mission / Chat |
| `MapView` | `MapView.jsx` | Interactive map (Google Maps or SVG canvas fallback), draw mission boundary, zone overlay, drone markers |
| `ControlPanel` | `ControlPanel.jsx` | Mission config form: num_squads, max_ticks, disaster type; triggers mission start |
| `MissionPanel` | `MissionPanel.jsx` | Live dashboard: zone cleared status, squad compositions, drone battery/trust, scrollable event log |
| `ChatPanel` | `ChatPanel.jsx` | AI chat panel — sends messages with mission context to backend Ollama proxy |

---

## 10. Configuration & Environment Variables

### `ui/.env`

```env
# Google Maps API key (optional — SVG fallback used if missing)
VITE_GOOGLE_MAPS_KEY=your_key_here

# Backend URL (default: http://localhost:8000)
VITE_API_URL=http://localhost:8000
```

### Backend (no `.env` needed — configured via code)

| Setting | Default | Where |
|---|---|---|
| Ollama model | `qwen2.5:3b` | `api/server.py` → `ChatRequest.model` |
| Ollama host | `http://localhost:11434` | `api/server.py` |
| LangGraph recursion limit | `200` | `api/server.py` → `app_graph.invoke(...)` |
| Simulated controller seed | `42` | `api/server.py` → `SimulatedDroneController(seed=42)` |

---

## 11. Known Issues & Notes

- **Google Maps warning** (`NoApiKeys`): Safe to ignore if no API key is set — the SVG canvas fallback is fully functional.
- **`MapView` null ref error** (`getBoundingClientRect` on null): Occurs if the map canvas is clicked before it fully mounts. A null guard (`if (!canvasRef.current) return`) in `MapView.jsx` `handleClick` prevents this.
- **Ollama not running**: The chat endpoint gracefully returns a warning message instead of crashing.
- **Mission state is in-memory**: Restarting the API server clears all missions. Persistence (SQLite/Redis) is a future improvement.
- **Windows-only bat scripts**: Linux/macOS users should use the manual commands in §7.2.

---

## 12. Roadmap

| Phase | Feature | Status |
|---|---|---|
| 1 | Core orchestrator + squad delegation (LangGraph) | ✅ Done |
| 2 | Trust score EMA, fault injection, trust-weighted leader election | 🔄 Partial (basic ±score) |
| 3 | Digital-twin validator (semantic firewall on leader↔follower messages) | ⏳ Planned |
| 4 | Federated learning demo (Flower + PyTorch, toy perception task) | ⏳ Planned |
| 5 | Live map UI + FastAPI backend | ✅ Done |
| 6 | MAVSDK controller → PX4 SITL → real hardware | ⏳ Planned |

---

*Built with LangGraph · FastAPI · React · Vite · Ollama*
