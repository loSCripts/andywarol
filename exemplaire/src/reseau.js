/* Échanges avec le serveur, avec repli hors ligne.
   Hors ligne, le jeu reste jouable : on garde en mémoire les derniers corps
   reçus et ses propres corps (qui, eux, ne servent alors qu'à soi). */
import { SERVEUR } from './reglages.js';
import { VIE_STATUE_H } from './constantes.js';
import { VERSION_NIVEAU } from './niveau.js';

const CLE = 'exemplaire.';

export function lire(nom, defaut) {
  try {
    const v = localStorage.getItem(CLE + nom);
    return v === null ? defaut : JSON.parse(v);
  } catch { return defaut; }
}

export function ecrire(nom, valeur) {
  try { localStorage.setItem(CLE + nom, JSON.stringify(valeur)); } catch { /* stockage plein ou interdit */ }
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const appareil = lire('appareil', null) || (() => { const id = uuid(); ecrire('appareil', id); return id; })();

export class ErreurServeur extends Error {}

async function rpc(nom, args = {}, delai = 8000) {
  if (reseau.coupe) throw new Error('hors_ligne');
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), delai);
  try {
    const r = await fetch(`${SERVEUR.url}/rest/v1/rpc/${nom}`, {
      method: 'POST',
      headers: { apikey: SERVEUR.cle, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: ctrl.signal,
    });
    const texte = await r.text();
    const json = texte ? JSON.parse(texte) : null;
    if (!r.ok) throw new ErreurServeur(json?.message || `http_${r.status}`);
    reseau.enLigne = true;
    return json;
  } catch (e) {
    if (!(e instanceof ErreurServeur)) reseau.enLigne = false;
    throw e;
  } finally {
    clearTimeout(minuteur);
  }
}

/* Mes corps, gardés sur le téléphone : une liste par mode, pour que rien ne
   passe de l'un à l'autre. En ligne, ils servent à les reconnaître parmi ceux
   de tout le monde ; en mode seul, ce sont les seuls corps du monde. */
/* Les clés portent aussi la version du niveau : les corps posés dans l'ancien
   niveau (avant la version 2, sans suffixe) flotteraient dans le nouveau. */
const cleCorps = () => {
  const base = reseau.mode === 'dev' ? 'corpsDev' : reseau.seul ? 'corpsSeul' : 'mesCorps';
  return VERSION_NIVEAU > 1 ? `${base}${VERSION_NIVEAU}` : base;
};
// Registre local (numéros, recyclés, sortis) : un pour le mode seul, un pour le mode développeur
const suffixe = () => (reseau.mode === 'dev' ? 'Dev' : 'Seul');

function mesCorps() {
  const maintenant = Date.now();
  return lire(cleCorps(), []).filter((c) => Date.parse(c.expire_le) > maintenant);
}

function compterSeul(champ) {
  const s = lire(`stats${suffixe()}`, { recycles: 0, sortis: 0 });
  s[champ] = (s[champ] || 0) + 1;
  ecrire(`stats${suffixe()}`, s);
}

export const reseau = {
  enLigne: navigator.onLine !== false,
  coupe: false,                // mode essai : aucun échange avec le vrai serveur

  /* 'en-ligne' : monde partagé, les corps passent par le serveur.
     'seul' : aucun échange, les corps restent sur ce téléphone. */
  mode: lire('mode', 'en-ligne') === 'seul' ? 'seul' : 'en-ligne',
  // Le mode développeur se comporte comme le mode seul (aucun échange), avec ses propres corps
  get seul() { return this.mode === 'seul' || this.mode === 'dev'; },
  choisirMode(m) {
    if (this.mode === 'dev') return;
    this.mode = m === 'seul' ? 'seul' : 'en-ligne';
    ecrire('mode', this.mode);
  },
  modeDev() {
    this.mode = 'dev';
    this.coupe = true;
  },

  /* Le registre du mode seul, tenu sur le téléphone. */
  etatSeul() {
    const s = lire(`stats${suffixe()}`, { recycles: 0, sortis: 0 });
    return { produits: lire(`compteur${suffixe()}`, 0), debout: mesCorps().length, recycles: s.recycles || 0, sortis: s.sortis || 0 };
  },

  async etat() {
    if (this.seul) return lire('etat', null);   // mode seul : pas un seul échange
    try {
      const e = await rpc('etat');
      ecrire('etat', e);
      return e;
    } catch { return lire('etat', null); }
  },

  async nouvelExemplaire(pseudo) {
    if (this.seul) {
      const n = lire(`compteur${suffixe()}`, 0) + 1;
      ecrire(`compteur${suffixe()}`, n);
      return n;
    }
    try {
      return (await rpc('nouvel_exemplaire', { p_appareil: appareil, p_pseudo: pseudo })).numero;
    } catch { return null; }
  },

  /* Renvoie la statue telle qu'enregistrée (avec son id serveur), ou une statue locale. */
  async imprimer(numero, c) {
    // Champs choisis un par un : l'objet du jeu porte une référence circulaire (sa boîte de collision)
    const local = {
      s: c.s, y: c.y, pose: c.pose, face: c.face, mot: c.mot, heure: c.heure, minute: c.minute,
      batterie: c.batterie, pseudo: c.pseudo, id: `l${Date.now()}`, numero, local: true, achats: 0,
      cree_le: new Date().toISOString(),
      expire_le: new Date(Date.now() + VIE_STATUE_H * 3600e3).toISOString(),
    };
    let st = local;
    if (numero && !this.seul) {
      try {
        // imprimer_dans : le corps est rangé dans le monde de cette version du niveau
        st = await rpc('imprimer_dans', {
          p_niveau: VERSION_NIVEAU, p_appareil: appareil, p_numero: numero, p_s: c.s, p_y: c.y, p_pose: c.pose, p_face: c.face,
          p_mot: c.mot, p_heure: c.heure, p_minute: c.minute, p_batterie: c.batterie,
        });
      } catch { /* garde la version locale */ }
    }
    st.mien = true;
    ecrire(cleCorps(), [...mesCorps(), st]);
    return st;
  },

  async signer(st, mot) {
    st.mot = mot;
    const liste = mesCorps().map((c) => (c.id === st.id ? { ...c, mot } : c));
    ecrire(cleCorps(), liste);
    if (st.local) return;
    try { await rpc('signer', { p_appareil: appareil, p_id: st.id, p_mot: mot }); } catch { /* tant pis */ }
  },

  async recycler(numero, hauteur) {
    if (this.seul) { compterSeul('recycles'); return; }
    if (!numero) return;
    try { await rpc('recycler', { p_appareil: appareil, p_numero: numero, p_hauteur: hauteur }); } catch { /* rien */ }
  },

  /* Achat : renvoie la statue mise à jour, ou un code d'erreur lisible. */
  async acheter(id) {
    if (this.seul) return { erreur: 'seul' };
    try {
      const st = await rpc('acheter', { p_appareil: appareil, p_id: id });
      ecrire('achats', [...lire('achats', []), id]);
      return { st };
    } catch (e) {
      return { erreur: e instanceof ErreurServeur ? e.message : 'hors_ligne' };
    }
  },

  async gloire(numero, duree) {
    if (this.seul) { compterSeul('sortis'); return { erreur: 'seul' }; }
    if (!numero) return { erreur: 'hors_ligne' };
    try { return await rpc('revendiquer_gloire', { p_appareil: appareil, p_numero: numero, p_duree: duree }); } catch (e) {
      return { erreur: e instanceof ErreurServeur ? e.message : 'hors_ligne' };
    }
  },

  /* En ligne : les corps de tout le monde (+ les miens restés locaux).
     Seul : uniquement mes corps du mode seul. */
  async statues() {
    if (this.seul) return mesCorps().map((c) => ({ ...c, mien: true }));
    let liste;
    try {
      liste = await rpc('statues_du_niveau', { p_niveau: VERSION_NIVEAU, p_limite: 900 }, 12000);
      if (!Array.isArray(liste)) throw new Error('reponse_invalide');
      ecrire(`statues${VERSION_NIVEAU}`, liste);
    } catch {
      liste = lire(`statues${VERSION_NIVEAU}`, []).filter((c) => Date.parse(c.expire_le) > Date.now());
    }
    const miens = mesCorps();
    const idsMiens = new Set(miens.map((c) => c.id));
    for (const c of liste) if (idsMiens.has(c.id)) c.mien = true;
    const idsServeur = new Set(liste.map((c) => c.id));
    for (const c of miens) if (!idsServeur.has(c.id) && c.local) liste.push({ ...c, mien: true });
    return liste;
  },

  async galerie() {
    try { return await rpc('galerie'); } catch { return null; }
  },

  dejaAchete(id) { return lire('achats', []).includes(id); },
};
