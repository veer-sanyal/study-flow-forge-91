import { useEffect, useState } from "react";

/**
 * True when the current device/UA supports real hover interactions
 * AND does NOT have touch capability. This prevents sticky hover on
 * hybrid devices (laptops with touchscreens, tablets with keyboards).
 */
export function useCanHover(): boolean {
  const [canHover, setCanHover] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const update = () => {
      // Check if device has touch capability
      const hasTouch = 
        "ontouchstart" in window || 
        navigator.maxTouchPoints > 0 ||
        // @ts-ignore - for older browsers
        navigator.msMaxTouchPoints > 0;

      // Check if device has fine pointer (mouse)
      const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
      
      // Check if device supports hover
      const supportsHover = window.matchMedia("(hover: hover)").matches;

      // Only allow hover if device has fine pointer, supports hover, AND has no touch
      // This prevents sticky hover on touch-capable hybrid devices
      setCanHover(hasFinePointer && supportsHover && !hasTouch);
    };

    update();

    // Listen for changes (e.g., connecting/disconnecting mouse)
    const mq = window.matchMedia("(pointer: fine)");
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
