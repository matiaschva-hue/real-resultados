# REAL · datos de resultados

Datos que usa la app https://real2026.web.app/resultados/index.html.
`actualizar.mjs` lee Flashscore y LarrySport (AHBA) y escribe `data/<domingo>.json` + `data/index.json`.
La tarea `.github/workflows/actualizar.yml` lo corre sola (vie–dom cada hora, lunes cada 2 h) y guarda los cambios.
Para correrla a mano: pestaña Actions → "Actualizar resultados" → Run workflow.
