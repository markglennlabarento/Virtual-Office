"use client";

import { useEffect, useRef, useState } from "react";

type Theme = "light" | "dark";

export default function Office3DCanvas({ theme }: { theme: Theme }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const officeRef = useRef<import("@/game/Office3D").Office3D | null>(null);
  const themeRef = useRef(theme);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    let disposed = false;
    let office: import("@/game/Office3D").Office3D | undefined;

    async function startOffice() {
      try {
        const { Office3D } = await import("@/game/Office3D");
        if (disposed || !mountRef.current) return;

        office = new Office3D(mountRef.current, themeRef.current);
        office.renderer.domElement.setAttribute(
          "aria-label",
          "Three-dimensional virtual office. Move with the arrow keys or W A S D.",
        );
        officeRef.current = office;
        setStatus("ready");
      } catch (error) {
        console.error("Could not start the 3D office.", error);
        setStatus("error");
      }
    }

    void startOffice();

    return () => {
      disposed = true;
      office?.destroy();
      officeRef.current = null;
    };
  }, []);

  useEffect(() => {
    officeRef.current?.setTheme(theme);
  }, [theme]);

  return (
    <section className="game-area" aria-label="3D virtual office">
      <div className="game-mount" ref={mountRef} />
      <div className="camera-controls" aria-label="3D camera controls">
        <p>Drag to rotate · Scroll to zoom</p>
        <div className="camera-button-row" role="group" aria-label="Rotate camera">
          <button
            type="button"
            aria-label="Rotate camera left"
            disabled={status !== "ready"}
            onClick={() => officeRef.current?.rotate(-1)}
          >
            ↶
          </button>
          <button
            type="button"
            aria-label="Rotate camera right"
            disabled={status !== "ready"}
            onClick={() => officeRef.current?.rotate(1)}
          >
            ↷
          </button>
          <button
            type="button"
            aria-label="Reset camera"
            disabled={status !== "ready"}
            onClick={() => officeRef.current?.resetCamera()}
          >
            ⌂
          </button>
        </div>
        <div className="camera-button-row" role="group" aria-label="Zoom camera">
          <button
            type="button"
            aria-label="Zoom in"
            disabled={status !== "ready"}
            onClick={() => officeRef.current?.zoom(0.85)}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            disabled={status !== "ready"}
            onClick={() => officeRef.current?.zoom(1.18)}
          >
            −
          </button>
        </div>
      </div>
      {status !== "ready" && (
        <div className="game-message" role={status === "error" ? "alert" : "status"}>
          {status === "loading" ? (
            <p>Opening the 3D office…</p>
          ) : (
            <>
              <p>The 3D office couldn’t start.</p>
              <p>Check that WebGL is supported, then refresh the page.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
