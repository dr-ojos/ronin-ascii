# Ronin ASCII

Un samurái sin señor, un mundo abierto bajo la luna, guaridas de onis, patrullas, emboscadas y cofres que encuentras mientras exploras, todo dibujado con caracteres ASCII.
**Jugar:** https://dr-ojos.github.io/ronin-ascii/

Hecho con [three.js](https://threejs.org), TypeScript y [Vite](https://vite.dev).

## Comandos

```bash
npm install        # la primera vez
npm run dev        # servidor de desarrollo con recarga instantánea (http://localhost:5173)
npm run typecheck  # comprobar tipos sin compilar
npm run build      # comprobar tipos + versión final en dist/
npm run preview    # servir dist/ para probarla
```

## Estructura

- `index.html`: página, HUD y estilos.
- `src/main.ts`: punto de entrada y bucle de frames.
- `src/`: un módulo por responsabilidad (`ascii.ts` efecto ASCII, `world.ts` escenario,
  `player.ts` movimiento y ataques, `enemy-ai.ts` onis, `encounters.ts` guaridas, patrullas y emboscadas, `loot.ts` cofres y botín, `upgrades.ts` mejoras, `special.ts` golpe de rayos, `score.ts` puntos y mon, `hud.ts` interfaz...).
- Tienda y aspecto: `shop.ts` la tienda de Masa dentro del santuario del inicio (se entra por la puerta; el tejado se oculta),
  `weapons.ts` armas (cada una con su color, halo, estela y chispas en `katana-fx.ts`), `armor.ts` armaduras (`outfit.ts` las viste: peto, hombreras, casco y auras), `menu.ts` menús, `custom.ts` + `look.ts` personalizar al ronin (se guarda en el navegador).
  `state.ts` guarda el estado compartido y `types.ts` los tipos comunes.
- `src/samurai.ts` y `src/rig.ts`: personajes (procedural y con esqueleto de mocap); `nature.ts`: paisaje; `audio.ts`: sonido.
- Mundo abierto (~1,4 km de lado, cerrado por montañas):
  - `map.ts`: el plano (lugares, caminos, lago, río y puentes, biomas del bosque, máscaras de hierba).
  - `terrain.ts`: relieve (colinas, explanadas bajo cada lugar, cuenca del lago, montañas del borde).
  - `structures.ts`: aldea, castillo, pagoda, senda de los mil torii, campamento, cementerio, puentes y farolillos.
  - `landmarks.ts`: guaridas de onis (hoguera, tiendas, estandartes) y rincones de las tierras salvajes
    (hokoras, jizos, torii caídos, árboles sagrados, círculos de piedra, ruinas, campos de batalla).
  - `water.ts`: el río se puede vadear (te hundes hasta las rodillas y vas más lento) y el agua hace
    ondas allí donde la tocan pies, esquivas, tajos u onis que caen.
  - `chunks.ts`: el bosque se genera por zonas al acercarse y se descarta al alejarse (con semilla fija).
  - `lights.ts`: unas pocas luces reales se reparten cada frame entre los farolillos más cercanos.
  - `physics.ts`: colisiones en una rejilla espacial; `minimap.ts`: minimapa y mapa del mundo en ASCII.

## Controles

WASD moverse · SHIFT correr · clic / K tajo · L giro pesado · ESPACIO esquivar · E o tajo abrir cofre · E en el mostrador de Masa: tienda · Q cambiar de arma · P rayo · N mapa del mundo ·
C paleta · T vista sin ASCII · F modo foto · R lluvia · M sonido · + / - densidad de caracteres.
- `public/`: modelos 3D y sonidos, copiados tal cual a `dist/`.
