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
    if (v.inicial != null && v.inicial !== c.inicial) { c.inicial = v.inicial; c.inicialFecha = v.fecha; }
    if (v.meta != null) c.meta = v.meta;
  } else {
    const nuevo = Date.now().toString(36);
    sd.cajas[nuevo] = { nombre: v.nombre, inicial: v.inicial || 0, inicialFecha: v.fecha, meta: v.meta || 0, alias: [], orden: Object.keys(sd.cajas).length };
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
const ids = Object.keys(sd.cajas);
const deCaja = (concepto) => {
  const m = String(concepto || '').match(/·\s*(.+)$/);
  if (!m) return sd.cajas.general ? 'general' : null;   // lo de antes de las cajitas va a la cajita «Ahorro»
  const n = norm(m[1]);
  return ids.find(k => norm(sd.cajas[k].nombre) === n || (sd.cajas[k].alias || []).some(a => norm(a) === n)) || null;
};
const movs = $input.all().map(i => i.json).filter(x => x && x.id && leer(x, 'Categoría', 'select') === 'Ahorro')
  .map(x => {
    const tipo = leer(x, 'Tipo', 'select'), monto = leer(x, 'Monto', 'numero') || 0, concepto = leer(x, 'Concepto', 'titulo') || 'Ahorro';
    return { id: x.id, fecha: leer(x, 'Fecha', 'fecha') || '', caja: deCaja(concepto), concepto, nota: leer(x, 'Notas', 'texto') || '', monto: tipo === 'Ingreso' ? -monto : monto };
  })
  .filter(m => m.fecha)
  .sort((a, b) => b.fecha.localeCompare(a.fecha));
// lo pagado en EFECTIVO (propiedad «Efectivo» con valor) no sale de la cuenta: no baja el bolsillo para gastar
const todas = $input.all().map(i => i.json).filter(x => x && x.id && !((leer(x, 'Efectivo', 'numero') || 0) > 0)).map(x => ({ tipo: leer(x, 'Tipo', 'select'), cat: leer(x, 'Categoría', 'select'), monto: leer(x, 'Monto', 'numero') || 0, fecha: leer(x, 'Fecha', 'fecha') || '', concepto: leer(x, 'Concepto', 'titulo') || '' })).filter(m => m.fecha);
const cajas = ids.map(k => {
  const c = sd.cajas[k];
  const suyos = movs.filter(m => m.caja === k && (!c.inicialFecha || m.fecha >= c.inicialFecha));   // lo de antes ya estaba en «con cuánto empezó»
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
  return { id: k, nombre: c.nombre, inicial: c.inicial || 0, inicialFecha: c.inicialFecha || null, meta: c.meta || 0, orden: c.orden || 0,
           tasa: c.tasa || 0, tasaHasta: c.tasaHasta || null, rendimiento: Math.round(base0 + mov0 - sinInt),
           saldo: Math.round((base0 + mov0) * 100) / 100, movimientos: suyos.slice(0, 100) };
}).sort((a, b) => a.orden - b.orden);
// el bolsillo para gastar: lo que entra y sale desde su fecha, menos lo que se pasó a los otros apartados;
// las cuotas y seguros del carro se pagan del apartado «Pagos de carro».
const bol = cajas.find(x => sd.cajas[x.id].gasto), carro = cajas.find(x => !sd.cajas[x.id].gasto && /carro/.test(norm(x.nombre)));
if (bol) {
  const desde = bol.inicialFecha || '0000-00-00';
  let flujo = 0, cuotas = 0;
  todas.filter(m => m.fecha >= desde && m.cat !== 'Ahorro').forEach(m => {
    const pagaCarro = carro && m.tipo === 'Gasto' && m.cat === 'Carro' && /cuota|cr[eé]dito|soat|seguro/i.test(m.concepto);
    if (pagaCarro) cuotas += m.monto; else flujo += m.tipo === 'Ingreso' ? m.monto : -m.monto;
  });
  const aOtros = movs.filter(m => m.fecha >= desde && m.caja && m.caja !== bol.id).reduce((a, m) => a + m.monto, 0);
  bol.saldo = bol.inicial + flujo - aOtros; bol.gasto = true; bol.movimientos = [];
  if (carro) carro.saldo -= cuotas;
}
const sueltos = movs.filter(m => !m.caja);
const sinCaja = sueltos.reduce((a, m) => a + m.monto, 0);
const visibles = movs.filter(m => !m.caja || (cajas.find(c => c.id === m.caja) || {}).movimientos.some(x => x.id === m.id));
const ahorrado = cajas.filter(c => !c.gasto).reduce((a, c) => a + c.saldo, 0) + sinCaja;
const paraGastar = bol ? bol.saldo : 0;
return [{ json: { ok: true, total: ahorrado, cuenta: ahorrado + paraGastar, paraGastar, cajas, sinCaja, movimientos: visibles.slice(0, 200) } }];
