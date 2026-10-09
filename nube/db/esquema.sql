-- Armoni · base de datos propia (PostgreSQL). Reemplaza a Notion.
-- Se puede correr varias veces sin romper nada.
-- Los ids son uuid y, al migrar, conservan el mismo id que tenían en Notion
-- (así lo que ya apunta a "ID producto" sigue funcionando).


CREATE TABLE IF NOT EXISTS resumen_financiero (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre  text NOT NULL,
  creado  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS restaurantes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL,
  notas      text,
  puntuacion numeric(4,1),
  creado     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS movimientos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concepto    text NOT NULL,
  monto       numeric(14,2) NOT NULL DEFAULT 0,
  fecha       date NOT NULL DEFAULT CURRENT_DATE,
  tipo        text NOT NULL CHECK (tipo IN ('Ingreso','Gasto')),
  categoria   text CHECK (categoria IN ('Hogar','Hijo','Carro','Alimentación','Servicios','Salud','Salidas','Ahorro','Otros','Tarjetas')),
  naturaleza  text CHECK (naturaleza IN ('Fijo','Variable')),
  notas       text,
  personas    integer,
  restaurante_id uuid REFERENCES restaurantes(id) ON DELETE SET NULL,
  resumen_id     uuid REFERENCES resumen_financiero(id) ON DELETE SET NULL,
  creado      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS movimientos_fecha_idx ON movimientos (fecha);
CREATE INDEX IF NOT EXISTS movimientos_restaurante_idx ON movimientos (restaurante_id);

CREATE TABLE IF NOT EXISTS presupuesto (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria     text NOT NULL UNIQUE,
  meta_mensual  numeric(14,2) NOT NULL DEFAULT 0,
  gastado       numeric(14,2) NOT NULL DEFAULT 0,
  notas         text,
  creado        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS metas_ahorro (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta          text NOT NULL,
  tipo          text CHECK (tipo IN ('Fondo de emergencia','Meta de ahorro')),
  objetivo      numeric(14,2) NOT NULL DEFAULT 0,
  ahorrado      numeric(14,2) NOT NULL DEFAULT 0,
  fecha_limite  date,
  estado        text CHECK (estado IN ('Sin empezar','En progreso','Listo')),
  notas         text,
  creado        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pago_carro (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuota            text NOT NULL,
  n                numeric(6,0),
  fecha            date,
  tipo_pago        text CHECK (tipo_pago IN ('Cuota mensual','Abono → reducir plazo','Abono → reducir cuota')),
  monto_pagado     numeric(14,2),
  capital          numeric(14,2),
  interes          numeric(14,2),
  gastos_seguros   numeric(14,2),
  saldo_pendiente  numeric(14,2),
  notas            text,
  creado           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS glim (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           text NOT NULL,
  saldo_actual     numeric(14,2),
  recarga_ciclo    numeric(14,2),
  ultimo_correo    text,
  actualizado      timestamptz,
  creado           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS movimientos_glim (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        text NOT NULL,
  fecha         timestamptz,
  tipo          text CHECK (tipo IN ('Recarga','Compra')),
  comercio      text,
  monto         numeric(14,2),
  bolsillo      text,
  saldo_despues numeric(14,2),
  id_correo     text UNIQUE,            -- evita registrar dos veces el mismo correo
  creado        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS arriendo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        text NOT NULL,
  ultimo_envio  timestamptz,
  creado        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mercado_productos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       text NOT NULL,
  grupo        text CHECK (grupo IN ('Despensa','Lácteos','Carnes','Ema','Aseo','Otros','Frutas y verduras')),
  falta        boolean NOT NULL DEFAULT false,
  marcado_el   timestamptz,
  marcado_por  text,
  orden        numeric(10,2),
  creado       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mercado_compras (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       text NOT NULL,
  fecha        date NOT NULL DEFAULT CURRENT_DATE,
  producto_id  uuid REFERENCES mercado_productos(id) ON DELETE SET NULL,
  creado       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mercado_compras_producto_idx ON mercado_compras (producto_id, fecha);

-- ───────── Vistas: lo que en Notion eran fórmulas y rollups ─────────

CREATE OR REPLACE VIEW v_movimientos AS
SELECT m.*,
       to_char(m.fecha, 'YYYY-MM')                      AS mes,
       CASE WHEN m.tipo = 'Ingreso' THEN m.monto ELSE 0 END AS monto_ingreso,
       CASE WHEN m.tipo = 'Gasto'   THEN m.monto ELSE 0 END AS monto_gasto
FROM movimientos m;

CREATE OR REPLACE VIEW v_resumen_financiero AS
SELECT r.id, r.nombre,
       COALESCE(SUM(CASE WHEN m.tipo='Ingreso' THEN m.monto END), 0) AS ingresos_totales,
       COALESCE(SUM(CASE WHEN m.tipo='Gasto'   THEN m.monto END), 0) AS gastos_totales,
       COALESCE(SUM(CASE WHEN m.tipo='Ingreso' THEN m.monto END), 0)
     - COALESCE(SUM(CASE WHEN m.tipo='Gasto'   THEN m.monto END), 0) AS balance
FROM resumen_financiero r LEFT JOIN movimientos m ON m.resumen_id = r.id
GROUP BY r.id, r.nombre;

CREATE OR REPLACE VIEW v_resumen_mensual AS
SELECT to_char(fecha,'YYYY-MM') AS mes,
       SUM(CASE WHEN tipo='Ingreso' THEN monto ELSE 0 END) AS ingresos,
       SUM(CASE WHEN tipo='Gasto'   THEN monto ELSE 0 END) AS gastos,
       SUM(CASE WHEN tipo='Ingreso' THEN monto ELSE -monto END) AS balance
FROM movimientos GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW v_restaurantes AS
SELECT r.id, r.nombre, r.notas, r.puntuacion,
       COUNT(m.id)                       AS veces,
       ROUND(AVG(m.monto))               AS promedio_gasto,
       MAX(m.fecha)                      AS ultima_visita
FROM restaurantes r LEFT JOIN movimientos m ON m.restaurante_id = r.id
GROUP BY r.id;

CREATE OR REPLACE VIEW v_presupuesto AS
SELECT p.*,
       p.meta_mensual - p.gastado AS restante,
       CASE WHEN p.meta_mensual > 0 THEN ROUND(100 * p.gastado / p.meta_mensual, 1) END AS pct_usado
FROM presupuesto p;

CREATE OR REPLACE VIEW v_metas_ahorro AS
SELECT g.*,
       g.objetivo - g.ahorrado AS falta,
       CASE WHEN g.objetivo > 0 THEN ROUND(100 * g.ahorrado / g.objetivo, 1) END AS progreso_pct
FROM metas_ahorro g;

-- Lo que la app de Mercar necesita: duración promedio entre compras de días distintos
CREATE OR REPLACE VIEW v_mercado_estado AS
WITH dias AS (
  SELECT DISTINCT producto_id, fecha FROM mercado_compras WHERE producto_id IS NOT NULL
), saltos AS (
  SELECT producto_id, fecha,
         fecha - LAG(fecha) OVER (PARTITION BY producto_id ORDER BY fecha) AS dias_desde_anterior
  FROM dias
), resumen AS (
  SELECT producto_id,
         COUNT(*)                          AS veces,
         MAX(fecha)                        AS ultima_compra,
         ROUND(AVG(dias_desde_anterior))   AS dura_dias
  FROM saltos GROUP BY producto_id
)
SELECT p.id, p.nombre, p.grupo, p.falta, p.marcado_el, p.marcado_por, p.orden,
       COALESCE(r.veces, 0)  AS veces,
       r.ultima_compra,
       CASE WHEN r.dura_dias >= 1 THEN r.dura_dias END AS dura_dias
FROM mercado_productos p LEFT JOIN resumen r ON r.producto_id = p.id;
