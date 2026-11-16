// Pantallas Materias (lista) y detalle de una materia.
import { S, uid, guardar, guardarVarios, borrar, borrarMateria, borrarTema } from '../db.js';
import { proyeccion, cobertura, programaEfectivo, proximoExamen, diasAlExamen, ritmo } from '../engine.js';
import { diffDias, fechaCorta, hoyISO } from '../fechas.js';
import { esc, $, ir, getCtx, colorDe, formModal, modal, cerrarModal, confirmar, redibujar, toast, textoProyeccion, PROGRAMAS, TIPOS_EXAMEN, ESTADOS, enDias, num } from './comun.js';
import { asistenteCronograma } from './cronograma.js';

const barra = (c, m) => `<div class="cobertura" style="--mc:${colorDe(m)}" role="img" aria-label="${c.dominados} dominados, ${c.enCurso} en curso, ${c.noVistos} no vistos">
  ${c.dominados ? `<i class="dom" style="flex:${c.dominados}"></i>` : ''}${c.enCurso ? `<i class="cur" style="flex:${c.enCurso}"></i>` : ''}${c.noVistos ? `<i style="flex:${c.noVistos}"></i>` : ''}</div>`;

export function pantallaMaterias(cont) {
  const ctx = getCtx();
  const tarjetas = S.materias.map((m) => {
    const c = cobertura(S, m.id);
    const p = proyeccion(ctx, m);
    const tp = textoProyeccion(p);
    const ex = proximoExamen(m, ctx.fecha);
    const prog = programaEfectivo(m, ctx.fecha, ctx.aj);
    return `<a class="tarjeta" href="#materia/${m.id}" style="display:block;text-decoration:none;color:inherit">
      <div class="fila entre"><h3 class="corta">${esc(m.nombre)}</h3><span class="chip">${PROGRAMAS[prog]}</span></div>
      ${barra(c, m)}
      <div class="fila entre chico"><span><b>${c.dominados}/${c.total}</b> dominados · ${c.enCurso} en curso</span>
        <span>${ex ? `${TIPOS_EXAMEN[ex.tipo]} ${enDias(diffDias(ctx.fecha, ex.fecha))}` : 'sin examen'}</span></div>
      <p class="chico ${tp.cls}" style="margin:6px 0 0">${esc(tp.txt)}</p></a>`;
  }).join('');
  cont.innerHTML = `<h1>Materias</h1>${tarjetas || '<p class="aviso">Todavía no cargaste materias.</p>'}
    <button class="btn pri ancha" style="margin-top:14px" data-a="nueva">Agregar materia</button>`;
  cont.onclick = (e) => {
    if (!e.target.closest('[data-a="nueva"]')) return;
    formModal({
      titulo: 'Nueva materia', ok: 'Crear',
      intro: 'Después podés pegar el cronograma para que la app lea temas y fechas.',
      campos: [
        { name: 'nombre', label: 'Nombre', required: true },
        { name: 'programa', label: 'Programa de estudio', type: 'select', options: [['espaciado', 'Repaso espaciado (cursando)'], ['mantenimiento', 'Mantenimiento (en final o ya cursada)']] },
      ],
      onOk: async (v) => {
        const m = { id: uid(), nombre: v.nombre, color: S.materias.length % 8, orden: S.materias.length, programa: v.programa, sprintAuto: true, examenes: [], intervalo: null };
        await guardar('materias', m);
        setTimeout(() => ir(`#materia/${m.id}`), 0);
      },
    });
  };
}

export function pantallaMateria(cont, id) {
  const m = S.materias.find((x) => x.id === id);
  if (!m) return ir('#materias');
  const ctx = getCtx();
  const hoy = ctx.fecha;
  const c = cobertura(S, m.id);
  const tp = textoProyeccion(proyeccion(ctx, m));
  const prog = programaEfectivo(m, hoy, ctx.aj);
  const r = ritmo(S, m.id, hoy);
  const temas = S.temas.filter((t) => t.materiaId === id).sort((a, b) => a.orden - b.orden);
  const examenes = [...(m.examenes || [])].sort((a, b) => (a.fecha || '9').localeCompare(b.fecha || '9'));
  const nPreg = ctx.nPreg;

  cont.innerHTML = `<a href="#materias" class="chico">‹ Materias</a>
    <div class="fila entre"><h1 class="corta" style="margin-bottom:6px">${esc(m.nombre)}</h1><button class="btn chica" data-a="editar">Editar</button></div>
    ${barra(c, m)}
    <p class="chico"><b>${c.dominados}/${c.total}</b> temas dominados · ${c.enCurso} en curso · ${c.noVistos} no vistos</p>
    <p class="chico ${tp.cls}">${esc(tp.txt)}</p>
    ${r.valor ? `<p class="chico tenue">Ritmo medido: ${num(r.valor)} temas por hora (${r.temas} temas en ${num(r.horas)} h de material nuevo, últimas 2 semanas).</p>` : ''}

    <h2>Programa</h2>
    <button class="tarjeta fila entre" data-a="programa" style="width:100%;text-align:left;font:inherit;color:inherit;cursor:pointer">
      <span><b>${PROGRAMAS[prog]}</b><br><small>${prog === 'sprint' && m.programa !== 'sprint' ? `Se activó solo: faltan ${diasAlExamen(m, hoy)} días para el examen.` : m.programa === 'espaciado' && m.sprintAuto !== false ? `Pasa a sprint ${ctx.aj.sprintDias} días antes del examen.` : 'Elegido a mano.'}</small></span><span class="chip">Cambiar</span></button>

    <h2>Fechas y deadlines</h2>
    <div class="lista">${examenes.map((e) => `<button data-examen="${e.id}"><span class="crece"><b>${esc(e.titulo || TIPOS_EXAMEN[e.tipo])}</b><br><small>${TIPOS_EXAMEN[e.tipo]}${e.fecha ? ` · ${fechaCorta(e.fecha)}` : ''}</small></span>
      ${e.fecha ? `<span class="chip ${e.fecha >= hoy && diffDias(hoy, e.fecha) <= 14 ? 'rojo' : ''}">${enDias(diffDias(hoy, e.fecha))}</span>` : '<span class="chip rojo">falta la fecha</span>'}</button>`).join('')}
      <button data-a="examen-nuevo"><span class="crece" style="color:var(--acento)">+ Agregar fecha</span></button></div>

    <h2>Temas</h2>
    ${temas.length ? `<div class="lista">${temas.map((t) => `<button data-tema="${t.id}">
      <span class="punto" style="background:${t.estado === 'no_visto' ? 'var(--neutro)' : colorDe(m)};opacity:${t.estado === 'en_curso' ? 0.45 : 1}"></span>
      <span class="crece"><span class="corta" style="display:block"><b>${esc(t.titulo)}</b></span><small>${ESTADOS[t.estado]}${t.estado === 'en_curso' && !t.nuevoCompletado ? ' (sin terminar de ver)' : ''} · ${nPreg[t.id] || 0} preguntas${t.proximoRepaso && t.estado !== 'no_visto' ? ` · repaso ${enDias(diffDias(hoy, t.proximoRepaso))}` : ''}</small></span></button>`).join('')}</div>` : '<p class="aviso">Sin temas todavía. Pegá el cronograma o cargalos a mano.</p>'}
    <div class="botones" style="margin-top:10px"><button class="btn pri" data-a="cronograma">Pegar cronograma</button><button class="btn" data-a="temas">Agregar temas a mano</button></div>
    <button class="btn peligro ancha" style="margin-top:28px" data-a="borrar">Eliminar materia</button>`;

  cont.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tema) return editarTema(m, S.temas.find((t) => t.id === b.dataset.tema), temas);
    if (b.dataset.examen) return editarExamen(m, m.examenes.find((x) => x.id === b.dataset.examen));
    switch (b.dataset.a) {
      case 'examen-nuevo': return editarExamen(m, null);
      case 'cronograma': return asistenteCronograma(m);
      case 'editar':
        return formModal({ titulo: 'Editar materia', campos: [{ name: 'nombre', label: 'Nombre', value: m.nombre, required: true },
          { name: 'color', label: 'Color', type: 'select', value: m.color, options: ['Azul', 'Naranja', 'Verde agua', 'Amarillo', 'Rosa', 'Verde', 'Violeta', 'Rojo'].map((n, i) => [i, n]) }],
          onOk: (v) => guardar('materias', { ...m, nombre: v.nombre, color: +v.color }).then(() => {}) });
      case 'programa':
        return formModal({
          titulo: 'Programa de estudio',
          intro: 'El modo cansado no se elige: se activa solo si marcás cansancio 3 o empezás después de la hora configurada.',
          campos: [
            { name: 'programa', label: 'Programa', type: 'select', value: m.programa, options: [['espaciado', 'A · Repaso espaciado'], ['sprint', 'B · Sprint a parcial (desde ya)'], ['mantenimiento', 'C · Mantenimiento']] },
            { name: 'sprintAuto', label: `Pasar solo a sprint ${ctx.aj.sprintDias} días antes del examen`, type: 'checkbox', value: m.sprintAuto !== false },
            { name: 'min', label: 'Repaso cada (mín. días)', type: 'number', mitad: true, value: m.intervalo?.[0] ?? '', placeholder: 'general', attrs: 'min="1" max="60"' },
            { name: 'max', label: 'hasta (máx. días)', type: 'number', mitad: true, value: m.intervalo?.[1] ?? '', placeholder: 'general', attrs: 'min="1" max="90"' },
          ],
          onOk: (v) => {
            const min = +v.min, max = +v.max;
            if ((v.min || v.max) && !(min > 0 && max >= min)) return 'El intervalo necesita mínimo y máximo, con máximo mayor o igual al mínimo. Dejá los dos vacíos para usar el general.';
            return guardar('materias', { ...m, programa: v.programa, sprintAuto: v.sprintAuto, intervalo: v.min ? [min, max] : null }).then(() => {});
          },
        });
      case 'temas':
        return formModal({ titulo: 'Agregar temas', ok: 'Agregar', campos: [{ name: 'txt', label: 'Un tema por renglón', type: 'textarea', rows: 6, required: true }],
          onOk: async (v) => {
            let orden = temas.reduce((a, t) => Math.max(a, t.orden), 0);
            await guardarVarios('temas', v.txt.split('\n').map((s) => s.trim()).filter(Boolean).map((titulo) => ({ id: uid(), materiaId: m.id, orden: ++orden, titulo, estado: 'no_visto', nuevoCompletado: false, examenId: null, fechaClase: null, apunte: '' })));
          } });
      case 'borrar':
        if (await confirmar(`¿Eliminar "${m.nombre}" con sus temas, preguntas y sesiones? No se puede deshacer.`, 'Eliminar')) { await borrarMateria(m.id); ir('#materias'); }
    }
  };
}

function editarExamen(m, ex) {
  formModal({
    titulo: ex ? 'Editar fecha' : 'Nueva fecha',
    campos: [
      { name: 'tipo', label: 'Tipo', type: 'select', value: ex?.tipo || 'parcial', options: Object.entries(TIPOS_EXAMEN) },
      { name: 'titulo', label: 'Nombre', value: ex?.titulo || '', placeholder: 'Primer parcial' },
      { name: 'fecha', label: 'Fecha', type: 'date', value: ex?.fecha || '' },
    ],
    onOk: (v) => {
      const nuevo = { id: ex?.id || uid(), tipo: v.tipo, titulo: v.titulo || TIPOS_EXAMEN[v.tipo], fecha: v.fecha };
      const examenes = ex ? m.examenes.map((x) => (x.id === ex.id ? nuevo : x)) : [...(m.examenes || []), nuevo];
      return guardar('materias', { ...m, examenes }).then(() => {});
    },
    onEliminar: ex ? () => guardar('materias', { ...m, examenes: m.examenes.filter((x) => x.id !== ex.id) }).then(() => {}) : null,
  });
}

function editarTema(m, t, temas) {
  const hoja = formModal({
    titulo: 'Tema',
    campos: [
      { name: 'titulo', label: 'Título', value: t.titulo, required: true },
      { name: 'apunte', label: 'Apunte o link al material', type: 'textarea', rows: 4, value: t.apunte || '', ayuda: 'Se muestra recién después del pretest.' },
      { name: 'estado', label: 'Estado', type: 'select', mitad: true, value: t.estado, options: Object.entries(ESTADOS) },
      { name: 'examenId', label: 'Entra en', type: 'select', mitad: true, value: t.examenId || '', options: [['', 'Todos los exámenes'], ...(m.examenes || []).filter((e) => e.tipo !== 'entrega').map((e) => [e.id, e.titulo || TIPOS_EXAMEN[e.tipo]])] },
      { name: 'fechaClase', label: 'Fecha en que se da en clase (opcional)', type: 'date', value: t.fechaClase || '' },
    ],
    onOk: (v) => {
      const n = { ...t, titulo: v.titulo, apunte: v.apunte, examenId: v.examenId || null, fechaClase: v.fechaClase || null };
      if (v.estado !== t.estado) {
        n.estado = v.estado;
        if (v.estado === 'no_visto') Object.assign(n, { nuevoCompletado: false, proximoRepaso: null, ultimaSesion: null, aciertosSeguidos: 0, fechasAcierto: [], fechaDominado: null });
        else {
          n.nuevoCompletado = true;
          n.proximoRepaso = n.proximoRepaso || hoyISO();
          n.fechaDominado = v.estado === 'dominado' ? n.fechaDominado || hoyISO() : null;
        }
      }
      return guardar('temas', n).then(() => {});
    },
    onEliminar: async () => {
      if (!(await confirmar(`¿Eliminar "${t.titulo}" y sus preguntas?`, 'Eliminar'))) { setTimeout(redibujar, 0); return; }
      await borrarTema(t.id);
    },
  });
  const extra = document.createElement('div');
  extra.className = 'botones';
  extra.innerHTML = '<button type="button" class="btn" data-x="preg">Preguntas</button><button type="button" class="btn" data-x="sube">Subir</button><button type="button" class="btn" data-x="baja">Bajar</button>';
  $('form', hoja).insertBefore(extra, $('[data-error]', hoja));
  extra.onclick = async (e) => {
    const x = e.target.dataset.x;
    if (x === 'preg') return listaPreguntas(t);
    const i = temas.findIndex((y) => y.id === t.id);
    const j = x === 'sube' ? i - 1 : i + 1;
    if (!x || j < 0 || j >= temas.length) return;
    const otro = temas[j];
    await guardarVarios('temas', [{ ...t, orden: otro.orden }, { ...otro, orden: t.orden }]);
    cerrarModal();
    redibujar();
  };
}

function listaPreguntas(t) {
  const ps = S.preguntas.filter((p) => p.temaId === t.id);
  const hoja = modal(`Preguntas · ${t.titulo}`, `${ps.length ? `<div class="lista">${ps.map((p) => {
    const ok = (p.historial || []).filter((h) => h.acierto).length;
    const mal = (p.historial || []).length - ok;
    return `<button data-p="${p.id}"><span class="crece"><span class="corta" style="display:block">${esc(p.enunciado)}</span><small>${ok} aciertos · ${mal} fallos</small></span></button>`;
  }).join('')}</div>` : '<p class="aviso">Sin preguntas. Se cargan al cerrar cada sesión de material nuevo, o las agregás acá.</p>'}
    <button class="btn pri" data-nueva>Agregar pregunta</button>`);
  hoja.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.cerrar !== undefined) return;
    const p = b.dataset.p ? ps.find((x) => x.id === b.dataset.p) : null;
    if (!p && b.dataset.nueva === undefined) return;
    formModal({
      titulo: p ? 'Editar pregunta' : 'Nueva pregunta',
      campos: [{ name: 'enunciado', label: 'Pregunta', type: 'textarea', value: p?.enunciado || '', required: true }, { name: 'respuesta', label: 'Respuesta', type: 'textarea', value: p?.respuesta || '', required: true }],
      onOk: async (v) => {
        await guardar('preguntas', { id: p?.id || uid(), temaId: t.id, historial: p?.historial || [], creada: p?.creada || hoyISO(), ...v });
        setTimeout(() => listaPreguntas(t), 0);
      },
      onEliminar: p ? async () => { await borrar('preguntas', p.id); setTimeout(() => listaPreguntas(t), 0); } : null,
    });
  };
  void toast;
}
