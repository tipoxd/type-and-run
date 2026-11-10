// Fondo 3D de la tienda con Three.js: cristales mágicos flotando, polvo brillante,
// resplandor (bloom) y monedas 3D que saltan al comprar o vender.
// La interfaz de la tienda sigue en HTML, encima de este fondo.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

interface Gem {
  mesh: THREE.Mesh;
  base: THREE.Vector3;
  phase: number;
  spin: THREE.Vector3;
}

interface Coin {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

interface Spark {
  pts: THREE.Points;
  vel: Float32Array;
  life: number;
  max: number;
}

export class Shop3D {
  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private scene = new THREE.Scene();
  /** Escena delantera (monedas y chispas) encima de la interfaz, con fondo transparente */
  private fgScene = new THREE.Scene();
  private fgRenderer!: THREE.WebGLRenderer;
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  private gems: Gem[] = [];
  private coinList: Coin[] = [];
  private sparks: Spark[] = [];
  private dust!: THREE.Points;
  private coinGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.035, 28);
  // Dorado brillante con destellos (Phong se ve bien sin mapa de entorno)
  private coinMat = new THREE.MeshPhongMaterial({ color: 0xffd23f, specular: 0xfff6d0, shininess: 90, emissive: 0x7a5200, emissiveIntensity: 0.55 });
  private dotTex!: THREE.Texture;
  private mouse = new THREE.Vector2();
  private spinBoost = 0;
  private zoom = 0;
  private clock = new THREE.Clock();
  private raf = 0;
  private canvas!: HTMLCanvasElement;
  private onResize = () => this.resize();
  private onMouse = (e: MouseEvent) => {
    this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  };
  ready = false;

  private get front() {
    return this.fgRenderer ? this.fgScene : this.scene;
  }

  init(host: HTMLElement): boolean {
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      return false;
    }
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'shop-3d';
    host.prepend(this.canvas);
    try {
      this.fgRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.fgRenderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
      this.fgRenderer.setClearColor(0x000000, 0);
      this.fgRenderer.domElement.className = 'shop-3d-front';
      host.append(this.fgRenderer.domElement);
    } catch {
      /* sin capa delantera: las monedas salen sólo en el fondo */
    }
    this.fgScene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const fgDir = new THREE.DirectionalLight(0xffffff, 2.2);
    fgDir.position.set(-3, 5, 6);
    this.fgScene.add(fgDir);
    const fgLight = new THREE.PointLight(0xfff0c0, 60, 40);
    fgLight.position.set(0, 4, 8);
    this.fgScene.add(fgLight);

    this.scene.background = new THREE.Color(0x120d24);
    this.scene.fog = new THREE.Fog(0x120d24, 9, 22);
    this.camera.position.set(0, 0, 10);

    // Luces: violeta, dorada y una que se mueve
    this.scene.add(new THREE.AmbientLight(0x6b5aa8, 0.6));
    const gold = new THREE.PointLight(0xffc83d, 40, 30);
    gold.position.set(4, 3, 5);
    const violet = new THREE.PointLight(0x9d6bff, 50, 30);
    violet.position.set(-5, -2, 4);
    this.scene.add(gold, violet);

    this.dotTex = this.makeDot();
    this.buildGems();
    this.buildDust();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.45, 0.35));
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('mousemove', this.onMouse);
    this.ready = true;
    this.loop();
    return true;
  }

  private makeDot(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private buildGems() {
    const shapes = [new THREE.OctahedronGeometry(0.7), new THREE.IcosahedronGeometry(0.6), new THREE.TetrahedronGeometry(0.7), new THREE.OctahedronGeometry(0.5, 0)];
    const colors = [0x9d6bff, 0x4cc9ff, 0xe27bff, 0xffd23f, 0x5ee08a];
    // A los lados para no tapar el centro (donde está la tienda)
    const spots = [
      [-7.5, 3.2, -2], [-8.5, -1.5, -4], [-6.2, -3.8, -1], [7.6, 3, -2], [8.6, -0.8, -5], [6.4, -3.6, -1.5], [-3, 4.6, -6], [3.5, -4.8, -6], [0, 5.2, -8],
    ] as const;
    spots.forEach(([x, y, z], i) => {
      const color = colors[i % colors.length];
      const mat = new THREE.MeshPhysicalMaterial({
        color, emissive: color, emissiveIntensity: 0.22, metalness: 0.1, roughness: 0.15, transmission: 0.3, thickness: 0.5, flatShading: true,
      });
      const mesh = new THREE.Mesh(shapes[i % shapes.length], mat);
      mesh.position.set(x, y, z);
      const s = 0.8 + Math.random() * 0.7;
      mesh.scale.setScalar(s);
      this.scene.add(mesh);
      // Halo suave detrás de cada cristal
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dotTex, color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.setScalar(2.6 * s);
      mesh.add(halo);
      this.gems.push({ mesh, base: mesh.position.clone(), phase: Math.random() * 10, spin: new THREE.Vector3(Math.random() * 0.6, 0.4 + Math.random() * 0.6, Math.random() * 0.3) });
    });
  }

  private buildDust() {
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 26;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 2] = -Math.random() * 12;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: 0.12, map: this.dotTex, color: 0xd9ccff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    this.dust = new THREE.Points(geo, mat);
    this.scene.add(this.dust);
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.fgRenderer?.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Convierte un punto de la pantalla (px) en un punto 3D en el plano z = 2. */
  private toWorld(x: number, y: number, z = 2): THREE.Vector3 {
    const ndc = new THREE.Vector3((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1, 0.5);
    ndc.unproject(this.camera);
    const dir = ndc.sub(this.camera.position).normalize();
    const t = (z - this.camera.position.z) / dir.z;
    return this.camera.position.clone().add(dir.multiplyScalar(t));
  }

  /** Monedas 3D que saltan desde un punto de la pantalla. up = salen hacia arriba (vender) */
  coins(x: number, y: number, n = 8, up = false) {
    if (!this.ready) return;
    const o = this.toWorld(x, y);
    for (let i = 0; i < n && this.coinList.length < 80; i++) {
      const mesh = new THREE.Mesh(this.coinGeo, this.coinMat);
      mesh.position.copy(o);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.front.add(mesh);
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 3;
      this.coinList.push({
        mesh,
        v: new THREE.Vector3(Math.cos(a) * sp, (up ? 5 : 3) + Math.random() * 4, Math.sin(a) * 1.5 + 1),
        spin: new THREE.Vector3(8 + Math.random() * 10, Math.random() * 6, 0),
        life: 1.6,
      });
    }
    this.sparkle(x, y, 0xffd23f, 30);
  }

  /** Estallido de chispas de luz en un punto de la pantalla. */
  sparkle(x: number, y: number, color = 0xb9a8ff, n = 50) {
    if (!this.ready) return;
    const o = this.toWorld(x, y);
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = o.x;
      pos[i * 3 + 1] = o.y;
      pos[i * 3 + 2] = o.z;
      const v = new THREE.Vector3().randomDirection().multiplyScalar(2 + Math.random() * 4);
      vel[i * 3] = v.x;
      vel[i * 3 + 1] = v.y;
      vel[i * 3 + 2] = v.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.22, map: this.dotTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.front.add(pts);
    this.sparks.push({ pts, vel, life: 0.9, max: 0.9 });
  }

  /** Los cristales giran rápido (al cambiar artículos). */
  spin() {
    this.spinBoost = 1;
  }

  /** Transición al salir: la cámara avanza hacia los cristales. */
  outro(): Promise<void> {
    return new Promise((res) => {
      if (!this.ready) return res();
      this.zoom = 0.0001;
      this.spinBoost = 1;
      setTimeout(res, 450);
    });
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    this.spinBoost = Math.max(0, this.spinBoost - dt * 0.8);
    const boost = 1 + this.spinBoost * 10;

    for (const g of this.gems) {
      g.mesh.rotation.x += g.spin.x * dt * boost;
      g.mesh.rotation.y += g.spin.y * dt * boost;
      g.mesh.position.y = g.base.y + Math.sin(t * 0.8 + g.phase) * 0.35;
      g.mesh.position.x = g.base.x + Math.cos(t * 0.5 + g.phase) * 0.15;
    }
    this.dust.rotation.y = t * 0.01;
    const dp = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < dp.count; i++) {
      let y = dp.getY(i) + dt * (0.15 + (i % 7) * 0.03);
      if (y > 8) y = -8;
      dp.setY(i, y);
    }
    dp.needsUpdate = true;

    for (let i = this.coinList.length - 1; i >= 0; i--) {
      const c = this.coinList[i];
      c.life -= dt;
      c.v.y -= 9.8 * dt;
      c.mesh.position.addScaledVector(c.v, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      if (c.life <= 0) {
        this.front.remove(c.mesh);
        this.coinList.splice(i, 1);
      }
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      const p = s.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) {
        s.vel[k * 3] *= 0.96;
        s.vel[k * 3 + 1] = s.vel[k * 3 + 1] * 0.96 - dt * 3;
        s.vel[k * 3 + 2] *= 0.96;
        p.setXYZ(k, p.getX(k) + s.vel[k * 3] * dt, p.getY(k) + s.vel[k * 3 + 1] * dt, p.getZ(k) + s.vel[k * 3 + 2] * dt);
      }
      p.needsUpdate = true;
      (s.pts.material as THREE.PointsMaterial).opacity = s.life / s.max;
      if (s.life <= 0) {
        this.front.remove(s.pts);
        s.pts.geometry.dispose();
        (s.pts.material as THREE.Material).dispose();
        this.sparks.splice(i, 1);
      }
    }

    // Cámara: sigue un poco al ratón; al salir, avanza
    if (this.zoom > 0) this.zoom = Math.min(1, this.zoom + dt * 2.5);
    const targetZ = 10 - this.zoom * this.zoom * 7;
    this.camera.position.x += (this.mouse.x * 0.8 - this.camera.position.x) * dt * 2;
    this.camera.position.y += (this.mouse.y * 0.5 - this.camera.position.y) * dt * 2;
    this.camera.position.z += (targetZ - this.camera.position.z) * Math.min(1, dt * 8);
    this.camera.lookAt(0, 0, 0);

    this.composer.render();
    this.fgRenderer?.render(this.fgScene, this.camera);
  };

  destroy() {
    this.ready = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('mousemove', this.onMouse);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.coinGeo.dispose();
    this.coinMat.dispose();
    this.dotTex.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.canvas.remove();
    if (this.fgRenderer) {
      this.fgRenderer.dispose();
      this.fgRenderer.domElement.remove();
    }
  }
}
