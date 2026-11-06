// API de Cuentas Corrientes (función serverless de Vercel).
// Guarda deudas y pagos en Upstash Redis (Vercel → Storage → Upstash for Redis).
// Cada deuda y cada pago es un campo propio de un hash, así dos sucursales pueden guardar a la vez sin pisarse.
// Cada lectura cuesta 1 pedido (2 comandos); el plan gratis de Upstash alcanza de sobra para dos sucursales.
// Toda llamada necesita la contraseña de acceso en el encabezado "x-clave".

const crypto = require("crypto");

// SHA-256 de la contraseña de acceso. Para cambiarla sin tocar el código,
// definí la variable de entorno CLAVE_ACCESO en Vercel (Settings → Environment Variables).
const CLAVE_HASH_DEFAULT = "f7fece6ac0a1f72d7650fbd6d566ee946f93e500ecb823553fd81cc5bc98a790";

const K_DEUDAS = "cc:deudas";
const K_PAGOS = "cc:pagos";
const SUCURSALES = ["San Martín 70", "Dean Funes 18"];
const MEDIOS = ["Efectivo", "Transferencia", "Cheque", "Tarjeta", "Otro"];

const sha256 = (t) => crypto.createHash("sha256").update(String(t), "utf8").digest("hex");

function claveValida(clave) {
  if (typeof clave !== "string" || !clave) return false;
  const esperado = Buffer.from(process.env.CLAVE_ACCESO ? sha256(process.env.CLAVE_ACCESO) : CLAVE_HASH_DEFAULT, "hex");
  const recibido = Buffer.from(sha256(clave), "hex");
  return crypto.timingSafeEqual(esperado, recibido);
}

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function redis(cfg, comandos) {
  const r = await fetch(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(comandos),
  });
  if (!r.ok) throw new Error(`Redis respondió ${r.status}`);
  const res = await r.json();
  const fallo = res.find((x) => x.error);
  if (fallo) throw new Error(fallo.error);
  return res.map((x) => x.result);
}

function hashAObjetos(lista) {
  const out = [];
  for (let i = 0; i < (lista || []).length; i += 2) {
    try { out.push({ id: lista[i], ...JSON.parse(lista[i + 1]) }); } catch (e) { /* ignorar dato roto */ }
  }
  return out;
}

async function leerTodo(cfg) {
  const [d, p] = await redis(cfg, [["HGETALL", K_DEUDAS], ["HGETALL", K_PAGOS]]);
  return { deudas: hashAObjetos(d), pagos: hashAObjetos(p) };
}

// ---------- Recuperación de los datos del almacenamiento anterior (Vercel Blob) ----------
// El Blob gratis quedó suspendido por exceso de uso. Cuando Vercel lo libere, esto copia sus deudas y pagos
// a Redis una sola vez, sin pisar nada que ya exista (HSETNX). Mientras siga bloqueado, se reintenta como mucho
// una vez por hora para no gastar operaciones.
const K_MIGRA = "cc:migracion-blob";
let migracionTerminada = false;

async function recuperarDatosAnteriores(cfg) {
  if (migracionTerminada || !process.env.BLOB_READ_WRITE_TOKEN) return;
  const [estado] = await redis(cfg, [["GET", K_MIGRA]]);
  if (estado === "ok") { migracionTerminada = true; return; }
  if (estado && Date.now() - Number(estado) < 3600e3) return;
  await redis(cfg, [["SET", K_MIGRA, String(Date.now())]]);
  try {
    const { head, get, BlobNotFoundError } = require("@vercel/blob");
    let info;
    try { info = await head("cuentas/db.json"); }
    catch (e) {
      if (e instanceof BlobNotFoundError) { await redis(cfg, [["SET", K_MIGRA, "ok"]]); migracionTerminada = true; return; }
      throw e;
    }
    const r = await get(info.url, { access: "private", useCache: false });
    if (!r || r.statusCode !== 200 || !r.stream) throw new Error("no se pudo leer el archivo anterior");
    const data = JSON.parse(await new Response(r.stream).text());
    const deudas = Object.entries(data.deudas || {}), pagos = Object.entries(data.pagos || {});
    const cmds = [
      ...deudas.map(([id, d]) => ["HSETNX", K_DEUDAS, id, JSON.stringify(d)]),
      ...pagos.map(([id, p]) => ["HSETNX", K_PAGOS, id, JSON.stringify(p)]),
      ["SET", K_MIGRA, "ok"],
    ];
    await redis(cfg, cmds);
    migracionTerminada = true;
    console.log(`Datos anteriores recuperados: ${deudas.length} deudas y ${pagos.length} pagos`);
  } catch (e) {
    console.warn("Datos anteriores todavía no disponibles:", e && e.message);
  }
}

// ---------- Validación ----------
const texto = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const esFecha = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const esId = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{4,40}$/.test(v);
const montoOk = (v) => typeof v === "number" && isFinite(v) && v > 0 && v < 1e12;

function limpiarDeuda(d) {
  if (!d || !esId(d.id) || !montoOk(d.monto) || !esFecha(d.fecha)) return null;
  if (!SUCURSALES.includes(d.sucursal)) return null;
  const proveedor = texto(d.proveedor, 120);
  if (!proveedor) return null;
  return {
    id: d.id,
    creado: typeof d.creado === "number" ? d.creado : Date.now(),
    sucursal: d.sucursal,
    fecha: d.fecha,
    proveedor,
    motivo: texto(d.motivo, 40) || "Mercadería",
    monto: Math.round(d.monto * 100) / 100,
    descripcion: texto(d.descripcion, 2000),
    vencimiento: esFecha(d.vencimiento) ? d.vencimiento : "",
  };
}

// Un pago se aplica a una factura (deudaId) o "a cuenta" del saldo general de un proveedor en una sucursal.
function limpiarPago(p) {
  if (!p || !esId(p.id) || !montoOk(p.monto) || !esFecha(p.fecha)) return null;
  const aCuenta = p.aCuenta === true;
  if (!aCuenta && !esId(p.deudaId)) return null;
  const destino = aCuenta
    ? { aCuenta: true, sucursal: p.sucursal, proveedor: texto(p.proveedor, 120) }
    : { deudaId: p.deudaId };
  if (aCuenta && (!SUCURSALES.includes(destino.sucursal) || !destino.proveedor)) return null;
  return {
    id: p.id,
    creado: typeof p.creado === "number" ? p.creado : Date.now(),
    ...destino,
    fecha: p.fecha,
    monto: Math.round(p.monto * 100) / 100,
    medio: MEDIOS.includes(p.medio) ? p.medio : "Otro",
    nota: texto(p.nota, 300),
  };
}

const sinId = (o) => { const c = { ...o }; delete c.id; return JSON.stringify(c); };

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (!claveValida(req.headers["x-clave"])) {
    await new Promise((r) => setTimeout(r, 700)); // frena intentos repetidos
    return res.status(401).json({ error: "clave" });
  }

  const cfg = redisConfig();
  if (!cfg) return res.status(500).json({ error: "sin_base" });

  try {
    if (req.method === "GET") {
      await recuperarDatosAnteriores(cfg);
      return res.status(200).json(await leerTodo(cfg));
    }
    if (req.method !== "POST") return res.status(405).json({ error: "metodo" });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    switch (body.accion) {
      case "guardarDeuda": {
        const d = limpiarDeuda(body.deuda);
        if (!d) return res.status(400).json({ error: "datos" });
        await redis(cfg, [["HSET", K_DEUDAS, d.id, sinId(d)]]);
        break;
      }
      case "eliminarDeuda": {
        if (!esId(body.id)) return res.status(400).json({ error: "datos" });
        const { pagos } = await leerTodo(cfg);
        const ids = pagos.filter((p) => p.deudaId === body.id).map((p) => p.id);
        const cmds = [["HDEL", K_DEUDAS, body.id]];
        if (ids.length) cmds.push(["HDEL", K_PAGOS, ...ids]);
        await redis(cfg, cmds);
        break;
      }
      case "guardarPago": {
        const p = limpiarPago(body.pago);
        if (!p) return res.status(400).json({ error: "datos" });
        if (p.deudaId) {
          const [existe] = await redis(cfg, [["HEXISTS", K_DEUDAS, p.deudaId]]);
          if (!existe) return res.status(400).json({ error: "deuda_inexistente" });
        }
        await redis(cfg, [["HSET", K_PAGOS, p.id, sinId(p)]]);
        break;
      }
      case "eliminarPago": {
        if (!esId(body.id)) return res.status(400).json({ error: "datos" });
        await redis(cfg, [["HDEL", K_PAGOS, body.id]]);
        break;
      }
      default:
        return res.status(400).json({ error: "accion" });
    }
    return res.status(200).json(await leerTodo(cfg));
  } catch (e) {
    console.error("Error en /api/datos:", e && e.name, e && e.message);
    return res.status(500).json({ error: "servidor" });
  }
};
