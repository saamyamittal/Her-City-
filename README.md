# HER CITY — Full-stack development project

## Included
- React + Vite frontend
- MapLibre interactive map displayed inside the app
- OpenStreetMap base geography and attribution
- FastAPI backend
- PostgreSQL + PostGIS database
- Community report submission and persistent map markers
- Location search (Nominatim)
- Route calculation (OSRM public demo; driving profile)
- API health indicator and transparent data messaging

## Install first
1. Node.js LTS: https://nodejs.org/
2. Python 3.11+: https://www.python.org/downloads/
3. Docker Desktop: https://www.docker.com/products/docker-desktop/
4. VS Code: https://code.visualstudio.com/

## Start database
Open this folder in VS Code, select Terminal → New Terminal:

```powershell
docker compose up -d db
```

## Start backend
Open a second terminal:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

If PowerShell blocks activation, use a Command Prompt terminal and run:
`.venv\Scripts\activate.bat`

Backend: http://127.0.0.1:8000  
API docs: http://127.0.0.1:8000/docs

## Start frontend
Open a third terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the localhost URL printed by Vite (normally http://localhost:5173).

## Use it
1. Wait for the map to load.
2. Search for a city or place.
3. Click the map to choose a report location.
4. Select Add a community report, choose a category and submit.
5. The report is saved in PostgreSQL and appears as a map marker.
6. Use Plan a journey to calculate a route.

## Database
PostgreSQL + PostGIS is configured in docker-compose.yml. The database is created automatically by the backend. Local development connection:
`postgresql://hercity:hercity_dev_password@localhost:5433/hercity`

Change the development password before deployment. Never commit production secrets.

## Provider notes
MapLibre renders the map in the app. OpenStreetMap supplies geographic data; the community OSM tile server is used for local development. Nominatim provides search and OSRM provides demo routing using its driving profile in this starter (not walking directions). These public services have usage policies, rate limits and availability constraints. Use a suitable paid provider or self-host services for production. Do not send high-volume requests to public demo endpoints.

The HER CITY database stores its own community reports. The base map service is not our application database.

## Data integrity and safety
The database starts empty. No streetlights, hospitals, police stations, pedestrian activity or safe areas are fabricated. Community reports are unverified until reviewed. A route is not guaranteed safe. This development build is not an emergency-response service.

Before public launch, add authentication, moderation, rate limiting, verified dataset imports, privacy review, backups, monitoring and production map/search/routing services.
