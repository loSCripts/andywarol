/* La musique : une valse mécanique en la mineur, à 3 temps, comme une boîte à
   musique remontée dans une usine. Deux thèmes de 8 mesures (A puis B), joués
   en boucle. Les durées sont en croches : 6 croches par mesure.

   Le morceau change avec l'endroit (voir son.js) : berceuse lente à l'écran
   titre, valse avec basse et percussions d'usine dans La Chaîne, accords et
   coups de presse dans L'Atelier, mélodie seule et lointaine dans Le Vide.
   Plus la soupe approche, plus le tempo monte. */

const NOTES = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

/* 'G#5' → numéro MIDI (A4 = 69). */
export function midi(nom) {
  const [, n, o] = nom.match(/^([A-G]#?)(\d)$/);
  return 12 * (Number(o) + 1) + NOTES[n];
}

export const frequence = (m) => 440 * 2 ** ((m - 69) / 12);

// Thème A : la berceuse (la mineur)
const A = [
  [['E5', 2], ['A5', 2], ['G5', 1], ['E5', 1]],
  [['F5', 3], ['E5', 1], ['D5', 2]],
  [['E5', 2], ['C5', 2], ['A4', 2]],
  [['B4', 4], ['G#4', 2]],
  [['E5', 2], ['A5', 2], ['B5', 1], ['C6', 1]],
  [['D6', 3], ['C6', 1], ['B5', 2]],
  [['A5', 2], ['E5', 2], ['G#5', 2]],
  [['A5', 6]],
];

// Thème B : la machine (arpèges réguliers, plus mécaniques)
const B = [
  [['C5', 1], ['E5', 1], ['G5', 1], ['E5', 1], ['C5', 2]],
  [['D5', 1], ['F5', 1], ['A5', 1], ['F5', 1], ['D5', 2]],
  [['B4', 1], ['D5', 1], ['G5', 1], ['D5', 1], ['B4', 2]],
  [['C5', 1], ['E5', 1], ['A5', 2], ['G#5', 2]],
  [['A4', 1], ['C5', 1], ['E5', 1], ['A5', 1], ['G5', 2]],
  [['F5', 2], ['E5', 1], ['D5', 1], ['C5', 2]],
  [['B4', 2], ['C5', 1], ['D5', 1], ['E5', 2]],
  [['A4', 6]],
];

/* Accords : fondamentale à la basse, et les trois notes du « pa-pa » de la valse. */
const ACCORDS = {
  Am: { basse: 'A2', notes: ['A3', 'C4', 'E4'] },
  Dm: { basse: 'D3', notes: ['A3', 'D4', 'F4'] },
  E: { basse: 'E2', notes: ['G#3', 'B3', 'E4'] },
  C: { basse: 'C3', notes: ['G3', 'C4', 'E4'] },
  G: { basse: 'G2', notes: ['G3', 'B3', 'D4'] },
  F: { basse: 'F2', notes: ['A3', 'C4', 'F4'] },
};
const GRILLE = ['Am', 'Dm', 'Am', 'E', 'Am', 'Dm', 'E', 'Am', 'C', 'Dm', 'G', 'E', 'Am', 'F', 'E', 'Am'];

export const CROCHES_PAR_MESURE = 6;
export const MESURES = GRILLE.length;
export const LONGUEUR = MESURES * CROCHES_PAR_MESURE;

/* La partition « compilée » : pour chaque croche du morceau, ce qui commence
   à cet instant (mélodie, accord de la mesure). */
export const PARTITION = (() => {
  const pas = Array.from({ length: LONGUEUR }, () => ({ melodie: [], accord: null }));
  [...A, ...B].forEach((mesure, m) => {
    let c = 0;
    for (const [nom, duree] of mesure) {
      pas[m * CROCHES_PAR_MESURE + c].melodie.push({ note: midi(nom), duree });
      c += duree;
    }
    if (c !== CROCHES_PAR_MESURE) throw new Error(`mesure ${m + 1} : ${c} croches au lieu de 6`);
    const a = ACCORDS[GRILLE[m]];
    pas[m * CROCHES_PAR_MESURE].accord = { basse: midi(a.basse), notes: a.notes.map(midi) };
  });
  return pas;
})();

/* Tempo (noires par minute) selon l'endroit. */
export const TEMPO = { titre: 84, 0: 104, 1: 116, 2: 92 };
