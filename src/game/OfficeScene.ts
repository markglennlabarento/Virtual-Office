import Phaser from "phaser";
import {
  FURNITURE,
  OFFICE_SIZE,
  overlapsFurniture,
} from "@/domain/office/officeMap";

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
    floor: 0x29302c,
    grid: 0x36403a,
    rug: 0x35463b,
    rugCenter: 0x405447,
    shadow: 0x101411,
    pot: 0x756957,
    leafDark: 0x4e7357,
    leaf: 0x67906b,
    leafLight: 0x7ca27b,
    desk: 0x806b53,
    deskTop: 0x9c8060,
    device: 0x303a36,
    screen: 0x45a9a9,
    keyboard: 0x48534c,
    label: "#e0c49f",
    sofa: 0x56675b,
    sofaSeat: 0x708171,
    sofaCenter: 0x485b4d,
    table: 0x80674d,
    tableTop: 0xa08661,
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
  private theme: OfficeTheme = "light";

  constructor() {
    super("office");
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
    this.createPlayer();

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
      !overlapsFurniture(x, y, PLAYER_RADIUS)
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
        graphics.fillCircle(x, y, 1.5);
      }
    }

    graphics.fillStyle(palette.rug);
    graphics.fillRoundedRect(392, 242, 176, 116, 22);
    graphics.fillStyle(palette.rugCenter);
    graphics.fillRoundedRect(399, 249, 162, 102, 18);

    for (const furniture of FURNITURE) {
      this.drawFurniture(furniture, palette);
    }
    this.drawGameStation(palette);
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

  private drawFurniture(furniture: (typeof FURNITURE)[number], palette: (typeof PALETTES)[OfficeTheme]) {
    const graphics = this.add.graphics();
    const { x, y, width, height, kind, label } = furniture;

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
        if (label !== "YOU") {
          this.createAIWorker(x + width / 2, y + height + 20, label, monitorScreen);
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

  private createAIWorker(
    x: number,
    y: number,
    name: string,
    monitorScreen: Phaser.GameObjects.Graphics,
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
      nextActionAt: 24000 + index * 2500,
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
