import type { BuildPieceType, MaterialType } from './types';

export interface HudHotbarItem {
  key: string;
  label: string;
  detail: string;
  active: boolean;
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
}

export class FortLiteHud {
  private readonly root: HTMLDivElement;
  private readonly topLeft: HTMLDivElement;
  private readonly topRight: HTMLDivElement;
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

    this.topLeft = document.createElement('div');
    this.topLeft.className = 'hud-card hud-top-left';

    this.topRight = document.createElement('div');
    this.topRight.className = 'hud-card hud-top-right';

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

    this.root.append(this.topLeft, this.topRight, this.banner, this.hotbar, this.crosshair, this.help, this.endScreen);
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
      this.topLeft.innerHTML = `
        <div class="hud-title">Operator</div>
        <div class="hud-value">${Math.max(0, Math.ceil(snapshot.health))} HP</div>
        <div class="hud-line hud-accent">${snapshot.weaponName}</div>
        <div class="hud-line">Ammo ${snapshot.ammoInMag} / ${snapshot.ammoReserve}</div>
        <div class="hud-line">${snapshot.statusText}</div>
        <div class="hud-line">Wood ${snapshot.materials.wood} | Stone ${snapshot.materials.stone} | Metal ${snapshot.materials.metal}</div>
      `;
    }

    const topRightKey = [snapshot.aliveCount, snapshot.eliminationCount, snapshot.stormText].join('|');
    if (topRightKey !== this.lastTopRightKey) {
      this.lastTopRightKey = topRightKey;
      this.topRight.innerHTML = `
        <div class="hud-value">${snapshot.aliveCount} Players Left</div>
        <div class="hud-line hud-strong">Elims ${snapshot.eliminationCount}</div>
        <div class="hud-line hud-accent">${snapshot.stormText}</div>
      `;
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
      this.hotbar.innerHTML = snapshot.hotbarItems.map((item) => `
        <div class="hud-slot${item.active ? ' active' : ''}">
          <div class="hud-slot-key">${item.key}</div>
          <div class="hud-slot-label">${item.label}</div>
          <div class="hud-slot-detail">${item.detail}</div>
        </div>
      `).join('');
    }

    if (snapshot.pointerLocked !== this.lastCrosshairVisible) {
      this.lastCrosshairVisible = snapshot.pointerLocked;
      this.crosshair.style.display = snapshot.pointerLocked ? 'block' : 'none';
    }

    if (snapshot.showHelp !== this.lastHelpVisible) {
      this.lastHelpVisible = snapshot.showHelp;
      this.help.classList.toggle('visible', snapshot.showHelp);
    }
  }

  showEndScreen(title: string, body: string): void {
    this.endTitle.textContent = title;
    this.endBody.textContent = body;
    this.endScreen.classList.add('visible');
  }

  hideEndScreen(): void {
    this.endScreen.classList.remove('visible');
  }
}
