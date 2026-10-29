#!/usr/bin/env bash
# Essai automatique d'EXEMPLAIRE sur un émulateur Android (lancé par GitHub Actions).
# L'appli est lancée en mode essai : le jeu joue tout seul une séquence complète
# avec ses vraies fonctions (trois impressions de suite, une noyade), sans réseau,
# et écrit chaque étape dans le journal Android. On vérifie que la séquence va au
# bout (ESSAI OK), sans plantage ni erreur JavaScript. Captures dans captures/.
# Usage : bash essai-emulateur.sh exemplaire.apk [nom.du.paquet]
set -euo pipefail
APK="$1"
P="${2:-io.github.loscripts.exemplaire}"
mkdir -p captures

capture() { adb exec-out screencap -p > "captures/${P##*.}-$1.png" || true; }

adb install -r "$APK"
# Sans réseau : l'essai ne doit jamais toucher le vrai serveur (le jeu coupe
# aussi lui-même ses échanges en mode essai)
adb shell svc wifi disable || true
adb shell svc data disable || true
adb logcat -G 16M || true
adb logcat -c

# Nom complet de l'activité : l'appli des développeurs a un paquet en « .dev »,
# mais la classe reste dans io.github.loscripts.exemplaire.
adb shell am start -W -n "$P/io.github.loscripts.exemplaire.Ecran" --ez essai true
# Le rendu WebGL est logiciel sur l'émulateur : la séquence prend une à deux minutes
fini=0
for i in $(seq 1 36); do
  sleep 5
  [ $((i % 3)) -eq 0 ] && capture "essai-$(printf %02d "$i")"
  if adb logcat -d -s Exemplaire:I | grep -qE "ESSAI (OK|ÉCHEC)"; then fini=1; break; fi
done
capture fin

# Bouton retour en pleine partie : le jeu se met en pause, l'appli reste ouverte
adb shell input keyevent KEYCODE_BACK
sleep 3
capture retour

echo "===== Console du jeu ====="
adb logcat -d -s Exemplaire:I | tail -n 60

echo "===== Vérifications ====="
echec=0
journal=$(adb logcat -d -s Exemplaire:I)
if [ "$fini" -ne 1 ]; then echo "La séquence d'essai n'est pas allée au bout (jeu figé ?)."; echec=1; fi
if echo "$journal" | grep -q "ESSAI ÉCHEC"; then echo "$journal" | grep "ESSAI ÉCHEC"; echec=1; fi
if echo "$journal" | grep -E "^.*ERROR" | grep -qiE "Uncaught|TypeError|ReferenceError|SyntaxError|RangeError"; then
  echo "Erreur JavaScript dans le jeu :"
  echo "$journal" | grep -E "ERROR" | head -n 10
  echec=1
fi
if ! adb shell pidof $P >/dev/null; then echo "L'appli n'est plus en vie."; echec=1; fi
if adb logcat -d | grep -A 20 "FATAL EXCEPTION" | grep -q "$P"; then
  adb logcat -d | grep -A 30 "FATAL EXCEPTION"
  echo "L'appli a planté."
  echec=1
fi
[ "$echec" -eq 0 ] && echo "Séquence complète, aucun plantage, aucune erreur JavaScript."
exit $echec
