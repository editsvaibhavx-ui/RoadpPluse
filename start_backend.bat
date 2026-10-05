@echo off
echo ========================================================
echo Starting RoadPulse AI - Backend Server (FastAPI)
echo ========================================================
cd /d "%~dp0backend"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause
