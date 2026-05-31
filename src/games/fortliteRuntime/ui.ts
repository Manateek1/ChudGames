import type { BuildPieceType, MaterialType } from './types';

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

export class FortLiteHud {
  private readonly root: HTMLDivElement;
  private readonly topLeftStack: HTMLDivElement;
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
  private readonly help: HTMLDivElement;
  private lastTopLeftKey = '';
  private lastTopRightKey = '';
  private lastBannerText = '';
  private lastHotbarKey = '';
  private lastCrosshairVisible: boolean | null = null;
  private lastHelpVisible: boolean | null = null;

  constructor(parent: HTMLElement, helpText: string) {
    this.root = document.createElement('div');
    this.root.className = 'hud-root';

    this.topLeftStack = document.createElement('div');
    this.topLeftStack.className = 'hud-top-left-stack';

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

    this.minimapCard = document.createElement('div');
    this.minimapCard.className = 'hud-card hud-minimap-card';

    const minimapTitle = document.createElement('div');
    minimapTitle.className = 'hud-title';
    minimapTitle.textContent = 'Minimap';

    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.className = 'hud-minimap';
    this.minimapCanvas.width = 200;
    this.minimapCanvas.height = 200;
    this.minimapContext = this.minimapCanvas.getContext('2d');
    this.minimapCard.append(minimapTitle, this.minimapCanvas);
    this.topLeftStack.append(this.topLeft, this.minimapCard);

    this.topRight = document.createElement('div');
    this.topRight.className = 'hud-card hud-top-right';

    this.topRightPlayers = document.createElement('div');
    this.topRightPlayers.className = 'hud-value';

    this.topRightElims = document.createElement('div');
    this.topRightElims.className = 'hud-line hud-strong';

    this.topRightStorm = document.createElement('div');
    this.topRightStorm.className = 'hud-line hud-accent';

    this.topRight.append(this.topRightPlayers, this.topRightElims, this.topRightStorm);

    this.banner = document.createElement('div');
    this.banner.className = 'hud-banner';

    this.hotbar = document.createElement('div');
    this.hotbar.className = 'hud-hotbar';

    this.crosshair = document.createElement('div');
    this.crosshair.className = 'hud-crosshair';

    this.help = document.createElement('div');
    this.help.className = 'hud-help';
    this.help.textContent = helpText;

    this.endScreen = document.createElement('div');
    this.endScreen.className = 'hud-end';

    const endCard = document.createElement('div');
    endCard.className = 'hud-end-card';

    this.endTitle = document.createElement('h1');
    this.endBody = document.createElement('p');
    this.restartButton = document.createElement('button');
    this.restartButton.type = 'button';
    this.restartButton.textContent = 'Start Another Match';

    endCard.append(this.endTitle, this.endBody, this.restartButton);
    this.endScreen.append(endCard);

    this.root.append(this.topLeftStack, this.topRight, this.banner, this.hotbar, this.crosshair, this.help, this.endScreen);
    parent.append(this.root);
  }

  setRestartHandler(handler: () => void): void {
    this.restartButton.onclick = handler;
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
      this.topRightPlayers.textContent = `${snapshot.aliveCount} Players Left`;
      this.topRightElims.textContent = `Elims ${snapshot.eliminationCount}`;
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
      this.help.classList.toggle('visible', snapshot.showHelp);
    }

    this.renderMinimap(snapshot.minimap);
  }

  showEndScreen(title: string, body: string): void {
    this.endTitle.textContent = title;
    this.endBody.textContent = body;
    this.endScreen.classList.add('visible');
  }

  hideEndScreen(): void {
    this.endScreen.classList.remove('visible');
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

    ctx.fillStyle = '#3e5b46';
    ctx.fillRect(0, 0, width, height);

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, mapRenderRadius, 0, Math.PI * 0.5);
    ctx.closePath();
    ctx.fillStyle = '#b89459';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, mapRenderRadius, Math.PI * 0.5, Math.PI);
    ctx.closePath();
    ctx.fillStyle = '#315a35';
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let ringIndex = 1; ringIndex <= 3; ringIndex += 1) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, (mapRenderRadius * ringIndex) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }

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

    const [safeZoneX, safeZoneY] = toCanvas(snapshot.safeZoneCenterX, snapshot.safeZoneCenterZ);
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.arc(safeZoneX, safeZoneY, snapshot.safeZoneRadius * scale, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 247, 214, 0.92)';
    ctx.stroke();
    ctx.setLineDash([]);

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
}
