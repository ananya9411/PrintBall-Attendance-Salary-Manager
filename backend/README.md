# PrintBall Backend Setup

## Entry point
```text
backend/app/main.py
```

Run:
```powershell
uvicorn app.main:app --reload --port 8000
```

## Python
Use Python 3.12.x. The verified local setup uses Python 3.12.10.

## Windows build tools
Install Visual Studio Build Tools 2022 with **Desktop development with C++**.

Verify:
```powershell
where.exe cl
```

## Virtual environment
```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python --version
```

## Dependencies
```powershell
python -m pip install -r requirements.txt
python -m pip install insightface==0.7.3
python -m pip install onnxruntime==1.20.1
python -m pip install tzdata
```

Supabase versions used:
```text
supabase==2.20.0
supabase-auth==2.20.0
```

If the Supabase import reports `supabase_auth.http_clients` missing:
```powershell
python -m pip install "supabase-auth==2.20.0"
```

## Backend `.env`
```env
SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
CORS_ORIGINS="http://localhost:8080"
```

## Face models
Current attendance pipeline:
```text
SCRFD + ArcFace
```

InsightFace may download its model on first startup. The current attendance service uses the `buffalo_sc` model and logs SCRFD/ArcFace readiness.

## Face verification
```text
Image
→ SCRFD detection
→ alignment
→ ArcFace embedding
→ reference comparison
→ distance threshold
→ verified/rejected
```

## Timezone
The backend uses:
```python
ZoneInfo("Asia/Kolkata")
```

Install `tzdata` on Windows. Missing timezone data previously caused attendance HTTP 500 errors that appeared in the browser as CORS/Failed-to-fetch errors.

## Run
Terminal 1:
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

Terminal 2:
```powershell
cd ..
npm run dev
```

## Common errors

`uvicorn not recognized`:
```powershell
python -m uvicorn app.main:app --reload --port 8000
```

`No module named fastapi`:
```powershell
python -m pip install -r requirements.txt
```

`No module named onnxruntime`:
```powershell
python -m pip install onnxruntime==1.20.1
```

`Microsoft Visual C++ 14.0 required`:
install Build Tools 2022 + Desktop development with C++.

`No module named supabase_auth.http_clients`:
```powershell
python -m pip install "supabase-auth==2.20.0"
```

`ZoneInfoNotFoundError: Asia/Kolkata`:
```powershell
python -m pip install tzdata
```

## Security
Never expose `SUPABASE_SERVICE_ROLE_KEY` to the frontend or commit backend `.env`.

Use HTTPS and production CORS configuration when deploying.
