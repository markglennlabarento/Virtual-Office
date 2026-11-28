"use client";

import { useEffect, useRef, useState } from "react";
import type { OfficeScene } from "@/game/OfficeScene";
import type { OfficeRoomId } from "@/domain/office/officeRooms";

type Theme = "light" | "dark";

export default function OfficeCanvas({
  theme,
  room,
}: {
  theme: Theme;
  room: OfficeRoomId;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<OfficeScene | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let disposed = false;
    let game: import("phaser").Game | undefined;

    async function startGame() {
      try {
        const [{ default: Phaser }, { OfficeScene }] = await Promise.all([
          import("phaser"),
          import("@/game/OfficeScene"),
        ]);
        if (disposed || !mountRef.current) return;

        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: mountRef.current,
          width: 960,
          height: 600,
          backgroundColor: "#eee9df",
          antialias: false,
          pixelArt: true,
          roundPixels: true,
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: 960,
            height: 600,
          },
          scene: [new OfficeScene(room)],
        });
        game.events.once(Phaser.Core.Events.READY, () => {
          if (disposed || !game) return;
          sceneRef.current = game.scene.getScene("office") as OfficeScene;
          setStatus("ready");
        });
      } catch (error) {
        console.error("Could not start the office scene.", error);
        setStatus("error");
      }
    }

    void startGame();

    return () => {
      disposed = true;
      game?.destroy(true);
      sceneRef.current = null;
    };
  }, [room]);

  useEffect(() => {
    if (status !== "ready") return;
    sceneRef.current?.setTheme(theme);
  }, [status, theme]);

  return (
    <section className="game-area" aria-label="2D virtual office">
      <div className="game-mount" ref={mountRef} />
      {status !== "ready" && (
        <div
          className="game-message"
          role={status === "error" ? "alert" : "status"}
        >
          {status === "loading" ? (
            <p>Opening the office…</p>
          ) : (
            <>
              <p>The office couldn’t start.</p>
              <p>Refresh the page to try again.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
