import { useState, useRef } from "react";
import { toast } from "sonner";

export function useAudioRecorder() {
  const [recording, setRecording]  = useState(false);
  const [audioBlob, setAudioBlob]  = useState<Blob | null>(null);
  const [duration, setDuration]    = useState(0);
  const mediaRef  = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const getMimeType = () => {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "audio/mp4",
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return "";
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getMimeType();
      const mr = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start(100);
      mediaRef.current = mr;
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch (e: any) {
      if (e.name === "NotAllowedError") {
        toast.error("Permissão de microfone negada. Clique no ícone de cadeado na barra de endereço e permita o microfone.");
      } else {
        toast.error(`Erro ao acessar microfone: ${e.message}`);
      }
    }
  };

  const stop = () => {
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const cancel = () => {
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
    chunksRef.current = [];
    setRecording(false);
    setAudioBlob(null);
    setDuration(0);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const reset = () => { setAudioBlob(null); setDuration(0); };

  return { recording, audioBlob, duration, start, stop, cancel, reset };
}
