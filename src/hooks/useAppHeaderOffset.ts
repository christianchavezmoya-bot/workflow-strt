import { useEffect, type RefObject } from "react";

/** Keeps --app-header-offset in sync with the measured fixed header stack height. */
export function useAppHeaderOffset(headerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const apply = () => {
      document.documentElement.style.setProperty(
        "--app-header-offset",
        `${el.getBoundingClientRect().height}px`,
      );
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    window.addEventListener("resize", apply);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [headerRef]);
}
