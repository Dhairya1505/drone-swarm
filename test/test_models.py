from drone_swarm.models import BoundingArea, Coordinate, DroneCategory
from drone_swarm.simulator import generate_fleet, partition_area, SQUAD_COMPOSITION


def test_partition_area_produces_requested_zone_count():
    area = BoundingArea(Coordinate(0, 0), Coordinate(1, 1))
    zones = partition_area(area, 5)
    assert len(zones) == 5


def test_partition_area_zones_are_within_bounds():
    area = BoundingArea(Coordinate(0, 0), Coordinate(1, 1))
    zones = partition_area(area, 4)
    for z in zones:
        assert area.sw.lat <= z.area.sw.lat < z.area.ne.lat <= area.ne.lat
        assert area.sw.lon <= z.area.sw.lon < z.area.ne.lon <= area.ne.lon


def test_generate_fleet_has_one_of_each_category_per_squad_plus_reserves():
    home = Coordinate(0, 0)
    drones = generate_fleet(num_squads=2, reserves_per_squad=1, home=home)

    # 2 squads * 4 categories + 2 squads * 1 reserve each = 10
    assert len(drones) == 10

    counts = {c: 0 for c in DroneCategory}
    for d in drones.values():
        counts[d.category] += 1

    for category in SQUAD_COMPOSITION:
        assert counts[category] >= 2  # at least one per squad, before reserves
