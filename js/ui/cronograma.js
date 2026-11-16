// Asistente para pegar un cronograma: lee fechas, pregunta lo que falta y calcula los deadlines.
import { S, uid, guardar, guardarVarios } from '../db.js';
import { leerCronograma, resolverFechas, armarMateria } from '../parser.js';
import { esc, $, $$, modal, cerrarModal, redibujar, toast, TIPOS_EXAMEN } from './comun.js';

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const TIPOS = [['tema', 'Tema'], ['parcial', 'Parcial'], ['recuperatorio', 'Recuperatorio'], ['final', 'Final'], ['entrega', 'Entrega'], ['ignorar', 'Ignorar']];

export function asistenteCronograma(materia) {
  let items = [];
  const hoja = modal(`Cronograma de ${materia.nombre}`, '<div id="paso" class="pila"></div>');
  const paso = $('#paso', hoja);

  // Paso 1: pegar
  const paso1 = () => {
    paso.innerHTML = `<p class="chico">Pegá el cronograma como texto, un renglón por clase o fecha. Entiende "12/3", "12 de marzo", "Semana 4" y reconoce parciales, recuperatorios, finales y entregas.</p>
      <textarea id="txt" rows="10" placeholder="10/8 Unidad 1: Introducción&#10;17/8 Unidad 2: ...&#10;21/9 Primer parcial"></textarea>
      <label class="campo">O cargá un archivo de texto<input type="file" id="arch" accept=".txt,.csv,.md,text/plain"></label>
      <p class="rojo-txt chico" id="err" hidden></p>
      <button class="btn pri" id="leer">Leer fechas</button>`;
    $('#arch', paso).onchange = async (e) => { if (e.target.files[0]) $('#txt', paso).value = await e.target.files[0].text(); };
    $('#leer', paso).onclick = () => {
      const r = leerCronograma($('#txt', paso).value);
      if (!r.items.length) { const p = $('#err', paso); p.textContent = 'No encontré renglones con temas o fechas.'; p.hidden = false; return; }
      items = r.items;
      const n = r.necesita;
      if (n.anio || n.semana1 || n.sinFecha.length) paso2(n);
      else paso3(resolverFechas(items, {}));
    };
  };

  // Paso 2: preguntar lo que falta
  const paso2 = (n) => {
    paso.innerHTML = `<p class="chico">Para calcular las fechas me falta esto:</p>
      ${n.anio ? `<label class="campo">Las fechas no tienen año. ¿De qué año es el cronograma?<input type="number" id="anio" value="${new Date().getFullYear()}" min="2020" max="2100"></label>` : ''}
      ${n.semana1 ? '<label class="campo">Hay renglones por número de semana. ¿Qué día empieza la semana 1?<input type="date" id="sem1"></label>' : ''}
      ${n.sinFecha.map((i) => `<label class="campo">"${esc(items[i].titulo)}" no tiene fecha. ¿Cuándo es?<input type="date" data-sf="${i}"><small>Si todavía no la sabés, dejala vacía y la cargás después.</small></label>`).join('')}
      <p class="rojo-txt chico" id="err" hidden></p>
      <div class="botones"><button class="btn" id="atras">Atrás</button><button class="btn pri" id="seguir">Calcular fechas</button></div>`;
    $('#atras', paso).onclick = paso1;
    $('#seguir', paso).onclick = () => {
      const resp = { fechas: {} };
      if (n.anio) resp.anio = +$('#anio', paso).value;
      if (n.semana1) {
        resp.semana1 = $('#sem1', paso).value;
        if (!resp.semana1) { const p = $('#err', paso); p.textContent = 'Necesito la fecha de la semana 1 para ubicar esos renglones.'; p.hidden = false; return; }
      }
      $$('[data-sf]', paso).forEach((el) => { if (el.value) resp.fechas[el.dataset.sf] = el.value; });
      paso3(resolverFechas(items, resp));
    };
  };

  // Paso 3: revisar y confirmar
  const paso3 = (res) => {
    const cuenta = () => {
      const tipos = $$('[data-k="tipo"]', paso).map((s) => s.value);
      const t = tipos.filter((x) => x === 'tema').length;
      const f = tipos.filter((x) => x !== 'tema' && x !== 'ignorar').length;
      $('#resumen', paso).textContent = `${t} ${t === 1 ? 'tema' : 'temas'} y ${f} ${f === 1 ? 'fecha de examen o entrega' : 'fechas de examen o entrega'}.`;
      $$('.item', paso).forEach((el, i) => el.classList.toggle('ign', tipos[i] === 'ignorar'));
    };
    paso.innerHTML = `<p class="chico">Revisá lo que entendí. Podés corregir el tipo, el título o la fecha de cada renglón. <b id="resumen"></b></p>
      <div class="revision">${res.map((it, i) => `<div class="item" data-i="${i}">
        <input data-k="titulo" value="${esc(it.titulo)}" aria-label="Título">
        <div class="dos"><select data-k="tipo" aria-label="Tipo">${TIPOS.map(([v, l]) => `<option value="${v}" ${v === it.tipo ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input type="date" data-k="fecha" value="${it.fecha || ''}" aria-label="Fecha"></div>
        ${it.dudas.length ? `<small class="rojo-txt">${esc(it.dudas.join(' '))}</small>` : ''}</div>`).join('')}</div>
      <div class="botones"><button class="btn" id="atras">Empezar de nuevo</button><button class="btn pri" id="crear">Guardar en la materia</button></div>`;
    cuenta();
    paso.onchange = cuenta;
    $('#atras', paso).onclick = paso1;
    $('#crear', paso).onclick = async () => {
      const finales = $$('.item', paso).map((el) => ({
        titulo: $('[data-k="titulo"]', el).value.trim(), tipo: $('[data-k="tipo"]', el).value, fecha: $('[data-k="fecha"]', el).value || null,
      })).filter((x) => x.titulo);
      const r = await aplicar(materia, finales);
      cerrarModal();
      toast(`Listo: ${r.temasNuevos} temas nuevos, ${r.temasAct} actualizados, ${r.examenes} fechas.`, 4500);
      redibujar();
    };
  };
  paso1();
}

/** Fusiona con lo que la materia ya tenía: actualiza por título, agrega lo nuevo, no borra nada. */
async function aplicar(materia, items) {
  const { examenes, temas } = armarMateria(items, uid);
  const m = { ...materia, examenes: [...(materia.examenes || [])] };
  const remap = {};
  for (const ex of examenes) {
    const ya = m.examenes.find((e) => e.tipo === ex.tipo && norm(e.titulo || '') === norm(ex.titulo));
    if (ya) {
      remap[ex.id] = ya.id;
      if (ex.fecha) ya.fecha = ex.fecha;
    } else {
      m.examenes.push({ ...ex, titulo: ex.titulo || TIPOS_EXAMEN[ex.tipo] });
    }
  }
  await guardar('materias', m);
  const propios = S.temas.filter((t) => t.materiaId === m.id);
  let orden = propios.reduce((a, t) => Math.max(a, t.orden), 0);
  let temasNuevos = 0;
  let temasAct = 0;
  const out = [];
  for (const t of temas) {
    const examenId = t.examenId ? remap[t.examenId] || t.examenId : null;
    const ya = propios.find((p) => norm(p.titulo) === norm(t.titulo));
    if (ya) {
      out.push({ ...ya, fechaClase: t.fechaClase || ya.fechaClase || null, examenId: examenId || ya.examenId || null });
      temasAct++;
    } else {
      out.push({ id: uid(), materiaId: m.id, orden: ++orden, titulo: t.titulo, estado: 'no_visto', nuevoCompletado: false, fechaClase: t.fechaClase, examenId, apunte: '' });
      temasNuevos++;
    }
  }
  if (out.length) await guardarVarios('temas', out);
  return { temasNuevos, temasAct, examenes: examenes.length };
}
