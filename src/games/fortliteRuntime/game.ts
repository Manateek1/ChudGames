import * as THREE from 'three';
import {
  ACTOR_RADIUS,
  BOT_COUNT,
  BUILD_COST,
  BUILD_GRID_SIZE,
  FIXED_TIMESTEP,
  HELP_TEXT,
  MAP_RADIUS,
  MATERIAL_DISPLAY_NAMES,
  MATERIAL_PRIORITY,
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
import { FortliteHud } from './ui';

type MatchState = 'boot' | 'inProgress' | 'ended';
type StormMode = 'pause' | 'shrink' | 'done';

interface Actor {
  id: string;
  kind: ActorKind;
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  ringMesh: THREE.Mesh;
  position: THREE.Vector3;
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

interface ShotEffect {
  group: THREE.Group;
  lineMaterial: THREE.LineBasicMaterial;
  sparkMaterial: THREE.MeshStandardMaterial;
  timeRemaining: number;
  duration: number;
}

const GRAVITY = 22;
const PLAYER_MOVE_SPEED = 8;
const PLAYER_SPRINT_SPEED = 12;
const BOT_MOVE_SPEED = 5.8;
const BOT_SPRINT_SPEED = 7.1;
const JUMP_SPEED = 8;
const INTERACT_DISTANCE = 3;
const HARVEST_DISTANCE = 4.6;
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
const PLAYER_SPAWN_PADDING = 7;
const PLAYER_SPAWN_SEPARATION = 34;
const PLAYER_STARTER_LOOT_OFFSET = 4.2;
const WORLD_CENTER = new THREE.Vector3(0, 0, 0);

export interface FortliteMatchResult {
  won: boolean;
  placement: number;
  eliminations: number;
  survivalTime: number;
}

interface FortliteGameOptions {
  seedBase?: number;
  onPlacementChange?: (placement: number) => void;
  onMatchEnd?: (result: FortliteMatchResult) => void;
  showEndScreen?: boolean;
}

export class FortliteGame {
  private readonly root: HTMLDivElement;
  private readonly options: FortliteGameOptions;
  private readonly shell: HTMLDivElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly hud: FortliteHud;
  private readonly pathfinder = new GridPathfinder(64, BUILD_GRID_SIZE);
  private readonly raycaster = new THREE.Raycaster();
  private readonly tempVectorA = new THREE.Vector3();
  private readonly tempVectorB = new THREE.Vector3();
  private readonly tempVectorC = new THREE.Vector3();
  private readonly tempPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private animationFrame = 0;
  private lastFrameTime = 0;
  private accumulator = 0;
  private matchIndex = 0;
  private rng = new SeededRandom(1337);
  private state: MatchState = 'boot';
  private matchTime = 0;

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

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
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

  constructor(root: HTMLDivElement, options: FortliteGameOptions = {}) {
    this.root = root;
    this.options = options;
    this.root.innerHTML = '';

    this.shell = document.createElement('div');
    this.shell.className = 'fortlite-shell';
    this.root.append(this.shell);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.root.clientWidth, this.root.clientHeight);
    this.renderer.domElement.className = 'fortlite-canvas';
    this.shell.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xaed7ff);
    this.scene.fog = new THREE.Fog(0xaed7ff, 105, 220);

    this.camera = new THREE.PerspectiveCamera(76, Math.max(1, this.root.clientWidth / Math.max(1, this.root.clientHeight)), 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, 9, 12);
    this.scene.add(this.camera);
    this.raycaster.layers.enableAll();

    this.viewModelRoot.position.set(0.52, -0.52, -0.88);
    this.camera.add(this.viewModelRoot);

    this.hud = new FortliteHud(this.shell, HELP_TEXT);
    this.hud.setRestartHandler(() => this.resetMatch());

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
    const hemi = new THREE.HemisphereLight(0xf6f3df, 0x2f3a28, 1.35);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff0ce, 1.2);
    sun.position.set(-34, 44, 20);
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x8fd6ff, 0.32);
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
    this.participantSpawns = [];
    this.viewModelBobTime = 0;
    this.viewModelMoveBlend = 0;
    this.viewModelKick = 0;
    this.viewModelSway.set(0, 0);
    this.muzzleFlashTime = 0;
    this.currentViewModelKey = '';
    this.matchResultSent = false;

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
    this.lootSpawnPoints = [];
    this.actors = [];
    this.loot = [];
    this.resourceNodes = [];
    this.buildPieces = [];
    this.shotEffects = [];
    this.raycastTargets = [];
    this.cameraObstacles = [];

    this.buildWorld();
    this.spawnParticipants();
    this.spawnLoot();
    this.initializeStorm();
    this.ensurePreviewMesh();
    this.syncViewModel(true);
    this.hud.hideEndScreen();
    this.showMessage('First-person drop is live. Click into the arena, grab your loadout, and rotate with the mouse.', 3.5);
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
    const perimeterWallCount = 52;
    const randomObstacleCount = 42;

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(MAP_RADIUS, 96),
      new THREE.MeshStandardMaterial({ color: 0x456d3d, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.environmentGroup.add(ground);
    this.addGroundDisc(MAP_RADIUS * 0.88, 0x6d8c47, -0.015, 0.92);
    this.addGroundDisc(MAP_RADIUS * 0.58, 0x385f35, -0.01, 0.85);
    this.addTerrainPatch(new THREE.Vector3(-44, 0, -8), 30, 18, 0x8b6a45, 0.68, 0.32);
    this.addTerrainPatch(new THREE.Vector3(36, 0, -42), 22, 12, 0x806244, 0.7, -0.48);
    this.addTerrainPatch(new THREE.Vector3(46, 0, 34), 26, 15, 0x6f8a4f, 0.48, 0.22);
    this.addTerrainPatch(new THREE.Vector3(-34, 0, 44), 24, 13, 0x867350, 0.66, -0.2);
    this.addTerrainPatch(new THREE.Vector3(0, 0, 0), 18, 18, 0x7b5b3d, 0.55, 0);
    this.addTerrainPatch(new THREE.Vector3(-122, 0, -72), 44, 26, 0x8a6c4f, 0.54, 0.18);
    this.addTerrainPatch(new THREE.Vector3(132, 0, -112), 38, 22, 0x7d6d4e, 0.58, -0.34);
    this.addTerrainPatch(new THREE.Vector3(152, 0, 108), 42, 24, 0x6b8750, 0.52, 0.26);
    this.addTerrainPatch(new THREE.Vector3(-136, 0, 126), 40, 24, 0x8d7456, 0.56, -0.16);
    this.addTerrainPatch(new THREE.Vector3(0, 0, -154), 54, 20, 0x5f7c47, 0.42, 0.08);
    this.addTerrainPatch(new THREE.Vector3(0, 0, 164), 56, 24, 0x6e8a4b, 0.4, -0.12);

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

    this.addRoad(new THREE.Vector3(-6, 0, 0), new THREE.Vector3(-42, 0, -32), 7, 0x7b6549);
    this.addRoad(new THREE.Vector3(4, 0, -4), new THREE.Vector3(32, 0, -26), 6, 0x746149);
    this.addRoad(new THREE.Vector3(5, 0, 5), new THREE.Vector3(42, 0, 40), 7, 0x6e5d45);
    this.addRoad(new THREE.Vector3(-4, 0, 6), new THREE.Vector3(-28, 0, 38), 6.5, 0x7b684d);
    this.addRoad(new THREE.Vector3(-18, 0, -10), new THREE.Vector3(-126, 0, -92), 8, 0x735f46);
    this.addRoad(new THREE.Vector3(22, 0, -16), new THREE.Vector3(126, 0, -108), 7.5, 0x6d5b43);
    this.addRoad(new THREE.Vector3(26, 0, 20), new THREE.Vector3(142, 0, 114), 8, 0x685944);
    this.addRoad(new THREE.Vector3(-20, 0, 22), new THREE.Vector3(-132, 0, 128), 7.5, 0x74644c);
    this.createCentralArena();

    this.createCompound(new THREE.Vector3(-44, 0, -36), 0x9a8062, [
      { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(12, 10), height: 6 },
      { offset: new THREE.Vector3(14, 0, 6), size: new THREE.Vector2(7, 7), height: 4.5 },
      { offset: new THREE.Vector3(-15, 0, 10), size: new THREE.Vector2(8, 4), height: 3.5 }
    ]);
    this.createCompound(new THREE.Vector3(32, 0, -28), 0x8e7454, [
      { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(14, 9), height: 5.6 },
      { offset: new THREE.Vector3(-13, 0, -10), size: new THREE.Vector2(8, 8), height: 4.8 },
      { offset: new THREE.Vector3(16, 0, -8), size: new THREE.Vector2(6, 12), height: 5.2 }
    ]);
    this.createCompound(new THREE.Vector3(42, 0, 44), 0x7c6d61, [
      { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(10, 14), height: 5.6 },
      { offset: new THREE.Vector3(-12, 0, 10), size: new THREE.Vector2(9, 7), height: 4.4 },
      { offset: new THREE.Vector3(14, 0, -12), size: new THREE.Vector2(7, 7), height: 4.4 }
    ]);
    this.createCompound(new THREE.Vector3(-30, 0, 38), 0x8b8b79, [
      { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(13, 9), height: 5.2 },
      { offset: new THREE.Vector3(-15, 0, -8), size: new THREE.Vector2(7, 7), height: 4.2 },
      { offset: new THREE.Vector3(12, 0, 11), size: new THREE.Vector2(8, 6), height: 3.6 }
    ]);
    this.createCompound(new THREE.Vector3(-2, 0, 4), 0x9f917d, [
      { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(12, 12), height: 5.4 },
      { offset: new THREE.Vector3(14, 0, -10), size: new THREE.Vector2(6, 6), height: 4 },
      { offset: new THREE.Vector3(-16, 0, 8), size: new THREE.Vector2(6, 10), height: 4 }
    ]);
    this.createCompound(new THREE.Vector3(-122, 0, -96), 0x8f7c61, [
      { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(16, 10), height: 5.8 },
      { offset: new THREE.Vector3(18, 0, 12), size: new THREE.Vector2(8, 8), height: 4.6 },
      { offset: new THREE.Vector3(-18, 0, -10), size: new THREE.Vector2(9, 7), height: 4.2 }
    ]);
    this.createCompound(new THREE.Vector3(126, 0, -112), 0x7c7467, [
      { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(15, 11), height: 5.8 },
      { offset: new THREE.Vector3(-16, 0, 10), size: new THREE.Vector2(8, 7), height: 4.4 },
      { offset: new THREE.Vector3(18, 0, -8), size: new THREE.Vector2(7, 12), height: 5 }
    ]);
    this.createCompound(new THREE.Vector3(146, 0, 116), 0x8a7b66, [
      { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(14, 12), height: 5.6 },
      { offset: new THREE.Vector3(-18, 0, -10), size: new THREE.Vector2(8, 6), height: 4.4 },
      { offset: new THREE.Vector3(16, 0, 12), size: new THREE.Vector2(8, 8), height: 4.6 }
    ]);
    this.createCompound(new THREE.Vector3(-136, 0, 128), 0x7f8171, [
      { offset: new THREE.Vector3(0, 0, 0), size: new THREE.Vector2(16, 10), height: 5.4 },
      { offset: new THREE.Vector3(16, 0, -12), size: new THREE.Vector2(7, 7), height: 4.2 },
      { offset: new THREE.Vector3(-18, 0, 10), size: new THREE.Vector2(9, 8), height: 4.4 }
    ]);

    for (let i = 0; i < randomObstacleCount; i += 1) {
      const point = this.findFreePoint(MAP_RADIUS - 14, 5);
      const size = new THREE.Vector2(this.rng.range(2.4, 5.4), this.rng.range(2.4, 5.4));
      const height = this.rng.range(1.6, 3.4);
      this.addStaticObstacle(point, size, height, this.rng.pick([0x73837f, 0x7d7869, 0x587169]), false);
      this.lootSpawnPoints.push(point.clone().add(new THREE.Vector3(0, 0, this.rng.range(2, 4))));
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
      this.addStaticObstacle(position, box.size, box.height, color, true);
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

  private addStaticObstacle(position: THREE.Vector3, size: THREE.Vector2, height: number, color: number, addLootSpots: boolean): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, height, size.y),
      new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.05 })
    );
    mesh.position.set(position.x, height * 0.5, position.z);
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
    const roofColor = new THREE.Color(color).offsetHSL(0, 0.04, 0.08);
    const trimColor = new THREE.Color(color).offsetHSL(0.02, 0.08, 0.16);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(size.x * 1.08, 0.28, size.y * 1.08),
      new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.8 })
    );
    roof.position.set(position.x, height + 0.2, position.z);
    this.environmentGroup.add(roof);

    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(size.x * 0.28, 0.22, size.y * 0.18),
      new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.55, metalness: 0.12 })
    );
    trim.position.set(position.x, height * 0.6, position.z + size.y * 0.52);
    this.environmentGroup.add(trim);
  }

  private spawnResourceNodes(): void {
    const materialTypes: MaterialType[] = ['wood', 'wood', 'wood', 'stone', 'stone', 'metal'];

    for (let i = 0; i < RESOURCE_RESPAWN_COUNT; i += 1) {
      const materialType = this.rng.pick(materialTypes);
      const position = this.findFreePoint(MAP_RADIUS - 10, 4.5);
      const node = this.createResourceNode(position, materialType, i);
      this.resourceNodes.push(node);
      this.environmentGroup.add(node.mesh);
      this.raycastTargets.push(node.mesh);
      this.cameraObstacles.push(node.mesh);
    }
  }

  private createResourceNode(position: THREE.Vector3, materialType: MaterialType, index: number): ResourceNode {
    const mesh = new THREE.Group();
    const color = RESOURCE_COLORS[materialType];

    if (materialType === 'wood') {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.6, 3.1, 8),
        new THREE.MeshStandardMaterial({ color: 0x6d4c2e, roughness: 1 })
      );
      trunk.position.y = 1.55;

      const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(1.9, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0x5f8f43, roughness: 1 })
      );
      canopy.position.y = 3.7;
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

  private spawnParticipants(): void {
    this.participantSpawns = this.generateParticipantSpawns(BOT_COUNT + 1);
    this.player = this.createActor('player', this.participantSpawns[0], 0x2dd4bf, 0x4fd1ff);
    this.player.yaw = Math.atan2(-this.player.position.x, -this.player.position.z);
    this.actors.push(this.player);

    for (let i = 0; i < BOT_COUNT; i += 1) {
      const spawn = this.participantSpawns[i + 1];
      const bot = this.createActor(
        'bot',
        spawn,
        new THREE.Color().setHSL(this.rng.next(), 0.45, 0.55).getHex(),
        0xffffff
      );
      bot.yaw = Math.atan2(-spawn.x, -spawn.z);
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

    this.cameraYaw = this.player.yaw;
    this.cameraPitch = 0.05;
  }

  private createActor(kind: ActorKind, spawnPosition: THREE.Vector3, color: number, accent: number): Actor {
    const group = new THREE.Group();

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.62, 1.45, 12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.65 })
    );
    body.position.y = 1.02;

    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.78, 0.6),
      new THREE.MeshStandardMaterial({ color: accent, roughness: 0.45 })
    );
    chest.position.y = 1.34;
    chest.position.z = 0.28;

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffe0bd, roughness: 0.9 })
    );
    head.position.y = 2.0;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.24, 20),
      new THREE.MeshBasicMaterial({ color: kind === 'player' ? 0x3bdad6 : 0xff7c70, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;

    group.add(body, chest, head, ring);
    group.position.copy(spawnPosition);

    if (kind === 'player') {
      group.traverse((child) => {
        child.layers.set(1);
      });
    }

    this.actorGroup.add(group);
    this.raycastTargets.push(body, chest, head);

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
      group,
      bodyMesh: body,
      ringMesh: ring,
      position: spawnPosition.clone(),
      verticalVelocity: 0,
      yaw: Math.PI,
      radius: ACTOR_RADIUS,
      health: 100,
      maxHealth: 100,
      alive: true,
      grounded: true,
      inventory,
      fireCooldown: 0,
      reloadTimer: 0,
      harvestCooldown: 0,
      eliminationCount: 0
    };

    for (const child of [body, chest, head]) {
      child.userData.kind = 'actor';
      child.userData.ref = actor;
    }

    return actor;
  }

  private spawnLoot(): void {
    const priorityWeapons = [WEAPON_DEFINITIONS[0], WEAPON_DEFINITIONS[2], WEAPON_DEFINITIONS[1]];

    for (let i = 0; i < this.lootSpawnPoints.length; i += 1) {
      const point = this.lootSpawnPoints[i];
      const roll = this.rng.next();
      if (roll < 0.18) {
        continue;
      }

      if (i < 18) {
        const weapon = priorityWeapons[i % priorityWeapons.length];
        this.createWeaponPickup(point, weapon, true);
        continue;
      }

      if (roll < 0.54) {
        this.createWeaponPickup(point, this.rng.pick(WEAPON_DEFINITIONS), false);
      } else if (roll < 0.82) {
        const ammoType = this.rng.next() < 0.72 ? 'light' : 'shells';
        const amount = ammoType === 'light' ? this.rng.int(16, 32) : this.rng.int(6, 14);
        this.createAmmoPickup(point, ammoType, amount);
      } else {
        const materialType = this.rng.pick(['wood', 'wood', 'stone', 'metal'] as MaterialType[]);
        const amount = materialType === 'wood' ? this.rng.int(20, 40) : this.rng.int(14, 28);
        this.createMaterialPickup(point, materialType, amount);
      }
    }

    for (let i = 0; i < this.participantSpawns.length; i += 1) {
      this.spawnStarterLoadout(this.participantSpawns[i], i);
    }
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
      amount,
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
      color: 0x32b4ff,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide
    });

    this.stormWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 18, 64, 1, true), stormMaterial);
    this.stormWall.position.y = 9;
    this.stormGroup.add(this.stormWall);

    this.safeZoneDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshBasicMaterial({ color: 0x9be15d, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
    );
    this.safeZoneDisc.rotation.x = -Math.PI / 2;
    this.safeZoneDisc.position.y = 0.03;
    this.stormGroup.add(this.safeZoneDisc);

    this.safeZoneRing = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(this.makeCirclePoints(1, 64)),
      new THREE.LineBasicMaterial({ color: 0xb8ff74, transparent: true, opacity: 0.8 })
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

    if (this.justPressedMouseButtons.has(2) && this.isBuildMode()) {
      this.buildMode = false;
    }
  }

  private handlePlayerLoadoutInput(): void {
    const actor = this.player;

    if (this.justPressedKeys.has('KeyQ')) {
      this.buildMode = !this.buildMode;
    }

    if (this.justPressedKeys.has('Digit1')) {
      if (this.isBuildMode()) {
        this.setBuildPieceType('wall');
      } else {
        actor.inventory.mode = 'harvest';
      }
    }

    if (this.justPressedKeys.has('Digit2')) {
      if (this.isBuildMode()) {
        this.setBuildPieceType('floor');
      } else if (actor.inventory.weapons.length > 0) {
        actor.inventory.mode = 'weapon';
        actor.inventory.weaponIndex = 0;
      }
    }

    if (this.justPressedKeys.has('Digit3')) {
      if (this.isBuildMode()) {
        this.setBuildPieceType('ramp');
      } else if (actor.inventory.weapons.length > 1) {
        actor.inventory.mode = 'weapon';
        actor.inventory.weaponIndex = 1;
      }
    }

    if (this.wheelDirection !== 0 && !this.isBuildMode()) {
      const selections = actor.inventory.weapons.length;
      if (selections === 0) {
        actor.inventory.mode = 'harvest';
      } else if (actor.inventory.mode === 'harvest') {
        actor.inventory.mode = 'weapon';
        actor.inventory.weaponIndex = this.wheelDirection > 0 ? selections - 1 : 0;
      } else {
        const next = actor.inventory.weaponIndex + (this.wheelDirection > 0 ? 1 : -1);
        if (next < 0) {
          actor.inventory.mode = 'harvest';
        } else {
          actor.inventory.weaponIndex = next % selections;
        }
      }
    }
  }

  private processBot(actor: Actor, dt: number): void {
    const brain = actor.ai;
    if (!brain) {
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
    } else if (brain.targetActorId && !this.findActorById(brain.targetActorId)?.alive) {
      brain.targetActorId = undefined;
    }

    if (brain.decisionTimer <= 0) {
      brain.decisionTimer = this.rng.range(0.45, 0.95);
      this.rethinkBotState(actor, visibleEnemy);
    }

    if (brain.state === 'engage' && brain.targetActorId) {
      const target = this.findActorById(brain.targetActorId);
      if (!target || !target.alive) {
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
    const outsideStorm = this.isOutsideStorm(actor.position);
    const armed = this.hasUsableWeapon(actor);
    const lowMaterials = this.totalMaterials(actor.inventory.materials) < 28;
    const node = lowMaterials ? this.findNearestResource(actor.position, 28) : null;
    const desiredLoot = this.findBestLootForActor(actor, 42);

    if (outsideStorm) {
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

    if (distance > optimalDistance + 6) {
      move.add(desiredDirection);
    } else if (distance < optimalDistance - 4) {
      move.addScaledVector(desiredDirection, -0.9);
    }
    move.addScaledVector(strafe, 0.32);

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
      actor.inventory.weaponIndex = actor.inventory.weapons.indexOf(weapon);
      if (distance <= weapon.definition.range * 0.82 && this.hasLineOfSight(actor, target) && this.rng.next() > 0.28) {
        const aimTarget = target.position.clone().add(new THREE.Vector3(
          this.rng.range(-0.65, 0.65),
          this.rng.range(0.95, 1.65),
          this.rng.range(-0.65, 0.65)
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
    if (!this.isOutsideStorm(actor.position)) {
      return;
    }

    this.applyDamage(actor, this.storm.currentDamagePerSecond * dt, null, 'storm');
  }

  private updateLootVisuals(time: number): void {
    for (const pickup of this.loot) {
      pickup.mesh.position.set(
        pickup.position.x,
        0.35 + Math.sin(time * 1.8 + pickup.bobOffset) * 0.22,
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
          if (!target.alive || target.id === actor.id) {
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
      mesh.rotation.x = -RAMP_ANGLE;
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
    this.previewMesh.rotation.set(this.selectedBuildPiece === 'ramp' ? -RAMP_ANGLE : 0, placement.yaw, 0);
  }

  private computeBuildPlacement(actor: Actor, pieceType: BuildPieceType, forcedWorldPosition?: THREE.Vector3, forcedYaw?: number): { position: THREE.Vector3; yaw: number; valid: boolean } {
    const forward = yawToDirection(this.cameraYaw);
    const placeTarget = forcedWorldPosition
      ? forcedWorldPosition.clone()
      : this.getBuildAimPoint(actor, forward);

    const snappedX = snap(placeTarget.x, BUILD_GRID_SIZE);
    const snappedZ = snap(placeTarget.z, BUILD_GRID_SIZE);
    const supportY = this.sampleGroundHeight(snappedX, snappedZ, actor.position.y + 6);
    const yaw = forcedYaw ?? Math.round((this.cameraYaw + this.buildRotation) / (Math.PI * 0.5)) * (Math.PI * 0.5);

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
    const moveX = velocity.x * dt;
    const moveZ = velocity.z * dt;

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
          const t = clamp((localZ + RAMP_LENGTH * 0.5) / RAMP_LENGTH, 0, 1);
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
    material.opacity = actor.kind === 'player' ? 0 : 0.35 + (1 - actor.health / actor.maxHealth) * 0.25;
  }

  private tryAutoPickup(actor: Actor): void {
    if (!actor.alive) {
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

        if (actor.inventory.weapons.length < 2) {
          actor.inventory.weapons.push(instance);
          actor.inventory.weaponIndex = actor.inventory.weapons.length - 1;
        } else {
          const replaceIndex = actor.kind === 'player'
            ? clamp(actor.inventory.weaponIndex, 0, actor.inventory.weapons.length - 1)
            : this.findWeakestWeaponIndex(actor.inventory.weapons);
          actor.inventory.weapons[replaceIndex] = instance;
          actor.inventory.weaponIndex = replaceIndex;
        }

        actor.inventory.mode = 'weapon';
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
    if (!target.alive) {
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

    const alive = this.actors.filter((actor) => actor.alive);
    if (alive.length > 1) {
      return;
    }

    if (this.player.alive) {
      this.endMatch('Victory Royale', 'You outlasted every bot and survived the storm. Press Enter or use the button to queue another offline match.', true);
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
      eliminations: this.player.eliminationCount,
      survivalTime: Math.round(this.matchTime),
    });
  }

  private calculatePlacement(): number {
    if (!this.player) {
      return 0;
    }

    const aliveCount = this.actors.filter((actor) => actor.alive).length;
    return this.player.alive ? aliveCount : aliveCount + 1;
  }

  private updateHud(): void {
    const weapon = this.getEquippedWeapon(this.player);
    const aliveCount = this.actors.filter((actor) => actor.alive).length;
    const pickupPrompt = this.findNearestLoot(this.player.position, INTERACT_DISTANCE);

    const stormPhase = STORM_PHASES[Math.min(this.storm.phaseIndex, STORM_PHASES.length - 1)];
    let stormText = this.storm.mode === 'done'
      ? `Final storm ${this.storm.currentRadius.toFixed(0)}m | ${stormPhase.damagePerSecond}/s`
      : this.storm.mode === 'pause'
        ? `Storm closes in ${(stormPhase.pauseDuration - this.storm.timer).toFixed(0)}s | ${stormPhase.damagePerSecond}/s outside`
        : `Storm shrinking ${(stormPhase.shrinkDuration - this.storm.timer).toFixed(0)}s | ${stormPhase.damagePerSecond}/s outside`;

    if (this.isOutsideStorm(this.player.position)) {
      stormText = `Outside storm | ${stormPhase.damagePerSecond}/s`;
    }

    const statusText = this.player.reloadTimer > 0 && weapon
      ? `Reloading ${weapon.definition.name}`
      : this.isBuildMode()
        ? `Ready to place ${this.selectedBuildPiece}`
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
      eliminationCount: this.player.eliminationCount,
      materials: this.player.inventory.materials,
      stormText,
      bannerText: this.getBannerText(pickupPrompt),
      buildMode: this.isBuildMode(),
      buildPieceType: this.selectedBuildPiece,
      pointerLocked: this.isPointerLocked(),
      compassText: this.getCompassText(),
      statusText,
      hotbarItems: this.getHotbarItems()
    });
    this.options.onPlacementChange?.(this.calculatePlacement());
  }

  private render(): void {
    this.updateCamera();
    this.syncViewModel(false);
    this.updateHud();
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(): void {
    if (!this.player) {
      return;
    }

    const pivot = this.player.position.clone().add(new THREE.Vector3(0, PLAYER_EYE_HEIGHT, 0));
    this.camera.position.copy(pivot);
    this.camera.rotation.y = this.cameraYaw + Math.PI;
    this.camera.rotation.x = this.cameraPitch;
    this.camera.rotation.z = 0;
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
        { key: '1', label: 'Wall', detail: '20 mats', active: this.selectedBuildPiece === 'wall' },
        { key: '2', label: 'Floor', detail: '20 mats', active: this.selectedBuildPiece === 'floor' },
        { key: '3', label: 'Ramp', detail: '20 mats', active: this.selectedBuildPiece === 'ramp' }
      ];
    }

    const firstWeapon = this.player.inventory.weapons[0];
    const secondWeapon = this.player.inventory.weapons[1];

    return [
      {
        key: '1',
        label: 'Harvest',
        detail: 'Gather mats',
        active: this.player.inventory.mode === 'harvest'
      },
      {
        key: '2',
        label: firstWeapon?.definition.name ?? 'Empty',
        detail: firstWeapon ? `${firstWeapon.magAmmo}/${this.player.inventory.ammo[firstWeapon.definition.ammoType]}` : 'Pick up a gun',
        active: this.player.inventory.mode === 'weapon' && this.player.inventory.weaponIndex === 0
      },
      {
        key: '3',
        label: secondWeapon?.definition.name ?? 'Empty',
        detail: secondWeapon ? `${secondWeapon.magAmmo}/${this.player.inventory.ammo[secondWeapon.definition.ammoType]}` : 'Pick up a gun',
        active: this.player.inventory.mode === 'weapon' && this.player.inventory.weaponIndex === 1
      }
    ];
  }

  private getBannerText(nearbyPickup: LootPickup | null): string {
    if (this.state === 'ended') {
      return this.player.alive ? 'Victory. Press Enter or use the button to start another match.' : 'Defeat. Press Enter or use the button to restart.';
    }

    if (this.timedMessage) {
      return this.timedMessage.text;
    }

    if (!this.isPointerLocked()) {
      return 'Click once to capture the mouse for unlimited 360 look.';
    }

    if (nearbyPickup) {
      return this.shouldAutoPickupForPlayer(this.player, nearbyPickup)
        ? `Walk over ${this.describePickup(nearbyPickup)} to pick it up automatically.`
        : `Press E to pick up ${this.describePickup(nearbyPickup)}.`;
    }

    if (this.isBuildMode()) {
      const material = this.getAvailableBuildMaterial(this.player);
      return material
        ? `Build mode: ${this.selectedBuildPiece}. Left click to place, R to rotate, right click or Q to exit.`
        : 'Build mode active, but you need at least 20 materials to place a piece.';
    }

    if (this.isOutsideStorm(this.player.position)) {
      return 'You are outside the storm. Sprint back into the safe zone.';
    }

    if (this.player.inventory.mode === 'harvest') {
      return 'Harvest trees, rocks, and metal nodes or switch to a weapon with 2 or 3.';
    }

    return 'Stay armed, keep moving, and be the last survivor standing.';
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
    if (pickup.kind === 'ammo') {
      return true;
    }

    if (pickup.kind !== 'weapon' || !pickup.weapon) {
      return false;
    }

    return actor.inventory.weapons.length < 2 || actor.inventory.weapons.some((weapon) => weapon.definition.id === pickup.weapon!.id);
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

  private findVisibleEnemy(actor: Actor, range: number): Actor | null {
    let closest: Actor | null = null;
    let bestDistance = range;

    for (const other of this.actors) {
      if (!other.alive || other.id === actor.id) {
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
    const index = clamp(actor.inventory.weaponIndex, 0, actor.inventory.weapons.length - 1);
    actor.inventory.weaponIndex = index;
    return actor.inventory.weapons[index] ?? null;
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

  private getSafeZoneDestination(position: THREE.Vector3): THREE.Vector3 {
    const desired = clampToCircle(position, this.storm.currentCenter, Math.max(4, this.storm.currentRadius - 10));
    if (horizontalDistance(position, desired) < 2) {
      return this.storm.currentCenter.clone();
    }
    return desired;
  }

  private isOutsideStorm(position: THREE.Vector3): boolean {
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

    this.viewModelRoot.visible = this.player.alive;
    if (!this.player.alive) {
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
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 1.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x7d5632, roughness: 0.88 })
    );
    shaft.rotation.z = 0.68;
    shaft.position.set(0.18, -0.16, -0.34);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.12, 0.16),
      new THREE.MeshStandardMaterial({ color: 0xced9e3, roughness: 0.3, metalness: 0.78 })
    );
    head.position.set(0.42, 0.18, -0.52);
    head.rotation.z = -0.22;

    const spike = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.32, 8),
      new THREE.MeshStandardMaterial({ color: 0xa0b1c2, roughness: 0.28, metalness: 0.8 })
    );
    spike.position.set(0.12, 0.12, -0.5);
    spike.rotation.z = Math.PI * 0.5;

    tool.add(shaft, head, spike);
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

    this.camera.updateMatrixWorld(true);
    this.viewModelRoot.updateMatrixWorld(true);
    const muzzle = this.viewModelItem.getObjectByName('muzzleFlash');
    if (muzzle) {
      return muzzle.getWorldPosition(new THREE.Vector3());
    }

    return this.camera.position.clone();
  }

  private createShotEffect(origin: THREE.Vector3, impactPoint: THREE.Vector3, color: number): void {
    if (this.shotEffects.length >= 120) {
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
    const spreadMultiplier = playerOwned ? 0.85 : 1.85;
    const angleX = this.rng.range(-1, 1) * spread * spreadMultiplier;
    const angleY = this.rng.range(-1, 1) * spread * spreadMultiplier;
    result.x += angleX;
    result.y += angleY;
    result.z += this.rng.range(-1, 1) * spread * (playerOwned ? 0.25 : 0.45);
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

  private generateParticipantSpawns(count: number): THREE.Vector3[] {
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
    this.renderer.setSize(width, height);
  };
}
