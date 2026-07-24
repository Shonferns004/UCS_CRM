import { useState, useRef, useEffect } from 'react';
import { X, Send, Square } from 'lucide-react';

interface AudioRecorderProps {
  onSend: (file: File) => void;
  onClose: () => void;
}

export function AudioRecorder({ onSend, onClose }: AudioRecorderProps) {
  const [state, setState] = useState<'recording' | 'preview'>('recording');
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    startRecording();
    return () => cleanup();
  }, []);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg; codecs=opus') ? 'audio/ogg; codecs=opus' : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.current = recorder;
      chunks.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: recorder.mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setState('preview');
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setState('recording');
      let sec = 0;
      timerRef.current = window.setInterval(() => { sec++; setDuration(sec); }, 1000);
    } catch (err: any) {
      alert('Microphone access denied: ' + err.message);
      onClose();
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleSend = () => {
    if (audioBlob) {
      const file = new File([audioBlob], `audio_${Date.now()}.webm`, { type: audioBlob.type });
      onSend(file);
    }
    cleanup();
    onClose();
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="bg-[#f0f2f5] px-4 py-2">
      {state === 'recording' && (
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
          <span className="text-sm font-semibold text-red-500 tabular-nums">{formatTime(duration)}</span>
          <div className="flex-1 flex items-center gap-[2px] h-8">
            {Array.from({ length: 40 }).map((_, i) => (
              <div key={i} className="w-[3px] rounded-full bg-[#00a884]" style={{ height: `${Math.random() * 100}%` }} />
            ))}
          </div>
          <button onClick={stopRecording} className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white">
            <Square className="h-4 w-4" />
          </button>
        </div>
      )}
      {state === 'preview' && (
        <div className="flex items-center gap-3">
          <button onClick={() => { cleanup(); onClose(); }} className="shrink-0 text-[#667781] p-1">
            <X className="h-5 w-5" />
          </button>
          <div className="flex-1 flex items-center gap-2 rounded-lg bg-white px-2 py-1">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="#00a884"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            {audioUrl && <audio src={audioUrl} controls className="flex-1 h-9" />}
          </div>
          <button onClick={handleSend} className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-[#00a884] text-white">
            <Send className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
