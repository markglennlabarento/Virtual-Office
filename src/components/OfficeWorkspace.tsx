"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  isOfficeRoomId,
  OFFICE_ROOMS,
  type OfficeRoomId,
} from "@/domain/office/officeRooms";

type Theme = "light" | "dark";
type ViewMode = "2d" | "3d";

const OfficeCanvas = dynamic(() => import("@/components/OfficeCanvas"), {
  ssr: false,
  loading: () => (
    <div className="game-message" role="status">
      Opening the office…
    </div>
  ),
});

const Office3DCanvas = dynamic(() => import("@/components/Office3DCanvas"), {
  ssr: false,
  loading: () => (
    <div className="game-message" role="status">
      Opening the 3D office…
    </div>
  ),
});

export default function OfficeWorkspace() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const [room, setRoom] = useState<OfficeRoomId>("workspace");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("office-theme");
    const savedView = window.localStorage.getItem("office-view");
    const savedRoom = window.localStorage.getItem("office-room");
    const storedTheme =
      savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark";
    const storedView: ViewMode = savedView === "3d" ? "3d" : "2d";
    const frame = window.requestAnimationFrame(() => {
      setTheme(storedTheme);
      setViewMode(storedView);
      if (isOfficeRoomId(savedRoom)) setRoom(savedRoom);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    window.localStorage.setItem("office-theme", nextTheme);
    setTheme(nextTheme);
  }

  function changeView(mode: ViewMode) {
    window.localStorage.setItem("office-view", mode);
    setViewMode(mode);
  }

  function changeRoom(value: string) {
    if (!isOfficeRoomId(value)) return;
    window.localStorage.setItem("office-room", value);
    setRoom(value);
  }

  return (
    <main className="office-app" data-theme={theme}>
      <header className="office-header">
        <h1>Virtual Office</h1>
        <p>Move with the arrow keys or W A S D</p>
        <label className="room-picker">
          <span>Room</span>
          <select
            value={room}
            onChange={(event) => changeRoom(event.target.value)}
            aria-label="Choose office room"
          >
            {OFFICE_ROOMS.map((officeRoom) => (
              <option key={officeRoom.id} value={officeRoom.id}>
                {officeRoom.name}
              </option>
            ))}
          </select>
        </label>
        <div className="view-toggle" role="group" aria-label="Office view">
          <button
            type="button"
            className={viewMode === "2d" ? "selected" : ""}
            onClick={() => changeView("2d")}
            aria-pressed={viewMode === "2d"}
          >
            2D
          </button>
          <button
            type="button"
            className={viewMode === "3d" ? "selected" : ""}
            onClick={() => changeView("3d")}
            aria-pressed={viewMode === "3d"}
          >
            3D
          </button>
        </div>
        <button
          className="theme-toggle"
          type="button"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          aria-pressed={theme === "dark"}
        >
          <span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span>
          <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
        </button>
      </header>
      {viewMode === "2d" ? (
        <OfficeCanvas key={room} theme={theme} room={room} />
      ) : (
        <Office3DCanvas key={room} theme={theme} room={room} />
      )}
    </main>
  );
}
