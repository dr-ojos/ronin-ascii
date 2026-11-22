# Ronin ASCII

Un samurái sin señor, un mundo abierto bajo la luna y oleadas de onis, todo dibujado con caracteres ASCII.
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
  `player.ts` movimiento y ataques, `enemy-ai.ts` onis, `waves.ts` oleadas, `hud.ts` interfaz...).
  `state.ts` guarda el estado compartido y `types.ts` los tipos comunes.
- `src/samurai.ts` y `src/rig.ts`: personajes (procedural y con esqueleto de mocap); `nature.ts`: paisaje; `audio.ts`: sonido.
- Mundo abierto (~1,4 km de lado, cerrado por montañas):
  - `map.ts`: el plano (lugares, caminos, lago, río y puentes, biomas del bosque, máscaras de hierba).
  - `terrain.ts`: relieve (colinas, explanadas bajo cada lugar, cuenca del lago, montañas del borde).
  - `structures.ts`: aldea, castillo, pagoda, senda de los mil torii, campamento, cementerio, puentes y farolillos.
  - `chunks.ts`: el bosque se genera por zonas al acercarse y se descarta al alejarse (con semilla fija).
  - `lights.ts`: unas pocas luces reales se reparten cada frame entre los farolillos más cercanos.
  - `physics.ts`: colisiones en una rejilla espacial; `minimap.ts`: minimapa y mapa del mundo en ASCII.

## Controles

WASD moverse · SHIFT correr · clic / K tajo · L giro pesado · ESPACIO esquivar · N mapa del mundo ·
C paleta · T vista sin ASCII · F modo foto · R lluvia · M sonido · + / - densidad de caracteres.
- `public/`: modelos 3D y sonidos, copiados tal cual a `dist/`.
