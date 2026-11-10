import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Literal, Optional
import re
import secrets
from auth import get_current_user, router as auth_router
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="BusMitra API")

app.include_router(auth_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ======================================================================
# Database (SQLite). The file busmitra.db is created next to this file.
# Routes and stops are loaded from CSV files with:  py import_csv.py
# ======================================================================

DB_PATH = Path(__file__).parent / "busmitra.db"

DISRUPTION_THRESHOLD = 5          # "didn't come" reports needed
DISRUPTION_WINDOW_MINUTES = 30    # ...within this many minutes


@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def create_tables(conn):
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS places (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            name     TEXT NOT NULL,
            district TEXT NOT NULL DEFAULT '',
            UNIQUE (name, district)
        );

        CREATE TABLE IF NOT EXISTS routes (
            id           INTEGER PRIMARY KEY,
            operator     TEXT NOT NULL DEFAULT 'unknown',
            bus_number   TEXT NOT NULL DEFAULT '',
            origin       TEXT NOT NULL,
            destination  TEXT NOT NULL,
            departure    TEXT NOT NULL,
            status       TEXT NOT NULL DEFAULT 'unknown',
            status_note  TEXT NOT NULL DEFAULT '',
            current_stop INTEGER
        );

        CREATE TABLE IF NOT EXISTS stops (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            route_id INTEGER NOT NULL REFERENCES routes(id),
            position INTEGER NOT NULL,
            place_id INTEGER NOT NULL REFERENCES places(id),
            time     TEXT NOT NULL,
            platform TEXT,
            lat      REAL NOT NULL,
            lng      REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reports (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            route_id INTEGER NOT NULL REFERENCES routes(id),
            type     TEXT NOT NULL,
            created  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS transfers (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            from_place_id INTEGER NOT NULL REFERENCES places(id),
            to_place_id   INTEGER NOT NULL REFERENCES places(id),
            mode          TEXT NOT NULL DEFAULT 'walk',
            minutes       INTEGER NOT NULL DEFAULT 10,
            note          TEXT NOT NULL DEFAULT ''
        );
        
        CREATE TABLE IF NOT EXISTS tickets (
            id             TEXT PRIMARY KEY,
            user_id        INTEGER NOT NULL,
            route_id       INTEGER NOT NULL,
            bus_number     TEXT NOT NULL,
            operator       TEXT NOT NULL,
            from_stop      TEXT NOT NULL,
            to_stop        TEXT NOT NULL,
            departure      TEXT NOT NULL,
            passengers     INTEGER NOT NULL,
            passenger_name TEXT NOT NULL,
            phone          TEXT NOT NULL,
            fare           INTEGER NOT NULL,
            payment_method TEXT NOT NULL,
            txn_id         TEXT NOT NULL,
            status         TEXT NOT NULL DEFAULT 'confirmed',
            booked_at      TEXT NOT NULL,
            cancelled_at   TEXT
        );
        """
    )


def migrate(conn):
    """Adds user_id to reports (for databases created before login existed)."""
    columns = [r["name"] for r in conn.execute("PRAGMA table_info(reports)")]
    if "user_id" not in columns:
        conn.execute("ALTER TABLE reports ADD COLUMN user_id INTEGER")

    # One report per person, per bus, per day. Older reports with no
    # user are left out of this rule.
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS one_report_per_user_per_day
        ON reports (route_id, user_id, substr(created, 1, 10))
        WHERE user_id IS NOT NULL
        """
    )


with db() as _conn:
    create_tables(_conn)
    migrate(_conn)


# ---------- login helper ----------


def optional_user(authorization: Optional[str] = Header(default=None)):
    """The logged-in user, or None when nobody is logged in."""
    try:
        return get_current_user(authorization)
    except HTTPException:
        return None


# ---------- helpers that build the JSON the frontend expects ----------


def row_to_route(conn, row) -> dict:
    stops = []
    stop_rows = conn.execute(
        """
        SELECT p.name, p.district, s.time, s.platform, s.lat, s.lng
        FROM stops s JOIN places p ON p.id = s.place_id
        WHERE s.route_id = ?
        ORDER BY s.position
        """,
        (row["id"],),
    )
    for s in stop_rows:
        stop = {
            "name": s["name"],
            "district": s["district"],
            "time": s["time"],
            "lat": s["lat"],
            "lng": s["lng"],
        }
        if s["platform"]:
            stop["platform"] = s["platform"]
        stops.append(stop)

    route = dict(row)
    route["stops"] = stops
    return route


def count_recent_not_came(conn, route_id: int) -> int:
    cutoff = (
        datetime.now() - timedelta(minutes=DISRUPTION_WINDOW_MINUTES)
    ).isoformat(timespec="seconds")
    return conn.execute(
        "SELECT COUNT(*) FROM reports "
        "WHERE route_id = ? AND type = 'not_came' AND created >= ?",
        (route_id, cutoff),
    ).fetchone()[0]


def with_report_info(conn, route: dict) -> dict:
    recent = count_recent_not_came(conn, route["id"])
    return {
        **route,
        "not_came_recent": recent,
        "reports_disrupted": recent >= DISRUPTION_THRESHOLD,
    }


def build_report_summary(conn, route_id: int, user_id: Optional[int] = None) -> dict:
    today = datetime.now().date().isoformat()
    rows = conn.execute(
        "SELECT id, type, created FROM reports "
        "WHERE route_id = ? AND created LIKE ? "
        "ORDER BY created DESC, id DESC",
        (route_id, today + "%"),
    ).fetchall()

    counts = {"running": 0, "delayed": 0, "not_came": 0}
    for r in rows:
        counts[r["type"]] += 1

    # what this person already reported today (None if nothing)
    my_report = None
    if user_id is not None:
        mine = conn.execute(
            "SELECT type FROM reports "
            "WHERE route_id = ? AND user_id = ? AND created LIKE ? "
            "ORDER BY id DESC LIMIT 1",
            (route_id, user_id, today + "%"),
        ).fetchone()
        if mine:
            my_report = mine["type"]

    recent = count_recent_not_came(conn, route_id)
    return {
        "reports": [
            {"id": r["id"], "type": r["type"], "time": r["created"][11:16]}
            for r in rows
        ],
        "counts": counts,
        "not_came_recent": recent,
        "disrupted": recent >= DISRUPTION_THRESHOLD,
        "my_report": my_report,
    }


class ReportIn(BaseModel):
    type: Literal["running", "delayed", "not_came"]


# ---------- API endpoints ----------


@app.get("/")
def home():
    return {"message": "Welcome to BusMitra!"}


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "project": "BusMitra",
        "message": "Backend is running",
    }


@app.get("/api/places")
def get_places():
    with db() as conn:
        rows = conn.execute(
            "SELECT name, district FROM places ORDER BY name"
        ).fetchall()
        return [{"name": r["name"], "district": r["district"]} for r in rows]


@app.get("/api/transfers")
def get_transfers():
    with db() as conn:
        rows = conn.execute(
            """
            SELECT pf.name AS from_name, pf.district AS from_district,
                   pt.name AS to_name,   pt.district AS to_district,
                   t.mode, t.minutes, t.note
            FROM transfers t
            JOIN places pf ON pf.id = t.from_place_id
            JOIN places pt ON pt.id = t.to_place_id
            """
        ).fetchall()
        return [dict(r) for r in rows]


@app.get("/api/routes")
def get_routes():
    with db() as conn:
        rows = conn.execute("SELECT * FROM routes ORDER BY id").fetchall()
        return [with_report_info(conn, row_to_route(conn, row)) for row in rows]


@app.get("/api/routes/{route_id}")
def get_route(route_id: int):
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM routes WHERE id = ?", (route_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Route not found")
        return with_report_info(conn, row_to_route(conn, row))


@app.get("/api/routes/{route_id}/reports")
def get_reports(route_id: int, user: Optional[dict] = Depends(optional_user)):
    with db() as conn:
        return build_report_summary(conn, route_id, user["id"] if user else None)


@app.post("/api/routes/{route_id}/reports")
def add_report(
    route_id: int,
    report: ReportIn,
    user: dict = Depends(get_current_user),  # login required
):
    with db() as conn:
        exists = conn.execute(
            "SELECT 1 FROM routes WHERE id = ?", (route_id,)
        ).fetchone()
        if exists is None:
            raise HTTPException(status_code=404, detail="Route not found")

        today = datetime.now().date().isoformat()
        already = conn.execute(
            "SELECT 1 FROM reports "
            "WHERE route_id = ? AND user_id = ? AND created LIKE ?",
            (route_id, user["id"], today + "%"),
        ).fetchone()
        if already:
            raise HTTPException(
                status_code=409,
                detail="You have already reported this bus today.",
            )

        try:
            conn.execute(
                "INSERT INTO reports (route_id, type, created, user_id) "
                "VALUES (?, ?, ?, ?)",
                (
                    route_id,
                    report.type,
                    datetime.now().isoformat(timespec="seconds"),
                    user["id"],
                ),
            )
        except sqlite3.IntegrityError:
            # two requests at the same moment: the database rule caught it
            raise HTTPException(
                status_code=409,
                detail="You have already reported this bus today.",
            )

        return build_report_summary(conn, route_id, user["id"])
    # ---------- Tickets (demo booking) ----------

FARE_PER_STOP = 10  # rupees per stop, per person. Keep the same as in shared.ts
PAYMENT_METHODS = {"GPay", "PhonePe", "Paytm", "UPI QR"}


class TicketIn(BaseModel):
    route_id: int
    from_index: int
    to_index: int
    passengers: int
    passenger_name: str
    phone: str
    payment_method: str


def public_ticket(row) -> dict:
    ticket = dict(row)
    ticket.pop("user_id", None)
    return ticket


def new_ticket_id(conn) -> str:
    while True:
        candidate = "DEMO-" + secrets.token_hex(3).upper()
        taken = conn.execute(
            "SELECT 1 FROM tickets WHERE id = ?", (candidate,)
        ).fetchone()
        if taken is None:
            return candidate


@app.post("/api/tickets")
def create_ticket(data: TicketIn, user: dict = Depends(get_current_user)):
    name = data.passenger_name.strip()
    phone = data.phone.strip()

    if not name or len(name) > 60:
        raise HTTPException(
            status_code=400,
            detail="Please enter the passenger name (up to 60 characters).",
        )
    if not re.fullmatch(r"\d{10}", phone):
        raise HTTPException(status_code=400, detail="Please enter a 10-digit phone number.")
    if not 1 <= data.passengers <= 6:
        raise HTTPException(status_code=400, detail="Passengers must be between 1 and 6.")
    if data.payment_method not in PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Unknown payment method.")

    with db() as conn:
        route = conn.execute(
            "SELECT * FROM routes WHERE id = ?", (data.route_id,)
        ).fetchone()
        if route is None:
            raise HTTPException(status_code=404, detail="Route not found")
        if route["status"] == "cancelled":
            raise HTTPException(
                status_code=409, detail="This bus is cancelled, so it can't be booked."
            )

        stops = conn.execute(
            """
            SELECT p.name, s.time
            FROM stops s JOIN places p ON p.id = s.place_id
            WHERE s.route_id = ? ORDER BY s.position
            """,
            (route["id"],),
        ).fetchall()

        if not (0 <= data.from_index < data.to_index < len(stops)):
            raise HTTPException(
                status_code=400,
                detail="Please choose a valid boarding and destination stop.",
            )

        fare = (data.to_index - data.from_index) * FARE_PER_STOP * data.passengers
        ticket_id = new_ticket_id(conn)
        txn_id = "TXN" + secrets.token_hex(4).upper()

        conn.execute(
            """
            INSERT INTO tickets (
                id, user_id, route_id, bus_number, operator, from_stop, to_stop,
                departure, passengers, passenger_name, phone, fare,
                payment_method, txn_id, status, booked_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)
            """,
            (
                ticket_id,
                user["id"],
                route["id"],
                route["bus_number"],
                route["operator"],
                stops[data.from_index]["name"],
                stops[data.to_index]["name"],
                stops[data.from_index]["time"],
                data.passengers,
                name,
                phone,
                fare,
                data.payment_method,
                txn_id,
                datetime.now().isoformat(timespec="seconds"),
            ),
        )
        row = conn.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
        return public_ticket(row)


@app.get("/api/tickets")
def list_tickets(user: dict = Depends(get_current_user)):
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM tickets WHERE user_id = ? ORDER BY booked_at DESC, rowid DESC",
            (user["id"],),
        ).fetchall()
        return [public_ticket(r) for r in rows]


@app.post("/api/tickets/{ticket_id}/cancel")
def cancel_ticket(ticket_id: str, user: dict = Depends(get_current_user)):
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM tickets WHERE id = ? AND user_id = ?",
            (ticket_id, user["id"]),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Ticket not found.")
        if row["status"] == "cancelled":
            raise HTTPException(status_code=409, detail="This ticket is already cancelled.")

        conn.execute(
            "UPDATE tickets SET status = 'cancelled', cancelled_at = ? WHERE id = ?",
            (datetime.now().isoformat(timespec="seconds"), ticket_id),
        )
        row = conn.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
        return public_ticket(row)