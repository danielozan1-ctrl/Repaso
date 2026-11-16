// Pantalla Ajustes.
import { S, uid, guardar, borrar, guardarAjustes, exportar, importar, borrarTodo, HUECOS_EJEMPLO } from '../db.js';
import { semanaTentativa } from '../engine.js';
import { generarICS } from '../ics.js';
import { aMin, DIAS, hoyISO } from '../fechas.js';
import { esc, $, getCtx, toast, confirmar, descargar, redibujar } from './comun.js';
import { editarHueco } from './semana.js';
import { prepararAudio, bip } from './sesion.js';

let instalar = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); instalar = e; });

export function exportarICS() {
  const ctx = getCtx();
  const ics = generarICS(semanaTentativa(ctx), ctx.mat);
  descargar(`repaso-${hoyISO()}.ics`, ics, 'text/calendar');
}

export function pantallaAjustes(cont) {
  const aj = S.ajustes;
  const I = aj.intervalos;
  const n = (name, label, value, min, max) => `<label class="campo">${label}<input type="number" inputmode="numeric" name="${name}" value="${value}" min="${min}" max="${max}"></label>`;
  const huecos = S.huecos.slice().sort((a, b) => ((a.dia + 6) % 7) - ((b.dia + 6) % 7) || aMin(a.inicio) - aMin(b.inicio));

  cont.innerHTML = `<h1>Ajustes</h1>
    <h2>Horarios</h2>
    <div class="tarjeta pila">
      <div class="dos"><label class="campo">Hora límite de estudio<input type="time" name="horaLimite" value="${aj.horaLimite}" max="23:00"></label>
      <label class="campo">Modo cansado desde<input type="time" name="horaCansado" value="${aj.horaCansado}"></label></div>
      ${n('minCansado', 'Minutos de un repaso en modo cansado (10–15)', aj.minCansado, 10, 15)}
      <small>La hora límite nunca puede pasar de las 23:00.</small>
    </div>

    <h2>Intervalos de repaso (días)</h2>
    <div class="tarjeta pila">
      <div class="dos">${n('i.espaciado.0', 'Espaciado: mín.', I.espaciado[0], 1, 30)}${n('i.espaciado.1', 'máx.', I.espaciado[1], 1, 60)}</div>
      <div class="dos">${n('i.sprint.0', 'Sprint: mín.', I.sprint[0], 1, 30)}${n('i.sprint.1', 'máx.', I.sprint[1], 1, 60)}</div>
      <div class="dos">${n('i.mantenimiento.0', 'Mantenimiento: mín.', I.mantenimiento[0], 1, 60)}${n('i.mantenimiento.1', 'máx.', I.mantenimiento[1], 1, 90)}</div>
      <div class="dos">${n('sprintDias', 'Sprint: días antes del examen', aj.sprintDias, 3, 60)}${n('bloqueoNuevoDias', 'Sin material nuevo: últimos días', aj.bloqueoNuevoDias, 0, 14)}</div>
      <div class="dos">${n('pretestDias', 'Pretest si pasaron (días)', aj.pretestDias, 1, 30)}${n('umbral', 'Sesión acertada desde (%)', Math.round(aj.umbralAcierto * 100), 50, 100)}</div>
      <small>Si fallás un tema vuelve al mínimo. Con dos sesiones acertadas seguidas el intervalo se alarga.</small>
    </div>

    <h2>Avisos dentro de la app</h2>
    <div class="tarjeta">
      <label class="check"><input type="checkbox" name="sonido" ${aj.sonido ? 'checked' : ''}> Sonido a mitad y al final del bloque</label>
      <label class="check"><input type="checkbox" name="recordatorio21" ${aj.recordatorio21 ? 'checked' : ''}> Preguntarme a las 21:00 si hice la sesión de hoy</label>
      <button class="btn chica" data-a="probar">Probar sonido</button>
      <p class="chico tenue" style="margin:8px 0 0">La app no manda notificaciones. Para que suene una alarma con la app cerrada, exportá los huecos al calendario del celular.</p>
    </div>

    <h2>Huecos y planes si-entonces</h2>
    <div class="lista">${huecos.map((h) => `<button data-h="${h.id}"><span class="crece"><b style="text-transform:capitalize">${DIAS[h.dia]} ${h.inicio}–${h.fin}</b> <span class="chip">${h.tipo}</span><br><small>${esc(h.planSiEntonces || 'Sin plan si-entonces. Tocá para escribirlo.')}</small></span></button>`).join('')}
      <button data-a="hueco"><span class="crece" style="color:var(--acento)">+ Agregar hueco</span></button></div>
    <div class="botones" style="margin-top:10px"><a class="btn" href="#semana">Ver grilla semanal</a><button class="btn" data-a="ejemplo">Restaurar huecos de ejemplo</button></div>

    <h2>Calendario</h2>
    <div class="tarjeta pila"><p class="chico">Genera un archivo .ics con todos los huecos de las próximas 4 semanas y una alarma 5 minutos antes de cada uno. Abrilo en el celular para importarlo al calendario.</p>
      <button class="btn pri" data-a="ics">Exportar a calendario (.ics)</button>
      <small class="tenue">Si después cambiás los huecos, borrá esos eventos del calendario y exportá de nuevo.</small></div>

    <h2>Tus datos</h2>
    <div class="tarjeta pila"><p class="chico">Todo se guarda solo en este dispositivo. Hacé un respaldo cada tanto.</p>
      <div class="botones"><button class="btn" data-a="exportar">Exportar JSON</button><label class="btn">Importar JSON<input type="file" accept="application/json,.json" id="imp" hidden></label></div>
      <button class="btn peligro" data-a="borrar">Borrar todos los datos</button></div>

    <h2>Instalar</h2>
    <div class="tarjeta pila">${instalar ? '<button class="btn pri" data-a="instalar">Instalar la app</button>' : ''}
      <p class="chico"><b>Android (Chrome):</b> menú ⋮ → "Agregar a pantalla principal" o "Instalar app".</p>
      <p class="chico"><b>iPhone (Safari):</b> botón Compartir → "Agregar a inicio".</p></div>`;

  cont.onchange = async (e) => {
    const el = e.target;
    if (el.id === 'imp') {
      const f = el.files[0];
      if (!f) return;
      if (!(await confirmar('Importar reemplaza todos los datos actuales por los del archivo.', 'Importar'))) return;
      try { await importar(await f.text()); toast('Datos importados.'); } catch (err) { toast(err.message || 'No pude leer el archivo.'); }
      return redibujar();
    }
    const name = el.name;
    if (!name) return;
    if (el.type === 'checkbox') return guardarAjustes({ [name]: el.checked });
    if (name === 'horaLimite') {
      if (!el.value || el.value > '23:00') { el.value = '23:00'; toast('La hora límite no puede pasar de las 23:00.'); }
      const fuera = S.huecos.filter((h) => aMin(h.fin) > aMin(el.value)).length;
      await guardarAjustes({ horaLimite: el.value });
      if (fuera) toast(`${fuera} ${fuera === 1 ? 'hueco se recorta' : 'huecos se recortan'} a las ${el.value}.`);
      return;
    }
    if (name === 'horaCansado') return el.value && guardarAjustes({ horaCansado: el.value });
    const v = Math.max(+el.min, Math.min(+el.max, Math.round(+el.value) || +el.min));
    el.value = v;
    if (name.startsWith('i.')) {
      const [, prog, idx] = name.split('.');
      const par = [...S.ajustes.intervalos[prog]];
      par[+idx] = v;
      if (par[1] < par[0]) par[+idx === 0 ? 1 : 0] = v;
      await guardarAjustes({ intervalos: { ...S.ajustes.intervalos, [prog]: par } });
      return redibujar();
    }
    if (name === 'umbral') return guardarAjustes({ umbralAcierto: v / 100 });
    return guardarAjustes({ [name]: v });
  };

  cont.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.h) return editarHueco(S.huecos.find((h) => h.id === b.dataset.h));
    switch (b.dataset.a) {
      case 'probar': prepararAudio(); return bip(2);
      case 'hueco': return editarHueco({ id: uid(), dia: 1, inicio: '19:00', fin: '19:30', tipo: 'corto', activo: true, planSiEntonces: '' }, true);
      case 'ejemplo':
        if (!(await confirmar('Esto reemplaza tus huecos actuales por los de ejemplo.', 'Reemplazar'))) return;
        await borrar('huecos', S.huecos.map((h) => h.id));
        for (const h of HUECOS_EJEMPLO) await guardar('huecos', { id: uid(), activo: true, ...h });
        return redibujar();
      case 'ics': exportarICS(); return toast('Archivo .ics generado.');
      case 'exportar': return descargar(`repaso-respaldo-${hoyISO()}.json`, exportar(), 'application/json');
      case 'borrar':
        if (await confirmar('¿Borrar materias, temas, preguntas, sesiones y huecos de este dispositivo? No se puede deshacer.', 'Borrar todo')) { localStorage.removeItem('repaso.sesion'); await borrarTodo(); redibujar(); }
        return;
      case 'instalar': instalar?.prompt(); instalar = null; return;
    }
  };
  void $;
}
