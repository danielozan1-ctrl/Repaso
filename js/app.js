// Arranque, router por hash y reloj global de la sesión.
import { cargar } from './db.js';
import { $, $$, cerrarModal } from './ui/comun.js';
import { pantallaHoy } from './ui/hoy.js';
import { pantallaSesion, sesionActiva, tick, prepararAudio } from './ui/sesion.js';
import { pantallaMaterias, pantallaMateria } from './ui/materias.js';
import { pantallaSemana } from './ui/semana.js';
import { pantallaRitmo } from './ui/ritmo.js';
import { pantallaAjustes } from './ui/ajustes.js';

const RUTAS = { hoy: pantallaHoy, materias: pantallaMaterias, materia: pantallaMateria, semana: pantallaSemana, ritmo: pantallaRitmo, ajustes: pantallaAjustes, sesion: pantallaSesion };

function render() {
  const [ruta, arg] = (location.hash.slice(1) || 'hoy').split('/');
  const fn = RUTAS[ruta] || pantallaHoy;
  const cont = $('#vista');
  cont.onclick = cont.oninput = cont.onchange = null;
  const y = ruta === render.ultima ? window.scrollY : 0;
  document.body.classList.toggle('en-sesion', ruta === 'sesion');
  $$('#tabs a').forEach((a) => a.classList.toggle('activa', a.dataset.tab === (ruta === 'materia' ? 'materias' : ruta)));
  const barra = $('#barra-sesion');
  const activa = sesionActiva();
  barra.hidden = !activa || ruta === 'sesion';
  if (!barra.hidden) barra.textContent = 'Tenés una sesión abierta. Tocá para volver.';
  fn(cont, arg);
  window.scrollTo(0, y);
  render.ultima = ruta;
}

async function iniciar() {
  try {
    await cargar();
  } catch (e) {
    $('#vista').innerHTML = `<h1>No pude abrir la base de datos</h1><p>La app necesita IndexedDB. Si estás en modo privado, probá en una ventana normal.</p><p class="chico">${String(e?.message || e)}</p>`;
    return;
  }
  window.addEventListener('hashchange', () => { cerrarModal(); render(); });
  $('#barra-sesion').addEventListener('click', () => (location.hash = '#sesion'));
  document.addEventListener('pointerdown', () => sesionActiva() && prepararAudio(), { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    tick();
    const r = location.hash.slice(1) || 'hoy';
    if (r === 'hoy' && !$('#modal-raiz').firstChild) render(); // al volver a la app, recalcular
  });
  setInterval(tick, 1000);
  if (sesionActiva() && sesionActiva().fase !== 'inicio') location.hash = '#sesion';
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
iniciar();
