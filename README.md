# Type & Run: La Torre de los Hechizos (MVP)

Roguelike de mecanografía para navegador. TypeScript + Vite, sin motor (HTML/CSS).

Hecho por **Glicht** — [github.com/tipoxd](https://github.com/tipoxd) · [glicht.vercel.app](https://glicht.vercel.app) · Jugar: https://type-and-run.vercel.app

Tema: un mago defiende su torre de monstruos escribiendo hechizos. Daño = Poder × Magia (× los amuletos de ×Magia × la racha 🔥).
En el código algunos nombres internos siguen siendo los del GDD original (daemons = amuletos, bits = oro, bytes = poder, mult = magia, overclock = racha, fragments = cristales).

## Arrancar
1. `npm install`
2. `npm run dev` → abre http://localhost:5173
3. `npm run sim` → simulador de balance (`npm run sim -- 500` para más runs)
4. `npm run build` → versión final en `dist/`

## Dónde está cada cosa
- `src/core/` — reglas puras (sin DOM): fórmula (`scoring.ts`), combate (`combat.ts`), run/tienda/Fragmentos (`run.ts`), Daemons (`daemons.ts`), jefes/Kernels/mejoras (`content.ts`)
- `src/data/words.ts` — diccionario
- `src/ui/` — pantallas (combate, tienda, cartas, sonido) y consejos del tutorial (`tips.ts`)
- `src/ui/shop3d.ts` — fondo 3D de la tienda con Three.js (cristales, polvo, bloom) y una capa 3D transparente encima para las monedas y chispas. Se carga aparte solo en la tienda
- `src/ui/fxgl.ts` — capa de efectos con PixiJS (WebGL): estrellas, resplandor, partículas, rayo, ondas expansivas. Se carga aparte solo en combate; si no hay WebGL o activas "Reducir efectos", se usan los efectos HTML de `juice.ts`
- `src/storage/storage.ts` — guardado (hoy localStorage)
- `sim/simulate.ts` — bot que juega miles de runs con la misma lógica

## Pasar a base de datos
Todo el guardado pasa por la interfaz `SaveBackend`. Ya hay un `ApiBackend` de ejemplo:
cambia una línea en `src/main.ts` (`new LocalStorageBackend()` → `new ApiBackend(url, token)`).
Recomendado: Supabase (PostgreSQL + login) o Node + PostgreSQL.
Cuando haya ranking o semilla diaria, el servidor debe validar resultados y Fragmentos.

## Cambios de balance respecto al GDD (según el simulador)
- Cuotas del GDD (600 / 1.500 / 4.000)
- Margen para leer la palabra: 2,5 s a 40 WPM (el GDD decía 1,5 s), escala con tu velocidad; primer monstruo al segundo 1
- Un enemigo herido que no muere retrocede hasta un 50% del camino según el daño
- Todo esto está en `BALANCE` (`src/core/combat.ts`)

## Velocidad de los monstruos
Va a la velocidad de tu prueba (⚡) × el ajuste de Opciones (Muy lento … Muy rápido).
Ya no se recalcula sola con cada partida: antes usaba la media de tus últimas 3 partidas
medida solo mientras tecleabas, y salía inflada, así que cada partida iba más rápida.
`npx tsx sim/wpmcheck.ts` compara la velocidad real con la que mide el juego.
