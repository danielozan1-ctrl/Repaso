import test from 'node:test';
import assert from 'node:assert/strict';
import { leerCronograma, resolverFechas, armarMateria } from '../js/parser.js';

const TXT = `Cronograma 2º cuatrimestre
Lun 10/8 - Unidad 1: Introducción al derecho civil
17/08: Unidad 2 - Persona humana
24 de agosto – Unidad 3: Capacidad
31/8 Feriado
7 de sept. Unidad 4: Hechos y actos jurídicos
14/9 Repaso
Martes 21/09/2026 Primer parcial
28/9 Unidad 5: Obligaciones
5 de octubre: Unidad 6: Contratos
Entrega TP: 12/10
Segundo parcial
Recuperatorio 9/11
Examen final: 14 de diciembre`;

test('detecta fechas, tipos y lo que falta preguntar', () => {
  const { items, necesita } = leerCronograma(TXT);
  const tipos = items.map((i) => i.tipo);
  assert.deepEqual(tipos, ['tema', 'tema', 'tema', 'ignorar', 'tema', 'ignorar', 'parcial', 'tema', 'tema', 'entrega', 'parcial', 'recuperatorio', 'final']);
  assert.equal(items[0].titulo, 'Unidad 1: Introducción al derecho civil');
  assert.equal(items[2].titulo, 'Unidad 3: Capacidad');
  assert.equal(items[4].titulo, 'Unidad 4: Hechos y actos jurídicos');
  assert.equal(items[6].titulo, 'Primer parcial');
  assert.equal(necesita.anio, true);
  assert.equal(necesita.semana1, false);
  assert.deepEqual(necesita.sinFecha, [10]);
});

test('resuelve fechas con el año y las respuestas del usuario', () => {
  const { items } = leerCronograma(TXT);
  const r = resolverFechas(items, { anio: 2026, fechas: { 10: '2026-11-02' } });
  assert.equal(r[0].fecha, '2026-08-10');
  assert.equal(r[2].fecha, '2026-08-24');
  assert.equal(r[4].fecha, '2026-09-07');
  assert.equal(r[6].fecha, '2026-09-21');
  assert.equal(r[10].fecha, '2026-11-02');
  assert.equal(r[12].fecha, '2026-12-14');
  assert.ok(r.every((x) => x.tipo === 'ignorar' || x.fecha));
});

test('asocia cada tema al parcial que le sigue', () => {
  const { items } = leerCronograma(TXT);
  const r = resolverFechas(items, { anio: 2026, fechas: { 10: '2026-11-02' } });
  let n = 0;
  const { examenes, temas } = armarMateria(r, () => 'e' + ++n);
  assert.equal(temas.length, 6);
  assert.equal(examenes.length, 5);
  const p1 = examenes[0].id;
  const p2 = examenes.find((e) => e.titulo === 'Segundo parcial').id;
  assert.deepEqual(temas.map((t) => t.examenId), [p1, p1, p1, p1, p2, p2]);
});

test('semanas relativas y cruce de año', () => {
  const { items, necesita } = leerCronograma('Semana 1: Límites\nSemana 3: Derivadas\n20/11 Integrales\n5/3 Parcial');
  assert.equal(necesita.semana1, true);
  const r = resolverFechas(items, { anio: 2026, semana1: '2026-08-10' });
  assert.equal(r[0].fecha, '2026-08-10');
  assert.equal(r[1].fecha, '2026-08-24');
  assert.equal(r[1].titulo, 'Derivadas');
  assert.equal(r[3].fecha, '2027-03-05');
});

test('no confunde numeración de unidades ni horarios con fechas', () => {
  const { items } = leerCronograma('Unidad 3.2 Sucesiones (18-20 hs)\nTema 4: Ley del mar');
  assert.equal(items[0].d, null);
  assert.equal(items[1].titulo, 'Tema 4: Ley del mar');
});
