// Persistencia en IndexedDB. Todo el estado vive en memoria (S) y cada cambio se escribe a la base.
import { DEFAULTS } from './engine.js';

const NOMBRE = 'repaso-db';
const STORES = ['materias', 'temas', 'preguntas', 'huecos', 'sesiones', 'meta'];
const COLECCIONES = ['materias', 'temas', 'preguntas', 'huecos', 'sesiones'];
let db;

export const S = { materias: [], temas: [], preguntas: [], huecos: [], sesiones: [], ajustes: { ...DEFAULTS } };
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

function abrir() {
  return new Promise((ok, err) => {
    const r = indexedDB.open(NOMBRE, 1);
    r.onupgradeneeded = () => {
      for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => err(r.error);
  });
}
function tx(stores, modo, fn) {
  return new Promise((ok, err) => {
    const t = db.transaction(stores, modo);
    const res = fn(t);
    t.oncomplete = () => ok(res);
    t.onerror = t.onabort = () => err(t.error);
  });
}
const todos = (store) =>
  new Promise((ok, err) => {
    const r = db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => ok(r.result);
    r.onerror = () => err(r.error);
  });

export const HUECOS_EJEMPLO = [
  { dia: 1, inicio: '21:30', fin: '22:00', tipo: 'corto', planSiEntonces: 'Si es lunes y terminé de cenar, hago 15 min de preguntas antes de mirar el celular.' },
  { dia: 2, inicio: '19:00', fin: '20:00', tipo: 'largo', planSiEntonces: 'Si es martes y llegué a casa, me siento a estudiar antes de cenar.' },
  { dia: 3, inicio: '21:30', fin: '22:00', tipo: 'corto', planSiEntonces: 'Si es miércoles y terminé de cenar, hago 15 min de preguntas.' },
  { dia: 4, inicio: '20:00', fin: '20:30', tipo: 'corto', planSiEntonces: 'Si es jueves y llegué a casa, repaso 20 min antes de cenar.' },
  { dia: 5, inicio: '16:30', fin: '18:30', tipo: 'largo', planSiEntonces: 'Si es viernes a las 16:30, abro el material nuevo de la semana.' },
  { dia: 5, inicio: '21:30', fin: '22:00', tipo: 'corto', planSiEntonces: 'Si es viernes y terminé de cenar, hago 15 min de preguntas.' },
  { dia: 6, inicio: '16:00', fin: '18:00', tipo: 'largo', planSiEntonces: 'Si es sábado a las 16:00, me siento con el material nuevo.' },
];

export async function cargar() {
  db = await abrir();
  for (const c of COLECCIONES) S[c] = await todos(c);
  const meta = await todos('meta');
  const aj = meta.find((x) => x.id === 'ajustes');
  S.ajustes = { ...DEFAULTS, ...(aj || {}), intervalos: { ...DEFAULTS.intervalos, ...(aj?.intervalos || {}) } };
  S.materias.sort((a, b) => (a.orden || 0) - (b.orden || 0));
  if (!meta.find((x) => x.id === 'iniciado')) {
    for (const h of HUECOS_EJEMPLO) await guardar('huecos', { id: uid(), activo: true, ...h });
    await tx('meta', 'readwrite', (t) => t.objectStore('meta').put({ id: 'iniciado', fecha: Date.now() }));
  }
  navigator.storage?.persist?.().catch(() => {});
}

export function guardar(store, obj) {
  const arr = S[store];
  const i = arr.findIndex((x) => x.id === obj.id);
  if (i >= 0) arr[i] = obj;
  else arr.push(obj);
  return tx(store, 'readwrite', (t) => t.objectStore(store).put(obj));
}
export function guardarVarios(store, objs) {
  for (const obj of objs) {
    const i = S[store].findIndex((x) => x.id === obj.id);
    if (i >= 0) S[store][i] = obj;
    else S[store].push(obj);
  }
  return tx(store, 'readwrite', (t) => objs.forEach((o) => t.objectStore(store).put(o)));
}
export function borrar(store, ids) {
  const set = new Set([].concat(ids));
  S[store] = S[store].filter((x) => !set.has(x.id));
  return tx(store, 'readwrite', (t) => set.forEach((id) => t.objectStore(store).delete(id)));
}
export function guardarAjustes(cambios) {
  S.ajustes = { ...S.ajustes, ...cambios };
  return tx('meta', 'readwrite', (t) => t.objectStore('meta').put({ id: 'ajustes', ...S.ajustes }));
}
export async function borrarMateria(id) {
  const temas = S.temas.filter((t) => t.materiaId === id).map((t) => t.id);
  const tset = new Set(temas);
  await borrar('preguntas', S.preguntas.filter((p) => tset.has(p.temaId)).map((p) => p.id));
  await borrar('sesiones', S.sesiones.filter((s) => s.materiaId === id).map((s) => s.id));
  await borrar('temas', temas);
  await borrar('materias', id);
}
export async function borrarTema(id) {
  await borrar('preguntas', S.preguntas.filter((p) => p.temaId === id).map((p) => p.id));
  await borrar('temas', id);
}

export function exportar() {
  const { ajustes, ...resto } = S;
  return JSON.stringify({ app: 'repaso', version: 1, exportado: new Date().toISOString(), ajustes, ...resto }, null, 2);
}
export async function importar(texto) {
  const d = JSON.parse(texto);
  if (d.app !== 'repaso' || !COLECCIONES.every((c) => Array.isArray(d[c]))) throw new Error('El archivo no es un respaldo de Repaso.');
  await tx(STORES, 'readwrite', (t) => {
    for (const c of COLECCIONES) {
      const os = t.objectStore(c);
      os.clear();
      for (const o of d[c]) if (o && o.id) os.put(o);
    }
    t.objectStore('meta').put({ id: 'ajustes', ...DEFAULTS, ...(d.ajustes || {}) });
    t.objectStore('meta').put({ id: 'iniciado', fecha: Date.now() });
  });
  await cargar();
}
export async function borrarTodo() {
  await tx(STORES, 'readwrite', (t) => STORES.forEach((s) => t.objectStore(s).clear()));
  await cargar();
}
