const items = $('Movimientos').all();                                   // servicios del mes (categoría Servicios)
const fijos = $('Get many database pages1').all().map(i => i.json);       // base Arriendo (último envío)
const jardinMov = $input.all().map(i => i.json);                          // movimientos que dicen «jard…» (nodo Movimientos jardín)
const hoy = new Date(Date.now() - 5 * 60 * 60 * 1000);   // hora de Colombia
const dia = hoy.getUTCDate();
const ultimoDiaMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 0)).getUTCDate();

function pagado(keyword){
  const re = new RegExp('\\b' + keyword + '\\b', 'i');
  return items.some(i => re.test(i.json.name || ''));
}

// "pendientes" = lo que se ve en la barra de Armoni (cada pago solo dentro de su ventana)
// "sinPagar"   = lo que usan las notificaciones push (siguen avisando, ya vencido, hasta que se pague)
const reglas = [
  { id: 'energia',  nombre: 'la energía',  keyword: 'energia',  desde: 3,  hasta: 10,          seguir: ultimoDiaMes },
  { id: 'agua',     nombre: 'el agua',     keyword: 'agua',     desde: 25, hasta: ultimoDiaMes, seguir: ultimoDiaMes },
  { id: 'gas',      nombre: 'el gas',      keyword: 'gas',      desde: 25, hasta: ultimoDiaMes, seguir: ultimoDiaMes },
  { id: 'internet', nombre: 'el internet', keyword: 'internet', desde: 1,  hasta: 5,           seguir: ultimoDiaMes },
];

const pendientes = [], sinPagar = [];
for (const r of reglas) {
  if (pagado(r.keyword)) continue;
  const item = { id: r.id, nombre: r.nombre };
  if (dia >= r.desde && dia <= r.hasta) pendientes.push(item);
  if (dia >= r.desde && dia <= r.seguir) sinPagar.push(item);
}

// arriendo: se da por pagado con la fecha guardada en Notion ("último envío").
// jardín: se da por pagado si existe su movimiento en Movimientos (si lo borras, el aviso vuelve).
//  - barra de Armoni: arriendo del último día del mes al día 3; jardín del último día del mes al día 5
//  - push: los dos siguen avisando (ya vencidos) hasta que se paguen
const esUltimoDiaMes = dia === ultimoDiaMes;
const ultimoDiaMesAnterior = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 0);
const inicioArriendo = esUltimoDiaMes ? Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), dia) : ultimoDiaMesAnterior;

const yaPagado = (re, inicioVentana) => {
  const f = fijos.find(x => re.test(x.name || ''));
  const s = f && f.property_último_envío && f.property_último_envío.start;
  return !!s && Date.parse(s.slice(0, 10) + 'T00:00:00Z') >= inicioVentana;
};
const jardinPagado = inicioVentana => jardinMov.some(x => {
  if (!/jard/i.test(x.name || '')) return false;
  let f = x.property_fecha; f = f && (f.start || (f.date && f.date.start) || f);
  const t = Date.parse(String(f || '').slice(0, 10) + 'T00:00:00Z');
  return !isNaN(t) && t >= inicioVentana;
});

if (!yaPagado(/arriendo/i, inicioArriendo)) {
  const item = { id: 'arriendo', nombre: 'el arriendo' };
  if (esUltimoDiaMes || dia <= 3) pendientes.push(item);
  sinPagar.push(item);
}
if (!jardinPagado(inicioArriendo)) {
  const item = { id: 'jardin', nombre: 'el jardín de Emanuel' };
  if (esUltimoDiaMes || dia <= 5) pendientes.push(item);
  sinPagar.push(item);
}

return [{ json: { pendientes, sinPagar } }];
