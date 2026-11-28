import * as THREE from "three";
import { OFFICE_ROOMS, type OfficeRoomId } from "@/domain/office/officeRooms";

type OfficeTheme = "light" | "dark";

type ThemeMaterial = {
  material: THREE.MeshStandardMaterial;
  light: number;
  dark: number;
};

type TypingWorker = {
  robot: THREE.Group;
  gamepad: THREE.Group;
  monitorScreen: THREE.Mesh;
  isPlayer: boolean;
  isHuman: boolean;
  arms: THREE.Group[];
  legs: THREE.Group[];
  keyCaps: Array<{ mesh: THREE.Mesh; y: number; phase: number }>;
  home: THREE.Vector3;
  gameRoute: THREE.Vector3[];
  route: THREE.Vector3[];
  state: WorkerState;
  nextActionAt: number;
  phase: number;
  dialogue: THREE.Sprite;
  dialogueContext: CanvasRenderingContext2D;
  dialogueTexture: THREE.CanvasTexture;
  dialogueText: string;
  dialogueIndex: number;
  nextDialogueAt: number;
};

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
const GAMEPLAYERS = new Set([1]);
const GAME_SPOTS = [-1.4, -0.7, 0, 0.7, 1.4] as const;

type WorkerState = "working" | "walkingToGame" | "playing" | "walkingToDesk";

const PALETTE = {
  light: {
    background: 0xe8e5dc,
    floor: 0xd8d1c2,
    wall: 0xece7dc,
    accentWall: 0xd8dfd3,
    wood: 0xc6a881,
    woodLight: 0xe0c8a4,
    upholstery: 0x7d9282,
    upholsteryLight: 0xa2b19d,
    green: 0x688568,
    greenLight: 0x8eaa85,
    pot: 0xc9b89f,
    metal: 0x48534f,
    screen: 0x9db7ac,
    rug: 0xc9d8c8,
    table: 0xb79770,
    tableTop: 0xd7bd97,
    avatar: 0x667f9a,
    skin: 0xf0c9a8,
    hair: 0x51483e,
    shadow: 0x40473f,
    window: 0xa9c6c7,
  },
  dark: {
    background: 0x172532,
    floor: 0x243546,
    wall: 0x263645,
    accentWall: 0x304b58,
    wood: 0x70472e,
    woodLight: 0xb87943,
    upholstery: 0x28616a,
    upholsteryLight: 0x43888a,
    green: 0x32734f,
    greenLight: 0x63a96a,
    pot: 0x845239,
    metal: 0x243445,
    screen: 0x42c7bb,
    rug: 0x2b5057,
    table: 0x995f37,
    tableTop: 0xc9894d,
    avatar: 0x7595b4,
    skin: 0xe8b997,
    hair: 0x352f2b,
    shadow: 0x111713,
    window: 0x49636a,
  },
} as const;

export class Office3D {
  readonly renderer: THREE.WebGLRenderer;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  private readonly keys = new Set<string>();
  private readonly themeMaterials: ThemeMaterial[] = [];
  private readonly collisions: Array<[number, number, number, number]> = [];
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly textures = new Set<THREE.Texture>();
  private readonly typingWorkers: TypingWorker[] = [];
  private readonly resizeObserver: ResizeObserver;
  private readonly player: THREE.Group;
  private readonly room: OfficeRoomId;
  private readonly onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
      event.preventDefault();
      this.keys.add(key);
    }
  };
  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.key.toLowerCase());
  };
  private readonly onBlur = () => this.keys.clear();
  private readonly orbitTarget = new THREE.Vector3(0, 0.6, 0);
  private orbitRadius = 27.2;
  private orbitAngle = Math.atan2(11, 16);
  private orbitElevation = Math.atan2(15, Math.hypot(11, 16));
  private dragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.dragging = true;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };
  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.dragging) return;
    const deltaX = event.clientX - this.lastPointerX;
    const deltaY = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.orbitAngle -= deltaX * 0.008;
    this.orbitElevation = THREE.MathUtils.clamp(
      this.orbitElevation + deltaY * 0.004,
      0.28,
      1.2,
    );
    this.updateCamera();
  };
  private readonly onPointerUp = () => {
    this.dragging = false;
  };
  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.zoom(event.deltaY > 0 ? 1.08 : 0.92);
  };
  private frameId = 0;
  private lastFrameTime = 0;
  private theme: OfficeTheme;

  constructor(
    private readonly container: HTMLElement,
    theme: OfficeTheme,
    room: OfficeRoomId = "workspace",
  ) {
    this.theme = theme;
    this.room = room;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);

    this.updateCamera();

    this.addLighting();
    this.buildRoom();
    this.player = this.buildPlayer();
    this.player.position.set(0, 0, 2.3);
    this.scene.add(this.player);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.addEventListener("pointermove", this.onPointerMove);
    this.renderer.domElement.addEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.addEventListener("pointercancel", this.onPointerUp);
    this.renderer.domElement.addEventListener("wheel", this.onWheel, { passive: false });
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.container);
    this.resize();
    this.animate();
  }

  setTheme(theme: OfficeTheme) {
    if (this.theme === theme) return;
    this.theme = theme;
    const palette = PALETTE[theme];
    this.scene.background = new THREE.Color(palette.background);
    this.scene.fog = new THREE.Fog(palette.background, 24, 46);
    for (const entry of this.themeMaterials) {
      entry.material.color.setHex(theme === "light" ? entry.light : entry.dark);
    }
    for (const worker of this.typingWorkers) {
      this.drawDialogue(worker.dialogueContext, worker.dialogueText);
      worker.dialogueTexture.needsUpdate = true;
    }
    this.renderer.toneMappingExposure = theme === "light" ? 1.15 : 0.85;
  }

  zoom(factor: number) {
    this.orbitRadius = THREE.MathUtils.clamp(this.orbitRadius * factor, 12, 36);
    this.updateCamera();
  }

  rotate(direction: -1 | 1) {
    this.orbitAngle += direction * (Math.PI / 10);
    this.updateCamera();
  }

  resetCamera() {
    this.orbitRadius = 27.2;
    this.orbitAngle = Math.atan2(11, 16);
    this.orbitElevation = Math.atan2(15, Math.hypot(11, 16));
    this.updateCamera();
  }

  destroy() {
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.renderer.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.removeEventListener("pointercancel", this.onPointerUp);
    this.renderer.domElement.removeEventListener("wheel", this.onWheel);
    this.renderer.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.container.removeChild(this.renderer.domElement);
  }

  private readonly resize = () => {
    const { clientWidth, clientHeight } = this.container;
    if (!clientWidth || !clientHeight) return;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
  };

  private updateCamera() {
    const horizontalRadius = this.orbitRadius * Math.cos(this.orbitElevation);
    this.camera.position.set(
      this.orbitTarget.x + Math.sin(this.orbitAngle) * horizontalRadius,
      this.orbitTarget.y + this.orbitRadius * Math.sin(this.orbitElevation),
      this.orbitTarget.z + Math.cos(this.orbitAngle) * horizontalRadius,
    );
    this.camera.lookAt(this.orbitTarget);
  }

  private addLighting() {
    this.scene.background = new THREE.Color(PALETTE[this.theme].background);
    this.scene.fog = new THREE.Fog(PALETTE[this.theme].background, 24, 46);
    this.scene.add(new THREE.HemisphereLight(0xfff8e9, 0x73796c, 1.8));

    const keyLight = new THREE.DirectionalLight(0xffedcf, 2.6);
    keyLight.position.set(-5, 12, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.radius = 3;
    keyLight.shadow.camera.left = -14;
    keyLight.shadow.camera.right = 14;
    keyLight.shadow.camera.top = 12;
    keyLight.shadow.camera.bottom = -12;
    keyLight.shadow.bias = -0.0002;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd8e8ff, 1.1);
    fillLight.position.set(8, 7, -5);
    this.scene.add(fillLight);
  }

  private buildRoom() {
    const floor = this.material(0xd8d1c2, 0x303832, 0.92);
    const wall = this.material(0xece7dc, 0x353c37, 0.95);
    const accentWall = this.material(0xd8dfd3, 0x414c43, 0.9);
    const rug = this.material(0xc9d8c8, 0x3c5041, 0.98);


    const floorMesh = this.box(22, 0.24, 14, floor);
    floorMesh.position.set(0, -0.12, 0);
    floorMesh.receiveShadow = true;

    const grid = new THREE.GridHelper(22, 22, 0x777d70, 0x9a9a89);
    grid.position.y = 0.012;
    if (Array.isArray(grid.material)) {
      for (const material of grid.material) {
        material.transparent = true;
        material.opacity = this.theme === "light" ? 0.12 : 0.08;
      }
    }
    this.scene.add(grid);

    this.addWall(0, 2.35, -7, 22, 4.7, 0.24, wall);
    this.addWall(-11, 2.35, 0, 0.24, 4.7, 14, wall);
    this.addWall(11, 2.35, 0, 0.24, 4.7, 14, wall);
    this.addWall(0, 2.35, -6.86, 21.6, 4.55, 0.08, accentWall);
    const baseboard = this.material(0xc5c5b7, 0x4a554b, 0.85);
    for (const side of [-1, 1]) {
      const strip = this.box(0.08, 0.28, 13.7, baseboard);
      strip.position.set(side * 10.86, 0.14, 0);
    }

    if (this.room !== "server") {
      const windowFrame = this.material(0xf4eee1, 0x69756b, 0.65);
      const glass = this.material(0xa9c6c7, 0x49636a, 0.28, 0.25);
      for (const x of [-7, -2.35, 2.35, 7]) {
        const frame = this.box(3.2, 1.75, 0.12, windowFrame);
        frame.position.set(x, 3.1, -6.72);
        const pane = this.box(2.94, 1.48, 0.08, glass);
        pane.position.set(x, 3.1, -6.63);
        const mullion = this.box(0.07, 1.48, 0.1, windowFrame);
        mullion.position.set(x, 3.1, -6.56);
      }
    }

    if (this.room === "workspace") {
      const rugMesh = this.box(7.7, 0.035, 5.2, rug);
      rugMesh.position.set(0, 0.02, 0);
      rugMesh.receiveShadow = true;
      this.addTable(0, 0, 1.5, 1.15);
      this.addEarthGlobe();
      this.addGameStation();
      this.addPlant(-9.45, -5.45);
      this.addPlant(9.45, -5.45);
      this.addPlant(-9.45, 5.45);
      this.addPlant(9.45, 5.45);
      this.addDesk(-5.4, -3.4, "DESIGN");
      this.addDesk(5.4, -3.4, "STUDIO");
      this.addDesk(-5.4, 3.4, "BUILD");
      this.addDesk(5.4, 3.4, "FOCUS");
      this.addDesk(-9, 0, "SECRETARY", "human");
      this.addDesk(9, 0, "YOU", "none");
      this.addSofa(0, -5.3);
      this.addSofa(0, 5.3);
    } else {
      this.buildAlternativeRoom();
    }
    const ceilingLamp = this.material(0xf4dca8, 0x89774e, 0.4, 0.85);
    const lamp = new THREE.Mesh(this.geometry(new THREE.SphereGeometry(0.18, 16, 12)), ceilingLamp);
    lamp.position.set(0, 4.3, 0);
    this.scene.add(lamp);

  }

  private buildAlternativeRoom() {
    const name = OFFICE_ROOMS.find(({ id }) => id === this.room)?.name ?? "";
    this.addRoomSign(name);
    switch (this.room) {
      case "lobby":
        this.addDesk(0, -3.8, "RECEPTION");
        this.addSofa(-3.8, 0.5);
        this.addSofa(3.8, 0.5);
        this.addTable(0, 2.6, 1.8, 1.4);
        this.addPlant(-8.8, -5.4);
        this.addPlant(8.8, -5.4);
        break;
      case "meeting":
        this.addTable(0, -0.2, 4.2, 2.6);
        this.addDesk(-8, 0, "MEETING");
        this.addDesk(8, 0, "MEETING");
        for (const x of [-4.6, -2.3, 0, 2.3, 4.6]) {
          this.addSeat(x, -2.4);
          this.addSeat(x, 2.1);
        }
        break;
      case "private":
        this.addDesk(0, -2.5, "PRIVATE OFFICE");
        this.addSofa(0, 3.4);
        this.addPlant(-8.8, -5.4);
        break;
      case "focus":
        this.addDesk(-4, -2.8, "FOCUS 1");
        this.addDesk(4, -2.8, "FOCUS 2");
        this.addDesk(0, 2.8, "QUIET");
        break;
      case "breakout":
        this.addTable(0, 0, 2.8, 2);
        this.addDesk(-8, 0, "HOST");
        this.addSofa(-4.2, -3.4);
        this.addSofa(4.2, -3.4);
        this.addSofa(-4.2, 3.4);
        this.addSofa(4.2, 3.4);
        break;
      case "phone": {
        const glass = this.material(0xa9c6c7, 0x49636a, 0.28, 0.25);
        this.addWall(-2, 1.45, 0, 0.12, 2.9, 4.8, glass);
        this.addWall(2, 1.45, 0, 0.12, 2.9, 4.8, glass);
        this.addWall(0, 1.45, -2.4, 4, 2.9, 0.12, glass);
        this.addDesk(0, -0.2, "CALL");
        this.addSeat(0, 1.6);
        break;
      }
      case "cafe":
        this.addDesk(0, -5.2, "CAFE");
        this.addSofa(-5.2, -3.7);
        this.addSofa(5.2, -3.7);
        this.addSofa(0, 3.8);
        this.addTable(-4.4, 0, 1.8, 1.5);
        this.addTable(0, -0.2, 1.8, 1.5);
        this.addTable(4.4, 0, 1.8, 1.5);
        this.addPlant(-9, -5.4);
        this.addPlant(9, -5.4);
        break;
      case "game":
        this.addDesk(-7, 0, "HOST");
        this.addSofa(-4, 3.6);
        this.addSofa(4, 3.6);
        this.addTable(0, 1.3, 2.4, 1.8);
        this.addGameStation();
        break;
      case "auditorium": {
        this.addDesk(-8.5, -4.5, "HOST");
        const stage = this.material(0xb79770, 0xa08661, 0.85);
        const platform = this.box(8, 0.35, 2, stage);
        platform.position.set(0, 0.18, -4.7);
        const display = this.material(0x48534f, 0x242c29, 0.5);
        const screen = this.box(6.5, 2.7, 0.18, display);
        screen.position.set(0, 2.6, -6.55);
        for (const z of [-1.5, 0.3, 2.1, 3.9]) {
          for (const x of [-6.5, -4.3, -2.1, 0.1, 2.3, 4.5, 6.7]) {
            this.addSeat(x, z);
          }
        }
        break;
      }
      case "training":
        this.addGameStation();
        for (const z of [-1.5, 1.8, 4.8]) {
          for (const x of [-4.5, 0, 4.5]) this.addDesk(x, z, "CLASS");
        }
        break;
      case "soc":
        this.addDashboard(-4.1, 1.8, -6.58, "LIVE OPERATIONS");
        this.addDashboard(0, 1.8, -6.58, "ALERT QUEUE");
        this.addDashboard(4.1, 1.8, -6.58, "NETWORK STATUS");
        this.addDesk(-5, 1.5, "MONITOR");
        this.addDesk(0, 1.5, "INCIDENT");
        this.addDesk(5, 1.5, "ANALYSIS");
        break;
      case "ctf":
        this.addDashboard(0, 1.8, -6.58, "CAPTURE THE FLAG");
        this.addDesk(-5, -1.5, "TEAM 1");
        this.addDesk(5, -1.5, "TEAM 2");
        this.addDesk(-5, 3.2, "TEAM 3");
        this.addDesk(5, 3.2, "TEAM 4");
        break;
      case "cyberLounge":
        this.addDashboard(0, 1.8, -6.58, "CYBER LOUNGE");
        this.addDesk(-7, 1.5, "HOST");
        this.addSofa(-4.2, -0.8);
        this.addSofa(4.2, -0.8);
        this.addSofa(0, 3.7);
        this.addTable(0, 1.5, 2.1, 1.6);
        this.addPlant(-8.8, -5.4);
        this.addPlant(8.8, -5.4);
        break;
      case "server":
        for (const z of [-3.1, 2]) {
          for (const x of [-7.5, -2.5, 2.5, 7.5]) this.addServerRack(x, z);
        }
        break;
      case "workspace":
        break;
    }
  }

  private addServerRack(x: number, z: number) {
    const cabinet = this.material(0x414b51, 0x18232c, 0.58);
    const frame = this.material(0x849097, 0x52636c, 0.52);
    const front = this.material(0x202a30, 0x101a21, 0.46);
    const vent = this.material(0x64737a, 0x34434c, 0.62);
    const body = this.box(1.7, 3.25, 1.15, cabinet);
    body.position.set(x, 1.625, z);
    body.castShadow = true;
    const door = this.box(1.52, 3.02, 0.08, front);
    door.position.set(x, 1.64, z + 0.62);
    const sideRails = [-0.67, 0.67];
    for (const dx of sideRails) {
      const rail = this.box(0.07, 2.92, 0.035, frame);
      rail.position.set(x + dx, 1.64, z + 0.68);
    }
    for (let unit = 0; unit < 8; unit += 1) {
      const y = 0.36 + unit * 0.36;
      const panel = this.box(1.18, 0.28, 0.045, vent);
      panel.position.set(x, y, z + 0.69);
      for (let slot = 0; slot < 4; slot += 1) {
        const ventSlot = this.box(0.035, 0.14, 0.012, frame);
        ventSlot.position.set(x - 0.42 + slot * 0.1, y, z + 0.72);
      }
      const ledMaterial = new THREE.MeshBasicMaterial({
        color: unit % 2 === 0 ? 0x45e2b4 : 0x54bfff,
      });
      this.materials.add(ledMaterial);
      const led = new THREE.Mesh(
        this.geometry(new THREE.SphereGeometry(0.045, 8, 6)),
        ledMaterial,
      );
      led.position.set(x + 0.48, y, z + 0.73);
      this.scene.add(led);
    }
    this.collisions.push([x, z, 1.85, 1.35]);
  }

  private addRoomSign(text: string) {
    const material = new THREE.MeshBasicMaterial({
      map: this.createTextTexture(text.toUpperCase()),
    });
    this.materials.add(material);
    const sign = new THREE.Mesh(
      this.geometry(new THREE.PlaneGeometry(5.8, 0.7)),
      material,
    );
    sign.position.set(0, 4.25, -6.55);
    this.scene.add(sign);
  }

  private addDashboard(x: number, y: number, z: number, title: string) {
    const bezelMaterial = this.material(0x48534f, 0x242c29, 0.48);
    const screenMaterial = new THREE.MeshBasicMaterial({ color: 0x42c7bb });
    this.materials.add(screenMaterial);
    const bezel = this.box(3.4, 1.7, 0.16, bezelMaterial);
    bezel.position.set(x, y, z);
    const screen = this.box(3.16, 1.46, 0.025, screenMaterial);
    screen.position.set(x, y, z + 0.095);
    this.addLabel(title, x, z + 0.45);
  }

  private addGameStation() {
    const standMaterial = this.material(0x806c52, 0x574b3e, 0.82);
    const bezelMaterial = this.material(0x252d2b, 0x171d1a, 0.48);
    const consoleShell = this.material(0xe7e9e4, 0xc3cbc5, 0.56);
    const consoleCore = this.material(0x273b3e, 0x182b2e, 0.38);
    const stand = this.box(3.2, 0.4, 0.58, standMaterial);
    stand.position.set(0, 0.35, -6.35);
    stand.castShadow = true;
    const tv = this.box(2.55, 1.48, 0.14, bezelMaterial);
    tv.position.set(0, 2.0, -6.55);
    tv.castShadow = true;

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create the game screen.");
    context.fillStyle = "#182a31";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#55999a";
    context.fillRect(0, 0, 252, 256);
    context.fillStyle = "#bd8059";
    context.fillRect(260, 0, 252, 256);
    context.strokeStyle = "#dce6c8";
    context.lineWidth = 10;
    context.beginPath();
    context.moveTo(126, 28);
    context.lineTo(126, 228);
    context.moveTo(386, 28);
    context.lineTo(386, 228);
    context.stroke();
    context.fillStyle = "#fff4d8";
    context.font = "bold 30px Segoe UI, sans-serif";
    context.textAlign = "center";
    context.fillText("CO-OP", 256, 38);
    context.fillStyle = "#f4d276";
    context.beginPath();
    context.arc(180, 125, 18, 0, Math.PI * 2);
    context.arc(332, 155, 18, 0, Math.PI * 2);
    context.fill();
    const screenTexture = new THREE.CanvasTexture(canvas);
    screenTexture.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(screenTexture);
    const screenMaterial = new THREE.MeshBasicMaterial({ map: screenTexture });
    this.materials.add(screenMaterial);
    const screen = this.box(2.3, 1.24, 0.025, screenMaterial);
    screen.position.set(0, 2.0, -6.46);

    const consoleBody = new THREE.Mesh(
      this.geometry(new THREE.CapsuleGeometry(0.16, 0.48, 4, 8)),
      consoleCore,
    );
    consoleBody.position.set(1.38, 0.88, -6.05);
    consoleBody.scale.set(0.72, 1, 0.9);
    consoleBody.castShadow = true;
    this.scene.add(consoleBody);
    for (const side of [-1, 1]) {
      const panel = this.box(0.1, 0.74, 0.36, consoleShell);
      panel.position.set(1.38 + side * 0.16, 0.88, -6.05);
      panel.castShadow = true;
    }

    const labelTexture = this.createTextTexture("PS5");
    const labelMaterial = new THREE.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.materials.add(labelMaterial);
    const label = new THREE.Mesh(
      this.geometry(new THREE.PlaneGeometry(0.52, 0.13)),
      labelMaterial,
    );
    label.position.set(1.38, 1.38, -5.82);
    this.scene.add(label);
    this.collisions.push([0, -6.35, 1.7, 0.38]);
  }

  private addWall(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    material: THREE.MeshStandardMaterial,
  ) {
    const mesh = this.box(width, height, depth, material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
  }

  private addDesk(
    x: number,
    z: number,
    label: string,
    employee: "robot" | "human" | "none" = "robot",
  ) {
    const topMaterial = this.material(0xe0c8a4, 0x987b59, 0.76);
    const legMaterial = this.material(0x806c52, 0x574b3e, 0.82);
    const monitorMaterial = this.material(0x48534f, 0x242c29, 0.48);
    const screenMaterial = this.material(0x75d4e5, 0x45a9a9, 0.3);
    screenMaterial.emissive.set(0x38b9d6);
    screenMaterial.emissiveIntensity = 0.8;
    const keyboardMaterial = this.material(0x626a61, 0x454d47, 0.6);
    const keyMaterial = this.material(0xc5c7b9, 0x87948a, 0.65);
    const top = this.box(3.2, 0.18, 1.5, topMaterial);
    top.position.set(x, 0.92, z);
    top.castShadow = true;
    top.receiveShadow = true;

    for (const dx of [-1.35, 1.35]) {
      for (const dz of [-0.55, 0.55]) {
        const leg = this.box(0.14, 0.82, 0.14, legMaterial);
        leg.position.set(x + dx, 0.43, z + dz);
        leg.castShadow = true;
      }
    }

    const monitor = this.box(0.92, 0.58, 0.12, monitorMaterial);
    monitor.position.set(x, 1.36, z - 0.38);
    monitor.castShadow = true;
    const screen = this.box(0.78, 0.43, 0.025, screenMaterial);
    screen.position.set(x, 1.37, z - 0.305);
    const stand = this.box(0.1, 0.25, 0.1, legMaterial);
    stand.position.set(x, 1.08, z - 0.38);
    const keyboard = this.box(0.8, 0.055, 0.28, keyboardMaterial);
    keyboard.position.set(x, 1.05, z + 0.35);

    this.addSeat(x, z + 1.12);
    if (employee !== "none") {
      this.addAIWorker(
        x,
        z + 1.12,
        keyMaterial,
        screen,
        employee === "human",
        this.room !== "workspace",
      );
    }
    this.addLabel(label, x, z + 0.69);
    this.collisions.push([x, z, 1.72, 0.87]);
    this.collisions.push([x, z + 1.12, 0.55, 0.48]);
  }

  private addSeat(x: number, z: number) {
    const fabric = this.material(0x859486, 0x586b5c, 0.9);
    const seat = this.box(1.05, 0.2, 0.9, fabric);
    seat.position.set(x, 0.55, z);
    seat.castShadow = true;
    const back = this.box(1.05, 0.9, 0.18, fabric);
    back.position.set(x, 1.03, z + 0.38);
    back.castShadow = true;
    const base = this.material(0x555d58, 0x373f3a, 0.6);
    const post = this.box(0.12, 0.42, 0.12, base);
    post.position.set(x, 0.27, z);
  }

  private addAIWorker(
    x: number,
    z: number,
    keyMaterial: THREE.MeshStandardMaterial,
    monitorScreen: THREE.Mesh,
    isHuman = false,
    stationary = false,
  ) {
    const robot = new THREE.Group();
    robot.position.set(x, 0, z);
    robot.rotation.y = Math.PI;
    this.scene.add(robot);

    const shell = this.material(0xc4d0ce, 0x82948e, 0.42, 1);
    const shellLight = this.material(0xe4ebe7, 0xa5b7af, 0.38, 1);
    const jointMaterial = this.material(0x687a77, 0x475a54, 0.6, 1);
    const shirtMaterial = this.material(0xf1eee8, 0xcac8c2, 0.82, 1);
    const jacketMaterial = this.material(0xc43768, 0x8f234b, 0.84, 1);
    const skinMaterial = this.material(0xf0c9a8, 0xe8b997, 0.86, 1);
    const hairMaterial = this.material(0x65443e, 0x3f2a28, 0.9, 1);
    const hairHighlightMaterial = this.material(0x9b6c60, 0x66453f, 0.92, 1);
    const glassesMaterial = this.material(0x242326, 0x111113, 0.52, 1);
    const visorMaterial = this.material(0x273b3e, 0x182b2e, 0.3, 1);
    visorMaterial.emissive.setHex(0x061516);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x6cf0d8 });
    this.materials.add(eyeMaterial);
    const coreMaterial = new THREE.MeshBasicMaterial({ color: 0x58dac5 });
    this.materials.add(coreMaterial);

    const torso = new THREE.Mesh(
      this.geometry(new THREE.CapsuleGeometry(0.28, 0.36, 4, 10)),
      isHuman ? shirtMaterial : shell,
    );
    torso.position.set(0, 0.83, 0);
    torso.scale.set(1, 0.9, 0.82);
    torso.castShadow = true;
    robot.add(torso);
    if (isHuman) {
      for (const side of [-1, 1]) {
        const jacketPanel = new THREE.Mesh(
          this.geometry(new THREE.BoxGeometry(0.16, 0.47, 0.055)),
          jacketMaterial,
        );
        jacketPanel.position.set(side * 0.16, 0.83, 0.205);
        jacketPanel.rotation.z = side * -0.08;
        jacketPanel.castShadow = true;
        robot.add(jacketPanel);
      }

      const lapel = new THREE.Mesh(
        this.geometry(new THREE.BoxGeometry(0.09, 0.31, 0.035)),
        jacketMaterial,
      );
      lapel.position.set(0, 0.91, 0.24);
      lapel.rotation.z = -0.18;
      robot.add(lapel);

      const tie = new THREE.Mesh(
        this.geometry(new THREE.CylinderGeometry(0.025, 0.065, 0.38, 6)),
        glassesMaterial,
      );
      tie.position.set(0, 0.83, 0.247);
      robot.add(tie);

      for (const side of [-1, 1]) {
        const trouserLeg = new THREE.Mesh(
          this.geometry(new THREE.CapsuleGeometry(0.08, 0.25, 4, 10)),
          jacketMaterial,
        );
        trouserLeg.position.set(side * 0.14, 0.28, -0.015);
        trouserLeg.castShadow = true;
        robot.add(trouserLeg);
      }
    }

    const chest = new THREE.Mesh(
      this.geometry(new THREE.BoxGeometry(0.25, 0.12, 0.035)),
      isHuman ? shirtMaterial : coreMaterial,
    );
    chest.position.set(0, 0.86, 0.235);
    if (!isHuman) robot.add(chest);

    const neck = new THREE.Mesh(
      this.geometry(new THREE.CylinderGeometry(0.1, 0.12, 0.17, 12)),
      isHuman ? skinMaterial : jointMaterial,
    );
    neck.position.set(0, 1.17, 0);
    robot.add(neck);

    const head = new THREE.Mesh(
      this.geometry(new THREE.SphereGeometry(0.32, 24, 18)),
      isHuman ? skinMaterial : shellLight,
    );
    head.position.set(0, 1.48, 0);
    head.scale.set(1.05, 0.86, 0.9);
    head.castShadow = true;
    robot.add(head);

    const visor = new THREE.Mesh(
      this.geometry(new THREE.BoxGeometry(0.45, 0.16, 0.08)),
      visorMaterial,
    );
    visor.position.set(0, 1.49, 0.265);
    visor.castShadow = true;
    if (!isHuman) robot.add(visor);

    for (const eyeX of [-0.11, 0.11]) {
      const eye = new THREE.Mesh(
        this.geometry(new THREE.SphereGeometry(isHuman ? 0.018 : 0.035, 10, 8)),
        isHuman ? jointMaterial : eyeMaterial,
      );
      eye.position.set(eyeX, 1.49, isHuman ? 0.29 : 0.312);
      robot.add(eye);
    }

    if (isHuman) {
      const crown = new THREE.Mesh(
        this.geometry(new THREE.SphereGeometry(0.32, 24, 18, 0, Math.PI * 2, 0, 1.45)),
        hairMaterial,
      );
      crown.position.set(0, 1.54, 0);
      crown.scale.set(1.08, 1, 0.98);
      crown.castShadow = true;
      robot.add(crown);
      const fringe = new THREE.Mesh(
        this.geometry(new THREE.SphereGeometry(1, 20, 12)),
        hairMaterial,
      );
      fringe.position.set(0.09, 1.62, 0.25);
      fringe.scale.set(0.24, 0.105, 0.085);
      fringe.rotation.z = -0.32;
      fringe.castShadow = true;
      robot.add(fringe);
      const hairBack = new THREE.Mesh(
        this.geometry(new THREE.SphereGeometry(1, 24, 18)),
        hairMaterial,
      );
      hairBack.position.set(0, 1.36, -0.12);
      hairBack.scale.set(0.34, 0.37, 0.21);
      hairBack.castShadow = true;
      robot.add(hairBack);
      for (const strandX of [-0.16, -0.055, 0.055, 0.16]) {
        const strandCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(strandX * 0.7, 1.61, -0.16),
          new THREE.Vector3(strandX * 0.95, 1.42, -0.29),
          new THREE.Vector3(strandX, 1.12, -0.315),
          new THREE.Vector3(strandX * 0.9, 0.82, -0.3),
          new THREE.Vector3(strandX * 0.72, 0.55, -0.22),
        ]);
        const strand = new THREE.Mesh(
          this.geometry(new THREE.TubeGeometry(strandCurve, 18, 0.008, 5, false)),
          hairHighlightMaterial,
        );
        robot.add(strand);
      }
      for (const side of [-1, 1]) {
        const innerLock = new THREE.Mesh(
          this.geometry(new THREE.SphereGeometry(1, 18, 14)),
          hairMaterial,
        );
        innerLock.position.set(side * 0.255, 1.34, 0.16);
        innerLock.scale.set(0.115, 0.32, 0.145);
        innerLock.castShadow = true;
        robot.add(innerLock);

        const outerLock = new THREE.Mesh(
          this.geometry(new THREE.SphereGeometry(1, 18, 14)),
          hairMaterial,
        );
        outerLock.position.set(side * 0.31, 1.31, -0.025);
        outerLock.scale.set(0.135, 0.34, 0.18);
        outerLock.castShadow = true;
        robot.add(outerLock);

        const strandCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.25, 1.58, 0.24),
          new THREE.Vector3(side * 0.3, 1.45, 0.26),
          new THREE.Vector3(side * 0.34, 1.28, 0.22),
          new THREE.Vector3(side * 0.32, 1.12, 0.13),
        ]);
        const strand = new THREE.Mesh(
          this.geometry(new THREE.TubeGeometry(strandCurve, 14, 0.009, 5, false)),
          hairHighlightMaterial,
        );
        strand.castShadow = true;
        robot.add(strand);
      }
      for (const side of [-1, 1]) {
        const lens = new THREE.Mesh(
          this.geometry(new THREE.TorusGeometry(0.073, 0.012, 8, 20)),
          glassesMaterial,
        );
        lens.position.set(side * 0.105, 1.49, 0.306);
        robot.add(lens);
      }
      const glassesBridge = new THREE.Mesh(
        this.geometry(new THREE.BoxGeometry(0.055, 0.014, 0.018)),
        glassesMaterial,
      );
      glassesBridge.position.set(0, 1.49, 0.309);
      robot.add(glassesBridge);
      const lips = new THREE.Mesh(
        this.geometry(new THREE.SphereGeometry(0.035, 10, 8)),
        this.material(0xa84b66, 0x833950, 0.65, 1),
      );
      lips.position.set(0, 1.39, 0.29);
      lips.scale.set(1.35, 0.48, 0.42);
      robot.add(lips);
    } else {
      const antennaStem = new THREE.Mesh(
        this.geometry(new THREE.CylinderGeometry(0.025, 0.035, 0.2, 8)),
        jointMaterial,
      );
      antennaStem.position.set(0, 1.79, 0);
      robot.add(antennaStem);
      const antennaLight = new THREE.Mesh(
        this.geometry(new THREE.SphereGeometry(0.07, 12, 10)),
        eyeMaterial,
      );
      antennaLight.position.set(0, 1.91, 0);
      robot.add(antennaLight);
    }

    const arms: THREE.Group[] = [];
    const legs: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(
        this.geometry(new THREE.SphereGeometry(0.14, 14, 12)),
        isHuman ? skinMaterial : jointMaterial,
      );
      shoulder.position.set(side * 0.3, 1.02, 0.06);
      robot.add(shoulder);

      const arm = new THREE.Group();
      arm.position.set(side * 0.3, 1.02, 0.08);
      arm.rotation.x = -1.4;
      robot.add(arm);

      const upperArm = new THREE.Mesh(
        this.geometry(new THREE.CapsuleGeometry(0.085, 0.25, 3, 8)),
        isHuman ? jacketMaterial : shell,
      );
      upperArm.position.y = -0.18;
      upperArm.castShadow = true;
      arm.add(upperArm);

      const elbow = new THREE.Mesh(
        this.geometry(new THREE.SphereGeometry(0.095, 12, 10)),
        isHuman ? skinMaterial : jointMaterial,
      );
      elbow.position.y = -0.36;
      arm.add(elbow);

      const forearm = new THREE.Mesh(
        this.geometry(new THREE.CapsuleGeometry(0.075, 0.3, 3, 8)),
        isHuman ? skinMaterial : shellLight,
      );
      forearm.position.set(0, -0.55, 0.015);
      forearm.castShadow = true;
      arm.add(forearm);

      const hand = new THREE.Mesh(
        this.geometry(new THREE.SphereGeometry(0.11, 12, 10)),
        isHuman ? skinMaterial : jointMaterial,
      );
      hand.position.set(0, -0.76, 0.04);
      arm.add(hand);
      arms.push(arm);
    }

    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.14, 0.48, 0);
      const shin = new THREE.Mesh(
        this.geometry(new THREE.CapsuleGeometry(0.07, 0.15, 3, 8)),
        isHuman ? jacketMaterial : shell,
      );
      shin.position.y = -0.16;
      shin.castShadow = true;
      leg.add(shin);
      const foot = new THREE.Mesh(
        this.geometry(new THREE.BoxGeometry(0.13, 0.07, 0.22)),
        jointMaterial,
      );
      foot.position.set(0, -0.35, 0.06);
      foot.castShadow = true;
      leg.add(foot);
      robot.add(leg);
      legs.push(leg);
    }

    const workerIndex = this.typingWorkers.length;
    const gamepad = new THREE.Group();
    const padBody = new THREE.Mesh(
      this.geometry(new THREE.BoxGeometry(0.42, 0.08, 0.2)),
      this.material(0x303a36, 0x202624, 0.6),
    );
    padBody.position.set(0, 0.68, 0.68);
    gamepad.add(padBody);
    const padLight = new THREE.Mesh(
      this.geometry(new THREE.SphereGeometry(0.035, 8, 6)),
      eyeMaterial,
    );
    padLight.position.set(0, 0.735, 0.68);
    gamepad.add(padLight);
    gamepad.visible = false;
    robot.add(gamepad);

    const nameTexture = this.createTextTexture(
      isHuman ? "FEMALE SECRETARY" : "AI EMPLOYEE",
    );
    const nameMaterial = new THREE.SpriteMaterial({
      map: nameTexture,
      transparent: true,
      depthWrite: false,
    });
    this.materials.add(nameMaterial);
    const nameTag = new THREE.Sprite(nameMaterial);
    nameTag.position.set(0, 2.12, 0.02);
    nameTag.scale.set(isHuman ? 1.35 : 1.1, 0.28, 1);
    robot.add(nameTag);

    const dialogueCanvas = document.createElement("canvas");
    dialogueCanvas.width = 384;
    dialogueCanvas.height = 96;
    const dialogueContext = dialogueCanvas.getContext("2d");
    if (!dialogueContext) {
      throw new Error("Could not create the robot dialogue canvas.");
    }
    const dialogueLines = isHuman ? HUMAN_DIALOGUE : ROBOT_DIALOGUE;
    const dialogueIndex = workerIndex % dialogueLines.length;
    const dialogueText = dialogueLines[dialogueIndex];
    this.drawDialogue(dialogueContext, dialogueText);
    const dialogueTexture = new THREE.CanvasTexture(dialogueCanvas);
    dialogueTexture.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(dialogueTexture);
    const dialogueMaterial = new THREE.SpriteMaterial({
      map: dialogueTexture,
      transparent: true,
      depthWrite: false,
    });
    this.materials.add(dialogueMaterial);
    const dialogue = new THREE.Sprite(dialogueMaterial);
    dialogue.position.set(0, 2.52, 0);
    dialogue.scale.set(1.9, 0.48, 1);
    robot.add(dialogue);

    const keyCaps: TypingWorker["keyCaps"] = [];
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        const key = this.box(0.1, 0.035, 0.055, keyMaterial);
        const keyY = 1.093;
        key.position.set(
          x - 0.25 + column * 0.125,
          keyY,
          z + 0.27 + row * 0.1,
        );
        keyCaps.push({ mesh: key, y: keyY, phase: row * 2 + column });
      }
    }

    const home = new THREE.Vector3(x, 0, z);
    const gameSpot = new THREE.Vector3(
      GAME_SPOTS[workerIndex] ?? GAME_SPOTS[0],
      0,
      -2.55,
    );
    this.typingWorkers.push({
      robot,
      gamepad,
      monitorScreen,
      isPlayer: isHuman || GAMEPLAYERS.has(workerIndex),
      isHuman,
      arms,
      legs,
      keyCaps,
      home,
      gameRoute: this.createGameRoute(home, gameSpot),
      route: [],
      state: "working",
      nextActionAt: stationary
        ? Number.POSITIVE_INFINITY
        : performance.now() + 24000 + workerIndex * 2500,
      phase: workerIndex * 1.3,
      dialogue,
      dialogueContext,
      dialogueTexture,
      dialogueText,
      dialogueIndex,
      nextDialogueAt: performance.now() + 2600 + workerIndex * 700,
    });
  }

  private createGameRoute(home: THREE.Vector3, gameSpot: THREE.Vector3) {
    const side = home.x < 0 ? -1 : 1;
    const gameSide = gameSpot.x < 0 ? -1 : 1;
    if (home.z < 0) {
      return [
        new THREE.Vector3(home.x, 0, -1.7),
        new THREE.Vector3(side * 2, 0, -1.7),
        new THREE.Vector3(gameSide * 2, 0, -1.7),
        gameSpot.clone(),
      ];
    }
    return [
      new THREE.Vector3(home.x, 0, 6.1),
      new THREE.Vector3(side * 2, 0, 6.1),
      new THREE.Vector3(side * 2, 0, -1.7),
      new THREE.Vector3(gameSide * 2, 0, -1.7),
      gameSpot.clone(),
    ];
  }

  private drawDialogue(context: CanvasRenderingContext2D, text: string) {
    const width = context.canvas.width;
    const height = context.canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = this.theme === "light" ? "#fffdf8" : "#26332d";
    context.strokeStyle = this.theme === "light" ? "#d9ded5" : "#56675d";
    context.lineWidth = 3;
    context.beginPath();
    context.roundRect(8, 6, width - 16, 68, 20);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(width / 2 - 12, 72);
    context.lineTo(width / 2, 88);
    context.lineTo(width / 2 + 12, 72);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = this.theme === "light" ? "#52675a" : "#b9d8c6";
    context.font = "bold 28px Segoe UI, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, width / 2, 41, width - 40);
  }

  private createTextTexture(text: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = this.theme === "light" ? "#fffdf8" : "#26332d";
      context.beginPath();
      context.roundRect(4, 4, 248, 56, 16);
      context.fill();
      context.fillStyle = this.theme === "light" ? "#52675a" : "#9de8d4";
      context.font = "bold 18px Segoe UI, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, 128, 33, 216);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(texture);
    return texture;
  }

  private addSofa(x: number, z: number) {
    const bodyMaterial = this.material(0x7d9282, 0x526557, 0.94);
    const cushionMaterial = this.material(0xa2b19d, 0x6d806c, 0.96);
    const body = this.box(2.9, 0.58, 1.2, bodyMaterial);
    body.position.set(x, 0.44, z);
    body.castShadow = true;
    const seat = this.box(2.5, 0.2, 0.78, cushionMaterial);
    seat.position.set(x, 0.82, z + 0.08);
    seat.castShadow = true;
    const back = this.box(2.9, 0.82, 0.28, bodyMaterial);
    back.position.set(x, 1.05, z - 0.46);
    back.castShadow = true;
    this.collisions.push([x, z, 1.55, 0.75]);
  }

  private addTable(x: number, z: number, width: number, depth: number) {
    const topMaterial = this.material(0xd7bd97, 0xa08661, 0.8);
    const centerMaterial = this.material(0x879a85, 0x68816a, 0.92);
    const legMaterial = this.material(0x806c52, 0x574b3e, 0.82);
    const top = new THREE.Mesh(
      this.geometry(new THREE.CylinderGeometry(width / 2, width / 2, 0.16, 32)),
      topMaterial,
    );
    top.position.set(x, 0.72, z);
    top.castShadow = true;
    top.receiveShadow = true;
    this.scene.add(top);
    const inset = new THREE.Mesh(
      this.geometry(new THREE.CylinderGeometry(width * 0.22, width * 0.22, 0.035, 24)),
      centerMaterial,
    );
    inset.position.set(x, 0.815, z);
    this.scene.add(inset);
    const stem = this.box(0.18, 0.6, 0.18, legMaterial);
    stem.position.set(x, 0.36, z);
    const foot = new THREE.Mesh(
      this.geometry(new THREE.CylinderGeometry(0.46, 0.52, 0.12, 24)),
      legMaterial,
    );
    foot.position.set(x, 0.06, z);
    this.scene.add(foot);
    this.collisions.push([x, z, width / 2 + 0.1, depth / 2 + 0.1]);
  }

  private addPlant(x: number, z: number) {
    const potMaterial = this.material(0xc9b89f, 0x6b6051, 0.95);
    const darkLeaf = this.material(0x688568, 0x4e7357, 0.95);
    const lightLeaf = this.material(0x8eaa85, 0x719375, 0.95);
    const pot = new THREE.Mesh(
      this.geometry(new THREE.CylinderGeometry(0.48, 0.35, 0.72, 20)),
      potMaterial,
    );
    pot.position.set(x, 0.36, z);
    pot.castShadow = true;
    this.scene.add(pot);

    const leaves = [
      [x - 0.32, 1.0, z, 0.39, darkLeaf],
      [x + 0.3, 1.15, z - 0.12, 0.43, lightLeaf],
      [x + 0.06, 1.52, z + 0.05, 0.44, darkLeaf],
      [x - 0.22, 1.3, z + 0.18, 0.36, lightLeaf],
      [x + 0.36, 0.95, z + 0.2, 0.34, darkLeaf],
    ] as const;
    for (const [leafX, leafY, leafZ, scale, material] of leaves) {
      const leaf = new THREE.Mesh(
        this.geometry(new THREE.SphereGeometry(scale, 16, 12)),
        material,
      );
      leaf.position.set(leafX, leafY, leafZ);
      leaf.scale.set(0.85, 1.35, 0.85);
      leaf.castShadow = true;
      this.scene.add(leaf);
    }
    this.collisions.push([x, z, 0.62, 0.62]);
  }

  private addEarthGlobe() {
    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = 512;
    textureCanvas.height = 256;
    const context = textureCanvas.getContext("2d");
    if (!context) {
      throw new Error("Could not create the Earth globe texture.");
    }

    context.fillStyle = "#287da5";
    context.fillRect(0, 0, textureCanvas.width, textureCanvas.height);
    context.fillStyle = "#83aa70";
    const continents = [
      [[68, 51], [98, 34], [130, 45], [146, 68], [130, 85], [118, 106], [99, 112], [85, 91], [66, 79]],
      [[122, 113], [145, 123], [153, 146], [144, 173], [137, 199], [122, 218], [112, 190], [108, 158]],
      [[214, 55], [244, 39], [282, 44], [301, 58], [332, 54], [359, 69], [351, 91], [321, 99], [304, 119], [278, 115], [257, 99], [232, 103], [213, 86]],
      [[237, 105], [266, 110], [282, 134], [272, 160], [258, 183], [243, 174], [231, 148]],
      [[343, 153], [368, 148], [385, 163], [378, 180], [358, 178]],
    ];
    for (const points of continents) {
      context.beginPath();
      points.forEach(([x, y], index) => {
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.fill();
    }

    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(texture);
    const globeMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.72,
      emissive: 0x0b3152,
      emissiveIntensity: 0.8,
    });
    this.materials.add(globeMaterial);

    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x45cfff,
      transparent: true,
      opacity: 0.2,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.materials.add(glowMaterial);
    const baseMaterial = this.material(0xc9b89f, 0x6b6051, 0.82);
    const base = new THREE.Mesh(
      this.geometry(new THREE.CylinderGeometry(0.13, 0.18, 0.09, 20)),
      baseMaterial,
    );
    base.position.set(0, 0.86, 0);
    base.castShadow = true;
    this.scene.add(base);

    const globe = new THREE.Mesh(
      this.geometry(new THREE.SphereGeometry(0.56, 32, 24)),
      globeMaterial,
    );
    globe.position.set(0, 1.38, 0);
    globe.rotation.set(0.28, 0.45, -0.18);
    globe.castShadow = true;
    this.scene.add(globe);

    const glow = new THREE.Mesh(
      this.geometry(new THREE.SphereGeometry(0.68, 24, 18)),
      glowMaterial,
    );
    glow.position.copy(globe.position);
    this.scene.add(glow);

    const light = new THREE.PointLight(0x45cfff, 1.2, 3.2);
    light.position.copy(globe.position);
    this.scene.add(light);
  }

  private addLabel(text: string, x: number, z: number) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = this.theme === "light" ? "#6d6659" : "#e2d4bd";
    context.font = "bold 30px Segoe UI, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 128, 32);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(texture);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    this.materials.add(material);
    const label = new THREE.Mesh(
      this.geometry(new THREE.PlaneGeometry(1.05, 0.26)),
      material,
    );
    label.rotation.x = -Math.PI / 2;
    label.position.set(x, 1.02, z);
    this.scene.add(label);
  }

  private buildPlayer() {
    const group = new THREE.Group();
    const shadowMaterial = this.material(0x40473f, 0x111713, 0.9, 0.18);
    const shadow = new THREE.Mesh(
      this.geometry(new THREE.CircleGeometry(0.42, 24)),
      shadowMaterial,
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.025;
    group.add(shadow);

    const bodyMaterial = this.material(0x667f9a, 0x7595b4, 0.85);
    const skinMaterial = this.material(0xf0c9a8, 0xe8b997, 0.9);
    const hairMaterial = this.material(0x51483e, 0x352f2b, 0.98);
    const body = new THREE.Mesh(
      this.geometry(new THREE.CapsuleGeometry(0.28, 0.46, 4, 8)),
      bodyMaterial,
    );
    body.position.y = 0.72;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
      this.geometry(new THREE.SphereGeometry(0.24, 20, 16)),
      skinMaterial,
    );
    head.position.y = 1.42;
    head.castShadow = true;
    group.add(head);

    const hair = new THREE.Mesh(
      this.geometry(new THREE.SphereGeometry(0.245, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.56)),
      hairMaterial,
    );
    hair.position.y = 1.49;
    hair.castShadow = true;
    group.add(hair);

    const nameCanvas = document.createElement("canvas");
    nameCanvas.width = 128;
    nameCanvas.height = 48;
    const context = nameCanvas.getContext("2d");
    if (context) {
      context.fillStyle = this.theme === "light" ? "#fffdf8" : "#303a33";
      context.beginPath();
      context.roundRect(4, 4, 120, 40, 12);
      context.fill();
      context.fillStyle = this.theme === "light" ? "#52675a" : "#d8e6d5";
      context.font = "bold 22px Segoe UI, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("YOU", 64, 25);
      const texture = new THREE.CanvasTexture(nameCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.textures.add(texture);
      const nameMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
      });
      this.materials.add(nameMaterial);
      const nameTag = new THREE.Mesh(
        this.geometry(new THREE.PlaneGeometry(0.9, 0.34)),
        nameMaterial,
      );
      nameTag.position.set(0, 1.95, 0);
      nameTag.rotation.y = Math.PI / 4;
      group.add(nameTag);
    }
    return group;
  }

  private material(
    light: number,
    dark: number,
    roughness = 0.82,
    opacity = 1,
  ) {
    const material = new THREE.MeshStandardMaterial({
      color: this.theme === "light" ? light : dark,
      roughness,
      transparent: opacity < 1,
      opacity,
    });
    this.materials.add(material);
    this.themeMaterials.push({ material, light, dark });
    return material;
  }

  private box(
    width: number,
    height: number,
    depth: number,
    material: THREE.Material,
  ) {
    const mesh = new THREE.Mesh(
      this.geometry(new THREE.BoxGeometry(width, height, depth)),
      material,
    );
    this.scene.add(mesh);
    return mesh;
  }

  private geometry<T extends THREE.BufferGeometry>(geometry: T) {
    this.geometries.add(geometry);
    return geometry;
  }

  private animate = (time = performance.now()) => {
    this.frameId = requestAnimationFrame(this.animate);
    const delta = this.lastFrameTime
      ? Math.min((time - this.lastFrameTime) / 1000, 0.05)
      : 0;
    this.lastFrameTime = time;
    this.movePlayer(delta);
    this.animateTyping(time, delta);
    this.renderer.render(this.scene, this.camera);
  };

  private animateTyping(time: number, delta: number) {
    for (const worker of this.typingWorkers) {
      if (worker.state === "working" && time >= worker.nextActionAt) {
        worker.state = "walkingToGame";
        worker.route = [...worker.gameRoute];
        this.setWorkerDialogue(worker, time);
      } else if (worker.state === "playing" && time >= worker.nextActionAt) {
        worker.state = "walkingToDesk";
        worker.route = [...worker.gameRoute.slice(0, -1)].reverse();
        worker.route.push(worker.home.clone());
        this.setWorkerDialogue(worker, time);
      }

      const destination = worker.route[0];
      if (destination) {
        const distance = worker.robot.position.distanceTo(destination);
        const step = 1.5 * delta;
        if (distance <= step) {
          worker.robot.position.copy(destination);
          worker.route.shift();
        } else {
          const direction = destination.clone().sub(worker.robot.position).normalize();
          worker.robot.position.addScaledVector(direction, step);
          worker.robot.position.y = 0;
          worker.robot.rotation.y = Math.atan2(direction.x, direction.z);
        }
      }

      if (worker.state === "walkingToGame" && worker.route.length === 0) {
        worker.state = "playing";
        worker.nextActionAt = time + 11000;
        this.setWorkerDialogue(worker, time);
      } else if (worker.state === "walkingToDesk" && worker.route.length === 0) {
        worker.state = "working";
        worker.nextActionAt = time + 30000 + worker.phase * 1000;
        worker.robot.rotation.y = Math.PI;
        this.setWorkerDialogue(worker, time);
      }

      const typing = Math.sin(time * 0.012 + worker.phase) * 0.12;
      const working = worker.state === "working";
      const playing = worker.state === "playing";
      const walking = worker.state.startsWith("walking");
      worker.monitorScreen.visible = working;
      const armAngle = working ? -1.4 : playing ? (worker.isPlayer ? -0.95 : -0.65) : -0.45;
      worker.arms[0].rotation.x = armAngle + typing;
      worker.arms[1].rotation.x = armAngle - typing;
      worker.gamepad.visible = playing && worker.isPlayer;
      for (let leg = 0; leg < worker.legs.length; leg += 1) {
        worker.legs[leg].rotation.x = walking
          ? Math.sin(time * 0.012 + worker.phase + leg * Math.PI) * 0.45
          : 0;
      }
      if (walking) {
        worker.robot.position.y = Math.abs(Math.sin(time * 0.012 + worker.phase)) * 0.05;
      } else {
        worker.robot.position.y = 0;
      }
      for (const key of worker.keyCaps) {
        key.mesh.position.y =
          key.y +
          (working
            ? Math.max(0, Math.sin(time * 0.025 + key.phase + worker.phase)) * 0.025
            : 0);
      }
      if (time >= worker.nextDialogueAt) {
        this.setWorkerDialogue(worker, time, true);
      }
    }
  }

  private setWorkerDialogue(worker: TypingWorker, time: number, cycle = false) {
    const lines =
      worker.state === "working"
        ? worker.isHuman
          ? HUMAN_DIALOGUE
          : ROBOT_DIALOGUE
        : worker.state === "playing"
          ? worker.isPlayer
            ? GAME_DIALOGUE
            : WATCH_DIALOGUE
          : ["Taking a break...", "Meet you at the screen!"];
    if (cycle) {
      worker.dialogueIndex = (worker.dialogueIndex + 1) % lines.length;
    } else {
      worker.dialogueIndex = 0;
    }
    worker.dialogueText = lines[worker.dialogueIndex];
    this.drawDialogue(worker.dialogueContext, worker.dialogueText);
    worker.dialogueTexture.needsUpdate = true;
    worker.nextDialogueAt = time + 2600;
  }

  private movePlayer(delta: number) {
    const xDirection =
      Number(this.keys.has("arrowright") || this.keys.has("d")) -
      Number(this.keys.has("arrowleft") || this.keys.has("a"));
    const zDirection =
      Number(this.keys.has("arrowdown") || this.keys.has("s")) -
      Number(this.keys.has("arrowup") || this.keys.has("w"));
    if (!xDirection && !zDirection) return;

    const length = Math.hypot(xDirection, zDirection);
    const distance = (4.2 * delta) / length;
    const nextX = this.player.position.x + xDirection * distance;
    const nextZ = this.player.position.z + zDirection * distance;
    if (this.canStandAt(nextX, this.player.position.z)) {
      this.player.position.x = nextX;
    }
    if (this.canStandAt(this.player.position.x, nextZ)) {
      this.player.position.z = nextZ;
    }
    this.player.rotation.y = Math.atan2(xDirection, zDirection);
  }

  private canStandAt(x: number, z: number) {
    const radius = 0.34;
    if (Math.abs(x) > 10.1 || Math.abs(z) > 6.05) return false;
    return !this.collisions.some(
      ([obstacleX, obstacleZ, halfWidth, halfDepth]) =>
        Math.abs(x - obstacleX) < halfWidth + radius &&
        Math.abs(z - obstacleZ) < halfDepth + radius,
    );
  }
}
