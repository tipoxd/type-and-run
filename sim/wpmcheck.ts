// Comprueba que la velocidad que mide el juego se parece a la real.
// Bot "humano": escribe a X WPM (contando el espacio) y tarda 0,6 s en leer cada palabra nueva.
import { Sector } from '../src/core/combat';
import { createRun, completeSector, continueFromShop, runWpm } from '../src/core/run';
for (const wpm of [30, 40, 60, 80]) {
  const run = createRun({ kernel: 'base', wpmCal: wpm, upgrades: {}, seed: 3 });
  const cps = (wpm * 5) / 60;
  let typedChars = 0;
  let clock = 0;
  for (let k = 0; k < 3; k++) {
    const s = new Sector(run);
    let budget = 0;
    let wait = 0;
    let readDone = false;
    while (!s.finished) {
      s.update(0.02);
      clock += 0.02;
      if (wait > 0) { wait -= 0.02; continue; }
      if (!s.target) {
        const t = s.alive().sort((a, b) => b.progress - a.progress)[0];
        if (!t) continue;
        if (!readDone) { wait = 0.6 + 1 / cps; readDone = true; continue; } // espacio + leer
      }
      budget += 0.02 * cps;
      while (budget >= 1 && !s.finished) {
        budget--;
        const t = s.target ?? s.alive().sort((a, b) => b.progress - a.progress)[0];
        if (!t) break;
        s.key(t.word[t.typed]);
        typedChars++;
        if (!s.target) { readDone = false; typedChars++; break; } // palabra terminada (+ espacio)
      }
      s.drainEvents();
    }
    if (s.failed) break;
    completeSector(run);
    continueFromShop(run);
  }
  console.log(`jugador de ${wpm} WPM -> el juego mide ${runWpm(run).toFixed(0)} WPM`);
}
