"""Load routes, stops and transfers from CSV files into the BusMitra database.

Run from the backend folder, with the virtual environment active:
    py import_csv.py
Or with other files:
    py import_csv.py routes.csv stops.csv transfers.csv

Nothing in the database changes unless every row in the files is valid.
"""

import csv
import re
import sys
from pathlib import Path

from main import db

DATA_DIR = Path(__file__).parent / "data"

OPERATORS = {"government", "private"}
STATUSES = {"running", "delayed", "cancelled", "unknown"}
TRANSFER_MODES = {"walk", "city_bus", "auto", "e_rickshaw"}

# Rough bounding box of India. Catches swapped or mistyped coordinates.
LAT_RANGE = (6.0, 38.0)
LNG_RANGE = (68.0, 98.0)

ROUTE_COLUMNS = [
    "id", "operator", "bus_number", "status", "status_note", "current_stop_number",
]
STOP_COLUMNS = [
    "route_id", "stop_number", "place", "district", "time", "platform", "lat", "lng",
]
TRANSFER_COLUMNS = [
    "from_place", "from_district", "to_place", "to_district", "mode", "minutes", "note",
]


def read_csv(path: Path, required: list):
    if not path.exists():
        sys.exit(f"File not found: {path}")

    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            sys.exit(f"{path.name} is empty.")

        reader.fieldnames = [name.strip().lower() for name in reader.fieldnames]
        missing = [c for c in required if c not in reader.fieldnames]
        if missing:
            sys.exit(f"{path.name} is missing column(s): {', '.join(missing)}")

        rows = []
        for row in reader:
            clean = {k: (v or "").strip() for k, v in row.items() if k}
            if not any(clean.values()):
                continue  # skip blank lines
            rows.append((reader.line_num, clean))
        return rows


def to_int(value: str):
    try:
        return int(value)
    except ValueError:
        return None


def normalize_time(value: str):
    """Accepts 8:10, 08:10 or 08:10:00 and returns 08:10 (or None)."""
    match = re.fullmatch(r"(\d{1,2}):(\d{2})(?::\d{2})?", value)
    if not match:
        return None
    hour, minute = int(match.group(1)), int(match.group(2))
    if hour > 23 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"


def load(routes_path: Path, stops_path: Path, transfers_path: Path):
    errors = []
    warnings = []

    # ---------------- routes ----------------
    routes = {}
    for line, row in read_csv(routes_path, ROUTE_COLUMNS):
        where = f"{routes_path.name} row {line}"

        route_id = to_int(row["id"])
        if route_id is None or route_id < 1:
            errors.append(f"{where}: id must be a whole number like 1, 2, 3.")
            continue
        if route_id in routes:
            errors.append(f"{where}: id {route_id} is used twice.")
            continue

        operator = row["operator"].lower()
        if operator not in OPERATORS:
            errors.append(
                f"{where}: operator '{row['operator']}' must be government or private."
            )

        status = row["status"].lower()
        if status not in STATUSES:
            errors.append(
                f"{where}: status '{row['status']}' must be one of: "
                f"{', '.join(sorted(STATUSES))}."
            )

        current = None
        if row["current_stop_number"]:
            current = to_int(row["current_stop_number"])
            if current is None or current < 1:
                errors.append(
                    f"{where}: current_stop_number must be 1, 2, 3... or empty."
                )
                current = None

        routes[route_id] = {
            "operator": operator,
            "bus_number": row["bus_number"],
            "status": status,
            "status_note": row["status_note"],
            "current_stop_number": current,
            "stops": [],
        }

    if not routes and not errors:
        sys.exit(f"{routes_path.name} has no routes.")

    # ---------------- stops ----------------
    seen = set()
    for line, row in read_csv(stops_path, STOP_COLUMNS):
        where = f"{stops_path.name} row {line}"

        route_id = to_int(row["route_id"])
        if route_id not in routes:
            errors.append(
                f"{where}: route_id '{row['route_id']}' is not in {routes_path.name}."
            )
            continue

        number = to_int(row["stop_number"])
        if number is None or number < 1:
            errors.append(f"{where}: stop_number must be 1, 2, 3...")
            continue
        if (route_id, number) in seen:
            errors.append(f"{where}: route {route_id} already has a stop {number}.")
            continue
        seen.add((route_id, number))

        if not row["place"]:
            errors.append(f"{where}: place name is empty.")
            continue

        time = normalize_time(row["time"])
        if time is None:
            errors.append(
                f"{where}: time '{row['time']}' must look like 08:10 (24-hour)."
            )
            continue

        try:
            lat = float(row["lat"])
            lng = float(row["lng"])
        except ValueError:
            errors.append(f"{where}: lat and lng must be numbers like 30.0749.")
            continue

        if not (LAT_RANGE[0] <= lat <= LAT_RANGE[1]) or not (
            LNG_RANGE[0] <= lng <= LNG_RANGE[1]
        ):
            errors.append(
                f"{where}: ({lat}, {lng}) is outside India. "
                "Are latitude and longitude swapped?"
            )
            continue

        routes[route_id]["stops"].append(
            {
                "number": number,
                "place": row["place"],
                "district": row["district"],
                "time": time,
                "platform": row["platform"] or None,
                "lat": lat,
                "lng": lng,
            }
        )

    # ---------------- checks per route ----------------
    for route_id, route in routes.items():
        stops = sorted(route["stops"], key=lambda s: s["number"])
        route["stops"] = stops

        if len(stops) < 2:
            errors.append(f"Route {route_id} needs at least 2 stops in {stops_path.name}.")
            continue

        numbers = [s["number"] for s in stops]
        if numbers != list(range(1, len(stops) + 1)):
            errors.append(
                f"Route {route_id}: stop numbers must be 1, 2, 3... with no gaps "
                f"(found {numbers})."
            )

        current = route["current_stop_number"]
        if current and current > len(stops):
            errors.append(
                f"Route {route_id}: current_stop_number {current} is more than "
                f"its {len(stops)} stops."
            )

        times = [s["time"] for s in stops]
        if times != sorted(times):
            warnings.append(
                f"Route {route_id}: stop times are not in increasing order. "
                "Please check them (this is fine for overnight buses)."
            )

    # ---------------- transfers (optional file) ----------------
    # Every place in a transfer must also be a stop somewhere in stops.csv.
    known = {}
    for route in routes.values():
        for s in route["stops"]:
            known[(s["place"].lower(), s["district"].lower())] = (
                s["place"],
                s["district"],
            )

    transfers = []
    seen_pairs = set()

    if transfers_path.exists():
        for line, row in read_csv(transfers_path, TRANSFER_COLUMNS):
            where = f"{transfers_path.name} row {line}"

            a = known.get((row["from_place"].lower(), row["from_district"].lower()))
            b = known.get((row["to_place"].lower(), row["to_district"].lower()))
            if a is None:
                errors.append(
                    f"{where}: place '{row['from_place']}' is not a stop in "
                    f"{stops_path.name}. Check the spelling and district."
                )
            if b is None:
                errors.append(
                    f"{where}: place '{row['to_place']}' is not a stop in "
                    f"{stops_path.name}. Check the spelling and district."
                )
            if a is None or b is None:
                continue
            if a == b:
                errors.append(f"{where}: from and to are the same place.")
                continue

            mode = row["mode"].lower()
            if mode not in TRANSFER_MODES:
                errors.append(
                    f"{where}: mode '{row['mode']}' must be one of: "
                    f"{', '.join(sorted(TRANSFER_MODES))}."
                )
                continue

            minutes = to_int(row["minutes"])
            if minutes is None or not (1 <= minutes <= 240):
                errors.append(f"{where}: minutes must be a whole number from 1 to 240.")
                continue

            if (a, b) in seen_pairs:
                warnings.append(
                    f"{where}: this pair is already listed (or its reverse). Row ignored."
                )
                continue

            # a link works in both directions
            for pair in ((a, b), (b, a)):
                seen_pairs.add(pair)
                transfers.append((pair[0], pair[1], mode, minutes, row["note"]))
    else:
        print(f"Note: {transfers_path.name} not found, so no transfers are loaded.")

    if errors:
        print(f"\nFound {len(errors)} problem(s). Nothing was imported:\n")
        for message in errors:
            print("  -", message)
        sys.exit(1)

    # ---------------- write to the database ----------------
    with db() as conn:
        ids = list(routes)
        marks = ",".join("?" for _ in ids)

        conn.execute("DELETE FROM stops")
        conn.execute("DELETE FROM transfers")
        conn.execute(f"DELETE FROM reports WHERE route_id NOT IN ({marks})", ids)
        conn.execute(f"DELETE FROM routes WHERE id NOT IN ({marks})", ids)
        conn.execute("DELETE FROM places")

        place_ids = {}
        stop_count = 0

        for route_id, route in routes.items():
            stops = route["stops"]
            current = route["current_stop_number"]

            conn.execute(
                """
                INSERT INTO routes (id, operator, bus_number, origin, destination,
                                    departure, status, status_note, current_stop)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    operator     = excluded.operator,
                    bus_number   = excluded.bus_number,
                    origin       = excluded.origin,
                    destination  = excluded.destination,
                    departure    = excluded.departure,
                    status       = excluded.status,
                    status_note  = excluded.status_note,
                    current_stop = excluded.current_stop
                """,
                (
                    route_id,
                    route["operator"],
                    route["bus_number"],
                    stops[0]["place"],
                    stops[-1]["place"],
                    stops[0]["time"],
                    route["status"],
                    route["status_note"],
                    current - 1 if current else None,
                ),
            )

            for position, s in enumerate(stops):
                key = (s["place"], s["district"])
                if key not in place_ids:
                    cursor = conn.execute(
                        "INSERT INTO places (name, district) VALUES (?, ?)", key
                    )
                    place_ids[key] = cursor.lastrowid

                conn.execute(
                    """
                    INSERT INTO stops (route_id, position, place_id, time, platform, lat, lng)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        route_id,
                        position,
                        place_ids[key],
                        s["time"],
                        s["platform"],
                        s["lat"],
                        s["lng"],
                    ),
                )
                stop_count += 1

        for from_key, to_key, mode, minutes, note in transfers:
            conn.execute(
                """
                INSERT INTO transfers (from_place_id, to_place_id, mode, minutes, note)
                VALUES (?, ?, ?, ?, ?)
                """,
                (place_ids[from_key], place_ids[to_key], mode, minutes, note),
            )

    for message in warnings:
        print("Warning:", message)
    print(
        f"Imported {len(routes)} routes, {stop_count} stops, "
        f"{len(place_ids)} places, {len(transfers) // 2} transfer links."
    )


if __name__ == "__main__":
    routes_file = Path(sys.argv[1]) if len(sys.argv) > 1 else DATA_DIR / "routes.csv"
    stops_file = Path(sys.argv[2]) if len(sys.argv) > 2 else DATA_DIR / "stops.csv"
    transfers_file = Path(sys.argv[3]) if len(sys.argv) > 3 else DATA_DIR / "transfers.csv"
    load(routes_file, stops_file, transfers_file)