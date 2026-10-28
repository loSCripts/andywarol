/* Échanges avec le serveur, avec repli hors ligne.
   Hors ligne, le jeu reste jouable : on garde en mémoire les derniers corps
   reçus et ses propres corps (qui, eux, ne servent alors qu'à soi). */
import { SERVEUR } from './reglages.js';
import { VIE_STATUE_H } from './constantes.js';

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

/* Mes corps : gardés localement pour les reconnaître (et les voir hors ligne). */
function mesCorps() {
  const maintenant = Date.now();
  return lire('mesCorps', []).filter((c) => Date.parse(c.expire_le) > maintenant);
}

export const reseau = {
  enLigne: navigator.onLine !== false,

  async etat() {
    try {
      const e = await rpc('etat');
      ecrire('etat', e);
      return e;
    } catch { return lire('etat', null); }
  },

  async nouvelExemplaire(pseudo) {
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
    if (numero) {
      try {
        st = await rpc('imprimer', {
          p_appareil: appareil, p_numero: numero, p_s: c.s, p_y: c.y, p_pose: c.pose, p_face: c.face,
          p_mot: c.mot, p_heure: c.heure, p_minute: c.minute, p_batterie: c.batterie,
        });
      } catch { /* garde la version locale */ }
    }
    st.mien = true;
    ecrire('mesCorps', [...mesCorps(), st]);
    return st;
  },

  async signer(st, mot) {
    st.mot = mot;
    const liste = mesCorps().map((c) => (c.id === st.id ? { ...c, mot } : c));
    ecrire('mesCorps', liste);
    if (st.local) return;
    try { await rpc('signer', { p_appareil: appareil, p_id: st.id, p_mot: mot }); } catch { /* tant pis */ }
  },

  async recycler(numero, hauteur) {
    if (!numero) return;
    try { await rpc('recycler', { p_appareil: appareil, p_numero: numero, p_hauteur: hauteur }); } catch { /* rien */ }
  },

  /* Achat : renvoie la statue mise à jour, ou un code d'erreur lisible. */
  async acheter(id) {
    try {
      const st = await rpc('acheter', { p_appareil: appareil, p_id: id });
      ecrire('achats', [...lire('achats', []), id]);
      return { st };
    } catch (e) {
      return { erreur: e instanceof ErreurServeur ? e.message : 'hors_ligne' };
    }
  },

  async gloire(numero, duree) {
    if (!numero) return { erreur: 'hors_ligne' };
    try { return await rpc('revendiquer_gloire', { p_appareil: appareil, p_numero: numero, p_duree: duree }); } catch (e) {
      return { erreur: e instanceof ErreurServeur ? e.message : 'hors_ligne' };
    }
  },

  /* Les corps de tout le monde (+ les miens restés locaux). */
  async statues() {
    let liste;
    try {
      liste = await rpc('statues_vivantes', { p_limite: 900 }, 12000);
      ecrire('statues', liste);
    } catch {
      liste = lire('statues', []).filter((c) => Date.parse(c.expire_le) > Date.now());
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
