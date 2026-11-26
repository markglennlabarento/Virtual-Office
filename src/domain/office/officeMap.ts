export const OFFICE_SIZE = {
  width: 960,
  height: 600,
} as const;

export type Furniture = {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "desk" | "sofa" | "plant" | "table";
  label?: string;
};

export const FURNITURE: readonly Furniture[] = [
  { x: 220, y: 170, width: 152, height: 74, kind: "desk", label: "DESIGN" },
  { x: 584, y: 170, width: 152, height: 74, kind: "desk", label: "STUDIO" },
  { x: 220, y: 384, width: 152, height: 74, kind: "desk", label: "BUILD" },
  { x: 584, y: 384, width: 152, height: 74, kind: "desk", label: "FOCUS" },
  { x: 60, y: 287, width: 152, height: 74, kind: "desk", label: "SECRETARY" },
  { x: 748, y: 287, width: 152, height: 74, kind: "desk", label: "YOU" },
  { x: 22, y: 52, width: 54, height: 54, kind: "plant" },
  { x: 884, y: 52, width: 54, height: 54, kind: "plant" },
  { x: 22, y: 494, width: 54, height: 54, kind: "plant" },
  { x: 884, y: 494, width: 54, height: 54, kind: "plant" },
  { x: 419, y: 90, width: 122, height: 58, kind: "sofa" },
  { x: 419, y: 452, width: 122, height: 58, kind: "sofa" },
  { x: 443, y: 270, width: 74, height: 60, kind: "table" },
];

export function overlapsFurniture(
  x: number,
  y: number,
  radius: number,
): boolean {
  return FURNITURE.some(
    ({ x: left, y: top, width, height }) =>
      x + radius > left &&
      x - radius < left + width &&
      y + radius > top &&
      y - radius < top + height,
  );
}
