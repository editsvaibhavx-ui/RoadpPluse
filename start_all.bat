@echo off
echo ========================================================
echo Starting RoadPulse AI Platform (Backend + Frontend)
echo ========================================================
echo.
start "RoadPulse Backend (FastAPI)" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
start "RoadPulse Frontend (Vite)" cmd /k "cd /d %~dp0frontend && npm run dev:host"
echo.
echo Unified Dashboard & API running on: http://localhost:8000
echo Frontend Dev Server running on: http://localhost:5173
echo.
