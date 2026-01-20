import { useEffect, useState } from "react";

/**
 * True when the current device/UA supports real hover interactions.
 * Useful to avoid sticky :hover behavior on touch devices.
 */
export function useCanHover(): boolean {
  const [canHover, setCanHover] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");

    const update = () => setCanHover(mq.matches);
    update();

    // Safari fallback
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }

    // eslint-disable-next-line deprecation/deprecation
    mq.addListener(update);
    // eslint-disable-next-line deprecation/deprecation
    return () => mq.removeListener(update);
  }, []);

  return canHover;
}
