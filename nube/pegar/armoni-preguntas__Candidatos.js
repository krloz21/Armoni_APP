// referencia corta y única de cada movimiento: el FINAL del código de Notion (el inicio se repite entre páginas)
const ref = (id) => String(id).replace(/-/g, '').slice(-10);
// Lee una propiedad venga como página completa de Notion (properties) o simplificada de n8n (property_xxx)
const clave = (n) => 'property_' + String(n).toLowerCase().replace(/\s+/g, '_');
const txt = (a) => ((a || []).map(t => t.plain_text).join('') || '').trim();
const leer = (it, nombre, tipo) => {
  const pr = it.properties && it.properties[nombre];
  if (pr) {
    if (tipo === 'titulo') return txt(pr.title);
    if (tipo === 'texto') return txt(pr.rich_text);
    if (tipo === 'numero') return pr.number != null ? pr.number : null;
    if (tipo === 'fecha') return pr.date && pr.date.start ? pr.date.start.slice(0, 10) : null;
    if (tipo === 'select') return pr.select ? pr.select.name : (pr.status ? pr.status.name : null);
    if (tipo === 'relacion') return pr.relation && pr.relation[0] ? pr.relation[0].id : null;
  }
  let v = it[clave(nombre)];
  if (v === undefined && tipo === 'titulo') v = it.name;
  if (v === undefined || v === null || v === '') return null;
  if (tipo === 'fecha') { const s = typeof v === 'object' ? (v.start || '') : String(v); return s ? s.slice(0, 10) : null; }
  if (tipo === 'relacion') { const r = Array.isArray(v) ? v[0] : v; return r ? (typeof r === 'object' ? r.id : String(r)) : null; }
  if (tipo === 'numero') return typeof v === 'number' ? v : (Number(v) || null);
  return String(v);
};

const sd = $getWorkflowStaticData('global');
const v = $('Validar').first().json;
sd.revisado = v.hoy;
const desde = new Date(Date.now() - 75 * 864e5).toISOString().slice(0, 10);
// lo pagado en efectivo (Monto 0 y valor en «Efectivo») no es un movimiento de la cuenta: no se revisa
const todos = $input.all().map(i => i.json).filter(x => x && x.id && !((leer(x, 'Efectivo', 'numero') || 0) > 0)).map(x => ({
  id: x.id, fecha: leer(x, 'Fecha', 'fecha') || '', tipo: leer(x, 'Tipo', 'select') || '', cat: leer(x, 'Categoría', 'select') || '',
  monto: leer(x, 'Monto', 'numero') || 0, concepto: leer(x, 'Concepto', 'titulo') || '', notas: leer(x, 'Notas', 'texto') || '', rest: leer(x, 'Restaurante', 'relacion') || ''
})).filter(m => m.fecha >= desde);
// salidas a comer que quedaron sin lugar en «Restaurantes»: se pregunta dónde fue y cuántos comieron (sin IA; la app lo guarda en Notion)
sd.lugarPreg = sd.lugarPreg || {};
const normT = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const diaT = (f) => new Date(f + 'T12:00:00').getTime();
let rests = [];
try { rests = $('Restaurantes (lista)').all().map(i => i.json).filter(x => x && x.id).map(x => ({ id: x.id, nombre: leer(x, 'Nombre', 'titulo') || '' })).filter(x => x.nombre); } catch (e) {}
const COMIDA = /almuerzo|\bcena\b|comida|desayuno|restaurante|parrilla|pizza|hamburgues|helad|caf[eé]|brunch|asadero|picada|sushi|domicilio/i;
const hace35 = new Date(Date.now() - 35 * 864e5).toISOString().slice(0, 10);
// dos o más registros iguales de salidas (por ejemplo dos «Helado» el mismo día): se pregunta si fueron al mismo lugar
sd.parPreg = sd.parPreg || {};
const enPar = new Set();
const claveT = (m) => normT(m.concepto).replace(/\bpareja\b/g, '').trim();
const candP = todos.filter(m => m.tipo === 'Gasto' && m.cat === 'Salidas' && !m.rest && COMIDA.test(m.concepto) && m.fecha >= hace35);
const usadosP = new Set();
for (const a of candP) {
  if (usadosP.has(a.id)) continue;
  const grupo = candP.filter(b => !usadosP.has(b.id) && claveT(b) === claveT(a) && Math.abs(diaT(b.fecha) - diaT(a.fecha)) <= 864e5).slice(0, 3);
  if (grupo.length < 2) continue;
  grupo.forEach(x => { usadosP.add(x.id); enPar.add(x.id); });
  const kP = grupo.map(x => x.id).sort().join('|');
  if (sd.parPreg[kP] || grupo.some(x => sd.lugarPreg[x.id])) continue;
  if (sd.preguntas.filter(q => (q.tipo === 'par' || q.tipo === 'lugar') && q.estado !== 'respondida').length >= 6) break;
  sd.parPreg[kP] = v.hoy; grupo.forEach(x => { sd.lugarPreg[x.id] = v.hoy; });
  const montos = grupo.map(x => '$' + Math.round(x.monto).toLocaleString('es-CO').replace(/,/g, '.')).join(' y ');
  const tP = 'Hay ' + grupo.length + ' registros de «' + grupo[0].concepto + '» (' + montos + ') muy seguidos. ¿Fueron al mismo lugar?';
  sd.preguntas.push({ id: 'pr' + Date.now().toString(36) + String(a.id).replace(/-/g, '').slice(-4), tipo: 'par', estado: 'pendiente', pregunta: tP, opciones: [], motivo: 'Dos registros parecidos', movs: grupo, sug: null, hilo: [{ r: 'a', t: tP }], creada: new Date().toISOString() });
}
const _pk = Object.keys(sd.parPreg); if (_pk.length > 300) _pk.slice(0, _pk.length - 300).forEach(k => delete sd.parPreg[k]);
for (const m of todos) {
  if (m.tipo !== 'Gasto' || m.cat !== 'Salidas' || m.rest || !COMIDA.test(m.concepto) || m.fecha < hace35 || sd.lugarPreg[m.id] || enPar.has(m.id)) continue;
  if (sd.preguntas.filter(q => q.tipo === 'lugar' && q.estado !== 'respondida').length >= 5) break;
  sd.lugarPreg[m.id] = v.hoy;
  // ¿ya está en Restaurantes? por el nombre (en el concepto o las notas) o porque otro gasto de salidas de ese mismo día ya está enlazado a un lugar
  const hay = ' ' + normT(m.concepto + ' ' + m.notas) + ' ';
  let sug = null;
  const alias = (sd.alias || {})[normT(m.concepto).replace(/\bpareja\b/g, ' ').replace(/\s+/g, ' ').trim()];
  const porAlias = alias && rests.find(r => normT(r.nombre) === normT(alias));
  if (porAlias) sug = { id: porAlias.id, nombre: porAlias.nombre, por: 'alias' };
  const porNombre = !sug && rests.find(r => normT(r.nombre).length >= 4 && hay.includes(' ' + normT(r.nombre) + ' '));
  if (porNombre) sug = { id: porNombre.id, nombre: porNombre.nombre, por: 'nombre' };
  if (!sug) { const o = todos.find(x => x.id !== m.id && x.rest && ['Salidas', 'Salidas Ema'].includes(x.cat) && Math.abs(diaT(x.fecha) - diaT(m.fecha)) <= 864e5); const r = o && rests.find(y => y.id === o.rest); if (r) sug = { id: r.id, nombre: r.nombre, por: 'dia' }; }
  const t = sug ? 'Parece que esta salida ya está en Restaurantes: ' + sug.nombre + '. ¿Confirmas que fue ahí y cuántos comieron?' : 'Esta salida no quedó en Restaurantes. ¿Dónde fue y cuántos comieron?';
  sd.preguntas.push({ id: 'lg' + Date.now().toString(36) + String(m.id).replace(/-/g, '').slice(-4), tipo: 'lugar', estado: 'pendiente', pregunta: t, opciones: [], motivo: 'Falta el lugar', movs: [m], sug, hilo: [{ r: 'a', t }], creada: new Date().toISOString() });
}
// lo que se revisó (para que la familia vea qué gastos de salidas miró Armoni y por qué alguno no salió)
{
  const sal = todos.filter(m => m.tipo === 'Gasto' && (m.cat === 'Salidas' || m.cat === 'Salidas Ema')).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.monto - a.monto);
  sd.revision = { t: Date.now(), total: sal.length, sinLugar: sal.filter(m => !m.rest && m.cat === 'Salidas').length, items: sal.slice(0, 10).map(m => ({ c: String(m.concepto).slice(0, 40), f: m.fecha, m: Math.round(m.monto), cat: m.cat,
    e: m.rest ? 'ya tiene lugar' : m.cat === 'Salidas Ema' ? 'salida con Ema' : !COMIDA.test(m.concepto) ? 'no parece de comida' : sd.lugarPreg[m.id] ? 'en Dudas' : 'revisado' })) };
}
const _lk = Object.keys(sd.lugarPreg); if (_lk.length > 500) _lk.slice(0, _lk.length - 500).forEach(k => delete sd.lugarPreg[k]);
const yaPreguntados = new Set((sd.preguntas || []).flatMap(q => (q.movs || []).map(m => m.id)));
const nuevos = todos.filter(m => !sd.vistos[m.id] && !yaPreguntados.has(m.id) && !sd.ajustes[m.id]);
nuevos.forEach(m => { sd.vistos[m.id] = v.hoy; });
// no crece sin límite
const ks = Object.keys(sd.vistos); if (ks.length > 3000) ks.slice(0, ks.length - 3000).forEach(k => delete sd.vistos[k]);
if (!nuevos.length) return [{ json: { hay: false } }];
// contexto: los nuevos + los del mismo periodo (para ver duplicados y gasto/ingreso que se cancelan)
const linea = m => [ref(m.id), m.fecha, m.tipo, m.cat, Math.round(m.monto), m.concepto, m.notas].join(' | ');
const prompt = 'MEMORIA (lo que ya aprendiste de esta familia):\n' + ((sd.memoria || []).map(f => '- ' + f).join('\n') || '- (vacía)') +
  '\n\nMOVIMIENTOS NUEVOS (ref | fecha | tipo | categoría | monto | concepto | notas):\n' + nuevos.map(linea).join('\n') +
  '\n\nOTROS MOVIMIENTOS RECIENTES PARA COMPARAR:\n' + todos.filter(m => !nuevos.includes(m)).slice(-120).map(linea).join('\n');
const otros = todos.filter(m => !nuevos.includes(m)).slice(-120);
return [{ json: { hay: true, prompt, nuevos, otros } }];
