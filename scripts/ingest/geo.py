"""Small WGS84 helpers (spherical approximations, metres)."""
import math

EARTH_DIAMETER_M = 12742000.0


def haversine(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = p2 - p1
    dlon = math.radians(lon2 - lon1)
    x = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return EARTH_DIAMETER_M * math.asin(min(1.0, math.sqrt(x)))


def line_length(coords):
    """coords: [[lon, lat], ...]"""
    return sum(haversine(a[1], a[0], b[1], b[0]) for a, b in zip(coords, coords[1:]))


def bearing(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlon = math.radians(lon2 - lon1)
    y = math.sin(dlon) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dlon)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def angle_between(b1, b2):
    d = abs(b1 - b2) % 360.0
    return 360.0 - d if d > 180.0 else d


def buffer_bbox(lat, lon, metres):
    """Bounding box (south, west, north, east) of a circle of `metres` around a point."""
    dlat = metres / 111320.0
    dlon = metres / (111320.0 * max(0.01, math.cos(math.radians(lat))))
    return (lat - dlat, lon - dlon, lat + dlat, lon + dlon)


def project_point_on_segment(lat, lon, a, b):
    """Closest point on segment a-b ([lon,lat]) to (lat,lon).
    Returns (t in [0,1], distance_m) using a local equirectangular projection."""
    kx = math.cos(math.radians(lat)) * 111320.0
    ky = 110540.0
    ax, ay = (a[0] - lon) * kx, (a[1] - lat) * ky
    bx, by = (b[0] - lon) * kx, (b[1] - lat) * ky
    dx, dy = bx - ax, by - ay
    seg2 = dx * dx + dy * dy
    t = 0.0 if seg2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / seg2))
    px, py = ax + t * dx, ay + t * dy
    return t, math.hypot(px, py)


class Scope:
    """Union of circles (default 20 km) around matched scope stations."""

    def __init__(self, centres, radius_m):
        self.radius = radius_m
        self.centres = list(centres)  # [(lat, lon)]
        self._dlat = radius_m / 111320.0

    def __bool__(self):
        return bool(self.centres)

    def contains(self, lat, lon):
        dlat = self._dlat
        for clat, clon in self.centres:
            if abs(lat - clat) > dlat:
                continue
            if haversine(lat, lon, clat, clon) <= self.radius:
                return True
        return False

    def bbox(self):
        boxes = [buffer_bbox(lat, lon, self.radius) for lat, lon in self.centres]
        return (min(b[0] for b in boxes), min(b[1] for b in boxes),
                max(b[2] for b in boxes), max(b[3] for b in boxes))

    def tiles(self, size_deg):
        """Grid tiles (south, west, north, east) that intersect any buffer circle's bbox."""
        out = set()
        for lat, lon in self.centres:
            s, w, n, e = buffer_bbox(lat, lon, self.radius)
            for i in range(math.floor(s / size_deg), math.floor(n / size_deg) + 1):
                for j in range(math.floor(w / size_deg), math.floor(e / size_deg) + 1):
                    out.add((i, j))
        return [(round(i * size_deg, 6), round(j * size_deg, 6),
                 round((i + 1) * size_deg, 6), round((j + 1) * size_deg, 6)) for i, j in sorted(out)]
