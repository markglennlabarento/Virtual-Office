import Phaser from "phaser";
import {
  type Furniture,
  FURNITURE,
  OFFICE_SIZE,
  overlapsFurniture,
} from "@/domain/office/officeMap";
import { OFFICE_ROOMS, type OfficeRoomId } from "@/domain/office/officeRooms";

const PLAYER_RADIUS = 14;
const PLAYER_SPEED = 210;
const ROBOT_DIALOGUE = [
  "Reviewing the brief...",
  "Writing code...",
  "Running a test...",
  "Almost there!",
] as const;
const HUMAN_DIALOGUE = [
  "Checking the latest update...",
  "Putting the finishing touches on...",
  "Ready for a quick break?",
  "That looks good!",
] as const;
const GAME_DIALOGUE = ["Your move!", "Nice play!", "That was close!", "One more round?"] as const;
const WATCH_DIALOGUE = ["I'm keeping score!", "Nice teamwork!", "Who's winning?", "That was close!"] as const;
const GAME_SPOTS = [
  { x: 410, y: 190 },
  { x: 445, y: 190 },
  { x: 480, y: 190 },
  { x: 515, y: 190 },
  { x: 550, y: 190 },
] as const;
const GAMEPLAYERS = new Set([1]);

const PALETTES = {
  light: {
    floor: 0xeee9df,
    grid: 0xe4ded2,
    rug: 0xd9e9dc,
    rugCenter: 0xc9dccd,
    shadow: 0x000000,
    pot: 0xd1c3aa,
    leafDark: 0x77977a,
    leaf: 0x8eaa85,
    leafLight: 0x9bb394,
    desk: 0xd5b996,
    deskTop: 0xe3c9a7,
    device: 0x555d5a,
    screen: 0x75d4e5,
    keyboard: 0x6a726d,
    label: "#8a7560",
    sofa: 0x88978d,
    sofaSeat: 0xa6b1a3,
    sofaCenter: 0x77887c,
    table: 0xb79770,
    tableTop: 0xd7bd97,
    avatarShadow: 0x3d4c43,
    avatar: 0x667f9a,
    skin: 0xf0c9a8,
    hair: 0x51483e,
    nameBackground: "#fffdf8",
    name: "#52675a",
  },
  dark: {
    floor: 0x1b2b3c,
    grid: 0x2b4052,
    rug: 0x24414a,
    rugCenter: 0x2a5457,
    shadow: 0x111923,
    pot: 0x945d3d,
    leafDark: 0x32734f,
    leaf: 0x4d9860,
    leafLight: 0x78b76c,
    desk: 0x8c5838,
    deskTop: 0xc47e49,
    device: 0x243445,
    screen: 0x42c7bb,
    keyboard: 0x405466,
    label: "#ffd18b",
    sofa: 0x28616a,
    sofaSeat: 0x38858a,
    sofaCenter: 0x24525c,
    table: 0x995f37,
    tableTop: 0xc9894d,
    avatarShadow: 0x141b17,
    avatar: 0x7595b4,
    skin: 0xe8b997,
    hair: 0x352f2b,
    nameBackground: "#303a33",
    name: "#d8e6d5",
  },
} as const;

type OfficeTheme = keyof typeof PALETTES;
type WorkerState = "working" | "walkingToGame" | "playing" | "walkingToDesk";
type Point = { x: number; y: number };

type AIWorker = {
  isHuman: boolean;
  leftHand: Phaser.GameObjects.Arc;
  rightHand: Phaser.GameObjects.Arc;
  feet: Phaser.GameObjects.Ellipse[];
  container: Phaser.GameObjects.Container;
  gamepad: Phaser.GameObjects.Container;
  monitorScreen: Phaser.GameObjects.Graphics;
  home: Point;
  gameRoute: Point[];
  route: Point[];
  state: WorkerState;
  nextActionAt: number;
  phase: number;
  dialogue: Phaser.GameObjects.Text;
  dialogueIndex: number;
  nextDialogueAt: number;
};

export class OfficeScene extends Phaser.Scene {
  private player?: Phaser.GameObjects.Container;
  private readonly aiWorkers: AIWorker[] = [];
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private movementKeys?: Record<"w" | "a" | "s" | "d", Phaser.Input.Keyboard.Key>;
  private roomFurniture: Furniture[] = [];
  private theme: OfficeTheme = "light";
  private readonly room: OfficeRoomId;

  constructor(room: OfficeRoomId = "workspace") {
    super("office");
    this.room = room;
  }

  setTheme(theme: OfficeTheme) {
    if (this.theme === theme) return;
    this.theme = theme;

    if (!this.sys.isActive()) return;

    const position = this.player
      ? { x: this.player.x, y: this.player.y }
      : { x: 480, y: 402 };
    this.children.removeAll(true);
    this.aiWorkers.length = 0;
    this.drawRoom();
    this.createPlayer(position.x, position.y);
  }

  create() {
    this.drawRoom();
    this.createPlayer(480, this.room === "server" ? 550 : 402);

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.movementKeys = {
        w: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        a: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        s: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        d: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }

    this.scale.on(Phaser.Scale.Events.RESIZE, this.centerCamera, this);
    this.centerCamera();
  }

  update(_time: number, delta: number) {
    this.updateAIWorkers(_time, delta);

    if (!this.player || !this.cursors || !this.movementKeys) return;

    const horizontal =
      Number(this.cursors.right.isDown || this.movementKeys.d.isDown) -
      Number(this.cursors.left.isDown || this.movementKeys.a.isDown);
    const vertical =
      Number(this.cursors.down.isDown || this.movementKeys.s.isDown) -
      Number(this.cursors.up.isDown || this.movementKeys.w.isDown);

    if (horizontal === 0 && vertical === 0) return;

    const distance = (PLAYER_SPEED * Math.min(delta, 50)) / 1000;
    const magnitude = Math.hypot(horizontal, vertical);
    const nextX = this.player.x + (horizontal / magnitude) * distance;
    const nextY = this.player.y + (vertical / magnitude) * distance;

    if (this.canStandAt(nextX, this.player.y)) this.player.x = nextX;
    if (this.canStandAt(this.player.x, nextY)) this.player.y = nextY;
  }

  private updateAIWorkers(time: number, delta: number) {
    for (const [index, worker] of this.aiWorkers.entries()) {
      if (worker.state === "working" && time >= worker.nextActionAt) {
        worker.state = "walkingToGame";
        worker.route = [...worker.gameRoute];
        worker.nextDialogueAt = time;
      } else if (worker.state === "playing" && time >= worker.nextActionAt) {
        worker.state = "walkingToDesk";
        worker.route = [...worker.gameRoute.slice(0, -1)].reverse();
        worker.route.push(worker.home);
        worker.nextDialogueAt = time;
      }

      const step = (85 * Math.min(delta, 50)) / 1000;
      const destination = worker.route[0];
      if (destination) {
        const dx = destination.x - worker.container.x;
        const dy = destination.y - worker.container.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= step) {
          worker.container.setPosition(destination.x, destination.y);
          worker.route.shift();
        } else {
          worker.container.x += (dx / distance) * step;
          worker.container.y += (dy / distance) * step;
        }
        worker.container.setDepth(worker.container.y);
      }

      if (worker.state === "walkingToGame" && worker.route.length === 0) {
        worker.state = "playing";
        worker.nextActionAt = time + 11000;
        worker.nextDialogueAt = time;
      } else if (worker.state === "walkingToDesk" && worker.route.length === 0) {
        worker.state = "working";
        worker.nextActionAt = time + 30000 + worker.phase * 1000;
        worker.nextDialogueAt = time;
      }

      const playing = worker.state === "playing";
      const walking = worker.state.startsWith("walking");
      worker.monitorScreen.setVisible(worker.state === "working");
      const typing = Math.sin(time * 0.018 + worker.phase) * 2;
      worker.leftHand.y = playing ? 10 + typing : 7 + typing;
      worker.rightHand.y = playing ? 10 - typing : 7 - typing;
      const stride = walking ? Math.sin(time * 0.02 + worker.phase) * 2 : 0;
      worker.feet[0].y = 14 + stride;
      worker.feet[1].y = 14 - stride;
      worker.gamepad.setVisible(playing && (GAMEPLAYERS.has(index) || worker.isHuman));

      if (time >= worker.nextDialogueAt) {
        const lines =
          worker.state === "working"
              ? worker.isHuman
                ? HUMAN_DIALOGUE
                : ROBOT_DIALOGUE
            : worker.state === "playing"
              ? GAMEPLAYERS.has(index)
                ? GAME_DIALOGUE
                : WATCH_DIALOGUE
              : ["Taking a break...", "Meet you at the screen!"];
        worker.dialogueIndex = (worker.dialogueIndex + 1) % lines.length;
        worker.dialogue.setText(lines[worker.dialogueIndex]);
        worker.nextDialogueAt = time + 2600;
      }
    }
  }

  private canStandAt(x: number, y: number) {
    return (
      x - PLAYER_RADIUS >= 46 &&
      x + PLAYER_RADIUS <= OFFICE_SIZE.width - 46 &&
      y - PLAYER_RADIUS >= 48 &&
      y + PLAYER_RADIUS <= OFFICE_SIZE.height - 42 &&
      !(this.room === "workspace"
        ? overlapsFurniture(x, y, PLAYER_RADIUS)
        : this.roomFurniture.some(
            ({ x: left, y: top, width, height }) =>
              x + PLAYER_RADIUS > left &&
              x - PLAYER_RADIUS < left + width &&
              y + PLAYER_RADIUS > top &&
              y - PLAYER_RADIUS < top + height,
          ))
    );
  }

  private drawRoom() {
    const palette = PALETTES[this.theme];
    const graphics = this.add.graphics();
    graphics.fillStyle(palette.floor);
    graphics.fillRect(0, 0, OFFICE_SIZE.width, OFFICE_SIZE.height);

    graphics.fillStyle(palette.grid, 0.6);
    for (let x = 56; x < OFFICE_SIZE.width - 40; x += 48) {
      for (let y = 56; y < OFFICE_SIZE.height - 40; y += 48) {
        graphics.fillRect(x - 2, y - 2, 4, 4);
      }
    }

    if (this.room === "workspace") {
      graphics.fillStyle(palette.rug);
      graphics.fillRoundedRect(392, 242, 176, 116, 22);
      graphics.fillStyle(palette.rugCenter);
      graphics.fillRoundedRect(399, 249, 162, 102, 18);
      for (const furniture of FURNITURE) {
        this.drawFurniture(furniture, palette);
      }
      this.drawGameStation(palette);
      return;
    }

    graphics.lineStyle(5, palette.rug, 0.9);
    graphics.strokeRect(28, 28, OFFICE_SIZE.width - 56, OFFICE_SIZE.height - 56);
    graphics.fillStyle(palette.rug, 0.82);
    graphics.fillRoundedRect(305, 36, 350, 54, 8);
    this.add.text(480, 62, OFFICE_ROOMS.find(({ id }) => id === this.room)?.name ?? "", {
      color: palette.label,
      fontFamily: "Arial, sans-serif",
      fontSize: "20px",
      fontStyle: "bold",
      letterSpacing: 1.5,
    }).setOrigin(0.5);
    this.drawAlternativeRoom(palette);
  }

  private drawAlternativeRoom(palette: (typeof PALETTES)[OfficeTheme]) {
    const desk = (x: number, y: number, label?: string): Furniture => ({
      x, y, width: 152, height: 74, kind: "desk", label,
    });
    const sofa = (x: number, y: number): Furniture => ({
      x, y, width: 140, height: 64, kind: "sofa",
    });
    const table = (x: number, y: number): Furniture => ({
      x, y, width: 106, height: 76, kind: "table",
    });
    const plant = (x: number, y: number): Furniture => ({
      x, y, width: 54, height: 54, kind: "plant",
    });
    let furniture: Furniture[] = [];

    switch (this.room) {
      case "lobby":
        furniture = [desk(404, 142, "RECEPTION"), sofa(210, 230), sofa(610, 230), table(427, 322), plant(100, 440), plant(806, 440)];
        break;
      case "meeting":
        furniture = [table(427, 244), desk(208, 178), desk(600, 178), desk(208, 344), desk(600, 344)];
        break;
      case "private":
        furniture = [desk(404, 188, "PRIVATE"), sofa(220, 350), plant(790, 155)];
        break;
      case "focus":
        furniture = [desk(404, 165, "QUIET"), desk(220, 340), desk(600, 340)];
        break;
      case "breakout":
        furniture = [desk(404, 110, "HOST"), sofa(190, 188), sofa(630, 188), sofa(190, 340), sofa(630, 340), table(427, 270)];
        break;
      case "phone":
        furniture = [desk(404, 208, "CALL")];
        break;
      case "cafe":
        furniture = [desk(404, 110, "CAFE"), sofa(130, 180), sofa(690, 180), table(270, 320), table(580, 320), plant(70, 430), plant(836, 430)];
        break;
      case "game":
        furniture = [desk(404, 110, "HOST"), sofa(180, 335), sofa(640, 335), table(427, 260)];
        break;
      case "auditorium": {
        furniture = [desk(80, 145, "HOST")];
        break;
      }
      case "training":
        furniture = [desk(180, 168), desk(404, 168), desk(628, 168), desk(180, 315), desk(404, 315), desk(628, 315)];
        break;
      case "soc":
        furniture = [desk(170, 190, "MONITOR"), desk(404, 190, "INCIDENT"), desk(638, 190, "ANALYSIS"), desk(404, 355, "OPS")];
        break;
      case "ctf":
        furniture = [desk(190, 190, "TEAM 1"), desk(630, 190, "TEAM 2"), desk(190, 350, "TEAM 3"), desk(630, 350, "TEAM 4")];
        break;
      case "cyberLounge":
        furniture = [desk(80, 260, "HOST"), sofa(180, 195), sofa(640, 195), sofa(180, 360), sofa(640, 360), table(427, 275)];
        break;
      case "server":
        furniture = [90, 300, 510, 720].flatMap((x) => [
          { x, y: 125, width: 150, height: 145, kind: "rack" as const },
          { x, y: 315, width: 150, height: 145, kind: "rack" as const },
        ]);
        break;
      case "workspace":
        return;
    }

    this.roomFurniture = furniture;
    for (const item of furniture) {
      this.drawFurniture(item, palette, item.kind === "desk");
    }
    if (this.room === "game" || this.room === "training" || this.room === "soc" || this.room === "ctf") {
      this.drawGameStation(palette);
    }
    if (this.room === "auditorium") {
      const stage = this.add.graphics();
      stage.fillStyle(palette.desk);
      stage.fillRoundedRect(350, 108, 260, 34, 8);
      stage.fillStyle(palette.screen);
      stage.fillRoundedRect(385, 112, 190, 8, 3);
      stage.fillStyle(palette.sofa);
      for (let row = 0; row < 4; row += 1) {
        for (let column = 0; column < 7; column += 1) {
          const x = 170 + column * 104;
          const y = 206 + row * 64;
          stage.fillRoundedRect(x, y, 42, 22, 5);
          stage.fillRoundedRect(x + 4, y + 20, 34, 10, 3);
        }
      }
    }
    if (this.room === "phone") {
      const booth = this.add.graphics();
      booth.lineStyle(8, palette.sofa);
      booth.strokeRect(340, 145, 280, 300);
      booth.fillStyle(palette.screen, 0.35);
      booth.fillRect(348, 153, 12, 284);
    }
  }

  private drawGameStation(palette: (typeof PALETTES)[OfficeTheme]) {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x252d2b);
    graphics.fillRoundedRect(421, 24, 118, 62, 7);
    graphics.fillStyle(0x516e72);
    graphics.fillRoundedRect(426, 29, 108, 52, 4);
    graphics.fillStyle(0x8dd9db, 0.8);
    graphics.fillRect(430, 33, 48, 44);
    graphics.fillStyle(0xefa971, 0.85);
    graphics.fillRect(482, 33, 48, 44);
    graphics.lineStyle(2, 0xfff0cf, 0.8);
    graphics.lineBetween(480, 34, 480, 77);
    graphics.fillStyle(0x303a36);
    graphics.fillRoundedRect(478, 87, 4, 17, 2);
    graphics.fillStyle(0x252d2b);
    graphics.fillRoundedRect(461, 102, 38, 5, 2);
    graphics.fillStyle(0xe7e9e4);
    graphics.fillRoundedRect(552, 53, 14, 29, 6);
    graphics.fillStyle(0x273b3e);
    graphics.fillRoundedRect(557, 56, 4, 23, 2);
    graphics.fillStyle(0x80e0d1);
    graphics.fillCircle(559, 75, 1.5);
    this.add.text(559, 86, "PS5", {
      color: palette.label,
      fontFamily: "Arial, sans-serif",
      fontSize: "7px",
      fontStyle: "bold",
    }).setOrigin(0.5);
  }

  private drawFurniture(
    furniture: Furniture,
    palette: (typeof PALETTES)[OfficeTheme],
    createWorkers = true,
  ) {
    const graphics = this.add.graphics();
    const { x, y, width, height, kind, label } = furniture;

    if (kind === "rack") {
      graphics.fillStyle(palette.shadow, 0.22);
      graphics.fillRoundedRect(x + 5, y + 7, width, height, 7);
      graphics.fillStyle(0x18232c);
      graphics.fillRoundedRect(x, y, width, height, 7);
      graphics.lineStyle(3, 0x52636c, 0.9);
      graphics.strokeRoundedRect(x + 4, y + 4, width - 8, height - 8, 5);
      for (let unit = 0; unit < 5; unit += 1) {
        const unitY = y + 12 + unit * 25;
        graphics.fillStyle(0x263844);
        graphics.fillRoundedRect(x + 12, unitY, width - 24, 20, 3);
        graphics.fillStyle(0x71818a);
        for (let vent = 0; vent < 5; vent += 1) {
          graphics.fillRect(x + 19 + vent * 8, unitY + 5, 3, 10);
        }
        graphics.fillStyle(unit % 2 === 0 ? 0x4fe0c0 : 0x61bfff);
        graphics.fillCircle(x + width - 21, unitY + 10, 3);
        graphics.fillStyle(0xf0bb62);
        graphics.fillCircle(x + width - 32, unitY + 10, 2);
      }
      return;
    }

    if (kind === "plant") {
      graphics.fillStyle(palette.pot);
      graphics.fillCircle(x + width / 2, y + height / 2 + 11, 23);
      graphics.fillStyle(palette.leafDark);
      graphics.fillCircle(x + width / 2 - 11, y + height / 2, 13);
      graphics.fillStyle(palette.leaf);
      graphics.fillCircle(x + width / 2 + 10, y + height / 2 - 8, 15);
      graphics.fillStyle(palette.leafLight);
      graphics.fillCircle(x + width / 2 + 2, y + height / 2 + 8, 14);
      return;
    }

    if (kind === "desk") {
      graphics.fillStyle(palette.shadow, 0.08);
      graphics.fillRoundedRect(x, y + 6, width, height, 12);
      graphics.fillStyle(palette.desk);
      graphics.fillRoundedRect(x, y, width, height, 12);
      graphics.fillStyle(palette.deskTop);
      graphics.fillRoundedRect(x + 4, y + 4, width - 8, height - 12, 9);
      graphics.fillStyle(palette.device);
      graphics.fillRoundedRect(x + width / 2 - 22, y + 12, 44, 30, 5);
      const monitorScreen = this.add.graphics();
      monitorScreen.fillStyle(palette.screen);
      monitorScreen.fillRoundedRect(x + width / 2 - 18, y + 15, 36, 22, 3);
      monitorScreen.fillStyle(0xd8fbff, 0.8);
      monitorScreen.fillRect(x + width / 2 - 14, y + 19, 10, 2);
      monitorScreen.fillRect(x + width / 2 - 14, y + 24, 21, 1);
      monitorScreen.fillRect(x + width / 2 - 14, y + 28, 16, 1);
      graphics.fillStyle(palette.keyboard);
      graphics.fillRoundedRect(x + width / 2 - 13, y + 45, 26, 4, 2);
      if (label) {
        this.add
          .text(x + width / 2, y + height - 2, label, {
            color: palette.label,
            fontFamily: "Arial, sans-serif",
            fontSize: "8px",
            fontStyle: "bold",
            letterSpacing: 1.5,
          })
          .setOrigin(0.5, 1);
        if (createWorkers && label !== "YOU") {
          this.createAIWorker(
            x + width / 2,
            y + height + 20,
            label,
            monitorScreen,
            this.room !== "workspace",
          );
        }
      }
      return;
    }

    if (kind === "sofa") {
      graphics.fillStyle(palette.shadow, 0.08);
      graphics.fillRoundedRect(x, y + 5, width, height, 16);
      graphics.fillStyle(palette.sofa);
      graphics.fillRoundedRect(x, y, width, height, 16);
      graphics.fillStyle(palette.sofaSeat);
      graphics.fillRoundedRect(x + 8, y + 7, width - 16, height - 14, 11);
      graphics.fillStyle(palette.sofaCenter);
      graphics.fillRoundedRect(x + 48, y + 8, 26, height - 16, 8);
      return;
    }

    graphics.fillStyle(palette.shadow, 0.08);
    graphics.fillEllipse(x + width / 2, y + height / 2 + 5, width, height);
    graphics.fillStyle(palette.table);
    graphics.fillEllipse(x + width / 2, y + height / 2, width, height);
    graphics.fillStyle(palette.tableTop);
    graphics.fillEllipse(x + width / 2, y + height / 2 - 3, width - 10, height - 10);
    if (createWorkers) {
      const globeX = x + width / 2;
      const globeY = y + height / 2 - 3;
      graphics.fillStyle(0x54d8ff, 0.12);
      graphics.fillCircle(globeX, globeY, 26);
      graphics.fillStyle(0x54d8ff, 0.2);
      graphics.fillCircle(globeX, globeY, 22);
      graphics.fillStyle(0x2679a6);
      graphics.fillCircle(globeX, globeY, 18);
      graphics.fillStyle(0x74a96b);
      graphics.fillEllipse(globeX - 6, globeY - 5, 13, 9);
      graphics.fillEllipse(globeX + 6, globeY + 5, 9, 13);
      graphics.lineStyle(1, 0xd7e9e3, 0.72);
      graphics.strokeCircle(globeX, globeY, 18);
      graphics.strokeEllipse(globeX, globeY, 11, 34);
    }
  }

  private createAIWorker(
    x: number,
    y: number,
    name: string,
    monitorScreen: Phaser.GameObjects.Graphics,
    stationary = false,
  ) {
    const isHuman = name === "SECRETARY";
    const shadow = this.add.ellipse(0, 15, 30, 9, 0x263c3a, 0.16);
    const feet = [
      this.add.ellipse(-5, 14, 9, 5, isHuman ? 0x543b50 : 0x687a77),
      this.add.ellipse(5, 14, 9, 5, isHuman ? 0x543b50 : 0x687a77),
    ];
    const body = this.add
      .rectangle(0, 3, 21, 19, isHuman ? 0xb85f83 : 0xaab8b5)
      .setStrokeStyle(2, isHuman ? 0x8e4162 : 0x778987);
    const skirt = this.add
      .rectangle(0, 10, 20, 9, 0x55384e)
      .setStrokeStyle(1, 0x3e2a3b)
      .setVisible(isHuman);
    const neck = this.add.rectangle(0, -8, 7, 5, 0x788987);
    const head = this.add
      .rectangle(0, -17, 22, 18, 0xc2ceca)
      .setStrokeStyle(2, 0x788987);
    head.setVisible(!isHuman);
    const hairBack = this.add.ellipse(0, -2, 28, 48, 0x51483e).setVisible(isHuman);
    const leftLock = this.add.ellipse(-9, 0, 9, 44, 0x51483e).setVisible(isHuman);
    const rightLock = this.add.ellipse(9, 0, 9, 44, 0x51483e).setVisible(isHuman);
    const humanFace = this.add.circle(0, -17, 9, 0xf0c9a8).setVisible(isHuman);
    const humanHair = this.add.ellipse(0, -22, 20, 9, 0x51483e).setVisible(isHuman);
    const lips = this.add.ellipse(0, -13, 4, 1.8, 0xa84b66).setVisible(isHuman);
    const visor = this.add.rectangle(0, -17, 16, 7, 0x32484a).setVisible(!isHuman);
    const leftEye = this.add.circle(-4, -17, 1.5, 0x80e0d1).setVisible(!isHuman);
    const rightEye = this.add.circle(4, -17, 1.5, 0x80e0d1).setVisible(!isHuman);
    const antenna = this.add.graphics().setVisible(!isHuman);
    antenna.lineStyle(2, 0x788987);
    antenna.lineBetween(0, -26, 0, -31);
    const antennaLight = this.add.circle(0, -32, 2.5, 0x80e0d1).setVisible(!isHuman);
    const leftArm = this.add
      .line(-10, -1, 0, 0, -4, 8, 0x778987, 1)
      .setOrigin(0, 0);
    const rightArm = this.add
      .line(10, -1, 0, 0, 4, 8, 0x778987, 1)
      .setOrigin(0, 0);
    const leftHand = this.add.circle(-13, 7, 3.5, isHuman ? 0xf0c9a8 : 0x80a8a0);
    const rightHand = this.add.circle(13, 7, 3.5, isHuman ? 0xf0c9a8 : 0x80a8a0);
    const nameTag = this.add
      .text(0, 27, isHuman ? "FEMALE SECRETARY" : `AI · ${name}`, {
        backgroundColor: "#fffdf8",
        color: "#52675a",
        fontFamily: "Arial, sans-serif",
        fontSize: "7px",
        fontStyle: "bold",
        padding: { x: 5, y: 3 },
      })
      .setOrigin(0.5);
    const initialDialogue = (isHuman ? HUMAN_DIALOGUE : ROBOT_DIALOGUE)[
      this.aiWorkers.length % ROBOT_DIALOGUE.length
    ];
    const dialogue = this.add
      .text(0, -53, initialDialogue, {
        backgroundColor: "#fffdf8",
        color: "#52675a",
        fontFamily: "Arial, sans-serif",
        fontSize: "8px",
        fontStyle: "bold",
        padding: { x: 7, y: 5 },
      })
      .setOrigin(0.5);

    const gamepad = this.add.container(0, 12, [
      this.add.rectangle(0, 0, 22, 8, 0x303a36).setStrokeStyle(1, 0x202624),
      this.add.rectangle(-6, 0, 5, 2, 0x80e0d1),
      this.add.circle(6, -1, 1.4, 0xe8a17c),
      this.add.circle(8, 2, 1.4, 0x80e0d1),
    ]);
    gamepad.setVisible(false);
    const container = this.add
      .container(x, y, [
        shadow,
        ...feet,
        hairBack,
        body,
        skirt,
        neck,
        head,
        leftLock,
        rightLock,
        humanFace,
        humanHair,
        lips,
        ...(!isHuman ? [visor, leftEye, rightEye, antenna, antennaLight] : []),
        leftArm,
        rightArm,
        leftHand,
        rightHand,
        gamepad,
        dialogue,
        nameTag,
      ])
      .setDepth(y);
    const index = this.aiWorkers.length;
    const home = { x, y };
    const gameSpot = GAME_SPOTS[index % GAME_SPOTS.length] ?? GAME_SPOTS[0];
    const leftSide = home.x < OFFICE_SIZE.width / 2;
    const gameSide = gameSpot.x < OFFICE_SIZE.width / 2;
    const innerX = leftSide ? 400 : 560;
    const gameLaneX = gameSide ? 420 : 560;
    const gameRoute =
      home.y < OFFICE_SIZE.height / 2
        ? [
            { x: home.x, y: 276 },
            { x: innerX, y: 276 },
            { x: innerX, y: 190 },
            gameSpot,
          ]
        : [
            { x: home.x, y: 535 },
            { x: innerX, y: 535 },
            { x: innerX, y: 365 },
            { x: gameLaneX, y: 365 },
            { x: gameLaneX, y: 190 },
            gameSpot,
          ];
    this.aiWorkers.push({
      isHuman,
      leftHand,
      rightHand,
      feet,
      container,
      gamepad,
      monitorScreen,
      home,
      gameRoute,
      route: [],
      state: "working",
      nextActionAt: stationary ? Number.POSITIVE_INFINITY : 24000 + index * 2500,
      phase: index * 1.7,
      dialogue,
      dialogueIndex: index % ROBOT_DIALOGUE.length,
      nextDialogueAt: 2600 + index * 700,
    });
  }

  private createPlayer(x = 480, y = 402) {
    const palette = PALETTES[this.theme];
    const shadow = this.add.ellipse(0, 13, 30, 12, palette.avatarShadow, 0.18);
    const body = this.add.ellipse(0, 1, 25, 27, palette.avatar);
    const face = this.add.circle(0, -8, 9, palette.skin);
    const hair = this.add.ellipse(0, -13, 18, 8, palette.hair);
    const name = this.add
      .text(0, 24, "YOU", {
        backgroundColor: palette.nameBackground,
        color: palette.name,
        fontFamily: "Arial, sans-serif",
        fontSize: "9px",
        fontStyle: "bold",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5);

    this.player = this.add
      .container(x, y, [shadow, body, face, hair, name])
      .setDepth(10);
  }

  private centerCamera() {
    this.cameras.main.centerOn(OFFICE_SIZE.width / 2, OFFICE_SIZE.height / 2);
  }
}
