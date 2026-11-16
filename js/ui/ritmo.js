// Pantalla Ritmo: lo medido, sin medallas ni rachas.
import { S } from '../db.js';
import { indicadores, ritmo } from '../engine.js';
import { aMin, addDias, lunesDe, aDate } from '../fechas.js';
import { esc, getCtx, num } from './comun.js';

const SEMANAS = 6;

export function pantallaRitmo(cont) {
  const ctx = getCtx();
  const hoy = ctx.fecha;
  const ind = indicadores(ctx);
  const lunes = lunesDe(hoy);
  const lim = aMin(ctx.aj.horaLimite);
  const planSemanal = S.huecos.filter((h) => h.activo !== false).reduce((a, h) => a + Math.max(0, Math.min(aMin(h.fin), lim) - aMin(h.inicio)), 0) / 60;

  const semanas = Array.from({ length: SEMANAS }, (_, i) => {
    const ini = addDias(lunes, -7 * (SEMANAS - 1 - i));
    const fin = addDias(ini, 6);
    const d = aDate(ini);
    return {
      etiqueta: `${d.getDate()}/${d.getMonth() + 1}`,
      reales: S.sesiones.filter((s) => s.fecha >= ini && s.fecha <= fin).reduce((a, s) => a + (s.minReales || 0), 0) / 60,
      dominados: S.temas.filter((t) => t.estado === 'dominado' && t.fechaDominado >= ini && t.fechaDominado <= fin).length,
    };
  });
  const maxH = Math.max(planSemanal, ...semanas.map((s) => s.reales), 1);
  const maxD = Math.max(...semanas.map((s) => s.dominados), 1);
  const alto = (v, max) => `${Math.round((v / max) * 100)}%`;

  const desde = addDias(hoy, -27);
  const tasas = S.materias.map((m) => {
    const temas = new Set(S.temas.filter((t) => t.materiaId === m.id).map((t) => t.id));
    let ok = 0, n = 0;
    for (const p of S.preguntas) if (temas.has(p.temaId)) for (const h of p.historial || []) if (h.fecha >= desde) { n++; if (h.acierto) ok++; }
    return { m, ok, n, r: ritmo(S, m.id, hoy) };
  });

  cont.innerHTML = `<h1>Ritmo</h1>
    <div class="indicadores">
      <div class="indicador"><b>${ind.dominados}/${ind.total}</b><span>temas dominados</span></div>
      <div class="indicador"><b>${ind.vencidos}</b><span>repasos vencidos</span></div>
    </div>

    <h2>Temas dominados por semana</h2>
    <div class="tarjeta">
      <div class="graf">${semanas.map((s) => `<div class="grupo" title="Semana del ${s.etiqueta}: ${s.dominados} temas dominados"><div class="barra" style="height:${alto(s.dominados, maxD)}">${s.dominados ? `<em>${s.dominados}</em>` : ''}</div></div>`).join('')}</div>
      <div class="graf-eje">${semanas.map((s) => `<span>${s.etiqueta}</span>`).join('')}</div>
      ${semanas.some((s) => s.dominados) ? '' : '<p class="chico" style="margin:8px 0 0">Todavía no dominaste ningún tema en estas 6 semanas.</p>'}
      <p class="chico tenue" style="margin:8px 0 0">Un tema se domina al acertarlo en ${ctx.aj.dominioSesiones} sesiones de días distintos. Semanas que empiezan el lunes indicado.</p>
    </div>

    <h2>Horas reales y planificadas por semana</h2>
    <div class="tarjeta">
      <div class="leyenda"><span><i></i>Reales (cronómetro)</span><span><i class="plan"></i>Planificadas (huecos)</span></div>
      <div class="graf">${semanas.map((s) => `<div class="grupo" title="Semana del ${s.etiqueta}: ${num(s.reales)} h reales de ${num(planSemanal)} h planificadas">
        <div class="barra" style="height:${alto(s.reales, maxH)}">${s.reales >= 0.05 ? `<em>${num(s.reales)}</em>` : ''}</div><div class="barra plan" style="height:${alto(planSemanal, maxH)}"></div></div>`).join('')}</div>
      <div class="graf-eje">${semanas.map((s) => `<span>${s.etiqueta}</span>`).join('')}</div>
      <details class="tabla"><summary>Ver como tabla</summary><table><tr><th>Semana</th><th>Reales</th><th>Planificadas</th><th>Dominados</th></tr>
        ${semanas.map((s) => `<tr><td>${s.etiqueta}</td><td>${num(s.reales)} h</td><td>${num(planSemanal)} h</td><td>${s.dominados}</td></tr>`).join('')}</table></details>
      <p class="chico tenue" style="margin:8px 0 0">Las planificadas salen de tus huecos actuales (${num(planSemanal)} h por semana).</p>
    </div>

    <h2>Aciertos al primer intento, últimas 4 semanas</h2>
    <div class="tarjeta">${tasas.length ? tasas.map((t) => `<div class="hbar"><span class="corta">${esc(t.m.nombre)}</span><div class="pista"><i style="width:${t.n ? Math.round((t.ok / t.n) * 100) : 0}%"></i></div><span class="val">${t.n ? `${Math.round((t.ok / t.n) * 100)}% <small>(${t.n})</small>` : 'sin datos'}</span></div>`).join('') : '<p class="chico tenue">Sin materias.</p>'}
      <p class="chico tenue" style="margin:8px 0 0">Entre paréntesis, cantidad de respuestas.</p></div>

    <h2>Ritmo con material nuevo, últimas 2 semanas</h2>
    <div class="lista">${tasas.length ? tasas.map((t) => `<div><span class="crece">${esc(t.m.nombre)}</span><span class="chico num">${t.r.valor ? `${num(t.r.valor)} temas/h · ${t.r.temas} en ${num(t.r.horas)} h` : t.r.horas ? `${num(t.r.horas)} h, ningún tema terminado` : 'sin datos'}</span></div>`).join('') : '<div class="tenue">Sin materias.</div>'}</div>`;
  cont.onclick = null;
}
