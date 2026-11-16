// Motor de planificación. Funciones puras: reciben el estado y una fecha, no tocan el DOM ni la base.
import { addDias, diffDias, diaSemana, aMin } from './fechas.js';

export const DEFAULTS = {
  horaLimite: '23:00', // sueño intocable
  horaCansado: '21:00', // desde esta hora, solo repaso corto
  minCansado: 15,
  intervalos: { espaciado: [4, 6], sprint: [2, 3], mantenimiento: [7, 10] },
  sprintDias: 14,
  bloqueoNuevoDias: 3,
  umbralAcierto: 0.8,
  fraccionRepasoLargo: 0.25,
  pretestDias: 3,
  dominioSesiones: 3,
  recordatorio21: true,
  sonido: true,
};
export const RITMO_DEFECTO = 1; // temas/hora; solo para ordenar y simular cuando todavía no hay datos
const VENTANA_RITMO = 14;

export function crearCtx(S, fecha) {
  const aj = { ...DEFAULTS, ...S.ajustes, intervalos: { ...DEFAULTS.intervalos, ...(S.ajustes?.intervalos || {}) } };
  const nPreg = {};
  const fallos = {};
  for (const p of S.preguntas) {
    nPreg[p.temaId] = (nPreg[p.temaId] || 0) + 1;
    for (const h of p.historial || []) {
      if (!h.acierto && diffDias(h.fecha, fecha) <= 14) fallos[p.temaId] = (fallos[p.temaId] || 0) + 1;
    }
  }
  const mat = Object.fromEntries(S.materias.map((m) => [m.id, m]));
  return { S, aj, nPreg, fallos, mat, fecha, _cache: {} };
}

// ---------- Materia: examen, programa, intervalos ----------
export function proximoExamen(m, fecha) {
  return (m.examenes || [])
    .filter((e) => e.tipo !== 'entrega' && e.fecha && e.fecha >= fecha)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))[0] || null;
}
export function diasAlExamen(m, fecha) {
  const e = proximoExamen(m, fecha);
  return e ? diffDias(fecha, e.fecha) : Infinity;
}
export function programaEfectivo(m, fecha, aj) {
  if (m.programa === 'mantenimiento') return 'mantenimiento';
  if (m.programa === 'sprint') return 'sprint';
  if (m.sprintAuto !== false && diasAlExamen(m, fecha) <= aj.sprintDias) return 'sprint';
  return 'espaciado';
}
export function intervaloDe(m, prog, aj) {
  if (prog !== 'sprint' && m.intervalo && m.intervalo[0] > 0 && m.intervalo[1] >= m.intervalo[0]) return m.intervalo;
  return aj.intervalos[prog];
}
export function nuevoBloqueado(m, fecha, aj) {
  const prog = programaEfectivo(m, fecha, aj);
  if (prog === 'mantenimiento') return true;
  return prog === 'sprint' && diasAlExamen(m, fecha) <= aj.bloqueoNuevoDias;
}
const pendienteNuevo = (t) => t.estado === 'no_visto' || (t.estado === 'en_curso' && !t.nuevoCompletado);

/** ¿El tema entra en este examen? Sin examen asignado, o con examen ya pasado, entra en todos. */
export function entraEn(t, ex, m, fecha) {
  if (!ex || !t.examenId || t.examenId === ex.id || ex.tipo === 'final') return true;
  const propio = (m.examenes || []).find((e) => e.id === t.examenId);
  return !propio || !propio.fecha || propio.fecha < fecha;
}

// ---------- Repasos ----------
export function vencimiento(t, m, fecha, aj) {
  if (!t.proximoRepaso) return null;
  const tope = 2 * intervaloDe(m, programaEfectivo(m, fecha, aj), aj)[1];
  if (!t.ultimaSesion) return t.proximoRepaso;
  const limite = addDias(t.ultimaSesion, tope);
  return limite < t.proximoRepaso ? limite : t.proximoRepaso;
}

export function colaRepasos(ctx, temas, fecha) {
  const { aj, mat } = ctx;
  const out = [];
  for (const t of temas) {
    const m = mat[t.materiaId];
    if (!m || t.estado === 'no_visto') continue;
    if (!(t._simPreg || ctx.nPreg[t.id] > 0)) continue;
    const v = vencimiento(t, m, fecha, aj);
    if (!v || v > fecha) continue;
    out.push({
      t,
      sprint: programaEfectivo(m, fecha, aj) === 'sprint' ? 0 : 1,
      dias: diasAlExamen(m, fecha),
      fallos: ctx.fallos[t.id] || 0,
      atraso: diffDias(v, fecha),
    });
  }
  out.sort((a, b) => a.sprint - b.sprint || a.dias - b.dias || b.fallos - a.fallos || b.atraso - a.atraso || a.t.orden - b.t.orden);
  return out;
}

/** Minutos que suele llevarte un repaso de esta materia (mediana observada; 10 si no hay datos). */
export function minRepaso(ctx, materiaId) {
  const k = 'mr' + materiaId;
  if (ctx._cache[k]) return ctx._cache[k];
  const xs = ctx.S.sesiones
    .filter((s) => s.materiaId === materiaId && s.tipo !== 'nuevo' && s.total > 0 && s.minReales > 0)
    .slice(-20)
    .map((s) => s.minReales)
    .sort((a, b) => a - b);
  const med = xs.length ? xs[Math.floor(xs.length / 2)] : 10;
  return (ctx._cache[k] = Math.max(5, Math.min(20, med)));
}

// ---------- Ritmo ----------
export function ritmo(S, materiaId, fecha) {
  let min = 0;
  let temas = 0;
  for (const s of S.sesiones) {
    if (s.materiaId !== materiaId || s.tipo !== 'nuevo') continue;
    const d = diffDias(s.fecha, fecha);
    if (d < 0 || d >= VENTANA_RITMO) continue;
    min += s.minReales || 0;
    if (s.temaTerminado) temas++;
  }
  const horas = min / 60;
  return { horas, temas, valor: horas > 0 && temas > 0 ? temas / horas : null };
}
function ritmoUsado(ctx, materiaId) {
  const k = 'ru' + materiaId;
  if (ctx._cache[k]) return ctx._cache[k];
  let v = ritmo(ctx.S, materiaId, ctx.fecha).valor;
  if (!v) {
    const otros = ctx.S.materias.map((m) => ritmo(ctx.S, m.id, ctx.fecha).valor).filter(Boolean);
    v = otros.length ? otros.reduce((a, b) => a + b, 0) / otros.length : RITMO_DEFECTO;
  }
  return (ctx._cache[k] = v);
}

/** Minutos netos para material nuevo por día de la semana (huecos largos antes de la hora de cansancio). */
function minNuevoPorDia(ctx) {
  if (ctx._cache.mnd) return ctx._cache.mnd;
  const { aj } = ctx;
  const out = [0, 0, 0, 0, 0, 0, 0];
  const lim = aMin(aj.horaLimite);
  const cans = aMin(aj.horaCansado);
  let n = 0;
  let total = 0;
  for (const h of ctx.S.huecos) {
    if (h.activo === false || h.tipo !== 'largo') continue;
    const ini = aMin(h.inicio);
    if (ini >= cans) continue;
    const neto = Math.max(0, Math.min(aMin(h.fin), lim) - ini) * (1 - aj.fraccionRepasoLargo);
    out[h.dia] += neto;
    n++;
    total += neto;
  }
  ctx._cache.largoNetoMedio = n ? total / n : 60;
  return (ctx._cache.mnd = out);
}
/** Último día en que la materia admite material nuevo antes de su próximo examen. */
function topeNuevo(m, ex, aj) {
  const bloquea = m.programa === 'sprint' || m.sprintAuto !== false;
  return addDias(ex.fecha, -(bloquea ? aj.bloqueoNuevoDias : 0) - 1);
}
function horasNuevoHasta(ctx, fecha, tope) {
  const porDia = minNuevoPorDia(ctx);
  let min = 0;
  for (let f = fecha, i = 0; f <= tope && i < 400; f = addDias(f, 1), i++) min += porDia[diaSemana(f)];
  return min / 60;
}

function elegirNuevo(ctx, temas, fecha) {
  const { aj } = ctx;
  let mejor = null;
  ctx.S.materias.forEach((m, idx) => {
    if (nuevoBloqueado(m, fecha, aj)) return;
    const ex = proximoExamen(m, fecha);
    const propios = temas.filter((t) => t.materiaId === m.id && pendienteNuevo(t));
    if (!propios.length) return;
    let pend = propios.filter((t) => entraEn(t, ex, m, fecha));
    if (!pend.length) pend = propios;
    let presion = 0;
    if (ex) {
      const horas = horasNuevoHasta(ctx, fecha, topeNuevo(m, ex, aj));
      presion = horas > 0 ? pend.length / (ritmoUsado(ctx, m.id) * horas) : 1e9;
    }
    const dias = diasAlExamen(m, fecha);
    if (!mejor || presion > mejor.presion || (presion === mejor.presion && (dias < mejor.dias || (dias === mejor.dias && idx < mejor.idx)))) {
      pend.sort(
        (a, b) =>
          (a.estado === 'en_curso' ? 0 : 1) - (b.estado === 'en_curso' ? 0 : 1) ||
          (a.fechaClase && a.fechaClase > fecha ? 1 : 0) - (b.fechaClase && b.fechaClase > fecha ? 1 : 0) ||
          a.orden - b.orden,
      );
      mejor = { m, presion, dias, idx, pend };
    }
  });
  return mejor;
}

const conPretest = (ctx, t, fecha) =>
  !!t.ultimaSesion && (t._simPreg || ctx.nPreg[t.id] > 0) && diffDias(t.ultimaSesion, fecha) >= ctx.aj.pretestDias;

/**
 * Arma un bloque de estudio de `disp` minutos.
 * @returns items [{tipo:'repaso'|'nuevo', materiaId, temaId, min, pretest}]
 */
function armarBloque(ctx, temas, fecha, cola, usados, { disp, largo, cansado }) {
  const { aj } = ctx;
  const items = [];
  const cand = largo && !cansado && disp >= 30 ? elegirNuevo(ctx, temas, fecha) : null;
  const presupuesto = cand ? Math.round(disp * aj.fraccionRepasoLargo) : disp;
  let usado = 0;
  for (const c of cola) {
    if (usados.has(c.t.id)) continue;
    const est = minRepaso(ctx, c.t.materiaId);
    if (items.length && usado + est > presupuesto) break;
    if (!items.length && !cand && est > disp && disp < 5) break;
    items.push({ tipo: 'repaso', materiaId: c.t.materiaId, temaId: c.t.id, min: Math.min(est, disp), pretest: conPretest(ctx, c.t, fecha), fallos: c.fallos, atraso: c.atraso });
    usados.add(c.t.id);
    usado += est;
  }
  if (cand) {
    const t = cand.pend[0];
    items.push({ tipo: 'nuevo', materiaId: t.materiaId, temaId: t.id, min: Math.max(15, disp - usado), pretest: conPretest(ctx, t, fecha), siguientes: cand.pend.slice(1).map((x) => x.id) });
  }
  return items;
}

/**
 * Qué toca en una fecha. `desdeMin`: minutos del día actuales (para recalcular lo que queda de hoy).
 */
export function planDia(ctx, temas, fecha, { desdeMin = null } = {}) {
  const { aj, S } = ctx;
  const lim = aMin(aj.horaLimite);
  const cans = aMin(aj.horaCansado);
  const cola = colaRepasos(ctx, temas, fecha);
  const usados = new Set();
  const dia = diaSemana(fecha);
  const huecos = S.huecos.filter((h) => h.activo !== false && h.dia === dia).sort((a, b) => aMin(a.inicio) - aMin(b.inicio));
  const bloques = [];
  for (const h of huecos) {
    const ini = aMin(h.inicio);
    const fin = Math.min(aMin(h.fin), lim);
    const b = { hueco: h, inicio: ini, fin, cansado: ini >= cans, pasado: desdeMin != null && fin <= desdeMin, items: [], min: 0 };
    bloques.push(b);
    if (b.pasado || fin <= ini) continue;
    let disp = fin - Math.max(ini, desdeMin ?? 0);
    if (b.cansado) disp = Math.min(disp, aj.minCansado);
    b.min = disp;
    b.items = armarBloque(ctx, temas, fecha, cola, usados, { disp, largo: h.tipo === 'largo', cansado: b.cansado });
  }
  return { fecha, bloques, vencidos: cola.length, sinAsignar: cola.filter((c) => !usados.has(c.t.id)).length };
}

/** Sesión fuera de hueco: qué haría el motor con `min` minutos a partir de ahora. */
export function planLibre(ctx, temas, fecha, ahoraMin, min) {
  const { aj } = ctx;
  const lim = aMin(aj.horaLimite);
  if (ahoraMin >= lim) return { items: [], min: 0, cansado: true, fueraDeHora: true };
  const cansado = ahoraMin >= aMin(aj.horaCansado);
  let disp = Math.min(min, lim - ahoraMin);
  if (cansado) disp = Math.min(disp, aj.minCansado);
  const cola = colaRepasos(ctx, temas, fecha);
  return { items: armarBloque(ctx, temas, fecha, cola, new Set(), { disp, largo: disp >= 45, cansado }), min: disp, cansado };
}

/** Repaso de reemplazo cuando estás cansado y te tocaba material nuevo. */
export function repasoCansado(ctx, temas, fecha, materiaId) {
  const cola = colaRepasos(ctx, temas, fecha);
  const c = cola.find((x) => x.t.materiaId === materiaId) || cola[0];
  if (c) return c.t;
  const conPreg = temas
    .filter((t) => t.estado !== 'no_visto' && ctx.nPreg[t.id] > 0 && t.ultimaSesion !== fecha)
    .sort((a, b) => (a.materiaId === materiaId ? 0 : 1) - (b.materiaId === materiaId ? 0 : 1) || (a.proximoRepaso || '').localeCompare(b.proximoRepaso || ''));
  return conPreg[0] || null;
}

// ---------- Simulación hacia adelante (semana tentativa, .ics y proyección) ----------
export function simular(ctx, desde, dias, { desdeMin = null } = {}) {
  const { aj, mat } = ctx;
  const temas = ctx.S.temas.map((t) => ({ ...t, _simMin: 0 }));
  const porId = Object.fromEntries(temas.map((t) => [t.id, t]));
  const completadoEn = {};
  const planes = [];
  for (let i = 0; i < dias; i++) {
    const fecha = addDias(desde, i);
    const plan = planDia(ctx, temas, fecha, i === 0 ? { desdeMin } : {});
    for (const b of plan.bloques) {
      for (const it of b.items) {
        const t = porId[it.temaId];
        const m = mat[t.materiaId];
        const prog = programaEfectivo(m, fecha, aj);
        const [min, max] = intervaloDe(m, prog, aj);
        if (it.tipo === 'repaso') {
          t.ultimaSesion = fecha;
          t.proximoRepaso = addDias(fecha, Math.ceil((min + max) / 2));
          continue;
        }
        // Material nuevo: avanza según el ritmo observado; si sobra tiempo sigue con el tema siguiente.
        const porTema = 60 / ritmoUsado(ctx, m.id);
        let resto = it.min;
        const fila = [t, ...(it.siguientes || []).map((id) => porId[id])];
        it.simCompletados = [];
        for (const x of fila) {
          if (resto <= 0) break;
          const falta = porTema - x._simMin;
          const uso = Math.min(resto, falta);
          x._simMin += uso;
          resto -= uso;
          x.estado = 'en_curso';
          x.ultimaSesion = fecha;
          x._simPreg = true;
          if (x._simMin >= porTema - 1e-6) {
            x.nuevoCompletado = true;
            x.intervaloDias = min;
            x.proximoRepaso = addDias(fecha, min);
            completadoEn[x.id] = fecha;
            it.simCompletados.push(x.id);
          }
        }
      }
    }
    planes.push(plan);
  }
  return { planes, completadoEn };
}

function simLarga(ctx) {
  if (ctx._cache.sim) return ctx._cache.sim;
  let dias = 28;
  for (const m of ctx.S.materias) {
    const d = diasAlExamen(m, ctx.fecha);
    if (d !== Infinity) dias = Math.max(dias, d + 1);
  }
  return (ctx._cache.sim = simular(ctx, ctx.fecha, Math.min(dias, 200), { desdeMin: ctx.ahoraMin ?? null }));
}
export const semanaTentativa = (ctx) => simLarga(ctx).planes.slice(0, 28);

/**
 * Proyección de cobertura al próximo examen.
 * estado: 'sin_examen' | 'completo' | 'sin_datos' | 'llega' | 'no_llega'
 */
export function proyeccion(ctx, m) {
  const { aj, fecha } = ctx;
  const ex = proximoExamen(m, fecha);
  if (!ex) return { estado: 'sin_examen' };
  const temas = ctx.S.temas.filter((t) => t.materiaId === m.id && entraEn(t, ex, m, fecha));
  const pend = temas.filter(pendienteNuevo);
  const total = temas.length;
  const base = { examen: ex, dias: diffDias(fecha, ex.fecha), total, vistos: total - pend.length };
  if (!total) return { ...base, estado: 'sin_examen' };
  if (!pend.length) return { ...base, estado: 'completo', cubiertos: total };
  const r = ritmo(ctx.S, m.id, fecha);
  if (!r.valor) return { ...base, estado: 'sin_datos', ritmo: r };
  const sim = simLarga(ctx);
  const cubiertos = base.vistos + pend.filter((t) => sim.completadoEn[t.id] && sim.completadoEn[t.id] < ex.fecha).length;
  if (cubiertos >= total) return { ...base, estado: 'llega', cubiertos, ritmo: r };
  minNuevoPorDia(ctx);
  const tope = topeNuevo(m, ex, aj);
  const semanas = Math.max(1, (diffDias(fecha, tope) + 1) / 7);
  const horasFaltan = (total - cubiertos) / r.valor;
  const largoHoras = Math.max(0.5, ctx._cache.largoNetoMedio / 60);
  return { ...base, estado: 'no_llega', cubiertos, ritmo: r, bloquesPorSemana: Math.max(1, Math.ceil(horasFaltan / largoHoras / semanas)) };
}

// ---------- Efecto de una sesión sobre el tema ----------
/** Tras un repaso o pretest. `completa`: acertaste cada pregunta del tema al menos una vez. */
export function trasRepaso(t0, m, { aciertos, total, completa }, fecha, aj) {
  const t = { ...t0 };
  if (!total) return t;
  const [min, max] = intervaloDe(m, programaEfectivo(m, fecha, aj), aj);
  const base = Math.ceil((min + max) / 2);
  const ratio = aciertos / total;
  t.ultimaSesion = fecha;
  let int;
  if (ratio < aj.umbralAcierto) {
    t.aciertosSeguidos = 0;
    int = min;
    if (t.estado === 'dominado') {
      t.estado = 'en_curso';
      t.fechaDominado = null;
      t.fechasAcierto = (t.fechasAcierto || []).slice(0, aj.dominioSesiones - 1);
    }
  } else if (!completa) {
    int = 1; // quedó a medias sin fallar: vuelve mañana, sin cambiar nada más
  } else {
    t.aciertosSeguidos = (t.aciertosSeguidos || 0) + 1;
    t.fechasAcierto = [...new Set([...(t.fechasAcierto || []), fecha])];
    int = t.aciertosSeguidos >= 2 ? Math.min(Math.round(Math.max(t.intervaloDias || base, base) * 1.5), 2 * max) : base;
    if (t.fechasAcierto.length >= aj.dominioSesiones && t.estado !== 'dominado') {
      t.estado = 'dominado';
      t.fechaDominado = fecha;
    }
  }
  t.intervaloDias = int;
  t.proximoRepaso = addDias(fecha, int);
  return t;
}

/** Tras una sesión de material nuevo. El primer repaso llega al intervalo mínimo del programa. */
export function trasNuevo(t0, m, { temaTerminado }, fecha, aj) {
  const t = { ...t0 };
  const [min] = intervaloDe(m, programaEfectivo(m, fecha, aj), aj);
  if (t.estado === 'no_visto') t.estado = 'en_curso';
  if (temaTerminado) t.nuevoCompletado = true;
  t.ultimaSesion = fecha;
  t.intervaloDias = min;
  t.proximoRepaso = addDias(fecha, min);
  return t;
}

// ---------- Indicadores ----------
export function indicadores(ctx) {
  const temas = ctx.S.temas;
  return {
    total: temas.length,
    dominados: temas.filter((t) => t.estado === 'dominado').length,
    enCurso: temas.filter((t) => t.estado === 'en_curso').length,
    vencidos: colaRepasos(ctx, temas, ctx.fecha).length,
  };
}
export function cobertura(S, materiaId) {
  const ts = S.temas.filter((t) => t.materiaId === materiaId);
  return {
    total: ts.length,
    dominados: ts.filter((t) => t.estado === 'dominado').length,
    enCurso: ts.filter((t) => t.estado === 'en_curso').length,
    noVistos: ts.filter((t) => t.estado === 'no_visto').length,
  };
}
