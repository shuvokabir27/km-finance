import { useEffect, useState } from "react";
import logo from "@/assets/km-logo.png";

export function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const minDuration = 1400;
    const start = performance.now();

    const finish = () => {
      const elapsed = performance.now() - start;
      const wait = Math.max(0, minDuration - elapsed);
      window.setTimeout(() => {
        setFading(true);
        window.setTimeout(() => setVisible(false), 500);
      }, wait);
    };

    if (document.readyState === "complete") {
      finish();
    } else {
      window.addEventListener("load", finish, { once: true });
      // safety timeout
      const safety = window.setTimeout(finish, 6000);
      return () => {
        window.removeEventListener("load", finish);
        window.clearTimeout(safety);
      };
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-background transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Glow rings */}
      <div className="relative flex items-center justify-center">
        <span className="absolute h-44 w-44 rounded-full bg-primary/20 blur-2xl animate-splash-pulse" />
        <span className="absolute h-36 w-36 rounded-full border-2 border-primary/30 animate-splash-ring" />
        <span
          className="absolute h-28 w-28 rounded-full border-2 border-primary/50 animate-splash-ring"
          style={{ animationDelay: "0.4s" }}
        />

        {/* Logo */}
        <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-card shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] animate-splash-logo">
          <img
            src={logo}
            alt="Kuakata Multimedia"
            className="h-16 w-16 object-contain"
            draggable={false}
          />
        </div>
      </div>

      {/* Loading dots */}
      <div className="absolute bottom-24 flex gap-1.5">
        <span className="h-2 w-2 rounded-full bg-primary animate-splash-dot" />
        <span
          className="h-2 w-2 rounded-full bg-primary animate-splash-dot"
          style={{ animationDelay: "0.15s" }}
        />
        <span
          className="h-2 w-2 rounded-full bg-primary animate-splash-dot"
          style={{ animationDelay: "0.3s" }}
        />
      </div>
    </div>
  );
}
