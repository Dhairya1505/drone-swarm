"""
Simulation backend for the drone swarm.

DroneController is the swap point for realism: today it's backed by
SimulatedDroneController (pure software, no hardware). Later, a
MavsdkDroneController implementing the same interface can talk to PX4
SITL and then real ArduPilot/PX4 hardware over MAVSDK/MAVLink, without
any change to the LangGraph orchestration logic in graph.py.
"""

from __future__ import annotations

import random
from abc import ABC, abstractmethod

from drone_swarm.models import (
    BoundingArea,
    Coordinate,
    Drone,
    DroneCategory,
    DroneStatus,
    Task,
    TaskStatus,
    Zone,
    new_id,
)


# --------------------------------------------------------------------------
# Controller interface (the hardware swap point)
# --------------------------------------------------------------------------

class DroneController(ABC):
    """Abstract interface every backend (simulated or real) must implement."""

    @abstractmethod
    def move_to(self, drone: Drone, target: Coordinate) -> None:
        ...

    @abstractmethod
    def execute_task(self, drone: Drone, task: Task) -> TaskStatus:
        """Attempt the task, mutate drone state (battery/position), return outcome."""
        ...


class SimulatedDroneController(DroneController):
    """
    Pure-software stand-in for real flight hardware. Success probability is
    weighted by battery level so low-battery drones fail more often, which
    gives the trust-score system something real to react to later.
    """

    def __init__(self, seed: int | None = None):
        self._rng = random.Random(seed)

    def move_to(self, drone: Drone, target: Coordinate) -> None:
        drone.position = target
        drone.battery = max(0.0, drone.battery - self._rng.uniform(2, 6))

    def execute_task(self, drone: Drone, task: Task) -> TaskStatus:
        self.move_to(drone, task.target)
        if drone.battery <= 0:
            drone.status = DroneStatus.OFFLINE
            return TaskStatus.FAILED

        success_probability = 0.6 + (drone.battery / 100.0) * 0.35
        success = self._rng.random() < success_probability
        drone.battery = max(0.0, drone.battery - self._rng.uniform(1, 4))
        return TaskStatus.SUCCEEDED if success else TaskStatus.FAILED


# --------------------------------------------------------------------------
# Area partitioning
# --------------------------------------------------------------------------

def partition_area(area: BoundingArea, num_zones: int) -> list[Zone]:
    """
    Split a bounding box into a roughly-square grid of sub-zones.
    Good enough for v1; swap for a proper polygon/Voronoi split later
    if the covered area isn't rectangular.
    """
    if num_zones <= 0:
        raise ValueError("num_zones must be positive")

    cols = max(1, round(num_zones ** 0.5))
    rows = max(1, -(-num_zones // cols))  # ceil division

    lat_step = area.height() / rows
    lon_step = area.width() / cols

    zones: list[Zone] = []
    count = 0
    for r in range(rows):
        for c in range(cols):
            if count >= num_zones:
                break
            sw = Coordinate(area.sw.lat + r * lat_step, area.sw.lon + c * lon_step)
            ne = Coordinate(area.sw.lat + (r + 1) * lat_step, area.sw.lon + (c + 1) * lon_step)
            zones.append(Zone(id=new_id("zone"), area=BoundingArea(sw, ne)))
            count += 1

    return zones


# --------------------------------------------------------------------------
# Fleet generation
# --------------------------------------------------------------------------

SQUAD_COMPOSITION = [
    DroneCategory.SCOUT,
    DroneCategory.MEDICAL,
    DroneCategory.SUPPLY,
    DroneCategory.COMMS_RELAY,
]


def generate_fleet(num_squads: int, reserves_per_squad: int, home: Coordinate) -> dict[str, Drone]:
    """
    Build enough drones for `num_squads` squads of 4 (one per category)
    plus a shared reserve pool for replacements.
    """
    drones: dict[str, Drone] = {}

    for _ in range(num_squads):
        for category in SQUAD_COMPOSITION:
            d = Drone(id=new_id("drone"), category=category, position=home)
            drones[d.id] = d

    total_reserves = num_squads * reserves_per_squad
    for i in range(total_reserves):
        category = SQUAD_COMPOSITION[i % len(SQUAD_COMPOSITION)]
        d = Drone(id=new_id("drone"), category=category, position=home)
        drones[d.id] = d

    return drones
