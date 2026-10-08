@echo off
echo Starting Drone Swarm API server...
call venv\Scripts\activate.bat
pip install -r requirements.txt -q
python -m uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload
