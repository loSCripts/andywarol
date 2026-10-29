/* Rendu « sérigraphie ».
   1. La scène n'est pas rendue en couleurs : chaque pixel reçoit
      R = éclairement, G = numéro d'encre, B = profondeur, A = identifiant d'objet.
      Le tout dans une texture basse résolution (c'est la passe coûteuse).
   2. Une seule passe plein écran imprime l'image : aplats d'encre choisis dans
      une palette, trame de points dans les ombres, contours, et une plaque noire
      légèrement décalée comme un tirage mal calé.
   Avantage : les palettes se changent sans rien recalculer, et la planche 2×2
   de la mort coûte exactement le même prix qu'une image normale. */
import * as THREE from 'three';

export const communs = {
  uLum: { value: new THREE.Vector3(0.3, 1, 0.4).normalize() },
  uProfMax: { value: 48 },
  uTemps: { value: 0 },
};

const VERTEX = /* glsl */ `
uniform float uEncre;
uniform float uId;
uniform float uTemps;
attribute float aEncre;
attribute float aTapis;
varying vec3 vN;
varying vec3 vPos;
varying float vProf;
varying float vEncre;
varying float vId;
varying float vTapis;
#ifdef DETAIL
varying vec2 vUv;
#endif
void main() {
  vec3 p = position;
  vec3 n = normal;
#ifdef SOUPE
  float ph1 = p.x * 0.9 + uTemps * 1.7, ph2 = p.z * 1.3 - uTemps * 1.3, ph3 = (p.x + p.z) * 2.1 + uTemps * 2.3;
  p.y += sin(ph1) * 0.14 + sin(ph2) * 0.1 + sin(ph3) * 0.05;
  float dx = cos(ph1) * 0.126 + cos(ph3) * 0.105;
  float dz = cos(ph2) * 0.13 + cos(ph3) * 0.105;
  n = normalize(vec3(-dx, 1.0, -dz));
#endif
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = m * instanceMatrix;
#endif
  vec4 wp = m * vec4(p, 1.0);
  vN = normalize(mat3(m) * n);
  vPos = wp.xyz;
  vec4 vp = viewMatrix * wp;
  vProf = -vp.z;
  float e = uEncre;
  float id = uId;
#ifdef USE_INSTANCING_COLOR
  e = instanceColor.r;
  id = instanceColor.g;
#endif
  if (aEncre > 0.5) e = aEncre - 1.0;
  vEncre = e;
  vId = id;
  vTapis = aTapis;
#ifdef DETAIL
  vUv = uv;
#endif
  gl_Position = projectionMatrix * vp;
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uLum;
uniform float uProfMax;
uniform float uTemps;
#ifdef DETAIL
uniform sampler2D uDetail;
uniform float uEncreDetail;
uniform float uEncreFond;
varying vec2 vUv;
#endif
varying vec3 vN;
varying vec3 vPos;
varying float vProf;
varying float vEncre;
varying float vId;
varying float vTapis;
void main() {
  vec3 n = normalize(vN);
#ifdef DEUX_FACES
  if (dot(n, cameraPosition - vPos) < 0.0) n = -n;
#endif
#ifdef NERVURES
  // Les nervures d'une boîte de conserve : la normale ondule avec la hauteur
  n = normalize(n + vec3(0.0, sin(vPos.y * 4.2) * 0.5, 0.0));
#endif
  float l = 0.32 + 0.68 * max(dot(n, uLum), 0.0);
  float e = vEncre;
#ifdef DETAIL
  float m = texture2D(uDetail, vUv).r;
  #ifdef DECOUPE
  if (m < 0.3) discard;
  #endif
  if (m > 0.75) e = uEncreDetail;
  else if (m > 0.3) { e = uEncreFond; l *= 0.6; }
  else e = uEncreFond;
#endif
  if (vTapis != 0.0 && n.y > 0.8) {
    // Tapis roulant : des chevrons qui défilent dans le sens du transport
    float s = atan(vPos.z, vPos.x) * 9.0;
    if (fract((s - uTemps * vTapis) / 0.7) < 0.32) e = 7.0;
  }
#ifdef EMISSIF
  l = 1.0;
#endif
  gl_FragColor = vec4(l, (e + 0.5) / 8.0, clamp(vProf / uProfMax, 0.0, 1.0), vId);
}`;

/* Un matériau d'encre. Options : encre, id, detail (texture), deuxFaces, nervures, emissif, soupe, decoupe. */
export function materiauEncre(o = {}) {
  const defines = {};
  if (o.detail) defines.DETAIL = '';
  if (o.decoupe) defines.DECOUPE = '';
  if (o.deuxFaces) defines.DEUX_FACES = '';
  if (o.nervures) defines.NERVURES = '';
  if (o.emissif) defines.EMISSIF = '';
  if (o.soupe) defines.SOUPE = '';
  const uniforms = {
    ...communs,
    uEncre: { value: o.encre ?? 0 },
    uId: { value: o.id ?? Math.random() },
  };
  if (o.detail) {
    uniforms.uDetail = { value: o.detail };
    uniforms.uEncreDetail = { value: o.encreDetail ?? 7 };
    uniforms.uEncreFond = { value: o.encreFond ?? 1 };
  }
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms,
    defines,
    side: o.deuxFaces ? THREE.DoubleSide : THREE.FrontSide,
  });
}

/* ------------------------------------------------------------- Palettes */

/* Huit encres par palette, dans l'ordre :
   fond, paroi, corniches, joueur, corps des autres, accent, soupe, encre détail. */
export const PALETTES = {
  chaine: ['#ffd23f', '#ff4f9a', '#2ec4d6', '#ff7a00', '#f4f1e6', '#7bdc3c', '#e3001b', '#1d1a3a'],
  atelier: ['#9fe8ff', '#2b59ff', '#ffcf2e', '#ff3d7f', '#fff4e0', '#ff7a00', '#e3001b', '#10123a'],
  vide: ['#fffdf5', '#1b1b1f', '#c9c9c9', '#ff2d55', '#ffd400', '#00e0c6', '#e3001b', '#ff2d55'],
  menthe: ['#7cf0b0', '#ff6b35', '#6a4cff', '#ffe600', '#ff9ad5', '#00b3ff', '#b5001b', '#0d0d0d'],
  rose: ['#ff9ad5', '#2fd3c7', '#ffef3a', '#2b59ff', '#ffffff', '#ff3b30', '#ff3b30', '#111111'],
  nuit: ['#26222b', '#ffd400', '#ff2d55', '#ffffff', '#00e0c6', '#ff7a00', '#e3001b', '#000000'],
};
export const PLANCHE = ['chaine', 'menthe', 'rose', 'nuit'];
/* Valeurs sRGB brutes : la passe d'impression écrit directement dans le canevas,
   sans conversion d'espace colorimétrique (ShaderMaterial n'en fait pas). */
const versCouleur = (h) => new THREE.Color(
  parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255,
);

/* ------------------------------------------------------- Passe d'impression */

const POST_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uTexel;
uniform vec2 uRes;
uniform vec3 uPal[32];
uniform float uGrille;
uniform float uRevele;
uniform vec2 uDecal;
uniform float uTemps;
uniform float uRouge;
uniform float uFlash;
uniform float uTrame;
uniform vec3 uCle;
uniform vec3 uPapier;
uniform vec4 uPlanche;
uniform vec2 uRecadre;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  int pal = 0;
  vec2 frag = gl_FragCoord.xy;
  float marge = 0.0;
  if (uGrille > 0.5) {
    // La planche : quatre tirages dans un rectangle de la feuille, papier autour
    vec2 q = (vUv - uPlanche.xy) / (uPlanche.zw - uPlanche.xy);
    if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) {
      gl_FragColor = vec4(uPapier * (0.955 + 0.045 * hash(floor(frag / 2.0))), 1.0);
      return;
    }
    vec2 cel = floor(q * 2.0);
    uv = fract(q * 2.0);
    pal = int(cel.x) + int(1.0 - cel.y) * 2;
    vec2 b = min(uv, 1.0 - uv) * (uPlanche.zw - uPlanche.xy) * uRes * 0.5;
    marge = step(min(b.x, b.y), 3.0);
    // recadrage au centre pour garder les proportions de l'image
    uv = 0.5 + (uv - 0.5) * uRecadre * 1.04;
  }
  vec4 a = texture2D(tScene, uv);
  int e = int(a.g * 8.0);
  vec3 base = uPal[pal * 8 + e];
  vec3 fond = uPal[pal * 8];
  vec3 col = base;
  if (a.r > 0.82) col = mix(base, vec3(1.0), 0.28);
  col = mix(col, fond, smoothstep(0.5, 1.0, a.b) * 0.9);

  // Plaque noire, décalée
  vec2 uk = uv + uDecal * uTexel;
  vec4 k = texture2D(tScene, uk);
  vec4 kx1 = texture2D(tScene, uk + vec2(uTexel.x, 0.0));
  vec4 kx0 = texture2D(tScene, uk - vec2(uTexel.x, 0.0));
  vec4 ky1 = texture2D(tScene, uk + vec2(0.0, uTexel.y));
  vec4 ky0 = texture2D(tScene, uk - vec2(0.0, uTexel.y));
  float di = max(max(abs(kx1.g - kx0.g), abs(ky1.g - ky0.g)), max(abs(kx1.a - kx0.a), abs(ky1.a - ky0.a)));
  float lap = abs(kx1.b + kx0.b - 2.0 * k.b) + abs(ky1.b + ky0.b - 2.0 * k.b);
  float bord = clamp(step(0.03, di) + step(0.014, lap), 0.0, 1.0);
  bord *= 1.0 - smoothstep(0.55, 0.9, k.b);

  // Trame de points à 45°
  vec2 q = mat2(0.7071, -0.7071, 0.7071, 0.7071) * frag / uTrame;
  float r = length(fract(q) - 0.5);
  float sombre = clamp((0.6 - k.r) / 0.36, 0.0, 1.0) * (1.0 - smoothstep(0.6, 0.95, k.b));
  float rayon = sqrt(sombre) * 0.64;
  float pt = (1.0 - smoothstep(rayon - 0.07, rayon + 0.07, r)) * step(0.02, sombre);
  float noir = max(bord, pt * 0.9);

  // Tirage progressif : la couleur passe à la raclette de haut en bas, puis le noir
  float yv = 1.0 - uv.y;
  float p1 = clamp(uRevele / 0.6, 0.0, 1.0);
  float p2 = clamp((uRevele - 0.45) / 0.55, 0.0, 1.0);
  col = mix(uPapier, col, step(yv, p1 * 1.02));
  col = mix(col, uCle, noir * step(yv, p2 * 1.02));

  col *= 0.955 + 0.045 * hash(floor(frag / 2.0));
  col = mix(col, col * vec3(1.0, 0.18, 0.14) + vec3(0.25, 0.0, 0.0), uRouge);
  col = mix(col, uPapier, max(uFlash, marge));
  gl_FragColor = vec4(col, 1.0);
}`;

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Imprimerie {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, stencil: false, depth: true,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    this.renderer.autoClear = true;
    // Fond : pleine lumière, encre 0, profondeur maximale, identifiant 1
    this.renderer.setClearColor(new THREE.Color(1, 0.5 / 8, 1), 1);
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: true, stencilBuffer: false, generateMipmaps: false,
    });
    this.palettes = PLANCHE.map((n) => PALETTES[n].map(versCouleur));
    this.paletteJeu = PALETTES.chaine.map(versCouleur);
    const pal = new Array(32).fill(0).map(() => new THREE.Vector3());
    this.uniforms = {
      tScene: { value: this.rt.texture },
      uTexel: { value: new THREE.Vector2() },
      uRes: { value: new THREE.Vector2() },
      uPal: { value: pal },
      uGrille: { value: 0 },
      uRevele: { value: 1 },
      uDecal: { value: new THREE.Vector2(1.2, -0.9) },
      uTemps: communs.uTemps,
      uRouge: { value: 0 },
      uFlash: { value: 0 },
      uTrame: { value: 5 },
      uCle: { value: versCouleur('#16121a') },
      uPapier: { value: versCouleur('#f3ead8') },
      uPlanche: { value: new THREE.Vector4(0, 0, 1, 1) },
      uRecadre: { value: new THREE.Vector2(1, 1) },
    };
    this.post = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: POST_FRAG, uniforms: this.uniforms, depthTest: false, depthWrite: false }),
    );
    this.post.frustumCulled = false;
    this.scenePost = new THREE.Scene();
    this.scenePost.add(this.post);
    this.camPost = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Qualité adaptative : on mesure, on ajuste. Départ prudent.
    this.echelleScene = 0.55;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.mesures = [];
    this.dernierReglage = 0;
    this.redimensionner();
  }

  redimensionner() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.setSize(w, h, false);
    const W = Math.max(2, Math.round(w * this.ratio)), H = Math.max(2, Math.round(h * this.ratio));
    const sw = Math.max(2, Math.round(w * this.echelleScene * Math.min(this.ratio, 1.5)));
    const sh = Math.max(2, Math.round(h * this.echelleScene * Math.min(this.ratio, 1.5)));
    this.rt.setSize(sw, sh);
    this.uniforms.uTexel.value.set(1 / sw, 1 / sh);
    this.uniforms.uRes.value.set(W, H);
    this.uniforms.uTrame.value = Math.max(4, 3.2 * this.ratio);
    this.w = w;
    this.h = h;
  }

  /* Ajuste la résolution de la scène selon le temps de rendu mesuré. */
  ajuster(dtMs, maintenant) {
    this.mesures.push(dtMs);
    if (this.mesures.length < 50 || maintenant - this.dernierReglage < 2500) return;
    const tri = [...this.mesures].sort((a, b) => a - b);
    const median = tri[Math.floor(tri.length / 2)];
    this.mesures.length = 0;
    let change = false;
    if (median > 21 && this.echelleScene > 0.36) { this.echelleScene = Math.max(0.36, this.echelleScene - 0.08); change = true; }
    else if (median > 21 && this.ratio > 1) { this.ratio = Math.max(1, this.ratio - 0.25); change = true; }
    else if (median < 13 && this.echelleScene < 0.8) { this.echelleScene = Math.min(0.8, this.echelleScene + 0.05); change = true; }
    if (change) { this.dernierReglage = maintenant; this.redimensionner(); }
  }

  /* Où poser la planche 2×2 (en coordonnées 0–1, origine en bas à gauche).
     Chaque tirage est recadré au centre de l'image pour ne pas la déformer. */
  placerPlanche(x0, y0, x1, y1) {
    this.uniforms.uPlanche.value.set(x0, y0, x1, y1);
    const aCel = ((x1 - x0) * this.w) / ((y1 - y0) * this.h);
    const aScene = this.w / this.h;
    if (aCel > aScene) this.uniforms.uRecadre.value.set(1, aScene / aCel);
    else this.uniforms.uRecadre.value.set(aCel / aScene, 1);
  }

  /* Mélange de palettes pour le jeu (transition entre zones). */
  fixerPaletteJeu(nomA, nomB, t) {
    const A = PALETTES[nomA].map(versCouleur), B = PALETTES[nomB].map(versCouleur);
    for (let i = 0; i < 8; i++) this.paletteJeu[i] = A[i].clone().lerp(B[i], t);
  }

  imprimer(scene, camera) {
    const u = this.uniforms;
    const pal = u.uPal.value;
    for (let p = 0; p < 4; p++) {
      for (let i = 0; i < 8; i++) {
        const c = p === 0 && u.uGrille.value < 0.5 ? this.paletteJeu[i] : this.palettes[p][i];
        pal[p * 8 + i].set(c.r, c.g, c.b);
      }
    }
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(scene, camera);
    // chiffres de la passe scène (la passe d'impression, elle, ne fait que 2 triangles)
    this.statsScene = { appels: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scenePost, this.camPost);
  }
}
