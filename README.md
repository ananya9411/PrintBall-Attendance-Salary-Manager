# PrintBall Attendance & Payroll

PrintBall is a React/Vite + FastAPI + Supabase attendance and payroll system with server-side face verification.

## Main features
- Employee management, joining dates, IDs and profile photos
- Check-in/check-out
- Left/right liveness challenge
- Manual camera capture
- Server-side SCRFD + ArcFace face verification
- Monthly attendance calendar
- Paid/unpaid leave
- Holidays and Sunday weekly holidays
- Salary management and printable monthly receipts
- Late deductions and overtime
- Sunday overtime per employee
- Supabase PostgreSQL, Auth and Storage

## Stack
Frontend: React 19, Vite, TypeScript, Tailwind, shadcn/Radix, TanStack Router, Supabase client.

Backend: Python 3.12, FastAPI, Uvicorn, InsightFace 0.7.3, ONNX Runtime 1.20.1, SCRFD, ArcFace, OpenCV.

## Project layout
```text
printball-attendance-payroll-v10/
├── src/
├── backend/
│   ├── app/main.py
│   ├── .env
│   ├── requirements.txt
│   └── .venv/
├── supabase/migrations/
├── .env
└── package.json
```

## Local URLs
Frontend: `http://localhost:8080`  
Backend: `http://127.0.0.1:8000`

## Frontend setup
```powershell
npm install
npm run dev
```

Root `.env`:
```env
VITE_SUPABASE_PROJECT_ID="YOUR_PROJECT_ID"
VITE_SUPABASE_PUBLISHABLE_KEY="YOUR_PUBLISHABLE_KEY"
VITE_SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
VITE_ATTENDANCE_API_URL="http://localhost:8000"
```

Never put the Supabase service-role key in the frontend.

## Backend setup
Use Python 3.12 and Visual Studio Build Tools 2022 with **Desktop development with C++**.

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m pip install insightface==0.7.3
python -m pip install onnxruntime==1.20.1
python -m pip install tzdata
uvicorn app.main:app --reload --port 8000
```

Backend `.env`:
```env
SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
CORS_ORIGINS="http://localhost:8080"
```

## Face verification flow
```text
Camera → left/right liveness → manual capture
→ FastAPI → SCRFD detection → ArcFace embedding
→ employee reference comparison → check-in/check-out
```

Liveness uses only **TURN LEFT** or **TURN RIGHT**. Blink/smile challenges and automatic stable-frame capture are not used.

## Attendance rules
- Joining-date aware
- Sundays are default weekly holidays
- Cleared attendance causes no deduction and is not absent
- Deleted attendance is removed
- Paid leave causes no deduction
- Unpaid leave causes a deduction
- Actual attendance takes precedence over leave
- Sunday overtime is paid only for the employee who actually works Sunday

See `payrollsetup.md`, `architecture.md`, `supabase setup.md`, `attendance admin guide.md`, and `backend/README.md`.
