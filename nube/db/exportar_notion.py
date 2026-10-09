#!/usr/bin/env python3
"""Lee TODAS las bases de Armoni desde Notion y escribe datos.sql para cargarlo en PostgreSQL.
Solo lee: no modifica nada en Notion. Se puede correr las veces que quieras (el SQL actualiza, no duplica).

Uso:   NOTION_TOKEN=secret_xxx python exportar_notion.py [salida.sql]
"""
import json, os, sys, time, urllib.request, urllib.error

TOKEN = os.environ.get("NOTION_TOKEN", "").strip()
BASE = os.environ.get("NOTION_API", "https://api.notion.com").rstrip("/")
SALIDA = sys.argv[1] if len(sys.argv) > 1 else "datos.sql"

GRUPOS = ["Despensa", "Lácteos", "Carnes", "Ema", "Aseo", "Otros", "Frutas y verduras"]
CATEGORIAS = ["Hogar", "Hijo", "Carro", "Alimentación", "Servicios", "Salud", "Salidas", "Ahorro", "Otros", "Tarjetas"]

# (tabla, id de la base en Notion, columnas) — cada columna: (columna_sql, propiedad_notion, tipo, valores_permitidos)
TABLAS = [
  ("resumen_financiero", "39b39f80d3a5801e9f06d7167595f400", [("nombre", "Nombre", "titulo", None)]),
  ("restaurantes", "4912f5c4e91d41598e49bb8e97d02f31", [
      ("nombre", "Nombre", "titulo", None), ("notas", "Notas", "texto", None), ("puntuacion", "Puntuación", "numero", None)]),
  ("movimientos", "922bb9e4e3d648feab56d6b2d75be29d", [
      ("concepto", "Concepto", "titulo", None), ("monto", "Monto", "numero", None), ("fecha", "Fecha", "fecha", None),
      ("tipo", "Tipo", "select", ["Ingreso", "Gasto"]), ("categoria", "Categoría", "select", CATEGORIAS),
      ("naturaleza", "Naturaleza", "select", ["Fijo", "Variable"]), ("notas", "Notas", "texto", None),
      ("personas", "Personas", "entero", None), ("restaurante_id", "Restaurante", "relacion", "restaurantes"),
      ("resumen_id", "Resumen financiero", "relacion", "resumen_financiero")]),
  ("presupuesto", "2311995086894d46bcc97ae0dccf66a7", [
      ("categoria", "Categoría", "titulo", None), ("meta_mensual", "Meta mensual", "numero", None),
      ("gastado", "Gastado", "numero", None), ("notas", "Notas", "texto", None)]),
  ("metas_ahorro", "989d7f27af1845a99e7dd0ba84c6fe2a", [
      ("meta", "Meta", "titulo", None), ("tipo", "Tipo", "select", ["Fondo de emergencia", "Meta de ahorro"]),
      ("objetivo", "Objetivo", "numero", None), ("ahorrado", "Ahorrado", "numero", None),
      ("fecha_limite", "Fecha límite", "fecha", None), ("estado", "Estado", "select", ["Sin empezar", "En progreso", "Listo"]),
      ("notas", "Notas", "texto", None)]),
  ("pago_carro", "3605270a91724d6a8c5224543b8bd12d", [
      ("cuota", "Cuota", "titulo", None), ("n", "N°", "numero", None), ("fecha", "Fecha", "fecha", None),
      ("tipo_pago", "Tipo de pago", "select", ["Cuota mensual", "Abono → reducir plazo", "Abono → reducir cuota"]),
      ("monto_pagado", "Monto pagado", "numero", None), ("capital", "Capital", "numero", None),
      ("interes", "Interés", "numero", None), ("gastos_seguros", "Gastos y Seguros", "numero", None),
      ("saldo_pendiente", "Saldo pendiente", "numero", None), ("notas", "Notas", "texto", None)]),
  ("glim", "635e41739ffd48b0aa916ef3463e125a", [
      ("nombre", "Nombre", "titulo", None), ("saldo_actual", "Saldo actual", "numero", None),
      ("recarga_ciclo", "Recarga del ciclo", "numero", None), ("ultimo_correo", "Último correo", "texto", None),
      ("actualizado", "Actualizado", "fechahora", None)]),
  ("movimientos_glim", "c37e671d68e34ad786b6a14c629d8bb7", [
      ("nombre", "Nombre", "titulo", None), ("fecha", "Fecha", "fechahora", None),
      ("tipo", "Tipo", "select", ["Recarga", "Compra"]), ("comercio", "Comercio", "texto", None),
      ("monto", "Monto", "numero", None), ("bolsillo", "Bolsillo", "texto", None),
      ("saldo_despues", "Saldo después", "numero", None), ("id_correo", "ID correo", "texto", None)]),
  ("arriendo", "dda115b1d3f848118c060b953322b15b", [
      ("nombre", "Nombre", "titulo", None), ("ultimo_envio", "Último envío", "fechahora", None)]),
  ("mercado_productos", "266bbfb67edd491e82e2423917460283", [
      ("nombre", "Nombre", "titulo", None), ("grupo", "Grupo", "select", GRUPOS), ("falta", "Falta", "checkbox", None),
      ("marcado_el", "Marcado el", "fechahora", None), ("marcado_por", "Marcado por", "texto", None),
      ("orden", "Orden", "numero", None)]),
  ("mercado_compras", "01c69a2b12204ee7a90fc46c32f94614", [
      ("nombre", "Nombre", "titulo", None), ("fecha", "Fecha", "fecha", None),
      ("producto_id", "ID producto", "texto_uuid", "mercado_productos")]),
]

def pide(url, cuerpo=None, intentos=6):
    datos = json.dumps(cuerpo or {}).encode()
    for i in range(intentos):
        req = urllib.request.Request(url, data=datos, method="POST", headers={
            "Authorization": "Bearer " + TOKEN, "Notion-Version": "2022-06-28", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503) and i < intentos - 1:
                time.sleep(float(e.headers.get("Retry-After", 2 ** i))); continue
            raise SystemExit("Notion respondió %s en %s: %s" % (e.code, url, e.read().decode()[:300]))

def paginas(db):
    cursor = None
    while True:
        cuerpo = {"page_size": 100}
        if cursor: cuerpo["start_cursor"] = cursor
        r = pide("%s/v1/databases/%s/query" % (BASE, db), cuerpo)
        for p in r.get("results", []): yield p
        if not r.get("has_more"): return
        cursor = r.get("next_cursor")

def texto(lista): return "".join(t.get("plain_text", "") for t in (lista or [])).strip() or None
def valor(prop, tipo):
    if not prop: return None
    t = prop.get("type")
    if tipo in ("titulo", "texto", "texto_uuid"): return texto(prop.get("title") if t == "title" else prop.get("rich_text"))
    if tipo in ("numero", "entero"):
        n = prop.get("number")
        return None if n is None else (int(round(n)) if tipo == "entero" else n)
    if tipo == "select": s = prop.get("select") or prop.get("status"); return s.get("name") if s else None
    if tipo == "checkbox": return bool(prop.get("checkbox"))
    if tipo in ("fecha", "fechahora"):
        d = prop.get("date"); s = d.get("start") if d else None
        return (s[:10] if tipo == "fecha" else s) if s else None
    if tipo == "relacion": r = prop.get("relation") or []; return r[0]["id"] if r else None
    return None

def q(v):
    if v is None: return "NULL"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return repr(v)
    return "'" + str(v).replace("'", "''") + "'"

def main():
    if not TOKEN: raise SystemExit("Falta NOTION_TOKEN (la clave de tu integración de Notion).")
    existentes, sql, resumen = {}, ["-- Datos exportados de Notion · " + time.strftime("%Y-%m-%d %H:%M"), "BEGIN;"], []
    for tabla, db, cols in TABLAS:
        ids, filas = set(), 0
        for p in paginas(db):
            fila = {"id": p["id"], "creado": p.get("created_time")}
            for col, prop, tipo, extra in cols:
                v = valor(p["properties"].get(prop), tipo)
                if tipo == "select" and v not in extra: v = None
                if tipo in ("relacion", "texto_uuid"):
                    if tipo == "texto_uuid" and v and len(v) not in (32, 36): v = None
                    if v and len(v) == 32: v = "%s-%s-%s-%s-%s" % (v[:8], v[8:12], v[12:16], v[16:20], v[20:])
                    if v not in existentes.get(extra, set()): v = None
                fila[col] = v
            # valores obligatorios con respaldo
            for col in ("nombre", "concepto", "meta", "cuota", "categoria" if tabla == "presupuesto" else "-"):
                if col in fila and fila[col] is None: fila[col] = "(sin nombre)"
            if tabla == "movimientos":
                if fila["tipo"] is None: fila["tipo"] = "Gasto"
                if fila["monto"] is None: fila["monto"] = 0
                if fila["fecha"] is None: fila["fecha"] = (fila["creado"] or "")[:10] or None
            if tabla == "mercado_compras" and fila["fecha"] is None: fila["fecha"] = (fila["creado"] or "")[:10] or None
            if tabla in ("presupuesto", "metas_ahorro"):
                for c in ("meta_mensual", "gastado", "objetivo", "ahorrado"):
                    if c in fila and fila[c] is None: fila[c] = 0
            if tabla == "movimientos_glim" and fila["id_correo"] == "": fila["id_correo"] = None
            nombres = list(fila)
            sql.append("INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (id) DO UPDATE SET %s;" % (
                tabla, ", ".join(nombres), ", ".join(q(fila[c]) if c != "id" else q(fila[c]) + "::uuid" for c in nombres),
                ", ".join("%s = EXCLUDED.%s" % (c, c) for c in nombres if c != "id")))
            ids.add(p["id"]); filas += 1
        existentes[tabla] = ids; resumen.append((tabla, filas))
    sql.append("COMMIT;")
    with open(SALIDA, "w", encoding="utf-8") as f: f.write("\n".join(sql) + "\n")
    print("Listo →", SALIDA)
    for t, n in resumen: print("  %-20s %5d filas" % (t, n))

if __name__ == "__main__": main()
