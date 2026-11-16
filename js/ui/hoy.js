// Pantalla Hoy: qué toca en cada hueco.
import { S, uid, guardar } from '../db.js';
import { planDia, planLibre, indicadores, proyeccion } from '../engine.js';
import { aMin, aHHMM, DIAS_L, diaSemana, hoyISO } from '../fechas.js';
import { esc, $, getCtx, colorDe, toast, modal, cerrarModal, formModal, textoProyeccion, redibujar } from './comun.js';
import { iniciarSesion, sesionActiva, prepararAudio } from './sesion.js';

let itemsVista = [];

function itemHTML(it, huecoId) {
  const m = S.materias.find((x) => x.id === it.materiaId);
  const t = S.temas.find((x) => x.id === it.temaId);
  const i = itemsVista.push({ ...it, huecoId }) - 1;
  const detalle = it.tipo === 'nuevo'
    ? `Material nuevo · ${it.min} min${it.pretest ? ' · con pretest' : ''}`
    : `Repaso · ~${it.min} min${it.pretest ? ' · pretest sin apunte' : ''}${it.fallos ? ` · ${it.fallos} ${it.fallos === 1 ? 'fallo reciente' : 'fallos recientes'}` : ''}${it.atraso > 0 ? ` · vencido hace ${it.atraso} d` : ''}`;
  return `<div class="fila" style="margin-top:10px"><span class="punto" style="background:${colorDe(m)}"></span>
    <div class="crece"><div class="corta"><b>${esc(t.titulo)}</b></div><small>${esc(m.nombre)} · ${detalle}</small></div>
    <button class="btn pri chica" data-empezar="${i}">Empezar</button></div>`;
}

export function pantallaHoy(cont) {
  const ctx = getCtx();
  const hoy = ctx.fecha;
  const ahora = ctx.ahoraMin;
  const aj = ctx.aj;
  itemsVista = [];
  const ind = indicadores(ctx);
  const plan = planDia(ctx, S.temas, hoy, { desdeMin: ahora });
  const hechasHoy = S.sesiones.filter((s) => s.fecha === hoy);
  const fueraDeHora = ahora >= aMin(aj.horaLimite);

  const alertas = S.materias.map((m) => ({ m, p: proyeccion(ctx, m) })).filter((x) => x.p.estado === 'no_llega')
    .map((x) => `<div class="aviso rojo">${esc(x.m.nombre)}: ${esc(textoProyeccion(x.p).txt)}</div>`).join('');

  let bloques = '';
  if (!S.materias.length) {
    bloques = `<div class="tarjeta pila"><h3>Empezá cargando una materia</h3><p class="chico">Pegá el cronograma tal como te lo dieron: la app lee las fechas, te pregunta lo que falte y calcula los deadlines.</p><a class="btn pri" href="#materias">Cargar materia</a></div>`;
  } else if (!plan.bloques.length) {
    bloques = `<p class="aviso">Hoy no tenés huecos fijos. Si aparece un rato libre, usá "Tengo un rato ahora".</p>`;
  } else {
    bloques = plan.bloques.map((b) => {
      const enCurso = !b.pasado && b.inicio <= ahora;
      const cab = `<div class="fila entre"><b class="num">${esc(b.hueco.inicio)}–${aHHMM(b.fin)}</b><span class="chip">${b.hueco.tipo}${b.cansado ? ' · solo repaso' : ''}</span></div>`;
      const frase = b.hueco.planSiEntonces ? `<p class="chico" style="margin-top:4px">${esc(b.hueco.planSiEntonces)}</p>` : '';
      let cuerpo;
      if (b.pasado) cuerpo = '<small class="tenue">Ya pasó. Lo pendiente se reacomodó solo.</small>';
      else if (!b.items.length) cuerpo = '<small class="tenue">Nada vencido para este hueco. Queda libre.</small>';
      else cuerpo = b.items.map((it) => itemHTML(it, b.hueco.id)).join('');
      return `<div class="tarjeta ${b.pasado ? 'pasado' : ''} ${enCurso ? 'ahora' : ''}">${cab}${frase}${cuerpo}</div>`;
    }).join('');
  }

  const recordatorio = aj.recordatorio21 && ahora >= 21 * 60 && !hechasHoy.length && S.temas.length
    ? `<div class="tarjeta pila"><h3>¿Hiciste la sesión de hoy?</h3><div class="botones"><button class="btn pri" data-a="rapido">Sí, registrala</button><button class="btn" data-a="no-hoy">No</button></div><small class="tenue">El registro rápido anota el tiempo. No cuenta como repaso porque no hubo autoevaluación.</small></div>`
    : '';

  cont.innerHTML = `<h1>${DIAS_L[diaSemana(hoy)][0].toUpperCase() + DIAS_L[diaSemana(hoy)].slice(1)}</h1>
    <div class="indicadores">
      <div class="indicador"><b>${ind.dominados}/${ind.total}</b><span>temas dominados</span></div>
      <div class="indicador"><b>${ind.vencidos}</b><span>repasos vencidos</span></div>
    </div>
    ${alertas ? `<div class="pila" style="margin-top:10px">${alertas}</div>` : ''}
    ${recordatorio ? `<div style="margin-top:10px">${recordatorio}</div>` : ''}
    <h2>Qué toca hoy</h2>${bloques}
    ${hechasHoy.length ? `<p class="chico" style="margin-top:10px">Hoy registraste ${hechasHoy.length} ${hechasHoy.length === 1 ? 'sesión' : 'sesiones'}.</p>` : ''}
    ${fueraDeHora ? `<p class="aviso" style="margin-top:10px">Pasaron las ${esc(aj.horaLimite)}: no se inician sesiones. Mañana se recalcula todo.</p>` : ''}
    ${S.temas.length ? `<h2>Fuera de los huecos</h2><div class="botones"><button class="btn" data-a="libre" ${fueraDeHora ? 'disabled' : ''}>Tengo un rato ahora</button><button class="btn" data-a="mano" ${fueraDeHora ? 'disabled' : ''}>Elegir tema a mano</button></div>` : ''}`;

  cont.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    prepararAudio();
    if (b.dataset.empezar) return iniciarSesion(itemsVista[+b.dataset.empezar]);
    if (b.dataset.a === 'libre') return ratoLibre();
    if (b.dataset.a === 'mano') return aMano();
    if (b.dataset.a === 'no-hoy') { sessionStorage.setItem('repaso.no21', hoy); b.closest('.tarjeta').remove(); toast('Listo. Mañana se recalcula.'); }
    if (b.dataset.a === 'rapido') return registroRapido(plan);
  };
  if (sessionStorage.getItem('repaso.no21') === hoy) cont.querySelector('[data-a="no-hoy"]')?.closest('.tarjeta').remove();
  void sesionActiva;
}

function ratoLibre() {
  const hoja = modal('Tengo un rato ahora', `<p class="chico">¿Cuántos minutos tenés? La app decide qué conviene.</p>
    <div class="botones">${[10, 15, 20, 30, 45, 60, 90].map((n) => `<button class="btn" data-min="${n}">${n}</button>`).join('')}</div><div id="prop" class="pila"></div>`);
  let items = [];
  hoja.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.min) {
      const ctx = getCtx();
      const r = planLibre(ctx, S.temas, ctx.fecha, ctx.ahoraMin, +b.dataset.min);
      items = r.items;
      $('#prop', hoja).innerHTML = items.length
        ? `${r.cansado ? `<p class="chico">Modo cansado: solo repaso de ${r.min} min.</p>` : ''}<div class="lista">${items.map((it, i) => {
            const t = S.temas.find((x) => x.id === it.temaId);
            const m = S.materias.find((x) => x.id === it.materiaId);
            return `<button data-ir="${i}"><span class="punto" style="background:${colorDe(m)}"></span><span class="crece"><b>${esc(t.titulo)}</b><br><small>${esc(m.nombre)} · ${it.tipo === 'nuevo' ? 'material nuevo' : 'repaso'} · ${it.min} min</small></span><span class="chip">Empezar</span></button>`;
          }).join('')}</div>`
        : '<p class="aviso">No hay repasos vencidos y en este rato no entra material nuevo (va solo en bloques de 45 min o más, antes de las 21). Podés elegir un tema a mano.</p>';
    }
    if (b.dataset.ir) { cerrarModal(); iniciarSesion(items[+b.dataset.ir]); }
  });
}

function aMano() {
  const opciones = S.temas.slice().sort((a, b) => a.materiaId.localeCompare(b.materiaId) || a.orden - b.orden)
    .map((t) => [t.id, `${S.materias.find((m) => m.id === t.materiaId)?.nombre} — ${t.titulo}`]);
  formModal({
    titulo: 'Elegir tema a mano', ok: 'Empezar',
    campos: [
      { name: 'tema', label: 'Tema', type: 'select', options: opciones },
      { name: 'tipo', label: 'Tipo de sesión', type: 'select', options: [['repaso', 'Repaso con preguntas'], ['nuevo', 'Material nuevo']] },
      { name: 'min', label: 'Minutos', type: 'number', value: 20, attrs: 'min="5" max="180"' },
    ],
    onOk: (v) => {
      const t = S.temas.find((x) => x.id === v.tema);
      const n = S.preguntas.filter((p) => p.temaId === t.id).length;
      if (v.tipo === 'repaso' && !n) return 'Ese tema no tiene preguntas todavía. Elegí "Material nuevo" o cargalas desde Materias.';
      const ctx = getCtx();
      const dias = t.ultimaSesion ? Math.round((new Date(ctx.fecha) - new Date(t.ultimaSesion)) / 864e5) : 0;
      setTimeout(() => iniciarSesion({ materiaId: t.materiaId, temaId: t.id, tipo: v.tipo, min: +v.min || 20, pretest: n > 0 && dias >= ctx.aj.pretestDias }), 0);
    },
  });
}

async function registroRapido(plan) {
  const it = plan.bloques.flatMap((b) => b.items)[0] || getCtx() && planLibre(getCtx(), S.temas, hoyISO(), 20 * 60, 20).items[0];
  const t = it ? S.temas.find((x) => x.id === it.temaId) : S.temas[0];
  await guardar('sesiones', {
    id: uid(), fecha: hoyISO(), huecoId: null, materiaId: t.materiaId, temaId: t.id, tipo: it?.tipo || 'repaso',
    minPlanificados: it?.min || 15, minReales: it?.min || 15, aciertos: 0, total: 0, nota: 'Registro rápido', cansancio: 2, rapida: true,
  });
  toast('Anotado.');
  redibujar();
}
