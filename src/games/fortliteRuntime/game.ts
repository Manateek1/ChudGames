import * as THREE from 'three';
import type { GraphicsQuality } from '../../types/arcade';
import { RollingFps } from '../../engine/fps';
import {
  ACTOR_RADIUS,
  BOT_COUNT,
  BUILD_COST,
  BUILD_GRID_SIZE,
  FIXED_TIMESTEP,
  HELP_TEXT,
  MAP_RADIUS,
  MAP_SCALE,
  MAX_WEAPON_SLOTS,
  MATERIAL_DISPLAY_NAMES,
  MATERIAL_PRIORITY,
  PATHFINDING_CELL_SIZE,
  PATHFINDING_GRID_SIZE,
  PLAYER_EYE_HEIGHT,
  RESOURCE_COLORS,
  RESOURCE_RESPAWN_COUNT,
  STORM_PHASES,
  WEAPON_DEFINITIONS
} from './content';
import { angleLerp, clamp, clampToCircle, horizontalDistance, randomPointInCircle, SeededRandom, snap, yawToDirection } from './math';
import { GridPathfinder } from './pathfinding';
import type {
  ActorKind,
  BuildPiece,
  BuildPieceType,
  InventoryState,
  LootPickup,
  MaterialType,
  ObstacleBox,
  ResourceNode,
  WeaponDefinition,
  WeaponInstance
} from './types';
import { FortLiteHud } from './ui';

type MatchState = 'boot' | 'inProgress' | 'ended';
type StormMode = 'pause' | 'shrink' | 'done';
type Biome = 'regular' | 'forest' | 'desert';
type FortLiteMode = 'solo' | 'duos';
type SpawnState = 'parachuting' | 'grounded';

interface Actor {
  id: string;
  kind: ActorKind;
  teamId: number;
  group: THREE.Group;
  visualRoot: THREE.Group;
  bodyMesh: THREE.Mesh;
  headMesh: THREE.Mesh;
  ringMesh: THREE.Mesh;
  shadowMesh: THREE.Mesh;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  bodyParts: THREE.Object3D[];
  parachuteGroup: THREE.Group;
  position: THREE.Vector3;
  lastPosition: THREE.Vector3;
  verticalVelocity: number;
  yaw: number;
  radius: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  grounded: boolean;
  inventory: InventoryState;
  fireCooldown: number;
  reloadTimer: number;
  harvestCooldown: number;
  eliminationCount: number;
  moveBlend: number;
  stepTime: number;
  spawnState: SpawnState;
  spawnTimer: number;
  dropStart: THREE.Vector3;
  dropTarget: THREE.Vector3;
  ai?: BotBrain;
}

interface BotBrain {
  state: 'roam' | 'seekLoot' | 'seekSafeZone' | 'engage' | 'harvest';
  targetLootId?: string;
  targetNodeId?: string;
  targetActorId?: string;
  destination: THREE.Vector3;
  path: THREE.Vector3[];
  pathIndex: number;
  decisionTimer: number;
  repathTimer: number;
  strafeDirection: number;
  strafeTimer: number;
  buildCooldown: number;
  harvestTimer: number;
}

interface StormRuntime {
  mode: StormMode;
  phaseIndex: number;
  timer: number;
  currentCenter: THREE.Vector3;
  currentRadius: number;
  startCenter: THREE.Vector3;
  startRadius: number;
  targetCenter: THREE.Vector3;
  targetRadius: number;
  currentDamagePerSecond: number;
}

interface TimedMessage {
  text: string;
  timeRemaining: number;
}

interface WaterZone {
  center: THREE.Vector3;
  radiusX: number;
  radiusZ: number;
  rotation: number;
  moveMultiplier: number;
}

interface WalkableSurface {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

interface ShotEffect {
  group: THREE.Group;
  lineMaterial: THREE.LineBasicMaterial;
  sparkMaterial: THREE.MeshStandardMaterial;
  timeRemaining: number;
  duration: number;
}

const GRAVITY = 22;
const DESERT_BIOME_THETA_START = 0;
const FOREST_BIOME_THETA_START = Math.PI * 0.5;
const QUARTER_BIOME_THETA_LENGTH = Math.PI * 0.5;
const REGULAR_BIOME_THETA_START = Math.PI;
const REGULAR_BIOME_THETA_LENGTH = Math.PI;
const DEFAULT_CAMERA_FOV = 76;
const ZOOMED_CAMERA_FOV = 52;
const CAMERA_FOV_LERP = 0.18;
const PLAYER_MOVE_SPEED = 8;
const PLAYER_SPRINT_SPEED = 12;
const BOT_BUFF_MULTIPLIER = 1.2;
const BOT_MOVE_SPEED = 5.8 * 0.9 * BOT_BUFF_MULTIPLIER;
const BOT_SPRINT_SPEED = 7.1 * 0.9 * BOT_BUFF_MULTIPLIER;
const JUMP_SPEED = 8;
const INTERACT_DISTANCE = 3;
const HARVEST_DISTANCE = 4.6;
const WATER_MOVE_MULTIPLIER = 0.58;
const WALL_WIDTH = 4;
const WALL_HEIGHT = 4;
const WALL_THICKNESS = 0.35;
const FLOOR_SIZE = 4;
const FLOOR_THICKNESS = 0.24;
const RAMP_WIDTH = 4;
const RAMP_LENGTH = 5.2;
const RAMP_HEIGHT = 3;
const RAMP_THICKNESS = 0.28;
const RAMP_ANGLE = Math.atan2(RAMP_HEIGHT, RAMP_LENGTH);
const DUOS_TEAM_COUNT = 50;
const DUOS_TEAM_SIZE = 2;
const FLOOR_MATERIAL_PICKUP_AMOUNT = 200;
const PLAYER_SPAWN_PADDING = 7;
const PLAYER_SPAWN_SEPARATION = 34;
const PLAYER_STARTER_LOOT_OFFSET = 4.2;
const WORLD_CENTER = new THREE.Vector3(0, 0, 0);
const PARACHUTE_DURATION = 7;
const STORM_START_DELAY = 20;
const SKYDIVE_ALTITUDE = 92;
const THIRD_PERSON_CAMERA_DISTANCE = 6.8;
const THIRD_PERSON_CAMERA_HEIGHT = 1.9;
const THIRD_PERSON_CAMERA_SHOULDER = 0.92;
const PARACHUTE_CAMERA_DISTANCE = 8.8;
const PARACHUTE_STEER_SPEED = 32;
const CAMERA_POSITION_LERP = 0.22;
const CAMERA_LOOK_LERP = 0.3;
const CAMERA_COLLISION_PADDING = 0.45;

export interface FortLiteMatchResult {
  won: boolean;
  placement: number;
  eliminations: number;
  survivalTime: number;
}

interface FortLiteGameOptions {
  graphicsQuality?: GraphicsQuality;
  mode?: FortLiteMode;
  onFpsChange?: (fps: number) => void;
  seedBase?: number;
  onPlacementChange?: (placement: number) => void;
  onMatchEnd?: (result: FortLiteMatchResult) => void;
  showEndScreen?: boolean;
}

export class FortLiteGame {
  private readonly root: HTMLDivElement;
  private readonly options: FortLiteGameOptions;
  private readonly matchMode: FortLiteMode;
  private readonly shell: HTMLDivElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly hud: FortLiteHud;
  private readonly pathfinder = new GridPathfinder(PATHFINDING_GRID_SIZE, PATHFINDING_CELL_SIZE);
  private readonly raycaster = new THREE.Raycaster();
  private readonly tempVectorA = new THREE.Vector3();
  private readonly tempVectorB = new THREE.Vector3();
  private readonly tempVectorC = new THREE.Vector3();
  private readonly tempPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly fpsMeter = new RollingFps();

  private animationFrame = 0;
  private lastFrameTime = 0;
  private accumulator = 0;
  private matchIndex = 0;
  private rng = new SeededRandom(1337);
  private state: MatchState = 'boot';
  private matchTime = 0;
  private graphicsQuality: GraphicsQuality;
  private maxShotEffects = 72;

  private matchRoot = new THREE.Group();
  private environmentGroup = new THREE.Group();
  private lootGroup = new THREE.Group();
  private actorGroup = new THREE.Group();
  private buildGroup = new THREE.Group();
  private effectsGroup = new THREE.Group();
  private stormGroup = new THREE.Group();

  private stormWall: THREE.Mesh | null = null;
  private safeZoneRing: THREE.LineLoop | null = null;
  private safeZoneDisc: THREE.Mesh | null = null;
  private storm!: StormRuntime;

  private player!: Actor;
  private actors: Actor[] = [];
  private loot: LootPickup[] = [];
  private resourceNodes: ResourceNode[] = [];
  private buildPieces: BuildPiece[] = [];
  private shotEffects: ShotEffect[] = [];
  private staticObstacles: ObstacleBox[] = [];
  private walkableSurfaces: WalkableSurface[] = [];
  private waterZones: WaterZone[] = [];
  private lootSpawnPoints: THREE.Vector3[] = [];
  private participantSpawns: THREE.Vector3[] = [];
  private raycastTargets: THREE.Object3D[] = [];
  private cameraObstacles: THREE.Object3D[] = [];

  private previewMesh: THREE.Mesh | null = null;
  private selectedBuildPiece: BuildPieceType = 'wall';
  private buildRotation = 0;
  private buildMode = false;

  private cameraYaw = Math.PI;
  private cameraPitch = 0.06;
  private readonly cameraRigPosition = new THREE.Vector3();
  private readonly cameraLookPosition = new THREE.Vector3();
  private cameraRigInitialized = false;
  private lastFirstPersonView = false;

  private readonly viewModelRoot = new THREE.Group();
  private viewModelItem = new THREE.Group();
  private currentViewModelKey = '';
  private viewModelBobTime = 0;
  private viewModelMoveBlend = 0;
  private viewModelKick = 0;
  private readonly viewModelSway = new THREE.Vector2();
  private muzzleFlashTime = 0;

  private readonly keysDown = new Set<string>();
  private readonly justPressedKeys = new Set<string>();
  private readonly mouseDown = new Set<number>();
  private readonly justPressedMouseButtons = new Set<number>();
  private pendingLookDeltaX = 0;
  private pendingLookDeltaY = 0;
  private wheelDirection = 0;

  private timedMessage: TimedMessage | null = null;
  private disposed = false;
  private externallyPaused = false;
  private matchResultSent = false;
  private helpVisible = false;

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Tab') {
      event.preventDefault();
      if (!event.repeat) {
        this.helpVisible = !this.helpVisible;
      }
      return;
    }

    if (!this.keysDown.has(event.code)) {
      this.justPressedKeys.add(event.code);
    }
    this.keysDown.add(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keysDown.delete(event.code);
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (!this.mouseDown.has(event.button)) {
      this.justPressedMouseButtons.add(event.button);
    }
    this.mouseDown.add(event.button);

    if (event.button === 0 && !this.externallyPaused && !this.isPointerLocked() && this.state === 'inProgress') {
      this.renderer.domElement.requestPointerLock();
    }
  };

  private readonly handleMouseUp = (event: MouseEvent): void => {
    this.mouseDown.delete(event.button);
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.isPointerLocked()) {
      return;
    }

    this.pendingLookDeltaX += event.movementX;
    this.pendingLookDeltaY += event.movementY;
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    this.wheelDirection = event.deltaY > 0 ? 1 : -1;
    event.preventDefault();
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  constructor(root: HTMLDivElement, options: FortLiteGameOptions = {}) {
    this.root = root;
    this.options = options;
    this.matchMode = options.mode === 'duos' ? 'duos' : 'solo';
    this.graphicsQuality = options.graphicsQuality ?? 'high';
    this.root.innerHTML = '';

    this.shell = document.createElement('div');
    this.shell.className = 'fortlite-shell';
    this.root.append(this.shell);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.setPixelRatio(this.getPixelRatioForQuality(this.graphicsQuality));
    this.renderer.setSize(this.root.clientWidth, this.root.clientHeight, false);
    this.renderer.domElement.className = 'fortlite-canvas';
    this.shell.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xaed7ff);
    this.scene.fog = new THREE.Fog(0xaed7ff, MAP_RADIUS * 0.68, MAP_RADIUS * 1.95);

    this.camera = new THREE.PerspectiveCamera(DEFAULT_CAMERA_FOV, Math.max(1, this.root.clientWidth / Math.max(1, this.root.clientHeight)), 0.05, MAP_RADIUS * 2.2);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, 9, 12);
    this.scene.add(this.camera);
    this.raycaster.layers.enableAll();

    this.viewModelRoot.position.set(0.52, -0.52, -0.88);
    this.camera.add(this.viewModelRoot);

    this.hud = new FortLiteHud(this.shell, HELP_TEXT);
    this.hud.setRestartHandler(() => this.resetMatch());
    this.applyGraphicsQuality(this.graphicsQuality);

    this.installLighting();
    this.installEvents();
  }

  start(): void {
    if (this.disposed) {
      return;
    }
    this.resetMatch();
    this.lastFrameTime = performance.now();
    this.animationFrame = window.requestAnimationFrame(this.frame);
  }

  setPaused(paused: boolean): void {
    if (this.disposed || this.externallyPaused === paused) {
      return;
    }

    this.externallyPaused = paused;
    this.lastFrameTime = performance.now();

    if (paused) {
      this.options.onFpsChange?.(0);
      this.releasePointerLock();
      this.pendingLookDeltaX = 0;
      this.pendingLookDeltaY = 0;
      this.wheelDirection = 0;
      this.justPressedKeys.clear();
      this.justPressedMouseButtons.clear();
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    window.cancelAnimationFrame(this.animationFrame);
    this.removeEvents();
    this.releasePointerLock();

    if (this.viewModelItem.parent) {
      this.viewModelRoot.remove(this.viewModelItem);
    }
    this.disposeObject(this.viewModelItem);
    this.viewModelItem = new THREE.Group();
    this.options.onFpsChange?.(0);

    if (this.viewModelRoot.parent) {
      this.camera.remove(this.viewModelRoot);
    }

    this.clearMatchRoot();
    this.renderer.dispose();
    this.root.innerHTML = '';
    this.keysDown.clear();
    this.justPressedKeys.clear();
    this.mouseDown.clear();
    this.justPressedMouseButtons.clear();
  }

  private readonly frame = (time: number): void => {
    if (this.disposed) {
      return;
    }

    if (this.externallyPaused) {
      this.lastFrameTime = time;
      this.render();
      if (!this.disposed) {
        this.animationFrame = window.requestAnimationFrame(this.frame);
      }
      return;
    }

    const deltaSeconds = Math.min(0.1, (time - this.lastFrameTime) / 1000);
    const fps = this.fpsMeter.next(time);
    if (fps > 0) {
      this.options.onFpsChange?.(fps);
    }
    this.lastFrameTime = time;
    this.accumulator += deltaSeconds;

    while (this.accumulator >= FIXED_TIMESTEP) {
      this.fixedUpdate(FIXED_TIMESTEP);
      this.accumulator -= FIXED_TIMESTEP;
      this.justPressedKeys.clear();
      this.justPressedMouseButtons.clear();
      this.wheelDirection = 0;
    }

    this.render();
    if (!this.disposed) {
      this.animationFrame = window.requestAnimationFrame(this.frame);
    }
  };

  private installLighting(): void {
    const hemi = new THREE.HemisphereLight(0xf8f6e9, 0x31402a, 1.5);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffefc8, 1.32);
    sun.position.set(-34, 44, 20);
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x9fdcff, 0.42);
    fill.position.set(26, 18, -16);
    this.scene.add(fill);
  }

  private installEvents(): void {
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('keyup', this.handleKeyUp);
    this.renderer.domElement.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('mousemove', this.handleMouseMove);
    this.renderer.domElement.addEventListener('wheel', this.handleWheel, { passive: false });
    this.renderer.domElement.addEventListener('contextmenu', this.handleContextMenu);
  }

  private removeEvents(): void {
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);
    this.renderer.domElement.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('mousemove', this.handleMouseMove);
    this.renderer.domElement.removeEventListener('wheel', this.handleWheel);
    this.renderer.domElement.removeEventListener('contextmenu', this.handleContextMenu);
  }

  private releasePointerLock(): void {
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
  }

  private resetMatch(): void {
    this.releasePointerLock();

    this.matchIndex += 1;
    this.rng = new SeededRandom((this.options.seedBase ?? 1337) + (this.matchIndex - 1) * 4099);
    this.matchTime = 0;
    this.state = 'inProgress';
    this.accumulator = 0;
    this.timedMessage = null;
    this.selectedBuildPiece = 'wall';
    this.buildRotation = 0;
    this.buildMode = false;
    this.cameraYaw = Math.PI;
    this.cameraPitch = 0.06;
    this.helpVisible = false;
    this.participantSpawns = [];
    this.viewModelBobTime = 0;
    this.viewModelMoveBlend = 0;
    this.viewModelKick = 0;
    this.viewModelSway.set(0, 0);
    this.muzzleFlashTime = 0;
    this.currentViewModelKey = '';
    this.matchResultSent = false;
    this.cameraRigInitialized = false;
    this.lastFirstPersonView = false;

    this.clearMatchRoot();

    this.environmentGroup = new THREE.Group();
    this.lootGroup = new THREE.Group();
    this.actorGroup = new THREE.Group();
    this.buildGroup = new THREE.Group();
    this.effectsGroup = new THREE.Group();
    this.stormGroup = new THREE.Group();

    this.matchRoot.add(this.environmentGroup, this.lootGroup, this.actorGroup, this.buildGroup, this.effectsGroup, this.stormGroup);
    this.scene.add(this.matchRoot);

    this.staticObstacles = [];
    this.walkableSurfaces = [];
    this.lootSpawnPoints = [];
    this.actors = [];
    this.loot = [];
    this.resourceNodes = [];
    this.buildPieces = [];
    this.shotEffects = [];
    this.raycastTargets = [];
    this.cameraObstacles = [];
    this.waterZones = [];

    this.buildWorld();
    this.spawnParticipants();
    this.spawnLoot();
    this.initializeStorm();
    this.ensurePreviewMesh();
    this.syncViewModel(true);
    this.hud.hideEndScreen();
    this.showMessage(
      this.isDuosMode()
        ? 'FortLite Duos is live. You drop straight from the sky now, the storm waits 20 seconds, and right click snaps you into first-person aim.'
        : 'You now drop straight from the sky with a steerable parachute. Land fast, loot up, and use right click to swap from third-person into first-person aim.',
      4
    );
    this.refreshNavigation();
    this.options.onPlacementChange?.(this.calculatePlacement());
  }

  private clearMatchRoot(): void {
    if (this.previewMesh) {
      this.previewMesh = null;
    }

    if (this.matchRoot.parent) {
      this.scene.remove(this.matchRoot);
    }

    this.disposeObject(this.matchRoot);
    this.matchRoot = new THREE.Group();
  }

  private disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          material.dispose();
        }
      }
    });

    object.clear();
  }

  private buildWorld(): void {
    const perimeterWallCount = 44 * MAP_SCALE;
    const randomObstacleCount = 22 * MAP_SCALE;

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(MAP_RADIUS, 128),
      new THREE.MeshStandardMaterial({ color: 0x5c7650, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.environmentGroup.add(ground);
    this.addGroundSector(MAP_RADIUS, 0xd0aa66, -0.018, 0.98, DESERT_BIOME_THETA_START, QUARTER_BIOME_THETA_LENGTH);
    this.addGroundSector(MAP_RADIUS, 0x446f3b, -0.017, 0.98, FOREST_BIOME_THETA_START, QUARTER_BIOME_THETA_LENGTH);
    this.addGroundSector(MAP_RADIUS, 0x657d4f, -0.016, 0.92, REGULAR_BIOME_THETA_START, REGULAR_BIOME_THETA_LENGTH);
    this.addGroundSector(MAP_RADIUS * 0.82, 0xe0bd76, -0.012, 0.34, DESERT_BIOME_THETA_START, QUARTER_BIOME_THETA_LENGTH);
    this.addGroundSector(MAP_RADIUS * 0.82, 0x335d32, -0.011, 0.3, FOREST_BIOME_THETA_START, QUARTER_BIOME_THETA_LENGTH);
    this.addGroundSector(MAP_RADIUS * 0.72, 0x728757, -0.01, 0.24, REGULAR_BIOME_THETA_START, REGULAR_BIOME_THETA_LENGTH);

    const terrainPatches = [
      { position: new THREE.Vector3(-44, 0, -8), radiusX: 30, radiusZ: 18, color: 0x8b6a45, opacity: 0.68, rotation: 0.32 },
      { position: new THREE.Vector3(36, 0, -42), radiusX: 22, radiusZ: 12, color: 0x806244, opacity: 0.7, rotation: -0.48 },
      { position: new THREE.Vector3(46, 0, 34), radiusX: 26, radiusZ: 15, color: 0x6f8a4f, opacity: 0.48, rotation: 0.22 },
      { position: new THREE.Vector3(-34, 0, 44), radiusX: 24, radiusZ: 13, color: 0x867350, opacity: 0.66, rotation: -0.2 },
      { position: new THREE.Vector3(0, 0, 0), radiusX: 18, radiusZ: 18, color: 0x7b5b3d, opacity: 0.55, rotation: 0 },
      { position: new THREE.Vector3(-122, 0, -72), radiusX: 44, radiusZ: 26, color: 0x8a6c4f, opacity: 0.54, rotation: 0.18 },
      { position: new THREE.Vector3(132, 0, -112), radiusX: 38, radiusZ: 22, color: 0x7d6d4e, opacity: 0.58, rotation: -0.34 },
      { position: new THREE.Vector3(152, 0, 108), radiusX: 42, radiusZ: 24, color: 0x6b8750, opacity: 0.52, rotation: 0.26 },
      { position: new THREE.Vector3(-136, 0, 126), radiusX: 40, radiusZ: 24, color: 0x8d7456, opacity: 0.56, rotation: -0.16 },
      { position: new THREE.Vector3(0, 0, -154), radiusX: 54, radiusZ: 20, color: 0x5f7c47, opacity: 0.42, rotation: 0.08 },
      { position: new THREE.Vector3(0, 0, 164), radiusX: 56, radiusZ: 24, color: 0x6e8a4b, opacity: 0.4, rotation: -0.12 },
      { position: new THREE.Vector3(-284, 0, -228), radiusX: 74, radiusZ: 34, color: 0x856a4d, opacity: 0.48, rotation: 0.24 },
      { position: new THREE.Vector3(292, 0, -248), radiusX: 70, radiusZ: 36, color: 0x736246, opacity: 0.5, rotation: -0.2 },
      { position: new THREE.Vector3(336, 0, 234), radiusX: 78, radiusZ: 34, color: 0x6a8450, opacity: 0.44, rotation: 0.18 },
      { position: new THREE.Vector3(-318, 0, 254), radiusX: 72, radiusZ: 38, color: 0x846d51, opacity: 0.48, rotation: -0.12 },
      { position: new THREE.Vector3(0, 0, -352), radiusX: 88, radiusZ: 32, color: 0x6a7f49, opacity: 0.4, rotation: 0.06 },
      { position: new THREE.Vector3(0, 0, 372), radiusX: 92, radiusZ: 38, color: 0x728a51, opacity: 0.38, rotation: -0.08 },
      { position: new THREE.Vector3(-446, 0, 42), radiusX: 68, radiusZ: 30, color: 0x7c6a4e, opacity: 0.46, rotation: 0.3 },
      { position: new THREE.Vector3(462, 0, -24), radiusX: 72, radiusZ: 28, color: 0x6f624a, opacity: 0.44, rotation: -0.18 },
      { position: new THREE.Vector3(-232, 0, 424), radiusX: 66, radiusZ: 28, color: 0x807053, opacity: 0.42, rotation: 0.22 },
      { position: new THREE.Vector3(246, 0, 438), radiusX: 70, radiusZ: 32, color: 0x738a54, opacity: 0.42, rotation: -0.16 }
    ];

    for (const patch of terrainPatches) {
      this.addTerrainPatch(patch.position, patch.radiusX, patch.radiusZ, patch.color, patch.opacity, patch.rotation);
    }

    this.scatterBiomeTerrainPatches('forest', 14, [0x2f5d2f, 0x446f3b, 0x577b43, 0x5a6f34], MAP_RADIUS * 0.16, MAP_RADIUS * 0.92);
    this.scatterBiomeTerrainPatches('desert', 14, [0xc19a59, 0xd6b36c, 0xb88e4c, 0xe1c98d], MAP_RADIUS * 0.16, MAP_RADIUS * 0.92);
    this.scatterBiomeTerrainPatches('regular', 20, [0x6a7f49, 0x7c6a4e, 0x6f8451, 0x8a7453], MAP_RADIUS * 0.12, MAP_RADIUS * 0.94);
    this.addCloudLayer();

    this.addWaterZone(new THREE.Vector3(-252, 0, 142), 46, 28, 0.28);
    this.addWaterZone(new THREE.Vector3(286, 0, 168), 40, 30, -0.42);
    this.addWaterZone(new THREE.Vector3(12, 0, -284), 54, 34, 0.1);
    this.addWaterZone(new THREE.Vector3(-374, 0, -78), 38, 26, -0.34);
    this.addWaterZone(new THREE.Vector3(418, 0, -188), 46, 30, 0.46);
    this.addWaterZone(new THREE.Vector3(-88, 0, 354), 44, 28, -0.18);

    const innerRing = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(this.makeCirclePoints(MAP_RADIUS, 90)),
      new THREE.LineBasicMaterial({ color: 0xf8fcff, opacity: 0.14, transparent: true })
    );
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.04;
    this.environmentGroup.add(innerRing);

    for (let i = 0; i < perimeterWallCount; i += 1) {
      const angle = (i / perimeterWallCount) * Math.PI * 2;
      const radius = MAP_RADIUS + this.rng.range(1.2, 3.8);
      const position = new THREE.Vector3(Math.cos(angle) * radius, 1.4, Math.sin(angle) * radius);
      const sizeX = this.rng.range(4, 9);
      const sizeZ = this.rng.range(4, 9);
      const height = this.rng.range(3.1, 7.2);
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(sizeX, height, sizeZ),
        new THREE.MeshStandardMaterial({ color: 0x68727d, roughness: 1 })
      );
      wall.position.copy(position);
      this.environmentGroup.add(wall);
    }

    const roads = [
      { start: new THREE.Vector3(-6, 0, 0), end: new THREE.Vector3(-42, 0, -32), width: 7, color: 0x7b6549 },
      { start: new THREE.Vector3(4, 0, -4), end: new THREE.Vector3(32, 0, -26), width: 6, color: 0x746149 },
      { start: new THREE.Vector3(5, 0, 5), end: new THREE.Vector3(42, 0, 40), width: 7, color: 0x6e5d45 },
      { start: new THREE.Vector3(-4, 0, 6), end: new THREE.Vector3(-28, 0, 38), width: 6.5, color: 0x7b684d },
      { start: new THREE.Vector3(-18, 0, -10), end: new THREE.Vector3(-126, 0, -92), width: 8, color: 0x735f46 },
      { start: new THREE.Vector3(22, 0, -16), end: new THREE.Vector3(126, 0, -108), width: 7.5, color: 0x6d5b43 },
      { start: new THREE.Vector3(26, 0, 20), end: new THREE.Vector3(142, 0, 114), width: 8, color: 0x685944 },
      { start: new THREE.Vector3(-20, 0, 22), end: new THREE.Vector3(-132, 0, 128), width: 7.5, color: 0x74644c },
      { start: new THREE.Vector3(-126, 0, -92), end: new THREE.Vector3(-278, 0, -214), width: 8.5, color: 0x735f46 },
      { start: new THREE.Vector3(126, 0, -108), end: new THREE.Vector3(284, 0, -236), width: 8.5, color: 0x6d5b43 },
      { start: new THREE.Vector3(142, 0, 114), end: new THREE.Vector3(336, 0, 218), width: 8.5, color: 0x685944 },
      { start: new THREE.Vector3(-132, 0, 128), end: new THREE.Vector3(-324, 0, 248), width: 8.5, color: 0x74644c },
      { start: new THREE.Vector3(0, 0, -154), end: new THREE.Vector3(0, 0, -338), width: 9, color: 0x705d42 },
      { start: new THREE.Vector3(0, 0, 164), end: new THREE.Vector3(0, 0, 356), width: 9, color: 0x6d6047 },
      { start: new THREE.Vector3(-136, 0, 128), end: new THREE.Vector3(-446, 0, 42), width: 8.2, color: 0x7a654a },
      { start: new THREE.Vector3(146, 0, 116), end: new THREE.Vector3(458, 0, -18), width: 8.2, color: 0x715f47 },
      { start: new THREE.Vector3(-136, 0, 128), end: new THREE.Vector3(-236, 0, 420), width: 8, color: 0x73644b },
      { start: new THREE.Vector3(146, 0, 116), end: new THREE.Vector3(232, 0, 432), width: 8, color: 0x6c6148 }
    ];

    for (const road of roads) {
      this.addRoad(road.start, road.end, road.width, road.color);
    }

    this.createCentralArena();

    const compounds = [
      {
        center: new THREE.Vector3(-44, 0, -36),
        color: 0x9a8062,
        boxes: [
          { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(12, 10), height: 6 },
          { offset: new THREE.Vector3(14, 0, 6), size: new THREE.Vector2(7, 7), height: 4.5 },
          { offset: new THREE.Vector3(-15, 0, 10), size: new THREE.Vector2(8, 4), height: 3.5 }
        ]
      },
      {
        center: new THREE.Vector3(32, 0, -28),
        color: 0x8e7454,
        boxes: [
          { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(14, 9), height: 5.6 },
          { offset: new THREE.Vector3(-13, 0, -10), size: new THREE.Vector2(8, 8), height: 4.8 },
          { offset: new THREE.Vector3(16, 0, -8), size: new THREE.Vector2(6, 12), height: 5.2 }
        ]
      },
      {
        center: new THREE.Vector3(42, 0, 44),
        color: 0x7c6d61,
        boxes: [
          { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(10, 14), height: 5.6 },
          { offset: new THREE.Vector3(-12, 0, 10), size: new THREE.Vector2(9, 7), height: 4.4 },
          { offset: new THREE.Vector3(14, 0, -12), size: new THREE.Vector2(7, 7), height: 4.4 }
        ]
      },
      {
        center: new THREE.Vector3(-30, 0, 38),
        color: 0x8b8b79,
        boxes: [
          { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(13, 9), height: 5.2 },
          { offset: new THREE.Vector3(-15, 0, -8), size: new THREE.Vector2(7, 7), height: 4.2 },
          { offset: new THREE.Vector3(12, 0, 11), size: new THREE.Vector2(8, 6), height: 3.6 }
        ]
      },
      {
        center: new THREE.Vector3(-2, 0, 4),
        color: 0x9f917d,
        boxes: [
          { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(12, 12), height: 5.4 },
          { offset: new THREE.Vector3(14, 0, -10), size: new THREE.Vector2(6, 6), height: 4 },
          { offset: new THREE.Vector3(-16, 0, 8), size: new THREE.Vector2(6, 10), height: 4 }
        ]
      },
      {
        center: new THREE.Vector3(-122, 0, -96),
        color: 0x8f7c61,
        boxes: [
          { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(16, 10), height: 5.8 },
          { offset: new THREE.Vector3(18, 0, 12), size: new THREE.Vector2(8, 8), height: 4.6 },
          { offset: new THREE.Vector3(-18, 0, -10), size: new THREE.Vector2(9, 7), height: 4.2 }
        ]
      },
      {
        center: new THREE.Vector3(126, 0, -112),
        color: 0x7c7467,
        boxes: [
          { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(15, 11), height: 5.8 },
          { offset: new THREE.Vector3(-16, 0, 10), size: new THREE.Vector2(8, 7), height: 4.4 },
          { offset: new THREE.Vector3(18, 0, -8), size: new THREE.Vector2(7, 12), height: 5 }
        ]
      },
      {
        center: new THREE.Vector3(146, 0, 116),
        color: 0x8a7b66,
        boxes: [
          { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(14, 12), height: 5.6 },
          { offset: new THREE.Vector3(-18, 0, -10), size: new THREE.Vector2(8, 6), height: 4.4 },
          { offset: new THREE.Vector3(16, 0, 12), size: new THREE.Vector2(8, 8), height: 4.6 }
        ]
      },
      {
        center: new THREE.Vector3(-136, 0, 128),
        color: 0x7f8171,
        boxes: [
          { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(16, 10), height: 5.4 },
          { offset: new THREE.Vector3(16, 0, -12), size: new THREE.Vector2(7, 7), height: 4.2 },
          { offset: new THREE.Vector3(-18, 0, 10), size: new THREE.Vector2(9, 8), height: 4.4 }
        ]
      },
      {
        center: new THREE.Vector3(-278, 0, -214),
        color: 0x8a7357,
        boxes: [
          { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(18, 11), height: 6 },
          { offset: new THREE.Vector3(20, 0, 10), size: new THREE.Vector2(9, 8), height: 4.6 },
          { offset: new THREE.Vector3(-18, 0, -12), size: new THREE.Vector2(10, 8), height: 4.4 }
        ]
      },
      {
        center: new THREE.Vector3(284, 0, -236),
        color: 0x7f7265,
        boxes: [
          { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(17, 12), height: 5.8 },
          { offset: new THREE.Vector3(-18, 0, 10), size: new THREE.Vector2(8, 7), height: 4.5 },
          { offset: new THREE.Vector3(20, 0, -10), size: new THREE.Vector2(8, 12), height: 5.1 }
        ]
      },
      {
        center: new THREE.Vector3(336, 0, 218),
        color: 0x8b7d67,
        boxes: [
          { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(18, 12), height: 5.9 },
          { offset: new THREE.Vector3(-20, 0, -12), size: new THREE.Vector2(10, 8), height: 4.5 },
          { offset: new THREE.Vector3(18, 0, 12), size: new THREE.Vector2(8, 8), height: 4.5 }
        ]
      },
      {
        center: new THREE.Vector3(-324, 0, 248),
        color: 0x808474,
        boxes: [
          { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(17, 10), height: 5.6 },
          { offset: new THREE.Vector3(18, 0, -10), size: new THREE.Vector2(8, 8), height: 4.2 },
          { offset: new THREE.Vector3(-20, 0, 12), size: new THREE.Vector2(10, 8), height: 4.4 }
        ]
      },
      {
        center: new THREE.Vector3(0, 0, -338),
        color: 0x8f7b5f,
        boxes: [
          { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(16, 12), height: 5.8 },
          { offset: new THREE.Vector3(18, 0, 12), size: new THREE.Vector2(8, 8), height: 4.5 },
          { offset: new THREE.Vector3(-18, 0, -12), size: new THREE.Vector2(9, 9), height: 4.5 }
        ]
      },
      {
        center: new THREE.Vector3(0, 0, 356),
        color: 0x7f7e6c,
        boxes: [
          { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(16, 11), height: 5.5 },
          { offset: new THREE.Vector3(-18, 0, 10), size: new THREE.Vector2(8, 8), height: 4.4 },
          { offset: new THREE.Vector3(18, 0, -10), size: new THREE.Vector2(8, 10), height: 4.7 }
        ]
      },
      {
        center: new THREE.Vector3(-446, 0, 42),
        color: 0x8b7760,
        boxes: [
          { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(17, 11), height: 5.7 },
          { offset: new THREE.Vector3(20, 0, 10), size: new THREE.Vector2(9, 8), height: 4.6 },
          { offset: new THREE.Vector3(-18, 0, -10), size: new THREE.Vector2(8, 10), height: 4.8 }
        ]
      },
      {
        center: new THREE.Vector3(458, 0, -18),
        color: 0x7c7265,
        boxes: [
          { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(18, 10), height: 5.6 },
          { offset: new THREE.Vector3(-18, 0, 10), size: new THREE.Vector2(8, 8), height: 4.2 },
          { offset: new THREE.Vector3(18, 0, -12), size: new THREE.Vector2(9, 9), height: 4.5 }
        ]
      },
      {
        center: new THREE.Vector3(-236, 0, 420),
        color: 0x867a64,
        boxes: [
          { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(16, 11), height: 5.6 },
          { offset: new THREE.Vector3(18, 0, -10), size: new THREE.Vector2(8, 8), height: 4.3 },
          { offset: new THREE.Vector3(-18, 0, 12), size: new THREE.Vector2(10, 8), height: 4.5 }
        ]
      },
      {
        center: new THREE.Vector3(232, 0, 432),
        color: 0x7f866d,
        boxes: [
          { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(17, 12), height: 5.8 },
          { offset: new THREE.Vector3(-20, 0, -10), size: new THREE.Vector2(8, 8), height: 4.4 },
          { offset: new THREE.Vector3(18, 0, 12), size: new THREE.Vector2(9, 8), height: 4.6 }
        ]
      }
    ];

    for (const compound of compounds) {
      this.createCompound(compound.center, compound.color, compound.boxes);
    }

    this.createRockCluster(new THREE.Vector3(-356, 0, -146), 6, 24);
    this.createRockCluster(new THREE.Vector3(382, 0, -126), 5, 20);
    this.createRockCluster(new THREE.Vector3(-398, 0, 102), 5, 22);
    this.createRockCluster(new THREE.Vector3(354, 0, 286), 6, 26);
    this.createRockCluster(new THREE.Vector3(-212, 0, 338), 5, 18);
    this.createRockCluster(new THREE.Vector3(104, 0, -412), 6, 22);
    this.createRockCluster(new THREE.Vector3(-82, 0, -468), 7, 28);
    this.createRockCluster(new THREE.Vector3(468, 0, 114), 5, 18);
    this.createTallStructure(this.findBiomeFreePoint('forest', MAP_RADIUS * 0.32, MAP_RADIUS * 0.78, 18), 0x52684e, 0xa5c995, 13.5);
    this.createTallStructure(this.findBiomeFreePoint('forest', MAP_RADIUS * 0.38, MAP_RADIUS * 0.88, 18), 0x4d5b46, 0x87b57a, 15.2);
    this.createTallStructure(this.findBiomeFreePoint('desert', MAP_RADIUS * 0.32, MAP_RADIUS * 0.78, 18), 0x9d7c4e, 0xe2c483, 13.2);
    this.createTallStructure(this.findBiomeFreePoint('desert', MAP_RADIUS * 0.4, MAP_RADIUS * 0.88, 18), 0x8d6f46, 0xf0d296, 15);
    this.createTallStructure(this.findBiomeFreePoint('regular', MAP_RADIUS * 0.28, MAP_RADIUS * 0.7, 18), 0x6e706e, 0xc6d5cf, 14.2);
    this.createTallStructure(this.findBiomeFreePoint('regular', MAP_RADIUS * 0.34, MAP_RADIUS * 0.82, 18), 0x767566, 0xf1e2b6, 15.8);
    this.createTallStructure(this.findBiomeFreePoint('regular', MAP_RADIUS * 0.42, MAP_RADIUS * 0.9, 18), 0x657168, 0xb6d7e5, 17.2);
    this.createMegaStructure(this.findBiomeFreePoint('forest', MAP_RADIUS * 0.44, MAP_RADIUS * 0.94, 26), 0x445d48, 0x9fd08f, 5);
    this.createMegaStructure(this.findBiomeFreePoint('forest', MAP_RADIUS * 0.5, MAP_RADIUS * 0.96, 26), 0x365148, 0x85bf79, 4);
    this.createMegaStructure(this.findBiomeFreePoint('desert', MAP_RADIUS * 0.44, MAP_RADIUS * 0.94, 26), 0x8f7049, 0xe3c17f, 5);
    this.createMegaStructure(this.findBiomeFreePoint('desert', MAP_RADIUS * 0.5, MAP_RADIUS * 0.96, 26), 0x7f6642, 0xf0d69a, 4);
    this.createMegaStructure(this.findBiomeFreePoint('regular', MAP_RADIUS * 0.4, MAP_RADIUS * 0.9, 26), 0x63686b, 0xc8d9e4, 5);
    this.createMegaStructure(this.findBiomeFreePoint('regular', MAP_RADIUS * 0.48, MAP_RADIUS * 0.96, 26), 0x5d6661, 0xf0ddb0, 4);
    this.createCityDistrict(this.findBiomeFreePoint('regular', MAP_RADIUS * 0.18, MAP_RADIUS * 0.46, 44), 0x5d6769, 0xcde1ea, 4);
    this.createCityDistrict(this.findBiomeFreePoint('regular', MAP_RADIUS * 0.34, MAP_RADIUS * 0.68, 44), 0x6a6c61, 0xf0ddb0, 4);
    this.createCityDistrict(this.findBiomeFreePoint('desert', MAP_RADIUS * 0.26, MAP_RADIUS * 0.62, 42), 0x8d7048, 0xe9c889, 3);
    this.createCityDistrict(this.findBiomeFreePoint('forest', MAP_RADIUS * 0.24, MAP_RADIUS * 0.58, 42), 0x435b48, 0xaad59c, 3);
    this.scatterScatteredBuildings('regular', 7, MAP_RADIUS * 0.2, MAP_RADIUS * 0.96, [0x5f6968, 0x6c6e62, 0x6a716b], [0xc8dce8, 0xf3deaf, 0xc9d9c9]);
    this.scatterScatteredBuildings('forest', 5, MAP_RADIUS * 0.2, MAP_RADIUS * 0.94, [0x4a5e49, 0x55664d, 0x405847], [0x98cb8c, 0xcfe8c7, 0x84bc7e]);
    this.scatterScatteredBuildings('desert', 5, MAP_RADIUS * 0.22, MAP_RADIUS * 0.94, [0x8b6f49, 0x9c7d54, 0x7f6844], [0xe8c57d, 0xf3dfb2, 0xd6b37a]);
    this.populateRegularBiomeCover();

    for (let i = 0; i < randomObstacleCount; i += 1) {
      const point = this.findFreePoint(MAP_RADIUS - 18, 6);
      const size = new THREE.Vector2(this.rng.range(2.4, 5.8), this.rng.range(2.4, 5.8));
      const height = this.rng.range(1.8, 3.8);
      const biome = this.getBiomeAtPosition(point);
      const palette =
        biome === 'forest'
          ? [0x4d6949, 0x61775d, 0x5b6844]
          : biome === 'desert'
            ? [0x9e865c, 0xa49169, 0x8c7551]
            : [0x73837f, 0x7d7869, 0x587169];
      if (this.rng.next() > 0.45) {
        this.addStaticObstacle(point, size, height, this.rng.pick(palette), false);
      } else {
        this.addRockObstacle(point, size, height);
      }
    }

    this.spawnResourceNodes();
  }

  private createCompound(
    center: THREE.Vector3,
    color: number,
    boxes: Array<{ offset: THREE.Vector3; size: THREE.Vector2; height: number }>
  ): void {
    for (const box of boxes) {
      const position = center.clone().add(box.offset);
      this.createStructureShell(position, box.size, box.height, color, true);
      this.addCompoundDecor(position, box.size, box.height, color);
    }

    const fencePoints = [
      center.clone().add(new THREE.Vector3(-18, 0, -14)),
      center.clone().add(new THREE.Vector3(18, 0, -14)),
      center.clone().add(new THREE.Vector3(-18, 0, 14)),
      center.clone().add(new THREE.Vector3(18, 0, 14))
    ];

    for (const point of fencePoints) {
      this.addStaticObstacle(point, new THREE.Vector2(3, 7), 2.4, 0x6b7078, false);
      this.lootSpawnPoints.push(point.clone().add(new THREE.Vector3(0, 0, 4)));
    }

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.75, 4.8, 10),
      new THREE.MeshStandardMaterial({ color: 0x394552, roughness: 0.7, metalness: 0.3 })
    );
    beacon.position.set(center.x, 2.4, center.z);
    this.environmentGroup.add(beacon);

    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffcc7d, emissive: 0xffa94d, emissiveIntensity: 0.5, roughness: 0.35 })
    );
    lamp.position.set(center.x, 4.95, center.z);
    this.environmentGroup.add(lamp);
  }

  private addRaisedStaticObstacle(
    position: THREE.Vector3,
    size: THREE.Vector3,
    color: number,
    walkable: boolean,
    roughness = 0.9,
    metalness = 0.05
  ): ObstacleBox {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshStandardMaterial({ color, roughness, metalness })
    );
    mesh.position.copy(position);
    this.environmentGroup.add(mesh);
    this.tagTarget(mesh, 'static', null);

    const obstacle: ObstacleBox = {
      minX: position.x - size.x * 0.5,
      maxX: position.x + size.x * 0.5,
      minZ: position.z - size.z * 0.5,
      maxZ: position.z + size.z * 0.5,
      height: position.y + size.y * 0.5,
      mesh
    };

    this.staticObstacles.push(obstacle);
    this.raycastTargets.push(mesh);
    this.cameraObstacles.push(mesh);

    if (walkable) {
      this.walkableSurfaces.push({
        minX: obstacle.minX,
        maxX: obstacle.maxX,
        minZ: obstacle.minZ,
        maxZ: obstacle.maxZ,
        height: obstacle.height
      });
    }

    return obstacle;
  }

  private addStaticObstacle(position: THREE.Vector3, size: THREE.Vector2, height: number, color: number, addLootSpots: boolean): void {
    this.addRaisedStaticObstacle(
      new THREE.Vector3(position.x, height * 0.5, position.z),
      new THREE.Vector3(size.x, height, size.y),
      color,
      false
    );

    if (!addLootSpots) {
      return;
    }

    const offsets = [
      new THREE.Vector3(size.x * 0.6, 0, size.y * 0.6),
      new THREE.Vector3(-size.x * 0.6, 0, size.y * 0.6),
      new THREE.Vector3(size.x * 0.6, 0, -size.y * 0.6),
      new THREE.Vector3(-size.x * 0.6, 0, -size.y * 0.6)
    ];

    for (const offset of offsets) {
      const point = position.clone().add(offset);
      if (point.length() < MAP_RADIUS - 8) {
        this.lootSpawnPoints.push(point);
      }
    }
  }

  private addGroundDisc(radius: number, color: number, y: number, opacity: number): void {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 72),
      new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, opacity })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = y;
    this.environmentGroup.add(disc);
  }

  private addGroundSector(
    radius: number,
    color: number,
    y: number,
    opacity: number,
    thetaStart: number,
    thetaLength: number
  ): void {
    const sector = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 96, thetaStart, thetaLength),
      new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, opacity, side: THREE.DoubleSide })
    );
    sector.rotation.x = -Math.PI / 2;
    sector.position.y = y;
    this.environmentGroup.add(sector);
  }

  private getBiomeAtPosition(position: THREE.Vector3): Biome {
    const angle = (Math.atan2(position.z, position.x) + Math.PI * 2) % (Math.PI * 2);
    if (angle >= DESERT_BIOME_THETA_START && angle < DESERT_BIOME_THETA_START + QUARTER_BIOME_THETA_LENGTH) {
      return 'desert';
    }

    if (angle >= FOREST_BIOME_THETA_START && angle < FOREST_BIOME_THETA_START + QUARTER_BIOME_THETA_LENGTH) {
      return 'forest';
    }

    return 'regular';
  }

  private randomPointInBiome(biome: Biome, minRadius: number, maxRadius: number): THREE.Vector3 {
    let thetaStart = REGULAR_BIOME_THETA_START;
    let thetaLength = REGULAR_BIOME_THETA_LENGTH;
    if (biome === 'forest') {
      thetaStart = FOREST_BIOME_THETA_START;
      thetaLength = QUARTER_BIOME_THETA_LENGTH;
    } else if (biome === 'desert') {
      thetaStart = DESERT_BIOME_THETA_START;
      thetaLength = QUARTER_BIOME_THETA_LENGTH;
    }

    const angle = thetaStart + (this.rng.next() * thetaLength);
    const radius = Math.sqrt(this.rng.range(minRadius * minRadius, maxRadius * maxRadius));
    return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  }

  private findBiomeFreePoint(biome: Biome, minRadius: number, maxRadius: number, padding: number): THREE.Vector3 {
    for (let attempt = 0; attempt < 140; attempt += 1) {
      const point = this.randomPointInBiome(biome, minRadius, maxRadius);
      if (this.isPointClear(point, padding)) {
        return point;
      }
    }

    return this.findFreePoint(maxRadius, padding);
  }

  private scatterBiomeTerrainPatches(
    biome: Biome,
    count: number,
    colors: number[],
    minRadius: number,
    maxRadius: number
  ): void {
    for (let i = 0; i < count; i += 1) {
      const point = this.randomPointInBiome(biome, minRadius, maxRadius);
      if (this.isPointInWater(point, 12)) {
        continue;
      }

      this.addTerrainPatch(
        point,
        this.rng.range(18, 42),
        this.rng.range(16, 38),
        this.rng.pick(colors),
        this.rng.range(0.22, 0.48),
        this.rng.range(-Math.PI, Math.PI)
      );
    }
  }

  private addTerrainPatch(
    position: THREE.Vector3,
    radiusX: number,
    radiusZ: number,
    color: number,
    opacity: number,
    rotation: number
  ): void {
    const patch = new THREE.Mesh(
      new THREE.CircleGeometry(1, 56),
      new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, opacity })
    );
    patch.rotation.set(-Math.PI / 2, 0, rotation);
    patch.position.set(position.x, 0.01, position.z);
    patch.scale.set(radiusX, radiusZ, 1);
    this.environmentGroup.add(patch);
  }

  private addCloudLayer(): void {
    const cloudCount = 18 + MAP_SCALE * 4;

    for (let index = 0; index < cloudCount; index += 1) {
      const anchor = randomPointInCircle(this.rng, MAP_RADIUS + 140);
      const altitude = this.rng.range(48, 88);
      const cloud = new THREE.Group();
      const puffCount = this.rng.int(3, 6);

      for (let puffIndex = 0; puffIndex < puffCount; puffIndex += 1) {
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(this.rng.range(2.2, 4.8), 10, 10),
          new THREE.MeshStandardMaterial({
            color: this.rng.pick([0xffffff, 0xf4fbff, 0xfff4e1]),
            roughness: 0.86,
            metalness: 0.02,
            transparent: true,
            opacity: this.rng.range(0.7, 0.9)
          })
        );
        puff.position.set(
          this.rng.range(-5.6, 5.6),
          this.rng.range(-0.9, 0.9),
          this.rng.range(-3.8, 3.8)
        );
        puff.scale.y *= this.rng.range(0.55, 0.88);
        cloud.add(puff);
      }

      cloud.position.set(anchor.x, altitude, anchor.z);
      cloud.rotation.y = this.rng.range(0, Math.PI * 2);
      this.environmentGroup.add(cloud);
    }
  }

  private addWaterZone(position: THREE.Vector3, radiusX: number, radiusZ: number, rotation: number): void {
    this.addTerrainPatch(position, radiusX * 1.18, radiusZ * 1.18, 0x5f7a52, 0.28, rotation);

    const water = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshStandardMaterial({
        color: 0x2b6d90,
        emissive: 0x16394e,
        emissiveIntensity: 0.35,
        roughness: 0.2,
        metalness: 0.08,
        transparent: true,
        opacity: 0.82
      })
    );
    water.rotation.set(-Math.PI / 2, 0, rotation);
    water.position.set(position.x, 0, position.z);
    water.scale.set(radiusX, radiusZ, 1);
    this.environmentGroup.add(water);

    const shoreline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(this.makeCirclePoints(1, 64)),
      new THREE.LineBasicMaterial({ color: 0xbde8ff, transparent: true, opacity: 0.42 })
    );
    shoreline.rotation.set(-Math.PI / 2, 0, rotation);
    shoreline.position.set(position.x, 0.05, position.z);
    shoreline.scale.set(radiusX, radiusZ, 1);
    this.environmentGroup.add(shoreline);

    this.waterZones.push({
      center: position.clone(),
      radiusX,
      radiusZ,
      rotation,
      moveMultiplier: WATER_MOVE_MULTIPLIER
    });
  }

  private addRoad(start: THREE.Vector3, end: THREE.Vector3, width: number, color: number): void {
    const delta = end.clone().sub(start);
    const length = Math.max(2, delta.length());
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.08, length),
      new THREE.MeshStandardMaterial({ color, roughness: 0.95 })
    );
    road.position.copy(start.clone().add(end).multiplyScalar(0.5));
    road.position.y = 0.02;
    road.rotation.y = Math.atan2(delta.x, delta.z);
    this.environmentGroup.add(road);
  }

  private createStructureShell(position: THREE.Vector3, size: THREE.Vector2, height: number, color: number, addLootSpots: boolean): void {
    const wallThickness = 0.46;
    const doorwayWidth = clamp(Math.min(size.x, size.y) * 0.34, 2.8, 4.6);
    const roofThickness = 0.3;
    const roofColor = new THREE.Color(color).offsetHSL(0, 0.04, 0.08).getHex();
    const towardCenter = WORLD_CENTER.clone().sub(position);
    const doorwayAxis = Math.abs(towardCenter.x) > Math.abs(towardCenter.z) ? 'x' : 'z';
    const doorwaySign = doorwayAxis === 'x'
      ? (towardCenter.x >= 0 ? 1 : -1)
      : (towardCenter.z >= 0 ? 1 : -1);

    if (doorwayAxis === 'z') {
      const sideWidth = Math.max(0.7, (size.x - doorwayWidth) * 0.5);
      this.addStaticObstacle(
        new THREE.Vector3(position.x - (doorwayWidth * 0.5 + sideWidth * 0.5), 0, position.z + doorwaySign * size.y * 0.5),
        new THREE.Vector2(sideWidth, wallThickness),
        height,
        color,
        false
      );
      this.addStaticObstacle(
        new THREE.Vector3(position.x + (doorwayWidth * 0.5 + sideWidth * 0.5), 0, position.z + doorwaySign * size.y * 0.5),
        new THREE.Vector2(sideWidth, wallThickness),
        height,
        color,
        false
      );
      this.addStaticObstacle(new THREE.Vector3(position.x, 0, position.z - doorwaySign * size.y * 0.5), new THREE.Vector2(size.x, wallThickness), height, color, false);
      this.addStaticObstacle(new THREE.Vector3(position.x - size.x * 0.5, 0, position.z), new THREE.Vector2(wallThickness, size.y), height, color, false);
      this.addStaticObstacle(new THREE.Vector3(position.x + size.x * 0.5, 0, position.z), new THREE.Vector2(wallThickness, size.y), height, color, false);
    } else {
      const sideDepth = Math.max(0.7, (size.y - doorwayWidth) * 0.5);
      this.addStaticObstacle(
        new THREE.Vector3(position.x + doorwaySign * size.x * 0.5, 0, position.z - (doorwayWidth * 0.5 + sideDepth * 0.5)),
        new THREE.Vector2(wallThickness, sideDepth),
        height,
        color,
        false
      );
      this.addStaticObstacle(
        new THREE.Vector3(position.x + doorwaySign * size.x * 0.5, 0, position.z + (doorwayWidth * 0.5 + sideDepth * 0.5)),
        new THREE.Vector2(wallThickness, sideDepth),
        height,
        color,
        false
      );
      this.addStaticObstacle(new THREE.Vector3(position.x - doorwaySign * size.x * 0.5, 0, position.z), new THREE.Vector2(wallThickness, size.y), height, color, false);
      this.addStaticObstacle(new THREE.Vector3(position.x, 0, position.z - size.y * 0.5), new THREE.Vector2(size.x, wallThickness), height, color, false);
      this.addStaticObstacle(new THREE.Vector3(position.x, 0, position.z + size.y * 0.5), new THREE.Vector2(size.x, wallThickness), height, color, false);
    }

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(size.x * 1.04, roofThickness, size.y * 1.04),
      new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.78, metalness: 0.04 })
    );
    roof.position.set(position.x, height + roofThickness * 0.5, position.z);
    this.environmentGroup.add(roof);
    this.tagTarget(roof, 'static', null);
    this.raycastTargets.push(roof);
    this.cameraObstacles.push(roof);
    this.walkableSurfaces.push({
      minX: position.x - size.x * 0.52,
      maxX: position.x + size.x * 0.52,
      minZ: position.z - size.y * 0.52,
      maxZ: position.z + size.y * 0.52,
      height: roof.position.y + roofThickness * 0.5
    });

    if (!addLootSpots) {
      return;
    }

    const lootOffsets = [
      new THREE.Vector3(size.x * 0.22, 0, size.y * 0.22),
      new THREE.Vector3(-size.x * 0.22, 0, size.y * 0.22),
      new THREE.Vector3(size.x * 0.22, 0, -size.y * 0.22),
      new THREE.Vector3(-size.x * 0.22, 0, -size.y * 0.22)
    ];

    for (const offset of lootOffsets) {
      const point = position.clone().add(offset);
      if (point.length() < MAP_RADIUS - 8) {
        this.lootSpawnPoints.push(point);
      }
    }
  }

  private addStairFlight(
    start: THREE.Vector3,
    width: number,
    stepCount: number,
    stepHeight: number,
    stepDepth: number,
    yaw: number,
    color: number
  ): THREE.Vector3 {
    const direction = yawToDirection(yaw);
    for (let step = 0; step < stepCount; step += 1) {
      const center = start.clone().addScaledVector(direction, (step + 0.5) * stepDepth);
      center.y += stepHeight * (step + 0.5);
      this.addRaisedStaticObstacle(
        center,
        new THREE.Vector3(width, stepHeight, stepDepth),
        color,
        true,
        0.78,
        0.08
      );
    }

    return start.clone().addScaledVector(direction, stepDepth * stepCount).add(new THREE.Vector3(0, stepHeight * stepCount, 0));
  }

  private createTallStructure(center: THREE.Vector3, baseColor: number, accentColor: number, towerHeight: number): void {
    const footprint = new THREE.Vector2(this.rng.range(9, 12), this.rng.range(9, 12));
    const annexSize = new THREE.Vector2(this.rng.range(6, 8), this.rng.range(5, 7));
    const annexOffset = new THREE.Vector3(footprint.x * 0.7, 0, -footprint.y * 0.55);
    this.addTerrainPatch(center, footprint.x * 1.6, footprint.y * 1.5, new THREE.Color(baseColor).offsetHSL(0, 0.02, -0.08).getHex(), 0.22, 0);

    this.createStructureShell(center, footprint, towerHeight, baseColor, true);
    this.addCompoundDecor(center, footprint, towerHeight, baseColor);

    const annexPosition = center.clone().add(annexOffset);
    this.createStructureShell(annexPosition, annexSize, towerHeight * 0.48, new THREE.Color(baseColor).offsetHSL(0.01, 0.04, 0.06).getHex(), true);
    this.addCompoundDecor(annexPosition, annexSize, towerHeight * 0.48, accentColor);

    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(footprint.x * 1.12, 0.45, footprint.y * 1.12),
      new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.58, metalness: 0.16 })
    );
    crown.position.set(center.x, towerHeight + 0.55, center.z);
    this.environmentGroup.add(crown);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, towerHeight * 0.26, 10),
      new THREE.MeshStandardMaterial({ color: 0x394552, roughness: 0.55, metalness: 0.45 })
    );
    mast.position.set(center.x, towerHeight + 1.5 + (towerHeight * 0.13), center.z);
    this.environmentGroup.add(mast);

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffd385, emissive: 0xffb251, emissiveIntensity: 0.65, roughness: 0.3 })
    );
    beacon.position.set(center.x, towerHeight + 3.2, center.z);
    this.environmentGroup.add(beacon);

    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0xeef7ff,
      emissive: 0x92b9d5,
      emissiveIntensity: 0.16,
      roughness: 0.35,
      metalness: 0.08
    });
    const windowHeights = [towerHeight * 0.28, towerHeight * 0.46, towerHeight * 0.64];
    for (const bandHeight of windowHeights) {
      const frontBand = new THREE.Mesh(new THREE.BoxGeometry(footprint.x * 0.72, 0.28, 0.16), windowMaterial);
      frontBand.position.set(center.x, bandHeight, center.z + (footprint.y * 0.51));
      this.environmentGroup.add(frontBand);

      const sideBand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, footprint.y * 0.62), windowMaterial);
      sideBand.position.set(center.x - (footprint.x * 0.51), bandHeight + 0.34, center.z);
      this.environmentGroup.add(sideBand);
    }
  }

  private createMegaStructure(center: THREE.Vector3, baseColor: number, accentColor: number, floorCount: number): void {
    const footprint = new THREE.Vector2(this.rng.range(14, 18), this.rng.range(13, 17));
    const annexSize = new THREE.Vector2(this.rng.range(8, 10), this.rng.range(8, 10));
    const levelHeight = 3.8;
    const towerHeight = floorCount * levelHeight + 2.2;
    const floorThickness = 0.28;
    const platformWidth = footprint.x * 0.44;
    const platformDepth = footprint.y * 0.72;
    const platformOffsetX = footprint.x * 0.23;
    const stairWidth = Math.max(2.6, footprint.x * 0.24);
    const stairHeight = 0.46;
    const stairDepth = 0.9;
    const stairCount = Math.max(7, Math.ceil(levelHeight / stairHeight));
    const darkerBase = new THREE.Color(baseColor).offsetHSL(0, 0.04, -0.1).getHex();
    const platformColor = new THREE.Color(baseColor).offsetHSL(0.01, 0.05, 0.12).getHex();
    const stairColor = new THREE.Color(accentColor).offsetHSL(0, 0.02, -0.08).getHex();
    const annexPosition = center.clone().add(new THREE.Vector3((footprint.x * 0.5) + (annexSize.x * 0.42), 0, footprint.y * 0.14));

    this.addTerrainPatch(center, footprint.x * 1.78, footprint.y * 1.64, darkerBase, 0.24, this.rng.range(-0.16, 0.16));
    this.createStructureShell(center, footprint, towerHeight, baseColor, true);
    this.addCompoundDecor(center, footprint, towerHeight, accentColor);
    this.createStructureShell(annexPosition, annexSize, towerHeight * 0.58, new THREE.Color(baseColor).offsetHSL(0.02, 0.06, 0.08).getHex(), true);
    this.addCompoundDecor(annexPosition, annexSize, towerHeight * 0.58, accentColor);

    for (let level = 0; level < floorCount - 1; level += 1) {
      const leftSide = level % 2 === 0;
      const platformCenter = new THREE.Vector3(
        center.x + (leftSide ? -platformOffsetX : platformOffsetX),
        (level + 1) * levelHeight,
        center.z
      );

      this.addRaisedStaticObstacle(
        new THREE.Vector3(platformCenter.x, platformCenter.y + floorThickness * 0.5, platformCenter.z),
        new THREE.Vector3(platformWidth, floorThickness, platformDepth),
        platformColor,
        true,
        0.72,
        0.08
      );
      this.lootSpawnPoints.push(
        platformCenter.clone().add(new THREE.Vector3(0, floorThickness * 0.5, leftSide ? platformDepth * 0.18 : -platformDepth * 0.18))
      );

      const stairStart = new THREE.Vector3(
        center.x + (leftSide ? -platformOffsetX : platformOffsetX),
        level * levelHeight,
        center.z + (leftSide ? -footprint.y * 0.46 : footprint.y * 0.46)
      );
      this.addStairFlight(stairStart, stairWidth, stairCount, stairHeight, stairDepth, leftSide ? 0 : Math.PI, stairColor);
    }

    const roofSideLeft = (floorCount - 1) % 2 === 0;
    const roofStairStart = new THREE.Vector3(
      center.x + (roofSideLeft ? -platformOffsetX : platformOffsetX),
      (floorCount - 1) * levelHeight,
      center.z + (roofSideLeft ? -footprint.y * 0.46 : footprint.y * 0.46)
    );
    this.addStairFlight(
      roofStairStart,
      stairWidth,
      Math.max(4, Math.ceil((towerHeight - ((floorCount - 1) * levelHeight) - 0.9) / stairHeight)),
      stairHeight,
      stairDepth,
      roofSideLeft ? 0 : Math.PI,
      stairColor
    );

    const roofDeckCenter = new THREE.Vector3(center.x, towerHeight - 0.85, center.z);
    this.addRaisedStaticObstacle(
      new THREE.Vector3(roofDeckCenter.x, roofDeckCenter.y + floorThickness * 0.5, roofDeckCenter.z),
      new THREE.Vector3(footprint.x * 0.5, floorThickness, footprint.y * 0.5),
      accentColor,
      true,
      0.64,
      0.16
    );
    this.lootSpawnPoints.push(roofDeckCenter.clone().add(new THREE.Vector3(0, floorThickness * 0.5, 0)));

    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(footprint.x * 1.12, 0.45, footprint.y * 1.12),
      new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.54, metalness: 0.2 })
    );
    crown.position.set(center.x, towerHeight + 0.55, center.z);
    this.environmentGroup.add(crown);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.34, towerHeight * 0.34, 10),
      new THREE.MeshStandardMaterial({ color: 0x394552, roughness: 0.46, metalness: 0.52 })
    );
    mast.position.set(center.x, towerHeight + 1.2 + (towerHeight * 0.17), center.z);
    this.environmentGroup.add(mast);

    const beacon = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.82, 0),
      new THREE.MeshStandardMaterial({ color: 0xffd385, emissive: 0xffb251, emissiveIntensity: 0.72, roughness: 0.24 })
    );
    beacon.position.set(center.x, towerHeight + 3.9, center.z);
    this.environmentGroup.add(beacon);

    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0xeef7ff,
      emissive: 0x92b9d5,
      emissiveIntensity: 0.22,
      roughness: 0.32,
      metalness: 0.12
    });
    for (let level = 1; level <= floorCount; level += 1) {
      const bandHeight = level * levelHeight - 0.85;
      const frontBand = new THREE.Mesh(new THREE.BoxGeometry(footprint.x * 0.78, 0.3, 0.16), windowMaterial);
      frontBand.position.set(center.x, bandHeight, center.z + (footprint.y * 0.51));
      this.environmentGroup.add(frontBand);

      const backBand = new THREE.Mesh(new THREE.BoxGeometry(footprint.x * 0.62, 0.28, 0.16), windowMaterial);
      backBand.position.set(center.x, bandHeight + 0.24, center.z - (footprint.y * 0.51));
      this.environmentGroup.add(backBand);

      const sideBand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, footprint.y * 0.68), windowMaterial);
      sideBand.position.set(center.x - (footprint.x * 0.51), bandHeight + 0.36, center.z);
      this.environmentGroup.add(sideBand);
    }
  }

  private createCityDistrict(center: THREE.Vector3, baseColor: number, accentColor: number, density: number): void {
    const districtRadius = 24 + density * 6;
    const streetColor = new THREE.Color(baseColor).offsetHSL(0, -0.04, -0.2).getHex();
    const plazaColor = new THREE.Color(baseColor).offsetHSL(0, -0.02, -0.12).getHex();
    this.addTerrainPatch(center, districtRadius * 1.28, districtRadius * 1.1, plazaColor, 0.26, this.rng.range(-0.08, 0.08));
    this.addRoad(
      center.clone().add(new THREE.Vector3(-districtRadius, 0, 0)),
      center.clone().add(new THREE.Vector3(districtRadius, 0, 0)),
      12,
      streetColor
    );
    this.addRoad(
      center.clone().add(new THREE.Vector3(0, 0, -districtRadius)),
      center.clone().add(new THREE.Vector3(0, 0, districtRadius)),
      12,
      streetColor
    );
    this.addRoad(
      center.clone().add(new THREE.Vector3(-districtRadius * 0.84, 0, -districtRadius * 0.84)),
      center.clone().add(new THREE.Vector3(districtRadius * 0.84, 0, districtRadius * 0.84)),
      7.8,
      streetColor
    );
    this.addRoad(
      center.clone().add(new THREE.Vector3(districtRadius * 0.84, 0, -districtRadius * 0.84)),
      center.clone().add(new THREE.Vector3(-districtRadius * 0.84, 0, districtRadius * 0.84)),
      7.8,
      streetColor
    );

    const blockOffsets = [
      new THREE.Vector3(-districtRadius * 0.46, 0, -districtRadius * 0.34),
      new THREE.Vector3(districtRadius * 0.42, 0, -districtRadius * 0.36),
      new THREE.Vector3(-districtRadius * 0.48, 0, districtRadius * 0.38),
      new THREE.Vector3(districtRadius * 0.4, 0, districtRadius * 0.34),
      new THREE.Vector3(0, 0, districtRadius * 0.02)
    ];

    blockOffsets.forEach((offset, index) => {
      const blockCenter = center.clone().add(offset);
      const baseVariant = new THREE.Color(baseColor).offsetHSL(0.01 * index, 0.04, this.rng.range(-0.04, 0.08)).getHex();
      const accentVariant = new THREE.Color(accentColor).offsetHSL(0, 0.02, this.rng.range(-0.05, 0.1)).getHex();
      if (index === 0 || index === 3 || density >= 4) {
        this.createMegaStructure(blockCenter, baseVariant, accentVariant, density + 2 + (index % 2));
      } else {
        this.createTallStructure(blockCenter, baseVariant, accentVariant, 15 + density + index * 1.2);
      }
    });

    const plaza = this.addRaisedStaticObstacle(
      new THREE.Vector3(center.x, 0.18, center.z),
      new THREE.Vector3(12, 0.36, 12),
      new THREE.Color(accentColor).offsetHSL(0, -0.02, 0.04).getHex(),
      true,
      0.88,
      0.08
    );
    this.lootSpawnPoints.push(center.clone().add(new THREE.Vector3(0, plaza.height - 0.04, 0)));

    const streetCoverOffsets = [
      new THREE.Vector3(-8, 0, 6),
      new THREE.Vector3(10, 0, -4),
      new THREE.Vector3(-12, 0, -10),
      new THREE.Vector3(14, 0, 12)
    ];
    for (const offset of streetCoverOffsets) {
      const coverPosition = center.clone().add(offset);
      this.addStaticObstacle(
        coverPosition,
        new THREE.Vector2(this.rng.range(2.4, 4.2), this.rng.range(5.2, 7.6)),
        this.rng.range(2.1, 3.3),
        new THREE.Color(baseColor).offsetHSL(0.02, 0.02, -0.12).getHex(),
        false
      );
      this.lootSpawnPoints.push(coverPosition.clone().add(new THREE.Vector3(0, 0, 3.4)));
    }
  }

  private scatterScatteredBuildings(
    biome: Biome,
    count: number,
    minRadius: number,
    maxRadius: number,
    basePalette: number[],
    accentPalette: number[]
  ): void {
    for (let index = 0; index < count; index += 1) {
      const center = this.findBiomeFreePoint(biome, minRadius, maxRadius, 26);
      const baseColor = this.rng.pick(basePalette);
      const accentColor = this.rng.pick(accentPalette);
      const roll = this.rng.next();

      if (roll < 0.42) {
        this.createScatteredOutpost(center, baseColor, accentColor);
      } else if (roll < 0.74) {
        this.createTallStructure(center, baseColor, accentColor, this.rng.range(12.8, 18.4));
      } else {
        this.createSmallHut(center, baseColor, accentColor);
        const annexPoint = this.findBiomeFreePoint(biome, Math.max(minRadius, center.length() - 26), Math.min(maxRadius, center.length() + 26), 16);
        this.createSmallHut(
          annexPoint,
          new THREE.Color(baseColor).offsetHSL(0.01, 0.02, 0.04).getHex(),
          accentColor
        );
      }
    }
  }

  private createScatteredOutpost(center: THREE.Vector3, baseColor: number, accentColor: number): void {
    const boxCount = this.rng.int(2, 4);
    const boxes: Array<{ offset: THREE.Vector3; size: THREE.Vector2; height: number }> = [];
    for (let index = 0; index < boxCount; index += 1) {
      const offset = index === 0
        ? new THREE.Vector3(0, 0, 0)
        : new THREE.Vector3(this.rng.range(-14, 14), 0, this.rng.range(-14, 14));
      boxes.push({
        offset,
        size: new THREE.Vector2(this.rng.range(7.5, 13.5), this.rng.range(6.5, 12.5)),
        height: this.rng.range(4.2, 7.8)
      });
    }

    this.addTerrainPatch(
      center,
      this.rng.range(18, 28),
      this.rng.range(16, 24),
      new THREE.Color(baseColor).offsetHSL(0, 0.03, -0.08).getHex(),
      0.2,
      this.rng.range(-0.3, 0.3)
    );
    this.createCompound(center, baseColor, boxes);

    if (this.rng.next() > 0.38) {
      const hutOffset = new THREE.Vector3(this.rng.range(-18, 18), 0, this.rng.range(-18, 18));
      this.createSmallHut(
        center.clone().add(hutOffset),
        new THREE.Color(baseColor).offsetHSL(0.01, 0.02, 0.06).getHex(),
        accentColor
      );
    }

    if (this.rng.next() > 0.52) {
      const towerOffset = new THREE.Vector3(this.rng.range(-16, 16), 0, this.rng.range(-16, 16));
      this.createTallStructure(
        center.clone().add(towerOffset),
        new THREE.Color(baseColor).offsetHSL(0, 0.03, -0.02).getHex(),
        accentColor,
        this.rng.range(11.4, 14.4)
      );
    }

    const coverOffsets = [
      new THREE.Vector3(-8, 0, 6),
      new THREE.Vector3(8, 0, -6),
      new THREE.Vector3(-10, 0, -8),
      new THREE.Vector3(10, 0, 8)
    ];
    for (const coverOffset of coverOffsets) {
      if (this.rng.next() > 0.65) {
        continue;
      }

      const coverPoint = center.clone().add(coverOffset.clone().multiplyScalar(this.rng.range(0.7, 1.25)));
      this.addStaticObstacle(
        coverPoint,
        new THREE.Vector2(this.rng.range(2.4, 4.4), this.rng.range(2.2, 4)),
        this.rng.range(2.1, 3.4),
        new THREE.Color(accentColor).offsetHSL(0, -0.02, -0.1).getHex(),
        false
      );
      this.lootSpawnPoints.push(coverPoint.clone().add(new THREE.Vector3(0, 0, 3.1)));
    }
  }

  private createSmallHut(center: THREE.Vector3, baseColor: number, accentColor: number): void {
    const footprint = new THREE.Vector2(this.rng.range(5.2, 7.8), this.rng.range(4.8, 7.2));
    const hutHeight = this.rng.range(3.2, 4.4);
    const patchColor = new THREE.Color(baseColor).offsetHSL(0, 0.03, -0.1).getHex();
    this.addTerrainPatch(center, footprint.x * 1.4, footprint.y * 1.26, patchColor, 0.2, this.rng.range(-0.2, 0.2));
    this.createStructureShell(center, footprint, hutHeight, baseColor, true);
    this.addCompoundDecor(center, footprint, hutHeight, accentColor);

    const crateOffset = new THREE.Vector3(footprint.x * 0.7, 0, footprint.y * 0.46);
    this.addStaticObstacle(
      center.clone().add(crateOffset),
      new THREE.Vector2(1.8, 1.8),
      1.6,
      new THREE.Color(accentColor).offsetHSL(0, 0.02, -0.06).getHex(),
      false
    );
    this.lootSpawnPoints.push(center.clone().add(new THREE.Vector3(0, 0, 0)));
  }

  private addResourceNodeAt(position: THREE.Vector3, materialType?: MaterialType): void {
    const node = this.createResourceNode(
      position,
      materialType ?? this.pickResourceMaterialForBiome(position),
      this.resourceNodes.length
    );
    this.resourceNodes.push(node);
    this.environmentGroup.add(node.mesh);
    this.raycastTargets.push(node.mesh);
    this.cameraObstacles.push(node.mesh);
  }

  private populateRegularBiomeCover(): void {
    for (let i = 0; i < 10 * MAP_SCALE; i += 1) {
      const point = this.findBiomeFreePoint('regular', MAP_RADIUS * 0.12, MAP_RADIUS * 0.96, 5.2);
      this.addResourceNodeAt(point, this.rng.next() > 0.24 ? 'wood' : 'stone');
    }

    for (let i = 0; i < 5 * MAP_SCALE; i += 1) {
      const clusterCenter = this.findBiomeFreePoint('regular', MAP_RADIUS * 0.16, MAP_RADIUS * 0.96, 14);
      this.createRockCluster(clusterCenter, this.rng.int(3, 6), this.rng.range(10, 18));
    }

    for (let i = 0; i < 3 * MAP_SCALE; i += 1) {
      const hutCenter = this.findBiomeFreePoint('regular', MAP_RADIUS * 0.18, MAP_RADIUS * 0.94, 16);
      this.createSmallHut(
        hutCenter,
        this.rng.pick([0x6f735f, 0x677463, 0x7b7a63, 0x6a7267]),
        this.rng.pick([0xc3d5cf, 0xf0ddb0, 0xb2d3e0])
      );

      for (let treeIndex = 0; treeIndex < 3; treeIndex += 1) {
        const treePoint = this.findBiomeFreePoint('regular', MAP_RADIUS * 0.18, MAP_RADIUS * 0.96, 5);
        this.addResourceNodeAt(treePoint, 'wood');
      }
    }
  }

  private createRockCluster(center: THREE.Vector3, count: number, radius: number): void {
    for (let i = 0; i < count; i += 1) {
      const offset = randomPointInCircle(this.rng, radius);
      const point = center.clone().add(offset);
      if (!this.isPointClear(point, 5.5)) {
        continue;
      }

      const size = new THREE.Vector2(this.rng.range(3.2, 6.8), this.rng.range(3, 6.2));
      const height = this.rng.range(2.4, 5.6);
      this.addRockObstacle(point, size, height);
    }
  }

  private createCentralArena(): void {
    this.addGroundDisc(14, 0x7c6242, 0.015, 0.7);

    const innerRing = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(this.makeCirclePoints(14, 48)),
      new THREE.LineBasicMaterial({ color: 0xffe1ac, opacity: 0.45, transparent: true })
    );
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.08;
    this.environmentGroup.add(innerRing);

    const coverPoints = [
      new THREE.Vector3(-6, 0, -6),
      new THREE.Vector3(6, 0, -6),
      new THREE.Vector3(-6, 0, 6),
      new THREE.Vector3(6, 0, 6)
    ];

    for (const point of coverPoints) {
      this.addStaticObstacle(point, new THREE.Vector2(3.6, 3.6), 2.8, 0x6b7078, false);
      this.lootSpawnPoints.push(point.clone().add(new THREE.Vector3(0, 0, 3.2)));
    }

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.7, 8.5, 12),
      new THREE.MeshStandardMaterial({ color: 0x404c59, roughness: 0.7, metalness: 0.4 })
    );
    mast.position.set(0, 4.25, 0);
    this.environmentGroup.add(mast);

    const beacon = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.2, 0),
      new THREE.MeshStandardMaterial({ color: 0xffc76a, emissive: 0xff9a3d, emissiveIntensity: 0.6, roughness: 0.25 })
    );
    beacon.position.set(0, 9.5, 0);
    this.environmentGroup.add(beacon);
  }

  private addCompoundDecor(position: THREE.Vector3, size: THREE.Vector2, height: number, color: number): void {
    const trimColor = new THREE.Color(color).offsetHSL(0.02, 0.08, 0.16);

    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(size.x * 0.28, 0.22, size.y * 0.18),
      new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.55, metalness: 0.12 })
    );
    trim.position.set(position.x, height * 0.6, position.z + size.y * 0.52);
    this.environmentGroup.add(trim);

    const vent = new THREE.Mesh(
      new THREE.BoxGeometry(size.x * 0.18, 0.18, size.y * 0.18),
      new THREE.MeshStandardMaterial({ color: 0x4a5764, roughness: 0.66, metalness: 0.16 })
    );
    vent.position.set(position.x - size.x * 0.14, height + 0.46, position.z - size.y * 0.1);
    this.environmentGroup.add(vent);
  }

  private addRockObstacle(position: THREE.Vector3, size: THREE.Vector2, height: number): void {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0x6f7a80, roughness: 0.92, metalness: 0.06 })
    );
    mesh.position.set(position.x, height * 0.42, position.z);
    mesh.scale.set(size.x * 0.4, height * 0.34, size.y * 0.4);
    mesh.rotation.set(this.rng.range(-0.24, 0.24), this.rng.range(0, Math.PI * 2), this.rng.range(-0.2, 0.2));
    this.environmentGroup.add(mesh);
    this.tagTarget(mesh, 'static', null);

    const obstacle: ObstacleBox = {
      minX: position.x - size.x * 0.5,
      maxX: position.x + size.x * 0.5,
      minZ: position.z - size.y * 0.5,
      maxZ: position.z + size.y * 0.5,
      height,
      mesh
    };

    this.staticObstacles.push(obstacle);
    this.raycastTargets.push(mesh);
    this.cameraObstacles.push(mesh);
  }

  private spawnResourceNodes(): void {
    for (let i = 0; i < RESOURCE_RESPAWN_COUNT; i += 1) {
      const position = this.findFreePoint(MAP_RADIUS - 10, 4.5);
      const materialType = this.pickResourceMaterialForBiome(position);
      const node = this.createResourceNode(position, materialType, i);
      this.resourceNodes.push(node);
      this.environmentGroup.add(node.mesh);
      this.raycastTargets.push(node.mesh);
      this.cameraObstacles.push(node.mesh);
    }
  }

  private pickResourceMaterialForBiome(position: THREE.Vector3): MaterialType {
    const biome = this.getBiomeAtPosition(position);
    const materialTypes: MaterialType[] =
      biome === 'forest'
        ? ['wood', 'wood', 'wood', 'wood', 'wood', 'wood', 'stone', 'stone', 'metal']
        : biome === 'desert'
          ? ['wood', 'stone', 'stone', 'stone', 'stone', 'metal', 'metal']
          : ['wood', 'wood', 'wood', 'wood', 'stone', 'stone', 'metal'];
    return this.rng.pick(materialTypes);
  }

  private createResourceNode(position: THREE.Vector3, materialType: MaterialType, index: number): ResourceNode {
    const mesh = new THREE.Group();
    const color = RESOURCE_COLORS[materialType];
    const biome = this.getBiomeAtPosition(position);

    if (materialType === 'wood') {
      const trunkHeight = biome === 'forest' ? 3.6 : biome === 'desert' ? 2.8 : 3.1;
      const canopySize = biome === 'forest' ? 2.25 : biome === 'desert' ? 1.45 : 1.9;
      const canopyColor = biome === 'forest' ? 0x4d8e37 : biome === 'desert' ? 0x8a9550 : 0x5f8f43;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.6, trunkHeight, 8),
        new THREE.MeshStandardMaterial({ color: 0x6d4c2e, roughness: 1 })
      );
      trunk.position.y = trunkHeight * 0.5;

      const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(canopySize, 10, 10),
        new THREE.MeshStandardMaterial({ color: canopyColor, roughness: 1 })
      );
      canopy.position.y = trunkHeight + (canopySize * 0.92);
      mesh.add(trunk, canopy);
    } else {
      const base = new THREE.Mesh(
        new THREE.DodecahedronGeometry(materialType === 'stone' ? 1.6 : 1.35, 0),
        new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: materialType === 'metal' ? 0.45 : 0 })
      );
      base.position.y = materialType === 'stone' ? 1.3 : 1.1;
      mesh.add(base);

      if (materialType === 'metal') {
        const brace = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.4, 1.2),
          new THREE.MeshStandardMaterial({ color: 0xbec8cf, roughness: 0.55, metalness: 0.8 })
        );
        brace.position.y = 2.4;
        mesh.add(brace);
      }
    }

    mesh.position.copy(position);
    this.tagTarget(mesh, 'resource', null);

    return {
      id: `resource-${index}`,
      mesh,
      position: position.clone(),
      materialType,
      health: materialType === 'wood' ? 100 : 120,
      totalYield: materialType === 'metal' ? 48 : 60,
      yieldPerHit: materialType === 'metal' ? 10 : 12,
      obstacle: {
        minX: position.x - 1.45,
        maxX: position.x + 1.45,
        minZ: position.z - 1.45,
        maxZ: position.z + 1.45,
        height: materialType === 'wood' ? 3.5 : 2.7,
        mesh
      }
    };
  }

  private makeSkyDropStart(groundSpawn: THREE.Vector3, playerControlled: boolean): THREE.Vector3 {
    const horizontalStart = playerControlled
      ? randomPointInCircle(this.rng, MAP_RADIUS * 0.08)
      : clampToCircle(
          groundSpawn.clone().add(randomPointInCircle(this.rng, MAP_RADIUS * 0.18)),
          WORLD_CENTER,
          MAP_RADIUS * 0.42
        );
    horizontalStart.y = SKYDIVE_ALTITUDE + (playerControlled ? 0 : this.rng.range(-4, 4));
    return horizontalStart;
  }

  private spawnParticipants(): void {
    const participantCount = this.getParticipantCount();
    const botCount = this.getBotCount();
    this.participantSpawns = this.generateParticipantSpawns(participantCount, this.getTeamSize());

    this.player = this.createActor(
      'player',
      this.participantSpawns[0],
      0x2dd4bf,
      0x4fd1ff,
      0,
      this.makeSkyDropStart(this.participantSpawns[0], true)
    );
    this.player.yaw = this.cameraYaw;
    this.actors.push(this.player);

    for (let i = 0; i < botCount; i += 1) {
      const spawn = this.participantSpawns[i + 1];
      const bot = this.createActor(
        'bot',
        spawn,
        new THREE.Color().setHSL(this.rng.next(), 0.45, 0.55).getHex(),
        0xffffff,
        this.getTeamIdForParticipant(i + 1),
        this.makeSkyDropStart(spawn, false)
      );
      bot.ai = {
        state: 'roam',
        destination: spawn.clone(),
        path: [],
        pathIndex: 0,
        decisionTimer: this.rng.range(0.35, 0.8),
        repathTimer: 0,
        strafeDirection: this.rng.next() > 0.5 ? 1 : -1,
        strafeTimer: this.rng.range(1.2, 2.1),
        buildCooldown: this.rng.range(2.4, 5.8),
        harvestTimer: this.rng.range(0.45, 1.1)
      };
      this.actors.push(bot);
    }

    this.refreshActorPresentations();
    this.cameraYaw = Math.PI;
    this.cameraPitch = -0.16;
    this.cameraRigInitialized = false;
    this.lastFirstPersonView = false;
  }

  private createParachuteMesh(color: number, accent: number): THREE.Group {
    const group = new THREE.Group();
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(2.35, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({ color, roughness: 0.56, metalness: 0.08 })
    );
    canopy.position.y = 4.6;
    canopy.scale.y = 0.7;

    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(2.08, 0.08, 8, 26),
      new THREE.MeshStandardMaterial({ color: accent, roughness: 0.42, metalness: 0.14 })
    );
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 4.08;

    const lineMaterial = new THREE.MeshStandardMaterial({ color: 0xe6f1f7, roughness: 0.3, metalness: 0.18 });
    const lineOffsets = [
      new THREE.Vector3(-1.4, 4.05, -0.6),
      new THREE.Vector3(1.4, 4.05, -0.6),
      new THREE.Vector3(-1.4, 4.05, 0.6),
      new THREE.Vector3(1.4, 4.05, 0.6)
    ];
    for (const offset of lineOffsets) {
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.2, 6), lineMaterial);
      line.position.copy(offset.clone().multiplyScalar(0.5));
      line.position.y = 2.65;
      line.lookAt(offset);
      line.rotateX(Math.PI / 2);
      group.add(line);
    }

    group.add(canopy, trim);
    group.visible = false;
    return group;
  }

  private createActor(
    kind: ActorKind,
    groundSpawn: THREE.Vector3,
    color: number,
    accent: number,
    teamId: number,
    dropStart: THREE.Vector3
  ): Actor {
    const group = new THREE.Group();
    const visualRoot = new THREE.Group();

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;

    const bootMaterial = new THREE.MeshStandardMaterial({ color: 0x1c2229, roughness: 0.86 });
    const clothMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.72 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.42, metalness: 0.08 });
    const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xffdfc0, roughness: 0.92 });
    const gearMaterial = new THREE.MeshStandardMaterial({ color: 0x253447, roughness: 0.66, metalness: 0.18 });

    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 14), gearMaterial);
    pelvis.position.set(0, 0.95, 0.02);
    pelvis.scale.set(1.15, 0.82, 0.95);

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.82, 5, 12), clothMaterial);
    body.position.y = 1.62;

    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.48, 0.18), accentMaterial);
    chestPlate.position.set(0, 1.62, 0.28);

    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.6, 0.2), gearMaterial);
    backpack.position.set(0, 1.56, -0.28);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.16, 10), skinMaterial);
    neck.position.y = 2.1;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), skinMaterial);
    head.position.y = 2.38;
    head.scale.set(1, 1.08, 1);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.11, 0.08), accentMaterial);
    visor.position.set(0, 2.4, 0.24);

    const shoulderPadLeft = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), gearMaterial);
    shoulderPadLeft.position.set(-0.36, 1.88, 0.02);
    shoulderPadLeft.scale.set(1.3, 0.8, 1.1);

    const shoulderPadRight = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), gearMaterial);
    shoulderPadRight.position.set(0.36, 1.88, 0.02);
    shoulderPadRight.scale.set(1.3, 0.8, 1.1);

    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.4, 1.9, 0.02);
    const leftUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.115, 0.58, 10), clothMaterial);
    leftUpperArm.position.y = -0.3;
    const leftElbow = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), gearMaterial);
    leftElbow.position.y = -0.62;
    const leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.5, 10), gearMaterial);
    leftForearm.position.y = -0.88;
    const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), skinMaterial);
    leftHand.position.y = -1.2;
    leftArmPivot.add(leftUpperArm, leftForearm, leftHand);
    leftArmPivot.add(leftElbow);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.4, 1.9, 0.02);
    const rightUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.115, 0.58, 10), clothMaterial);
    rightUpperArm.position.y = -0.3;
    const rightElbow = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), gearMaterial);
    rightElbow.position.y = -0.62;
    const rightForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.5, 10), gearMaterial);
    rightForearm.position.y = -0.88;
    const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), skinMaterial);
    rightHand.position.y = -1.2;
    rightArmPivot.add(rightUpperArm, rightForearm, rightHand);
    rightArmPivot.add(rightElbow);

    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.18, 0.92, 0.03);
    const leftThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.12, 0.66, 10), clothMaterial);
    leftThigh.position.y = -0.36;
    const leftKnee = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), gearMaterial);
    leftKnee.position.y = -0.68;
    const leftShin = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.1, 0.64, 10), gearMaterial);
    leftShin.position.y = -0.98;
    const leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.42), bootMaterial);
    leftFoot.position.set(0, -1.36, 0.1);
    leftLegPivot.add(leftThigh, leftShin, leftFoot);
    leftLegPivot.add(leftKnee);

    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.18, 0.92, 0.03);
    const rightThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.12, 0.66, 10), clothMaterial);
    rightThigh.position.y = -0.36;
    const rightKnee = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), gearMaterial);
    rightKnee.position.y = -0.68;
    const rightShin = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.1, 0.64, 10), gearMaterial);
    rightShin.position.y = -0.98;
    const rightFoot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.42), bootMaterial);
    rightFoot.position.set(0, -1.36, 0.1);
    rightLegPivot.add(rightThigh, rightShin, rightFoot);
    rightLegPivot.add(rightKnee);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.02, 1.18, 24),
      new THREE.MeshBasicMaterial({
        color: kind === 'player' ? 0x3bdad6 : 0xff7c70,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.48
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;

    const parachute = this.createParachuteMesh(new THREE.Color(color).offsetHSL(0, 0.02, 0.1).getHex(), accent);

    visualRoot.add(
      pelvis,
      body,
      chestPlate,
      backpack,
      neck,
      head,
      visor,
      shoulderPadLeft,
      shoulderPadRight,
      leftArmPivot,
      rightArmPivot,
      leftLegPivot,
      rightLegPivot
    );
    group.add(shadow, visualRoot, ring, parachute);
    group.position.copy(dropStart);
    group.rotation.y = Math.PI;

    this.actorGroup.add(group);
    this.raycastTargets.push(body, head, chestPlate);

    const inventory: InventoryState = {
      mode: 'harvest',
      weapons: [],
      weaponIndex: 0,
      ammo: { light: 0, shells: 0 },
      materials: { wood: kind === 'player' ? 100 : 28, stone: 0, metal: 0 }
    };

    const actor: Actor = {
      id: `${kind}-${this.actors.length}`,
      kind,
      teamId,
      group,
      visualRoot,
      bodyMesh: body,
      headMesh: head,
      ringMesh: ring,
      shadowMesh: shadow,
      leftArmPivot,
      rightArmPivot,
      leftLegPivot,
      rightLegPivot,
      bodyParts: [visualRoot, shadow, parachute],
      parachuteGroup: parachute,
      position: group.position.clone(),
      lastPosition: group.position.clone(),
      verticalVelocity: 0,
      yaw: Math.PI,
      radius: ACTOR_RADIUS,
      health: 100,
      maxHealth: 100,
      alive: true,
      grounded: false,
      inventory,
      fireCooldown: 0,
      reloadTimer: 0,
      harvestCooldown: 0,
      eliminationCount: 0,
      moveBlend: 0,
      stepTime: this.rng.range(0, Math.PI * 2),
      spawnState: 'parachuting',
      spawnTimer: 0,
      dropStart: dropStart.clone(),
      dropTarget: groundSpawn.clone()
    };

    for (const child of [body, head, chestPlate]) {
      child.userData.kind = 'actor';
      child.userData.ref = actor;
    }

    return actor;
  }

  private refreshActorPresentations(): void {
    const playerTeamId = this.player.teamId;

    for (const actor of this.actors) {
      actor.kind = actor === this.player ? 'player' : 'bot';

      const ringMaterial = actor.ringMesh.material as THREE.MeshBasicMaterial;
      ringMaterial.color.setHex(
        actor === this.player ? 0x3bdad6 : actor.teamId === playerTeamId ? 0x6cf0b2 : 0xff7c70
      );
      actor.ringMesh.visible = actor !== this.player;
      actor.parachuteGroup.visible = actor.spawnState === 'parachuting';
    }
  }

  private getParticipantCount(): number {
    return this.isDuosMode() ? DUOS_TEAM_COUNT * DUOS_TEAM_SIZE : BOT_COUNT + 1;
  }

  private getBotCount(): number {
    return this.getParticipantCount() - 1;
  }

  private getTeamSize(): number {
    return this.isDuosMode() ? DUOS_TEAM_SIZE : 1;
  }

  private getTeamIdForParticipant(participantIndex: number): number {
    return this.isDuosMode() ? Math.floor(participantIndex / DUOS_TEAM_SIZE) : participantIndex;
  }

  private isDuosMode(): boolean {
    return this.matchMode === 'duos';
  }

  private spawnLoot(): void {
    const priorityWeapons = [WEAPON_DEFINITIONS[0], WEAPON_DEFINITIONS[2], WEAPON_DEFINITIONS[1]];

    for (let i = 0; i < this.lootSpawnPoints.length; i += 1) {
      const point = this.lootSpawnPoints[i];
      if (i < 18) {
        const weapon = priorityWeapons[i % priorityWeapons.length];
        this.createWeaponPickup(point, weapon, true);
      } else {
        this.spawnRandomFloorLoot(point, false);
      }

      if (this.isDuosMode()) {
        this.spawnRandomFloorLoot(this.getNearbyLootPoint(point), true);
      }
    }

    for (let i = 0; i < this.participantSpawns.length; i += 1) {
      this.spawnStarterLoadout(this.participantSpawns[i], i);
    }
  }

  private spawnRandomFloorLoot(position: THREE.Vector3, guaranteedSpawn: boolean): void {
    const roll = this.rng.next();
    if (!guaranteedSpawn && roll < 0.18) {
      return;
    }

    if (roll < 0.54) {
      this.createWeaponPickup(position, this.rng.pick(WEAPON_DEFINITIONS), false);
      return;
    }

    if (roll < 0.82) {
      const ammoType = this.rng.next() < 0.72 ? 'light' : 'shells';
      const amount = ammoType === 'light' ? this.rng.int(16, 32) : this.rng.int(6, 14);
      this.createAmmoPickup(position, ammoType, amount);
      return;
    }

    const materialType = this.rng.pick(['wood', 'wood', 'stone', 'metal'] as MaterialType[]);
    const amount = materialType === 'wood' ? this.rng.int(20, 40) : this.rng.int(14, 28);
    this.createMaterialPickup(position, materialType, amount);
  }

  private getNearbyLootPoint(origin: THREE.Vector3): THREE.Vector3 {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const point = origin.clone().add(new THREE.Vector3(this.rng.range(-2.2, 2.2), 0, this.rng.range(-2.2, 2.2)));
      if (horizontalDistance(WORLD_CENTER, point) > MAP_RADIUS - 6 || this.isPointInWater(point, 0.4)) {
        continue;
      }
      return point;
    }

    return origin.clone();
  }

  private createWeaponPickup(position: THREE.Vector3, weapon: WeaponDefinition, guaranteed: boolean): void {
    const mesh = new THREE.Group();

    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 0.16, 12),
      new THREE.MeshStandardMaterial({ color: guaranteed ? 0x273446 : 0x1f242d, roughness: 0.72, metalness: 0.2 })
    );
    plate.position.y = 0.16;

    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.08, 20),
      new THREE.MeshStandardMaterial({ color: weapon.color, emissive: weapon.color, emissiveIntensity: guaranteed ? 0.45 : 0.18, transparent: true, opacity: guaranteed ? 0.7 : 0.38 })
    );
    glow.position.y = 0.24;

    const weaponMesh = this.createWeaponDisplayModel(weapon, 'pickup');
    weaponMesh.position.y = 0.86;
    weaponMesh.rotation.y = guaranteed ? -0.34 : 0.24;
    weaponMesh.rotation.z = guaranteed ? 0.08 : -0.1;
    mesh.add(plate, glow, weaponMesh);

    const pickup: LootPickup = {
      id: `loot-weapon-${this.loot.length}`,
      kind: 'weapon',
      mesh,
      position: position.clone(),
      weapon,
      bobOffset: this.rng.range(0, Math.PI * 2)
    };

    this.attachPickup(pickup);
  }

  private createAmmoPickup(position: THREE.Vector3, ammoType: 'light' | 'shells', amount: number): void {
    const mesh = new THREE.Group();
    const baseColor = ammoType === 'light' ? 0xffd166 : 0xff924c;

    for (let i = 0; i < 3; i += 1) {
      const shell = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.75, 8),
        new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.45, metalness: 0.3 })
      );
      shell.position.set((i - 1) * 0.32, 0.5, (i % 2) * 0.2 - 0.1);
      mesh.add(shell);
    }

    const pickup: LootPickup = {
      id: `loot-ammo-${this.loot.length}`,
      kind: 'ammo',
      mesh,
      position: position.clone(),
      ammoType,
      amount,
      bobOffset: this.rng.range(0, Math.PI * 2)
    };

    this.attachPickup(pickup);
  }

  private createMaterialPickup(position: THREE.Vector3, materialType: MaterialType, amount: number): void {
    const mesh = new THREE.Group();
    const color = materialType === 'wood' ? 0xb97a3d : materialType === 'stone' ? 0xa1a9b2 : 0x9fb6c8;
    const pickupAmount = Math.max(FLOOR_MATERIAL_PICKUP_AMOUNT, amount);

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 1.05, 1.05),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: materialType === 'metal' ? 0.55 : 0.08 })
    );
    box.position.y = 0.7;
    mesh.add(box);

    const pickup: LootPickup = {
      id: `loot-material-${this.loot.length}`,
      kind: 'material',
      mesh,
      position: position.clone(),
      materialType,
      amount: pickupAmount,
      bobOffset: this.rng.range(0, Math.PI * 2)
    };

    this.attachPickup(pickup);
  }

  private attachPickup(pickup: LootPickup): void {
    pickup.mesh.position.copy(pickup.position);
    this.lootGroup.add(pickup.mesh);
    this.loot.push(pickup);
  }

  private initializeStorm(): void {
    this.storm = {
      mode: 'pause',
      phaseIndex: 0,
      timer: 0,
      currentCenter: new THREE.Vector3(),
      currentRadius: MAP_RADIUS - 3,
      startCenter: new THREE.Vector3(),
      startRadius: MAP_RADIUS - 3,
      targetCenter: new THREE.Vector3(),
      targetRadius: STORM_PHASES[0]?.targetRadius ?? MAP_RADIUS - 3,
      currentDamagePerSecond: STORM_PHASES[0]?.damagePerSecond ?? 1
    };

    this.prepareNextStormTarget();

    const stormMaterial = new THREE.MeshBasicMaterial({
      color: 0x8d4bff,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.stormWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 28, 64, 1, true), stormMaterial);
    this.stormWall.position.y = 14;
    this.stormGroup.add(this.stormWall);

    this.safeZoneDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshBasicMaterial({ color: 0xffe8a8, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
    );
    this.safeZoneDisc.rotation.x = -Math.PI / 2;
    this.safeZoneDisc.position.y = 0.03;
    this.stormGroup.add(this.safeZoneDisc);

    this.safeZoneRing = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(this.makeCirclePoints(1, 64)),
      new THREE.LineBasicMaterial({ color: 0xfff4cb, transparent: true, opacity: 0.82 })
    );
    this.safeZoneRing.rotation.x = -Math.PI / 2;
    this.safeZoneRing.position.y = 0.05;
    this.stormGroup.add(this.safeZoneRing);

    this.updateStormVisuals();
  }

  private ensurePreviewMesh(): void {
    if (this.previewMesh) {
      this.buildGroup.remove(this.previewMesh);
      this.disposeObject(this.previewMesh);
      this.previewMesh = null;
    }

    this.previewMesh = this.createBuildMesh(this.selectedBuildPiece, 0x7be0f6, true);
    this.previewMesh.visible = false;
    this.buildGroup.add(this.previewMesh);
  }

  private fixedUpdate(dt: number): void {
    if (this.timedMessage) {
      this.timedMessage.timeRemaining -= dt;
      if (this.timedMessage.timeRemaining <= 0) {
        this.timedMessage = null;
      }
    }

    if (this.state === 'ended') {
      if (this.options.showEndScreen !== false && this.justPressedKeys.has('Enter')) {
        this.resetMatch();
      }
      return;
    }

    this.matchTime += dt;
    this.viewModelKick = Math.max(0, this.viewModelKick - dt * 6.5);
    this.muzzleFlashTime = Math.max(0, this.muzzleFlashTime - dt * 7.5);
    this.viewModelSway.multiplyScalar(Math.max(0, 1 - dt * 7.5));
    this.updateStorm(dt);
    this.updateLootVisuals(this.matchTime);
    this.updateShotEffects(dt);
    this.processPlayer(dt);

    for (const actor of this.actors) {
      if (actor === this.player || !actor.alive) {
        continue;
      }
      this.processBot(actor, dt);
    }

    for (const actor of this.actors) {
      if (!actor.alive) {
        continue;
      }

      this.updateActorTimers(actor, dt);
      this.applyStormDamage(actor, dt);
      this.updateActorVisual(actor);
      this.tryAutoPickup(actor);
    }

    this.resolveActorSeparation();
    this.updateBuildPreview();
    this.checkMatchEnd();
  }

  private finishLanding(actor: Actor, groundHeight: number): void {
    actor.spawnState = 'grounded';
    actor.spawnTimer = 0;
    actor.position.y = groundHeight;
    actor.verticalVelocity = 0;
    actor.grounded = true;
    actor.parachuteGroup.visible = false;
    actor.lastPosition.copy(actor.position);

    if (actor.ai) {
      actor.ai.state = 'roam';
      actor.ai.destination.copy(this.findFreePoint(MAP_RADIUS - 18, 5));
      actor.ai.path = [];
      actor.ai.pathIndex = 0;
      actor.ai.decisionTimer = this.rng.range(0.22, 0.58);
      actor.ai.repathTimer = 0;
      actor.ai.targetActorId = undefined;
      actor.ai.targetLootId = undefined;
      actor.ai.targetNodeId = undefined;
    }

    if (actor === this.player) {
      this.showMessage('Touchdown. Loot fast before the storm starts moving.', 1.8);
    }
  }

  private updateActorSpawnState(actor: Actor, dt: number, steerInput?: THREE.Vector2): boolean {
    if (actor.spawnState === 'grounded') {
      return false;
    }

    actor.spawnTimer = Math.min(PARACHUTE_DURATION, actor.spawnTimer + dt);
    const forward = new THREE.Vector3(Math.sin(this.cameraYaw), 0, Math.cos(this.cameraYaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    if (steerInput && steerInput.lengthSq() > 0.001) {
      actor.dropTarget
        .addScaledVector(forward, steerInput.y * PARACHUTE_STEER_SPEED * dt)
        .addScaledVector(right, steerInput.x * PARACHUTE_STEER_SPEED * dt);
      actor.dropTarget.copy(clampToCircle(actor.dropTarget, WORLD_CENTER, MAP_RADIUS - PLAYER_SPAWN_PADDING - 1));
      actor.dropTarget.y = 0;
    }

    const progress = clamp(actor.spawnTimer / PARACHUTE_DURATION, 0, 1);
    const travelProgress = 1 - Math.pow(1 - progress, 1.15);
    const horizontalPosition = actor.dropStart.clone().lerp(actor.dropTarget, travelProgress);
    const groundHeight = this.sampleGroundHeight(horizontalPosition.x, horizontalPosition.z, SKYDIVE_ALTITUDE + 6);
    actor.position.set(
      horizontalPosition.x,
      THREE.MathUtils.lerp(actor.dropStart.y, groundHeight, progress),
      horizontalPosition.z
    );

    const facingTarget = actor.dropTarget.clone().sub(actor.position).setY(0);
    if (facingTarget.lengthSq() > 0.01) {
      actor.yaw = angleLerp(actor.yaw, Math.atan2(facingTarget.x, facingTarget.z), 0.22);
    }
    actor.verticalVelocity = -((actor.dropStart.y - groundHeight) / PARACHUTE_DURATION);
    actor.grounded = false;

    if (progress >= 1 || actor.position.y <= groundHeight + 0.06) {
      this.finishLanding(actor, groundHeight);
    }

    return true;
  }

  private processPlayer(dt: number): void {
    const actor = this.player;
    if (!actor.alive) {
      this.viewModelMoveBlend = 0;
      return;
    }

    const lookSensitivity = 0.0022;
    const lookDeltaX = this.pendingLookDeltaX;
    const lookDeltaY = this.pendingLookDeltaY;
    this.cameraYaw -= lookDeltaX * lookSensitivity;
    this.cameraPitch = clamp(this.cameraPitch - lookDeltaY * lookSensitivity, -0.65, 0.88);
    this.pendingLookDeltaX = 0;
    this.pendingLookDeltaY = 0;
    this.viewModelSway.x = clamp(this.viewModelSway.x - lookDeltaX * 0.00016, -0.045, 0.045);
    this.viewModelSway.y = clamp(this.viewModelSway.y + lookDeltaY * 0.00014, -0.038, 0.038);

    const isSprinting = this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight');
    const moveInput = new THREE.Vector2(
      (this.keysDown.has('KeyD') ? 1 : 0) - (this.keysDown.has('KeyA') ? 1 : 0),
      (this.keysDown.has('KeyW') ? 1 : 0) - (this.keysDown.has('KeyS') ? 1 : 0)
    );

    if (moveInput.lengthSq() > 1) {
      moveInput.normalize();
    }

    if (this.updateActorSpawnState(actor, dt, moveInput)) {
      actor.yaw = angleLerp(actor.yaw, this.cameraYaw, 0.18);
      this.viewModelMoveBlend = 0;
      return;
    }

    const forward = new THREE.Vector3(Math.sin(this.cameraYaw), 0, Math.cos(this.cameraYaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const desired = new THREE.Vector3()
      .addScaledVector(forward, moveInput.y)
      .addScaledVector(right, moveInput.x);

    actor.yaw = this.cameraYaw;

    if (desired.lengthSq() > 0.001) {
      desired.normalize();
      const speed = isSprinting ? PLAYER_SPRINT_SPEED : PLAYER_MOVE_SPEED;
      this.viewModelBobTime += dt * (isSprinting ? 12 : 8.5);
      this.viewModelMoveBlend = Math.min(1, this.viewModelMoveBlend + dt * 5);
      this.moveActor(actor, desired.multiplyScalar(speed), dt);
    } else {
      this.viewModelMoveBlend = Math.max(0, this.viewModelMoveBlend - dt * 5.5);
    }

    if (this.justPressedKeys.has('Space') && actor.grounded) {
      actor.verticalVelocity = JUMP_SPEED;
      actor.grounded = false;
    }

    this.applyVerticalMotion(actor, dt);
    this.handlePlayerLoadoutInput();

    if (this.justPressedKeys.has('KeyE')) {
      this.pickNearestLoot(actor);
    }

    if (!this.isBuildMode() && actor.inventory.mode === 'weapon' && this.mouseDown.has(0)) {
      this.tryFireWeapon(actor, this.getAimDirection(), true);
    }

    if (!this.isBuildMode() && actor.inventory.mode === 'harvest' && this.mouseDown.has(0) && actor.harvestCooldown <= 0) {
      this.tryHarvest(actor);
    }

    if (this.justPressedKeys.has('KeyR')) {
      if (this.isBuildMode()) {
        this.buildRotation += Math.PI / 2;
      } else {
        this.tryStartReload(actor);
      }
    }

    if (this.isBuildMode() && this.justPressedMouseButtons.has(0)) {
      this.tryPlaceBuild(actor);
    }

  }

  private handlePlayerLoadoutInput(): void {
    const actor = this.player;
    const riflePressed = this.justPressedKeys.has('Digit1');
    const shotgunPressed = this.justPressedKeys.has('Digit2');
    const smgPressed = this.justPressedKeys.has('Digit3');
    const wallPressed = riflePressed || this.justPressedKeys.has('KeyZ');
    const floorPressed = shotgunPressed || this.justPressedKeys.has('KeyY');
    const rampPressed = smgPressed || this.justPressedKeys.has('KeyX');

    if (this.justPressedKeys.has('KeyQ')) {
      this.buildMode = !this.buildMode;
    }

    if (wallPressed) {
      if (this.isBuildMode()) {
        this.setBuildPieceType('wall');
      } else if (riflePressed) {
        this.selectWeaponSlot(actor, 0);
      }
    }

    if (floorPressed) {
      if (this.isBuildMode()) {
        this.setBuildPieceType('floor');
      } else if (shotgunPressed) {
        this.selectWeaponSlot(actor, 1);
      }
    }

    if (rampPressed) {
      if (this.isBuildMode()) {
        this.setBuildPieceType('ramp');
      } else if (smgPressed) {
        this.selectWeaponSlot(actor, 2);
      }
    }

    if (this.wheelDirection !== 0 && !this.isBuildMode()) {
      const ownedSlots = this.getOwnedWeaponSlots(actor);
      if (ownedSlots.length === 0) {
        actor.inventory.mode = 'harvest';
      } else if (actor.inventory.mode === 'harvest') {
        actor.inventory.mode = 'weapon';
        actor.inventory.weaponIndex = this.wheelDirection > 0 ? ownedSlots[ownedSlots.length - 1] : ownedSlots[0];
      } else {
        const currentIndex = ownedSlots.indexOf(actor.inventory.weaponIndex);
        const next = (currentIndex === -1 ? 0 : currentIndex) + (this.wheelDirection > 0 ? 1 : -1);
        if (next < 0 || next >= ownedSlots.length) {
          actor.inventory.mode = 'harvest';
        } else {
          actor.inventory.weaponIndex = ownedSlots[next];
        }
      }
    }
  }

  private processBot(actor: Actor, dt: number): void {
    const brain = actor.ai;
    if (!brain) {
      return;
    }

    if (this.updateActorSpawnState(actor, dt)) {
      return;
    }

    brain.decisionTimer -= dt;
    brain.repathTimer -= dt;
    brain.strafeTimer -= dt;
    brain.buildCooldown -= dt;
    brain.harvestTimer -= dt;

    if (brain.strafeTimer <= 0) {
      brain.strafeTimer = this.rng.range(0.9, 1.7);
      brain.strafeDirection *= -1;
    }

    const visibleEnemy = this.findVisibleEnemy(actor, 52);
    if (visibleEnemy) {
      brain.targetActorId = visibleEnemy.id;
    } else if (
      brain.targetActorId &&
      (() => {
        const target = this.findActorById(brain.targetActorId);
        return !target || !target.alive || this.areTeammates(actor, target);
      })()
    ) {
      brain.targetActorId = undefined;
    }

    if (brain.decisionTimer <= 0) {
      brain.decisionTimer = this.rng.range(0.45, 0.95);
      this.rethinkBotState(actor, visibleEnemy);
    }

    if (brain.state === 'engage' && brain.targetActorId) {
      const target = this.findActorById(brain.targetActorId);
      if (!target || !target.alive || this.areTeammates(actor, target)) {
        brain.state = 'roam';
      } else {
        this.runBotCombat(actor, target, dt);
        this.applyVerticalMotion(actor, dt);
        return;
      }
    }

    if (brain.state === 'harvest' && brain.targetNodeId) {
      const node = this.resourceNodes.find((entry) => entry.id === brain.targetNodeId);
      if (!node) {
        brain.state = 'roam';
      } else {
        this.followBotDestination(actor, node.position, dt, false);
        if (horizontalDistance(actor.position, node.position) < 2.8) {
          actor.yaw = angleLerp(actor.yaw, Math.atan2(node.position.x - actor.position.x, node.position.z - actor.position.z), 0.25);
          if (brain.harvestTimer <= 0) {
            brain.harvestTimer = 0.9;
            this.harvestNode(actor, node);
          }
        }
        this.applyVerticalMotion(actor, dt);
        return;
      }
    }

    if (brain.state === 'seekLoot' && brain.targetLootId) {
      const loot = this.loot.find((entry) => entry.id === brain.targetLootId);
      if (!loot) {
        brain.state = 'roam';
      } else {
        this.followBotDestination(actor, loot.position, dt, true);
        this.applyVerticalMotion(actor, dt);
        return;
      }
    }

    const destination = brain.state === 'seekSafeZone'
      ? this.getSafeZoneDestination(actor.position)
      : brain.destination;

    this.followBotDestination(actor, destination, dt, brain.state !== 'roam');
    this.applyVerticalMotion(actor, dt);
  }

  private rethinkBotState(actor: Actor, visibleEnemy: Actor | null): void {
    const brain = actor.ai!;
    const shouldRotate = this.shouldRotateToSafeZone(actor.position);
    const armed = this.hasUsableWeapon(actor);
    const lowMaterials = this.totalMaterials(actor.inventory.materials) < 28;
    const node = lowMaterials ? this.findNearestResource(actor.position, 28) : null;
    const desiredLoot = this.findBestLootForActor(actor, 42);

    if (shouldRotate) {
      brain.state = 'seekSafeZone';
      brain.destination.copy(this.getSafeZoneDestination(actor.position));
      return;
    }

    if (visibleEnemy && armed) {
      brain.state = 'engage';
      brain.targetActorId = visibleEnemy.id;
      return;
    }

    if ((!armed || desiredLoot) && desiredLoot) {
      brain.state = 'seekLoot';
      brain.targetLootId = desiredLoot.id;
      brain.destination.copy(desiredLoot.position);
      return;
    }

    if (node && this.rng.next() > 0.3) {
      brain.state = 'harvest';
      brain.targetNodeId = node.id;
      brain.destination.copy(node.position);
      return;
    }

    brain.state = 'roam';
    brain.targetLootId = undefined;
    brain.targetNodeId = undefined;
    brain.destination.copy(this.findFreePoint(MAP_RADIUS - 12, 5));
  }

  private runBotCombat(actor: Actor, target: Actor, dt: number): void {
    const brain = actor.ai!;
    const toTarget = this.tempVectorA.copy(target.position).sub(actor.position);
    const distance = Math.max(0.001, horizontalDistance(actor.position, target.position));
    const desiredDirection = this.tempVectorB.set(toTarget.x, 0, toTarget.z).normalize();
    const weapon = this.chooseBestWeapon(actor, distance);
    const optimalDistance = weapon?.definition.id === 'auto-shotgun' ? 10 : weapon?.definition.id === 'tactical-smg' ? 17 : 25;
    const strafe = this.tempVectorC.set(-desiredDirection.z, 0, desiredDirection.x).multiplyScalar(brain.strafeDirection);
    const move = new THREE.Vector3();
    const stormPressure = this.getStormPressure(actor.position);

    if (distance > optimalDistance + 6) {
      move.add(desiredDirection);
    } else if (distance < optimalDistance - 4) {
      move.addScaledVector(desiredDirection, -0.9);
    }
    move.addScaledVector(strafe, 0.32);

    if (stormPressure > 0.1 || this.shouldRotateToSafeZone(actor.position)) {
      const safeVector = this.getSafeZoneDestination(actor.position).sub(actor.position);
      safeVector.y = 0;
      if (safeVector.lengthSq() > 0.01) {
        move.addScaledVector(safeVector.normalize(), THREE.MathUtils.lerp(0.35, 1.15, stormPressure));
      }
    }

    if (move.lengthSq() > 0.01) {
      move.normalize();
      this.moveActor(actor, move.multiplyScalar(distance > optimalDistance ? BOT_SPRINT_SPEED : BOT_MOVE_SPEED), dt);
    }

    actor.yaw = angleLerp(actor.yaw, Math.atan2(target.position.x - actor.position.x, target.position.z - actor.position.z), 0.24);

    if (
      brain.buildCooldown <= 0 &&
      actor.health < 32 &&
      this.totalMaterials(actor.inventory.materials) >= BUILD_COST &&
      distance < 16 &&
      this.rng.next() > 0.62
    ) {
      const behind = actor.position.clone().addScaledVector(desiredDirection, 1.5);
      this.tryPlaceBuild(actor, 'wall', behind, Math.atan2(-desiredDirection.x, -desiredDirection.z));
      brain.buildCooldown = this.rng.range(6.5, 11);
    }

    if (weapon) {
      actor.inventory.mode = 'weapon';
      actor.inventory.weaponIndex = this.getWeaponSlotIndexById(weapon.definition.id);
      if (distance <= weapon.definition.range * 0.9 && this.hasLineOfSight(actor, target) && this.rng.next() > 0.14) {
        const aimTarget = target.position.clone().add(new THREE.Vector3(
          this.rng.range(-0.34, 0.34),
          this.rng.range(1.1, 1.58),
          this.rng.range(-0.34, 0.34)
        ));
        const direction = aimTarget.sub(actor.position.clone().add(new THREE.Vector3(0, PLAYER_EYE_HEIGHT, 0))).normalize();
        this.tryFireWeapon(actor, direction, false);
      } else if (weapon.magAmmo <= 0) {
        this.tryStartReload(actor);
      }
    }
  }

  private chooseBestWeapon(actor: Actor, distance: number): WeaponInstance | null {
    let best: WeaponInstance | null = null;
    let bestScore = -Infinity;

    for (const weapon of actor.inventory.weapons) {
      const reserve = actor.inventory.ammo[weapon.definition.ammoType];
      const totalAmmo = reserve + weapon.magAmmo;
      if (totalAmmo <= 0) {
        continue;
      }

      const rangePreference = clamp(1 - Math.abs(distance - weapon.definition.range * 0.35) / Math.max(14, weapon.definition.range * 0.7), 0.2, 1.2);
      const score = this.weaponScore(weapon.definition) * rangePreference;
      if (score > bestScore) {
        bestScore = score;
        best = weapon;
      }
    }

    return best;
  }

  private followBotDestination(actor: Actor, destination: THREE.Vector3, dt: number, sprint: boolean): void {
    const brain = actor.ai!;
    const needsPath = brain.path.length === 0 || brain.repathTimer <= 0 || horizontalDistance(brain.destination, destination) > 5;
    if (needsPath) {
      brain.destination.copy(destination);
      brain.path = this.pathfinder.findPath(actor.position, destination);
      brain.pathIndex = brain.path.length > 1 ? 1 : 0;
      brain.repathTimer = this.rng.range(0.7, 1.4);
    }

    let moveTarget = destination;
    if (brain.path.length > 0 && brain.pathIndex < brain.path.length) {
      moveTarget = brain.path[brain.pathIndex];
      if (horizontalDistance(actor.position, moveTarget) < 1.4) {
        brain.pathIndex = Math.min(brain.pathIndex + 1, brain.path.length - 1);
        moveTarget = brain.path[brain.pathIndex];
      }
    }

    const direction = this.tempVectorA.copy(moveTarget).sub(actor.position);
    direction.y = 0;
    if (direction.lengthSq() > 0.01) {
      direction.normalize();
      actor.yaw = angleLerp(actor.yaw, Math.atan2(direction.x, direction.z), 0.22);
      const speed = sprint ? BOT_SPRINT_SPEED : BOT_MOVE_SPEED;
      this.moveActor(actor, direction.multiplyScalar(speed), dt);
    }
  }

  private updateActorTimers(actor: Actor, dt: number): void {
    actor.fireCooldown = Math.max(0, actor.fireCooldown - dt);
    actor.harvestCooldown = Math.max(0, actor.harvestCooldown - dt);

    if (actor.reloadTimer > 0) {
      actor.reloadTimer = Math.max(0, actor.reloadTimer - dt);
      if (actor.reloadTimer === 0) {
        this.finishReload(actor);
      }
    }
  }

  private applyStormDamage(actor: Actor, dt: number): void {
    if (!this.isStormActive() || actor.spawnState !== 'grounded' || !this.isOutsideStorm(actor.position)) {
      return;
    }

    this.applyDamage(actor, this.storm.currentDamagePerSecond * dt, null, 'storm');
  }

  private updateLootVisuals(time: number): void {
    for (const pickup of this.loot) {
      pickup.mesh.position.set(
        pickup.position.x,
        pickup.position.y + 0.35 + Math.sin(time * 1.8 + pickup.bobOffset) * 0.22,
        pickup.position.z
      );
      pickup.mesh.rotation.y += 0.01;
    }
  }

  private updateShotEffects(dt: number): void {
    for (let i = this.shotEffects.length - 1; i >= 0; i -= 1) {
      const effect = this.shotEffects[i];
      effect.timeRemaining -= dt;

      if (effect.timeRemaining <= 0) {
        this.effectsGroup.remove(effect.group);
        this.disposeObject(effect.group);
        this.shotEffects.splice(i, 1);
        continue;
      }

      const alpha = effect.timeRemaining / effect.duration;
      effect.lineMaterial.opacity = alpha * 0.9;
      effect.sparkMaterial.opacity = alpha;
    }
  }

  private updateStorm(dt: number): void {
    if (!this.isStormActive()) {
      this.storm.currentDamagePerSecond = 0;
      this.updateStormVisuals();
      return;
    }

    if (this.storm.mode === 'done') {
      this.updateStormVisuals();
      return;
    }

    const phase = STORM_PHASES[Math.min(this.storm.phaseIndex, STORM_PHASES.length - 1)];
    this.storm.currentDamagePerSecond = phase.damagePerSecond;
    this.storm.timer += dt;

    if (this.storm.mode === 'pause') {
      if (this.storm.timer >= phase.pauseDuration) {
        this.storm.mode = 'shrink';
        this.storm.timer = 0;
        this.storm.startRadius = this.storm.currentRadius;
        this.storm.startCenter.copy(this.storm.currentCenter);
      }
    } else if (this.storm.mode === 'shrink') {
      const t = clamp(this.storm.timer / phase.shrinkDuration, 0, 1);
      this.storm.currentRadius = THREE.MathUtils.lerp(this.storm.startRadius, this.storm.targetRadius, t);
      this.storm.currentCenter.lerpVectors(this.storm.startCenter, this.storm.targetCenter, t);

      if (t >= 1) {
        this.storm.phaseIndex += 1;
        this.storm.timer = 0;
        this.storm.currentRadius = this.storm.targetRadius;
        this.storm.currentCenter.copy(this.storm.targetCenter);

        if (this.storm.phaseIndex >= STORM_PHASES.length) {
          this.storm.mode = 'done';
        } else {
          this.storm.mode = 'pause';
          this.prepareNextStormTarget();
        }
      }
    }

    this.updateStormVisuals();
  }

  private prepareNextStormTarget(): void {
    if (this.storm.phaseIndex >= STORM_PHASES.length) {
      this.storm.targetCenter.copy(this.storm.currentCenter);
      this.storm.targetRadius = this.storm.currentRadius;
      return;
    }

    const phase = STORM_PHASES[this.storm.phaseIndex];
    const maxOffset = Math.max(0, this.storm.currentRadius - phase.targetRadius - 6);
    const offset = randomPointInCircle(this.rng, maxOffset);
    const candidate = this.storm.currentCenter.clone().add(offset);
    const clamped = clampToCircle(candidate, WORLD_CENTER, MAP_RADIUS - phase.targetRadius - 4);
    this.storm.targetCenter.copy(clamped);
    this.storm.targetRadius = phase.targetRadius;
  }

  private updateStormVisuals(): void {
    if (!this.stormWall || !this.safeZoneRing || !this.safeZoneDisc) {
      return;
    }

    this.stormWall.position.set(this.storm.currentCenter.x, 9, this.storm.currentCenter.z);
    this.stormWall.scale.set(this.storm.currentRadius, 1, this.storm.currentRadius);

    this.safeZoneRing.position.set(this.storm.targetCenter.x, 0.05, this.storm.targetCenter.z);
    this.safeZoneRing.scale.set(this.storm.targetRadius, this.storm.targetRadius, this.storm.targetRadius);

    this.safeZoneDisc.position.set(this.storm.targetCenter.x, 0.03, this.storm.targetCenter.z);
    this.safeZoneDisc.scale.set(this.storm.targetRadius, this.storm.targetRadius, this.storm.targetRadius);
  }

  private tryFireWeapon(actor: Actor, direction: THREE.Vector3, playerOwned: boolean): void {
    if (actor.fireCooldown > 0 || actor.reloadTimer > 0) {
      return;
    }

    const weapon = this.getEquippedWeapon(actor);
    if (!weapon) {
      return;
    }

    if (weapon.magAmmo <= 0) {
      this.tryStartReload(actor);
      return;
    }

    weapon.magAmmo -= 1;
    actor.fireCooldown = weapon.definition.fireInterval;

    if (playerOwned) {
      this.viewModelKick = Math.min(0.22, this.viewModelKick + (weapon.definition.id === 'auto-shotgun' ? 0.18 : 0.1));
      this.muzzleFlashTime = 0.14;
    }

    const origin = actor.kind === 'player'
      ? this.camera.position.clone()
      : actor.position.clone().add(new THREE.Vector3(0, PLAYER_EYE_HEIGHT, 0));
    const visualOrigin = this.getShotVisualOrigin(actor);

    for (let pellet = 0; pellet < weapon.definition.pellets; pellet += 1) {
      const shotDirection = this.applyWeaponSpread(direction, weapon.definition.spread, playerOwned);
      this.raycaster.set(origin, shotDirection);
      this.raycaster.far = weapon.definition.range;
      const hits = this.raycaster.intersectObjects(this.raycastTargets, true);
      let impactPoint = origin.clone().addScaledVector(shotDirection, weapon.definition.range);

      for (const hit of hits) {
        const kind = hit.object.userData.kind as string | undefined;
        const ref = hit.object.userData.ref as Actor | BuildPiece | null | undefined;

        if (!kind) {
          continue;
        }

        if (!ref) {
          if (kind === 'static' || kind === 'resource') {
            impactPoint = hit.point.clone();
            break;
          }
          continue;
        }

        if (kind === 'actor') {
          const target = ref as Actor;
          if (!target.alive || target.id === actor.id || this.areTeammates(actor, target)) {
            continue;
          }
          impactPoint = hit.point.clone();
          this.applyDamage(target, weapon.definition.damage, actor, 'weapon');
          break;
        }

        if (kind === 'build') {
          impactPoint = hit.point.clone();
          this.damageBuildPiece(ref as BuildPiece, weapon.definition.damage);
          break;
        }
      }

      this.createShotEffect(visualOrigin, impactPoint, weapon.definition.color);
    }
  }

  private tryStartReload(actor: Actor): void {
    const weapon = this.getEquippedWeapon(actor);
    if (!weapon || actor.reloadTimer > 0) {
      return;
    }

    const reserve = actor.inventory.ammo[weapon.definition.ammoType];
    if (reserve <= 0 || weapon.magAmmo >= weapon.definition.magSize) {
      return;
    }

    actor.reloadTimer = weapon.definition.reloadDuration;
    if (actor.kind === 'player') {
      this.showMessage(`Reloading ${weapon.definition.name}...`, 1.1);
    }
  }

  private finishReload(actor: Actor): void {
    const weapon = this.getEquippedWeapon(actor);
    if (!weapon) {
      return;
    }

    const reserve = actor.inventory.ammo[weapon.definition.ammoType];
    if (reserve <= 0) {
      return;
    }

    const needed = weapon.definition.magSize - weapon.magAmmo;
    const moved = Math.min(needed, reserve);
    weapon.magAmmo += moved;
    actor.inventory.ammo[weapon.definition.ammoType] -= moved;
  }

  private tryHarvest(actor: Actor): void {
    const node = this.findHarvestTarget(actor);
    if (!node) {
      if (actor.kind === 'player') {
        this.showMessage('No harvestable node in range.', 1);
      }
      return;
    }

    actor.harvestCooldown = 0.55;
    if (actor.kind === 'player') {
      this.viewModelKick = Math.min(0.16, this.viewModelKick + 0.08);
    }
    this.harvestNode(actor, node);
  }

  private harvestNode(actor: Actor, node: ResourceNode): void {
    const amount = Math.min(node.yieldPerHit, node.totalYield);
    node.health -= 25;
    node.totalYield -= amount;
    actor.inventory.materials[node.materialType] += amount;

    if (actor.kind === 'player') {
      this.showMessage(`+${amount} ${MATERIAL_DISPLAY_NAMES[node.materialType]}`, 1.2);
    }

    const scale = clamp(node.health / 120, 0.55, 1);
    node.mesh.scale.setScalar(scale);

    if (node.health <= 0 || node.totalYield <= 0) {
      this.destroyResourceNode(node);
    }
  }

  private destroyResourceNode(node: ResourceNode): void {
    this.resourceNodes = this.resourceNodes.filter((entry) => entry.id !== node.id);
    this.environmentGroup.remove(node.mesh);
    this.removeRaycastTarget(node.mesh);
    this.removeCameraObstacle(node.mesh);
    this.disposeObject(node.mesh);
    this.refreshNavigation();
  }

  private tryPlaceBuild(actor: Actor, forcedType?: BuildPieceType, forcedWorldPosition?: THREE.Vector3, forcedYaw?: number): void {
    const pieceType = forcedType ?? this.selectedBuildPiece;
    const materialType = this.getAvailableBuildMaterial(actor);
    if (!materialType) {
      if (actor.kind === 'player') {
        this.showMessage('Need 20 materials to build.', 1.3);
      }
      return;
    }

    const placement = this.computeBuildPlacement(actor, pieceType, forcedWorldPosition, forcedYaw);
    if (!placement.valid) {
      if (actor.kind === 'player') {
        this.showMessage('Cannot place a build there.', 1.2);
      }
      return;
    }

    actor.inventory.materials[materialType] -= BUILD_COST;
    const piece = this.addBuildPiece(pieceType, materialType, placement.position, placement.yaw);
    if (actor.kind === 'player') {
      this.showMessage(`${pieceType[0].toUpperCase()}${pieceType.slice(1)} placed.`, 1);
    }

    if (piece.obstacle) {
      this.refreshNavigation();
    }
  }

  private addBuildPiece(pieceType: BuildPieceType, materialType: MaterialType, position: THREE.Vector3, yaw: number): BuildPiece {
    const mesh = this.createBuildMesh(pieceType, this.colorForBuildMaterial(materialType), false);
    mesh.position.copy(position);
    mesh.rotation.y = yaw;
    if (pieceType === 'ramp') {
      mesh.rotation.x = RAMP_ANGLE;
    }
    this.buildGroup.add(mesh);

    const piece: BuildPiece = {
      id: `build-${this.buildPieces.length}`,
      pieceType,
      materialType,
      mesh,
      position: position.clone(),
      yaw,
      health: pieceType === 'wall' ? 220 : 180,
      obstacle: pieceType === 'wall' ? this.makeWallObstacle(position, yaw, mesh) : undefined
    };

    mesh.userData.kind = 'build';
    mesh.userData.ref = piece;
    this.buildPieces.push(piece);
    this.raycastTargets.push(mesh);
    this.cameraObstacles.push(mesh);
    return piece;
  }

  private damageBuildPiece(piece: BuildPiece, amount: number): void {
    piece.health -= amount;
    piece.mesh.scale.setScalar(clamp(piece.health / 220, 0.55, 1));

    if (piece.health > 0) {
      return;
    }

    this.buildPieces = this.buildPieces.filter((entry) => entry.id !== piece.id);
    this.buildGroup.remove(piece.mesh);
    this.removeRaycastTarget(piece.mesh);
    this.removeCameraObstacle(piece.mesh);
    this.disposeObject(piece.mesh);
    if (piece.obstacle) {
      this.refreshNavigation();
    }
  }

  private updateBuildPreview(): void {
    if (!this.previewMesh) {
      return;
    }

    if (!this.player.alive || !this.isBuildMode()) {
      this.previewMesh.visible = false;
      return;
    }

    const placement = this.computeBuildPlacement(this.player, this.selectedBuildPiece);
    if (!placement.valid) {
      this.previewMesh.visible = false;
      return;
    }

    if (this.previewMesh.userData.pieceType !== this.selectedBuildPiece) {
      this.ensurePreviewMesh();
    }

    if (!this.previewMesh) {
      return;
    }

    this.previewMesh.visible = true;
    this.previewMesh.position.copy(placement.position);
    this.previewMesh.rotation.set(this.selectedBuildPiece === 'ramp' ? RAMP_ANGLE : 0, placement.yaw, 0);
  }

  private computeBuildPlacement(actor: Actor, pieceType: BuildPieceType, forcedWorldPosition?: THREE.Vector3, forcedYaw?: number): { position: THREE.Vector3; yaw: number; valid: boolean } {
    const forward = yawToDirection(this.cameraYaw);
    const placeTarget = forcedWorldPosition
      ? forcedWorldPosition.clone()
      : this.getBuildAimPoint(actor, forward);

    const snappedX = snap(placeTarget.x, BUILD_GRID_SIZE);
    const snappedZ = snap(placeTarget.z, BUILD_GRID_SIZE);
    const supportY = this.sampleGroundHeight(snappedX, snappedZ, actor.position.y + 6);
    const baseYaw = forcedYaw ?? Math.round((this.cameraYaw + this.buildRotation) / (Math.PI * 0.5)) * (Math.PI * 0.5);
    const yaw = pieceType === 'ramp' ? baseYaw + Math.PI : baseYaw;

    const position = new THREE.Vector3(
      snappedX,
      pieceType === 'wall'
        ? supportY + WALL_HEIGHT * 0.5
        : pieceType === 'floor'
          ? supportY + FLOOR_THICKNESS * 0.5
          : supportY + RAMP_HEIGHT * 0.5,
      snappedZ
    );

    const valid = this.isBuildPlacementValid(actor, pieceType, position, yaw);
    return { position, yaw, valid };
  }

  private getBuildAimPoint(actor: Actor, forward: THREE.Vector3): THREE.Vector3 {
    const direction = this.getAimDirection();
    this.raycaster.set(this.camera.position, direction);
    this.raycaster.far = 20;
    const hits = this.raycaster.intersectObjects(this.raycastTargets, true);
    for (const hit of hits) {
      const kind = hit.object.userData.kind as string | undefined;
      if (kind === 'static' || kind === 'build') {
        return hit.point.clone();
      }
    }

    const hit = this.raycaster.ray.intersectPlane(this.tempPlane, this.tempVectorA);
    const fallback = actor.position.clone().addScaledVector(forward, 6.5);
    if (!hit) {
      return fallback;
    }

    const target = this.tempVectorA.clone();
    if (horizontalDistance(actor.position, target) < 3) {
      return fallback;
    }

    return target;
  }

  private isBuildPlacementValid(actor: Actor, pieceType: BuildPieceType, position: THREE.Vector3, yaw: number): boolean {
    if (horizontalDistance(actor.position, position) > 12.5) {
      return false;
    }

    if (horizontalDistance(WORLD_CENTER, position) > MAP_RADIUS - 2) {
      return false;
    }

    const bounds = this.getBuildBounds(pieceType, position, yaw);

    for (const obstacle of this.staticObstacles) {
      if (this.overlapsBounds(bounds, obstacle, 0.05) && bounds.minY < obstacle.height + 0.2) {
        return false;
      }
    }

    for (const node of this.resourceNodes) {
      if (this.overlapsBounds(bounds, node.obstacle, 0.05)) {
        return false;
      }
    }

    for (const piece of this.buildPieces) {
      const pieceBounds = this.getBuildBounds(piece.pieceType, piece.position, piece.yaw);
      const verticalGap = Math.abs(bounds.minY - pieceBounds.minY);
      if (verticalGap < 0.45 && this.overlapsBounds(bounds, pieceBounds, 0.12)) {
        return false;
      }
    }

    for (const other of this.actors) {
      if (!other.alive) {
        continue;
      }
      if (horizontalDistance(other.position, position) < other.radius + 1.4) {
        return false;
      }
    }

    return true;
  }

  private getBuildBounds(pieceType: BuildPieceType, position: THREE.Vector3, yaw: number): ObstacleBox & { minY: number; maxY: number } {
    if (pieceType === 'floor') {
      return {
        minX: position.x - FLOOR_SIZE * 0.5,
        maxX: position.x + FLOOR_SIZE * 0.5,
        minZ: position.z - FLOOR_SIZE * 0.5,
        maxZ: position.z + FLOOR_SIZE * 0.5,
        minY: position.y - FLOOR_THICKNESS * 0.5,
        maxY: position.y + FLOOR_THICKNESS * 0.5,
        height: position.y + FLOOR_THICKNESS * 0.5,
        mesh: this.previewMesh ?? this.buildGroup
      };
    }

    if (pieceType === 'ramp') {
      return {
        minX: position.x - RAMP_WIDTH * 0.5,
        maxX: position.x + RAMP_WIDTH * 0.5,
        minZ: position.z - RAMP_LENGTH * 0.5,
        maxZ: position.z + RAMP_LENGTH * 0.5,
        minY: position.y - RAMP_HEIGHT * 0.5,
        maxY: position.y + RAMP_HEIGHT * 0.5,
        height: position.y + RAMP_HEIGHT * 0.5,
        mesh: this.previewMesh ?? this.buildGroup
      };
    }

    const orientedWidth = Math.abs(Math.cos(yaw)) > 0.5 ? WALL_WIDTH : WALL_THICKNESS;
    const orientedDepth = Math.abs(Math.cos(yaw)) > 0.5 ? WALL_THICKNESS : WALL_WIDTH;
    return {
      minX: position.x - orientedWidth * 0.5,
      maxX: position.x + orientedWidth * 0.5,
      minZ: position.z - orientedDepth * 0.5,
      maxZ: position.z + orientedDepth * 0.5,
      minY: position.y - WALL_HEIGHT * 0.5,
      maxY: position.y + WALL_HEIGHT * 0.5,
      height: position.y + WALL_HEIGHT * 0.5,
      mesh: this.previewMesh ?? this.buildGroup
    };
  }

  private overlapsBounds(
    a: Pick<ObstacleBox, 'minX' | 'maxX' | 'minZ' | 'maxZ'>,
    b: Pick<ObstacleBox, 'minX' | 'maxX' | 'minZ' | 'maxZ'>,
    padding: number
  ): boolean {
    return a.minX < b.maxX - padding && a.maxX > b.minX + padding && a.minZ < b.maxZ - padding && a.maxZ > b.minZ + padding;
  }

  private moveActor(actor: Actor, velocity: THREE.Vector3, dt: number): void {
    const speedMultiplier = this.getMovementMultiplier(actor.position);
    const moveX = velocity.x * speedMultiplier * dt;
    const moveZ = velocity.z * speedMultiplier * dt;

    const tryPosition = actor.position.clone();
    tryPosition.x += moveX;
    if (!this.isBlockedAt(tryPosition, actor.radius, actor.position.y + 1.4)) {
      actor.position.x = tryPosition.x;
    }

    tryPosition.copy(actor.position);
    tryPosition.z += moveZ;
    if (!this.isBlockedAt(tryPosition, actor.radius, actor.position.y + 1.4)) {
      actor.position.z = tryPosition.z;
    }

    const clamped = clampToCircle(actor.position, WORLD_CENTER, MAP_RADIUS - actor.radius - 1.5);
    actor.position.copy(clamped);
  }

  private applyVerticalMotion(actor: Actor, dt: number): void {
    actor.verticalVelocity -= GRAVITY * dt;
    actor.position.y += actor.verticalVelocity * dt;

    const groundHeight = this.sampleGroundHeight(actor.position.x, actor.position.z, actor.position.y + 1.4);
    if (actor.position.y <= groundHeight) {
      actor.position.y = groundHeight;
      actor.verticalVelocity = 0;
      actor.grounded = true;
    } else {
      actor.grounded = false;
    }
  }

  private sampleGroundHeight(x: number, z: number, currentY: number): number {
    let height = 0;

    for (const surface of this.walkableSurfaces) {
      if (x >= surface.minX && x <= surface.maxX && z >= surface.minZ && z <= surface.maxZ) {
        if (surface.height <= currentY + 2.5) {
          height = Math.max(height, surface.height);
        }
      }
    }

    for (const piece of this.buildPieces) {
      if (piece.pieceType === 'floor') {
        if (Math.abs(x - piece.position.x) <= FLOOR_SIZE * 0.5 && Math.abs(z - piece.position.z) <= FLOOR_SIZE * 0.5) {
          const top = piece.position.y + FLOOR_THICKNESS * 0.5;
          if (top <= currentY + 2.5) {
            height = Math.max(height, top);
          }
        }
        continue;
      }

      if (piece.pieceType === 'ramp') {
        const dx = x - piece.position.x;
        const dz = z - piece.position.z;
        const cos = Math.cos(-piece.yaw);
        const sin = Math.sin(-piece.yaw);
        const localX = dx * cos - dz * sin;
        const localZ = dx * sin + dz * cos;

        if (Math.abs(localX) <= RAMP_WIDTH * 0.5 && localZ >= -RAMP_LENGTH * 0.5 && localZ <= RAMP_LENGTH * 0.5) {
          const t = clamp((RAMP_LENGTH * 0.5 - localZ) / RAMP_LENGTH, 0, 1);
          const baseY = piece.position.y - RAMP_HEIGHT * 0.5;
          const surface = baseY + t * RAMP_HEIGHT + 0.15;
          if (surface <= currentY + 2.5) {
            height = Math.max(height, surface);
          }
        }
      }
    }

    return height;
  }

  private isBlockedAt(position: THREE.Vector3, radius: number, height: number): boolean {
    if (horizontalDistance(WORLD_CENTER, position) > MAP_RADIUS - radius - 1) {
      return true;
    }

    const obstacles: ObstacleBox[] = [
      ...this.staticObstacles,
      ...this.resourceNodes.map((node) => node.obstacle),
      ...this.buildPieces.map((piece) => piece.obstacle).filter((entry): entry is ObstacleBox => Boolean(entry))
    ];

    for (const obstacle of obstacles) {
      if (height > obstacle.height + 0.2) {
        continue;
      }

      const closestX = clamp(position.x, obstacle.minX, obstacle.maxX);
      const closestZ = clamp(position.z, obstacle.minZ, obstacle.maxZ);
      const dx = position.x - closestX;
      const dz = position.z - closestZ;
      if ((dx * dx) + (dz * dz) < radius * radius) {
        return true;
      }
    }

    return false;
  }

  private resolveActorSeparation(): void {
    for (let i = 0; i < this.actors.length; i += 1) {
      const a = this.actors[i];
      if (!a.alive) {
        continue;
      }

      for (let j = i + 1; j < this.actors.length; j += 1) {
        const b = this.actors[j];
        if (!b.alive) {
          continue;
        }

        const delta = this.tempVectorA.copy(a.position).sub(b.position);
        delta.y = 0;
        const distance = delta.length();
        const minDistance = a.radius + b.radius;
        if (distance === 0 || distance >= minDistance) {
          continue;
        }

        delta.normalize().multiplyScalar((minDistance - distance) * 0.5);
        a.position.add(delta);
        b.position.sub(delta);
      }
    }
  }

  private updateActorVisual(actor: Actor): void {
    actor.group.position.copy(actor.position);
    actor.group.rotation.y = actor.yaw;
    const material = actor.ringMesh.material as THREE.MeshBasicMaterial;
    const frameDistance = horizontalDistance(actor.position, actor.lastPosition);
    const targetMoveBlend = actor.spawnState === 'grounded'
      ? clamp(frameDistance / Math.max(0.001, PLAYER_SPRINT_SPEED * FIXED_TIMESTEP), 0, 1)
      : actor.spawnState === 'parachuting'
        ? 0.24
        : 0;
    actor.moveBlend = THREE.MathUtils.lerp(actor.moveBlend, targetMoveBlend, actor.spawnState === 'grounded' ? 0.28 : 0.16);
    actor.stepTime += FIXED_TIMESTEP * THREE.MathUtils.lerp(2.1, 7.5, actor.moveBlend);
    actor.lastPosition.copy(actor.position);

    const swing = Math.sin(actor.stepTime) * 0.65 * actor.moveBlend;
    const counterSwing = Math.sin(actor.stepTime + Math.PI) * 0.65 * actor.moveBlend;
    const idleBreath = Math.sin(this.matchTime * 2.8 + actor.stepTime * 0.18) * (actor.spawnState === 'grounded' ? 0.025 : 0.012);
    const torsoSway = Math.cos(actor.stepTime * 0.5) * 0.08 * actor.moveBlend;
    const strideBob = Math.abs(Math.cos(actor.stepTime * 1.9)) * 0.075 * actor.moveBlend;
    const airborneLean = actor.spawnState === 'parachuting' ? 0.38 : 0;
    actor.visualRoot.rotation.x = airborneLean;
    actor.visualRoot.rotation.y = torsoSway * 0.24;
    actor.visualRoot.rotation.z = actor.spawnState === 'parachuting' ? Math.sin(actor.stepTime * 0.6) * 0.06 : torsoSway * 0.3;
    actor.visualRoot.position.set(torsoSway * 0.12, idleBreath + strideBob, 0);
    actor.bodyMesh.rotation.x = actor.spawnState === 'parachuting' ? 0.12 : idleBreath * 0.65 + strideBob * 0.22;
    actor.bodyMesh.rotation.y = torsoSway * 0.16;
    actor.bodyMesh.rotation.z = actor.spawnState === 'parachuting' ? 0 : torsoSway * 0.4;
    actor.headMesh.rotation.x = actor.spawnState === 'parachuting' ? -0.08 : idleBreath * 0.9;
    actor.headMesh.rotation.y = torsoSway * 0.45;
    actor.leftArmPivot.rotation.x = actor.spawnState === 'parachuting' ? -1.05 : swing * 0.95 - 0.12;
    actor.rightArmPivot.rotation.x = actor.spawnState === 'parachuting' ? -1.02 : counterSwing * 0.95 - 0.12;
    actor.leftArmPivot.rotation.z = actor.spawnState === 'parachuting' ? -0.1 : -0.18 - torsoSway * 1.15;
    actor.rightArmPivot.rotation.z = actor.spawnState === 'parachuting' ? 0.1 : 0.18 + torsoSway * 1.15;
    actor.leftLegPivot.rotation.x = actor.spawnState === 'parachuting' ? 0.58 : counterSwing * 0.82 + 0.08;
    actor.rightLegPivot.rotation.x = actor.spawnState === 'parachuting' ? 0.56 : swing * 0.82 + 0.08;
    actor.leftLegPivot.rotation.z = actor.spawnState === 'parachuting' ? 0.12 : -0.05 + torsoSway * 0.32;
    actor.rightLegPivot.rotation.z = actor.spawnState === 'parachuting' ? -0.12 : 0.05 - torsoSway * 0.32;
    actor.parachuteGroup.visible = actor.spawnState === 'parachuting';

    const ringOpacity = actor === this.player
      ? 0
      : 0.26 + (1 - actor.health / actor.maxHealth) * 0.22;
    material.opacity = ringOpacity;
    actor.shadowMesh.scale.setScalar(actor.spawnState === 'parachuting' ? clamp(1.5 - (actor.position.y / SKYDIVE_ALTITUDE), 0.4, 1) : 1);
    const shadowMaterial = actor.shadowMesh.material as THREE.MeshBasicMaterial;
    shadowMaterial.opacity = actor.spawnState === 'grounded' ? 0.16 : actor.spawnState === 'parachuting' ? 0.08 : 0;
  }

  private tryAutoPickup(actor: Actor): void {
    if (!actor.alive || actor.spawnState !== 'grounded') {
      return;
    }

    if (actor.kind === 'player') {
      const nearbyAutoLoot = this.loot.filter((pickup) =>
        this.shouldAutoPickupForPlayer(actor, pickup) && horizontalDistance(actor.position, pickup.position) <= INTERACT_DISTANCE
      );
      for (const pickup of nearbyAutoLoot) {
        this.collectPickup(actor, pickup);
      }
      return;
    }

    const closest = this.findNearestLoot(actor.position, INTERACT_DISTANCE);
    if (closest) {
      this.collectPickup(actor, closest);
    }
  }

  private pickNearestLoot(actor: Actor): void {
    const closest = this.findNearestLoot(actor.position, INTERACT_DISTANCE);
    if (!closest) {
      this.showMessage('Nothing close enough to pick up.', 1);
      return;
    }

    this.collectPickup(actor, closest);
  }

  private collectPickup(actor: Actor, pickup: LootPickup): void {
    if (!this.loot.includes(pickup)) {
      return;
    }

    if (pickup.kind === 'weapon' && pickup.weapon) {
      const existing = actor.inventory.weapons.find((weapon) => weapon.definition.id === pickup.weapon!.id);
      if (existing) {
        actor.inventory.ammo[pickup.weapon.ammoType] += pickup.weapon.reservePickup;
        if (actor.kind === 'player') {
          this.showMessage(`Ammo topped up for ${pickup.weapon.name}.`, 1.2);
        }
      } else {
        const instance: WeaponInstance = {
          definition: pickup.weapon,
          magAmmo: pickup.weapon.magSize
        };

        if (actor.inventory.weapons.length < MAX_WEAPON_SLOTS) {
          actor.inventory.weapons.push(instance);
          this.sortWeaponsByHotbarOrder(actor);
        } else {
          const replaceIndex = actor.kind === 'player'
            ? clamp(actor.inventory.weaponIndex, 0, actor.inventory.weapons.length - 1)
            : this.findWeakestWeaponIndex(actor.inventory.weapons);
          actor.inventory.weapons[replaceIndex] = instance;
          this.sortWeaponsByHotbarOrder(actor);
        }

        actor.inventory.mode = 'weapon';
        actor.inventory.weaponIndex = this.getWeaponSlotIndexById(pickup.weapon.id);
        actor.inventory.ammo[pickup.weapon.ammoType] += pickup.weapon.reservePickup;
        if (actor.kind === 'player') {
          this.showMessage(`Picked up ${pickup.weapon.name}.`, 1.4);
        }
      }
    } else if (pickup.kind === 'ammo' && pickup.ammoType && pickup.amount) {
      actor.inventory.ammo[pickup.ammoType] += pickup.amount;
      if (actor.kind === 'player') {
        this.showMessage(`+${pickup.amount} ${pickup.ammoType} ammo`, 1.1);
      }
    } else if (pickup.kind === 'material' && pickup.materialType && pickup.amount) {
      actor.inventory.materials[pickup.materialType] += pickup.amount;
      if (actor.kind === 'player') {
        this.showMessage(`+${pickup.amount} ${MATERIAL_DISPLAY_NAMES[pickup.materialType]}`, 1.1);
      }
    }

    this.loot = this.loot.filter((entry) => entry.id !== pickup.id);
    this.lootGroup.remove(pickup.mesh);
    this.disposeObject(pickup.mesh);
  }

  private applyDamage(target: Actor, amount: number, attacker: Actor | null, reason: 'weapon' | 'storm'): void {
    if (!target.alive || (attacker && this.areTeammates(attacker, target))) {
      return;
    }

    target.health -= amount;
    if (target.health > 0) {
      return;
    }

    target.health = 0;
    target.alive = false;
    target.group.visible = false;
    this.raycastTargets = this.raycastTargets.filter((entry) => entry.userData.ref !== target);

    if (attacker) {
      attacker.eliminationCount += 1;
      if (attacker.kind === 'player') {
        this.showMessage(`Eliminated ${target.id}.`, 1.6);
      }
    }

    this.dropActorLoot(target);

    if (target.kind === 'player') {
      const livingTeammate = this.isDuosMode() ? this.findLivingTeammate(target) : null;
      if (livingTeammate) {
        this.transferPlayerControl(livingTeammate);
        return;
      }

      this.endMatch('Defeat', 'You were eliminated. Press Enter or use the button to drop into a new match.', false);
      if (reason === 'storm') {
        this.showMessage('The storm got you.', 2.5);
      }
    }
  }

  private dropActorLoot(actor: Actor): void {
    const dropOrigin = actor.position.clone();

    for (const weapon of actor.inventory.weapons) {
      this.createWeaponPickup(dropOrigin.clone().add(new THREE.Vector3(this.rng.range(-1.2, 1.2), 0, this.rng.range(-1.2, 1.2))), weapon.definition, false);
      const reserve = actor.inventory.ammo[weapon.definition.ammoType];
      if (reserve > 0) {
        this.createAmmoPickup(dropOrigin.clone().add(new THREE.Vector3(this.rng.range(-1.4, 1.4), 0, this.rng.range(-1.4, 1.4))), weapon.definition.ammoType, Math.min(reserve, weapon.definition.reservePickup));
      }
    }

    for (const material of MATERIAL_PRIORITY) {
      const amount = actor.inventory.materials[material];
      if (amount <= 0) {
        continue;
      }

      this.createMaterialPickup(
        dropOrigin.clone().add(new THREE.Vector3(this.rng.range(-1.6, 1.6), 0, this.rng.range(-1.6, 1.6))),
        material,
        Math.max(12, Math.floor(amount * 0.5))
      );
    }
  }

  private checkMatchEnd(): void {
    if (this.state === 'ended') {
      return;
    }

    const aliveTeams = this.getAliveTeamCount();
    if (aliveTeams > 1) {
      return;
    }

    if (this.player.alive) {
      this.endMatch(
        'Victory Royale',
        this.isDuosMode()
          ? 'Your duo outlasted every other team. Press Enter or use the button to queue another match.'
          : 'You outlasted every bot and survived the storm. Press Enter or use the button to queue another offline match.',
        true
      );
    } else {
      this.endMatch('Defeat', 'Another bot won the match. Press Enter or use the button to try again.', false);
    }
  }

  private endMatch(title: string, body: string, won: boolean): void {
    this.state = 'ended';
    if (this.options.showEndScreen !== false) {
      this.hud.showEndScreen(title, body);
    }
    this.reportMatchResult(won);
  }

  private reportMatchResult(won: boolean): void {
    if (this.matchResultSent) {
      return;
    }

    this.matchResultSent = true;
    this.options.onMatchEnd?.({
      won,
      placement: this.calculatePlacement(),
      eliminations: this.getDisplayedEliminationCount(),
      survivalTime: Math.round(this.matchTime),
    });
  }

  private calculatePlacement(): number {
    if (!this.player) {
      return 0;
    }

    const aliveCount = this.isDuosMode() ? this.getAliveTeamCount() : this.actors.filter((actor) => actor.alive).length;
    return this.player.alive ? aliveCount : aliveCount + 1;
  }

  private updateHud(): void {
    const weapon = this.getEquippedWeapon(this.player);
    const aliveCount = this.actors.filter((actor) => actor.alive).length;
    const teammate = this.findLivingTeammate(this.player);
    const pickupPrompt = this.player.spawnState === 'grounded'
      ? this.findNearestLoot(this.player.position, INTERACT_DISTANCE)
      : null;
    const initialStormRadius = MAP_RADIUS - 3;
    const finalStormRadius = STORM_PHASES[STORM_PHASES.length - 1]?.targetRadius ?? 1;
    const initialStormArea = Math.PI * initialStormRadius * initialStormRadius;
    const finalStormArea = Math.PI * finalStormRadius * finalStormRadius;
    const currentStormArea = Math.PI * this.storm.currentRadius * this.storm.currentRadius;
    const stormProgress = clamp(
      ((initialStormArea - currentStormArea) / Math.max(1, initialStormArea - finalStormArea)) * 100,
      0,
      100
    );
    const stormText = !this.isStormActive()
      ? `Storm in ${Math.ceil(Math.max(0, STORM_START_DELAY - this.matchTime))}s`
      : `Storm Phase ${stormProgress.toFixed(0)}%`;

    const statusText = this.player.spawnState === 'parachuting'
        ? 'Parachuting to target'
        : this.player.reloadTimer > 0 && weapon
          ? `Reloading ${weapon.definition.name}`
          : this.isBuildMode()
            ? `Ready to place ${this.selectedBuildPiece}`
            : this.isPointInWater(this.player.position)
              ? 'Wading through water'
              : this.player.inventory.mode === 'harvest'
                ? 'Harvest tool ready'
                : weapon
                  ? `${weapon.definition.name} ready`
                  : 'Find a weapon';

    this.hud.render({
      health: this.player.health,
      maxHealth: this.player.maxHealth,
      weaponName: this.isBuildMode() ? `Build Tool (${this.selectedBuildPiece})` : weapon ? weapon.definition.name : 'Harvest Tool',
      ammoInMag: this.isBuildMode() || !weapon ? 0 : weapon.magAmmo,
      ammoReserve: this.isBuildMode() || !weapon ? 0 : this.player.inventory.ammo[weapon.definition.ammoType],
      aliveCount,
      eliminationCount: this.getDisplayedEliminationCount(),
      materials: this.player.inventory.materials,
      stormText,
      bannerText: this.getBannerText(pickupPrompt),
      buildMode: this.isBuildMode(),
      buildPieceType: this.selectedBuildPiece,
      pointerLocked: this.isPointerLocked(),
      compassText: this.getCompassText(),
      statusText,
      showHelp: this.helpVisible,
      hotbarItems: this.getHotbarItems(),
      minimap: {
        mapRadius: MAP_RADIUS,
        playerX: this.player.position.x,
        playerZ: this.player.position.z,
        playerYaw: this.player.yaw,
        teammateX: teammate?.position.x ?? null,
        teammateZ: teammate?.position.z ?? null,
        stormCenterX: this.storm.currentCenter.x,
        stormCenterZ: this.storm.currentCenter.z,
        stormRadius: this.storm.currentRadius,
        safeZoneCenterX: this.storm.targetCenter.x,
        safeZoneCenterZ: this.storm.targetCenter.z,
        safeZoneRadius: this.storm.targetRadius
      }
    });
    this.options.onPlacementChange?.(this.calculatePlacement());
  }

  private render(): void {
    this.updateCamera();
    this.syncViewModel(false);
    this.updateHud();
    this.renderer.render(this.scene, this.camera);
  }

  private isFirstPersonView(): boolean {
    return this.player.alive && this.player.spawnState === 'grounded' && this.mouseDown.has(2) && !this.isBuildMode();
  }

  private updatePlayerPerspectiveVisibility(firstPerson: boolean): void {
    if (!this.player) {
      return;
    }

    for (const part of this.player.bodyParts) {
      part.visible = !firstPerson;
    }
    this.player.ringMesh.visible = false;
  }

  private resolveCameraCollision(origin: THREE.Vector3, desiredPosition: THREE.Vector3): THREE.Vector3 {
    const direction = desiredPosition.clone().sub(origin);
    const distance = direction.length();
    if (distance <= 0.001) {
      return desiredPosition;
    }

    direction.normalize();
    this.raycaster.set(origin, direction);
    this.raycaster.far = distance;
    const hits = this.raycaster.intersectObjects(this.cameraObstacles, true);
    for (const hit of hits) {
      const kind = hit.object.userData.kind as string | undefined;
      if (kind !== 'static' && kind !== 'resource' && kind !== 'build') {
        continue;
      }

      return origin.clone().addScaledVector(direction, Math.max(0.2, hit.distance - CAMERA_COLLISION_PADDING));
    }

    return desiredPosition;
  }

  private updateCamera(): void {
    if (!this.player) {
      return;
    }

    const firstPerson = this.isFirstPersonView();
    const zoomTarget = firstPerson ? ZOOMED_CAMERA_FOV : DEFAULT_CAMERA_FOV;
    const nextFov = THREE.MathUtils.lerp(this.camera.fov, zoomTarget, CAMERA_FOV_LERP);
    if (Math.abs(nextFov - this.camera.fov) > 0.01) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }

    const aimDirection = this.getAimDirection();
    const horizontalForward = new THREE.Vector3(Math.sin(this.cameraYaw), 0, Math.cos(this.cameraYaw));
    const right = new THREE.Vector3(-horizontalForward.z, 0, horizontalForward.x);
    const pivotHeight = this.player.spawnState === 'parachuting'
        ? 2.2
        : PLAYER_EYE_HEIGHT;
    const pivot = this.player.position.clone().add(new THREE.Vector3(0, pivotHeight, 0));
    let desiredPosition: THREE.Vector3;
    let lookTarget: THREE.Vector3;

    if (firstPerson) {
      desiredPosition = pivot.clone();
      lookTarget = pivot.clone().addScaledVector(aimDirection, 24);
    } else {
      const cameraDistance = this.player.spawnState === 'parachuting'
          ? PARACHUTE_CAMERA_DISTANCE
          : THIRD_PERSON_CAMERA_DISTANCE;
      const cameraHeight = this.player.spawnState === 'parachuting'
          ? THIRD_PERSON_CAMERA_HEIGHT + 1.35
          : THIRD_PERSON_CAMERA_HEIGHT;
      const shoulderOffset = this.player.spawnState === 'parachuting' ? 0.32 : THIRD_PERSON_CAMERA_SHOULDER;
      desiredPosition = pivot.clone()
        .add(new THREE.Vector3(0, cameraHeight, 0))
        .addScaledVector(horizontalForward, -cameraDistance)
        .addScaledVector(right, shoulderOffset);
      desiredPosition = this.resolveCameraCollision(pivot.clone().add(new THREE.Vector3(0, 0.55, 0)), desiredPosition);
      lookTarget = pivot.clone().addScaledVector(aimDirection, this.player.spawnState === 'parachuting' ? 20 : 22);
    }

    if (!this.cameraRigInitialized || this.lastFirstPersonView !== firstPerson) {
      this.cameraRigPosition.copy(desiredPosition);
      this.cameraLookPosition.copy(lookTarget);
      this.cameraRigInitialized = true;
    } else {
      this.cameraRigPosition.lerp(desiredPosition, firstPerson ? 0.4 : CAMERA_POSITION_LERP);
      this.cameraLookPosition.lerp(lookTarget, firstPerson ? 0.42 : CAMERA_LOOK_LERP);
    }

    this.camera.position.copy(this.cameraRigPosition);
    this.camera.lookAt(this.cameraLookPosition);
    this.updatePlayerPerspectiveVisibility(firstPerson);
    this.lastFirstPersonView = firstPerson;
  }

  private getAimDirection(): THREE.Vector3 {
    const cosPitch = Math.cos(this.cameraPitch);
    return new THREE.Vector3(
      Math.sin(this.cameraYaw) * cosPitch,
      Math.sin(this.cameraPitch),
      Math.cos(this.cameraYaw) * cosPitch
    ).normalize();
  }

  private getCompassText(): string {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const degrees = ((THREE.MathUtils.radToDeg(this.cameraYaw) % 360) + 360) % 360;
    const direction = directions[Math.round(degrees / 45) % directions.length];
    return `${direction} ${Math.round(degrees)}°`;
  }

  private getHotbarItems(): Array<{ key: string; label: string; detail: string; active: boolean }> {
    if (this.isBuildMode()) {
      return [
        { key: 'Z', label: 'Wall', detail: '20 mats', active: this.selectedBuildPiece === 'wall' },
        { key: 'Y', label: 'Floor', detail: '20 mats', active: this.selectedBuildPiece === 'floor' },
        { key: 'X', label: 'Ramp', detail: '20 mats', active: this.selectedBuildPiece === 'ramp' }
      ];
    }

    return WEAPON_DEFINITIONS.map((definition, slotIndex) => {
      const weapon = this.getWeaponForSlot(this.player, slotIndex);
      return {
        key: String(slotIndex + 1),
        label: definition.name,
        detail: weapon ? `${weapon.magAmmo}/${this.player.inventory.ammo[definition.ammoType]}` : 'Pick up gun',
        active: this.player.inventory.mode === 'weapon' && this.player.inventory.weaponIndex === slotIndex
      };
    });
  }

  private getBannerText(nearbyPickup: LootPickup | null): string {
    if (this.state === 'ended') {
      return this.player.alive ? 'Victory. Press Enter or use the button to start another match.' : 'Defeat. Press Enter or use the button to restart.';
    }

    if (this.timedMessage) {
      return this.timedMessage.text;
    }

    if (!this.isPointerLocked()) {
      return 'Click once to capture the mouse for unlimited 360 look. FortLite defaults to third-person, and right click switches to first-person aim.';
    }

    if (this.player.spawnState === 'parachuting') {
      return 'Parachuting. Steer with WASD, choose your direction, and race to loot before the storm timer expires.';
    }

    if (nearbyPickup) {
      return this.shouldAutoPickupForPlayer(this.player, nearbyPickup)
        ? `Walk over ${this.describePickup(nearbyPickup)} to pick it up automatically.`
        : `Press E to pick up ${this.describePickup(nearbyPickup)}.`;
    }

    if (this.isBuildMode()) {
      const material = this.getAvailableBuildMaterial(this.player);
      return material
        ? `Build mode: ${this.selectedBuildPiece}. Left click to place, R to rotate, Q to exit.`
        : 'Build mode active, but you need at least 20 materials to place a piece.';
    }

    if (this.isOutsideStorm(this.player.position)) {
      return 'You are outside the storm. Sprint back into the safe zone.';
    }

    if (this.player.inventory.mode === 'harvest') {
      return 'Harvest trees, rocks, and metal nodes, or switch to Rifle, Shotgun, or SMG with 1, 2, or 3.';
    }

    return this.isDuosMode()
      ? 'Stay armed, keep moving, and keep your duo alive. Right click snaps you into first-person aim.'
      : 'Stay armed, keep moving, and be the last survivor standing. Right click snaps you into first-person aim.';
  }

  private showMessage(text: string, duration = 1.6): void {
    this.timedMessage = { text, timeRemaining: duration };
  }

  private refreshNavigation(): void {
    const dynamicObstacles = this.buildPieces
      .map((piece) => piece.obstacle)
      .filter((entry): entry is ObstacleBox => Boolean(entry));
    const obstacles = [...this.staticObstacles, ...this.resourceNodes.map((node) => node.obstacle), ...dynamicObstacles];
    this.pathfinder.rebuild(obstacles);
  }

  private describePickup(pickup: LootPickup): string {
    if (pickup.kind === 'weapon' && pickup.weapon) {
      return pickup.weapon.name;
    }
    if (pickup.kind === 'ammo' && pickup.amount && pickup.ammoType) {
      return `${pickup.amount} ${pickup.ammoType} ammo`;
    }
    if (pickup.kind === 'material' && pickup.amount && pickup.materialType) {
      return `${pickup.amount} ${pickup.materialType}`;
    }
    return 'loot';
  }

  private shouldAutoPickupForPlayer(actor: Actor, pickup: LootPickup): boolean {
    if (pickup.kind === 'ammo' || pickup.kind === 'material') {
      return true;
    }

    return false;
  }

  private getWeaponSlotIndexById(weaponId: string): number {
    const index = WEAPON_DEFINITIONS.findIndex((weapon) => weapon.id === weaponId);
    return index === -1 ? 0 : index;
  }

  private sortWeaponsByHotbarOrder(actor: Actor): void {
    actor.inventory.weapons.sort(
      (a, b) => this.getWeaponSlotIndexById(a.definition.id) - this.getWeaponSlotIndexById(b.definition.id)
    );
  }

  private getWeaponForSlot(actor: Actor, slotIndex: number): WeaponInstance | null {
    const definition = WEAPON_DEFINITIONS[slotIndex];
    if (!definition) {
      return null;
    }

    return actor.inventory.weapons.find((weapon) => weapon.definition.id === definition.id) ?? null;
  }

  private getOwnedWeaponSlots(actor: Actor): number[] {
    return actor.inventory.weapons
      .map((weapon) => this.getWeaponSlotIndexById(weapon.definition.id))
      .sort((a, b) => a - b);
  }

  private selectWeaponSlot(actor: Actor, slotIndex: number): boolean {
    const weapon = this.getWeaponForSlot(actor, slotIndex);
    if (!weapon) {
      return false;
    }

    actor.inventory.mode = 'weapon';
    actor.inventory.weaponIndex = slotIndex;
    return true;
  }

  private findNearestLoot(position: THREE.Vector3, maxDistance: number): LootPickup | null {
    let closest: LootPickup | null = null;
    let bestDistance = maxDistance;

    for (const pickup of this.loot) {
      const distance = horizontalDistance(position, pickup.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        closest = pickup;
      }
    }

    return closest;
  }

  private findBestLootForActor(actor: Actor, maxDistance: number): LootPickup | null {
    let best: LootPickup | null = null;
    let bestScore = 0;

    for (const pickup of this.loot) {
      const distance = horizontalDistance(actor.position, pickup.position);
      if (distance > maxDistance) {
        continue;
      }

      let score = 0;
      if (pickup.kind === 'weapon' && pickup.weapon) {
        const hasWeapon = actor.inventory.weapons.some((weapon) => weapon.definition.id === pickup.weapon!.id);
        score = hasWeapon ? 12 : this.weaponScore(pickup.weapon) * 0.8;
        if (actor.inventory.weapons.length === 0) {
          score += 240;
        }
      } else if (pickup.kind === 'ammo' && pickup.amount && pickup.ammoType) {
        score = 45 - distance;
        for (const weapon of actor.inventory.weapons) {
          if (weapon.definition.ammoType === pickup.ammoType) {
            score += 40;
          }
        }
      } else if (pickup.kind === 'material' && pickup.amount) {
        score = this.totalMaterials(actor.inventory.materials) < 36 ? pickup.amount + 18 : pickup.amount * 0.4;
      }

      score -= distance * 1.2;
      if (score > bestScore) {
        bestScore = score;
        best = pickup;
      }
    }

    return best;
  }

  private areTeammates(actor: Actor, other: Actor): boolean {
    return actor.teamId === other.teamId;
  }

  private findLivingTeammate(actor: Actor): Actor | null {
    if (!this.isDuosMode()) {
      return null;
    }

    return this.actors.find((other) => other.id !== actor.id && other.alive && this.areTeammates(actor, other)) ?? null;
  }

  private transferPlayerControl(nextPlayer: Actor): void {
    this.player = nextPlayer;
    this.refreshActorPresentations();
    this.cameraYaw = nextPlayer.yaw;
    this.cameraPitch = 0.05;
    this.cameraRigInitialized = false;
    this.lastFirstPersonView = false;
    this.pendingLookDeltaX = 0;
    this.pendingLookDeltaY = 0;
    this.viewModelKick = 0;
    this.viewModelMoveBlend = 0;
    this.viewModelSway.set(0, 0);
    this.syncViewModel(true);
    this.showMessage('Your duo partner is still alive. Control swapped to them.', 2.6);
  }

  private getAliveTeamCount(): number {
    const aliveTeams = new Set<number>();
    for (const actor of this.actors) {
      if (actor.alive) {
        aliveTeams.add(actor.teamId);
      }
    }
    return aliveTeams.size;
  }

  private getDisplayedEliminationCount(): number {
    if (!this.isDuosMode()) {
      return this.player.eliminationCount;
    }

    return this.actors
      .filter((actor) => actor.teamId === this.player.teamId)
      .reduce((total, actor) => total + actor.eliminationCount, 0);
  }

  private findVisibleEnemy(actor: Actor, range: number): Actor | null {
    let closest: Actor | null = null;
    let bestDistance = range;

    for (const other of this.actors) {
      if (!other.alive || other.spawnState !== 'grounded' || other.id === actor.id || this.areTeammates(actor, other)) {
        continue;
      }

      const distance = horizontalDistance(actor.position, other.position);
      if (distance >= bestDistance) {
        continue;
      }

      if (!this.hasLineOfSight(actor, other)) {
        continue;
      }

      bestDistance = distance;
      closest = other;
    }

    return closest;
  }

  private hasLineOfSight(from: Actor, to: Actor): boolean {
    const origin = from.position.clone().add(new THREE.Vector3(0, PLAYER_EYE_HEIGHT, 0));
    const target = to.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const direction = target.clone().sub(origin);
    const distance = direction.length();
    direction.normalize();

    this.raycaster.set(origin, direction);
    this.raycaster.far = distance;
    const hits = this.raycaster.intersectObjects(this.raycastTargets, true);
    for (const hit of hits) {
      const hitKind = hit.object.userData.kind as string | undefined;
      const ref = hit.object.userData.ref as Actor | BuildPiece | null | undefined;
      if (hitKind === 'actor' && ref && (ref as Actor).id === from.id) {
        continue;
      }
      if (hitKind === 'actor' && ref && (ref as Actor).id === to.id) {
        return true;
      }
      return false;
    }

    return true;
  }

  private findActorById(id: string): Actor | undefined {
    return this.actors.find((actor) => actor.id === id);
  }

  private hasUsableWeapon(actor: Actor): boolean {
    return actor.inventory.weapons.some((weapon) => weapon.magAmmo > 0 || actor.inventory.ammo[weapon.definition.ammoType] > 0);
  }

  private getEquippedWeapon(actor: Actor): WeaponInstance | null {
    if (actor.inventory.mode !== 'weapon' || actor.inventory.weapons.length === 0) {
      return null;
    }
    const index = clamp(actor.inventory.weaponIndex, 0, WEAPON_DEFINITIONS.length - 1);
    actor.inventory.weaponIndex = index;
    return this.getWeaponForSlot(actor, index);
  }

  private getAvailableBuildMaterial(actor: Actor): MaterialType | null {
    for (const materialType of MATERIAL_PRIORITY) {
      if (actor.inventory.materials[materialType] >= BUILD_COST) {
        return materialType;
      }
    }
    return null;
  }

  private isBuildMode(): boolean {
    return this.buildMode;
  }

  private setBuildPieceType(pieceType: BuildPieceType): void {
    this.selectedBuildPiece = pieceType;
    this.ensurePreviewMesh();
  }

  private isStormActive(): boolean {
    return this.matchTime >= STORM_START_DELAY;
  }

  private getSafeZoneObjective(): { center: THREE.Vector3; radius: number } {
    if (!this.isStormActive()) {
      return {
        center: this.storm.targetCenter,
        radius: this.storm.targetRadius
      };
    }

    if (this.storm.mode === 'done') {
      return {
        center: this.storm.currentCenter,
        radius: this.storm.currentRadius
      };
    }

    return {
      center: this.storm.targetCenter,
      radius: this.storm.targetRadius
    };
  }

  private getStormPressure(position: THREE.Vector3): number {
    if (!this.isStormActive()) {
      return 0;
    }

    const currentMargin = this.storm.currentRadius - horizontalDistance(position, this.storm.currentCenter);
    if (currentMargin < 0) {
      return 1;
    }

    const objective = this.getSafeZoneObjective();
    const objectiveMargin = objective.radius - horizontalDistance(position, objective.center);
    if (this.storm.mode === 'shrink') {
      return clamp((72 - currentMargin) / 72, 0, 1);
    }

    return clamp((36 - objectiveMargin) / 36, 0, 1);
  }

  private shouldRotateToSafeZone(position: THREE.Vector3): boolean {
    if (!this.isStormActive()) {
      return false;
    }

    if (this.isOutsideStorm(position)) {
      return true;
    }

    const objective = this.getSafeZoneObjective();
    const distanceToTarget = horizontalDistance(position, objective.center);
    const phase = STORM_PHASES[Math.min(this.storm.phaseIndex, STORM_PHASES.length - 1)];
    const pauseProgress = this.storm.mode === 'pause'
      ? clamp(this.storm.timer / Math.max(0.001, phase?.pauseDuration ?? 1), 0, 1)
      : 1;
    const rotateBuffer = this.storm.mode === 'shrink'
      ? 14
      : THREE.MathUtils.lerp(34, 18, pauseProgress);

    return distanceToTarget > Math.max(6, objective.radius - rotateBuffer);
  }

  private getSafeZoneDestination(position: THREE.Vector3): THREE.Vector3 {
    const objective = this.getSafeZoneObjective();
    const desired = clampToCircle(position, objective.center, Math.max(6, objective.radius - 12));
    if (horizontalDistance(position, desired) < 2) {
      return objective.center.clone();
    }
    return desired;
  }

  private isOutsideStorm(position: THREE.Vector3): boolean {
    if (!this.isStormActive()) {
      return false;
    }

    return horizontalDistance(position, this.storm.currentCenter) > this.storm.currentRadius;
  }

  private findNearestResource(position: THREE.Vector3, maxDistance: number): ResourceNode | null {
    let best: ResourceNode | null = null;
    let bestDistance = maxDistance;

    for (const node of this.resourceNodes) {
      const distance = horizontalDistance(position, node.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = node;
      }
    }

    return best;
  }

  private findHarvestTarget(actor: Actor): ResourceNode | null {
    const nearby = this.findNearestResource(actor.position, HARVEST_DISTANCE);
    if (!nearby) {
      return null;
    }

    const aimDirection = actor.kind === 'player' ? this.getAimDirection() : yawToDirection(actor.yaw);
    const toNode = nearby.position.clone().sub(actor.position).setY(0).normalize();
    if (aimDirection.dot(toNode) < 0.15 && actor.kind === 'player') {
      return null;
    }

    return nearby;
  }

  private weaponScore(definition: WeaponDefinition): number {
    return (definition.damage * definition.pellets) / definition.fireInterval;
  }

  private findWeakestWeaponIndex(weapons: WeaponInstance[]): number {
    let index = 0;
    let worstScore = Number.POSITIVE_INFINITY;

    for (let i = 0; i < weapons.length; i += 1) {
      const score = this.weaponScore(weapons[i].definition);
      if (score < worstScore) {
        worstScore = score;
        index = i;
      }
    }

    return index;
  }

  private totalMaterials(materials: Record<MaterialType, number>): number {
    return materials.wood + materials.stone + materials.metal;
  }

  private getMovementMultiplier(position: THREE.Vector3): number {
    for (const zone of this.waterZones) {
      if (this.isPointInWater(position, 0, zone)) {
        return zone.moveMultiplier;
      }
    }

    return 1;
  }

  private isPointInWater(point: THREE.Vector3, padding = 0, zoneOverride?: WaterZone): boolean {
    const zones = zoneOverride ? [zoneOverride] : this.waterZones;
    for (const zone of zones) {
      const dx = point.x - zone.center.x;
      const dz = point.z - zone.center.z;
      const cos = Math.cos(-zone.rotation);
      const sin = Math.sin(-zone.rotation);
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;
      const radiusX = zone.radiusX + padding;
      const radiusZ = zone.radiusZ + padding;
      const ellipse = ((localX * localX) / (radiusX * radiusX)) + ((localZ * localZ) / (radiusZ * radiusZ));
      if (ellipse <= 1) {
        return true;
      }
    }

    return false;
  }

  private createBuildMesh(pieceType: BuildPieceType, color: number, transparent: boolean): THREE.Mesh {
    let geometry: THREE.BufferGeometry;
    if (pieceType === 'wall') {
      geometry = new THREE.BoxGeometry(WALL_WIDTH, WALL_HEIGHT, WALL_THICKNESS);
    } else if (pieceType === 'floor') {
      geometry = new THREE.BoxGeometry(FLOOR_SIZE, FLOOR_THICKNESS, FLOOR_SIZE);
    } else {
      geometry = new THREE.BoxGeometry(RAMP_WIDTH, RAMP_THICKNESS, RAMP_LENGTH);
    }

    const material = new THREE.MeshStandardMaterial({
      color,
      transparent,
      opacity: transparent ? 0.45 : 0.92,
      roughness: 0.88,
      metalness: 0.05
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.pieceType = pieceType;
    return mesh;
  }

  private syncViewModel(force: boolean): void {
    if (!this.player) {
      this.viewModelRoot.visible = false;
      return;
    }

    const equippedWeapon = this.getEquippedWeapon(this.player);
    const nextKey = !this.player.alive
      ? 'hidden'
      : this.isBuildMode()
        ? `build-${this.selectedBuildPiece}`
        : this.player.inventory.mode === 'weapon' && equippedWeapon
          ? equippedWeapon.definition.id
          : 'harvest';

    if (force || nextKey !== this.currentViewModelKey) {
      if (this.viewModelItem.parent) {
        this.viewModelRoot.remove(this.viewModelItem);
      }
      this.disposeObject(this.viewModelItem);
      this.viewModelItem = nextKey === 'hidden'
        ? new THREE.Group()
        : this.createViewModelMesh(nextKey, equippedWeapon?.definition ?? null);
      this.viewModelRoot.add(this.viewModelItem);
      this.currentViewModelKey = nextKey;
    }

    this.viewModelRoot.visible = this.player.alive && this.isFirstPersonView();
    if (!this.player.alive || !this.isFirstPersonView()) {
      return;
    }

    const bobX = Math.sin(this.viewModelBobTime * 1.9) * 0.028 * this.viewModelMoveBlend;
    const bobY = Math.abs(Math.cos(this.viewModelBobTime * 3.8)) * 0.026 * this.viewModelMoveBlend;
    const reloadTilt = this.player.reloadTimer > 0
      ? Math.sin(this.matchTime * 11) * 0.04 + 0.18
      : 0;

    this.viewModelItem.position.set(
      bobX + this.viewModelSway.x * 1.6,
      bobY + this.viewModelSway.y * 1.6 - this.viewModelKick * 0.22,
      this.viewModelKick * 0.42
    );
    this.viewModelItem.rotation.set(
      0.02 + this.viewModelSway.y * 2.2 + reloadTilt,
      0.06 + this.viewModelSway.x * 1.8 - reloadTilt * 0.35,
      -0.04 - this.viewModelSway.x * 3.2
    );

    const muzzleFlash = this.viewModelItem.getObjectByName('muzzleFlash');
    if (muzzleFlash) {
      muzzleFlash.visible = this.muzzleFlashTime > 0;
      if (muzzleFlash instanceof THREE.Mesh) {
        muzzleFlash.scale.setScalar(0.75 + this.muzzleFlashTime * 2.2);
      }
    }
  }

  private createViewModelMesh(key: string, weapon: WeaponDefinition | null): THREE.Group {
    const root = new THREE.Group();
    const sleeveMaterial = new THREE.MeshStandardMaterial({ color: 0x29384a, roughness: 0.74 });
    const gloveMaterial = new THREE.MeshStandardMaterial({ color: 0xf1d0b2, roughness: 0.9 });

    const makeArm = (x: number, y: number, z: number, rotZ: number): void => {
      const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.58, 0.2), sleeveMaterial);
      forearm.position.set(x, y, z);
      forearm.rotation.z = rotZ;

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), gloveMaterial);
      hand.position.set(x, y - 0.3, z - 0.04);

      root.add(forearm, hand);
    };

    makeArm(0.32, -0.04, -0.02, -0.42);
    makeArm(-0.02, -0.1, -0.36, 0.32);

    if (key === 'harvest') {
      root.add(this.createHarvestToolMesh());
      return root;
    }

    if (key.startsWith('build-')) {
      root.add(this.createBuildToolMesh());
      return root;
    }

    if (weapon) {
      const gun = this.createWeaponDisplayModel(weapon, 'view');
      gun.position.set(0.1, -0.22, -0.2);
      gun.rotation.y = Math.PI;
      root.add(gun);
    }

    return root;
  }

  private createHarvestToolMesh(): THREE.Group {
    const tool = new THREE.Group();
    const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x77512d, roughness: 0.9 });
    const gripMaterial = new THREE.MeshStandardMaterial({ color: 0x1e242d, roughness: 0.72, metalness: 0.12 });
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xaebdcb, roughness: 0.26, metalness: 0.84 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x4fd1ff, emissive: 0x16485c, emissiveIntensity: 0.28, roughness: 0.34, metalness: 0.32 });

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.048, 1.28, 12), handleMaterial);
    shaft.rotation.z = 0.8;
    shaft.position.set(0.18, -0.12, -0.34);

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.34, 12), gripMaterial);
    grip.rotation.z = shaft.rotation.z;
    grip.position.set(-0.03, -0.34, -0.18);

    const pommel = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xadb6c1, roughness: 0.34, metalness: 0.76 })
    );
    pommel.position.set(-0.15, -0.47, -0.08);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.12, 10), gripMaterial);
    collar.rotation.z = shaft.rotation.z;
    collar.position.set(0.37, 0.08, -0.46);

    const headCore = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.18), headMaterial);
    headCore.position.set(0.45, 0.18, -0.5);
    headCore.rotation.z = -0.12;

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.09, 0.08), headMaterial);
    blade.position.set(0.56, 0.24, -0.53);
    blade.rotation.z = -0.24;

    const bladeTip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.22, 10), headMaterial);
    bladeTip.position.set(0.83, 0.3, -0.56);
    bladeTip.rotation.z = -Math.PI * 0.5 - 0.24;

    const rearSpike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 10), headMaterial);
    rearSpike.position.set(0.18, 0.15, -0.47);
    rearSpike.rotation.z = Math.PI * 0.5 - 0.08;

    const accentStrip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.04), accentMaterial);
    accentStrip.position.set(0.46, 0.29, -0.5);
    accentStrip.rotation.z = -0.24;

    tool.add(shaft, grip, pommel, collar, headCore, blade, bladeTip, rearSpike, accentStrip);
    return tool;
  }

  private createBuildToolMesh(): THREE.Group {
    const tool = new THREE.Group();

    const tablet = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.48, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x5bc6ff, emissive: 0x1a6587, emissiveIntensity: 0.45, roughness: 0.22, metalness: 0.18 })
    );
    tablet.position.set(0.06, -0.04, -0.5);
    tablet.rotation.set(0.3, -0.18, 0.12);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.56, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x202b39, roughness: 0.65, metalness: 0.25 })
    );
    frame.position.copy(tablet.position);
    frame.rotation.copy(tablet.rotation);

    const stylus = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.56, 8),
      new THREE.MeshStandardMaterial({ color: 0xffb454, roughness: 0.34, metalness: 0.62 })
    );
    stylus.position.set(0.4, -0.18, -0.26);
    stylus.rotation.z = 0.78;

    tool.add(frame, tablet, stylus);
    return tool;
  }

  private createWeaponDisplayModel(weapon: WeaponDefinition, variant: 'pickup' | 'view'): THREE.Group {
    const group = new THREE.Group();
    const mainColor = weapon.color;
    const metalColor = variant === 'view' ? 0xd7e1ea : 0xc6d2dd;
    const darkColor = 0x25303a;

    const bodyLength = weapon.id === 'auto-shotgun' ? 1.08 : weapon.id === 'tactical-smg' ? 0.88 : 1.16;
    const barrelLength = weapon.id === 'auto-shotgun' ? 1.12 : weapon.id === 'tactical-smg' ? 0.72 : 1.28;
    const stockLength = weapon.id === 'tactical-smg' ? 0.42 : 0.62;

    const receiver = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.24, bodyLength),
      new THREE.MeshStandardMaterial({ color: mainColor, roughness: 0.38, metalness: 0.38 })
    );
    receiver.position.z = -0.08;

    const stock = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.18, stockLength),
      new THREE.MeshStandardMaterial({ color: darkColor, roughness: 0.7, metalness: 0.18 })
    );
    stock.position.set(0, -0.02, bodyLength * 0.5 + stockLength * 0.3);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, barrelLength, 12),
      new THREE.MeshStandardMaterial({ color: metalColor, roughness: 0.22, metalness: 0.9 })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.01, 0.03, -bodyLength * 0.5 - barrelLength * 0.45);

    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.38, 0.16),
      new THREE.MeshStandardMaterial({ color: darkColor, roughness: 0.82 })
    );
    grip.position.set(0, -0.23, 0.06);
    grip.rotation.x = -0.28;

    const magazine = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, weapon.id === 'tactical-smg' ? 0.34 : 0.28, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x394551, roughness: 0.62, metalness: 0.32 })
    );
    magazine.position.set(0, -0.2, weapon.id === 'tactical-smg' ? -0.1 : 0.05);
    magazine.rotation.x = weapon.id === 'tactical-smg' ? -0.08 : -0.18;

    const frontGrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.22, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x2e3742, roughness: 0.76 })
    );
    frontGrip.position.set(0, -0.14, -bodyLength * 0.3);

    group.add(receiver, stock, barrel, grip, magazine, frontGrip);

    if (weapon.id === 'ranger-rifle') {
      const scope = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.42, 12),
        new THREE.MeshStandardMaterial({ color: 0x12181f, roughness: 0.5, metalness: 0.72 })
      );
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.16, -0.14);
      group.add(scope);
    }

    if (weapon.id === 'auto-shotgun') {
      const pump = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.16, 0.34),
        new THREE.MeshStandardMaterial({ color: 0x8a643c, roughness: 0.82 })
      );
      pump.position.set(0, -0.04, -0.56);
      group.add(pump);
    }

    if (variant === 'view') {
      const muzzleFlash = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.11, 0),
        new THREE.MeshStandardMaterial({ color: 0xffd18a, emissive: 0xff9c45, emissiveIntensity: 0.95, roughness: 0.25 })
      );
      muzzleFlash.name = 'muzzleFlash';
      muzzleFlash.visible = false;
      muzzleFlash.position.set(0.01, 0.03, -bodyLength * 0.5 - barrelLength * 0.92);
      group.add(muzzleFlash);
    }

    return group;
  }

  private getShotVisualOrigin(actor: Actor): THREE.Vector3 {
    if (actor.kind !== 'player') {
      return actor.position.clone().add(new THREE.Vector3(0, PLAYER_EYE_HEIGHT, 0));
    }

    if (!this.isFirstPersonView()) {
      const right = new THREE.Vector3(Math.sin(actor.yaw + Math.PI * 0.5), 0, Math.cos(actor.yaw + Math.PI * 0.5));
      return actor.position.clone()
        .add(new THREE.Vector3(0, 1.62, 0))
        .addScaledVector(right, 0.44);
    }

    this.camera.updateMatrixWorld(true);
    this.viewModelRoot.updateMatrixWorld(true);
    const muzzle = this.viewModelItem.getObjectByName('muzzleFlash');
    if (muzzle) {
      return muzzle.getWorldPosition(new THREE.Vector3());
    }

    return this.camera.position.clone();
  }

  private createShotEffect(origin: THREE.Vector3, impactPoint: THREE.Vector3, color: number): void {
    if (this.shotEffects.length >= this.maxShotEffects) {
      const oldest = this.shotEffects.shift();
      if (oldest) {
        this.effectsGroup.remove(oldest.group);
        this.disposeObject(oldest.group);
      }
    }

    const group = new THREE.Group();
    const lineMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([origin.clone(), impactPoint.clone()]),
      lineMaterial
    );
    line.frustumCulled = false;

    const sparkMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff1c9,
      emissive: color,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 1,
      roughness: 0.28,
      metalness: 0.16
    });
    const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), sparkMaterial);
    spark.position.copy(impactPoint);

    group.add(line, spark);
    this.effectsGroup.add(group);
    this.shotEffects.push({
      group,
      lineMaterial,
      sparkMaterial,
      timeRemaining: 0.12,
      duration: 0.12
    });
  }

  private makeWallObstacle(position: THREE.Vector3, yaw: number, mesh: THREE.Mesh): ObstacleBox {
    const width = Math.abs(Math.cos(yaw)) > 0.5 ? WALL_WIDTH : WALL_THICKNESS;
    const depth = Math.abs(Math.cos(yaw)) > 0.5 ? WALL_THICKNESS : WALL_WIDTH;
    return {
      minX: position.x - width * 0.5,
      maxX: position.x + width * 0.5,
      minZ: position.z - depth * 0.5,
      maxZ: position.z + depth * 0.5,
      height: position.y + WALL_HEIGHT * 0.5,
      mesh
    };
  }

  private colorForBuildMaterial(materialType: MaterialType): number {
    if (materialType === 'wood') {
      return 0xc18b43;
    }
    if (materialType === 'stone') {
      return 0xa9b4bf;
    }
    return 0x93b0c5;
  }

  private applyWeaponSpread(direction: THREE.Vector3, spread: number, playerOwned: boolean): THREE.Vector3 {
    const result = direction.clone();
    const spreadMultiplier = playerOwned ? 0.85 : 1.1;
    const angleX = this.rng.range(-1, 1) * spread * spreadMultiplier;
    const angleY = this.rng.range(-1, 1) * spread * spreadMultiplier;
    result.x += angleX;
    result.y += angleY;
    result.z += this.rng.range(-1, 1) * spread * (playerOwned ? 0.25 : 0.18);
    return result.normalize();
  }

  private spawnStarterLoadout(spawn: THREE.Vector3, index: number): void {
    const weapon = WEAPON_DEFINITIONS[index % WEAPON_DEFINITIONS.length];
    const towardCenter = WORLD_CENTER.clone().sub(spawn).setY(0);
    if (towardCenter.lengthSq() < 0.01) {
      towardCenter.set(0, 0, -1);
    } else {
      towardCenter.normalize();
    }

    const right = new THREE.Vector3(towardCenter.z, 0, -towardCenter.x);
    this.createWeaponPickup(spawn.clone().addScaledVector(towardCenter, PLAYER_STARTER_LOOT_OFFSET), weapon, true);
    this.createAmmoPickup(
      spawn.clone().addScaledVector(right, PLAYER_STARTER_LOOT_OFFSET * 0.78),
      weapon.ammoType,
      weapon.ammoType === 'light' ? 26 : 10
    );
    this.createMaterialPickup(
      spawn.clone().addScaledVector(right, -PLAYER_STARTER_LOOT_OFFSET * 0.78),
      index % 4 === 0 ? 'stone' : 'wood',
      index % 4 === 0 ? 24 : 30
    );
  }

  private generateParticipantSpawns(count: number, teamSize: number): THREE.Vector3[] {
    if (teamSize <= 1) {
      return this.generateSoloParticipantSpawns(count);
    }

    const teamCount = Math.ceil(count / teamSize);
    const anchors = this.generateSoloParticipantSpawns(teamCount);
    const spawns: THREE.Vector3[] = [];

    for (let teamIndex = 0; teamIndex < anchors.length; teamIndex += 1) {
      const anchor = anchors[teamIndex];
      const towardCenter = WORLD_CENTER.clone().sub(anchor).setY(0);
      if (towardCenter.lengthSq() < 0.01) {
        towardCenter.set(0, 0, -1);
      } else {
        towardCenter.normalize();
      }

      const side = new THREE.Vector3(towardCenter.z, 0, -towardCenter.x);
      const preferredOffsets = [-2.8, 2.8];

      for (let memberIndex = 0; memberIndex < teamSize && spawns.length < count; memberIndex += 1) {
        let candidate = anchor.clone().addScaledVector(side, preferredOffsets[memberIndex % preferredOffsets.length]);
        candidate = clampToCircle(candidate, WORLD_CENTER, MAP_RADIUS - PLAYER_SPAWN_PADDING - 1);

        if (!this.isSpawnPointClear(candidate, spawns, 3.2)) {
          candidate = this.findTeammateSpawnPoint(anchor, spawns);
        }

        spawns.push(candidate);
      }
    }

    return spawns;
  }

  private generateSoloParticipantSpawns(count: number): THREE.Vector3[] {
    const spawns: THREE.Vector3[] = [];
    const angleOffset = this.rng.range(0, Math.PI * 2);

    for (let i = 0; i < count; i += 1) {
      let bestCandidate: THREE.Vector3 | null = null;
      let bestDistance = -1;

      for (let attempt = 0; attempt < 36; attempt += 1) {
        const angle = angleOffset + (i / count) * Math.PI * 2 + this.rng.range(-0.18, 0.18);
        const radius = this.rng.range(MAP_RADIUS * 0.34, MAP_RADIUS - 18);
        const candidate = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);

        if (!this.isSpawnPointClear(candidate, spawns, PLAYER_SPAWN_SEPARATION)) {
          continue;
        }

        let nearest = 999;
        for (const spawn of spawns) {
          nearest = Math.min(nearest, horizontalDistance(candidate, spawn));
        }

        if (nearest > bestDistance) {
          bestDistance = nearest;
          bestCandidate = candidate;
        }
      }

      if (!bestCandidate) {
        for (let attempt = 0; attempt < 160; attempt += 1) {
          const candidate = randomPointInCircle(this.rng, MAP_RADIUS - 18);
          if (this.isSpawnPointClear(candidate, spawns, PLAYER_SPAWN_SEPARATION * 0.82)) {
            bestCandidate = candidate;
            break;
          }
        }
      }

      spawns.push(bestCandidate ?? new THREE.Vector3(Math.cos((i / count) * Math.PI * 2) * 88, 0, Math.sin((i / count) * Math.PI * 2) * 88));
    }

    return spawns;
  }

  private findTeammateSpawnPoint(anchor: THREE.Vector3, existingSpawns: THREE.Vector3[]): THREE.Vector3 {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const angle = this.rng.range(0, Math.PI * 2);
      const radius = this.rng.range(2.2, 5.2);
      const candidate = clampToCircle(
        anchor.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)),
        WORLD_CENTER,
        MAP_RADIUS - PLAYER_SPAWN_PADDING - 1
      );
      if (this.isSpawnPointClear(candidate, existingSpawns, 2.8)) {
        return candidate;
      }
    }

    return clampToCircle(
      anchor.clone().add(new THREE.Vector3(this.rng.range(-3.2, 3.2), 0, this.rng.range(-3.2, 3.2))),
      WORLD_CENTER,
      MAP_RADIUS - PLAYER_SPAWN_PADDING - 1
    );
  }

  private isSpawnPointClear(point: THREE.Vector3, existingSpawns: THREE.Vector3[], minDistance: number): boolean {
    if (horizontalDistance(WORLD_CENTER, point) > MAP_RADIUS - PLAYER_SPAWN_PADDING) {
      return false;
    }

    if (!this.isPointClear(point, PLAYER_SPAWN_PADDING)) {
      return false;
    }

    if (this.isBlockedAt(point, ACTOR_RADIUS + 1.2, PLAYER_EYE_HEIGHT + 0.5)) {
      return false;
    }

    for (const spawn of existingSpawns) {
      if (horizontalDistance(point, spawn) < minDistance) {
        return false;
      }
    }

    for (const node of this.resourceNodes) {
      if (horizontalDistance(point, node.position) < 4.2) {
        return false;
      }
    }

    return true;
  }

  private findFreePoint(maxRadius: number, padding: number): THREE.Vector3 {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const point = randomPointInCircle(this.rng, maxRadius);
      if (this.isPointClear(point, padding)) {
        return point;
      }
    }

    return new THREE.Vector3(this.rng.range(-maxRadius, maxRadius), 0, this.rng.range(-maxRadius, maxRadius));
  }

  private isPointClear(point: THREE.Vector3, padding: number): boolean {
    if (this.isPointInWater(point, padding * 0.4)) {
      return false;
    }

    for (const surface of this.walkableSurfaces) {
      if (
        point.x > surface.minX - padding &&
        point.x < surface.maxX + padding &&
        point.z > surface.minZ - padding &&
        point.z < surface.maxZ + padding
      ) {
        return false;
      }
    }

    for (const obstacle of this.staticObstacles) {
      if (
        point.x > obstacle.minX - padding &&
        point.x < obstacle.maxX + padding &&
        point.z > obstacle.minZ - padding &&
        point.z < obstacle.maxZ + padding
      ) {
        return false;
      }
    }

    for (const spawn of this.participantSpawns) {
      if (horizontalDistance(point, spawn) < padding + 1.5) {
        return false;
      }
    }

    return true;
  }

  private makeCirclePoints(radius: number, segments: number): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    }
    return points;
  }

  private tagTarget(object: THREE.Object3D, kind: string, ref: unknown): void {
    object.traverse((child) => {
      child.userData.kind = kind;
      child.userData.ref = ref;
    });
  }

  private removeRaycastTarget(target: THREE.Object3D): void {
    this.raycastTargets = this.raycastTargets.filter((entry) => entry !== target);
  }

  private removeCameraObstacle(target: THREE.Object3D): void {
    this.cameraObstacles = this.cameraObstacles.filter((entry) => entry !== target);
  }

  private isPointerLocked(): boolean {
    return document.pointerLockElement === this.renderer.domElement;
  }

  private readonly handleResize = (): void => {
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    this.camera.aspect = Math.max(1, width / Math.max(1, height));
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.getPixelRatioForQuality(this.graphicsQuality));
    this.renderer.setSize(width, height, false);
  };

  setGraphicsQuality(quality: GraphicsQuality): void {
    this.graphicsQuality = quality;
    this.applyGraphicsQuality(quality);
  }

  private applyGraphicsQuality(quality: GraphicsQuality): void {
    this.maxShotEffects = quality === 'low' ? 18 : quality === 'medium' ? 32 : 46;
    this.renderer.setPixelRatio(this.getPixelRatioForQuality(quality));
    this.renderer.setSize(this.root.clientWidth, this.root.clientHeight, false);
  }

  private getPixelRatioForQuality(quality: GraphicsQuality): number {
    const limit = quality === 'low' ? 0.8 : quality === 'medium' ? 0.98 : 1.16;
    return Math.min(window.devicePixelRatio || 1, limit);
  }
}
