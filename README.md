# RoadPulse AI - AI-Powered Mobile Urban Intelligence Platform

## What this project is

**RoadPulse AI** (Problem Statement 124: *"AI-Powered Mobile Urban Intelligence Platform Using Public Transport Fleet"*) is an end-to-end municipal road asset monitoring system. It transforms public transit vehicles (buses and fleet vehicles) equipped with smartphone cameras and dashcams into distributed mobile optical sensors that continuously scan road surfaces.

The platform processes real road footage through a deterministic Computer Vision and validation pipeline:
- **Pre-Ingestion Validation**: Verifies video container integrity, frame rate, duration, and confirms genuine road scenes before running detection.
- **AI Defect Detection**: Frame-by-frame defect segmentation identifying potholes, road cracks, and pavement deterioration with calibrated metric sizing.
- **Spatio-Temporal Deduplication (ST-DBSCAN)**: Clusters multi-frame detections of the same defect into unique single incidents to eliminate duplicate counting.
- **Geospatial Incident Mapping**: Maps verified road hazards along transit corridors with chainage distance from start points.
- **Executive Reporting & Work Orders**: Generates verifiable defect counts, severity metrics, visual frame crops, and PDF/JSON municipal reports.

---

## Folder structure

```text
urban-intelligence-platform/
├── .github/
│   └── workflows/
│       └── ci.yml               # Automated GitHub Actions CI workflow (frontend & backend build)
├── backend/
│   ├── app/
│   │   ├── ai/                  # Real CV detection, video processing & road validation
│   │   ├── models/              # SQLAlchemy database ORM models
│   │   ├── routers/             # FastAPI REST endpoints (sessions, incidents, auth, etc.)
│   │   ├── services/            # Pipeline services and telemetry integration
│   │   ├── utils/               # Security, distance tracking, and helpers
│   │   ├── config.py            # Environment, path, and calibration settings
│   │   ├── database.py          # SQLAlchemy connection & session manager
│   │   └── main.py              # FastAPI application, /health endpoint, and SPA fallback
│   ├── processed/               # Output directory for annotated frame crops (.gitkeep)
│   ├── uploads/                 # Uploaded video storage (.gitkeep)
│   └── requirements.txt         # Pinned production Python dependencies
├── database/                    # Database storage folder (.gitkeep) & reset scripts
├── frontend/
│   ├── public/                  # Static assets and sample transit tracks
│   ├── src/
│   │   ├── components/          # Navigation, maps, steppers, and reusable UI
│   │   ├── pages/               # Dashboard, Camera HUD, Upload, Incidents, GIS Map, etc.
│   │   ├── services/            # Axios API client with dynamic VITE_API_URL resolution
│   │   ├── App.jsx              # Interconnected routing and navigation
│   │   └── index.css            # Executive high-contrast light theme design tokens
│   ├── package.json             # Frontend dependencies (React 19, Vite, Leaflet, Lucide)
│   ├── vercel.json              # Vercel SPA rewrite rules for client-side routing
│   └── vite.config.js           # Vite development server and API proxy configuration
├── .env.example                 # Documented template of all environment variables
├── .gitignore                   # Comprehensive ignore list (node_modules, .db, dist, etc.)
├── package.json                 # Root script runner (dev, build, reset)
├── render.yaml                  # Render Blueprint configuration for one-click deployment
├── vercel.json                  # Root Vercel SPA configuration fallback
└── README.md                    # Project documentation and deployment guide
```

---

## Run locally (3 to 5 commands)

1. **Install backend dependencies:**
   ```bash
   pip install -r backend/requirements.txt
   ```

2. **Install frontend dependencies:**
   ```bash
   cd frontend && npm install && cd ..
   ```

3. **Start the backend server:**
   ```bash
   python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
   ```

4. **Start the frontend development server:**
   ```bash
   cd frontend && npm run dev
   ```

5. **Open your browser:**
   Navigate to [http://localhost:5173](http://localhost:5173) (Vite Interactive App) or [http://localhost:8000](http://localhost:8000) (Unified Production Server). Default municipal administrator login: `admin` / `admin123`.

---

## Deploy in 5 minutes (step by step: 1. Upload to GitHub, 2. Import the repo in Vercel, set Root Directory to the frontend folder and add VITE_API_URL, 3. Create a Render Blueprint from render.yaml, 4. Copy the Render URL into VITE_API_URL and redeploy)

### Step 1: Upload to GitHub
1. Unzip `project-deploy.zip` into a clean folder.
2. Initialize a git repository, commit, and push to your GitHub account:
   ```bash
   git init
   git add .
   git commit -m "feat: initial commit of RoadPulse AI platform"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```

### Step 2: Import the repo in Vercel, set Root Directory to the frontend folder and add VITE_API_URL
1. Log in to [Vercel](https://vercel.com/) and click **Add New Project**.
2. Select your GitHub repository and click **Import**.
3. Under **Root Directory**, click **Edit** and select the `frontend` folder.
4. Under **Environment Variables**, add:
   - **Key:** `VITE_API_URL`
   - **Value:** `http://localhost:8000` *(Temporary value; you will update this with your Render backend URL in Step 4)*.
5. Click **Deploy**. Vercel will install dependencies, build the Vite app, and provide your live frontend URL (e.g. `https://your-app.vercel.app`).

### Step 3: Create a Render Blueprint from render.yaml
1. Log in to [Render](https://render.com/) and click **New +** -> **Blueprint**.
2. Connect your GitHub repository.
3. Render automatically detects `render.yaml` in the root and configures the `roadpulse-backend` Python Web Service:
   - **Build Command:** `pip install -r backend/requirements.txt`
   - **Start Command:** `python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT`
   - **Health Check Path:** `/health`
4. Click **Apply**. Render will deploy the backend API and assign a public URL (e.g. `https://roadpulse-backend.onrender.com`).

### Step 4: Copy the Render URL into VITE_API_URL and redeploy
1. Copy your Render service URL (e.g. `https://roadpulse-backend.onrender.com`).
2. Go back to your [Vercel Project Dashboard](https://vercel.com/) -> **Settings** -> **Environment Variables**.
3. Edit `VITE_API_URL` and paste your Render URL (without a trailing slash, e.g. `https://roadpulse-backend.onrender.com`).
4. Trigger a redeploy in Vercel: go to the **Deployments** tab, click **...** on the latest deployment, and select **Redeploy**.
5. Your platform is now fully connected in production! Open the Vercel URL to access your live application.

---

## Troubleshooting

- **CORS Errors in the Browser Console:**
  - Verify that the backend has `CORS_ORIGINS` set to `*` or includes your exact Vercel frontend domain (e.g. `https://your-app.vercel.app`).
  - Make sure `VITE_API_URL` has no trailing slash (e.g. `https://roadpulse-backend.onrender.com`).

- **404 Not Found on Page Refresh (/camera, /upload, /incidents):**
  - Both `frontend/vercel.json` and root `vercel.json` include SPA rewrite rules (`/(.*) -> /index.html`).
  - If deploying to a different static host (like Netlify), configure client-side redirect rules pointing all routes to `/index.html`.

- **Database Connectivity / Fresh Database State:**
  - By default, the application runs on SQLite (`sqlite:///database/urbansense.db`) with automatic table creation and credential bootstrapping on startup.
  - To connect a hosted database (such as Supabase, Neon, or Render PostgreSQL), set the `DATABASE_URL` environment variable in your Render dashboard (e.g. `postgresql://user:password@host:5432/dbname`). Any `postgres://` prefix is automatically normalized to `postgresql://`.

- **OpenCV Errors in Headless Linux Containers:**
  - The project uses `opencv-python-headless` in `backend/requirements.txt`. This avoids missing X11/GL system library dependencies on headless cloud servers like Render, AWS, and Heroku.

- **Initial Admin Login Credentials:**
  - Username: `admin` | Password: `admin123` (Administrator)
  - Username: `authority` | Password: `authority123` (Municipal Road Maintenance Authority)
