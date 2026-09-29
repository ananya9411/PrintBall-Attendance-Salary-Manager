from __future__ import annotations

import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Annotated
from urllib import error as urlerror
from urllib import request as urlrequest
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from insightface.app import FaceAnalysis
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic_settings import BaseSettings, SettingsConfigDict
from supabase import Client, create_client


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    supabase_url: str
    supabase_service_role_key: str
    cors_origins: str = "http://localhost:8080"
    max_upload_bytes: int = 8_000_000
    rate_limit_attempts: int = 8
    rate_limit_window_seconds: int = 300


settings = Settings()
supabase: Client = create_client(settings.supabase_url, settings.supabase_service_role_key)
app = FastAPI(title="PrintBall Attendance Security API", version="1.2.0")


@app.on_event("startup")
async def warm_face_model() -> None:
    # SCRFD detector + ArcFace recognition (InsightFace buffalo_sc).
    # This is deliberately loaded once and reused for every attendance capture.
    try:
        get_face_engine()
        print("[attendance] SCRFD + ArcFace model ready")
    except Exception as exc:
        print(f"[attendance] face model warm-up deferred: {type(exc).__name__}: {exc}")


origins = [item.strip() for item in settings.cors_origins.split(",") if item.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["Authorization", "Content-Type"],
)

_attempts: dict[str, deque[float]] = defaultdict(deque)
_profile_embedding_cache: dict[str, tuple[str, list[float]]] = {}

FACE_PACK = "buffalo_sc"
# InsightFace returns normalized ArcFace embeddings.  A cosine distance of 0.40
# is a practical starting point for webcam captures; the detector/quality checks
# still prevent accepting a tiny or missing face.
FACE_THRESHOLD = 0.40
FACE_MIN_SIZE_PX = 55
_face_engine: FaceAnalysis | None = None


def enforce_rate_limit(key: str) -> None:
    now = time.time()
    bucket = _attempts[key]
    while bucket and now - bucket[0] > settings.rate_limit_window_seconds:
        bucket.popleft()
    if len(bucket) >= settings.rate_limit_attempts:
        raise HTTPException(status_code=429, detail="Too many verification attempts. Please wait and try again.")
    bucket.append(now)


def decode_image(data: bytes) -> np.ndarray:
    if not data or len(data) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Image is empty or too large.")
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="The uploaded image could not be decoded.")
    return image


def get_employee_profile(employee_id: str) -> tuple[str, bytes]:
    employee = (
        supabase.table("employees")
        .select("id,photo_path,active")
        .eq("id", employee_id)
        .limit(1)
        .execute()
    ).data or []
    employee = employee[0] if isinstance(employee, list) and employee else employee
    if not employee or not employee.get("active"):
        raise HTTPException(status_code=404, detail="Employee not found or inactive.")
    path = employee.get("photo_path")
    if not path:
        raise HTTPException(status_code=400, detail="This employee does not have a profile photo. A profile photo is required for secure attendance.")
    try:
        return str(path), supabase.storage.from_("employee-photos").download(path)
    except Exception as exc:
        print(f"[attendance] profile download failed: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=502, detail="Could not retrieve the employee profile photo.") from exc


def get_face_engine() -> FaceAnalysis:
    global _face_engine
    if _face_engine is None:
        if getattr(sys, "frozen", False):
            model_root = Path(sys.executable).resolve().parent / "models"
        else:
            model_root = Path.home() / ".insightface"

        _face_engine = FaceAnalysis(
            name=FACE_PACK,
            root=str(model_root),
            providers=["CPUExecutionProvider"],
        )
        # 720p camera input is resized internally by SCRFD.  This context keeps
        # enough resolution for faces farther from the kiosk without running the
        # largest detector model.
        _face_engine.prepare(ctx_id=0, det_size=(640, 640))
    return _face_engine


def _largest_face(faces):
    if not faces:
        return None
    return max(
        faces,
        key=lambda face: float((face.bbox[2] - face.bbox[0]) * (face.bbox[3] - face.bbox[1])),
    )


def _embedding_from_bytes(data: bytes) -> list[float]:
    image = decode_image(data)
    try:
        faces = get_face_engine().get(image)
        face = _largest_face(faces)
        if face is None:
            raise ValueError("No face detected")

        width = float(face.bbox[2] - face.bbox[0])
        height = float(face.bbox[3] - face.bbox[1])
        if min(width, height) < FACE_MIN_SIZE_PX:
            raise ValueError(
                f"Face is too small ({int(min(width, height))}px). Move slightly closer to the camera."
            )

        embedding = getattr(face, "normed_embedding", None)
        if embedding is None:
            embedding = getattr(face, "embedding", None)
        if embedding is None:
            raise ValueError("ArcFace embedding unavailable")
        return [float(v) for v in embedding]
    except HTTPException:
        raise
    except Exception as exc:
        raise ValueError(f"SCRFD/ArcFace failed: {type(exc).__name__}: {exc}") from exc


def get_cached_profile_embedding(employee_id: str, photo_path: str, profile_bytes: bytes) -> list[float]:
    cached = _profile_embedding_cache.get(employee_id)
    if cached and cached[0] == photo_path:
        return cached[1]
    embedding = _embedding_from_bytes(profile_bytes)
    _profile_embedding_cache[employee_id] = (photo_path, embedding)
    print(f"[attendance] cached ArcFace profile embedding for {employee_id}")
    return embedding


def cosine_distance(a: list[float], b: list[float]) -> float:
    av = np.asarray(a, dtype=np.float32)
    bv = np.asarray(b, dtype=np.float32)
    denom = float(np.linalg.norm(av) * np.linalg.norm(bv))
    if denom == 0:
        raise ValueError("Invalid face embedding")
    return float(1.0 - float(np.dot(av, bv) / denom))


def verify_identity(employee_id: str, profile_path: str, profile_bytes: bytes, live_bytes: bytes) -> tuple[bool, float]:
    """Fast face verification using SCRFD + cached ArcFace embeddings."""
    try:
        profile_embedding = get_cached_profile_embedding(employee_id, profile_path, profile_bytes)
        live_embedding = _embedding_from_bytes(live_bytes)
        distance = cosine_distance(profile_embedding, live_embedding)
        verified = distance <= FACE_THRESHOLD
        print(
            f"[attendance] face verification: detector=SCRFD recognition=ArcFace "
            f"verified={verified} distance={distance:.6f} threshold={FACE_THRESHOLD}"
        )
        return verified, distance
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[attendance] face verification engine failed: {type(exc).__name__}: {exc}")
        raise HTTPException(
            status_code=422,
            detail=(
                "We could not verify the captured face. "
                "Please face the camera and capture again, or move slightly closer if your face is small in the frame."
            ),
        ) from exc

def supabase_rest(method: str, table: str, *, query: str = "", payload: dict | None = None) -> list[dict]:
    """Use Supabase REST directly for attendance writes.

    This bypasses version-sensitive Python PostgREST response helpers (including version-sensitive PostgREST response helpers while retaining the service-role boundary on the backend.
    """
    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/{table}{query}"
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urlrequest.Request(url, data=body, method=method.upper())
    req.add_header("apikey", settings.supabase_service_role_key)
    req.add_header("Authorization", f"Bearer {settings.supabase_service_role_key}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    req.add_header("Prefer", "return=representation")
    try:
        with urlrequest.urlopen(req, timeout=8) as response:
            raw = response.read().decode("utf-8")
            if not raw:
                return []
            data = json.loads(raw)
            return data if isinstance(data, list) else [data]
    except urlerror.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase REST {method} {table} failed ({exc.code}): {detail}") from exc
    except Exception as exc:
        raise RuntimeError(f"Supabase REST {method} {table} failed: {type(exc).__name__}: {exc}") from exc


def upload_attendance_photo(employee_id: str, mode: str, data: bytes) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    path = f"{employee_id}/{stamp}-{mode}.jpg"
    try:
        supabase.storage.from_("attendance-photos").upload(
            path,
            data,
            {"content-type": "image/jpeg", "upsert": False},
        )
    except Exception as exc:
        print(f"[attendance] photo upload failed: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=502, detail="Attendance photo could not be stored.") from exc
    return path


def india_today() -> str:
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "printball-attendance-security", "build": "scrfd-arcface-720p-v1"}


@app.post("/api/attendance/check-in")
async def check_in(
    employee_id: Annotated[str, Form()],
    challenge_passed: Annotated[str, Form()],
    image: Annotated[UploadFile, File()],
    authorization: str | None = Header(default=None),
):
    if challenge_passed.lower() != "true":
        raise HTTPException(status_code=422, detail="Complete the liveness check before capturing your attendance photo.")
    enforce_rate_limit(f"in:{employee_id}")
    image_bytes = await image.read()
    profile_path, profile_bytes = get_employee_profile(employee_id)
    verified, distance = verify_identity(employee_id, profile_path, profile_bytes, image_bytes)
    if not verified:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Face verification failed{f' (distance {distance:.3f})' if distance is not None else ''}. "
                "Please face the camera and capture again."
            ),
        )

    work_date = india_today()
    existing = (
        supabase.table("attendance")
        .select("id,check_out_at,status")
        .eq("employee_id", employee_id)
        .eq("work_date", work_date)
        .eq("status", "present")
        .order("check_in_at", desc=True)
        .limit(1)
        .execute()
    ).data or []
    if existing and existing[0].get("check_out_at") is None:
        raise HTTPException(status_code=409, detail="This employee is already checked in today.")
    if existing and existing[0].get("check_out_at") is not None:
        raise HTTPException(status_code=409, detail="This employee has already completed attendance today.")

    photo_path = upload_attendance_photo(employee_id, "in", image_bytes)
    now = datetime.now(timezone.utc).isoformat()
    try:
        rows = supabase_rest(
            "POST",
            "attendance",
            payload={
                "employee_id": employee_id,
                "work_date": work_date,
                "check_in_at": now,
                "check_in_photo": photo_path,
                "status": "present",
            },
        )
        row = rows[0] if rows else {
            "employee_id": employee_id,
            "work_date": work_date,
            "check_in_at": now,
            "check_in_photo": photo_path,
            "status": "present",
        }
    except Exception as exc:
        print(f"[attendance] check-in database write failed: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=502, detail="Attendance could not be recorded.") from exc
    return {"ok": True, "attendance": row, "face_distance": distance}


@app.post("/api/attendance/check-out")
async def check_out(
    employee_id: Annotated[str, Form()],
    challenge_passed: Annotated[str, Form()],
    image: Annotated[UploadFile, File()],
    authorization: str | None = Header(default=None),
):
    if challenge_passed.lower() != "true":
        raise HTTPException(status_code=422, detail="Complete the liveness check before capturing your attendance photo.")
    enforce_rate_limit(f"out:{employee_id}")
    image_bytes = await image.read()
    profile_path, profile_bytes = get_employee_profile(employee_id)
    verified, distance = verify_identity(employee_id, profile_path, profile_bytes, image_bytes)
    if not verified:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Face verification failed{f' (distance {distance:.3f})' if distance is not None else ''}. "
                "Please face the camera and capture again."
            ),
        )

    work_date = india_today()
    rows = (
        supabase.table("attendance")
        .select("*")
        .eq("employee_id", employee_id)
        .eq("work_date", work_date)
        .eq("status", "present")
        .is_("check_out_at", "null")
        .order("check_in_at", desc=True)
        .limit(1)
        .execute()
    ).data or []
    if not rows:
        raise HTTPException(status_code=409, detail="No open check-in was found for this employee today.")

    photo_path = upload_attendance_photo(employee_id, "out", image_bytes)
    now = datetime.now(timezone.utc).isoformat()
    try:
        row_list = supabase_rest(
            "PATCH",
            "attendance",
            query=f"?id=eq.{rows[0]['id']}&check_out_at=is.null",
            payload={"check_out_at": now, "check_out_photo": photo_path},
        )
        row = row_list[0] if row_list else {
            "id": rows[0]["id"],
            "employee_id": employee_id,
            "check_out_at": now,
            "check_out_photo": photo_path,
        }
    except Exception as exc:
        print(f"[attendance] check-out database write failed: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=502, detail="Check-out could not be recorded.") from exc
    return {"ok": True, "attendance": row, "face_distance": distance}
