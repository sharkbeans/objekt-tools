import { useEffect, useState } from "react";

/**
 * Returns true one frame after mount — pair with the .t-reveal / .is-revealed
 * classes (globals.css) to fade+blur content in as it replaces a loading
 * skeleton. Re-run per mount by changing `key` on the consuming element.
 */
export function useMountReveal(): boolean {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return revealed;
}
