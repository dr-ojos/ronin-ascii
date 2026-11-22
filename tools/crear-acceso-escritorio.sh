#!/bin/zsh
# Crea "Ronin ASCII.app" en el escritorio: un icono que abre el juego.
# macOS no deja que una app abierta desde el Finder lea ~/Documents, así que la app lleva dentro
# su propia copia del juego compilado (dist/) y la sirve en http://localhost:5180.
# Vuelve a ejecutar este script para meter en el icono la última versión del juego.
set -e
DIR="${0:A:h:h}"
APP="$HOME/Desktop/Ronin ASCII.app"
TMP="$(mktemp -d)"

# versión final del juego
(cd "$DIR" && npm run build >/dev/null)

# icono: PNG dibujado con Swift -> todas las resoluciones -> .icns
swift "$DIR/tools/icono.swift" "$TMP/icono.png" >/dev/null
mkdir -p "$TMP/icono.iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s "$TMP/icono.png" --out "$TMP/icono.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$TMP/icono.png" --out "$TMP/icono.iconset/icon_${s}x${s}@2x.png" >/dev/null
done

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
iconutil -c icns "$TMP/icono.iconset" -o "$APP/Contents/Resources/icon.icns"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Ronin ASCII</string>
  <key>CFBundleDisplayName</key><string>Ronin ASCII</string>
  <key>CFBundleIdentifier</key><string>local.ronin-ascii</string>
  <key>CFBundleExecutable</key><string>ronin-ascii</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSArchitecturePriority</key><array><string>arm64</string><string>x86_64</string></array>
</dict>
</plist>
PLIST
cp -R "$DIR/dist" "$APP/Contents/Resources/juego"
cat > "$APP/Contents/MacOS/ronin-ascii" <<'SH'
#!/bin/zsh
# Creado por tools/crear-acceso-escritorio.sh: sirve el juego que va dentro de la app y lo abre.
JUEGO="${0:A:h:h}/Resources/juego"
URL="http://localhost:5180/"
# un script lanzado desde el Finder puede acabar bajo Rosetta: python3 debe ir en la arquitectura nativa
PY=(/usr/bin/python3)
[[ "$(sysctl -n hw.optional.arm64 2>/dev/null)" == 1 ]] && PY=(arch -arm64 /usr/bin/python3)
if ! curl -s "$URL" | grep -q "Ronin ASCII"; then
  nohup $PY -m http.server 5180 --bind 127.0.0.1 --directory "$JUEGO" >/tmp/ronin-ascii.log 2>&1 &
  for i in {1..40}; do curl -s -o /dev/null "$URL" && break; sleep 0.25; done
fi
if curl -s "$URL" | grep -q "Ronin ASCII"; then open "$URL"
else osascript -e 'display alert "Ronin ASCII" message "No se pudo abrir el juego (¿el puerto 5180 está ocupado?). Mira /tmp/ronin-ascii.log"'; fi
SH
chmod +x "$APP/Contents/MacOS/ronin-ascii"
touch "$APP"   # que el Finder refresque el icono
rm -rf "$TMP"
echo "Creado: $APP"
