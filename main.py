from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .db import connect, init_db
import os

ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="HER CITY API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ORIGIN, "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

class ReportCreate(BaseModel):
    category: str = Field(pattern="^(poor_lighting|broken_streetlight|isolated_waiting_area|road_or_path_issue|other)$")
    description: str = Field(min_length=8, max_length=1000)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

class RouteRequest(BaseModel):
    start_lat: float = Field(ge=-90, le=90)
    start_lon: float = Field(ge=-180, le=180)
    end_lat: float = Field(ge=-90, le=90)
    end_lon: float = Field(ge=-180, le=180)

@app.get("/")
def root():
    return {"app": "HER CITY", "docs": "/docs"}

@app.get("/health")
def health():
    try:
        with connect() as conn:
            conn.execute("SELECT 1")
            postgis = conn.execute("SELECT PostGIS_Full_Version() AS v").fetchone()["v"]
        return {"status": "ok", "database": "connected", "postgis": postgis}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Database unavailable: {exc}")

@app.get("/reports")
def reports(category: str = Query(default="all"), limit: int = Query(default=500, ge=1, le=1000)):
    sql = "SELECT id, category, description, latitude, longitude, status, created_at FROM community_reports"
    params = []
    if category != "all":
        sql += " WHERE category = %s"
        params.append(category)
    sql += " ORDER BY created_at DESC LIMIT %s"
    params.append(limit)
    with connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return {"items": [dict(row) for row in rows], "count": len(rows)}

@app.post("/reports", status_code=201)
def create_report(report: ReportCreate):
    with connect() as conn:
        row = conn.execute(
            """INSERT INTO community_reports (category, description, latitude, longitude)
               VALUES (%s, %s, %s, %s)
               RETURNING id, category, description, latitude, longitude, status, created_at""",
            (report.category, report.description.strip(), report.latitude, report.longitude),
        ).fetchone()
    return dict(row)

@app.get("/city-insights")
def city_insights():
    with connect() as conn:
        total = conn.execute("SELECT COUNT(*) AS n FROM community_reports").fetchone()["n"]
        rows = conn.execute(
            "SELECT category, COUNT(*) AS n FROM community_reports GROUP BY category ORDER BY n DESC"
        ).fetchall()
    return {
        "report_count": total,
        "by_category": [dict(row) for row in rows],
        "note": "Community-submitted reports only; not verified city-wide safety statistics.",
    }

@app.post("/routes")
async def routes(route: RouteRequest):
    url = (
        "https://router.project-osrm.org/route/v1/driving/"
        f"{route.start_lon},{route.start_lat};{route.end_lon},{route.end_lat}"
        "?overview=full&geometries=geojson"
    )
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url, headers={"User-Agent": "HER-CITY-development/1.0"})
            response.raise_for_status()
            data = response.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Routing service unavailable: {exc}")
    if data.get("code") != "Ok" or not data.get("routes"):
        raise HTTPException(status_code=404, detail="No walking route found.")
    item = data["routes"][0]
    return {
        "geometry": item["geometry"],
        "distance_m": item["distance"],
        "duration_s": item["duration"],
        "notice": "Walking-route estimate only. This is not a safety rating or guarantee.",
    }

@app.get("/safety-score")
def safety_score(latitude: float = Query(ge=-90, le=90), longitude: float = Query(ge=-180, le=180)):
    with connect() as conn:
        count = conn.execute(
            """SELECT COUNT(*) AS n FROM community_reports
               WHERE ST_DWithin(geom::geography,
               ST_SetSRID(ST_MakePoint(%s, %s),4326)::geography, 500)""",
            (longitude, latitude),
        ).fetchone()["n"]
    return {
        "score": None,
        "status": "insufficient_verified_data",
        "nearby_community_reports": count,
        "explanation": "Not enough verified infrastructure data to calculate a responsible support score. Community reports do not prove an area is safe or unsafe.",
    }
