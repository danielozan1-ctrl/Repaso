// Piezas compartidas por las pantallas.
import { S } from '../db.js';
import { crearCtx } from '../engine.js';
import { hoyISO, horaActualMin } from '../fechas.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
export const ir = (hash) => {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
};
export const redibujar = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

export function getCtx() {
  const ctx = crearCtx(S, hoyISO());
  ctx.ahoraMin = horaActualMin();
  return ctx;
}
export const colorDe = (m) => `var(--c${(m?.color ?? 0) % 8})`;
export const PROGRAMAS = { espaciado: 'Repaso espaciado', sprint: 'Sprint a parcial', mantenimiento: 'Mantenimiento' };
export const TIPOS_EXAMEN = { parcial: 'Parcial', recuperatorio: 'Recuperatorio', final: 'Final', entrega: 'Entrega' };
export const ESTADOS = { no_visto: 'No visto', en_curso: 'En curso', dominado: 'Dominado' };
export const enDias = (n) => (n === 0 ? 'hoy' : n === 1 ? 'mañana' : n < 0 ? `hace ${-n} d` : `en ${n} días`);
export const num = (x, d = 1) => x.toLocaleString('es-AR', { maximumFractionDigits: d });

let tToast;
export function toast(msg, ms = 3200) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('ver');
  clearTimeout(tToast);
  tToast = setTimeout(() => el.classList.remove('ver'), ms);
}

export function cerrarModal() {
  $('#modal-raiz').innerHTML = '';
}
/** Abre una hoja modal. Devuelve el elemento .hoja para enganchar eventos. */
export function modal(titulo, html) {
  const raiz = $('#modal-raiz');
  raiz.innerHTML = `<div class="velo"><div class="hoja" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
    <header><h3>${esc(titulo)}</h3><button class="cerrar" data-cerrar aria-label="Cerrar">✕</button></header>${html}</div></div>`;
  const velo = raiz.firstElementChild;
  velo.addEventListener('click', (e) => {
    if (e.target === velo || e.target.closest('[data-cerrar]')) cerrarModal();
  });
  return $('.hoja', raiz);
}

function campoHTML(c) {
  const v = c.value ?? '';
  const attrs = `name="${c.name}" ${c.required ? 'required' : ''} ${c.attrs || ''}`;
  if (c.type === 'checkbox') return `<label class="check"><input type="checkbox" name="${c.name}" ${c.value ? 'checked' : ''}> ${esc(c.label)}</label>`;
  let ctrl;
  if (c.type === 'select') ctrl = `<select ${attrs}>${c.options.map(([val, txt]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(txt)}</option>`).join('')}</select>`;
  else if (c.type === 'textarea') ctrl = `<textarea ${attrs} rows="${c.rows || 3}" placeholder="${esc(c.placeholder || '')}">${esc(v)}</textarea>`;
  else ctrl = `<input type="${c.type || 'text'}" ${attrs} value="${esc(v)}" placeholder="${esc(c.placeholder || '')}">`;
  return `<label class="campo">${esc(c.label)}${ctrl}${c.ayuda ? `<small>${esc(c.ayuda)}</small>` : ''}</label>`;
}
/**
 * Formulario modal. onOk(valores) puede devolver un string de error para no cerrar.
 * onEliminar opcional agrega un botón de borrar.
 */
export function formModal({ titulo, campos, ok = 'Guardar', onOk, onEliminar, intro = '' }) {
  const filas = [];
  for (let i = 0; i < campos.length; i++) {
    const c = campos[i];
    if (c.mitad && campos[i + 1]?.mitad) {
      filas.push(`<div class="dos">${campoHTML(c)}${campoHTML(campos[i + 1])}</div>`);
      i++;
    } else filas.push(campoHTML(c));
  }
  const hoja = modal(titulo, `<form class="pila" novalidate>${intro ? `<p class="chico">${intro}</p>` : ''}${filas.join('')}
    <p class="rojo-txt chico" data-error hidden></p>
    <div class="botones">${onEliminar ? '<button type="button" class="btn peligro" data-eliminar>Eliminar</button>' : ''}<button class="btn pri">${esc(ok)}</button></div></form>`);
  const form = $('form', hoja);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = {};
    for (const c of campos) {
      const el = form.elements[c.name];
      v[c.name] = c.type === 'checkbox' ? el.checked : el.value.trim();
      if (c.required && !v[c.name]) return mostrar(`Falta completar: ${c.label}`);
    }
    const err = await onOk(v);
    if (typeof err === 'string') return mostrar(err);
    cerrarModal();
    redibujar();
  });
  const mostrar = (m) => {
    const p = $('[data-error]', form);
    p.textContent = m;
    p.hidden = false;
  };
  if (onEliminar) $('[data-eliminar]', form).addEventListener('click', async () => {
    if (await onEliminar() === false) return;
    cerrarModal();
    redibujar();
  });
  return hoja;
}

export function confirmar(mensaje, ok = 'Sí') {
  return new Promise((res) => {
    const hoja = modal('Confirmá', `<p>${esc(mensaje)}</p><div class="botones"><button class="btn" data-no>Cancelar</button><button class="btn pri" data-si>${esc(ok)}</button></div>`);
    let r = false;
    $('[data-si]', hoja).addEventListener('click', () => { r = true; cerrarModal(); res(true); });
    $('[data-no]', hoja).addEventListener('click', () => { cerrarModal(); res(false); });
    hoja.parentElement.addEventListener('click', () => setTimeout(() => !r && !$('#modal-raiz').firstChild && res(false), 0));
  });
}

export function descargar(nombre, contenido, mime) {
  const url = URL.createObjectURL(new Blob([contenido], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Texto de proyección para una materia (principio 5: nunca pide estimar). */
export function textoProyeccion(p) {
  switch (p.estado) {
    case 'completo': return { cls: 'verde-txt', txt: `Ya viste los ${p.total} temas. Queda repasar.` };
    case 'llega': return { cls: 'verde-txt', txt: `A este ritmo cubrís ${p.cubiertos} de ${p.total} temas antes del examen.` };
    case 'no_llega': return { cls: 'rojo-txt', txt: `A este ritmo cubrís ${p.cubiertos} de ${p.total} temas antes del examen. Te ${p.bloquesPorSemana === 1 ? 'falta 1 bloque largo' : `faltan ${p.bloquesPorSemana} bloques largos`} más por semana.` };
    case 'sin_datos': return { cls: 'tenue', txt: `Viste ${p.vistos} de ${p.total} temas. Todavía no hay ritmo medido: aparece cuando termines un tema nuevo.` };
    default: return { cls: 'tenue', txt: 'Sin fecha de examen cargada.' };
  }
}
