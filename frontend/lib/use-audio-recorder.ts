"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** BR-56 — tự dừng ở 3 phút (UC-53 luồng 5.1). */
export const MAX_RECORDING_SEC = 180;

export type RecorderStatus = "idle" | "requesting" | "recording" | "recorded";

export interface AudioRecorder {
  status: RecorderStatus;
  /** Giây đã ghi, cập nhật ~10 lần/giây để đồng hồ chạy mượt. */
  elapsedSec: number;
  /** Mức tín hiệu hiện tại [0..1] để vẽ dạng sóng trực tiếp lúc đang ghi. */
  level: number;
  blob: Blob | null;
  error: string | null;
  /** Cảnh báo không chặn (VD bản ghi bị ngắt giữa chừng) — UC-53 ngoại lệ 4.E1. */
  warning: string | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

/**
 * UC-53 — ghi âm qua MediaRecorder.
 *
 * Xử lý đủ các ngoại lệ SRS liệt kê: 2.E1 từ chối quyền micro, 2.E2 máy không
 * có micro, 4.E1 bản ghi bị ngắt giữa chừng (vẫn giữ phần đã ghi), 5.1 tự dừng
 * khi chạm 3 phút.
 */
export function useAudioRecorder(): AudioRecorder {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [level, setLevel] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);

  /** Trả lại micro + huỷ mọi vòng lặp đo mức tín hiệu. */
  const releaseHardware = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  // Người dùng đóng tab/điều hướng đi giữa chừng: phải nhả micro, nếu không đèn
  // micro của trình duyệt vẫn sáng cho tới khi đóng hẳn tab.
  useEffect(() => releaseHardware, [releaseHardware]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setWarning(null);
    setBlob(null);
    setElapsedSec(0);
    setStatus("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setStatus("idle");
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        // UC-53 ngoại lệ 2.E1
        setError(
          "Bạn đã từ chối quyền dùng micro. Không ghi âm được nếu chưa cấp quyền.",
        );
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        // UC-53 ngoại lệ 2.E2
        setError("Không tìm thấy micro nào trên thiết bị này.");
      } else {
        setError("Không truy cập được micro.");
      }
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      releaseHardware();
      setLevel(0);
      const recorded = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      setBlob(recorded);
      setStatus(recorded.size > 0 ? "recorded" : "idle");
      if (recorded.size === 0) {
        setError("Bản ghi rỗng — không có dữ liệu âm thanh nào được thu.");
      }
    };

    // UC-53 ngoại lệ 4.E1 — app khác chiếm micro / thiết bị bị rút giữa chừng.
    stream.getAudioTracks().forEach((track) => {
      track.onended = () => {
        if (recorder.state === "recording") {
          setWarning("Bản ghi kết thúc sớm vì micro bị ngắt. Phần đã ghi vẫn được giữ.");
          recorder.stop();
        }
      };
    });

    // Đo mức tín hiệu để vẽ dạng sóng trực tiếp (UC-53 bước 4).
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);

    const measure = () => {
      analyser.getFloatTimeDomainData(samples);
      let sumSquares = 0;
      for (const sample of samples) sumSquares += sample * sample;
      // RMS nhân 3 để mức nói bình thường lấp đủ cột sóng, vẫn kẹp trần ở 1.
      setLevel(Math.min(1, Math.sqrt(sumSquares / samples.length) * 3));
      rafRef.current = requestAnimationFrame(measure);
    };
    rafRef.current = requestAnimationFrame(measure);

    startedAtRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      setElapsedSec(elapsed);
      // UC-53 luồng 5.1 — chạm giới hạn thì tự dừng và nói rõ lý do.
      if (elapsed >= MAX_RECORDING_SEC) {
        setWarning("Đã đạt giới hạn 3 phút nên bản ghi tự dừng (BR-56).");
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      }
    }, 100);

    recorder.start();
    setStatus("recording");
  }, [releaseHardware]);

  const reset = useCallback(() => {
    releaseHardware();
    recorderRef.current = null;
    chunksRef.current = [];
    setBlob(null);
    setElapsedSec(0);
    setLevel(0);
    setError(null);
    setWarning(null);
    setStatus("idle");
  }, [releaseHardware]);

  return { status, elapsedSec, level, blob, error, warning, start, stop, reset };
}
