"""
FastAPI backend for the Drone Swarm UI.

Endpoints:
  POST /api/mission/start    - Start a mission with user-defined area & squads
  GET  /api/mission/{id}     - Get mission state
  POST /api/chat             - LLM (Ollama) chat about the mission
  GET  /api/mission/{id}/zones - Get zone polygons for map rendering
"""

from __future__ import annotations

import sys
import os
import uuid
import threading
from typing import Optional

# Make sure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

from drone_swarm.models import BoundingArea, Coordinate, MissionState, new_id
from drone_swarm.simulator import SimulatedDroneController, generate_fleet
from generation.graph import build_graph

app = FastAPI(title="Drone Swarm API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store
missions: dict[str, MissionState] = {}
mission_status: dict[str, str] = {}  # "running" | "done" | "error"


# --------------------------------------------------------------------------
# Request / Response models
# --------------------------------------------------------------------------

class BoundaryPoint(BaseModel):
    lat: float
    lon: float


class MissionRequest(BaseModel):
    boundary: list[BoundaryPoint]   # polygon points (min 2 = SW/NE of bbox)
    num_squads: int = 3
    max_ticks: int = 5
    disaster_type: str = "flood"
    reserves_per_squad: int = 1


class ChatRequest(BaseModel):
    mission_id: Optional[str] = None
    message: str
    model: str = "qwen2.5:3b"


class ChatResponse(BaseModel):
    reply: str


class MissionResponse(BaseModel):
    mission_id: str
    status: str
    tick: int
    max_ticks: int
    num_squads: int
    zones: list[dict]
    squads: list[dict]
    drones: list[dict]
    event_log: list[str]


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def bbox_from_boundary(points: list[BoundaryPoint]) -> BoundingArea:
    """Derive a bounding box from a polygon boundary."""
    lats = [p.lat for p in points]
    lons = [p.lon for p in points]
    return BoundingArea(
        sw=Coordinate(lat=min(lats), lon=min(lons)),
        ne=Coordinate(lat=max(lats), lon=max(lons)),
    )


def state_to_response(mission_id: str, state: MissionState) -> MissionResponse:
    zones = []
    for z in state["zones"].values():
        zones.append({
            "id": z.id,
            "cleared": z.cleared,
            "sw": {"lat": z.area.sw.lat, "lon": z.area.sw.lon},
            "ne": {"lat": z.area.ne.lat, "lon": z.area.ne.lon},
            "center": {"lat": z.area.center().lat, "lon": z.area.center().lon},
        })

    squads = []
    for sq in state["squads"].values():
        squads.append({
            "id": sq.id,
            "zone_id": sq.zone_id,
            "leader_id": sq.leader_id,
            "member_ids": sq.member_ids,
        })

    drones = []
    for d in state["drones"].values():
        drones.append({
            "id": d.id,
            "category": d.category.value,
            "status": d.status.value,
            "battery": round(d.battery, 1),
            "trust_score": round(d.trust_score, 1),
            "is_leader": d.is_leader,
            "squad_id": d.squad_id,
            "lat": d.position.lat,
            "lon": d.position.lon,
        })

    return MissionResponse(
        mission_id=mission_id,
        status=mission_status.get(mission_id, "unknown"),
        tick=state["tick"],
        max_ticks=state["max_ticks"],
        num_squads=state["num_squads"],
        zones=zones,
        squads=squads,
        drones=drones,
        event_log=state["event_log"],
    )


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------

@app.post("/api/mission/start")
async def start_mission(req: MissionRequest):
    if req.num_squads < 1 or req.num_squads > 20:
        raise HTTPException(400, "num_squads must be 1-20")
    if len(req.boundary) < 2:
        raise HTTPException(400, "Need at least 2 boundary points")

    area = bbox_from_boundary(req.boundary)
    home = area.center()
    mission_id = new_id("mission")

    initial_state: MissionState = {
        "mission_id": mission_id,
        "disaster_type": req.disaster_type,
        "area": area,
        "tick": 0,
        "max_ticks": req.max_ticks,
        "num_squads": req.num_squads,
        "drones": generate_fleet(req.num_squads, req.reserves_per_squad, home),
        "reserve_pool": [],
        "zones": {},
        "squads": {},
        "tasks": {},
        "event_log": [],
    }
    initial_state["reserve_pool"] = list(initial_state["drones"].keys())

    missions[mission_id] = initial_state
    mission_status[mission_id] = "running"

    # Run graph in background thread
    def run():
        try:
            app_graph = build_graph(SimulatedDroneController(seed=42))
            final = app_graph.invoke(initial_state, config={"recursion_limit": 200})
            missions[mission_id] = final
            mission_status[mission_id] = "done"
        except Exception as e:
            mission_status[mission_id] = f"error: {e}"

    t = threading.Thread(target=run, daemon=True)
    t.start()

    return {"mission_id": mission_id, "status": "running"}


@app.get("/api/mission/{mission_id}")
async def get_mission(mission_id: str):
    if mission_id not in missions:
        raise HTTPException(404, "Mission not found")
    return state_to_response(mission_id, missions[mission_id])


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Forward message to Ollama with mission context injected as system prompt."""
    system_prompt = (
        "You are a drone swarm mission analyst AI assistant. "
        "You help operators understand disaster-relief drone swarm missions. "
        "You can explain zone partitioning, squad formation, trust scores, and mission outcomes. "
        "Be concise and technical but clear."
    )

    if req.mission_id and req.mission_id in missions:
        state = missions[req.mission_id]
        zones_cleared = sum(1 for z in state["zones"].values() if z.cleared)
        system_prompt += (
            f"\n\nCurrent mission context:"
            f"\n- Mission ID: {req.mission_id}"
            f"\n- Disaster type: {state['disaster_type']}"
            f"\n- Tick: {state['tick']}/{state['max_ticks']}"
            f"\n- Squads: {state['num_squads']}"
            f"\n- Zones cleared: {zones_cleared}/{len(state['zones'])}"
            f"\n- Total drones: {len(state['drones'])}"
            f"\n- Recent events: {'; '.join(state['event_log'][-5:])}"
        )

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "http://localhost:11434/api/chat",
                json={
                    "model": req.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": req.message},
                    ],
                    "stream": False,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            reply = data["message"]["content"]
    except httpx.ConnectError:
        reply = (
            "⚠️ Ollama is not running. Start it with `ollama serve` and ensure "
            f"the `{req.model}` model is pulled (`ollama pull {req.model}`)."
        )
    except Exception as e:
        reply = f"⚠️ LLM error: {e}"

    return ChatResponse(reply=reply)


@app.get("/")
async def root():
    return {"message": "Drone Swarm API running. Use /api/* endpoints."}
