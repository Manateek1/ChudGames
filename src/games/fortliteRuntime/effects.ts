import * as THREE from 'three';

/** A ring of dust particles that appears when a player lands from parachute. */
export interface LandingDustEffect {
  mesh: THREE.Mesh;
  timeRemaining: number;
  duration: number;
}

/**
 * Creates a landing dust ring at the given position.
 * The ring expands and fades over its lifetime.
 */
export function createLandingDust(position: THREE.Vector3, duration = 0.6): LandingDustEffect {
  const geometry = new THREE.RingGeometry(0.5, 3.5, 24);
  const material = new THREE.MeshBasicMaterial({
    color: 0xc8b892,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(position.x, position.y + 0.12, position.z);
  return { mesh, timeRemaining: duration, duration };
}

/**
 * Updates a landing dust effect. Returns true when the effect is finished.
 */
export function updateLandingDust(effect: LandingDustEffect, dt: number): boolean {
  effect.timeRemaining -= dt;
  const progress = 1 - Math.max(0, effect.timeRemaining / effect.duration);
  const scale = 1 + progress * 2.5;
  effect.mesh.scale.set(scale, scale, 1);
  const material = effect.mesh.material as THREE.MeshBasicMaterial;
  material.opacity = 0.55 * (1 - progress);
  return effect.timeRemaining <= 0;
}

/** Disposes a landing dust effect. */
export function disposeLandingDust(effect: LandingDustEffect): void {
  effect.mesh.geometry.dispose();
  (effect.mesh.material as THREE.Material).dispose();
}

// --- DOM-based HUD effects ---

/**
 * Creates the hit-direction vignette overlay.
 * Returns an HTMLElement that should be appended to the HUD root.
 */
export function createHitVignetteElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'fortlite-hit-vignette';
  el.setAttribute('aria-hidden', 'true');
  return el;
}

/**
 * Flash the hit vignette. Call when the player takes damage.
 * direction is a normalized angle in radians (0=front, PI=back).
 */
export function flashHitVignette(element: HTMLDivElement, direction: number): void {
  const angleDeg = ((direction * 180) / Math.PI + 90) % 360;
  element.style.background = `conic-gradient(from ${angleDeg}deg, rgba(220,40,40,0.38) 0deg, transparent 60deg, transparent 300deg, rgba(220,40,40,0.38) 360deg)`;
  element.style.opacity = '1';

  // Force reflow for animation restart
  void element.offsetWidth;
  element.classList.remove('active');
  void element.offsetWidth;
  element.classList.add('active');
}

/**
 * Creates the storm edge vignette overlay.
 * Returns an HTMLElement that should be appended to the HUD root.
 */
export function createStormVignetteElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'fortlite-storm-vignette';
  el.setAttribute('aria-hidden', 'true');
  return el;
}

/**
 * Updates storm vignette intensity.
 * @param intensity 0 = safe, 1 = deep in storm
 */
export function updateStormVignette(element: HTMLDivElement, intensity: number): void {
  const clamped = Math.max(0, Math.min(1, intensity));
  if (clamped < 0.01) {
    element.classList.remove('active');
    element.style.opacity = '0';
    return;
  }

  element.classList.add('active');
  // Keep the storm unmistakable as soon as the player crosses the boundary,
  // while still reserving the darkest treatment for deeper storm exposure.
  element.style.opacity = String(0.56 + clamped * 0.28);
}

/**
 * Creates a floating pickup text indicator.
 * These float upward and fade out over ~0.8 seconds.
 */
export function createPickupIndicator(
  parent: HTMLElement,
  text: string,
  screenX: number,
  screenY: number
): void {
  const el = document.createElement('div');
  el.className = 'fortlite-pickup-indicator';
  el.textContent = text;
  el.style.left = `${screenX}px`;
  el.style.top = `${screenY}px`;
  parent.appendChild(el);

  // Force reflow then start animation
  void el.offsetWidth;
  el.classList.add('active');

  // Remove after animation completes
  const cleanup = (): void => {
    el.removeEventListener('animationend', cleanup);
    el.remove();
  };
  el.addEventListener('animationend', cleanup);

  // Safety cleanup in case animationend doesn't fire
  window.setTimeout(() => el.remove(), 1200);
}

/**
 * Animates a build piece placement with a scale-up effect.
 */
export interface BuildPlaceAnimation {
  mesh: THREE.Object3D;
  timeRemaining: number;
  duration: number;
}

export function createBuildPlaceAnimation(mesh: THREE.Object3D, duration = 0.2): BuildPlaceAnimation {
  mesh.scale.setScalar(0.8);
  return { mesh, timeRemaining: duration, duration };
}

/**
 * Updates a build placement animation. Returns true when finished.
 */
export function updateBuildPlaceAnimation(anim: BuildPlaceAnimation, dt: number): boolean {
  anim.timeRemaining -= dt;
  const progress = 1 - Math.max(0, anim.timeRemaining / anim.duration);
  const scale = 0.8 + progress * 0.2;
  anim.mesh.scale.setScalar(scale);
  return anim.timeRemaining <= 0;
}
