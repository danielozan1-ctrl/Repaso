// Pantalla Semana: grilla de huecos editable; arrastrar para mover.
import { S, uid, guardar, borrar } from '../db.js';
import { semanaTentativa } from '../engine.js';
import { aMin, aHHMM, DIAS, DIAS_L, diaSemana } from '../fechas.js';
import { esc, $, $$, getCtx, formModal, redibujar, toast } from './comun.js';

const PX_HORA = 40;
const ORDEN = [1, 2, 3, 4, 5, 6, 0]; // lunes primero

export function validarHueco(h, aj) {
  const ini = aMin(h.inicio);
  const fin = aMin(h.fin);
  if (!(fin > ini)) return 'La hora de fin tiene que ser posterior a la de inicio.';
  if (fin > aMin(aj.horaLimite)) return `No se puede estudiar después de las ${aj.horaLimite}: el sueño no se toca.`;
  if (h.tipo === 'largo' && fin - ini < 45) return 'Un hueco largo necesita al menos 45 minutos.';
  return null;
}

export function editarHueco(h, nuevo = false) {
  formModal({
    titulo: nuevo ? 'Nuevo hueco' : 'Editar hueco',
    campos: [
      { name: 'dia', label: 'Día', type: 'select', value: h.dia, options: ORDEN.map((d) => [d, DIAS_L[d]]) },
      { name: 'inicio', label: 'Desde', type: 'time', mitad: true, value: h.inicio, required: true },
      { name: 'fin', label: 'Hasta', type: 'time', mitad: true, value: h.fin, required: true },
      { name: 'tipo', label: 'Tipo', type: 'select', value: h.tipo, options: [['corto', 'Corto: solo repaso con preguntas'], ['largo', 'Largo: repaso + material nuevo (45 min o más)']] },
      { name: 'planSiEntonces', label: 'Plan si-entonces', type: 'textarea', rows: 2, value: h.planSiEntonces || '', placeholder: 'Si es martes y llegué a casa, hago 20 min de Derecho antes de cenar.' },
      { name: 'activo', label: 'Activo', type: 'checkbox', value: h.activo !== false },
    ],
    onOk: (v) => {
      const n = { ...h, ...v, dia: +v.dia };
      return validarHueco(n, S.ajustes) || guardar('huecos', n).then(() => {});
    },
    onEliminar: nuevo ? null : () => borrar('huecos', h.id).then(() => {}),
  });
}

export function pantallaSemana(cont) {
  const ctx = getCtx();
  const lim = aMin(ctx.aj.horaLimite);
  const h0 = Math.min(8, ...S.huecos.map((h) => Math.floor(aMin(h.inicio) / 60)));
  const h1 = Math.ceil(lim / 60);
  const alto = (h1 - h0) * PX_HORA;
  const y = (min) => ((min - h0 * 60) / 60) * PX_HORA;
  const hoyDia = diaSemana(ctx.fecha);

  // Asignación tentativa de los próximos 7 días, por hueco
  const tent = {};
  for (const p of semanaTentativa(ctx).slice(0, 7)) for (const b of p.bloques) {
    if (!b.items.length) continue;
    tent[b.hueco.id] = [...new Set(b.items.map((it) => ctx.mat[it.materiaId]?.nombre))].join(' + ');
  }

  const cols = ORDEN.map((d) => `<div class="col" data-dia="${d}" style="height:${alto}px">${S.huecos.filter((h) => h.dia === d).map((h) => {
    const top = y(aMin(h.inicio));
    const hh = Math.max(16, y(Math.min(aMin(h.fin), lim)) - top);
    return `<button class="bloque ${h.tipo} ${h.activo === false ? 'inactivo' : ''}" data-h="${h.id}" style="top:${top}px;height:${hh}px" aria-label="${DIAS_L[d]} ${h.inicio} a ${h.fin}, ${h.tipo}">${h.inicio}<br>${esc((tent[h.id] || '').slice(0, 14))}</button>`;
  }).join('')}</div>`).join('');
  const horas = Array.from({ length: h1 - h0 + 1 }, (_, i) => `<span style="top:${i * PX_HORA}px">${h0 + i}</span>`).join('');
  const lista = ORDEN.flatMap((d) => S.huecos.filter((h) => h.dia === d).sort((a, b) => aMin(a.inicio) - aMin(b.inicio))).map((h) =>
    `<button data-h="${h.id}"><span class="crece"><b style="text-transform:capitalize">${DIAS[h.dia]} ${h.inicio}–${h.fin}</b> <span class="chip">${h.tipo}</span>${h.activo === false ? ' <span class="chip">inactivo</span>' : ''}<br>
      <small>${tent[h.id] ? `Próximo: ${esc(tent[h.id])}. ` : ''}${esc(h.planSiEntonces || 'Sin plan si-entonces')}</small></span></button>`).join('');

  cont.innerHTML = `<h1>Semana</h1>
    <p class="chico">Arrastrá un hueco para moverlo de día u hora. Tocá para editarlo. Tocá un espacio vacío para crear uno. Nada pasa de las ${esc(ctx.aj.horaLimite)}.</p>
    <div class="grilla" style="--hora:${PX_HORA}px"><div class="cab"></div>${ORDEN.map((d) => `<div class="cab ${d === hoyDia ? 'hoy' : ''}">${DIAS[d]}</div>`).join('')}
      <div class="horas" style="height:${alto}px">${horas}</div>${cols}</div>
    <h2>Huecos y lo que viene</h2>
    <div class="lista">${lista}<button data-a="nuevo"><span class="crece" style="color:var(--acento)">+ Agregar hueco</span></button></div>
    <p class="chico tenue" style="margin-top:8px">La materia de cada hueco es tentativa: se recalcula después de cada sesión.</p>`;

  const grilla = $('.grilla', cont);
  const colEls = $$('.col', grilla);
  const snap = (min) => Math.round(min / 15) * 15;

  cont.onclick = (e) => {
    const b = e.target.closest('button');
    if (b?.dataset.a === 'nuevo') return editarHueco({ id: uid(), dia: hoyDia, inicio: '19:00', fin: '19:30', tipo: 'corto', activo: true, planSiEntonces: '' }, true);
    if (b?.dataset.h && !b.classList.contains('bloque')) return editarHueco(S.huecos.find((h) => h.id === b.dataset.h));
    const col = e.target.classList?.contains('col') ? e.target : null;
    if (col) {
      const r = col.getBoundingClientRect();
      const ini = Math.min(snap(h0 * 60 + ((e.clientY - r.top) / PX_HORA) * 60), lim - 30);
      editarHueco({ id: uid(), dia: +col.dataset.dia, inicio: aHHMM(ini), fin: aHHMM(ini + 30), tipo: 'corto', activo: true, planSiEntonces: '' }, true);
    }
  };

  // Arrastre con pointer events (mouse y táctil)
  grilla.onpointerdown = (e) => {
    const el = e.target.closest('.bloque');
    if (!el) return;
    const h = S.huecos.find((x) => x.id === el.dataset.h);
    const dur = aMin(h.fin) - aMin(h.inicio);
    const x0 = e.clientX, y0 = e.clientY, top0 = parseFloat(el.style.top);
    let movio = false, dia = h.dia, ini = aMin(h.inicio);
    const mover = (ev) => {
      if (!movio && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
      movio = true;
      el.classList.add('arrastra');
      ini = snap(h0 * 60 + ((top0 + ev.clientY - y0) / PX_HORA) * 60);
      ini = Math.max(h0 * 60, Math.min(ini, lim - dur));
      const col = colEls.find((c) => { const r = c.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX < r.right; });
      if (col && col !== el.parentElement) col.append(el);
      dia = +el.parentElement.dataset.dia;
      el.style.top = y(ini) + 'px';
    };
    const soltar = async () => {
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerup', soltar);
      document.removeEventListener('pointercancel', soltar);
      if (!movio) return editarHueco(h);
      const n = { ...h, dia, inicio: aHHMM(ini), fin: aHHMM(ini + dur) };
      const err = validarHueco(n, S.ajustes);
      if (err) toast(err);
      else await guardar('huecos', n);
      redibujar();
    };
    // En document: mover el bloque de columna no corta el arrastre
    document.addEventListener('pointermove', mover);
    document.addEventListener('pointerup', soltar);
    document.addEventListener('pointercancel', soltar);
  };
}
