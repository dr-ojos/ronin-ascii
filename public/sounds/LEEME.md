# Sonidos de Ronin ASCII

Pon aquí los archivos de audio y apúntalos en `manifest.json`. Cualquier hueco que se quede vacío
sigue usando el sonido sintetizado de `audio.js`, así que puedes ir añadiéndolos poco a poco.

## Cómo añadir un sonido

1. Copia el archivo en esta carpeta (puedes usar subcarpetas, p. ej. `sword/slash-01.ogg`).
2. Añade el nombre al hueco correspondiente de `manifest.json`:

   ```json
   "swing": ["sword/slash-01.ogg", "sword/slash-02.ogg", "sword/slash-03.ogg"]
   ```

3. Recarga el juego. En la consola del navegador aparece `[audio] samples: swing×3, …` con lo que se cargó.

Pon **2–4 variantes** por hueco: el juego elige una al azar (nunca la misma dos veces seguidas) y le
cambia un poco el tono, para que los golpes repetidos no suenen idénticos.

**Formato:** `.mp3`, `.m4a` o `.wav` funcionan en todos los navegadores. `.ogg` es más ligero, pero no va
en Safari antiguos. Para golpes cortos, recorta el silencio del principio: cualquier retraso se nota.

## Huecos

| Hueco | Cuándo suena | Qué buscar |
|---|---|---|
| `swing` | Tajos 1 y 2 del combo | Sword whoosh / swish rápido, sin impacto |
| `swingHeavy` | 3.er tajo del combo | Whoosh más largo y grave. Si falta, usa `swing` más grave |
| `dash` | Esquiva | Cloth whoosh / body movement. Si falta, usa `swing` suave |
| `hit` | Tajo que alcanza a un oni | Sword slash flesh / blade impact |
| `hitHeavy` | Golpe giratorio o a varios enemigos | Impacto más gordo. Si falta, usa `hit` más grave |
| `hurt` | El jugador recibe daño | Body punch / impacto sordo (el pitido de oídos se mantiene) |
| `warn` | Un oni prepara su ataque | Growl corto o gruñido creciente |
| `roar` | Rugido de oni | Monster growl / roar |
| `roarBig` | Rugido de jefe | Rugido largo y grave. Si falta, usa `roar` más grave |
| `death` | Muere un oni | Monster death / impacto + caída |
| `deathBig` | Muere un jefe | Igual, más largo. Si falta, usa `death` más grave |
| `taiko` | Inicio de oleada (3 golpes, 6 con jefe) | Un solo golpe de taiko o tambor grave |
| `rain` | Ambiente, tecla R | Loop de lluvia de 30 s o más, sin cortes |
| `wind` | Ambiente continuo | Loop de viento suave |

## Ajustes finos (opcional)

En vez de una lista, un hueco puede ser un objeto con ajustes:

```json
"hit": { "files": ["hit-01.wav", "hit-02.wav"], "gain": 0.8, "wet": 0.3, "pitch": 0.05, "layer": 0.5 }
```

- `gain`: volumen del sample (1 = normal).
- `wet`: cuánta reverb de sala recibe (0–1).
- `pitch`: variación aleatoria de tono, ±5 % con 0.05. Ponlo a 0 para las voces.
- `layer`: cuánto del sonido sintético se mezcla por debajo. En `hit` está a 0.5 y deja solo el golpe
  grave, que da peso. Ponlo a 0 si quieres solo el sample.

## Dónde conseguir sonidos

- **Sonniss GDC Game Audio Bundle** (sonniss.com/gameaudiogdc): gratis, libre de regalías, calidad profesional.
- **OpenGameArt.org**: busca "sword", "katana" o "impact" y filtra por licencia CC0.
- **Kenney.nl**: packs "Impact Sounds" y "RPG Audio", CC0.
- **Freesound.org**: filtra por licencia CC0, o por CC-BY si das crédito.

Anota de dónde sale cada archivo y su licencia en `CREDITOS.md`, por si después publicas el juego.
