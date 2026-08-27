import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RollingFps } from "../engine/fps";
import { clamp, randRange, seededRandom } from "../engine/math";
import type { GameComponentProps } from "../types/arcade";

interface TrafficCar { mesh: THREE.Group; z: number; speed: number }
interface BoostGate { mesh: THREE.Group; z: number }
const WIDTH = 900, HEIGHT = 540, LANES = [-3, 0, 3];
const TUNING = { easy: { maxSpeed: 116, trafficEvery: 1.8, lives: 3 }, normal: { maxSpeed: 136, trafficEvery: 1.35, lives: 2 }, hard: { maxSpeed: 156, trafficEvery: 1, lives: 1 } };

const makeCar = (color: number, scale = 1): THREE.Group => {
  const car = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, metalness: .58, roughness: .23 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x101827, metalness: .7, roughness: .12 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: .88 });
  const light = new THREE.MeshStandardMaterial({ color: 0xff263f, emissive: 0xb30018, emissiveIntensity: 2.2 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, .42, 3.05), body); base.position.y = .48; car.add(base);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.55, .2, 1.05), body); hood.position.set(0, .7, -.73); car.add(hood);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.28, .56, 1.25), glass); cabin.position.set(0, .92, .25); car.add(cabin);
  for (const x of [-.82, .82]) for (const z of [-.88, .88]) { const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.31, .31, .28, 12), tire); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, .32, z); car.add(wheel); }
  for (const x of [-.53, .53]) { const lamp = new THREE.Mesh(new THREE.BoxGeometry(.35, .1, .08), light); lamp.position.set(x, .57, 1.56); car.add(lamp); }
  car.scale.setScalar(scale); return car;
};

export const ApexRun = ({ difficulty, seed, paused, input, audio, onScore, onFps, onPauseToggle, onGameOver }: GameComponentProps): React.JSX.Element => {
  const mountRef = useRef<HTMLDivElement | null>(null); const pausedRef = useRef(paused); const endedRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => {
    const mount = mountRef.current; if (!mount) return;
    const cfg = TUNING[difficulty], random = seededRandom(seed), fps = new RollingFps();
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x68b5e5); scene.fog = new THREE.Fog(0x9bd5ee, 48, 175);
    const camera = new THREE.PerspectiveCamera(76, WIDTH / HEIGHT, .1, 260); camera.position.set(0, 1.55, 2.2); camera.lookAt(0, 1.15, -58);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }); renderer.setSize(WIDTH, HEIGHT, false); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; mount.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xdaf5ff, 0x283120, 2.3)); const sun = new THREE.DirectionalLight(0xffdfae, 4.6); sun.position.set(-28, 38, 18); sun.castShadow = true; scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(360, 420), new THREE.MeshStandardMaterial({ color: 0x315c34, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.z = -78; ground.receiveShadow = true; scene.add(ground);
    const mountainMat = new THREE.MeshStandardMaterial({ color: 0x42606c, roughness: .92, flatShading: true });
    for (let i = 0; i < 35; i += 1) { const mountain = new THREE.Mesh(new THREE.ConeGeometry(randRange(7, 20, random), randRange(16, 52, random), 5), mountainMat); mountain.position.set((i % 2 ? -1 : 1) * randRange(15, 60, random), randRange(6, 18, random), -25 - i * 7); mountain.rotation.y = random() * Math.PI; scene.add(mountain); }
    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: .78 }), roads: THREE.Mesh[] = [], stripes: THREE.Mesh[] = [];
    for (let i = 0; i < 18; i += 1) { const road = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 16), roadMaterial); road.rotation.x = -Math.PI / 2; road.position.z = 4 - i * 16; road.receiveShadow = true; scene.add(road); roads.push(road); }
    const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xf8fbff });
    for (let i = 0; i < 30; i += 1) for (const x of [-1.5, 1.5]) { const stripe = new THREE.Mesh(new THREE.PlaneGeometry(.18, 4.5), stripeMaterial); stripe.rotation.x = -Math.PI / 2; stripe.position.set(x, .012, 7 - i * 9); scene.add(stripe); stripes.push(stripe); }
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x9daeb9, metalness: .8, roughness: .28 });
    for (const side of [-1, 1]) for (let i = 0; i < 24; i += 1) { const rail = new THREE.Mesh(new THREE.BoxGeometry(.18, .45, 11), railMaterial); rail.position.set(side * 5.45, .65, 2 - i * 13); scene.add(rail); }
    const player = makeCar(0xe72d3e, 1.08); player.position.set(0, 0, 3); player.rotation.y = Math.PI; player.visible = false; scene.add(player);
    const dashboard = new THREE.Mesh(new THREE.BoxGeometry(13, .5, 2.8), new THREE.MeshStandardMaterial({ color: 0x10151b, roughness: .45, metalness: .35 })); dashboard.position.set(0, -.55, -.6); dashboard.rotation.x = -.16; camera.add(dashboard); scene.add(camera);
    const traffic: TrafficCar[] = [], gates: BoostGate[] = [];
    let speed = 0, nitro = .72, score = 0, distance = 0, lives = cfg.lives + 2, trafficTimer = 0, gateTimer = 0, previous = 0, raf = 0, uiTimer = 0, shake = 0;
    const addTraffic = (): void => { const openLanes = LANES.filter((lane) => Math.abs(lane - player.position.x) > 1.1 || random() > .75); const mesh = makeCar([0x1368aa, 0xf7bb2a, 0xffffff, 0x161c27][Math.floor(random() * 4)], randRange(.86, 1.05, random)); mesh.position.set(openLanes[Math.floor(random() * openLanes.length)], 0, -205); mesh.rotation.y = Math.PI; scene.add(mesh); traffic.push({ mesh, z: -205, speed: randRange(.2, .48, random) }); };
    const addGate = (): void => { const group = new THREE.Group(), material = new THREE.MeshStandardMaterial({ color: 0x00d9ff, emissive: 0x0077ff, emissiveIntensity: 2.5 }); for (const x of [-1.35, 1.35]) { const post = new THREE.Mesh(new THREE.BoxGeometry(.16, 2.4, .16), material); post.position.x = x; group.add(post); } const top = new THREE.Mesh(new THREE.BoxGeometry(2.85, .16, .16), material); top.position.y = 1.2; group.add(top); group.position.set(LANES[Math.floor(random() * LANES.length)], 1.2, -140); scene.add(group); gates.push({ mesh: group, z: -140 }); };
    const finish = (): void => { if (endedRef.current) return; endedRef.current = true; onGameOver({ score: Math.round(score), won: false, stats: { distance: Math.round(distance), topSpeed: Math.round(speed) } }); };
    const update = (dt: number): void => {
      if (input.consumePress("pause")) onPauseToggle(); const steering = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0), throttle = input.isDown("up"), braking = input.isDown("down"), boost = input.isDown("action") && nitro > .04;
      speed = clamp(speed + (throttle ? 62 : braking ? -115 : -18) * dt + (boost ? 46 : 0) * dt, 0, cfg.maxSpeed + 42); nitro = clamp(nitro + (boost ? -.34 : .075) * dt, 0, 1);
      player.position.x = clamp(player.position.x + steering * (7.4 + speed * .017) * dt, -3.85, 3.85); player.rotation.z = THREE.MathUtils.lerp(player.rotation.z, -steering * .18, .13); player.rotation.y = Math.PI + THREE.MathUtils.lerp(player.rotation.y - Math.PI, steering * .05, .08);
      const scroll = speed * dt; distance += scroll; score += scroll * (boost ? 2.4 : 1.1); trafficTimer += dt; gateTimer += dt; if (speed > 35 && trafficTimer >= cfg.trafficEvery * 1.7) { trafficTimer = 0; addTraffic(); } if (speed > 35 && gateTimer > 7.5) { gateTimer = 0; addGate(); }
      for (const road of roads) { road.position.z += scroll; if (road.position.z > 18) road.position.z -= 288; } for (const stripe of stripes) { stripe.position.z += scroll; if (stripe.position.z > 16) stripe.position.z -= 270; }
      for (let i = traffic.length - 1; i >= 0; i -= 1) { const car = traffic[i]; car.z += scroll * (.72 + car.speed); car.mesh.position.z = car.z; if (Math.abs(car.mesh.position.x - player.position.x) < 1.15 && car.z > -1.5 && car.z < 2.2) { lives -= 1; speed *= .32; shake = .55; audio.explosion(); scene.remove(car.mesh); traffic.splice(i, 1); if (lives <= 0) { finish(); return; } continue; } if (car.z > 14) { scene.remove(car.mesh); traffic.splice(i, 1); score += 90; audio.power(); } }
      for (let i = gates.length - 1; i >= 0; i -= 1) { const gate = gates[i]; gate.z += scroll; gate.mesh.position.z = gate.z; gate.mesh.rotation.y += dt * 1.4; if (gate.z > 1.2 && gate.z < 5 && Math.abs(gate.mesh.position.x - player.position.x) < 1.65) { nitro = 1; score += 350; audio.power(); scene.remove(gate.mesh); gates.splice(i, 1); continue; } if (gate.z > 15) { scene.remove(gate.mesh); gates.splice(i, 1); } }
      shake = Math.max(0, shake - dt); camera.position.x = player.position.x * .16 + (Math.random() - .5) * shake * .3; camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, -steering * .035, .1); uiTimer += dt; if (uiTimer > .12) { onScore(Math.round(score)); uiTimer = 0; }
    };
    const loop = (now: number): void => { const dt = Math.min((now - previous) / 1000 || 1 / 60, .05); previous = now; if (!pausedRef.current && !endedRef.current) update(dt); renderer.render(scene, camera); onFps(fps.next(now)); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); renderer.dispose(); mount.removeChild(renderer.domElement); };
  }, [difficulty, seed, input, audio, onScore, onFps, onPauseToggle, onGameOver]);
  return <div ref={mountRef} className="mx-auto aspect-[5/3] w-full max-w-[900px] overflow-hidden rounded-[1rem] bg-slate-950" aria-label="Apex Run 3D racing game" />;
};
