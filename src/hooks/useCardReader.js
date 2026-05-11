import { useEffect, useRef, useCallback } from 'react';

export default function useCardReader({
  onScan,
  maxGapMs = 100,
  minDigits = 4,
  enabled = true,
} = {}) {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const timerRef = useRef(null);

  const flush = useCallback(() => {
    const raw = bufferRef.current;
    bufferRef.current = '';

    if (raw.length >= minDigits) {
      onScan?.(raw);
    }
  }, [onScan, minDigits]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      const now = Date.now();

      // Enter terminates a scan sequence
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(timerRef.current);
        flush();
        return;
      }

      // Only accept digits
      if (!/^\d$/.test(e.key)) {
        // Non-digit typed — if gap is large, this is a human typing, reset
        if (now - lastKeyTimeRef.current > maxGapMs) {
          bufferRef.current = '';
        }
        return;
      }

      // If too much time since last key, start fresh
      if (now - lastKeyTimeRef.current > maxGapMs && bufferRef.current.length > 0) {
        bufferRef.current = '';
      }

      bufferRef.current += e.key;
      lastKeyTimeRef.current = now;

      // Safety timer — flush if Enter never arrives
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        flush();
      }, maxGapMs * 2);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timerRef.current);
    };
  }, [enabled, maxGapMs, flush]);
}
