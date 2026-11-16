// Pantalla de sesión: cronómetro, pretest, flashcards, carga de preguntas y cierre.
import { S, uid, guardar, guardarVarios } from '../db.js';
import { trasRepaso, trasNuevo, repasoCansado } from '../engine.js';
import { hoyISO, horaActualMin, aMin, pad, fechaCorta } from '../fechas.js';
import { esc, $, $$, ir, toast, getCtx, confirmar, colorDe } from './comun.js';

const K = 'repaso.sesion';
export const sesionActiva = () => {
  try { return JSON.parse(localStorage.getItem(K) || 'null'); } catch { return null; }
};
const persistir = (d) => localStorage.setItem(K, JSON.stringify(d));
const mezclar = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
const ETIQUETA = { nuevo: 'Material nuevo', repaso: 'Repaso con preguntas' };

// ---------- Sonido ----------
let ac;
export function prepararAudio() {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
  } catch { /* sin audio */ }
}
export function bip(n = 1) {
  navigator.vibrate?.(Array(n).fill([180, 120]).flat());
  if (!S.ajustes.sonido || !ac) return;
  for (let i = 0; i < n; i++) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    const t = ac.currentTime + i * 0.38;
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + 0.3);
  }
}

// ---------- Inicio ----------
/** item: {materiaId, temaId, tipo:'nuevo'|'repaso', min, pretest, huecoId} */
export function iniciarSesion(item) {
  if (sesionActiva()) return ir('#sesion');
  const lim = aMin(S.ajustes.horaLimite);
  const ahora = horaActualMin();
  if (ahora >= lim) return toast(`Ya pasaron las ${S.ajustes.horaLimite}. Dormir también es estudiar: mañana se recalcula.`);
  persistir({
    id: uid(), fecha: hoyISO(), huecoId: item.huecoId || null, materiaId: item.materiaId, temaId: item.temaId,
    tipo: item.tipo, pretest: !!item.pretest, minPlan: Math.max(5, Math.min(item.min || 15, lim - ahora)),
    fase: 'inicio', acumMs: 0, desde: null, cola: [], resto: [], primeros: {}, acertadas: [], revelada: false, intento: '',
    nuevas: [{}, {}, {}], temaTerminado: null, cansancio: null, avisos: {},
  });
  ir('#sesion');
}

const transcurrido = (d) => d.acumMs + (d.desde ? Date.now() - d.desde : 0);
const mmss = (ms) => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor(ms / 1000) % 60)}`;
const pregDe = (d, id) => S.preguntas.find((p) => p.id === id) || d.nuevas.find((p) => p.id === id);
const pregsTema = (temaId) => S.preguntas.filter((p) => p.temaId === temaId);

/** Llamado cada segundo desde app.js: actualiza el reloj y dispara los avisos sonoros. */
export function tick() {
  const d = sesionActiva();
  if (!d || !d.desde) return;
  const ms = transcurrido(d);
  const plan = d.minPlan * 60000;
  const el = $('#crono-t');
  if (el) {
    el.textContent = mmss(ms);
    $('#crono-p').style.width = Math.min(100, (ms / plan) * 100) + '%';
  }
  let cambio = false;
  const avisar = (clave, n, msg) => {
    if (d.avisos[clave]) return;
    d.avisos[clave] = true;
    cambio = true;
    bip(n);
    toast(msg, 5000);
  };
  if (ms >= plan / 2) avisar('mitad', 1, 'Mitad del bloque.');
  if (ms >= plan) avisar('fin', 3, d.fase === 'estudio' ? 'Terminó el bloque. Cerrá el material y escribí tus preguntas.' : 'Terminó el bloque. Cerrá la sesión cuando termines esta pregunta.');
  if (horaActualMin() >= aMin(S.ajustes.horaLimite)) avisar('limite', 3, `Son las ${S.ajustes.horaLimite}. Cerrá la sesión y andá a dormir.`);
  if (cambio) persistir({ ...sesionActiva(), avisos: d.avisos });
}

// ---------- Transiciones ----------
function arrancar(d, cansancio) {
  const aj = S.ajustes;
  d.cansancio = cansancio;
  const cansado = cansancio === 3 || horaActualMin() >= aMin(aj.horaCansado);
  if (cansado) {
    d.modoCansado = true;
    d.minPlan = Math.min(d.minPlan, aj.minCansado);
    if (d.tipo === 'nuevo') {
      const ctx = getCtx();
      const t = repasoCansado(ctx, S.temas, d.fecha, d.materiaId);
      if (!t) {
        localStorage.removeItem(K);
        toast('Modo cansado: hoy no va material nuevo y no tenés temas con preguntas para repasar. Descansá.', 5000);
        return ir('#hoy');
      }
      toast('Modo cansado: cambié el material nuevo por un repaso corto.', 4500);
      Object.assign(d, { tipo: 'repaso', temaId: t.id, materiaId: t.materiaId, pretest: false });
    }
  }
  const ids = mezclar(pregsTema(d.temaId).map((p) => p.id));
  if (d.tipo === 'repaso' && !ids.length) {
    localStorage.removeItem(K);
    toast('Ese tema todavía no tiene preguntas. Cargalas desde Materias o hacé una sesión de material nuevo.', 5000);
    return ir('#hoy');
  }
  d.desde = Date.now();
  if (d.pretest && ids.length) {
    const n = Math.min(5, ids.length);
    d.cola = ids.slice(0, n);
    d.resto = ids.slice(n);
    d.fase = 'pretest';
  } else if (d.tipo === 'repaso') {
    d.cola = ids;
    d.fase = 'quiz';
  } else {
    d.fase = 'estudio';
  }
  persistir(d);
  render();
}

function marcar(d, acierto) {
  const id = d.cola.shift();
  if (!(id in d.primeros)) d.primeros[id] = acierto;
  if (acierto) d.acertadas.push(id);
  else if (d.fase === 'quiz') d.cola.push(id);
  else d.resto.push(id); // pretest fallado: vuelve en la ronda con apunte
  d.revelada = false;
  d.intento = '';
  if (!d.cola.length) {
    if (d.fase === 'pretest') d.fase = 'material';
    else irACierre(d);
  }
  persistir(d);
  render();
}
function irACierre(d) {
  d.acumMs = transcurrido(d);
  d.desde = null;
  d.fase = 'cierre';
}

async function guardarSesion(d, nota, cansancio) {
  const aj = S.ajustes;
  const m = S.materias.find((x) => x.id === d.materiaId);
  const t = S.temas.find((x) => x.id === d.temaId);
  const nuevas = d.nuevas.filter((p) => p.id).map((p) => ({ id: p.id, temaId: d.temaId, enunciado: p.enunciado, respuesta: p.respuesta, creada: d.fecha, historial: [] }));
  if (nuevas.length) await guardarVarios('preguntas', nuevas);
  const tocadas = [];
  for (const [id, acierto] of Object.entries(d.primeros)) {
    const p = S.preguntas.find((x) => x.id === id);
    if (!p) continue;
    p.historial = [...(p.historial || []), { fecha: d.fecha, sesionId: d.id, acierto }];
    tocadas.push(p);
  }
  if (tocadas.length) await guardarVarios('preguntas', tocadas);
  const total = Object.keys(d.primeros).length;
  const aciertos = Object.values(d.primeros).filter(Boolean).length;
  let t2 = t;
  if (t && m) {
    if (d.tipo === 'nuevo') t2 = trasNuevo(t, m, { temaTerminado: !!d.temaTerminado }, d.fecha, aj);
    else t2 = trasRepaso(t, m, { aciertos, total, completa: pregsTema(d.temaId).every((p) => d.acertadas.includes(p.id)) }, d.fecha, aj);
    await guardar('temas', t2);
  }
  await guardar('sesiones', {
    id: d.id, fecha: d.fecha, huecoId: d.huecoId, materiaId: d.materiaId, temaId: d.temaId,
    tipo: d.tipo === 'repaso' && d.pretest ? 'pretest' : d.tipo,
    minPlanificados: d.minPlan, minReales: Math.max(1, Math.round(d.acumMs / 60000)),
    aciertos, total, temaTerminado: d.tipo === 'nuevo' ? !!d.temaTerminado : undefined,
    nota, cansancio, modoCansado: !!d.modoCansado,
  });
  localStorage.removeItem(K);
  const dominado = t2.estado === 'dominado' && t.estado !== 'dominado';
  toast(`${dominado ? 'Tema dominado. ' : ''}Guardado. "${t2.titulo}" vuelve el ${fechaCorta(t2.proximoRepaso)}.`, 4500);
  ir('#hoy');
}

// ---------- Render ----------
const enlazar = (txt) => esc(txt).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
function apunteHTML(t) {
  return t.apunte
    ? `<div class="tarjeta"><small>Tu apunte</small><div class="apunte">${enlazar(t.apunte)}</div></div>`
    : '<p class="aviso">Este tema no tiene apunte cargado en la app. Abrí tu material (libro, PDF, carpeta).</p>';
}

function render() {
  const cont = $('#vista');
  const d = sesionActiva();
  if (!d) return ir('#hoy');
  const m = S.materias.find((x) => x.id === d.materiaId);
  const t = S.temas.find((x) => x.id === d.temaId);
  if (!m || !t) {
    localStorage.removeItem(K);
    return ir('#hoy');
  }
  const cab = `<div class="fila"><span class="punto" style="background:${colorDe(m)}"></span><div class="crece"><small>${esc(m.nombre)} · ${ETIQUETA[d.tipo]}${d.modoCansado ? ' · modo cansado' : ''}</small><h3>${esc(t.titulo)}</h3></div></div>`;
  const crono = d.fase === 'inicio' ? '' : `<div class="crono"><b id="crono-t" class="num">${mmss(transcurrido(d))}</b><span class="chico">de ${d.minPlan} min</span>
      <span class="fila">${d.fase !== 'cierre' ? `<button class="btn chica" data-a="pausa">${d.desde ? 'Pausar' : 'Seguir'}</button>` : ''}<button class="btn chica" data-a="menu">Salir</button></span></div>
    <div class="progreso"><i id="crono-p"></i></div>`;
  let cuerpo = '';

  if (d.fase === 'inicio') {
    cuerpo = `<p class="chico">${d.minPlan} min · ${d.tipo === 'nuevo' ? 'vas a ver material nuevo y cerrar escribiendo 3 a 5 preguntas' : 'vas a responder de memoria hasta acertar cada pregunta una vez'}${d.pretest ? ' · arranca con pretest sin apunte' : ''}.</p>
      <h2>¿Cómo venís de energía?</h2>
      <div class="energia"><button class="btn" data-energia="1"><b>1</b><small>Bien</small></button><button class="btn" data-energia="2"><b>2</b><small>Normal</small></button><button class="btn" data-energia="3"><b>3</b><small>Cansado</small></button></div>
      <p class="chico tenue">Si marcás 3 o ya pasaron las ${esc(S.ajustes.horaCansado)}, la sesión es solo repaso de ${S.ajustes.minCansado} min.</p>
      <button class="btn ancha" data-a="descartar">Ahora no</button>`;
  } else if (d.fase === 'pretest' || d.fase === 'quiz') {
    const p = pregDe(d, d.cola[0]);
    const faltan = d.cola.length;
    cuerpo = `<p class="chico">${d.fase === 'pretest' ? `<b>Pretest sin apunte.</b> Hace ${S.ajustes.pretestDias} días o más que no ves este tema: primero intentá recordar. ` : ''}Quedan ${faltan} ${faltan === 1 ? 'pregunta' : 'preguntas'}.</p>
      <div class="carta">${esc(p.enunciado)}</div>
      ${d.revelada
        ? `${d.intento ? `<div class="tarjeta"><small>Tu intento</small><div class="apunte">${esc(d.intento)}</div></div>` : ''}
           <div class="carta resp"><small class="chico">Respuesta</small>\n${esc(p.respuesta)}</div>
           <p class="chico">Comparala con tu intento y corregí.</p>
           <div class="botones"><button class="btn" data-a="fallo">Fallé</button><button class="btn pri" data-a="acierto">Acerté</button></div>`
        : `<label class="campo">Tu intento (decilo en voz alta o escribilo)<textarea id="intento" rows="3">${esc(d.intento)}</textarea></label>
           <button class="btn pri ancha" data-a="revelar">Revelar respuesta</button>`}
      ${d.fase === 'quiz' && d.tipo === 'repaso' && !d.pretest ? '' : ''}`;
  } else if (d.fase === 'material') {
    const ids = Object.keys(d.primeros);
    const ok = ids.filter((id) => d.primeros[id]).length;
    cuerpo = `<div class="aviso">Pretest: ${ok} de ${ids.length}. Ahora sí, abrí el material y corregí lo que fallaste.</div>${apunteHTML(t)}
      <button class="btn pri ancha" data-a="seguir">${d.tipo === 'nuevo' ? 'Seguir con el material nuevo' : d.resto.length ? `Seguir con las preguntas (${d.resto.length})` : 'Cerrar sesión'}</button>`;
  } else if (d.fase === 'estudio') {
    cuerpo = `<p class="chico">Estudiá el material de este tema. Leer no cuenta todavía: la sesión se cierra escribiendo preguntas y respondiéndolas.</p>${apunteHTML(t)}
      <button class="btn pri ancha" data-a="escribir">Terminé el bloque: escribir preguntas</button>`;
  } else if (d.fase === 'escribir') {
    cuerpo = `<p class="chico">Escribí entre 3 y 5 preguntas sobre lo que acabás de ver. Son las que van a volver en los repasos.</p>
      <div class="pila" id="nuevas">${d.nuevas.map((p, i) => `<div class="tarjeta pila"><label class="campo">Pregunta ${i + 1}<textarea rows="2" data-i="${i}" data-k="enunciado">${esc(p.enunciado || '')}</textarea></label>
        <label class="campo">Respuesta<textarea rows="2" data-i="${i}" data-k="respuesta">${esc(p.respuesta || '')}</textarea></label></div>`).join('')}</div>
      ${d.nuevas.length < 5 ? '<button class="btn ancha" data-a="otra">Agregar otra pregunta</button>' : ''}
      <h2>¿Terminaste de ver el tema?</h2>
      <div class="botones"><button class="btn ${d.temaTerminado === true ? 'pri' : ''}" data-term="1">Sí, completo</button><button class="btn ${d.temaTerminado === false ? 'pri' : ''}" data-term="0">No, sigo otro día</button></div>
      <p class="rojo-txt chico" id="err" hidden></p>
      <button class="btn pri ancha" data-a="aquiz">Responderlas ahora</button>`;
  } else if (d.fase === 'cierre') {
    const total = Object.keys(d.primeros).length;
    const ok = Object.values(d.primeros).filter(Boolean).length;
    const completa = d.tipo === 'nuevo' || pregsTema(d.temaId).every((p) => d.acertadas.includes(p.id));
    cuerpo = `<div class="indicadores"><div class="indicador"><b>${ok}/${total}</b><span>aciertos al primer intento</span></div><div class="indicador"><b>${Math.max(1, Math.round(d.acumMs / 60000))} min</b><span>reales (plan: ${d.minPlan})</span></div></div>
      ${completa ? '' : '<p class="aviso">Quedaron preguntas sin acertar: el tema vuelve antes.</p>'}
      <label class="campo">Nota de una línea<input id="nota" maxlength="140" placeholder="Qué avanzaste o qué te costó"></label>
      <h2>Cansancio</h2>
      <div class="energia">${[1, 2, 3].map((n) => `<button class="btn ${d.cansancio === n ? 'sel' : ''}" data-cans="${n}"><b>${n}</b><small>${['Bien', 'Normal', 'Cansado'][n - 1]}</small></button>`).join('')}</div>
      <button class="btn pri ancha" data-a="guardar">Guardar sesión</button>`;
  }
  cont.innerHTML = `<div class="pila">${cab}${crono}${cuerpo}</div>`;
  tick();
}

function validarNuevas(d) {
  const llenas = d.nuevas.filter((p) => p.enunciado?.trim() && p.respuesta?.trim());
  if (llenas.length < 3) return 'Necesitás al menos 3 preguntas con su respuesta.';
  if (d.nuevas.some((p) => !!p.enunciado?.trim() !== !!p.respuesta?.trim())) return 'Hay una pregunta sin respuesta (o al revés).';
  if (d.temaTerminado == null) return 'Decime si terminaste de ver el tema.';
  return null;
}

async function onClick(e) {
  const d = sesionActiva();
  if (!d) return;
  prepararAudio();
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.energia) return arrancar(d, +b.dataset.energia);
  if (b.dataset.term) { d.temaTerminado = b.dataset.term === '1'; persistir(d); return render(); }
  if (b.dataset.cans) { d.cansancio = +b.dataset.cans; d.notaTmp = $('#nota')?.value || ''; persistir(d); render(); $('#nota').value = d.notaTmp; return; }
  switch (b.dataset.a) {
    case 'descartar': localStorage.removeItem(K); return ir('#hoy');
    case 'pausa':
      if (d.desde) { d.acumMs = transcurrido(d); d.desde = null; } else d.desde = Date.now();
      persistir(d); return render();
    case 'menu': {
      const puedeCerrar = d.fase === 'pretest' || d.fase === 'quiz' || d.fase === 'material';
      if (puedeCerrar && d.tipo !== 'nuevo' && Object.keys(d.primeros).length && await confirmar('¿Cerrar la sesión ahora y guardar lo que respondiste?', 'Cerrar y guardar')) { irACierre(d); persistir(d); return render(); }
      if (await confirmar('¿Descartar esta sesión? No se guarda nada.', 'Descartar')) { localStorage.removeItem(K); ir('#hoy'); }
      return;
    }
    case 'revelar': d.intento = $('#intento').value; d.revelada = true; persistir(d); return render();
    case 'acierto': return marcar(d, true);
    case 'fallo': return marcar(d, false);
    case 'seguir':
      if (d.tipo === 'nuevo') d.fase = 'estudio';
      else if (d.resto.length) { d.cola = d.resto; d.resto = []; d.fase = 'quiz'; } else irACierre(d);
      persistir(d); return render();
    case 'escribir': d.fase = 'escribir'; persistir(d); return render();
    case 'otra': d.nuevas.push({}); persistir(d); return render();
    case 'aquiz': {
      const err = validarNuevas(d);
      if (err) { const p = $('#err'); p.textContent = err; p.hidden = false; return; }
      d.nuevas = d.nuevas.filter((p) => p.enunciado?.trim()).map((p) => ({ id: uid(), enunciado: p.enunciado.trim(), respuesta: p.respuesta.trim() }));
      d.cola = d.nuevas.map((p) => p.id);
      d.fase = 'quiz';
      persistir(d); return render();
    }
    case 'guardar':
      b.disabled = true;
      return guardarSesion(d, $('#nota').value.trim(), d.cansancio || 2);
  }
}
function onInput(e) {
  const el = e.target;
  const d = sesionActiva();
  if (!d) return;
  if (el.id === 'intento') { d.intento = el.value; persistir(d); }
  if (el.dataset.k) { d.nuevas[+el.dataset.i][el.dataset.k] = el.value; persistir(d); }
}

export function pantallaSesion(cont) {
  cont.onclick = onClick;
  cont.oninput = onInput;
  render();
}
void $$;
