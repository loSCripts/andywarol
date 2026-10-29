/* Tout le son est synthétisé : aucun fichier audio.
   Une réverbération de « boîte métallique » (réponse impulsionnelle fabriquée
   ici) donne à chaque bruit l'écho d'une conserve géante. */

import { PARTITION, LONGUEUR, CROCHES_PAR_MESURE, TEMPO, frequence } from './musique.js';

export class Son {
  constructor() {
    this.ctx = null;
    this.muet = false;
    this.danger = 0;
    this.prochaineBulle = 0;
    // Séquenceur de la musique : position dans la partition et heure de la prochaine croche
    this.musique = false;
    this.position = 0;
    this.prochainPas = 0;
    this.ambianceActive = false;
  }

  /* Appelé au premier geste : les navigateurs interdisent le son avant. */
  debloquer() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.maitre = ctx.createGain();
    this.maitre.gain.value = this.muet ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.filtreGeneral = ctx.createBiquadFilter();
    this.filtreGeneral.type = 'lowpass';
    this.filtreGeneral.frequency.value = 18000;
    this.maitre.connect(this.filtreGeneral).connect(comp).connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.reponseBoite();
    this.envoiReverb = ctx.createGain();
    this.envoiReverb.gain.value = 0.55;
    this.envoiReverb.connect(this.reverb).connect(this.maitre);
    this.bruitBuf = this.bruitBlanc(2);
    // Écho du Vide : la mélodie y revient, plus faible, comme dans un puits
    this.echo = ctx.createDelay(2);
    this.echo.delayTime.value = 0.6;
    const retour = ctx.createGain();
    retour.gain.value = 0.38;
    this.echo.connect(retour).connect(this.echo);
    this.echo.connect(this.maitre);
  }

  basculerMuet() {
    this.muet = !this.muet;
    if (this.maitre) this.maitre.gain.setTargetAtTime(this.muet ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muet;
  }

  bruitBlanc(sec) {
    const n = Math.floor(this.ctx.sampleRate * sec);
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /* Réverbération de cylindre métallique : bruit qui décroît, plus quelques
     résonances fixes qui « chantent » comme une tôle. */
  reponseBoite() {
    const sr = this.ctx.sampleRate, n = Math.floor(sr * 3.2);
    const b = this.ctx.createBuffer(2, n, sr);
    const modes = [187, 311, 433, 742, 1210];
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        let v = (Math.random() * 2 - 1) * Math.exp(-t * 2.1);
        for (const f of modes) v += Math.sin(2 * Math.PI * f * t + c) * 0.05 * Math.exp(-t * 1.4);
        d[i] = v * (i < 40 ? i / 40 : 1);
      }
    }
    return b;
  }

  sortie(sec = 0.25) {
    const g = this.ctx.createGain();
    g.connect(this.maitre);
    const e = this.ctx.createGain();
    e.gain.value = sec;
    g.connect(e).connect(this.envoiReverb);
    return g;
  }

  bruit(t0, dur, filtre, f0, f1, vol, q = 1, reverb = 0.25) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.bruitBuf;
    const bq = this.ctx.createBiquadFilter();
    bq.type = filtre;
    bq.Q.value = q;
    bq.frequency.setValueAtTime(f0, t0);
    bq.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bq).connect(g).connect(this.sortie(reverb));
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  ton(t0, dur, type, f0, f1, vol, reverb = 0.25) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.sortie(reverb));
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  /* Tôle frappée : partiels inharmoniques. */
  metal(t0, f, vol, dur = 0.5) {
    for (const [k, v] of [[1, 1], [2.41, 0.5], [3.87, 0.3], [5.3, 0.15]]) this.ton(t0, dur / k ** 0.3, 'sine', f * k, f * k * 0.995, vol * v, 0.6);
  }

  get t() { return this.ctx.currentTime; }

  jouer(nom, force = 1) {
    if (!this.ctx || this.muet) return;
    const t = this.t;
    switch (nom) {
      case 'visee': this.ton(t, 0.05, 'triangle', 300 + force * 500, 300 + force * 500, 0.03, 0.1); break;
      case 'saut':
        this.bruit(t, 0.18, 'bandpass', 500, 2400, 0.25, 2, 0.15);
        this.ton(t, 0.09, 'square', 220, 440, 0.04, 0.1); // grincement de bois
        break;
      case 'atterrissage':
        this.ton(t, 0.13, 'sine', 95, 45, 0.5, 0.2);
        this.bruit(t, 0.05, 'bandpass', 1500, 900, 0.25, 3, 0.2);
        break;
      case 'lourd':
        this.ton(t, 0.25, 'sine', 80, 35, 0.8, 0.4);
        this.metal(t, 96, 0.12, 0.9);
        break;
      case 'mur': this.metal(t, 160 + Math.random() * 60, 0.1, 0.5); break;
      case 'cogne': this.ton(t, 0.1, 'sine', 300, 120, 0.3, 0.3); this.metal(t, 220, 0.06, 0.4); break;
      case 'bouche': this.bruit(t, 0.9, 'highpass', 2500, 5000, 0.18, 0.7, 0.3); break;
      case 'clic': this.bruit(t, 0.03, 'highpass', 3000, 3000, 0.25, 1, 0.1); break;
      case 'bulle': this.ton(t, 0.12, 'sine', 140 + Math.random() * 160, 70, 0.18 * force, 0.3); break;
      case 'imprimer': {
        // déclic d'obturateur, raclette, coup sourd dans la boîte, accord
        this.bruit(t, 0.04, 'highpass', 4000, 4000, 0.6, 1, 0.1);
        this.bruit(t + 0.05, 0.06, 'bandpass', 1800, 1800, 0.4, 4, 0.1);
        this.bruit(t + 0.15, 1.1, 'bandpass', 300, 1600, 0.35, 6, 0.3);
        this.ton(t + 0.12, 1.4, 'sine', 70, 30, 0.9, 0.8);
        for (const [i, f] of [220, 261.6, 329.6, 493.9].entries()) this.ton(t + 0.2 + i * 0.03, 2.2, 'sawtooth', f, f, 0.035, 0.9);
        break;
      }
      case 'noyade':
        this.ton(t, 1.4, 'sine', 220, 50, 0.6, 0.6);
        for (let i = 0; i < 9; i++) this.ton(t + 0.1 + i * 0.12, 0.1, 'sine', 300 + Math.random() * 300, 80, 0.2, 0.4);
        break;
      case 'gloire': {
        // applaudissements : des centaines de petites claques de bruit
        for (let i = 0; i < 260; i++) {
          const ti = t + Math.random() * 4 * Math.random() ** 0.4;
          this.bruit(ti, 0.03, 'bandpass', 1200 + Math.random() * 2600, 1500, 0.06 + Math.random() * 0.05, 1.5, 0.3);
        }
        [0, 4, 7, 12, 16, 19, 24].forEach((d, i) => this.ton(t + i * 0.09, 0.9, 'square', 261.6 * 2 ** (d / 12), 261.6 * 2 ** (d / 12), 0.05, 0.5));
        break;
      }
      case 'presse':
        // une presse touche le fond : coup sourd et tôle
        this.ton(t, 0.25, 'sine', 70, 32, 0.6, 0.5);
        this.bruit(t, 0.12, 'lowpass', 2500, 300, 0.4, 1, 0.5);
        this.metal(t, 120, 0.1, 0.9);
        break;
      case 'ecrase':
        this.ton(t, 0.3, 'sine', 90, 30, 1.0, 0.6);
        this.bruit(t, 0.18, 'bandpass', 900, 200, 0.7, 2, 0.4);
        for (let i = 0; i < 6; i++) this.bruit(t + 0.02 + i * 0.025, 0.02, 'highpass', 3000, 3000, 0.25, 1, 0.2); // craquements
        break;
      case 'heurt':
        this.ton(t, 0.12, 'sine', 160, 70, 0.45, 0.3);
        this.metal(t + 0.02, 260, 0.06, 0.4); // le crochet qui tinte
        break;
      case 'naissance':
        this.metal(t, 70, 0.3, 1.4);
        this.bruit(t, 0.35, 'lowpass', 3000, 200, 0.5, 1, 0.5);
        this.ton(t + 0.05, 0.5, 'sine', 60, 40, 0.8, 0.5);
        break;
      default: break;
    }
  }

  /* Filtre « sous la soupe ». */
  etouffer(oui) {
    if (!this.ctx) return;
    this.filtreGeneral.frequency.setTargetAtTime(oui ? 420 : 18000, this.t, 0.15);
  }

  /* Ambiance continue : bourdon d'usine. */
  demarrerAmbiance() {
    if (!this.ctx || this.ambianceActive) return;
    this.ambianceActive = true;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.045;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 200;
    for (const f of [55, 55.35, 110.2]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
    }
    lp.connect(g).connect(this.maitre);
    const src = ctx.createBufferSource();
    src.buffer = this.bruitBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 120;
    bp.Q.value = 3;
    const gb = ctx.createGain();
    gb.gain.value = 0.25;
    src.connect(bp).connect(gb).connect(this.maitre);
    src.start();
  }

  /* ------------------------------------------------------------ Musique */

  /* Note de boîte à musique : une lame d'acier, un partiel aigu qui s'éteint vite. */
  lame(t, f, dur, vol, echo) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [k, v] of [[1, 1], [2, 0.18], [4.02, 0.22]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * k;
      const gk = ctx.createGain();
      gk.gain.value = v;
      o.connect(gk).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    g.connect(this.sortie(0.5));
    if (echo) {
      const e = ctx.createGain();
      e.gain.value = 0.6;
      g.connect(e).connect(this.echo);
    }
  }

  /* Une croche de la partition, à l'heure t. zone : 'titre', 0, 1 ou 2. */
  jouerPas(i, t, zone, croche) {
    const p = PARTITION[i];
    const c = i % CROCHES_PAR_MESURE;
    const accord = PARTITION[i - c].accord;
    const vide = zone === 2;
    // Mélodie : une octave plus haut et avec écho dans le Vide
    for (const n of p.melodie) {
      const f = frequence(n.note + (vide ? 12 : 0));
      this.lame(t, f, Math.max(0.5, n.duree * croche * 1.8), vide ? 0.045 : 0.06, vide);
    }
    if (zone === 'titre') {
      if (c === 0) this.ton(t, croche * 5.5, 'sine', frequence(accord.basse), frequence(accord.basse), 0.05, 0.6);
      return;
    }
    if (vide) {
      // un bourdon, rien d'autre : il n'y a plus d'usine ici
      if (c === 0) this.ton(t, croche * 6, 'sine', frequence(accord.basse - 12), frequence(accord.basse - 12), 0.07, 0.8);
      return;
    }
    // Valse : la basse sur le temps, les accords sur les deux autres
    if (c === 0) this.ton(t, croche * 1.6, 'triangle', frequence(accord.basse), frequence(accord.basse), 0.12, 0.2);
    if ((c === 2 || c === 4) && zone === 1) {
      for (const n of accord.notes) this.ton(t, croche * 0.7, 'square', frequence(n), frequence(n), 0.011, 0.3);
    }
    // Percussions d'usine
    if (c === 0) this.ton(t, 0.14, 'sine', 95, 42, 0.32, 0.2);                       // coup de presse
    if (c === 2 || c === 4) this.bruit(t, 0.035, 'highpass', 6500, 6500, 0.05, 1, 0.1); // vapeur
    if (zone === 1) {
      if (c === 0 && (i / CROCHES_PAR_MESURE) % 2 === 1) this.metal(t, 180, 0.05, 0.6);  // tôle, une mesure sur deux
      if (c === 5) this.bruit(t, 0.02, 'bandpass', 2600, 2600, 0.06, 6, 0.1);          // cliquet
      if (c === 4 && Math.floor(i / CROCHES_PAR_MESURE) % 4 === 3) this.bruit(t, 0.12, 'bandpass', 420, 420, 0.16, 1.5, 0.4);
    }
  }

  /* Appelé à chaque image : fait avancer la musique (programmée un peu en
     avance, pour un rythme exact quelle que soit la fluidité de l'image).
     danger ∈ [0, 1] accélère le tempo ; zone : 'titre', 0, 1 ou 2. */
  battre(danger, actif, zone = 0) {
    if (!this.ctx || this.muet || !actif) { this.musique = false; return; }
    const maintenant = this.ctx.currentTime;
    if (!this.musique || this.prochainPas < maintenant - 0.3) {
      // reprise (début, retour de pause, onglet caché) : on repart au début d'une mesure
      this.musique = true;
      this.prochainPas = maintenant + 0.08;
      this.position -= this.position % CROCHES_PAR_MESURE;
    }
    const croche = 30 / (TEMPO[zone] * (1 + 0.5 * danger));
    // L'écho tombe sur le temps suivant (une noire plus tard) : il renforce le rythme au lieu de le brouiller
    this.echo.delayTime.setTargetAtTime(2 * croche, maintenant, 0.1);
    while (this.prochainPas < maintenant + 0.2) {
      this.jouerPas(this.position, this.prochainPas, zone, croche);
      this.position = (this.position + 1) % LONGUEUR;
      this.prochainPas += croche;
    }
    if (danger > 0.2 && maintenant >= this.prochaineBulle) {
      this.jouer('bulle', danger);
      this.prochaineBulle = maintenant + 0.15 + Math.random() * (1.4 - danger);
    }
  }
}
