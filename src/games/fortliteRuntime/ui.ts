import type { BuildPieceType, MaterialType } from './types';
import {
  createHitVignetteElement,
  flashHitVignette,
  createStormVignetteElement,
  updateStormVignette,
  createPickupIndicator,
} from './effects';

export interface HudHotbarItem {
  key: string;
  label: string;
  detail: string;
  active: boolean;
}

export interface HudMinimapSnapshot {
  mapRadius: number;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  teammateX: number | null;
  teammateZ: number | null;
  stormCenterX: number;
  stormCenterZ: number;
  stormRadius: number;
  safeZoneCenterX: number;
  safeZoneCenterZ: number;
  safeZoneRadius: number;
}

export interface HudSnapshot {
  health: number;
  maxHealth: number;
  weaponName: string;
  ammoInMag: number;
  ammoReserve: number;
  aliveCount: number;
  eliminationCount: number;
  materials: Record<MaterialType, number>;
  stormText: string;
  bannerText: string;
  buildMode: boolean;
  buildPieceType: BuildPieceType;
  pointerLocked: boolean;
  compassText: string;
  statusText: string;
  showHelp: boolean;
  hotbarItems: HudHotbarItem[];
  minimap: HudMinimapSnapshot;
}

const ANCHOR_LOCATIONS = [
  { name: 'Settlement', xRatio: 0, zRatio: -0.5, color: '#ffd280' },
  { name: 'Lighthouse', xRatio: -0.6, zRatio: 0, color: '#ff8080' },
  { name: 'Harbor', xRatio: 0.5, zRatio: 0.5, color: '#80d4ff' },
];

export class FortLiteHud {
  private readonly root: HTMLDivElement;
  private readonly topLeft: HTMLDivElement;
  private readonly topLeftHealth: HTMLDivElement;
  private readonly topLeftWeapon: HTMLDivElement;
  private readonly topLeftAmmo: HTMLDivElement;
  private readonly topLeftStatus: HTMLDivElement;
  private readonly topLeftMaterials: HTMLDivElement;
  private readonly minimapCard: HTMLDivElement;
  private readonly minimapCanvas: HTMLCanvasElement;
  private readonly minimapContext: CanvasRenderingContext2D | null;
  private readonly topRight: HTMLDivElement;
  private readonly topRightPlayers: HTMLDivElement;
  private readonly topRightElims: HTMLDivElement;
  private readonly topRightStorm: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly hotbar: HTMLDivElement;
  private readonly endScreen: HTMLDivElement;
  private readonly endTitle: HTMLHeadingElement;
  private readonly endBody: HTMLParagraphElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly crosshair: HTMLDivElement;
  private readonly hitMarker: HTMLDivElement;
  private readonly help: HTMLDivElement;
  private readonly controlsToggleBtn: HTMLButtonElement;
  private readonly hitVignette: HTMLDivElement;
  private readonly stormVignette: HTMLDivElement;
  private readonly pingBadge: HTMLDivElement;

  // Pause overlay
  private readonly pauseOverlay: HTMLDivElement;
  private readonly pauseResumeBtn: HTMLButtonElement;
  private readonly pauseRestartBtn: HTMLButtonElement;
  private readonly pauseSoundBtn: HTMLButtonElement;
  private readonly pauseQualityBtn: HTMLButtonElement;
  private readonly pauseLeaveBtn: HTMLButtonElement;

  // End screen extra controls
  private readonly endStats: HTMLDivElement;
  private readonly spectateButton: HTMLButtonElement;

  private onHelpToggleCallback?: (visible: boolean) => void;
  private isHelpCardVisible = false;

  private lastTopLeftKey = '';
  private lastTopRightKey = '';
  private lastBannerText = '';
  private lastHotbarKey = '';
  private lastCrosshairVisible: boolean | null = null;
  private lastHelpVisible: boolean | null = null;

  constructor(parent: HTMLElement, _helpText?: string) {
    void _helpText;
    this.root = document.createElement('div');
    this.root.className = 'hud-root';

    // Effects overlays
    this.hitVignette = createHitVignetteElement();
    this.stormVignette = createStormVignetteElement();
    this.root.append(this.hitVignette, this.stormVignette);

    // Concept layout: Top-Left = Operator / Health Card
    this.topLeft = document.createElement('div');
    this.topLeft.className = 'hud-card hud-top-left';

    const topLeftTitle = document.createElement('div');
    topLeftTitle.className = 'hud-title';
    topLeftTitle.textContent = 'Operator';

    this.topLeftHealth = document.createElement('div');
    this.topLeftHealth.className = 'hud-value';

    this.topLeftWeapon = document.createElement('div');
    this.topLeftWeapon.className = 'hud-line hud-accent';

    this.topLeftAmmo = document.createElement('div');
    this.topLeftAmmo.className = 'hud-line';

    this.topLeftStatus = document.createElement('div');
    this.topLeftStatus.className = 'hud-line';
    this.topLeftStatus.setAttribute('aria-live', 'polite');

    this.topLeftMaterials = document.createElement('div');
    this.topLeftMaterials.className = 'hud-line';

    this.topLeft.append(
      topLeftTitle,
      this.topLeftHealth,
      this.topLeftWeapon,
      this.topLeftAmmo,
      this.topLeftStatus,
      this.topLeftMaterials
    );

    // Concept layout: Bottom-Left = Minimap
    this.minimapCard = document.createElement('div');
    this.minimapCard.className = 'hud-card hud-minimap-card hud-bottom-left';

    const minimapTitle = document.createElement('div');
    minimapTitle.className = 'hud-title';
    minimapTitle.textContent = 'Island Map';

    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.className = 'hud-minimap';
    this.minimapCanvas.width = 200;
    this.minimapCanvas.height = 200;
    this.minimapContext = this.minimapCanvas.getContext('2d');
    this.minimapCard.append(minimapTitle, this.minimapCanvas);

    // Concept layout: Top-Right = Status (Players Left, Elims, Storm)
    this.topRight = document.createElement('div');
    this.topRight.className = 'hud-card hud-top-right';

    this.topRightPlayers = document.createElement('div');
    this.topRightPlayers.className = 'hud-value';

    this.topRightElims = document.createElement('div');
    this.topRightElims.className = 'hud-line hud-strong';

    this.topRightStorm = document.createElement('div');
    this.topRightStorm.className = 'hud-line hud-accent';

    this.pingBadge = document.createElement('div');
    this.pingBadge.className = 'hud-ping';
    this.pingBadge.style.display = 'none';

    this.topRight.append(this.topRightPlayers, this.topRightElims, this.topRightStorm, this.pingBadge);

    // Concept layout: Top-Center = Compass / Status Banner
    this.banner = document.createElement('div');
    this.banner.className = 'hud-banner hud-top-center';
    this.banner.setAttribute('role', 'status');
    this.banner.setAttribute('aria-live', 'polite');

    // Concept layout: Bottom-Right = Weapon and Equipment Slots
    this.hotbar = document.createElement('div');
    this.hotbar.className = 'hud-hotbar hud-bottom-right';
    this.hotbar.setAttribute('aria-label', 'Equipment slots');

    this.crosshair = document.createElement('div');
    this.crosshair.className = 'hud-crosshair';
    this.crosshair.setAttribute('aria-hidden', 'true');

    this.hitMarker = document.createElement('div');
    this.hitMarker.className = 'hud-hitmarker';
    this.hitMarker.setAttribute('aria-hidden', 'true');
    this.crosshair.append(this.hitMarker);

    // Floating Controls toggle button
    this.controlsToggleBtn = document.createElement('button');
    this.controlsToggleBtn.type = 'button';
    this.controlsToggleBtn.className = 'hud-controls-btn';
    this.controlsToggleBtn.textContent = 'Controls [H]';
    this.controlsToggleBtn.onclick = () => this.toggleHelp();

    // Structured Controls Guide Card
    this.help = document.createElement('div');
    this.help.className = 'hud-help hud-help-card';

    const helpHeader = document.createElement('div');
    helpHeader.className = 'hud-help-header';

    const helpTitle = document.createElement('div');
    helpTitle.className = 'hud-help-title';
    helpTitle.textContent = 'FORTLITE COMBAT CONTROLS';

    const helpCloseBtn = document.createElement('button');
    helpCloseBtn.type = 'button';
    helpCloseBtn.className = 'hud-help-close-btn';
    helpCloseBtn.textContent = '✕';
    helpCloseBtn.setAttribute('aria-label', 'Close controls guide');
    helpCloseBtn.onclick = () => this.toggleHelp(false);

    helpHeader.append(helpTitle, helpCloseBtn);

    const helpGrid = document.createElement('div');
    helpGrid.className = 'hud-help-grid';

    const createHelpSection = (title: string, items: { keys: string[]; desc: string }[]): HTMLDivElement => {
      const sec = document.createElement('div');
      sec.className = 'hud-help-section';
      const secTitle = document.createElement('div');
      secTitle.className = 'hud-help-section-title';
      secTitle.textContent = title;
      sec.append(secTitle);

      for (const item of items) {
        const row = document.createElement('div');
        row.className = 'hud-help-row';
        const keysBox = document.createElement('div');
        keysBox.className = 'hud-help-keys';
        for (const k of item.keys) {
          const kbd = document.createElement('kbd');
          kbd.className = 'hud-key';
          kbd.textContent = k;
          keysBox.append(kbd);
        }
        const desc = document.createElement('span');
        desc.className = 'hud-help-desc';
        desc.textContent = item.desc;
        row.append(keysBox, desc);
        sec.append(row);
      }
      return sec;
    };

    const moveSec = createHelpSection('MOVEMENT', [
      { keys: ['W', 'A', 'S', 'D'], desc: 'Move / Steer Drop' },
      { keys: ['Shift'], desc: 'Sprint' },
      { keys: ['Space'], desc: 'Jump / Parachute' }
    ]);

    const combatSec = createHelpSection('COMBAT', [
      { keys: ['L-Click'], desc: 'Fire Weapon / Mine' },
      { keys: ['R-Click', 'E'], desc: 'Aim Down Sights' },
      { keys: ['1', '2', '3'], desc: 'Rifle / Shotgun / SMG' },
      { keys: ['R'], desc: 'Reload' }
    ]);

    const buildSec = createHelpSection('BUILDING', [
      { keys: ['Q'], desc: 'Toggle Build Mode' },
      { keys: ['Z', 'X', 'C'], desc: 'Wall / Floor / Ramp' },
      { keys: ['G'], desc: 'Harvest Pickaxe' },
      { keys: ['R'], desc: 'Rotate Placement' }
    ]);

    const sysSec = createHelpSection('SYSTEM', [
      { keys: ['H', 'Tab'], desc: 'Toggle Controls' },
      { keys: ['F'], desc: 'Fullscreen' },
      { keys: ['Esc'], desc: 'Pause / Release Mouse' }
    ]);

    helpGrid.append(moveSec, combatSec, buildSec, sysSec);

    const helpFooter = document.createElement('div');
    helpFooter.className = 'hud-help-footer';
    helpFooter.textContent = 'Walk over loot to auto-collect. Nearby danger footsteps are audible.';

    this.help.append(helpHeader, helpGrid, helpFooter);

    // End Screen
    this.endScreen = document.createElement('div');
    this.endScreen.className = 'hud-end';

    const endCard = document.createElement('div');
    endCard.className = 'hud-end-card';

    this.endTitle = document.createElement('h1');
    this.endBody = document.createElement('p');

    this.endStats = document.createElement('div');
    this.endStats.className = 'hud-end-stats';

    this.restartButton = document.createElement('button');
    this.restartButton.type = 'button';
    this.restartButton.className = 'hud-end-restart-btn';
    this.restartButton.textContent = 'Start Another Match';

    this.spectateButton = document.createElement('button');
    this.spectateButton.type = 'button';
    this.spectateButton.className = 'hud-end-spectate-btn';
    this.spectateButton.textContent = 'Spectate Match';
    this.spectateButton.style.display = 'none';

    endCard.append(this.endTitle, this.endBody, this.endStats, this.restartButton, this.spectateButton);
    this.endScreen.append(endCard);

    // Pause Overlay
    this.pauseOverlay = document.createElement('div');
    this.pauseOverlay.className = 'hud-pause-overlay';

    const pauseCard = document.createElement('div');
    pauseCard.className = 'hud-pause-card';

    const pauseTitle = document.createElement('h2');
    pauseTitle.className = 'hud-pause-title';
    pauseTitle.textContent = 'MATCH PAUSED';

    this.pauseResumeBtn = document.createElement('button');
    this.pauseResumeBtn.type = 'button';
    this.pauseResumeBtn.className = 'hud-pause-btn primary';
    this.pauseResumeBtn.dataset.pauseAction = 'resume';
    this.pauseResumeBtn.textContent = 'Resume Match';

    this.pauseRestartBtn = document.createElement('button');
    this.pauseRestartBtn.type = 'button';
    this.pauseRestartBtn.className = 'hud-pause-btn';
    this.pauseRestartBtn.dataset.pauseAction = 'restart';
    this.pauseRestartBtn.textContent = 'Restart Match';

    this.pauseSoundBtn = document.createElement('button');
    this.pauseSoundBtn.type = 'button';
    this.pauseSoundBtn.className = 'hud-pause-btn';
    this.pauseSoundBtn.dataset.pauseAction = 'sound';
    this.pauseSoundBtn.textContent = 'Sound: ON';

    this.pauseQualityBtn = document.createElement('button');
    this.pauseQualityBtn.type = 'button';
    this.pauseQualityBtn.className = 'hud-pause-btn';
    this.pauseQualityBtn.dataset.pauseAction = 'quality';
    this.pauseQualityBtn.textContent = 'Quality: Medium';

    this.pauseLeaveBtn = document.createElement('button');
    this.pauseLeaveBtn.type = 'button';
    this.pauseLeaveBtn.className = 'hud-pause-btn danger';
    this.pauseLeaveBtn.dataset.pauseAction = 'leave';
    this.pauseLeaveBtn.textContent = 'Exit to Menu';

    pauseCard.append(
      pauseTitle,
      this.pauseResumeBtn,
      this.pauseRestartBtn,
      this.pauseSoundBtn,
      this.pauseQualityBtn,
      this.pauseLeaveBtn
    );
    this.pauseOverlay.append(pauseCard);

    this.root.append(
      this.topLeft,
      this.minimapCard,
      this.topRight,
      this.banner,
      this.hotbar,
      this.controlsToggleBtn,
      this.crosshair,
      this.help,
      this.endScreen,
      this.pauseOverlay
    );
    parent.append(this.root);
  }

  setRestartHandler(handler: () => void): void {
    this.restartButton.onclick = handler;
  }

  flashHit(direction = 0): void {
    flashHitVignette(this.hitVignette, direction);
  }

  showHitMarker(critical = false): void {
    this.hitMarker.classList.remove('active', 'crit');
    void this.hitMarker.offsetWidth; // Trigger reflow for animation restart
    this.hitMarker.classList.add('active');
    if (critical) {
      this.hitMarker.classList.add('crit');
    }
  }

  updateStormIntensity(intensity: number): void {
    updateStormVignette(this.stormVignette, intensity);
  }

  showPickupNotice(text: string): void {
    // Show pickup text near the crosshair / bottom center
    const rect = this.root.getBoundingClientRect();
    const x = rect.width * 0.5;
    const y = rect.height * 0.58;
    createPickupIndicator(this.root, text, x, y);
  }

  setPing(pingMs: number | null): void {
    if (pingMs === null || pingMs <= 0) {
      this.pingBadge.style.display = 'none';
      return;
    }
    this.pingBadge.style.display = 'block';
    this.pingBadge.textContent = `${pingMs}ms`;
    const quality = pingMs < 80 ? 'good' : pingMs < 160 ? 'fair' : 'poor';
    this.pingBadge.className = `hud-ping hud-ping-${quality}`;
  }

  setSpectating(targetName: string | null): void {
    if (targetName) {
      this.banner.textContent = `Spectating: ${targetName} • Space to cycle`;
      this.banner.style.display = 'block';
      this.banner.classList.add('hud-banner-spectate');
    } else {
      this.banner.classList.remove('hud-banner-spectate');
    }
  }

  render(snapshot: HudSnapshot): void {
    const topLeftKey = [
      Math.max(0, Math.ceil(snapshot.health)),
      snapshot.weaponName,
      snapshot.ammoInMag,
      snapshot.ammoReserve,
      snapshot.statusText,
      snapshot.materials.wood,
      snapshot.materials.stone,
      snapshot.materials.metal,
    ].join('|');
    if (topLeftKey !== this.lastTopLeftKey) {
      this.lastTopLeftKey = topLeftKey;
      this.topLeftHealth.textContent = `${Math.max(0, Math.ceil(snapshot.health))} HP`;
      this.topLeftWeapon.textContent = snapshot.weaponName;
      this.topLeftAmmo.textContent = `Ammo ${snapshot.ammoInMag} / ${snapshot.ammoReserve}`;
      this.topLeftStatus.textContent = snapshot.statusText;
      this.topLeftMaterials.textContent = `Wood ${snapshot.materials.wood} | Stone ${snapshot.materials.stone} | Metal ${snapshot.materials.metal}`;
    }

    const topRightKey = [snapshot.aliveCount, snapshot.eliminationCount, snapshot.stormText].join('|');
    if (topRightKey !== this.lastTopRightKey) {
      this.lastTopRightKey = topRightKey;
      this.topRightPlayers.textContent = `${snapshot.aliveCount} Left`;
      this.topRightElims.textContent = `Elims: ${snapshot.eliminationCount}`;
      this.topRightStorm.textContent = snapshot.stormText;
    }

    if (snapshot.bannerText !== this.lastBannerText) {
      this.lastBannerText = snapshot.bannerText;
      this.banner.textContent = snapshot.bannerText;
    }

    const hotbarKey = snapshot.hotbarItems
      .map((item) => `${item.key}:${item.label}:${item.detail}:${item.active ? 1 : 0}`)
      .join('|');
    if (hotbarKey !== this.lastHotbarKey) {
      this.lastHotbarKey = hotbarKey;
      this.hotbar.textContent = '';
      for (const item of snapshot.hotbarItems) {
        const slot = document.createElement('div');
        slot.className = `hud-slot${item.active ? ' active' : ''}`;
        slot.dataset.active = item.active ? 'true' : 'false';
        slot.setAttribute('aria-label', `${item.key}: ${item.label}, ${item.detail}${item.active ? ', equipped' : ''}`);

        const key = document.createElement('div');
        key.className = 'hud-slot-key';
        key.textContent = item.key;

        const label = document.createElement('div');
        label.className = 'hud-slot-label';
        label.textContent = item.label;

        const detail = document.createElement('div');
        detail.className = 'hud-slot-detail';
        detail.textContent = item.detail;

        slot.append(key, label, detail);
        this.hotbar.append(slot);
      }
    }

    if (snapshot.pointerLocked !== this.lastCrosshairVisible) {
      this.lastCrosshairVisible = snapshot.pointerLocked;
      this.crosshair.style.display = snapshot.pointerLocked ? 'block' : 'none';
    }

    if (snapshot.showHelp !== this.lastHelpVisible) {
      this.lastHelpVisible = snapshot.showHelp;
      this.isHelpCardVisible = snapshot.showHelp;
      this.help.classList.toggle('visible', snapshot.showHelp);
    }

    this.renderMinimap(snapshot.minimap);
  }

  setHelpToggleHandler(handler: (visible: boolean) => void): void {
    this.onHelpToggleCallback = handler;
  }

  toggleHelp(force?: boolean): void {
    this.isHelpCardVisible = force !== undefined ? force : !this.isHelpCardVisible;
    this.help.classList.toggle('visible', this.isHelpCardVisible);
    this.onHelpToggleCallback?.(this.isHelpCardVisible);
  }

  isHelpVisible(): boolean {
    return this.isHelpCardVisible;
  }

  setPauseHandlers(handlers: {
    onResume?: () => void;
    onRestart?: () => void;
    onToggleSound?: () => void;
    onCycleQuality?: () => void;
    onLeave?: () => void;
  }): void {
    if (handlers.onResume) this.pauseResumeBtn.onclick = handlers.onResume;
    if (handlers.onRestart) this.pauseRestartBtn.onclick = handlers.onRestart;
    if (handlers.onToggleSound) this.pauseSoundBtn.onclick = handlers.onToggleSound;
    if (handlers.onCycleQuality) this.pauseQualityBtn.onclick = handlers.onCycleQuality;
    if (handlers.onLeave) this.pauseLeaveBtn.onclick = handlers.onLeave;
  }

  showPause(paused: boolean, soundEnabled = true, quality = 'medium'): void {
    this.pauseOverlay.classList.toggle('visible', paused);
    if (paused) {
      this.pauseSoundBtn.textContent = `Sound: ${soundEnabled ? 'ON' : 'OFF'}`;
      this.pauseQualityBtn.textContent = `Quality: ${quality.toUpperCase()}`;
    }
  }

  setSpectateHandler(handler: () => void): void {
    this.spectateButton.onclick = handler;
  }

  showEndScreen(
    title: string,
    body: string,
    isVictory = false,
    stats?: { placement: number; eliminations: number; survivalTime: number },
    canSpectate = false
  ): void {
    this.endTitle.textContent = title;
    this.endBody.textContent = body;
    this.endScreen.classList.toggle('victory', isVictory);
    this.endScreen.classList.toggle('defeat', !isVictory);

    this.endStats.textContent = '';
    if (stats) {
      const minutes = Math.floor(stats.survivalTime / 60);
      const seconds = Math.floor(stats.survivalTime % 60);
      const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      const createStatItem = (label: string, value: string): HTMLDivElement => {
        const item = document.createElement('div');
        item.className = 'hud-end-stat';
        const lbl = document.createElement('div');
        lbl.className = 'hud-end-stat-label';
        lbl.textContent = label;
        const val = document.createElement('div');
        val.className = 'hud-end-stat-value';
        val.textContent = value;
        item.append(lbl, val);
        return item;
      };

      this.endStats.append(
        createStatItem('PLACEMENT', `#${stats.placement}`),
        createStatItem('ELIMINATIONS', String(stats.eliminations)),
        createStatItem('SURVIVED', timeStr)
      );
    }

    this.spectateButton.style.display = canSpectate ? 'inline-block' : 'none';
    this.endScreen.classList.add('visible');
  }

  hideEndScreen(): void {
    this.endScreen.classList.remove('visible', 'victory', 'defeat');
    this.spectateButton.style.display = 'none';
  }

  private renderMinimap(snapshot: HudMinimapSnapshot): void {
    if (!this.minimapContext) {
      return;
    }

    const ctx = this.minimapContext;
    const { width, height } = this.minimapCanvas;
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const mapRenderRadius = Math.min(width, height) * 0.43;
    const scale = mapRenderRadius / Math.max(1, snapshot.mapRadius);
    const toCanvas = (x: number, z: number): [number, number] => [centerX + x * scale, centerY + z * scale];

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#071018';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, mapRenderRadius, 0, Math.PI * 2);
    ctx.clip();

    // Island landmass fill
    ctx.fillStyle = '#3e5b46';
    ctx.fillRect(0, 0, width, height);

    // Biome nuances
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, mapRenderRadius, -Math.PI * 0.25, Math.PI * 0.25);
    ctx.closePath();
    ctx.fillStyle = '#c8a462';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, mapRenderRadius, Math.PI * 0.75, Math.PI * 1.25);
    ctx.closePath();
    ctx.fillStyle = '#2c5432';
    ctx.fill();

    // Coastline water rings
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let ringIndex = 1; ringIndex <= 3; ringIndex += 1) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, (mapRenderRadius * ringIndex) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Anchor location markers and names
    ctx.font = 'bold 9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    for (const loc of ANCHOR_LOCATIONS) {
      const [lx, ly] = toCanvas(loc.xRatio * snapshot.mapRadius, loc.zRatio * snapshot.mapRadius);
      ctx.fillStyle = loc.color;
      ctx.beginPath();
      ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Outline
      ctx.strokeStyle = '#050a10';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label with dark backing shadow
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 4;
      ctx.fillText(loc.name, lx, ly - 6);
      ctx.shadowBlur = 0;
    }

    // Storm
    const [stormX, stormY] = toCanvas(snapshot.stormCenterX, snapshot.stormCenterZ);
    ctx.fillStyle = 'rgba(137, 84, 255, 0.26)';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(stormX, stormY, snapshot.stormRadius * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#b48cff';
    ctx.stroke();

    // Safe Zone
    const [safeZoneX, safeZoneY] = toCanvas(snapshot.safeZoneCenterX, snapshot.safeZoneCenterZ);
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.arc(safeZoneX, safeZoneY, snapshot.safeZoneRadius * scale, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 247, 214, 0.92)';
    ctx.stroke();
    ctx.setLineDash([]);

    // Teammate
    if (snapshot.teammateX !== null && snapshot.teammateZ !== null) {
      const [teammateX, teammateY] = toCanvas(snapshot.teammateX, snapshot.teammateZ);
      ctx.beginPath();
      ctx.arc(teammateX, teammateY, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#67f0b2';
      ctx.shadowColor = 'rgba(103, 240, 178, 0.45)';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Player arrow
    const [playerX, playerY] = toCanvas(snapshot.playerX, snapshot.playerZ);
    ctx.save();
    ctx.translate(playerX, playerY);
    ctx.rotate(Math.PI - snapshot.playerYaw);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6.5, 7);
    ctx.lineTo(-6.5, 7);
    ctx.closePath();
    ctx.fillStyle = '#fff6d8';
    ctx.shadowColor = 'rgba(255, 236, 184, 0.4)';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = '#14304f';
    ctx.fill();
    ctx.restore();

    ctx.restore();
    ctx.beginPath();
    ctx.arc(centerX, centerY, mapRenderRadius, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 235, 196, 0.45)';
    ctx.stroke();
  }

  dispose(): void {
    this.root.remove();
    this.root.textContent = '';
    this.restartButton.onclick = null;
    this.spectateButton.onclick = null;
    this.onHelpToggleCallback = undefined;
  }
}
