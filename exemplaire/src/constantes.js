/* Toutes les mesures sont en mètres et en secondes.
   Le monde est l'intérieur d'une boîte de conserve : le joueur se déplace sur
   un cercle de rayon R (abscisse curviligne s) et en hauteur (y). La physique
   est donc en 2D (s, y) enroulée, le rendu en 3D. */

export const R = 9;                    // rayon du chemin où marchent joueur et statues
export const C = 2 * Math.PI * R;      // circonférence du chemin (≈ 56,5 m)
export const R_MUR = 10.6;             // paroi intérieure de la boîte
export const R_INT = 7.9;              // bord intérieur des corniches
export const HAUT_BOITE = 156;         // hauteur de la paroi
export const Y_GLOIRE = 148;           // franchir cette hauteur = sortir de la boîte

export const G = 24;                   // pesanteur volontairement forte : sauts secs
export const V_MAX = 14;               // vitesse de lancement maximale → 4,08 m de haut
export const BOOST_BOUCHE = 9;         // ajouté à la vitesse verticale sur une bouche de vapeur active
export const H_SAUT_MAX = (V_MAX * V_MAX) / (2 * G);

export const J_DEMI = 0.3;             // demi-largeur du joueur
export const J_HAUT = 1.6;
export const S_DEMI = 0.5;             // demi-largeur d'une statue (un peu large : atterrir sur une tête doit rester faisable)
export const S_HAUT = 1.45;

export const PAS_PHYSIQUE = 1 / 120;

/* La soupe monte de plus en plus vite. Rattrapage : si le joueur la distance
   de plus de 30 m (grâce aux corps des autres), elle accélère pour garder la
   pression jusqu'en haut. */
export const SOUPE_DEPART = -3;
export const SOUPE_DELAI = 3;
export const SOUPE_V0 = 0.26;
export const SOUPE_ACC = 0.0032;
export const SOUPE_RATTRAPAGE = 0.025;

/* Durée de vie d'un corps sur le serveur, rappelée ici pour l'affichage hors ligne. */
export const VIE_STATUE_H = 48;
export const BONUS_ACHAT_H = 12;

/* Liste fermée des derniers mots : le serveur refuse tout le reste.
   Une liste fermée évite d'avoir à modérer du texte libre gravé sur des cadavres. */
export const MOTS = [
  'encore', 'pardon', 'maman', 'monte', 'pour toi', "j'avais froid",
  'achetez-moi', 'rien', "c'était beau", 'trop tôt', 'regarde', 'merci',
  'pas moi', 'presque', 'ça brûle', 'souris', 'la suite', 'je reste',
  'vendu', 'à qui le tour',
];

export const POSES = ['debout', 'accroupi', 'envol', 'sommet', 'chute', 'cri'];
