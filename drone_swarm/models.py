"""
Core domain models for the disaster-relief drone swarm.

These are deliberately plain dataclasses / enums with no framework coupling,
so the same models can be driven by the simulator today and by a real
MAVSDK/PX4 backend later without any changes here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import TypedDict
import uuid


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


# --------------------------------------------------------------------------
# Geography
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class Coordinate:
    lat: float
    lon: float

    def midpoint(self, other: "Coordinate") -> "Coordinate":
        return Coordinate((self.lat + other.lat) / 2, (self.lon + other.lon) / 2)


@dataclass(frozen=True)
class BoundingArea:
    """Simple lat/lon bounding box. Swap for a polygon later if needed."""
    sw: Coordinate  # south-west corner
    ne: Coordinate  # north-east corner

    def width(self) -> float:
        return self.ne.lon - self.sw.lon

    def height(self) -> float:
        return self.ne.lat - self.sw.lat

    def center(self) -> Coordinate:
        return self.sw.midpoint(self.ne)


# --------------------------------------------------------------------------
# Drones
# --------------------------------------------------------------------------

class DroneCategory(str, Enum):
    SCOUT = "scout"              # search / detect survivors
    MEDICAL = "medical"          # medical supply delivery
    SUPPLY = "supply"            # food / water / general supply delivery
    COMMS_RELAY = "comms_relay"  # extends mesh network range


class DroneStatus(str, Enum):
    RESERVE = "reserve"          # in the replacement pool, unassigned
    IDLE = "idle"                # assigned to a squad, awaiting task
    EN_ROUTE = "en_route"
    EXECUTING = "executing"
    RETURNED = "returned"
    COMPROMISED = "compromised"  # failed validation / went dark
    OFFLINE = "offline"


@dataclass
class Drone:
    id: str
    category: DroneCategory
    position: Coordinate
    battery: float = 100.0
    status: DroneStatus = DroneStatus.RESERVE
    trust_score: float = 50.0    # 0-100, starts neutral
    squad_id: str | None = None
    is_leader: bool = False

    def summary(self) -> str:
        role = "LEADER" if self.is_leader else self.category.value
        return (f"{self.id} [{role}] battery={self.battery:.0f}% "
                f"trust={self.trust_score:.0f} status={self.status.value}")


# --------------------------------------------------------------------------
# Tasks
# --------------------------------------------------------------------------

class TaskType(str, Enum):
    SEARCH = "search"
    DELIVER_MEDICAL = "deliver_medical"
    DELIVER_SUPPLY = "deliver_supply"
    RELAY_COMMS = "relay_comms"


class TaskStatus(str, Enum):
    ASSIGNED = "assigned"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


@dataclass
class Task:
    id: str
    zone_id: str
    task_type: TaskType
    target: Coordinate
    assigned_drone_id: str
    status: TaskStatus = TaskStatus.ASSIGNED
    tick: int = 0


CATEGORY_TASK_MAP: dict[DroneCategory, TaskType] = {
    DroneCategory.SCOUT: TaskType.SEARCH,
    DroneCategory.MEDICAL: TaskType.DELIVER_MEDICAL,
    DroneCategory.SUPPLY: TaskType.DELIVER_SUPPLY,
    DroneCategory.COMMS_RELAY: TaskType.RELAY_COMMS,
}


# --------------------------------------------------------------------------
# Zones & squads
# --------------------------------------------------------------------------

@dataclass
class Zone:
    id: str
    area: BoundingArea
    cleared: bool = False


@dataclass
class Squad:
    id: str
    zone_id: str
    leader_id: str
    member_ids: list[str] = field(default_factory=list)  # includes leader


# --------------------------------------------------------------------------
# Mission state (the LangGraph state object)
# --------------------------------------------------------------------------

class MissionState(TypedDict):
    mission_id: str
    disaster_type: str
    area: BoundingArea
    tick: int
    max_ticks: int
    num_squads: int

    drones: dict[str, Drone]
    reserve_pool: list[str]          # drone ids not yet assigned to a squad
    zones: dict[str, Zone]
    squads: dict[str, Squad]
    tasks: dict[str, Task]

    event_log: list[str]
