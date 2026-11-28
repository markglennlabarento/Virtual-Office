export const OFFICE_ROOMS = [
  { id: "workspace", name: "Main Workspace" },
  { id: "lobby", name: "Lobby / Reception" },
  { id: "meeting", name: "Meeting Room" },
  { id: "private", name: "Private Office" },
  { id: "focus", name: "Focus / Quiet Room" },
  { id: "breakout", name: "Breakout Room" },
  { id: "phone", name: "Phone Booth" },
  { id: "cafe", name: "Lounge / Cafe" },
  { id: "game", name: "Game Room" },
  { id: "auditorium", name: "Auditorium / Town Hall" },
  { id: "training", name: "Training / Classroom" },
  { id: "soc", name: "Security Operations Center" },
  { id: "ctf", name: "CTF Training Room" },
  { id: "cyberLounge", name: "Cyber Lounge" },
  { id: "server", name: "Server Room" },
] as const;

export type OfficeRoomId = (typeof OFFICE_ROOMS)[number]["id"];

export function isOfficeRoomId(value: string | null): value is OfficeRoomId {
  return OFFICE_ROOMS.some((room) => room.id === value);
}
