import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Browser voice-note recorder for the chat composer.
 *
 * Records with MediaRecorder and hands back the finished blob; the caller stages it as an
 * attachment with `ptt: true`, which is what makes the gateway send a push-to-talk voice note
 * (waveform included) instead of a music-style audio file.
 *
 * Format: WhatsApp voice notes are OGG/Opus. Prefer that; Chromium only recently supports
 * `audio/ogg;codecs=opus`, so the list falls back to WebM/Opus and finally to whatever the browser
 * picks (`undefined` mimeType). The gateway accepts any audio type it can probe for duration.
 *
 * Microphone capture requires a secure context: `navigator.mediaDevices` is undefined on a plain
 * http:// page that is not localhost, so `supported` is false there and the UI must not offer the
 * button at all.
 */
export type VoiceRecorderStatus = 'idle' | 'recording' | 'ready' | 'error';

const PREFERRED_MIME_TYPES = [
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return PREFERRED_MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type));
}

/** Whether this browser AND page origin can record at all (HTTPS or localhost only). */
export function voiceRecordingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

export function useVoiceRecorder() {
  const [status, setStatus] = useState<VoiceRecorderStatus>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef<string | undefined>(undefined);
  const discardRef = useRef(false);
  const onStopRef = useRef<((blob: Blob, mimetype: string) => void) | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const releaseTracks = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };

  const stopInternal = useCallback(() => {
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recorderRef.current = null;
  }, []);

  /** Start capturing. Returns false when the browser refused the microphone. */
  const start = useCallback(async (onFinished: (blob: Blob, mimetype: string) => void): Promise<boolean> => {
    if (!voiceRecordingSupported()) {
      setError('Recording needs HTTPS (or localhost).');
      setStatus('error');
      return false;
    }
    setError(null);
    setSeconds(0);
    setStatus('recording');
    discardRef.current = false;
    onStopRef.current = onFinished;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      mimeRef.current = mimeType;
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        clearTimer();
        releaseTracks();
        recorderRef.current = null;
        if (discardRef.current) {
          chunksRef.current = [];
          setStatus('idle');
          return;
        }
        const type = mimeRef.current || recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        if (!blob.size) {
          setError('Nothing was recorded.');
          setStatus('error');
          return;
        }
        setStatus('ready');
        onStopRef.current?.(blob, type);
        onStopRef.current = null;
        // Back to idle: the finished clip lives in the composer's staged attachment from here on.
        setStatus('idle');
      };

      recorder.start(200);
      timerRef.current = setInterval(() => setSeconds(value => value + 1), 1000);
      return true;
    } catch (err) {
      clearTimer();
      releaseTracks();
      recorderRef.current = null;
      setError(err instanceof Error ? err.message : 'The microphone could not be opened.');
      setStatus('error');
      return false;
    }
  }, []);

  /** Finish the recording and hand the blob to the callback passed to start(). */
  const stop = useCallback(() => {
    stopInternal();
  }, [stopInternal]);

  /** Throw the recording away (cancel button, chat switch, unmount). */
  const cancel = useCallback(() => {
    discardRef.current = true;
    stopInternal();
    releaseTracks();
    setSeconds(0);
    setStatus('idle');
  }, [stopInternal]);

  useEffect(
    () => () => {
      discardRef.current = true;
      stopInternal();
      releaseTracks();
    },
    [stopInternal],
  );

  return {
    supported: voiceRecordingSupported(),
    status,
    seconds,
    error,
    start,
    stop,
    cancel,
    /** A short beep-free label the UI can show while recording. */
    elapsedLabel: `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`,
  };
}
