"""
LangGraph orchestration for the disaster-relief drone swarm.

Graph shape (v1 - core orchestrator + squad delegation):

    partition_zones -> form_squads -> leader_delegate_tasks -> execute_tasks
                                               ^                      |
                                               |                      v
                                               +---- should_continue -+
                                                         |
                                                        END

Each pass through the loop is one "tick": every squad leader hands its
followers a task, the (simulated) drones execute it, and results are
aggregated back into trust scores. The loop ends when every zone has been
marked cleared or the tick budget runs out.

Trust score and leader-election logic on top of this is phase 2 - this
graph already tracks trust_score per drone so that phase can plug in
without changing the state shape.
"""

from __future__ import annotations

from langgraph.graph import StateGraph, START, END

from drone_swarm.models import (
    CATEGORY_TASK_MAP,
    Drone,
    DroneStatus,
    MissionState,
    Squad,
    Task,
    TaskStatus,
    TaskType,
    new_id,
)
from drone_swarm.simulator import DroneController, SQUAD_COMPOSITION, partition_area


TRUST_DELTA_SUCCESS = 5.0
TRUST_DELTA_FAILURE = -10.0


def build_graph(controller: DroneController):
    """Wire up the graph, injecting the drone controller (sim or real)."""

    def partition_zones(state: MissionState) -> MissionState:
        zones = partition_area(state["area"], state["num_squads"])
        state["zones"] = {z.id: z for z in zones}
        state["event_log"].append(
            f"[tick {state['tick']}] partitioned area into {len(zones)} zones"
        )
        return state

    def form_squads(state: MissionState) -> MissionState:
        for zone in state["zones"].values():
            members: list[str] = []
            for category in SQUAD_COMPOSITION:
                drone_id = next(
                    (
                        d_id for d_id in state["reserve_pool"]
                        if state["drones"][d_id].category == category
                    ),
                    None,
                )
                if drone_id is None:
                    state["event_log"].append(
                        f"WARNING: no reserve {category.value} drone available for zone {zone.id}"
                    )
                    continue
                state["reserve_pool"].remove(drone_id)
                drone = state["drones"][drone_id]
                drone.status = DroneStatus.IDLE
                members.append(drone_id)

            if not members:
                continue

            # Leader = highest trust score among the squad's initial members
            # (all equal at mission start, so this is a stable no-op today and
            # becomes meaningful once trust scores diverge across ticks).
            leader_id = max(members, key=lambda d_id: state["drones"][d_id].trust_score)
            state["drones"][leader_id].is_leader = True

            squad = Squad(id=new_id("squad"), zone_id=zone.id, leader_id=leader_id, member_ids=members)
            state["squads"][squad.id] = squad

            for d_id in members:
                state["drones"][d_id].squad_id = squad.id

            state["event_log"].append(
                f"[tick {state['tick']}] formed {squad.id} in {zone.id}, "
                f"leader={leader_id}"
            )
        return state

    def leader_delegate_tasks(state: MissionState) -> MissionState:
        state["tasks"] = {}  # this tick's tasks only
        for squad in state["squads"].values():
            zone = state["zones"][squad.zone_id]
            if zone.cleared:
                continue

            for drone_id in squad.member_ids:
                drone = state["drones"][drone_id]
                if drone.status in (DroneStatus.OFFLINE, DroneStatus.COMPROMISED):
                    continue  # phase 2: leader requests a reserve replacement here

                task_type = CATEGORY_TASK_MAP[drone.category]
                task = Task(
                    id=new_id("task"),
                    zone_id=zone.id,
                    task_type=task_type,
                    target=zone.area.center(),
                    assigned_drone_id=drone_id,
                    tick=state["tick"],
                )
                state["tasks"][task.id] = task
                drone.status = DroneStatus.EN_ROUTE

        state["event_log"].append(
            f"[tick {state['tick']}] leaders delegated {len(state['tasks'])} tasks"
        )
        return state

    def execute_tasks(state: MissionState) -> MissionState:
        for task in state["tasks"].values():
            drone = state["drones"][task.assigned_drone_id]
            drone.status = DroneStatus.EXECUTING
            outcome = controller.execute_task(drone, task)
            task.status = outcome

            if outcome == TaskStatus.SUCCEEDED:
                drone.status = DroneStatus.RETURNED
                drone.trust_score = min(100.0, drone.trust_score + TRUST_DELTA_SUCCESS)
                if task.task_type == TaskType.SEARCH:
                    state["zones"][task.zone_id].cleared = True
            else:
                drone.trust_score = max(0.0, drone.trust_score + TRUST_DELTA_FAILURE)
                if drone.status != DroneStatus.OFFLINE:
                    drone.status = DroneStatus.IDLE

        state["event_log"].append(
            f"[tick {state['tick']}] executed {len(state['tasks'])} tasks"
        )
        return state

    def aggregate_report(state: MissionState) -> MissionState:
        for squad in state["squads"].values():
            zone = state["zones"][squad.zone_id]
            member_summaries = [state["drones"][d_id].summary() for d_id in squad.member_ids]
            state["event_log"].append(
                f"[tick {state['tick']}] {squad.id} report (zone_cleared={zone.cleared}): "
                + "; ".join(member_summaries)
            )
        state["tick"] += 1
        return state

    def should_continue(state: MissionState) -> str:
        all_cleared = all(z.cleared for z in state["zones"].values()) if state["zones"] else False
        if all_cleared or state["tick"] >= state["max_ticks"]:
            return "end"
        return "continue"

    graph = StateGraph(MissionState)
    graph.add_node("partition_zones", partition_zones)
    graph.add_node("form_squads", form_squads)
    graph.add_node("leader_delegate_tasks", leader_delegate_tasks)
    graph.add_node("execute_tasks", execute_tasks)
    graph.add_node("aggregate_report", aggregate_report)

    graph.add_edge(START, "partition_zones")
    graph.add_edge("partition_zones", "form_squads")
    graph.add_edge("form_squads", "leader_delegate_tasks")
    graph.add_edge("leader_delegate_tasks", "execute_tasks")
    graph.add_edge("execute_tasks", "aggregate_report")
    graph.add_conditional_edges(
        "aggregate_report",
        should_continue,
        {"continue": "leader_delegate_tasks", "end": END},
    )

    return graph.compile()
