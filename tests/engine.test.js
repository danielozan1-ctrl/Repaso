import test from 'node:test';
import assert from 'node:assert/strict';
import { crearCtx, planDia, planLibre, programaEfectivo, proyeccion, trasRepaso, trasNuevo, nuevoBloqueado, DEFAULTS, simular } from '../js/engine.js';
import { HUECOS_EJEMPLO } from './huecos.js';
import { generarICS } from '../js/ics.js';

const HOY = '2026-11-16'; // lunes
const tema = (id, materiaId, orden, extra = {}) => ({ id, materiaId, orden, titulo: id, estado: 'no_visto', ...extra });
const visto = (prox, ult) => ({ estado: 'en_curso', nuevoCompletado: true, proximoRepaso: prox, ultimaSesion: ult, intervaloDias: 3 });
const preg = (temaId, historial = []) => ({ id: 'p' + temaId, temaId, enunciado: '?', respuesta: '!', historial });

function escenario() {
  const materias = [
    { id: 'D', nombre: 'Derecho', programa: 'espaciado', sprintAuto: true, examenes: [{ id: 'dp', tipo: 'parcial', fecha: '2026-11-26' }] },
    { id: 'E', nombre: 'Economía', programa: 'espaciado', sprintAuto: true, examenes: [{ id: 'ep', tipo: 'parcial', fecha: '2026-12-10' }] },
    { id: 'H', nombre: 'Historia', programa: 'mantenimiento', examenes: [{ id: 'hf', tipo: 'final', fecha: '2026-12-18' }] },
  ];
  const temas = [
    tema('D1', 'D', 1, visto('2026-11-16', '2026-11-13')),
    tema('D2', 'D', 2, visto('2026-11-16', '2026-11-14')),
    tema('D3', 'D', 3, visto('2026-11-17', '2026-11-14')),
    tema('D4', 'D', 4, visto('2026-11-18', '2026-11-15')),
    tema('D5', 'D', 5), tema('D6', 'D', 6), tema('D7', 'D', 7), tema('D8', 'D', 8),
    tema('E1', 'E', 1, visto('2026-11-17', '2026-11-12')),
    tema('E2', 'E', 2, visto('2026-11-19', '2026-11-14')),
    tema('E3', 'E', 3, visto('2026-11-20', '2026-11-15')),
    tema('E4', 'E', 4, visto('2026-11-21', '2026-11-15')),
    tema('E5', 'E', 5), tema('E6', 'E', 6), tema('E7', 'E', 7), tema('E8', 'E', 8),
    tema('H3', 'H', 3, visto('2026-11-19', '2026-11-10')),
  ];
  const preguntas = temas.filter((t) => t.estado !== 'no_visto').map((t) => preg(t.id, t.id === 'D2' ? [{ fecha: '2026-11-14', acierto: false }] : []));
  const ses = (materiaId, fecha, min, fin) => ({ id: fecha + materiaId + min, materiaId, tipo: 'nuevo', fecha, minReales: min, temaTerminado: fin, total: 3, aciertos: 3 });
  const sesiones = [ses('D', '2026-11-07', 180, true), ses('D', '2026-11-10', 60, true), ses('D', '2026-11-13', 60, true), ses('D', '2026-11-14', 0, true),
    ses('E', '2026-11-08', 120, true), ses('E', '2026-11-12', 120, true)];
  // D: 4 temas en 5 h = 0,8 temas/h. E: 2 temas en 2 h = 1 tema/h.
  sesiones[4].minReales = 60; sesiones[5].minReales = 60;
  const huecos = HUECOS_EJEMPLO.map((h, i) => ({ id: 'h' + i, activo: true, ...h }));
  return { materias, temas, preguntas, huecos, sesiones, ajustes: { ...DEFAULTS } };
}

test('sprint automático a 14 días y bloqueo de nuevo los últimos 3', () => {
  const S = escenario();
  const [D, E, H] = S.materias;
  assert.equal(programaEfectivo(D, HOY, DEFAULTS), 'sprint');
  assert.equal(programaEfectivo(E, HOY, DEFAULTS), 'espaciado');
  assert.equal(programaEfectivo(H, HOY, DEFAULTS), 'mantenimiento');
  assert.equal(nuevoBloqueado(D, '2026-11-22', DEFAULTS), false);
  assert.equal(nuevoBloqueado(D, '2026-11-23', DEFAULTS), true);
});

test('lunes: hueco corto nocturno asigna repasos vencidos, D2 primero por fallos', () => {
  const S = escenario();
  const ctx = crearCtx(S, HOY);
  const plan = planDia(ctx, S.temas, HOY);
  assert.equal(plan.bloques.length, 1);
  const b = plan.bloques[0];
  assert.equal(b.cansado, true);
  assert.equal(b.min, 15);
  assert.deepEqual(b.items.map((i) => i.temaId), ['D2']);
  assert.ok(b.items.every((i) => i.tipo === 'repaso'));
});

test('martes: hueco largo = repasos vencidos + material nuevo de la materia más apretada', () => {
  const S = escenario();
  const ctx = crearCtx(S, '2026-11-17');
  const b = planDia(ctx, S.temas, '2026-11-17').bloques[0];
  const nuevo = b.items.find((i) => i.tipo === 'nuevo');
  assert.equal(nuevo.temaId, 'D5');
  assert.ok(b.items[0].tipo === 'repaso' && b.items[0].materiaId === 'D');
  assert.ok(nuevo.min >= 40);
});

test('nunca material nuevo después de las 21 ni en huecos cortos', () => {
  const S = escenario();
  const ctx = crearCtx(S, HOY);
  for (let i = 0; i < 28; i++) {
    const { planes } = simular(ctx, HOY, 28);
    for (const p of planes) for (const b of p.bloques) for (const it of b.items) {
      if (it.tipo === 'nuevo') assert.ok(b.hueco.tipo === 'largo' && !b.cansado);
    }
    break;
  }
  const libre = planLibre(ctx, S.temas, HOY, 21 * 60 + 10, 60);
  assert.ok(libre.items.every((i) => i.tipo === 'repaso'));
  assert.equal(libre.min, 15);
  assert.equal(planLibre(ctx, S.temas, HOY, 23 * 60 + 5, 30).fueraDeHora, true);
});

test('proyección: Derecho no llega (7 de 8) y sugiere bloques; Economía llega', () => {
  const S = escenario();
  const ctx = crearCtx(S, HOY);
  const d = proyeccion(ctx, S.materias[0]);
  assert.equal(d.estado, 'no_llega');
  assert.equal(d.total, 8);
  assert.equal(d.cubiertos, 7);
  assert.ok(d.bloquesPorSemana >= 1);
  assert.equal(proyeccion(ctx, S.materias[1]).estado, 'llega');
});

test('sin sesiones de material nuevo, la proyección dice que no hay datos', () => {
  const S = escenario();
  S.sesiones = [];
  assert.equal(proyeccion(crearCtx(S, HOY), S.materias[0]).estado, 'sin_datos');
});

test('intervalos: fallo vuelve antes, dos aciertos seguidos alargan, 3 sesiones => dominado', () => {
  const m = { id: 'X', programa: 'espaciado', sprintAuto: false, examenes: [] };
  let t = { id: 't', estado: 'en_curso' };
  t = trasRepaso(t, m, { aciertos: 5, total: 5, completa: true }, '2026-01-01', DEFAULTS);
  assert.equal(t.proximoRepaso, '2026-01-06');
  t = trasRepaso(t, m, { aciertos: 4, total: 5, completa: true }, '2026-01-06', DEFAULTS);
  assert.equal(t.intervaloDias, 8);
  assert.equal(t.estado, 'en_curso');
  t = trasRepaso(t, m, { aciertos: 5, total: 5, completa: true }, '2026-01-14', DEFAULTS);
  assert.equal(t.estado, 'dominado');
  assert.equal(t.intervaloDias, 12);
  t = trasRepaso(t, m, { aciertos: 1, total: 5, completa: true }, '2026-01-26', DEFAULTS);
  assert.equal(t.intervaloDias, 4);
  assert.equal(t.estado, 'en_curso');
  assert.equal(t.aciertosSeguidos, 0);
});

test('dos aciertos el mismo día no cuentan como dos sesiones distintas', () => {
  const m = { id: 'X', programa: 'espaciado', sprintAuto: false, examenes: [] };
  let t = { id: 't', estado: 'en_curso' };
  for (let i = 0; i < 4; i++) t = trasRepaso(t, m, { aciertos: 3, total: 3, completa: true }, '2026-01-01', DEFAULTS);
  assert.equal(t.estado, 'en_curso');
});

test('material nuevo: primer repaso al intervalo mínimo del programa', () => {
  const S = escenario();
  const t = trasNuevo(S.temas[4], S.materias[0], { temaTerminado: true }, HOY, DEFAULTS);
  assert.equal(t.estado, 'en_curso');
  assert.equal(t.proximoRepaso, '2026-11-18');
});

test('saltear días solo recalcula: lo vencido sigue en la cola', () => {
  const S = escenario();
  const ctx = crearCtx(S, '2026-11-19');
  const plan = planDia(ctx, S.temas, '2026-11-19');
  assert.ok(plan.vencidos >= 6);
  assert.equal(plan.bloques[0].items[0].materiaId, 'D');
});

test('respeta la hora límite al recortar huecos', () => {
  const S = escenario();
  S.huecos = [{ id: 'x', dia: 1, inicio: '22:30', fin: '23:30', tipo: 'largo', activo: true }];
  const b = planDia(crearCtx(S, HOY), S.temas, HOY).bloques[0];
  assert.equal(b.fin, 23 * 60);
  assert.ok(b.items.every((i) => i.tipo === 'repaso'));
});

test('.ics: un evento por hueco con alarma 5 minutos antes', () => {
  const S = escenario();
  const ctx = crearCtx(S, HOY);
  const ics = generarICS(simular(ctx, HOY, 28).planes, ctx.mat);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 28);
  assert.equal((ics.match(/TRIGGER:-PT5M/g) || []).length, 28);
  assert.ok(ics.includes('DTSTART:20261116T213000'));
});
