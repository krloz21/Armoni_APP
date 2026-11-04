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

const v = $('Validar').first().json;
const sd = $getWorkflowStaticData('global');
sd.cajas = sd.cajas || {};
const hoy = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
// si venía de la versión de un solo ahorro, eso pasa a ser la primera cajita
if (!Object.keys(sd.cajas).length && (sd.inicial || sd.meta)) {
  sd.cajas.general = { nombre: 'Ahorro', inicial: sd.inicial || 0, inicialFecha: sd.inicialFecha || hoy, meta: sd.meta || 0, alias: [], orden: 0 };
  delete sd.inicial; delete sd.meta; delete sd.inicialFecha;
}
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
if (v.accion === 'caja') {
  let c = v.id && sd.cajas[v.id];
  if (c) {
    if (norm(c.nombre) !== norm(v.nombre)) { c.alias = (c.alias || []).concat(c.nombre).slice(-10); c.nombre = v.nombre; }
    if (v.inicial != null && v.inicial !== c.inicial) { c.inicial = v.inicial; c.inicialFecha = v.fecha; c.inicialAt = v.fecha === hoy ? new Date().toISOString() : null; }
    if (v.meta != null) c.meta = v.meta;
  } else {
    const nuevo = Date.now().toString(36);
    sd.cajas[nuevo] = { nombre: v.nombre, inicial: v.inicial || 0, inicialFecha: v.fecha, inicialAt: v.fecha === hoy ? new Date().toISOString() : null, meta: v.meta || 0, alias: [], orden: Object.keys(sd.cajas).length };
  }
}
if (v.accion === 'quitar') delete sd.cajas[v.id];

// los 3 apartados de Nu con su saldo real al 12 de octubre de 2026 (suman lo que hay en la cuenta: $7.137.889).
// «Bolsillo para gastar» es el que paga el día a día: sube con lo que entra y baja con lo que se gasta; los otros dos son ahorro.
if (!sd.nu1) {
  sd.nu1 = true;
  const base = '2026-10-12';
  [['Bolsillo para gastar', 1460769, true, /gastar|gastos/, 0], ['Ahorro casita', 4127570, false, /casita|^ahorro$/, 1], ['Pagos de carro', 1549550, false, /carro/, 2]].forEach(([nom, saldo, gasto, re, orden]) => {
    let k = Object.keys(sd.cajas).find(x => re.test(norm(sd.cajas[x].nombre)));
    if (!k) { k = 'nu' + orden; sd.cajas[k] = { nombre: nom, meta: 0, alias: [], orden }; }
    const c = sd.cajas[k]; c.inicial = saldo; c.inicialFecha = base; if (gasto) c.gasto = true;
    if (norm(c.nombre) === 'ahorro') { c.alias = (c.alias || []).concat(c.nombre).slice(-10); c.nombre = nom; }
  });
}
// 16 de octubre de 2026: saldos reales de Nu (incluyen los rendimientos hasta hoy) y la tasa de cada apartado.
// Desde esa fecha Armoni suma el rendimiento día a día: Casita y Gastos 9,85 % E.A.; Pagos de carro es un CDT al 10,20 % hasta el 8 de enero de 2027 (después se asume 9,85 %).
if (!sd.nu2) {
  sd.nu2 = true;
  const base = '2026-10-16';
  [[/casita|^ahorro$/, 4131822.40, 9.85, null, null], [/carro/, 1551135.03, 10.20, '2027-01-08', 9.85], [/gastar|gastos/, 2597757.84, 9.85, null, null]].forEach(([re, saldo, tasa, hasta, despues]) => {
    const k = Object.keys(sd.cajas).find(x => re.test(norm(sd.cajas[x].nombre)));
    if (!k) return;
    const c = sd.cajas[k]; c.inicial = saldo; c.inicialFecha = base; c.tasa = tasa; c.tasaHasta = hasta; c.tasaDespues = despues;
  });
}
// 4 de noviembre de 2026 (10:28 a. m.): saldos reales de las cajitas de Nu, tal como salen en la app del banco.
// Desde este instante Armoni vuelve a sumar lo que entra y a restar lo que sale; lo anotado ANTES de este momento ya está dentro de estos saldos.
// «Gastos Familiares» es el bolsillo del día a día (antes se llamaba «Bolsillo para gastar»); «Mi baby» y «Ahorro extra» están en cero pero existen en Nu.
if (!sd.nu3) {
  sd.nu3 = true;
  const base = '2026-11-04', at = new Date().toISOString();
  [[/gastar|gastos/, 'Gastos Familiares', 322397.42, 9.85, null, null, true, 0],
   [/casita|^ahorro$/, 'Ahorro casita', 5152734.05, 9.85, null, null, false, 1],
   [/carro/, 'Pagos carro', 1559082.03, 10.20, '2027-01-08', 9.85, false, 2],
   [/baby|bebe/, 'Mi baby', 0, 9.85, null, null, false, 3],
   [/extra/, 'Ahorro extra', 0, 9.85, null, null, false, 4]].forEach(([re, nom, saldo, tasa, hasta, despues, gasto, orden]) => {
    let k = Object.keys(sd.cajas).find(x => re.test(norm(sd.cajas[x].nombre)) || (sd.cajas[x].alias || []).some(a => re.test(norm(a))));
    if (!k) { k = 'nu' + orden; sd.cajas[k] = { nombre: nom, meta: 0, alias: [], orden }; }
    const c = sd.cajas[k];
    if (norm(c.nombre) !== norm(nom)) { c.alias = (c.alias || []).concat(c.nombre).slice(-10); c.nombre = nom; }
    c.inicial = saldo; c.inicialFecha = base; c.inicialAt = at; c.tasa = tasa; c.tasaHasta = hasta; c.tasaDespues = despues; if (gasto) c.gasto = true;
  });
}
const ids = Object.keys(sd.cajas);
// nombre de la cajita en el concepto («Ahorro · Casita», «Retiro · Pagos de carro»), comparado de forma flexible:
// sin tildes ni mayúsculas, exacto o por alias; si no, uno contiene al otro; si no, por palabra clave («carro» → Pagos de carro, «casita» → Ahorro casita)
const VACIAS = new Set(['ahorro', 'pagos', 'pago', 'para', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'cajita', 'retiro']);
const palabras = (t) => norm(t).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !VACIAS.has(w)).map(w => w === 'gastar' ? 'gastos' : w);
const nombresDe = (k) => [sd.cajas[k].nombre].concat(sd.cajas[k].alias || []).map(norm).filter(Boolean);
const deCaja = (concepto) => {
  const m = String(concepto || '').match(/·\s*(.+)$/);
  if (!m) return sd.cajas.general ? 'general' : null;   // lo de antes de las cajitas va a la cajita «Ahorro»
  const n = norm(m[1]);
  if (!n) return null;
  return ids.find(k => nombresDe(k).includes(n))
    || (n.length >= 4 ? ids.find(k => nombresDe(k).some(a => a.length >= 4 && (a.includes(n) || n.includes(a)))) : null)
    || (() => { const ws = palabras(n); const ks = ids.filter(k => nombresDe(k).some(a => palabras(a).some(w => ws.includes(w)))); return ks.length === 1 ? ks[0] : null; })()   // una sola cajita con esa palabra; si hay dos, queda «sin cajita»
    || null;
};
// ¿el movimiento cuenta después del saldo base de la cajita? Días posteriores sí; el mismo día solo si se creó en Notion
// después del instante del ajuste (inicialAt). Sin inicialAt (saldos viejos) el mismo día cuenta, como antes.
const despuesDe = (m, c) => {
  if (!c.inicialFecha) return true;
  if (m.fecha > c.inicialFecha) return true;
  if (m.fecha < c.inicialFecha) return false;
  if (!c.inicialAt) return true;
  return !!m.creado && m.creado > c.inicialAt;
};
const creadoDe = (x) => String(x.created_time || x.createdTime || x.property_creado || '') || '';
const movs = $input.all().map(i => i.json).filter(x => x && x.id && leer(x, 'Categoría', 'select') === 'Ahorro')
  .map(x => {
    const tipo = leer(x, 'Tipo', 'select'), monto = leer(x, 'Monto', 'numero') || 0, concepto = leer(x, 'Concepto', 'titulo') || 'Ahorro';
    return { id: x.id, fecha: leer(x, 'Fecha', 'fecha') || '', creado: creadoDe(x), caja: deCaja(concepto), concepto, nota: leer(x, 'Notas', 'texto') || '', monto: tipo === 'Ingreso' ? -monto : monto };
  })
  .filter(m => m.fecha)
  .sort((a, b) => b.fecha.localeCompare(a.fecha));
// lo pagado en EFECTIVO (propiedad «Efectivo» con valor) no sale de la cuenta: no baja el bolsillo para gastar.
// Los «Rendimientos …» anotados a mano como ingreso no se cuentan: Armoni ya calcula el rendimiento de cada cajita.
const esRendimiento = (m) => m.tipo === 'Ingreso' && /rendimiento/.test(norm(m.concepto));
const todas = $input.all().map(i => i.json).filter(x => x && x.id && !((leer(x, 'Efectivo', 'numero') || 0) > 0)).map(x => ({ tipo: leer(x, 'Tipo', 'select'), cat: leer(x, 'Categoría', 'select'), monto: leer(x, 'Monto', 'numero') || 0, fecha: leer(x, 'Fecha', 'fecha') || '', creado: creadoDe(x), concepto: leer(x, 'Concepto', 'titulo') || '' }))
  .filter(m => m.fecha && (m.tipo === 'Ingreso' || m.tipo === 'Gasto'));
const rendimientosIgnorados = todas.filter(esRendimiento).length;
const cajas = ids.map(k => {
  const c = sd.cajas[k];
  const suyos = movs.filter(m => m.caja === k && despuesDe(m, c));   // lo de antes ya estaba en «con cuánto empezó»
  // rendimiento: cada peso rinde la tasa E.A. de su apartado desde el día en que entró (o desde la fecha del saldo)
  const dd = (a, b) => Math.max(0, (Date.parse(String(b).slice(0, 10) + 'T12:00:00Z') - Date.parse(String(a).slice(0, 10) + 'T12:00:00Z')) / 864e5);
  const crece = (desde) => {
    if (!c.tasa || !desde) return 1;
    const t1 = c.tasa / 100, t2 = (c.tasaDespues || c.tasa) / 100, corte = c.tasaHasta || '9999-12-31';
    const d1 = dd(desde, corte < hoy ? corte : hoy), d2 = corte < hoy ? dd(corte > desde ? corte : desde, hoy) : 0;
    return Math.pow(1 + t1, d1 / 365) * Math.pow(1 + t2, d2 / 365);
  };
  const base0 = (c.inicial || 0) * crece(c.inicialFecha), mov0 = suyos.reduce((a, m) => a + m.monto * crece(m.fecha), 0);
  const sinInt = (c.inicial || 0) + suyos.reduce((a, m) => a + m.monto, 0);
  return { id: k, nombre: c.nombre, inicial: c.inicial || 0, inicialFecha: c.inicialFecha || null, inicialAt: c.inicialAt || null, meta: c.meta || 0, orden: c.orden || 0,
           tasa: c.tasa || 0, tasaHasta: c.tasaHasta || null, rendimiento: Math.round(base0 + mov0 - sinInt),
           saldo: Math.round((base0 + mov0) * 100) / 100, movimientos: suyos.slice(0, 100) };
}).sort((a, b) => a.orden - b.orden);
// el bolsillo para gastar: lo que entra y sale desde su saldo base, menos lo que se pasó a los otros apartados.
// TODO gasto digital (también la cuota y el seguro del carro) baja el bolsillo, como en el banco:
// una cajita solo se mueve con «Ahorro · X» / «Retiro · X» (categoría Ahorro).
const bol = cajas.find(x => sd.cajas[x.id].gasto);
if (bol) {
  const cb = sd.cajas[bol.id];
  let flujo = 0;
  todas.filter(m => despuesDe(m, cb) && m.cat !== 'Ahorro' && !esRendimiento(m)).forEach(m => {
    flujo += m.tipo === 'Ingreso' ? m.monto : -m.monto;
  });
  const aOtros = movs.filter(m => despuesDe(m, cb) && m.caja && m.caja !== bol.id).reduce((a, m) => a + m.monto, 0);
  // + el rendimiento calculado del propio bolsillo (antes se perdía y por eso se anotaba a mano)
  bol.saldo = Math.round((bol.inicial + flujo - aOtros + (bol.rendimiento || 0)) * 100) / 100; bol.gasto = true; bol.movimientos = [];
}
const sueltos = movs.filter(m => !m.caja);
const sinCaja = sueltos.reduce((a, m) => a + m.monto, 0);
const visibles = movs.filter(m => !m.caja || (cajas.find(c => c.id === m.caja) || {}).movimientos.some(x => x.id === m.id));
const ahorrado = cajas.filter(c => !c.gasto).reduce((a, c) => a + c.saldo, 0) + sinCaja;
const paraGastar = bol ? bol.saldo : 0;
// alguna cajita (o el bolsillo) en negativo = los saldos no cuadran con el banco: la app pide «cuadrar con Nu»
const negativas = cajas.filter(c => c.saldo < 0).map(c => ({ id: c.id, nombre: c.nombre, saldo: c.saldo }));
return [{ json: { ok: true, flujo: 'ahorro', version: 2, total: ahorrado, cuenta: ahorrado + paraGastar, paraGastar, cajas, sinCaja,
  alerta: negativas.length ? 'no-cuadra' : null, negativas, rendimientosIgnorados, movimientos: visibles.slice(0, 200) } }];
