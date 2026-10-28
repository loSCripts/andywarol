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

## Jouer

- **Toucher, tirer en arrière, lâcher** : on saute (comme une fronde). La trajectoire s'affiche.
- **IMPRIMER** : on se fige. Le bouton devient turquoise et affiche « MARCHE ✓ » quand le corps ferait une marche atteignable.
- **Toucher un corps** : son étiquette, et le bouton pour l'acheter.
- Sur ordinateur : la souris pour la fronde, Espace pour imprimer, Échap pour la pause.

## Où le trouver

- **Site** : voir plus bas « Le site ».
- **APK Android** : page « Releases » du dépôt (`exemplaire-N`), fabriquée et essayée sur un téléphone virtuel par GitHub Actions (`.github/workflows/exemplaire.yml`). Toucher `exemplaire.apk`, puis ouvrir le fichier pour l'installer. Elle fonctionne aussi sans réseau (tes corps ne servent alors qu'à toi).

## Comment c'est fait

Tout est fabriqué par le code : **aucune image, aucun modèle, aucun son à télécharger**, donc aucune licence à vérifier. Les deux polices (Anton et Courier Prime) sont sous licence libre OFL et embarquées.

| Fichier | Rôle |
|---|---|
| `src/niveau.js` | Le niveau, identique pour tous (graine fixe) : 3 zones, corniches fixes, tapis roulants, plateformes mobiles, fragiles, bouches de vapeur, inscriptions sur la paroi, les fondateurs (premiers corps). |
| `src/physique.js` | Physique 2D enroulée sur le cylindre, sans dépendance au rendu (elle tourne aussi dans les tests). |
| `src/modeles.js` | Les modèles 3D : mannequin articulé (7 poses), corniches courbes, paroi nervurée, presse, couvercle arraché, petites boîtes, inscriptions. |
| `src/rendu.js` | Le rendu sérigraphie : la scène est rendue en « numéros d'encre » dans une petite texture, puis une seule passe imprime l'image (palettes, trame, contours, décalage). Qualité ajustée selon la vitesse du téléphone. |
| `src/jeu.js` | La partie : joueur, corps instanciés (un seul appel de dessin par pose), soupe, caméra, fins. |
| `src/son.js` | Sons synthétisés : bourdon d'usine, horloge qui accélère quand la soupe approche, boîte à musique, réverbération de boîte métallique. |
| `src/reseau.js` | Échanges avec le serveur, avec repli hors ligne. |
| `serveur/schema.sql` | Le serveur (Supabase). |
| `android/` | L'appli Android : un écran WebView qui sert le jeu depuis l'APK. |

## Le serveur

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

Hébergé sur Vercel, construit depuis ce dossier (`npm run build`, sortie `dist/`). Il s'installe comme une appli (manifeste + service worker) et marche hors ligne une fois chargé.

## Construire soi-même

```bash
cd exemplaire
npm ci
npm test            # physique et niveau : accessible avec les corps, infranchissable sans
npm run build       # le site dans dist/
npm run dev         # pour développer

# APK (Java 17, SDK Android avec la plateforme 37, Gradle 9.6.1)
gradle -p android assembleRelease
```

Pour réinstaller le serveur sur un autre projet Supabase : exécuter `serveur/schema.sql`, puis changer l'adresse et la clé publique dans `src/reglages.js`. `serveur/essais.sql` contient les essais du serveur (à jouer sur une base de test, jamais en production).
