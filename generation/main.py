"""
CLI demo: runs one mission end-to-end through the LangGraph orchestrator
using the simulated drone controller.

Usage:
    python3 -m drone_swarm.main
"""

from __future__ import annotations

from generation.graph import build_graph
from drone_swarm.models import BoundingArea, Coordinate, MissionState, new_id
from drone_swarm.simulator import SimulatedDroneController, generate_fleet


def run_demo_mission() -> MissionState:
    # Roughly a 2km x 2km disaster area, as an example.
    area = BoundingArea(
        sw=Coordinate(lat=12.930, lon=79.140),
        ne=Coordinate(lat=12.948, lon=79.158),
    )
    home = area.center()
    num_squads = 3
    reserves_per_squad = 1  # replacement pool, unused until phase 2

    initial_state: MissionState = {
        "mission_id": new_id("mission"),
        "disaster_type": "flood",
        "area": area,
        "tick": 0,
        "max_ticks": 5,
        "num_squads": num_squads,
        "drones": generate_fleet(num_squads, reserves_per_squad, home),
        "reserve_pool": [],
        "zones": {},
        "squads": {},
        "tasks": {},
        "event_log": [],
    }
    initial_state["reserve_pool"] = list(initial_state["drones"].keys())

    app = build_graph(SimulatedDroneController(seed=42))
    final_state = app.invoke(initial_state, config={"recursion_limit": 100})
    return final_state


def main() -> None:
    final_state = run_demo_mission()

    print("\n=== EVENT LOG ===")
    for line in final_state["event_log"]:
        print(line)

    print("\n=== FINAL ZONE STATUS ===")
    for zone in final_state["zones"].values():
        print(f"{zone.id}: cleared={zone.cleared}")

    print("\n=== FINAL DRONE STATUS ===")
    for drone in final_state["drones"].values():
        print(drone.summary())

    print(f"\nMission ended after {final_state['tick']} tick(s).")


if __name__ == "__main__":
    main()
