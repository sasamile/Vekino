import pg from "pg";
const PERIODO = process.env.PERIODO || "2026-03";
const c = new pg.Client({ connectionString: process.env.SRC_DB.replace(/[?&]sslmode=[^&]*/i,""), ssl:{rejectUnauthorized:false}});
await c.connect();
const { rows } = await c.query(`
  select
    f.id, f."numeroFactura", f.periodo,
    f."fechaEmision"::date "fechaEmision",
    f."fechaVencimiento"::date "fechaVencimiento",
    f."pdfUrl",
    u.id "unidadLegacyId", u.identificador unidad,
    coalesce(nullif(usr.name,''), nullif(trim(coalesce(usr."firstName",'') || ' ' || coalesce(usr."lastName",'')), ''), 'Residente') "resideName",
    coalesce(f.valor, 0) "vrAdmon",
    usr.email "userEmail"
  from factura f
  join unidad u on u.id = f."unidadId"
  left join "user" usr on usr.id = f."userId"
  where f.periodo = $1 and f."pdfUrl" is not null
  order by f."numeroFactura" asc
`, [PERIODO]);
await c.end();
console.log(JSON.stringify(rows, null, 2));
