/* Générateur pseudo-aléatoire à graine (mulberry32) : le niveau doit être le
   même pour tout le monde, sinon les corps des uns flotteraient dans le vide des autres. */
export function alea(graine) {
  let a = graine >>> 0;
  const suivant = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    suivant,
    entre: (a0, a1) => a0 + (a1 - a0) * suivant(),
    entier: (a0, a1) => a0 + Math.floor((a1 - a0 + 1) * suivant()),
    choix: (liste) => liste[Math.floor(liste.length * suivant())],
    chance: (p) => suivant() < p,
  };
}
