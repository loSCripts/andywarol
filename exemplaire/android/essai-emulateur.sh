#!/usr/bin/env bash
# Essai automatique d'EXEMPLAIRE sur un émulateur Android (lancé par GitHub Actions).
# On lance l'appli, on touche « PRODUIRE UN EXEMPLAIRE », on signe le contrat, on saute,
# on s'imprime, et on vérifie qu'il n'y a eu ni plantage ni erreur JavaScript.
# Des captures d'écran sont gardées dans captures/.
# Usage : bash essai-emulateur.sh exemplaire.apk
set -euo pipefail
APK="$1"
P=io.github.loscripts.exemplaire
mkdir -p captures

capture() { adb exec-out screencap -p > "captures/$1.png" || true; }

# Centre de l'élément dont le texte est donné (le contenu de la WebView est
# exposé à l'accessibilité, donc lisible par uiautomator)
trouver() {
  adb shell uiautomator dump /sdcard/ecran.xml >/dev/null 2>&1 || return 1
  adb pull /sdcard/ecran.xml ecran.xml >/dev/null 2>&1 || return 1
  python3 -c '
import re, sys, xml.etree.ElementTree as ET
for n in ET.parse("ecran.xml").iter("node"):
    t = (n.get("text") or "") + (n.get("content-desc") or "")
    if sys.argv[1].casefold() in t.casefold():
        x1, y1, x2, y2 = map(int, re.findall(r"\d+", n.get("bounds")))
        print((x1 + x2) // 2, (y1 + y2) // 2)
        sys.exit(0)
sys.exit(1)
' "$1"
}

taille=$(adb shell wm size | grep -oE '[0-9]+x[0-9]+' | tail -n 1)
L=${taille%x*}
H=${taille#*x}

# Touche le texte s'il est trouvé, sinon la position de secours (en fractions de l'écran)
toucher() {
  local xy
  if xy=$(trouver "$1"); then echo "On touche « $1 » ($xy)"; adb shell input tap $xy
  else echo "« $1 » introuvable, on touche à la position prévue"; adb shell input tap $(( L * $2 / 100 )) $(( H * $3 / 100 )); fi
}

adb install -r "$APK"
adb logcat -G 16M || true
adb logcat -c
adb shell am start -W -n $P/.Ecran
# Le rendu WebGL est logiciel sur l'émulateur : on laisse le temps
sleep 25
capture 1-titre
toucher "PRODUIRE UN EXEMPLAIRE" 50 62
sleep 6
capture 2-contrat
toucher "SIGNER" 50 85
sleep 10
capture 3-jeu
# Fronde : tirer vers le bas-gauche, lâcher
adb shell input swipe $(( L / 2 )) $(( H * 60 / 100 )) $(( L * 40 / 100 )) $(( H * 72 / 100 )) 600
sleep 1
capture 4-saut
toucher "IMPRIMER" 84 90
sleep 12
capture 5-imprime
adb shell input keyevent KEYCODE_BACK
sleep 3
capture 6-retour

echo "===== Console du jeu ====="
adb logcat -d | grep -E "chromium.*CONSOLE|Console" | tail -n 40 || true

echo "===== Vérifications ====="
echec=0
if ! adb shell pidof $P >/dev/null; then echo "L'appli n'est plus en vie."; echec=1; fi
if adb logcat -d | grep -A 20 "FATAL EXCEPTION" | grep -q "$P"; then
  adb logcat -d | grep -A 30 "FATAL EXCEPTION"
  echo "L'appli a planté."
  echec=1
fi
if adb logcat -d | grep -E "CONSOLE" | grep -qiE "Uncaught|TypeError|ReferenceError|SyntaxError"; then
  echo "Erreur JavaScript dans le jeu."
  echec=1
fi
exit $echec
