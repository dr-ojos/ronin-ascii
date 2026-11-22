# Ronin ASCII

Un samurái sin señor, un claro bajo la luna y oleadas de onis, todo dibujado con caracteres ASCII.
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
- `src/audio.js`, `nature.js`, `rig.js`, `samurai.js`: módulos grandes aún en JavaScript.
- `public/`: modelos 3D y sonidos, copiados tal cual a `dist/`.
