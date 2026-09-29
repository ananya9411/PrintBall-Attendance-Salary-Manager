# Architecture & Security Architecture

## High level
```text
React/Vite frontend
        ↓
FastAPI backend
   ↙           ↘
Supabase     InsightFace
DB/Auth/     SCRFD + ArcFace
Storage
```

## Frontend
Handles UI, camera access, liveness interaction, manual capture, attendance calendar, employee management, leave and payroll screens.

## Backend
`backend/app/main.py` handles attendance APIs, server-side validation, face verification and Supabase operations.

## Face security
```text
Captured image
→ SCRFD face detection
→ alignment
→ ArcFace embedding
→ employee reference embedding
→ distance comparison
→ threshold
→ verified/rejected
```

The browser does not make the final face-match decision.

## Liveness
Only:
- TURN LEFT
- TURN RIGHT

No blink/smile challenge. Capture is manual after liveness.

## Supabase
Supabase provides PostgreSQL, authentication and Storage. Image areas include `employee-photos` and `attendance-photos`.

## Secrets
Frontend may use public Supabase project configuration. The backend alone may use `SUPABASE_SERVICE_ROLE_KEY`.

Never expose or commit service-role credentials.

## Timezone
Attendance uses `Asia/Kolkata` through Python `zoneinfo`. Windows requires the `tzdata` package.

## CORS
Local frontend: `http://localhost:8080`  
Local backend: `http://127.0.0.1:8000`

A browser CORS/Failed-to-fetch message can actually be caused by a backend HTTP 500, so always inspect backend logs first.

## Payroll isolation
All attendance, leave, overtime and payroll calculations are scoped per employee. One employee's Sunday work must never affect another employee.

## Security boundaries
Browser: camera/UI/liveness interaction.  
Backend: face verification, sensitive attendance authorization and privileged Supabase operations.  
Supabase: persistent database, Auth, Storage and database policies.
