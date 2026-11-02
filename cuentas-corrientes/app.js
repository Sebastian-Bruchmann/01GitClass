/* Cuentas Corrientes - San Martín 70 / Dean Funes 18
   Datos guardados en Vercel (API /api/datos + Upstash Redis), protegidos con contraseña. */

const SUCURSALES = ["San Martín 70", "Dean Funes 18"];
const MOTIVOS_DEFAULT = ["Mercadería", "Electros"];

// ---------- Estado ----------
let deudas = [];
let pagos = [];
let motivos = [...MOTIVOS_DEFAULT];
let sucursalActiva = "todas";

// ---------- Utilidades ----------
const $ = (s) => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const hoyISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const fmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
const plata = (n) => fmt.format(n || 0);
const fecha = (iso) => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const redondear = (n) => Math.round(n * 100) / 100;
const diasEntre = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}

function confirmar(titulo, texto, etiqueta = "Confirmar") {
  return new Promise((resolve) => {
    const dlg = $("#modalConfirmar");
    $("#confirmarTitulo").textContent = titulo;
    $("#confirmarTexto").textContent = texto;
    $("#confirmarSi").textContent = etiqueta;
    const fin = (v) => { dlg.close(); $("#confirmarSi").onclick = $("#confirmarNo").onclick = null; resolve(v); };
    $("#confirmarSi").onclick = () => fin(true);
    $("#confirmarNo").onclick = () => fin(false);
    dlg.onclose = () => resolve(false);
    dlg.showModal();
  });
}

// ---------- Persistencia (API en Vercel) ----------
const CLAVE_KEY = "cuentasCorrientes.clave";
let clave = "";

async function api(metodo, cuerpo) {
  const r = await fetch("/api/datos", {
    method: metodo,
    headers: { "Content-Type": "application/json", "x-clave": clave },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    cache: "no-store",
  });
  let data = null;
  try { data = await r.json(); } catch (e) { /* sin cuerpo */ }
  if (!r.ok) { const err = new Error((data && data.error) || "error"); err.status = r.status; err.code = data && data.error; throw err; }
  return data;
}

function aplicar(data) {
  deudas = data.deudas || [];
  pagos = data.pagos || [];
  render();
}

async function recargar() {
  try {
    aplicar(await api("GET"));
    marcarSync("Sincronizado", true);
  } catch (e) {
    if (e.status === 401) { salir("La contraseña cambió. Ingresala de nuevo."); return; }
    marcarSync("Sin conexión: los datos pueden no estar al día", false);
  }
}

async function escribir(cuerpo) {
  try { aplicar(await api("POST", cuerpo)); marcarSync("Sincronizado", true); return true; }
  catch (e) {
    if (e.status === 401) { salir("Ingresá la contraseña de nuevo."); return false; }
    toast("No se pudo guardar. Revisá la conexión y probá de nuevo.");
    return false;
  }
}

const datos = {
  guardarDeuda: (deuda) => escribir({ accion: "guardarDeuda", deuda }),
  eliminarDeuda: (id) => escribir({ accion: "eliminarDeuda", id }),
  guardarPago: (pago) => escribir({ accion: "guardarPago", pago }),
  eliminarPago: (id) => escribir({ accion: "eliminarPago", id }),
};

function marcarSync(texto, ok) {
  const el = $("#estadoSync");
  el.textContent = texto;
  el.classList.toggle("ok", !!ok);
}

// ---------- Cálculos ----------
const pagosDe = (id) => pagos.filter((p) => p.deudaId === id);
const pagadoDe = (d) => redondear(pagosDe(d.id).reduce((a, p) => a + p.monto, 0));
const saldoDe = (d) => redondear(d.monto - pagadoDe(d));
const estadoDe = (d) => { const s = saldoDe(d); return s <= 0 ? "pagada" : s < d.monto ? "parcial" : "pendiente"; };
const enSucursal = (x) => sucursalActiva === "todas" || x.sucursal === sucursalActiva;
const deudaPorId = (id) => deudas.find((d) => d.id === id);

// ---------- Render ----------
function render() {
  renderResumen();
  renderSucursales();
  renderDeudas();
  renderProveedores();
  renderHistorial();
  renderDatalistProveedores();
  if ($("#modalDetalle").open && deudaEnDetalle) {
    if (deudaPorId(deudaEnDetalle)) pintarDetalle(deudaEnDetalle); else $("#modalDetalle").close();
  }
}

function renderResumen() {
  const hoy = hoyISO(), mes = hoy.slice(0, 7);
  const ds = deudas.filter(enSucursal);
  const abiertas = ds.filter((d) => saldoDe(d) > 0);
  const pagosMes = pagos.filter((p) => { const d = deudaPorId(p.deudaId); return d && enSucursal(d) && (p.fecha || "").startsWith(mes); });
  const deudasMes = ds.filter((d) => (d.fecha || "").startsWith(mes));
  const vencidas = abiertas.filter((d) => d.vencimiento && d.vencimiento < hoy);
  $("#resSaldo").textContent = plata(abiertas.reduce((a, d) => a + saldoDe(d), 0));
  $("#resPendientes").textContent = plural(abiertas.length, "deuda abierta", "deudas abiertas");
  $("#resPagadoMes").textContent = plata(pagosMes.reduce((a, p) => a + p.monto, 0));
  $("#resPagosMes").textContent = plural(pagosMes.length, "pago", "pagos");
  $("#resCargadoMes").textContent = plata(deudasMes.reduce((a, d) => a + d.monto, 0));
  $("#resDeudasMes").textContent = plural(deudasMes.length, "deuda nueva", "deudas nuevas");
  $("#resVencido").textContent = plata(vencidas.reduce((a, d) => a + saldoDe(d), 0));
  $("#resVencidoCant").textContent = vencidas.length ? plural(vencidas.length, "deuda vencida", "deudas vencidas") : "Nada vencido";
}

function renderSucursales() {
  const cont = $("#sucursalesResumen");
  if (sucursalActiva !== "todas") { cont.innerHTML = ""; return; }
  cont.innerHTML = SUCURSALES.map((s) => {
    const ab = deudas.filter((d) => d.sucursal === s && saldoDe(d) > 0);
    const saldo = ab.reduce((a, d) => a + saldoDe(d), 0);
    return `<button class="suc-box" data-ir="${esc(s)}">
        <div><h4>${esc(s)}</h4><small>${plural(ab.length, "deuda abierta", "deudas abiertas")}</small></div>
        <strong class="${saldo <= 0 ? "cero" : ""}">${plata(saldo)}</strong>
      </button>`;
  }).join("");
}

function chipVencimiento(d) {
  if (!d.vencimiento || saldoDe(d) <= 0) return "";
  const dias = diasEntre(hoyISO(), d.vencimiento);
  if (dias < 0) return `<span class="chip vencida">Vencida hace ${plural(-dias, "día", "días")}</span>`;
  if (dias === 0) return `<span class="chip pronto">Vence hoy</span>`;
  if (dias <= 7) return `<span class="chip pronto">Vence en ${plural(dias, "día", "días")}</span>`;
  return "";
}

function renderDeudas() {
  const q = $("#buscarDeudas").value.trim().toLowerCase();
  const lista = deudas.filter(enSucursal).filter((d) => saldoDe(d) > 0)
    .filter((d) => !q || [d.proveedor, d.motivo, d.descripcion, d.sucursal].join(" ").toLowerCase().includes(q))
    .sort((a, b) => (a.vencimiento || "9999").localeCompare(b.vencimiento || "9999") || (b.fecha || "").localeCompare(a.fecha || ""));
  const cont = $("#listaDeudas");
  if (!lista.length) {
    cont.innerHTML = `<p class="vacio">${q ? "Sin resultados para esa búsqueda." : "No hay deudas abiertas. Cargá una con “Nueva deuda”."}</p>`;
    return;
  }
  cont.innerHTML = lista.map((d) => {
    const pagado = pagadoDe(d);
    const pct = Math.min(100, Math.round((pagado / d.monto) * 100));
    return `<div class="deuda" data-id="${esc(d.id)}" tabindex="0">
        <div style="min-width:0">
          <div class="deuda-top">
            <span class="deuda-prov">${esc(d.proveedor)}</span>
            <span class="chip">${esc(d.motivo)}</span>
            ${sucursalActiva === "todas" ? `<span class="chip suc">${esc(d.sucursal)}</span>` : ""}
            ${estadoDe(d) === "parcial" ? `<span class="chip parcial">Pago parcial</span>` : ""}
            ${chipVencimiento(d)}
          </div>
          ${d.descripcion ? `<div class="deuda-desc">${esc(d.descripcion)}</div>` : ""}
          <div class="deuda-meta">Cargada el ${fecha(d.fecha)}${d.vencimiento ? ` · Vence ${fecha(d.vencimiento)}` : ""}</div>
          ${pagado > 0 ? `<div class="barra"><span style="width:${pct}%"></span></div>` : ""}
        </div>
        <div class="deuda-der">
          <span class="deuda-saldo">${plata(saldoDe(d))}</span>
          ${pagado > 0 ? `<span class="deuda-orig">de ${plata(d.monto)}</span>` : ""}
          <button class="btn success small" data-pagar="${esc(d.id)}">Pagar</button>
        </div>
      </div>`;
  }).join("");
}

function renderProveedores() {
  const mapa = {};
  deudas.filter(enSucursal).forEach((d) => { const s = saldoDe(d); if (s > 0) mapa[d.proveedor] = (mapa[d.proveedor] || 0) + s; });
  const lista = Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  $("#listaProveedores").innerHTML = lista.length
    ? lista.map(([p, s]) => `<div class="prov"><span title="${esc(p)}">${esc(p)}</span><strong>${plata(s)}</strong></div>`).join("")
    : `<p class="vacio">No hay saldos pendientes con proveedores.</p>`;
}

function movimientos() {
  const movs = [];
  deudas.filter(enSucursal).forEach((d) => movs.push({
    tipo: "deuda", id: d.id, deudaId: d.id, fecha: d.fecha || "", creado: d.creado || 0,
    sucursal: d.sucursal, proveedor: d.proveedor, titulo: d.motivo, detalle: d.descripcion, monto: d.monto,
  }));
  pagos.forEach((p) => {
    const d = deudaPorId(p.deudaId);
    if (!d || !enSucursal(d)) return;
    movs.push({
      tipo: "pago", id: p.id, deudaId: d.id, fecha: p.fecha || "", creado: p.creado || 0,
      sucursal: d.sucursal, proveedor: d.proveedor, titulo: `Pago · ${p.medio}`,
      detalle: [d.motivo, p.nota].filter(Boolean).join(" — "), monto: p.monto,
    });
  });
  return movs.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);
}

function historialFiltrado() {
  const tipo = $("#filtroTipo").value, mes = $("#filtroMes").value;
  const q = $("#buscarHistorial").value.trim().toLowerCase();
  return movimientos()
    .filter((m) => tipo === "todos" || m.tipo === tipo)
    .filter((m) => !mes || m.fecha.startsWith(mes))
    .filter((m) => !q || [m.proveedor, m.titulo, m.detalle, m.sucursal].join(" ").toLowerCase().includes(q));
}

function renderHistorial() {
  const movs = historialFiltrado();
  $("#historialVacio").hidden = movs.length > 0;
  $("#tablaHistorial").innerHTML = movs.map((m) => `
    <tr data-deuda="${esc(m.deudaId)}">
      <td>${fecha(m.fecha)}</td>
      <td><span class="chip ${m.tipo}">${m.tipo === "deuda" ? "Deuda" : "Pago"}</span></td>
      <td>${esc(m.sucursal)}</td>
      <td><b>${esc(m.proveedor)}</b></td>
      <td>${esc(m.titulo)}${m.detalle ? `<div class="detalle-txt">${esc(m.detalle)}</div>` : ""}</td>
      <td class="num ${m.tipo === "deuda" ? "monto-deuda" : "monto-pago"}">${m.tipo === "deuda" ? "+" : "−"} ${plata(m.monto)}</td>
      <td>${m.tipo === "pago" ? `<button class="btn-x" data-borrar-pago="${esc(m.id)}" title="Anular este pago">Anular</button>` : ""}</td>
    </tr>`).join("");
}

function renderMotivos(seleccionado) {
  const sel = $("#selectMotivo");
  const actual = seleccionado || sel.value;
  sel.innerHTML = motivos.map((m) => `<option>${esc(m)}</option>`).join("");
  if (actual && motivos.includes(actual)) sel.value = actual;
}

function renderDatalistProveedores() {
  const provs = [...new Set(deudas.map((d) => d.proveedor))].sort();
  $("#proveedoresList").innerHTML = provs.map((p) => `<option value="${esc(p)}">`).join("");
}

// ---------- Modales ----------
function abrirDeuda(d) {
  $("#formDeuda").reset();
  $("#errorDeuda").textContent = "";
  if (d && d.motivo && !motivos.includes(d.motivo)) motivos = [...motivos, d.motivo];
  renderMotivos();
  $("#tituloModalDeuda").textContent = d ? "Editar deuda" : "Nueva deuda";
  $("#deudaId").value = d ? d.id : "";
  $("#deudaSucursal").value = d ? d.sucursal : (sucursalActiva !== "todas" ? sucursalActiva : SUCURSALES[0]);
  $("#deudaFecha").value = d ? d.fecha : hoyISO();
  $("#deudaProveedor").value = d ? d.proveedor : "";
  if (d) $("#selectMotivo").value = d.motivo;
  $("#deudaMonto").value = d ? d.monto : "";
  $("#deudaDescripcion").value = d ? (d.descripcion || "") : "";
  $("#deudaVencimiento").value = d ? (d.vencimiento || "") : "";
  $("#modalDeuda").showModal();
  $("#deudaProveedor").focus();
}

function abrirPago(deudaId) {
  const abiertas = deudas.filter((d) => saldoDe(d) > 0).filter((d) => deudaId || enSucursal(d))
    .sort((a, b) => a.proveedor.localeCompare(b.proveedor));
  if (!abiertas.length) { toast("No hay deudas pendientes para pagar"); return; }
  $("#formPago").reset();
  $("#errorPago").textContent = "";
  $("#selectDeudaPago").innerHTML = abiertas.map((d) =>
    `<option value="${esc(d.id)}">${esc(d.proveedor)} · ${esc(d.motivo)} · ${esc(d.sucursal)} — ${plata(saldoDe(d))}</option>`).join("");
  if (deudaId) $("#selectDeudaPago").value = deudaId;
  $("#pagoFecha").value = hoyISO();
  actualizarInfoPago(true);
  $("#modalPago").showModal();
}

function actualizarInfoPago(completar) {
  const d = deudaPorId($("#selectDeudaPago").value);
  if (!d) { $("#infoDeudaPago").textContent = ""; return; }
  const saldo = saldoDe(d);
  $("#infoDeudaPago").innerHTML = `Saldo pendiente: <b>${plata(saldo)}</b> (original ${plata(d.monto)})` +
    (d.descripcion ? `<br><small>${esc(d.descripcion)}</small>` : "");
  if (completar) $("#pagoMonto").value = saldo;
}

let deudaEnDetalle = null;
function pintarDetalle(id) {
  const d = deudaPorId(id);
  const saldo = saldoDe(d);
  const ps = pagosDe(id).sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  const estado = estadoDe(d);
  const estadoTxt = { pagada: "Pagada", parcial: "Pago parcial", pendiente: "Pendiente" }[estado];
  $("#detalleContenido").innerHTML = `
    <div class="det-head">
      <div>
        <h3>${esc(d.proveedor)}</h3>
        <span class="chip">${esc(d.motivo)}</span>
        <span class="chip ${estado === "pagada" ? "pagada" : estado === "parcial" ? "parcial" : "deuda"}">${estadoTxt}</span>
        ${chipVencimiento(d)}
      </div>
      <div style="text-align:right">
        <div class="det-monto ${saldo <= 0 ? "ok" : ""}">${plata(Math.max(saldo, 0))}</div>
        <small style="color:var(--muted)">saldo de ${plata(d.monto)}</small>
      </div>
    </div>
    <dl class="det-grid" style="margin-top:12px">
      <dt>Sucursal</dt><dd>${esc(d.sucursal)}</dd>
      <dt>Fecha</dt><dd>${fecha(d.fecha)}</dd>
      ${d.vencimiento ? `<dt>Vencimiento</dt><dd>${fecha(d.vencimiento)}</dd>` : ""}
      ${d.descripcion ? `<dt>Descripción</dt><dd>${esc(d.descripcion)}</dd>` : ""}
    </dl>
    <h4 style="margin:14px 0 6px">Pagos (${ps.length})</h4>
    <div class="det-pagos">
      ${ps.length ? ps.map((p) => `<div class="det-pago"><span>${fecha(p.fecha)} · ${esc(p.medio)}${p.nota ? ` · ${esc(p.nota)}` : ""}</span><b>${plata(p.monto)}</b></div>`).join("")
        : `<small style="color:var(--muted)">Todavía no hay pagos.</small>`}
    </div>`;
  $("#btnPagarDetalle").hidden = saldo <= 0;
}
function abrirDetalle(id) {
  if (!deudaPorId(id)) return;
  deudaEnDetalle = id;
  pintarDetalle(id);
  $("#modalDetalle").showModal();
}

// ---------- Eventos ----------
document.querySelectorAll("[data-cerrar]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
document.querySelectorAll("dialog").forEach((dlg) => dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); }));

function cambiarSucursal(s) {
  sucursalActiva = s;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.sucursal === s));
  render();
}
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest(".tab"); if (b) cambiarSucursal(b.dataset.sucursal); });
$("#sucursalesResumen").addEventListener("click", (e) => { const b = e.target.closest("[data-ir]"); if (b) cambiarSucursal(b.dataset.ir); });

$("#btnNuevaDeuda").addEventListener("click", () => abrirDeuda());
$("#btnPagoRapido").addEventListener("click", () => abrirPago());

$("#formDeuda").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#errorDeuda");
  const monto = redondear(parseFloat($("#deudaMonto").value));
  const proveedor = $("#deudaProveedor").value.trim();
  if (!proveedor) { err.textContent = "Escribí a quién le debés."; return; }
  if (!(monto > 0)) { err.textContent = "Ingresá un monto mayor a cero."; return; }
  if (!$("#deudaFecha").value) { err.textContent = "Elegí la fecha."; return; }
  const id = $("#deudaId").value;
  const previa = id ? deudaPorId(id) : null;
  if (previa && monto < pagadoDe(previa)) { err.textContent = `El monto no puede ser menor a lo ya pagado (${plata(pagadoDe(previa))}).`; return; }
  const deuda = {
    id: id || uid(),
    creado: previa ? (previa.creado || Date.now()) : Date.now(),
    sucursal: $("#deudaSucursal").value,
    fecha: $("#deudaFecha").value,
    proveedor,
    motivo: $("#selectMotivo").value,
    monto,
    descripcion: $("#deudaDescripcion").value.trim(),
    vencimiento: $("#deudaVencimiento").value || "",
  };
  if (await datos.guardarDeuda(deuda)) {
    $("#modalDeuda").close();
    toast(previa ? "Deuda actualizada" : "Deuda cargada");
  }
});

$("#selectDeudaPago").addEventListener("change", () => actualizarInfoPago(true));
$("#btnPagoTotal").addEventListener("click", () => { const d = deudaPorId($("#selectDeudaPago").value); if (d) $("#pagoMonto").value = saldoDe(d); });

$("#formPago").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#errorPago");
  const d = deudaPorId($("#selectDeudaPago").value);
  const monto = redondear(parseFloat($("#pagoMonto").value));
  if (!d || !(monto > 0)) { err.textContent = "Ingresá un monto mayor a cero."; return; }
  if (monto > saldoDe(d)) { err.textContent = `El pago supera el saldo pendiente (${plata(saldoDe(d))}).`; return; }
  if (!$("#pagoFecha").value) { err.textContent = "Elegí la fecha del pago."; return; }
  const saldaTodo = redondear(saldoDe(d) - monto) <= 0;
  const ok = await datos.guardarPago({
    id: uid(), creado: Date.now(), deudaId: d.id,
    fecha: $("#pagoFecha").value, monto, medio: $("#pagoMedio").value, nota: $("#pagoNota").value.trim(),
  });
  if (ok) { $("#modalPago").close(); toast(saldaTodo ? "Deuda saldada" : "Pago registrado"); }
});

$("#listaDeudas").addEventListener("click", (e) => {
  const pagar = e.target.closest("[data-pagar]");
  if (pagar) { abrirPago(pagar.dataset.pagar); return; }
  const fila = e.target.closest(".deuda");
  if (fila) abrirDetalle(fila.dataset.id);
});
$("#listaDeudas").addEventListener("keydown", (e) => {
  const fila = e.target.closest(".deuda");
  if (fila && e.target === fila && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrirDetalle(fila.dataset.id); }
});

$("#tablaHistorial").addEventListener("click", async (e) => {
  const borrar = e.target.closest("[data-borrar-pago]");
  if (borrar) {
    const p = pagos.find((x) => x.id === borrar.dataset.borrarPago);
    if (p && await confirmar("¿Anular este pago?", `Pago de ${plata(p.monto)} del ${fecha(p.fecha)}. La deuda vuelve a quedar con ese saldo.`, "Anular pago")) {
      if (await datos.eliminarPago(p.id)) toast("Pago anulado");
    }
    return;
  }
  const fila = e.target.closest("tr[data-deuda]");
  if (fila) abrirDetalle(fila.dataset.deuda);
});

$("#btnPagarDetalle").addEventListener("click", () => abrirPago(deudaEnDetalle));
$("#btnEditarDeuda").addEventListener("click", () => { const d = deudaPorId(deudaEnDetalle); $("#modalDetalle").close(); abrirDeuda(d); });
$("#btnEliminarDeuda").addEventListener("click", async () => {
  const d = deudaPorId(deudaEnDetalle);
  if (!d) return;
  const n = pagosDe(d.id).length;
  $("#modalDetalle").close();
  const ok = await confirmar("¿Eliminar esta deuda?",
    `Deuda con ${d.proveedor} por ${plata(d.monto)}.` + (n ? ` También se borran ${plural(n, "pago registrado", "pagos registrados")}.` : ""), "Eliminar");
  if (ok && await datos.eliminarDeuda(d.id)) toast("Deuda eliminada");
});

$("#buscarDeudas").addEventListener("input", renderDeudas);
["#filtroTipo", "#filtroMes", "#buscarHistorial"].forEach((s) => $(s).addEventListener("input", renderHistorial));

$("#btnCSV").addEventListener("click", () => {
  const filas = [["Fecha", "Tipo", "Sucursal", "Proveedor", "Motivo/Medio", "Detalle", "Monto"]];
  historialFiltrado().forEach((m) => filas.push([
    fecha(m.fecha), m.tipo === "deuda" ? "Deuda" : "Pago", m.sucursal, m.proveedor, m.titulo, m.detalle || "",
    (m.tipo === "deuda" ? m.monto : -m.monto).toFixed(2).replace(".", ","),
  ]));
  const csv = "\ufeff" + filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `historial-${hoyISO()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$("#btnSalir").addEventListener("click", () => salir());

// ---------- Inicio ----------
let intervalo = null;

function mostrarCandado(msg) {
  $("#app").hidden = true;
  $("#candado").hidden = false;
  $("#errorClave").textContent = msg || "";
  $("#inputClave").value = "";
  $("#inputClave").focus();
}

function salir(msg) {
  clave = "";
  try { localStorage.removeItem(CLAVE_KEY); } catch (e) { /* ignorar */ }
  clearInterval(intervalo);
  deudas = []; pagos = [];
  mostrarCandado(msg);
}

function entrar(data) {
  $("#candado").hidden = true;
  $("#app").hidden = false;
  renderMotivos();
  aplicar(data);
  marcarSync("Sincronizado", true);
  clearInterval(intervalo);
  // Trae los cambios de la otra sucursal cada 15 segundos.
  intervalo = setInterval(() => { if (!document.hidden) recargar(); }, 15000);
}

document.addEventListener("visibilitychange", () => { if (!document.hidden && clave) recargar(); });

async function probarClave(c) {
  clave = c;
  return api("GET");
}

$("#formCandado").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#formCandado button");
  btn.disabled = true;
  $("#errorClave").textContent = "";
  try {
    const data = await probarClave($("#inputClave").value);
    if ($("#recordarClave").checked) { try { localStorage.setItem(CLAVE_KEY, clave); } catch (err) { /* ignorar */ } }
    entrar(data);
  } catch (err) {
    clave = "";
    $("#errorClave").textContent =
      err.status === 401 ? "Contraseña incorrecta. Probá de nuevo." :
      err.code === "sin_base" ? "Falta conectar la base de datos en Vercel (Storage → Upstash Redis)." :
      "No se pudo conectar. Revisá internet y probá de nuevo.";
    $("#inputClave").select();
  } finally { btn.disabled = false; }
});

(async () => {
  let guardada = null;
  try { guardada = localStorage.getItem(CLAVE_KEY); } catch (e) { /* ignorar */ }
  if (!guardada) { mostrarCandado(); return; }
  try { entrar(await probarClave(guardada)); }
  catch (e) { salir(e.status === 401 ? "" : "No se pudo conectar. Ingresá la contraseña para reintentar."); }
})();
