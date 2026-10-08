from generation.graph import build_graph
from drone_swarm.models import BoundingArea, Coordinate, MissionState, new_id
from drone_swarm.simulator import SimulatedDroneController, generate_fleet


def make_initial_state(num_squads=2, max_ticks=5, seed=0) -> MissionState:
    area = BoundingArea(Coordinate(12.93, 79.14), Coordinate(12.95, 79.16))
    home = area.center()
    drones = generate_fleet(num_squads, reserves_per_squad=1, home=home)
    state: MissionState = {
        "mission_id": new_id("mission"),
        "disaster_type": "flood",
        "area": area,
        "tick": 0,
        "max_ticks": max_ticks,
        "num_squads": num_squads,
        "drones": drones,
        "reserve_pool": list(drones.keys()),
        "zones": {},
        "squads": {},
        "tasks": {},
        "event_log": [],
    }
    return state


def test_mission_terminates_within_tick_budget():
    state = make_initial_state(max_ticks=5, seed=1)
    app = build_graph(SimulatedDroneController(seed=1))
    final = app.invoke(state, config={"recursion_limit": 100})
    assert final["tick"] <= 5


def test_mission_forms_one_squad_per_zone():
    state = make_initial_state(num_squads=3, seed=2)
    app = build_graph(SimulatedDroneController(seed=2))
    final = app.invoke(state, config={"recursion_limit": 100})
    assert len(final["squads"]) == 3
    assert len(final["zones"]) == 3


def test_each_squad_has_exactly_one_leader():
    state = make_initial_state(num_squads=2, seed=3)
    app = build_graph(SimulatedDroneController(seed=3))
    final = app.invoke(state, config={"recursion_limit": 100})

    for squad in final["squads"].values():
        leaders = [
            d_id for d_id in squad.member_ids
            if final["drones"][d_id].is_leader
        ]
        assert leaders == [squad.leader_id]
