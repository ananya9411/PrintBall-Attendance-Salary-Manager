import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, CircleAlert, LoaderCircle, MoveHorizontal, RefreshCw, ShieldCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { detectLivenessAction, faceEngine, type LivenessChallenge } from "@/lib/faceVerification";

type Props = {
  employeeName: string;
  employeePhotoUrl: string | null;
  mode: "in" | "out";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (photo: Blob | null) => void | Promise<void>;
};

const CHALLENGES: LivenessChallenge[] = ["turn-left", "turn-right"];

function challengeText(challenge: LivenessChallenge) {
  if (challenge === "turn-left") return "TURN LEFT";
  return "TURN RIGHT";
}

function challengeIcon(challenge: LivenessChallenge) {
  return MoveHorizontal;
}

export function AttendanceCamera({ employeeName, mode, busy, onCancel, onConfirm }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shotUrlRef = useRef<string | null>(null);
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [verification, setVerification] = useState<"idle" | "checking" | "matched" | "error">("idle");
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<LivenessChallenge>(CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)]!);
  const [liveness, setLiveness] = useState<"idle" | "checking" | "passed" | "failed">("idle");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const revokeShot = useCallback(() => {
    if (shotUrlRef.current) URL.revokeObjectURL(shotUrlRef.current);
    shotUrlRef.current = null;
  }, []);

  const chooseChallenge = useCallback(() => {
    setChallenge(CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)]!);
  }, []);

  const start = useCallback(async () => {
    stop();
    revokeShot();
    setCamError(null);
    setVerification("idle");
    setVerificationMessage(null);
    setLiveness("idle");
    setShot(null);
    chooseChallenge();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      // Warm the lightweight browser liveness models while the camera is already
      // opening, so pressing Start liveness does not wait for model downloads.
      void faceEngine().catch(() => undefined);
    } catch {
      setCamError("Camera not available. Allow camera access to continue.");
    }
  }, [chooseChallenge, revokeShot, stop]);

  useEffect(() => {
    void start();
    return () => {
      stop();
      revokeShot();
    };
  }, [start, stop, revokeShot]);

  const runLiveness = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      setLiveness("failed");
      setVerificationMessage("Camera is still starting. Try again in a moment.");
      return;
    }

    setLiveness("checking");
    setVerificationMessage(null);
    try {
      const passed = await detectLivenessAction(video, challenge, 10000);
      if (!passed) {
        setLiveness("failed");
        setVerificationMessage("Not detected. Try the challenge again.");
        return;
      }
      setLiveness("passed");
      setVerification("idle");
      setVerificationMessage("Liveness verified. Face the camera and press Capture photo.");
    } catch (error) {
      setLiveness("failed");
      setVerificationMessage(error instanceof Error ? error.message : "Liveness verification failed. Try again.");
    }
  };

  const captureAndVerify = async () => {
    const video = videoRef.current;
    if (!video || liveness !== "passed" || busy || verification === "checking") return;
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      setVerification("error");
      setVerificationMessage("Camera frame is not ready. Try again.");
      return;
    }

    setVerification("checking");
    setVerificationMessage("Verifying captured photo…");

    // Keep more camera pixels for people who stand farther from the camera.
    // 960px still keeps the upload small while preserving much more facial detail
    // than the previous 640px capture.
    const maxWidth = 1280;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setVerification("error");
      setVerificationMessage("Could not capture the camera frame. Try again.");
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) {
      setVerification("error");
      setVerificationMessage("Could not create the attendance photo. Try again.");
      return;
    }

    const url = URL.createObjectURL(blob);
    revokeShot();
    shotUrlRef.current = url;
    setShot({ url, blob });

    try {
      await onConfirm(blob);
      stop();
      setVerification("matched");
      setVerificationMessage(`✓ ${mode === "in" ? "Check-in" : "Check-out"} completed.`);
    } catch (error) {
      setVerification("error");
      setVerificationMessage(error instanceof Error ? error.message : "Secure attendance verification failed. Try again.");
    }
  };

  const retake = () => {
    revokeShot();
    setShot(null);
    setVerification("idle");
    setVerificationMessage(null);
    setLiveness("idle");
    void start();
  };

  const ChallengeIcon = challengeIcon(challenge);
  const canCapture = liveness === "passed" && !shot;

  return (
    <div className="flex min-w-0 flex-col gap-3 overflow-hidden">
      {!shot && !camError && (
        <section className={`flex min-h-[92px] items-center justify-center rounded-2xl border px-4 py-3 text-center shadow-sm sm:min-h-[104px] ${liveness === "passed" ? "border-success/30 bg-success/5" : "border-primary/20 bg-primary/5"}`}>
          {liveness === "passed" ? (
            <div>
              <div className="flex items-center justify-center gap-2 text-success">
                <ShieldCheck className="size-5" />
                <span className="text-sm font-bold uppercase tracking-wider">Liveness passed</span>
              </div>
              <p className="mt-1 text-base font-semibold sm:text-lg">Face the camera and click Capture photo</p>
            </div>
          ) : (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Liveness challenge</p>
              <div className="mt-1 flex items-center justify-center gap-2">
                <ChallengeIcon className="size-6 shrink-0 text-primary sm:size-7" />
                <h3 className="text-3xl font-black tracking-tight sm:text-4xl">{challengeText(challenge)}</h3>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-ink">
        {shot ? (
          <img src={shot.url} alt="Captured attendance photo" className="h-full w-full object-cover" />
        ) : (
          <video ref={videoRef} playsInline muted className="h-full w-full scale-x-[-1] object-cover" />
        )}
        {camError && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-ink-foreground">{camError}</div>}
        {!shot && !camError && liveness === "passed" && (
          <div className="absolute inset-x-3 bottom-3 rounded-xl bg-black/70 px-3 py-2 text-center text-xs font-semibold text-white backdrop-blur-sm sm:text-sm">
            Liveness passed · Ready for your photo
          </div>
        )}
      </div>

      <div className={`min-h-[48px] rounded-xl border px-3 py-2.5 text-sm ${liveness === "passed" ? "border-success/30 bg-success/5" : liveness === "failed" || verification === "error" ? "border-destructive/30 bg-destructive/5" : "bg-muted/40"}`}>
        <div className="flex items-center gap-2">
          {liveness === "checking" || verification === "checking" ? <LoaderCircle className="size-4 shrink-0 animate-spin" /> : liveness === "failed" || verification === "error" ? <CircleAlert className="size-4 shrink-0 text-destructive" /> : <ShieldCheck className="size-4 shrink-0 text-success" />}
          <p className="min-w-0 text-xs font-medium leading-5 text-muted-foreground">
            {verificationMessage ?? (shot ? "Attendance photo captured." : liveness === "passed" ? "Ready to capture." : "Follow the large challenge above.")}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="h-10 min-w-0 flex-1 rounded-xl" onClick={onCancel} disabled={busy || liveness === "checking" || verification === "checking"}>
          <X className="size-4" /> Cancel
        </Button>
        {shot ? (
          <Button variant="secondary" className="h-10 min-w-0 flex-1 rounded-xl" onClick={retake} disabled={busy || verification === "checking"}>
            <RefreshCw className="size-4" /> Retake
          </Button>
        ) : camError ? (
          <Button className="h-10 min-w-0 flex-1 rounded-xl" onClick={() => void start()} disabled={busy}>Retry camera</Button>
        ) : canCapture ? (
          <Button className="h-10 min-w-0 flex-1 rounded-xl" onClick={() => void captureAndVerify()} disabled={busy || verification === "checking"}>
            <Camera className="size-4" /> Capture photo
          </Button>
        ) : (
          <Button className="h-10 min-w-0 flex-1 rounded-xl" onClick={() => void runLiveness()} disabled={busy || liveness === "checking"}>
            <Check className="size-4" /> {liveness === "failed" ? "Try again" : "Start liveness"}
          </Button>
        )}
      </div>

      <p className="truncate text-center text-[11px] text-muted-foreground">{employeeName} · {mode === "in" ? "Check in" : "Check out"}</p>
    </div>
  );
}
