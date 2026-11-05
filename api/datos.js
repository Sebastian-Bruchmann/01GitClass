// API de Cuentas Corrientes (función serverless de Vercel).
// Guarda deudas y pagos en Vercel Blob (almacenamiento privado) como un único archivo JSON,
// con control de concurrencia por ETag para que dos sucursales no se pisen.
// Toda llamada necesita la contraseña de acceso en el encabezado "x-clave".

const crypto = require("crypto");
const { get, head, put, BlobPreconditionFailedError, BlobNotFoundError } = require("@vercel/blob");

// SHA-256 de la contraseña de acceso. Para cambiarla sin tocar el código,
// definí la variable de entorno CLAVE_ACCESO en Vercel (Settings → Environment Variables).
const CLAVE_HASH_DEFAULT = "f7fece6ac0a1f72d7650fbd6d566ee946f93e500ecb823553fd81cc5bc98a790";

const ARCHIVO = "cuentas/db.json";
const SUCURSALES = ["San Martín 70", "Dean Funes 18"];
const MEDIOS = ["Efectivo", "Transferencia", "Cheque", "Tarjeta", "Otro"];

const sha256 = (t) => crypto.createHash("sha256").update(String(t), "utf8").digest("hex");

function claveValida(clave) {
  if (typeof clave !== "string" || !clave) return false;
  const esperado = Buffer.from(process.env.CLAVE_ACCESO ? sha256(process.env.CLAVE_ACCESO) : CLAVE_HASH_DEFAULT, "hex");
  const recibido = Buffer.from(sha256(clave), "hex");
  return crypto.timingSafeEqual(esperado, recibido);
}

const hayBase = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

// Huella (ETag) del archivo según la API de Blob: es la que entiende `ifMatch` al escribir.
// (La que devuelve la descarga puede venir de otra capa y no coincidir.)
async function huella() {
  try { return (await head(ARCHIVO)).etag || null; }
  catch (e) { if (e instanceof BlobNotFoundError) return null; throw e; }
}

async function leer() {
  const etag = await huella();
  if (!etag) return { data: { deudas: {}, pagos: {} }, etag: null };
  const r = await get(ARCHIVO, { access: "private", useCache: false });
  // Si la API dice que el archivo existe pero no se pudo leer, no seguimos: así nunca se pisa con datos vacíos.
  if (!r || r.statusCode !== 200 || !r.stream) throw new Error("No se pudo leer el archivo de datos existente");
  const data = JSON.parse(await new Response(r.stream).text());
  return { data: { deudas: data.deudas || {}, pagos: data.pagos || {} }, etag };
}

async function escribirArchivo(data, opciones) {
  await put(ARCHIVO, JSON.stringify(data), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    ...opciones,
  });
}

// Aplica un cambio sobre la última versión. Si otra sucursal guardó en el medio, vuelve a leer y reintenta.
// Si la condición sigue fallando, guarda igual sobre la versión recién leída (nunca deja la carga sin guardar).
async function mutar(cambio) {
  for (let intento = 0; intento < 4; intento++) {
    const { data, etag } = await leer();
    const error = cambio(data);
    if (error) return { error };
    try {
      await escribirArchivo(data, etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false });
      return { data };
    } catch (e) {
      const choque = e instanceof BlobPreconditionFailedError || /exist|precondition/i.test(String(e && e.message));
      if (!choque) throw e;
      console.warn("Reintento de guardado:", e && e.name, e && e.message);
      await new Promise((r) => setTimeout(r, 60 + Math.random() * 180));
    }
  }
  const { data } = await leer();
  const error = cambio(data);
  if (error) return { error };
  await escribirArchivo(data, { allowOverwrite: true });
  return { data };
}

const aListas = (data) => ({
  deudas: Object.entries(data.deudas).map(([id, d]) => ({ id, ...d })),
  pagos: Object.entries(data.pagos).map(([id, p]) => ({ id, ...p })),
});

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

function limpiarPago(p) {
  if (!p || !esId(p.id) || !esId(p.deudaId) || !montoOk(p.monto) || !esFecha(p.fecha)) return null;
  return {
    id: p.id,
    creado: typeof p.creado === "number" ? p.creado : Date.now(),
    deudaId: p.deudaId,
    fecha: p.fecha,
    monto: Math.round(p.monto * 100) / 100,
    medio: MEDIOS.includes(p.medio) ? p.medio : "Otro",
    nota: texto(p.nota, 300),
  };
}

const sinId = (o) => { const c = { ...o }; delete c.id; return c; };

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (!claveValida(req.headers["x-clave"])) {
    await new Promise((r) => setTimeout(r, 700)); // frena intentos repetidos
    return res.status(401).json({ error: "clave" });
  }

  if (!hayBase()) return res.status(500).json({ error: "sin_base" });

  try {
    if (req.method === "GET") return res.status(200).json(aListas((await leer()).data));
    if (req.method !== "POST") return res.status(405).json({ error: "metodo" });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    let cambio;

    switch (body.accion) {
      case "guardarDeuda": {
        const d = limpiarDeuda(body.deuda);
        if (!d) return res.status(400).json({ error: "datos" });
        cambio = (db) => { db.deudas[d.id] = sinId(d); };
        break;
      }
      case "eliminarDeuda": {
        if (!esId(body.id)) return res.status(400).json({ error: "datos" });
        cambio = (db) => {
          delete db.deudas[body.id];
          for (const [id, p] of Object.entries(db.pagos)) if (p.deudaId === body.id) delete db.pagos[id];
        };
        break;
      }
      case "guardarPago": {
        const p = limpiarPago(body.pago);
        if (!p) return res.status(400).json({ error: "datos" });
        cambio = (db) => {
          if (!db.deudas[p.deudaId]) return "deuda_inexistente";
          db.pagos[p.id] = sinId(p);
        };
        break;
      }
      case "eliminarPago": {
        if (!esId(body.id)) return res.status(400).json({ error: "datos" });
        cambio = (db) => { delete db.pagos[body.id]; };
        break;
      }
      default:
        return res.status(400).json({ error: "accion" });
    }

    const r = await mutar(cambio);
    if (r.error) return res.status(400).json({ error: r.error });
    return res.status(200).json(aListas(r.data));
  } catch (e) {
    console.error("Error en /api/datos:", e && e.name, e && e.message);
    return res.status(500).json({ error: "servidor" });
  }
};
