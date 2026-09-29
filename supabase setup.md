# Supabase Setup Guide

## 1. Project
Create a Supabase project and obtain:
- Project URL
- Project ID
- Publishable key
- Service-role key

## 2. Frontend `.env`
```env
VITE_SUPABASE_PROJECT_ID="YOUR_PROJECT_ID"
VITE_SUPABASE_PUBLISHABLE_KEY="YOUR_PUBLISHABLE_KEY"
VITE_SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
VITE_ATTENDANCE_API_URL="http://localhost:8000"
```

## 3. Backend `.env`
```env
SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
CORS_ORIGINS="http://localhost:8080"
```

The service-role key is backend-only.

## 4. Migrations
Database migrations are stored in:
```text
supabase/migrations/
```
Review and apply migrations to the intended Supabase project.

## 5. Storage
Required image buckets include:
```text
employee-photos
attendance-photos
```
Keep employee and attendance images protected by appropriate Storage policies.

## 6. Auth
Supabase Authentication provides application login. Administrative authorization is handled by the application's role/security model.

## 7. RLS
Keep Row Level Security enabled where required. Review policies whenever tables or roles change. Do not make private employee/payroll data globally accessible as a workaround.

## 8. Troubleshooting
`bucket not found` → verify exact bucket name.

Database failures → verify URL, service-role key, migrations, table names and RLS.

Keep secrets out of GitHub.
