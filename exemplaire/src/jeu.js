/* Le jeu : scène 3D, joueur, corps des autres, caméra, soupe, et les trois
   façons de finir — imprimé (statue), recyclé (soupe), célèbre (sortie). */
import * as THREE from 'three';
import {
  R, C, V_MAX, PAS_PHYSIQUE, J_HAUT, S_HAUT, Y_GLOIRE, HAUT_BOITE, R_INT, R_MUR,
  SOUPE_DEPART, SOUPE_DELAI, SOUPE_V0, SOUPE_ACC, SOUPE_RATTRAPAGE, MOTS,
} from './constantes.js';
import { alea } from './alea.js';
import { genererNiveau, zoneDe, GRAINE } from './niveau.js';
import { construireMonde } from './monde.js';
import { creerJoueur, pas, sauter, apercu, surfaceDessous, ecart, enroule } from './physique.js';
import {
  ENCRE, geoCornichesFixes, geoCorniche, geoParoi, geoDecorBoite, geoMatrice, geoCouvercle,
  geoPetiteBoite, construireMannequin, appliquerPose, POSES_DEF, geoPose, atlasTextes, geoBandeauGloire, versXZ,
} from './modeles.js';
import { materiauEncre, communs } from './rendu.js';

const FENETRE_STATUES = 24; // ne dessiner que les corps à ± 24 m de la caméra (on en voit ± 14)

function hashId(id) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 997) / 997;
}

export class Jeu {
  constructor(imprimerie, son, rappels) {
    this.imp = imprimerie;
    this.son = son;
    this.rappels = rappels;
    this.niveau = genererNiveau(GRAINE);
    this.monde = construireMonde(this.niveau, []);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(66, 1, 0.3, 150);
    this.etat = 'titre';
    this.statues = [];
    this.tempsTitre = 0;
    this.horloge = 0;
    this.accu = 0;
    this.evts = [];
    this.effets = { flash: 0, grille: 0, revele: 1, rouge: 0, decal: new THREE.Vector2(1.2, -0.9) };
    this.camAngle = 0;
    this.camY = 3;
    this.visee = null;
    this.batterie = null;
    this.suivreBatterie();
    this.construireDecor();
    this.construireJoueur();
    this.ajouterStatues(this.niveau.fondateurs.map((f) => ({ ...f })));
    this.nouvellePartie(false);
    this.etat = 'titre';
  }

  /* Le niveau de batterie est lu d'avance et suivi : au moment de
     s'imprimer, on ne doit rien attendre (sur un vrai téléphone, la réponse
     arrive plusieurs images plus tard). */
  suivreBatterie() {
    try {
      navigator.getBattery?.().then((b) => {
        const maj = () => { this.batterie = Math.round(b.level * 100); };
        maj();
        b.addEventListener?.('levelchange', maj);
      }).catch(() => {});
    } catch { /* pas d'accès à la batterie */ }
  }

  /* ------------------------------------------------------------ Décor */

  construireDecor() {
    const sc = this.scene;
    const r = alea(GRAINE + 7);
    const mDeux = materiauEncre({ deuxFaces: true, id: 0.11 });
    sc.add(new THREE.Mesh(geoParoi(), materiauEncre({ deuxFaces: true, nervures: true, id: 0.05 })));
    sc.add(new THREE.Mesh(geoCornichesFixes(this.niveau.corniches), materiauEncre({ deuxFaces: true, id: 0.21 })));
    sc.add(new THREE.Mesh(geoDecorBoite(r), materiauEncre({ deuxFaces: true, id: 0.33 })));
    // La presse est juste à côté de la corniche de départ, son tapis passe dessous
    const d = this.niveau.depart;
    sc.add(new THREE.Mesh(geoMatrice(d.s + d.l + 2.4, -1), mDeux));
    sc.add(new THREE.Mesh(geoCouvercle(), materiauEncre({ deuxFaces: true, id: 0.44 })));

    // Inscriptions peintes
    const { geo, tex } = atlasTextes(this.niveau.textes);
    sc.add(new THREE.Mesh(geo, materiauEncre({ detail: tex, decoupe: true, deuxFaces: true, encreDetail: ENCRE.DETAIL, encreFond: ENCRE.MUR, id: 0.05 })));

    // Bandeau de la gloire, réécrit quand la personne célèbre change
    this.cvGloire = document.createElement('canvas');
    this.cvGloire.width = 1024;
    this.cvGloire.height = 128;
    this.texGloire = new THREE.CanvasTexture(this.cvGloire);
    this.texGloire.wrapS = THREE.RepeatWrapping;
    this.texGloire.generateMipmaps = false;
    this.texGloire.minFilter = THREE.LinearFilter;
    sc.add(new THREE.Mesh(geoBandeauGloire(), materiauEncre({ detail: this.texGloire, deuxFaces: true, emissif: true, encreDetail: ENCRE.FOND, encreFond: ENCRE.DETAIL, id: 0.9 })));
    this.ecrireGloire(null);

    // Petites boîtes empilées sur les corniches de repos
    const deco = this.niveau.deco;
    const nb = deco.reduce((n, d) => n + d.pile, 0);
    const boites = new THREE.InstancedMesh(geoPetiteBoite(), materiauEncre({ id: 0.6 }), Math.max(1, nb));
    const m = new THREE.Matrix4();
    let k = 0;
    for (const d of deco) {
      const [x, z] = versXZ(d.s, (R_INT + R_MUR) / 2 + r.entre(-0.6, 0.9));
      for (let i = 0; i < d.pile; i++) {
        m.makeRotationY(r.entre(0, 6.3)).setPosition(x, d.y + i * 0.5, z);
        boites.setMatrixAt(k++, m);
      }
    }
    boites.count = k;
    sc.add(boites);

    // Corniches dynamiques : mobiles et fragiles, chacune son maillage
    this.dynamiques = [];
    for (const c of this.niveau.corniches) {
      if (c.type !== 'mobile' && c.type !== 'fragile') continue;
      const encre = c.type === 'fragile' ? ENCRE.ACCENT : ENCRE.CORNICHE;
      const ms = new THREE.Mesh(geoCorniche(c.s, c.l, c.y, c.ep, encre), materiauEncre({ deuxFaces: true, id: r.entre(0.2, 0.8) }));
      sc.add(ms);
      this.dynamiques.push({ c, ms });
    }

    // La soupe
    const geoSoupe = new THREE.RingGeometry(0.01, R_MUR + 0.2, 56, 10);
    geoSoupe.rotateX(-Math.PI / 2);
    this.soupeMs = new THREE.Mesh(geoSoupe, materiauEncre({ soupe: true, encre: ENCRE.SOUPE, id: 0.77 }));
    sc.add(this.soupeMs);

    // Bulles et vapeur : petites sphères instanciées
    const geoBoule = new THREE.IcosahedronGeometry(1, 1);
    this.bulles = new THREE.InstancedMesh(geoBoule, materiauEncre({ encre: ENCRE.SOUPE, id: 0.78 }), 14);
    this.bulles.frustumCulled = false;
    this.etatBulles = Array.from({ length: 14 }, () => ({ t: -1 }));
    sc.add(this.bulles);
    this.vapeur = new THREE.InstancedMesh(geoBoule, materiauEncre({ encre: ENCRE.FOND, id: 0.95, emissif: true }), 64);
    this.vapeur.frustumCulled = false;
    sc.add(this.vapeur);

    // Aperçu de trajectoire
    const geoPoint = new THREE.IcosahedronGeometry(0.075, 0);
    this.points = new THREE.InstancedMesh(geoPoint, materiauEncre({ encre: ENCRE.FOND, emissif: true, id: 0.97 }), 48);
    this.points.frustumCulled = false;
    this.points.count = 0;
    sc.add(this.points);

    // Corps : un maillage instancié par pose
    this.matStatue = materiauEncre({ id: 0 });
    this.parPose = POSES_DEF.slice(0, 6).map((_, i) => {
      const ms = new THREE.InstancedMesh(geoPose(i), this.matStatue, 600);
      ms.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(600 * 3), 3);
      ms.count = 0;
      ms.frustumCulled = false;
      sc.add(ms);
      return ms;
    });
    this.fenetreY = -999;
  }

  /* celebre : { pseudo } de la personne célèbre, null, ou un texte à écrire tel quel. */
  ecrireGloire(celebre) {
    const ctx = this.cvGloire.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = '#fff';
    ctx.font = '84px Anton, Impact, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const t = typeof celebre === 'string' ? celebre
      : celebre ? `★ ${celebre.pseudo.toUpperCase()} EST CÉLÈBRE ★` : '★ LA PLACE EST LIBRE ★';
    ctx.fillText(t, 512, 68, 1000);
    this.texGloire.needsUpdate = true;
  }

  /* ------------------------------------------------------------ Joueur */

  construireJoueur() {
    this.matJoueur = materiauEncre({ encre: ENCRE.JOUEUR, id: 0.5 });
    this.matDetail = materiauEncre({ encre: ENCRE.DETAIL, id: 0.5 });
    const { racine, art } = construireMannequin(this.matJoueur, this.matDetail);
    this.mannequin = racine;
    this.art = art;
    this.scene.add(racine);
    this.poseActuelle = 0;
  }

  /* ------------------------------------------------------------ Corps */

  ajouterStatues(liste) {
    for (const st of liste) {
      st.boite = this.monde.ajouterStatue(st);
      st.hash = hashId(st.id ?? Math.random());
      this.statues.push(st);
    }
    this.fenetreY = -999;
  }

  /* Remplace les corps venus du serveur (les fondateurs restent). */
  remplacerStatues(liste) {
    for (const st of this.statues) if (!st.fondateur) this.monde.retirer(st.boite);
    this.statues = this.statues.filter((s) => s.fondateur);
    this.ajouterStatues(liste.filter((s) => Number.isFinite(s.s) && Number.isFinite(s.y)));
  }

  matriceCorps(m, s, y, face, hash) {
    const a = s / R;
    const [x, z] = versXZ(s);
    const tourne = 0.42 + (hash - 0.5) * 0.5;
    const th = face > 0 ? -a - tourne : -a + Math.PI + tourne;
    m.makeRotationY(th).setPosition(x, y, z);
    return m;
  }

  /* Ne garde dans les maillages que les corps proches de la caméra. */
  majFenetre(force) {
    if (!force && Math.abs(this.camY - this.fenetreY) < 6) return;
    this.fenetreY = this.camY;
    const m = new THREE.Matrix4();
    const comptes = this.parPose.map(() => 0);
    for (const st of this.statues) {
      if (Math.abs(st.y - this.camY) > FENETRE_STATUES) continue;
      const p = Math.max(0, Math.min(5, st.pose | 0));
      const ms = this.parPose[p];
      const i = comptes[p];
      if (i >= ms.instanceMatrix.count) continue;
      ms.setMatrixAt(i, this.matriceCorps(m, st.s, st.y, st.face, st.hash));
      const ic = ms.instanceColor.array;
      ic[i * 3] = st.mien ? ENCRE.JOUEUR : ENCRE.STATUE;
      ic[i * 3 + 1] = st.hash;
      comptes[p]++;
    }
    this.parPose.forEach((ms, p) => {
      ms.count = comptes[p];
      ms.instanceMatrix.needsUpdate = true;
      ms.instanceColor.needsUpdate = true;
    });
  }

  /* ------------------------------------------------------------ Partie */

  nouvellePartie(avecSon = true) {
    // Chaque exemplaire tombe de la presse sur la corniche la plus basse
    const d = this.niveau.depart;
    this.j = creerJoueur(d.s + d.l / 2, d.y + 2.2);
    this.j.face = 1;
    this.monde.t = 0;
    for (const b of this.monde.fragiles) { b.actif = true; b.contact = undefined; b.chute = undefined; }
    this.soupe = SOUPE_DEPART;
    this.duree = 0;
    this.hMax = 0;
    this.etat = 'jeu';
    this.visee = null;
    this.mort = null;
    this.mannequin.visible = true;
    this.mannequin.rotation.set(0, 0, 0);
    this.camAngle = this.j.s / R;
    this.camY = d.y + 2.5;
    Object.assign(this.effets, { flash: 0.6, grille: 0, revele: 1, rouge: 0 });
    this.effets.decal.set(1.2, -0.9);
    this.son.etouffer(false);
    if (avecSon) this.son.jouer('naissance');
    this.fenetreY = -999;
  }

  /* Visée à la fronde : on tire en arrière, le saut part à l'opposé. */
  viser(dx, dy) {
    if (this.etat !== 'jeu') return;
    const echelle = V_MAX / (0.32 * Math.min(this.imp.w, this.imp.h));
    let vs = -dx * echelle, vy = dy * echelle;
    const n = Math.hypot(vs, vy);
    if (n > V_MAX) { vs *= V_MAX / n; vy *= V_MAX / n; }
    this.visee = { vs, vy, force: Math.min(1, n / V_MAX) };
    if (Math.abs(vs) > 0.4) this.j.face = vs > 0 ? 1 : -1;
  }

  lacher() {
    const v = this.visee;
    this.visee = null;
    this.points.count = 0;
    if (!v || this.etat !== 'jeu' || v.force < 0.12) return false;
    if (sauter(this.j, this.monde, v.vs, v.vy)) {
      this.son.jouer('saut');
      this.rappels.saut?.();
      return true;
    }
    return false;
  }

  annulerVisee() {
    this.visee = null;
    this.points.count = 0;
  }

  /* Pose correspondant à l'état du joueur au moment de l'impression. */
  poseCourante() {
    const j = this.j;
    if (j.sol) return this.visee ? 1 : 0;
    if (j.vy > 3) return 2;
    if (j.vy > -3) return 3;
    return 4;
  }

  /* Est-ce qu'un corps imprimé maintenant ferait une marche utile ? */
  aideImpression() {
    const j = this.j;
    if (j.sol) return { utile: false, texte: '' };
    const dessous = surfaceDessous(j, this.monde);
    if (!Number.isFinite(dessous)) return { utile: false, texte: '' };
    const marche = j.y + S_HAUT - dessous;
    if (j.y - dessous < 0.4) return { utile: false, texte: '' };
    if (marche <= 3.7) return { utile: true, texte: 'MARCHE ✓' };
    return { utile: false, texte: 'TROP HAUT' };
  }

  /* Synchrone exprès : l'état « imprimé » et la fiche de la mort doivent
     exister dans la même image, sinon la boucle de fin tourne sans fiche. */
  imprimerCorps() {
    if (this.etat !== 'jeu') return null;
    const j = this.j;
    this.annulerVisee();
    const date = new Date();
    const pose = this.poseCourante();
    appliquerPose(this.art, POSES_DEF[pose], 1);
    const st = {
      s: j.s, y: j.y, pose, face: j.face,
      mot: MOTS[Math.floor(Math.random() * MOTS.length)],
      heure: date.getHours(), minute: date.getMinutes(), batterie: this.batterie,
      pseudo: this.rappels.pseudo?.() || 'ANONYME', mien: true, achats: 0,
    };
    this.mort = { type: 'imprime', t: 0, statue: st };
    this.etat = 'imprime';
    Object.assign(this.effets, { flash: 1, grille: 0, revele: 1 });
    this.son.jouer('imprimer');
    navigator.vibrate?.([40, 60, 120]);
    return st;
  }

  /* Le corps imprimé entre dans le monde (avec son identifiant serveur). */
  poserStatue(st) {
    // Le corps instancié prend le relais du mannequin animé (même pose)
    this.mannequin.visible = false;
    this.ajouterStatues([st]);
    this.majFenetre(true);
  }

  /* ------------------------------------------------------------ Boucle */

  maj(dt) {
    this.horloge += dt;
    communs.uTemps.value = this.horloge;
    if (this.etat === 'titre' || this.etat === 'galerie') this.majTitre(dt);
    else if (this.etat === 'jeu') this.majJeu(dt);
    else if (this.etat === 'imprime' || this.etat === 'recycle' || this.etat === 'gloire') this.majFin(dt);
    this.majEffetsVisuels(dt);
    this.majCamera(dt);
    this.majFenetre(false);
    this.majDynamiques();
  }

  majJeu(dt) {
    const j = this.j;
    this.accu = Math.min(this.accu + dt, PAS_PHYSIQUE * 10);
    this.evts.length = 0;
    while (this.accu >= PAS_PHYSIQUE) {
      this.accu -= PAS_PHYSIQUE;
      this.monde.avancer(PAS_PHYSIQUE);
      pas(j, this.monde, PAS_PHYSIQUE, this.evts);
    }
    for (const e of new Set(this.evts)) {
      this.son.jouer(e);
      if (e === 'lourd') navigator.vibrate?.(30);
      if (e === 'atterrissage') navigator.vibrate?.(8);
    }
    this.duree += dt;
    this.hMax = Math.max(this.hMax, j.y);

    // La soupe monte
    if (this.duree > SOUPE_DELAI) {
      const t = this.duree - SOUPE_DELAI;
      const ecartSoupe = j.y - this.soupe;
      const v = SOUPE_V0 + SOUPE_ACC * t + Math.max(0, ecartSoupe - 30) * SOUPE_RATTRAPAGE;
      this.soupe += v * dt;
    }
    if (this.soupe > j.y + 0.35) {
      this.etat = 'recycle';
      this.mort = { type: 'recycle', t: 0 };
      this.annulerVisee();
      this.son.jouer('noyade');
      this.son.etouffer(true);
      navigator.vibrate?.([80, 40, 80, 40, 200]);
      this.rappels.recycle?.(this.hMax);
      return;
    }
    // Sortie de la boîte
    if (j.sol && j.y >= Y_GLOIRE - 0.6) {
      this.etat = 'gloire';
      this.mort = { type: 'gloire', t: 0 };
      this.annulerVisee();
      this.son.jouer('gloire');
      navigator.vibrate?.([100, 50, 100, 50, 300]);
      this.rappels.gloire?.(this.duree);
      return;
    }

    // Aperçu de trajectoire pendant la visée
    if (this.visee && (j.sol || j.coyote > 0)) {
      const { pts } = apercu(j, this.monde, this.visee.vs, this.visee.vy, 1.4, 1 / 30);
      const m = new THREE.Matrix4();
      let k = 0;
      for (let i = 0; i < pts.length && k < 48; i += 2) {
        const [x, z] = versXZ(pts[i]);
        const sc = 1 - (i / pts.length) * 0.6;
        m.makeScale(sc, sc, sc).setPosition(x, pts[i + 1] + 0.8, z);
        this.points.setMatrixAt(k++, m);
      }
      this.points.count = k;
      this.points.instanceMatrix.needsUpdate = true;
    } else {
      this.points.count = 0;
    }

    this.animerJoueur(dt);
    this.majSoupe(dt);
    const danger = Math.max(0, Math.min(1, 1 - (j.y - this.soupe) / 14));
    this.son.battre(danger, true);
    this.danger = danger;
  }

  animerJoueur(dt) {
    const j = this.j;
    let cible = 0;
    if (j.sol) cible = this.visee ? 1 : 0;
    else if (j.vy > 3) cible = 2;
    else if (j.vy > -3) cible = 3;
    else cible = 4;
    const p = { ...POSES_DEF[cible] };
    if (cible === 1 && this.visee) {
      // s'accroupir d'autant plus que la fronde est tendue
      const f = this.visee.force;
      const d = POSES_DEF[0];
      for (const k of Object.keys(p)) {
        if (typeof p[k] === 'number') p[k] = d[k] + (p[k] - d[k]) * f;
        else if (Array.isArray(p[k])) p[k] = p[k].map((v, i) => d[k][i] + (v - d[k][i]) * f);
      }
      p.bas = f > 0.35;
    }
    if (cible === 0) {
      // respiration
      p.torse += Math.sin(this.horloge * 2.2) * 2;
      p.cou += Math.sin(this.horloge * 1.1) * 4;
    }
    appliquerPose(this.art, p, 1 - Math.exp(-dt * 16));
    this.placerJoueur();
  }

  placerJoueur() {
    const j = this.j;
    const [x, z] = versXZ(j.s);
    const a = j.s / R;
    this.mannequin.position.set(x, j.y, z);
    const tourne = 0.45;
    this.mannequin.rotation.y = j.face > 0 ? -a - tourne : -a + Math.PI + tourne;
  }

  majSoupe(dt) {
    this.soupeMs.position.y = this.soupe;
    // bulles près du joueur, plus nombreuses quand la soupe approche
    const m = new THREE.Matrix4();
    let k = 0;
    for (const b of this.etatBulles) {
      if (b.t < 0 && Math.random() < dt * (0.6 + (this.danger || 0) * 6)) {
        b.t = 0;
        b.s = this.j.s + (Math.random() - 0.5) * 14;
        b.r = (R_INT - 2) + Math.random() * 4;
        b.taille = 0.15 + Math.random() * 0.35;
      }
      if (b.t >= 0) {
        b.t += dt;
        if (b.t > 0.9) { b.t = -1; continue; }
        const [x, z] = versXZ(b.s, b.r);
        const sc = b.taille * Math.sin((b.t / 0.9) * Math.PI);
        m.makeScale(sc, sc * 0.7, sc).setPosition(x, this.soupe + 0.05, z);
        this.bulles.setMatrixAt(k++, m);
      }
    }
    this.bulles.count = k;
    this.bulles.instanceMatrix.needsUpdate = true;
  }

  majDynamiques() {
    for (const { c, ms } of this.dynamiques) {
      const b = c.boite;
      if (c.type === 'mobile') {
        ms.rotation.y = -ecart(b.s, b.s0) / R;
      } else {
        ms.visible = b.actif;
        // les fragiles tremblent avant de tomber
        const tremble = b.contact !== undefined && b.actif ? Math.sin(this.horloge * 60) * 0.05 : 0;
        ms.position.y = tremble;
      }
    }
    // vapeur des bouches actives proches
    const m = new THREE.Matrix4();
    let k = 0;
    for (const b of this.monde.bouches) {
      if (Math.abs(b.y1 - this.camY) > 25) continue;
      const actif = this.monde.boucheActive(b);
      const phase = (this.monde.t + b.phase) % 3.2;
      for (let i = 0; i < 8 && k < 64; i++) {
        const u = (i / 8 + this.horloge * 0.9) % 1;
        const montee = actif ? u * 4.5 : u * 0.5;
        const sc = actif ? 0.12 + u * 0.38 : (phase > 2.6 ? 0.08 : 0);
        if (sc <= 0) continue;
        // Derrière le joueur (plus près de la paroi) pour ne jamais le cacher
        const [x, z] = versXZ(b.s + b.l / 2 + Math.sin(i * 2.3) * 0.5, R_MUR - 0.7 + Math.cos(i * 1.7) * 0.2);
        m.makeScale(sc, sc, sc).setPosition(x, b.y1 + 0.2 + montee, z);
        this.vapeur.setMatrixAt(k++, m);
      }
    }
    this.vapeur.count = k;
    this.vapeur.instanceMatrix.needsUpdate = true;
  }

  majFin(dt) {
    const mo = this.mort;
    if (!mo) { this.etat = 'titre'; return; }
    mo.t += dt;
    // Filet de sécurité : quoi qu'il arrive, l'écran suivant apparaît
    if (mo.t > 4.5 && !mo.fini) this.passerFin();
    this.imp.placerPlanche(0.05, 0.47, 0.95, 0.975);
    const e = this.effets;
    if (mo.type === 'imprime') {
      // flash, puis la planche 2×2 s'imprime à la raclette
      if (mo.t > 0.35 && e.grille < 0.5) {
        e.grille = 1;
        e.revele = 0;
        e.decal.set(16, -11);
      }
      if (e.grille > 0.5) {
        e.revele = Math.min(1, e.revele + dt / 1.7);
        e.decal.lerp(new THREE.Vector2(1.2, -0.9), 1 - Math.exp(-dt * 2.2));
        if (e.revele >= 1 && !mo.fini) { mo.fini = true; this.rappels.planche?.(); }
      }
    } else if (mo.type === 'recycle') {
      // le corps coule en se recroquevillant
      appliquerPose(this.art, POSES_DEF[6], 1 - Math.exp(-dt * 3));
      this.j.y -= dt * 0.9;
      this.placerJoueur();
      this.mannequin.rotation.z = Math.min(1.2, mo.t * 0.8);
      e.rouge = Math.min(0.85, mo.t * 0.9);
      this.soupe += dt * 0.15;
      this.majSoupe(dt);
      if (mo.t > 1.6 && !mo.fini) { mo.fini = true; this.rappels.planche?.(); }
    } else if (mo.type === 'gloire') {
      appliquerPose(this.art, POSES_DEF[5], 1 - Math.exp(-dt * 6));
      this.placerJoueur();
      // les palettes défilent : la planche clignote comme une enseigne
      e.grille = mo.t > 0.6 ? 1 : 0;
      e.flash = Math.max(e.flash, Math.sin(mo.t * 9) > 0.95 ? 0.4 : 0);
      if (mo.t > 1.2 && !mo.fini) { mo.fini = true; this.rappels.planche?.(); }
    }
    this.son.battre(0, false);
  }

  /* Toucher l'écran pendant l'animation de fin : on passe directement à la planche. */
  passerFin() {
    const mo = this.mort;
    if (!mo || mo.fini) return;
    mo.fini = true;
    mo.t = Math.max(mo.t, 2);
    if (mo.type === 'imprime') {
      Object.assign(this.effets, { grille: 1, revele: 1, flash: 0 });
      this.effets.decal.set(1.2, -0.9);
    }
    if (mo.type === 'recycle') this.effets.rouge = 0.85;
    this.rappels.planche?.();
  }

  majEffetsVisuels(dt) {
    const e = this.effets;
    e.flash = Math.max(0, e.flash - dt * 2.8);
    const u = this.imp.uniforms;
    u.uFlash.value = e.flash;
    u.uGrille.value = e.grille;
    u.uRevele.value = e.revele;
    u.uRouge.value = e.rouge;
    u.uDecal.value.copy(e.decal);

    // Palette du jeu selon la hauteur (fondu entre zones)
    const y = this.camY;
    const yV = this.niveau.yVide;
    if (y < 34) this.imp.fixerPaletteJeu('chaine', 'chaine', 0);
    else if (y < 44) this.imp.fixerPaletteJeu('chaine', 'atelier', (y - 34) / 10);
    else if (y < yV - 4) this.imp.fixerPaletteJeu('atelier', 'atelier', 0);
    else if (y < yV + 4) this.imp.fixerPaletteJeu('atelier', 'vide', (y - yV + 4) / 8);
    else this.imp.fixerPaletteJeu('vide', 'vide', 0);
  }

  majCamera(dt) {
    const cam = this.camera;
    cam.aspect = this.imp.w / this.imp.h;
    const portrait = cam.aspect < 1;
    cam.fov = portrait ? 70 : 52;
    cam.updateProjectionMatrix();

    if (this.etat === 'titre' || this.etat === 'galerie') {
      // Lente spirale au centre de la boîte, regard vers la lumière
      const t = this.tempsTitre;
      const y = 20 + (Math.sin(t * 0.05) * 0.5 + 0.5) * 100;
      this.camY = y;
      const a = t * 0.08;
      cam.position.set(Math.cos(a) * 1.5, y, Math.sin(a) * 1.5);
      cam.lookAt(Math.cos(a + 0.9) * R, y + 9, Math.sin(a + 0.9) * R);
      this.majLumiere();
      return;
    }

    const j = this.j;
    const cible = j.s / R;
    this.camAngle += ecart(cible * R, this.camAngle * R) / R * (1 - Math.exp(-dt * 4.5));
    let vise = j.y + 1.2;
    if (this.visee && this.visee.vy > 4) vise += 1.4;
    if (j.y > this.niveau.yVide - 2) vise += 1.0;
    this.camY += (vise - this.camY) * (1 - Math.exp(-dt * 3.5));
    const a = this.camAngle;
    // Distance au joueur : 9,8 m en portrait, 8 m en paysage (champ plus large)
    let rc = portrait ? R - 9.8 : R - 8;
    let hCam = this.camY + 1.2, hVise = this.camY + 0.3;
    if (this.mort && this.mort.type !== 'recycle') {
      // Gros plan sur le corps, comme un portrait de star
      const f = Math.min(1, this.mort.t / 0.35);
      const lisse = f * f * (3 - 2 * f);
      rc += (R - 3.4 - rc) * lisse;
      hCam += (j.y + 1.05 - hCam) * lisse;
      hVise += (j.y + 0.78 - hVise) * lisse;
    }
    cam.position.set(Math.cos(a) * rc, hCam, Math.sin(a) * rc);
    cam.lookAt(Math.cos(a) * R, hVise, Math.sin(a) * R);
    this.majLumiere();
  }

  majLumiere() {
    // Lumière venant du haut (l'ouverture) et un peu de la caméra
    const cam = this.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const droite = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    communs.uLum.value.set(0, 1, 0).multiplyScalar(0.85).addScaledVector(dir, -0.55).addScaledVector(droite, 0.35).normalize();
  }

  /* Rayon écran → point sur le cylindre du chemin → corps le plus proche. */
  corpsSous(xEcran, yEcran) {
    const ndc = new THREE.Vector2((xEcran / this.imp.w) * 2 - 1, -(yEcran / this.imp.h) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    const A = d.x * d.x + d.z * d.z, B = 2 * (o.x * d.x + o.z * d.z), Cc = o.x * o.x + o.z * o.z - R * R;
    const disc = B * B - 4 * A * Cc;
    if (disc < 0) return null;
    const t = (-B + Math.sqrt(disc)) / (2 * A);
    const p = o.clone().addScaledVector(d, t);
    const s = enroule(Math.atan2(p.z, p.x) * R);
    let meilleur = null, dMin = 1.2;
    for (const st of this.statues) {
      const ds = Math.abs(ecart(st.s, s));
      const dy = p.y < st.y ? st.y - p.y : p.y > st.y + S_HAUT ? p.y - st.y - S_HAUT : 0;
      const dd = Math.hypot(ds, dy);
      if (dd < dMin) { dMin = dd; meilleur = st; }
    }
    return meilleur;
  }

  majTitre(dt) {
    this.tempsTitre += dt;
    this.imp.placerPlanche(0, 0, 1, 1);
    this.mannequin.visible = false;
    this.points.count = 0;
    this.soupe = -2;
    this.majSoupe(dt);
    this.effets.grille = 1;
    this.effets.revele = 1;
    this.effets.rouge = 0;
    this.monde.avancer(dt);
  }

  dessiner() {
    this.imp.imprimer(this.scene, this.camera);
  }

  infos() {
    const j = this.j;
    return {
      hauteur: Math.max(0, j.y),
      soupe: j.y - this.soupe,
      duree: this.duree,
      zone: zoneDe(j.y, this.niveau),
      aide: this.etat === 'jeu' ? this.aideImpression() : null,
      auSol: !!j.sol,
      vide: j.y > this.niveau.yVide - 1,
    };
  }
}

export { HAUT_BOITE, C, J_HAUT };
