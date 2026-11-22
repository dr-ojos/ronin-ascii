#!/bin/zsh
# Arranca Ronin ASCII desde el código: levanta el servidor de Vite en el puerto 5181 (si no está ya
# en marcha) y abre el juego en el navegador. El icono del escritorio usa en cambio su propia copia.
DIR="${0:A:h:h}"
PORT=5181
URL="http://localhost:$PORT/"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$DIR" || exit 1

if ! curl -s -o /dev/null "$URL"; then
  [[ -d node_modules ]] || npm install
  nohup npx vite --port $PORT --strictPort >/tmp/ronin-ascii-servidor.log 2>&1 &
  for i in {1..60}; do curl -s -o /dev/null "$URL" && break; sleep 0.25; done
  if ! curl -s -o /dev/null "$URL"; then
    osascript -e 'display alert "Ronin ASCII" message "No se pudo arrancar el servidor del juego. Mira /tmp/ronin-ascii-servidor.log"'
    exit 1
  fi
fi
open "$URL"
