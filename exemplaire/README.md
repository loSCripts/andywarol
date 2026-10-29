# EXEMPLAIRE

> Tu es l'exemplaire n° 48 214. La soupe monte. Ton corps sera la marche du suivant.

Un jeu 3D pour téléphone : on grimpe à l'intérieur d'une boîte de conserve géante pendant que la soupe monte. Arrivé au **Vide** (à 90 m), les marches sont trop espacées pour un saut : on ne passe que sur les **corps des autres joueurs**.

Pour faire une marche, on saute, puis on appuie sur **IMPRIMER** en plein vol : on se fige, et ce corps reste dans la boîte **pour tout le monde**, 48 heures. Ensuite il est recyclé, sauf si quelqu'un l'**achète** (+12 h par achat). Celui qui sort de la boîte devient **célèbre pendant 15 minutes** : son nom brille en haut de la boîte chez tous les joueurs. Chacun son tour, il y a une file d'attente.

## Ce qui dérange (exprès)

- **Ta mort est utile, ou elle ne sert à rien.** Mort dans la soupe : « RECYCLÉ. Il n'a servi à rien. » Mort imprimée : ta dernière pose devient une marche pour des inconnus.
- **Tu es un numéro.** Chaque partie fabrique un nouvel exemplaire, numéroté par le serveur. Le bouton pour rejouer s'appelle « SUIVANT ».
- **Le corps devient une marchandise.** Chaque corps a son étiquette de musée : heure de la mort, **niveau de batterie du téléphone** au moment de mourir, dernier mot. On peut l'acheter pour qu'il reste debout. Pas le sien.
- **Personne ne finit seul.** Le Vide est infranchissable sans les corps des autres : un test automatique le vérifie.
- **La gloire est une file d'attente.** Quinze minutes, puis tout le monde oublie.
- **Ingrédients de la soupe** : il faut monter jusqu'à 113 m, sur les corps des fondateurs, pour les lire, sur la paroi.

Le rendu imite la **sérigraphie pop art** : quatre encres par image, trame de points dans les ombres, plaque noire mal calée. À la mort, l'écran se tire comme une planche de quatre portraits du cadavre, chacun dans une autre palette.

## Deux modes

Sur l'écran titre, on choisit :

- **EN LIGNE** — le monde partagé. Tes corps servent de marche à tous les joueurs, et tu montes sur les leurs. Numéros d'exemplaire, achats et gloire passent par le serveur.
- **SEUL** — sans serveur, aucun échange réseau. Tes corps restent sur ton téléphone et ne servent qu'à toi (et à tes exemplaires suivants). Personne ne voit ta gloire.

Les deux mondes sont séparés : un corps imprimé dans un mode n'apparaît jamais dans l'autre. Chaque exemplaire tombe de la presse sur la corniche la plus basse, à 1,2 m.

## Les obstacles

La Chaîne (0–40 m) et L'Atelier (40–89 m) ne sont plus une suite de corniches : on y apprend un élément après l'autre.

- **La presse** s'abat sur une corniche. Elle prévient : elle tremble et son voyant rouge s'allume une demi-seconde avant de tomber. Rester dessous, c'est « ÉCRASÉ ».
- **La chaîne** fait le tour de la boîte à trois hauteurs (17, 33 et 62 m) : des exemplaires suspendus par les pieds défilent et font tomber ceux qu'ils touchent.
- **Le balancier** : un exemplaire pendu se balance au-dessus d'un écart entre deux corniches.
- Tapis roulants, plateformes mobiles, plateformes fragiles et une bouche de vapeur dès La Chaîne.

Le Vide ne change pas : c'est la communauté qui le construit.

## La musique

Une valse mécanique en la mineur, composée note à note (`src/musique.js`) : deux thèmes de 8 mesures, une basse « oum-pa-pa », des percussions d'usine. Elle change avec l'endroit : berceuse lente à l'écran titre, valse avec basse et percussions dans La Chaîne, accords et coups de tôle dans L'Atelier, mélodie seule une octave plus haut avec un écho calé sur le tempo dans Le Vide. Quand la soupe approche, le tempo monte jusqu'à une fois et demie.

## L'appli des développeurs

**EXEMPLAIRE DEV** (`exemplaire-dev.apk` dans Releases, ou `?dev=1` sur le site) s'installe à côté du jeu, avec sa propre icône. Elle n'envoie rien au serveur et garde ses corps à part. Pendant la partie, une barre d'outils :

- **Téléportation** : départ, 15, 30, 45, 60, 75 m, le Vide, sa 4e marche, le bord.
- **VOL** : vol libre, on déplace l'exemplaire du doigt à travers tout.
- **SOUPE** : arrêter ou relancer la soupe.
- **INVINCIBLE** (actif au départ) : ni noyade ni presse.
- **COMMUNAUTÉ** : pose des corps simulés sur tous les écarts du Vide, pour monter jusqu'au bord et voir l'écran de gloire.
- **INFOS** : position, zone, images par seconde, appels de dessin, triangles.

## Jouer

- **Toucher, tirer en arrière, lâcher** : on saute (comme une fronde). La trajectoire s'affiche.
- **IMPRIMER** : on se fige. Le bouton devient turquoise et affiche « MARCHE ✓ » quand le corps ferait une marche atteignable.
- **Toucher un corps** : son étiquette, et le bouton pour l'acheter.
- Sur ordinateur : la souris pour la fronde, Espace pour imprimer, Échap pour la pause.

## Où le trouver

- **Site** : https://loscripts.github.io/andywarol/jeu/ (en ligne dès que cette branche est fusionnée dans `main`, voir « Le site »).
- **APK Android** : page « Releases » du dépôt (`exemplaire-N`), fabriquée et essayée sur un téléphone virtuel par GitHub Actions (`.github/workflows/exemplaire.yml`). Toucher `exemplaire.apk`, puis ouvrir le fichier pour l'installer. Le mode SEUL marche sans réseau. `exemplaire-dev.apk` est l'appli des développeurs.

L'essai sur téléphone virtuel lance chaque appli en mode essai (`--ez essai true`, ou `?essai=1` sur le site) ; elle joue seule, sans réseau, et écrit `ESSAI OK` dans le journal Android, sinon `ESSAI ÉCHEC` et la raison.

- Le jeu : deux corps en mode SEUL, un en ligne, les deux mondes restent séparés, chaque exemplaire part de la corniche la plus basse, l'écran SUIVANT apparaît après chaque impression, une presse écrase (écran « ÉCRASÉ »), une noyade.
- L'appli des développeurs : toutes les téléportations sans mourir, l'invincibilité sous une presse, le vol libre, la communauté simulée, puis le bord et l'écran de gloire.

## Comment c'est fait

Tout est fabriqué par le code : **aucune image, aucun modèle, aucun son à télécharger**, donc aucune licence à vérifier. Les deux polices (Anton et Courier Prime) sont sous licence libre OFL et embarquées.

| Fichier | Rôle |
|---|---|
| `src/niveau.js` | Le niveau, identique pour tous (graine fixe) : 3 zones, corniches fixes, tapis roulants, plateformes mobiles, fragiles, bouches de vapeur, inscriptions sur la paroi, les fondateurs (premiers corps). |
| `src/physique.js` | Physique 2D enroulée sur le cylindre, sans dépendance au rendu (elle tourne aussi dans les tests). |
| `src/modeles.js` | Les modèles 3D : mannequin articulé (7 poses), corniches courbes, paroi nervurée, presse, couvercle arraché, petites boîtes, inscriptions. |
| `src/rendu.js` | Le rendu sérigraphie : la scène est rendue en « numéros d'encre » dans une petite texture, puis une seule passe imprime l'image (palettes, trame, contours, décalage). Qualité ajustée selon la vitesse du téléphone. |
| `src/jeu.js` | La partie : joueur, corps instanciés (un seul appel de dessin par pose), soupe, caméra, fins. |
| `src/musique.js` | La partition de la valse (mélodie, accords), écrite note à note. |
| `src/son.js` | Sons synthétisés et séquenceur de la musique : boîte à musique, basse, percussions d'usine, écho, réverbération de boîte métallique. |
| `src/reseau.js` | Échanges avec le serveur, avec repli hors ligne. |
| `serveur/schema.sql` | Le serveur (Supabase), puis `serveur/migrations/` dans l'ordre. |
| `android/` | L'appli Android : un écran WebView qui sert le jeu depuis l'APK. |

## Le serveur

**Une version du niveau, un monde.** Chaque corps garde le numéro du niveau où il a été imprimé (`niveau`, actuellement 2 : celui des obstacles). Un corps posé dans une autre version du niveau flotterait dans le vide : le jeu ne demande donc que les corps de sa version (`statues_du_niveau`, `imprimer_dans`). Les anciennes appli (1.4, 1.5) restent dans le monde du niveau 1 ; rien n'a été supprimé (`serveur/migrations/002_versions_du_niveau.sql`).

Projet Supabase **exemplaire** (`yvrhwdkakdcorotnteho`, Paris). Les tables sont fermées : tout passe par 9 fonctions qui vérifient ce que le jeu envoie.

- `nouvel_exemplaire` : donne un numéro (15 par minute au plus par appareil).
- `imprimer` : enregistre un corps. Refuse une hauteur impossible pour le temps écoulé (plus de 4,5 m/s de moyenne), un exemplaire déjà mort ou d'un autre appareil, plus d'un corps toutes les 15 s.
- `signer` : change le dernier mot, une fois, dans les 5 minutes. Les mots viennent d'une **liste fermée** : pas de texte libre gravé sur les corps, donc rien à modérer.
- `acheter` : +12 h d'exposition (30 jours au plus), une fois par appareil, jamais son propre corps.
- `revendiquer_gloire` : 15 minutes de gloire, dans une file d'attente. Refusé si la montée a pris moins de 33 s.
- `recycler`, `etat`, `statues_vivantes`, `galerie` : le registre et la lecture du monde.

Le conseiller de sécurité de Supabase signale que ces fonctions sont appelables sans compte : c'est voulu, ce sont elles l'interface publique. Les tables, elles, ne sont pas lisibles.

Le jeu tourne chez le joueur : on ne peut pas tout prouver côté serveur. Les vérifications refusent ce qui est physiquement impossible et limitent la cadence ; un tricheur patient pourrait encore poser un corps « honnête » mais placé n'importe où.

## Le site

Le dépôt publie déjà sa branche `main` sur GitHub Pages. Le jeu construit est rangé dans le dossier `jeu/` à la racine du dépôt : une fois cette branche fusionnée dans `main`, il est en ligne à **https://loscripts.github.io/andywarol/jeu/**. Il s'installe comme une appli (manifeste + service worker) et marche hors ligne une fois chargé.

Après une modification du jeu : `npm run site` (reconstruit `../jeu`), puis on enregistre le dossier `jeu/` avec le reste.

## Construire soi-même

```bash
cd exemplaire
npm ci
npm test            # physique et niveau : accessible avec les corps, infranchissable sans
npm run build       # le site dans dist/ (l'APK l'embarque)
npm run site        # le site dans ../jeu/ (publié par GitHub Pages)
npm run dev         # pour développer

# APK (Java 17, SDK Android avec la plateforme 37, Gradle 9.6.1) : le jeu et l'appli des développeurs
gradle -p android assembleJeuRelease assembleDevRelease
```

Pour réinstaller le serveur sur un autre projet Supabase : exécuter `serveur/schema.sql` puis les fichiers de `serveur/migrations/` dans l'ordre, puis changer l'adresse et la clé publique dans `src/reglages.js`. `serveur/essais.sql` contient les essais du serveur (à jouer sur une base de test, jamais en production).
