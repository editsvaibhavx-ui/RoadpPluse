import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
WORKSPACE_DIR = BASE_DIR.parent

# Database configuration (Hosted PostgreSQL / MySQL or local SQLite fallback)
raw_db_url = os.getenv("DATABASE_URL")
if raw_db_url and raw_db_url.strip():
    cleaned_url = raw_db_url.strip()
    if cleaned_url.startswith("postgres://"):
        DATABASE_URL = cleaned_url.replace("postgres://", "postgresql://", 1)
    else:
        DATABASE_URL = cleaned_url
else:
    DB_PATH = WORKSPACE_DIR / "database" / "urbansense.db"
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATABASE_URL = f"sqlite:///{DB_PATH}"

# Network & Server Port handling (for Render / Heroku / Cloud Run / Local)
PORT = int(os.getenv("PORT", 8000))
HOST = os.getenv("HOST", "0.0.0.0")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")

# Security & JWT Auth
SECRET_KEY = os.getenv("SECRET_KEY", "roadpulse-urban-intelligence-super-secret-key-2025")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Directories for uploads and processed images
UPLOADS_DIR = BASE_DIR / "uploads"
PROCESSED_DIR = BASE_DIR / "processed"
MODELS_DIR = BASE_DIR / "models"
SAMPLE_DIR = BASE_DIR / "sample_data"

for directory in [UPLOADS_DIR, PROCESSED_DIR, MODELS_DIR, SAMPLE_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

MODEL_WEIGHTS_PATH = MODELS_DIR / "best.pt"

# Road damage approximate measurement calibration defaults (dash-mounted camera perspective)
# Label: "APPROXIMATE PROTOTYPE ESTIMATE"
DEFAULT_PIXELS_TO_METERS_WIDTH = 0.0028    # meters per pixel at road level
DEFAULT_PIXELS_TO_METERS_LENGTH = 0.0035   # meters per pixel longitudinal

# Spatio-Temporal Deduplication (ST-DBSCAN) parameters
DEDUP_SPATIAL_THRESHOLD_METERS = 18.0     # 18 meters distance
DEDUP_TEMPORAL_THRESHOLD_SECONDS = 45.0   # 45 seconds frame delta

# Demo Pune Bus Route 01 Coordinates (Swargate -> Shivajinagar -> FC Road -> Aundh)
PUNE_ROUTE_01_WAYPOINTS = [
    {"name": "Swargate Terminal", "lat": 18.5018, "lng": 73.8584},
    {"name": "SP College / Tilak Road", "lat": 18.5085, "lng": 73.8512},
    {"name": "Deccan Gymkhana", "lat": 18.5173, "lng": 73.8415},
    {"name": "Fergusson College Road", "lat": 18.5246, "lng": 73.8407},
    {"name": "Shivajinagar Bus Station", "lat": 18.5314, "lng": 73.8532},
    {"name": "Pune University Circle", "lat": 18.5412, "lng": 73.8298},
    {"name": "Aundh Chowk", "lat": 18.5582, "lng": 73.8075},
    {"name": "Baner Phata", "lat": 18.5642, "lng": 73.7918}
]
