# Repaso

PWA para organizar el estudio universitario cuando trabajás todo el día y estudiás en huecos cortos. No cuenta horas: hace que cada tema vuelva antes de que lo olvides y planifica con tu ritmo real medido.

- Sin backend, sin login. Los datos quedan en el dispositivo (IndexedDB), con exportación e importación en JSON.
- Funciona sin conexión una vez abierta por primera vez.
- Sin notificaciones del sistema. Las alarmas reales salen del calendario del celular, con el archivo .ics que genera la app. Con la app abierta, el cronómetro suena a mitad y al final del bloque.
- Sin puntos, rachas ni medallas.

## Correrla en local

Necesitás Node 18 o más nuevo. No hay dependencias ni paso de compilación.

```bash
npm start
```

Abrí `http://localhost:8080`. Para usar otro puerto:

```bash
PORT=3000 npm start
```

Tests del motor de planificación y del lector de cronogramas:

```bash
npm test
```

## Instalarla en el celular

El celular necesita abrir la app por HTTPS (o `localhost`). Lo más simple es publicar la carpeta tal cual en cualquier hosting estático: GitHub Pages, Netlify, Cloudflare Pages. No hay nada que compilar: se sube el repositorio entero.

**Android (Chrome):** abrí la URL, menú ⋮ → "Agregar a pantalla principal" o "Instalar app". También hay un botón en Ajustes → Instalar cuando el navegador lo ofrece.

**iPhone (Safari):** abrí la URL en Safari, botón Compartir → "Agregar a inicio".

Los datos se guardan por navegador y por dispositivo. Si la instalás en el celular después de usarla en la computadora, pasá los datos con Ajustes → Exportar JSON / Importar JSON.

## Alarmas

Ajustes → "Exportar a calendario (.ics)" genera un evento por cada hueco de las próximas 4 semanas, con alarma 5 minutos antes y el plan si-entonces en la descripción. Abrí el archivo en el celular y elegí el calendario donde importarlo.

El .ics es una foto: si cambiás los huecos, borrá esos eventos y exportá de nuevo. El tema exacto de cada hueco no va en el evento porque se recalcula después de cada sesión.

## Cómo decide la app

| Regla | Valor por defecto (editable en Ajustes) |
|---|---|
| Repaso espaciado | cada 4–6 días |
| Sprint a parcial | se activa solo a 14 días del examen; repaso cada 2–3 días; sin material nuevo los últimos 3 días |
| Mantenimiento | repaso cada 7–10 días, solo preguntas |
| Modo cansado | cansancio 3 o inicio después de las 21:00: solo repaso de 15 min |
| Sesión acertada | 80% o más al primer intento, habiendo acertado cada pregunta una vez |
| Fallo | el tema vuelve al intervalo mínimo |
| Dos sesiones acertadas seguidas | el intervalo se multiplica por 1,5 (tope: el doble del máximo) |
| Tema dominado | acertado en 3 sesiones de días distintos |
| Pretest | 3–5 preguntas sin apunte si pasaron 3 días o más |
| Huecos largos | hasta 25% del tiempo para repasos vencidos, el resto material nuevo |
| Hora límite | 23:00 como máximo |

Orden de la cola en cada hueco: temas vencidos, primero los de materias en sprint, después por cercanía del examen, por fallos recientes y por días de atraso. El material nuevo va solo en huecos largos y lo recibe la materia más apretada (temas pendientes contra horas disponibles a su ritmo).

Ritmo = temas nuevos terminados / horas reales de sesiones de material nuevo, últimas 2 semanas, por materia. La proyección simula los huecos que quedan hasta el examen con ese ritmo. Hasta que termines el primer tema nuevo de una materia no hay proyección.

## Cronogramas

En una materia, "Pegar cronograma" lee el texto renglón por renglón:

- Fechas como `12/3`, `12/03/2026`, `12 de marzo`, `10 al 14 de marzo`, `Semana 4`.
- Reconoce parciales, recuperatorios, finales y entregas; ignora feriados y clases de consulta.
- Pregunta lo que falta: el año, qué día empieza la semana 1, la fecha de un examen que figura sin fecha.
- Muestra todo para revisar antes de guardar. Cada tema queda asociado al parcial que le sigue.

Volver a pegar un cronograma actualiza por título lo que ya existía y agrega lo nuevo; no borra nada. Solo lee texto: de un PDF o una foto, copiá el texto primero.

## Estructura

```
index.html, manifest.webmanifest, sw.js
css/app.css
js/engine.js     motor de planificación (funciones puras)
js/parser.js     lector de cronogramas
js/ics.js        exportación a calendario
js/db.js         IndexedDB, exportar/importar
js/ui/           pantallas: hoy, sesion, materias, cronograma, semana, ritmo, ajustes
tests/           tests de engine, parser e ics
tools/           servidor local y generador de íconos
```

Al cambiar archivos, subí `VERSION` en `sw.js` para que los dispositivos instalados tomen la versión nueva.
