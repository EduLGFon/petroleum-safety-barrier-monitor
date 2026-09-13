// Fake progress hook - eased splash progress with staged status messages.
// This is why it exists: simulates load pacing and exit timing so the splash
// covers hydration with smooth easing before signalling onDone.
import { useCallback, useEffect, useState } from "preact/hooks";

// useFakeProgress: eased 0-100 progress with staged messages; fades exit then calls onDone.
export function useFakeProgress(onDone: () => void) {
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [exit, setExit] = useState(false);

  const done = useCallback(onDone, [onDone]);

  useEffect(() => {
    const steps = 55, dur = 1500;
    let step = 0;
    const id = setInterval(() => {
      step++;
      const t = step / steps;
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setProgress(Math.round(e * 100));
      if (step >= steps) {
        clearInterval(id);
        setReady(true);
        setTimeout(() => {
          setExit(true);
          setTimeout(done, 550);
        }, 300);
      }
    }, dur / steps);
    return () => clearInterval(id);
  }, [done]);

  const msg = progress < 35
    ? "Inicializando…"
    : progress < 65
    ? "Carregando inventário…"
    : progress < 90
    ? "Processando métricas…"
    : "Concluído";

  return { progress, ready, exit, msg };
}
