/* ================================================================
   Cuentas Corrientes - San Martín 70 / Dean Funes 18
   Los datos se guardan en localStorage del navegador.
   ================================================================ */

const STORAGE_KEY = "cuentasCorrientes.v1";
const SUCURSALES = ["San Martín 70", "Dean Funes 18"];
const MOTIVOS_DEFAULT = ["Mercadería", "Servicios", "Alquiler", "Impuestos", "Sueldos", "Mantenimiento", "Otros"];

// ---------- Estado ----------
let db = cargar();
let sucursalActiva = "todas";

function cargar() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return {
        deudas: data.deudas || [],
        pagos: data.pagos || [],
        motivos: data.motivos && data.motivos.length ? data.motivos : [...MOTIVOS_DEFAULT],
      };
    }
  } catch (e) { console.warn("No se pudo leer el almacenamiento", e); }
  return { deudas: [], pagos: [], motivos: [...MOTIVOS_DEFAULT] };
}

function guardar() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    toast("⚠ No se pudo guardar en este navegador");
  }
}

// ---------- Utilidades ----------
const $ = (s) => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const hoyISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const fmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
const plata = (n) => fmt.format(n || 0);
const fecha = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const redondear = (n) => Math.round(n * 100) / 100;
const diasEntre = (isoA, isoB) => Math.round((new Date(isoB) - new Date(isoA)) / 86400000);

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2400);
}

// ---------- Cálculos ----------
function pagosDe(deudaId) {
  return db.pagos.filter((p) => p.deudaId === deudaId);
}
function pagadoDe(deuda) {
  return redondear(pagosDe(deuda.id).reduce((a, p) => a + p.monto, 0));
}
function saldoDe(deuda) {
  return redondear(deuda.monto - pagadoDe(deuda));
}
function estadoDe(deuda) {
  const s = saldoDe(deuda);
  if (s <= 0) return "pagada";
  if (s < deuda.monto) return "parcial";
  return "pendiente";
}
function enSucursal(item) {
  return sucursalActiva === "todas" || item.sucursal === sucursalActiva;
}
function deudaPorId(id) {
  return db.deudas.find((d) => d.id === id);
}

// ---------- Render ----------
function render() {
  renderResumen();
  renderSucursales();
  renderDeudas();
  renderProveedores();
  renderHistorial();
  renderMotivos();
  renderDatalistProveedores();
}

function renderResumen() {
  const hoy = hoyISO();
  const mes = hoy.slice(0, 7);
  const deudas = db.deudas.filter(enSucursal);
  const abiertas = deudas.filter((d) => saldoDe(d) > 0);
  const saldo = abiertas.reduce((a, d) => a + saldoDe(d), 0);

  const pagosMes = db.pagos.filter((p) => {
    const d = deudaPorId(p.deudaId);
    return d && enSucursal(d) && p.fecha.startsWith(mes);
  });
  const deudasMes = deudas.filter((d) => d.fecha.startsWith(mes));
  const vencidas = abiertas.filter((d) => d.vencimiento && d.vencimiento < hoy);

  $("#resSaldo").textContent = plata(saldo);
  $("#resPendientes").textContent = `${abiertas.length} deuda${abiertas.length === 1 ? "" : "s"} abierta${abiertas.length === 1 ? "" : "s"}`;
  $("#resPagadoMes").textContent = plata(pagosMes.reduce((a, p) => a + p.monto, 0));
  $("#resPagosMes").textContent = `${pagosMes.length} pago${pagosMes.length === 1 ? "" : "s"}`;
  $("#resCargadoMes").textContent = plata(deudasMes.reduce((a, d) => a + d.monto, 0));
  $("#resDeudasMes").textContent = `${deudasMes.length} deuda${deudasMes.length === 1 ? "" : "s"} nueva${deudasMes.length === 1 ? "" : "s"}`;
  $("#resVencido").textContent = plata(vencidas.reduce((a, d) => a + saldoDe(d), 0));
  $("#resVencidoCant").textContent = vencidas.length
    ? `${vencidas.length} deuda${vencidas.length === 1 ? "" : "s"} vencida${vencidas.length === 1 ? "" : "s"}`
    : "nada vencido 🎉";
}

function renderSucursales() {
  const cont = $("#sucursalesResumen");
  if (sucursalActiva !== "todas") { cont.innerHTML = ""; return; }
  cont.innerHTML = SUCURSALES.map((s) => {
    const abiertas = db.deudas.filter((d) => d.sucursal === s && saldoDe(d) > 0);
    const saldo = abiertas.reduce((a, d) => a + saldoDe(d), 0);
    return `
      <div class="suc-box" data-ir="${esc(s)}">
        <div>
          <h4>📍 ${esc(s)}</h4>
          <small>${abiertas.length} deuda${abiertas.length === 1 ? "" : "s"} abierta${abiertas.length === 1 ? "" : "s"}</small>
        </div>
        <strong class="${saldo <= 0 ? "cero" : ""}">${plata(saldo)}</strong>
      </div>`;
  }).join("");
}

function chipVencimiento(d) {
  if (!d.vencimiento || saldoDe(d) <= 0) return "";
  const dias = diasEntre(hoyISO(), d.vencimiento);
  if (dias < 0) return `<span class="chip vencida">Vencida hace ${-dias} día${dias === -1 ? "" : "s"}</span>`;
  if (dias === 0) return `<span class="chip pronto">Vence hoy</span>`;
  if (dias <= 7) return `<span class="chip pronto">Vence en ${dias} día${dias === 1 ? "" : "s"}</span>`;
  return "";
}

function renderDeudas() {
  const q = $("#buscarDeudas").value.trim().toLowerCase();
  const abiertas = db.deudas
    .filter(enSucursal)
    .filter((d) => saldoDe(d) > 0)
    .filter((d) => !q || [d.proveedor, d.motivo, d.descripcion, d.sucursal].join(" ").toLowerCase().includes(q))
    .sort((a, b) => (a.vencimiento || "9999") .localeCompare(b.vencimiento || "9999") || b.fecha.localeCompare(a.fecha));

  const cont = $("#listaDeudas");
  if (!abiertas.length) {
    cont.innerHTML = `<p class="vacio">${q ? "Sin resultados." : "No hay deudas abiertas. ¡Todo al día! ✨"}</p>`;
    return;
  }
  cont.innerHTML = abiertas.map((d) => {
    const pagado = pagadoDe(d);
    const pct = Math.min(100, Math.round((pagado / d.monto) * 100));
    const estado = estadoDe(d);
    return `
      <div class="deuda" data-id="${d.id}">
        <div>
          <div class="deuda-top">
            <span class="deuda-prov">${esc(d.proveedor)}</span>
            <span class="chip">${esc(d.motivo)}</span>
            ${sucursalActiva === "todas" ? `<span class="chip suc">${esc(d.sucursal)}</span>` : ""}
            ${estado === "parcial" ? `<span class="chip parcial">Pago parcial</span>` : ""}
            ${chipVencimiento(d)}
          </div>
          ${d.descripcion ? `<div class="deuda-desc">${esc(d.descripcion)}</div>` : ""}
          <div class="deuda-meta">Cargada el ${fecha(d.fecha)}${d.vencimiento ? ` · Vence ${fecha(d.vencimiento)}` : ""}</div>
          ${pagado > 0 ? `<div class="barra"><span style="width:${pct}%"></span></div>` : ""}
        </div>
        <div class="deuda-der">
          <span class="deuda-saldo">${plata(saldoDe(d))}</span>
          ${pagado > 0 ? `<span class="deuda-orig">de ${plata(d.monto)}</span>` : ""}
          <button class="btn success small" data-pagar="${d.id}">Pagar</button>
        </div>
      </div>`;
  }).join("");
}

function renderProveedores() {
  const mapa = {};
  db.deudas.filter(enSucursal).forEach((d) => {
    const s = saldoDe(d);
    if (s > 0) mapa[d.proveedor] = (mapa[d.proveedor] || 0) + s;
  });
  const lista = Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  $("#listaProveedores").innerHTML = lista.length
    ? lista.map(([p, s]) => `<div class="prov"><span title="${esc(p)}">${esc(p)}</span><strong>${plata(s)}</strong></div>`).join("")
    : `<p class="vacio">No se le debe nada a nadie 🙌</p>`;
}

function movimientos() {
  const movs = [];
  db.deudas.filter(enSucursal).forEach((d) => {
    movs.push({
      tipo: "deuda", id: d.id, deudaId: d.id, fecha: d.fecha, creado: d.creado || 0,
      sucursal: d.sucursal, proveedor: d.proveedor,
      titulo: d.motivo, detalle: d.descripcion, monto: d.monto,
    });
  });
  db.pagos.forEach((p) => {
    const d = deudaPorId(p.deudaId);
    if (!d || !enSucursal(d)) return;
    movs.push({
      tipo: "pago", id: p.id, deudaId: d.id, fecha: p.fecha, creado: p.creado || 0,
      sucursal: d.sucursal, proveedor: d.proveedor,
      titulo: `Pago · ${p.medio}`, detalle: [d.motivo, p.nota].filter(Boolean).join(" — "), monto: p.monto,
    });
  });
  return movs.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);
}

function historialFiltrado() {
  const tipo = $("#filtroTipo").value;
  const mes = $("#filtroMes").value;
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
    <tr data-deuda="${m.deudaId}" style="cursor:pointer">
      <td>${fecha(m.fecha)}</td>
      <td><span class="chip ${m.tipo}">${m.tipo === "deuda" ? "Deuda" : "Pago"}</span></td>
      <td>${esc(m.sucursal)}</td>
      <td><b>${esc(m.proveedor)}</b></td>
      <td>${esc(m.titulo)}${m.detalle ? `<div class="detalle-txt">${esc(m.detalle)}</div>` : ""}</td>
      <td class="num ${m.tipo === "deuda" ? "monto-deuda" : "monto-pago"}">${m.tipo === "deuda" ? "+" : "−"} ${plata(m.monto)}</td>
      <td>${m.tipo === "pago" ? `<button class="btn-x" data-borrar-pago="${m.id}" title="Anular pago">✕</button>` : ""}</td>
    </tr>`).join("");
}

function renderMotivos(seleccionado) {
  const sel = $("#selectMotivo");
  const actual = seleccionado || sel.value;
  sel.innerHTML = db.motivos.map((m) => `<option>${esc(m)}</option>`).join("");
  if (actual && db.motivos.includes(actual)) sel.value = actual;
}

function renderDatalistProveedores() {
  const provs = [...new Set(db.deudas.map((d) => d.proveedor))].sort();
  $("#proveedoresList").innerHTML = provs.map((p) => `<option value="${esc(p)}">`).join("");
}

// ---------- Modales ----------
function abrirDeuda(deuda) {
  const f = $("#formDeuda");
  f.reset();
  renderMotivos();
  $("#tituloModalDeuda").textContent = deuda ? "Editar deuda" : "Nueva deuda";
  f.id.value = deuda ? deuda.id : "";
  f.sucursal.value = deuda ? deuda.sucursal : (sucursalActiva !== "todas" ? sucursalActiva : SUCURSALES[0]);
  f.fecha.value = deuda ? deuda.fecha : hoyISO();
  f.proveedor.value = deuda ? deuda.proveedor : "";
  if (deuda) {
    if (!db.motivos.includes(deuda.motivo)) { db.motivos.push(deuda.motivo); renderMotivos(); }
    f.motivo.value = deuda.motivo;
  }
  f.monto.value = deuda ? deuda.monto : "";
  f.descripcion.value = deuda ? deuda.descripcion : "";
  f.vencimiento.value = deuda ? (deuda.vencimiento || "") : "";
  $("#modalDeuda").showModal();
  f.proveedor.focus();
}

function abrirPago(deudaId) {
  const abiertas = db.deudas
    .filter((d) => saldoDe(d) > 0)
    .filter((d) => deudaId || enSucursal(d))
    .sort((a, b) => a.proveedor.localeCompare(b.proveedor));
  if (!abiertas.length) { toast("No hay deudas pendientes para pagar 🎉"); return; }

  const f = $("#formPago");
  f.reset();
  $("#selectDeudaPago").innerHTML = abiertas.map((d) =>
    `<option value="${d.id}">${esc(d.proveedor)} · ${esc(d.motivo)} · ${esc(d.sucursal)} — ${plata(saldoDe(d))}</option>`).join("");
  if (deudaId) f.deudaId.value = deudaId;
  f.fecha.value = hoyISO();
  actualizarInfoPago(true);
  $("#modalPago").showModal();
}

function actualizarInfoPago(completarMonto) {
  const f = $("#formPago");
  const d = deudaPorId(f.deudaId.value);
  if (!d) { $("#infoDeudaPago").textContent = ""; return; }
  const saldo = saldoDe(d);
  $("#infoDeudaPago").innerHTML =
    `Saldo pendiente: <b>${plata(saldo)}</b> (original ${plata(d.monto)})` +
    (d.descripcion ? `<br><small>${esc(d.descripcion)}</small>` : "");
  f.monto.max = saldo;
  if (completarMonto) f.monto.value = saldo;
}

let deudaEnDetalle = null;
function abrirDetalle(id) {
  const d = deudaPorId(id);
  if (!d) return;
  deudaEnDetalle = id;
  const saldo = saldoDe(d);
  const pagos = pagosDe(id).sort((a, b) => a.fecha.localeCompare(b.fecha));
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
    <dl class="det-grid">
      <dt>Sucursal</dt><dd>${esc(d.sucursal)}</dd>
      <dt>Fecha</dt><dd>${fecha(d.fecha)}</dd>
      ${d.vencimiento ? `<dt>Vencimiento</dt><dd>${fecha(d.vencimiento)}</dd>` : ""}
      ${d.descripcion ? `<dt>Descripción</dt><dd>${esc(d.descripcion)}</dd>` : ""}
    </dl>
    <h4 style="margin:6px 0 0">Pagos (${pagos.length})</h4>
    <div class="det-pagos">
      ${pagos.length ? pagos.map((p) => `
        <div class="det-pago">
          <span>${fecha(p.fecha)} · ${esc(p.medio)}${p.nota ? ` · ${esc(p.nota)}` : ""}</span>
          <b>${plata(p.monto)}</b>
        </div>`).join("") : `<small style="color:var(--muted)">Todavía no hay pagos.</small>`}
    </div>`;
  $("#btnPagarDetalle").hidden = saldo <= 0;
  $("#modalDetalle").showModal();
}

// ---------- Eventos ----------
document.querySelectorAll("[data-cerrar]").forEach((b) =>
  b.addEventListener("click", () => b.closest("dialog").close()));

document.querySelectorAll("dialog").forEach((dlg) =>
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); }));

$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest(".tab");
  if (b) cambiarSucursal(b.dataset.sucursal);
});

$("#sucursalesResumen").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ir]");
  if (b) cambiarSucursal(b.dataset.ir);
});

function cambiarSucursal(s) {
  sucursalActiva = s;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.sucursal === s));
  render();
}

$("#btnNuevaDeuda").addEventListener("click", () => abrirDeuda());
$("#btnPagoRapido").addEventListener("click", () => abrirPago());

$("#btnNuevoMotivo").addEventListener("click", () => {
  const nombre = (prompt("Nombre del nuevo motivo:") || "").trim();
  if (!nombre) return;
  if (!db.motivos.some((m) => m.toLowerCase() === nombre.toLowerCase())) {
    db.motivos.push(nombre);
    guardar();
  }
  renderMotivos(db.motivos.find((m) => m.toLowerCase() === nombre.toLowerCase()));
  toast(`Motivo "${nombre}" disponible`);
});

$("#formDeuda").addEventListener("submit", (e) => {
  const f = e.target;
  const monto = redondear(parseFloat(f.monto.value));
  if (!(monto > 0)) { e.preventDefault(); toast("Ingresá un monto válido"); return; }
  const datos = {
    sucursal: f.sucursal.value,
    fecha: f.fecha.value,
    proveedor: f.proveedor.value.trim(),
    motivo: f.motivo.value,
    monto,
    descripcion: f.descripcion.value.trim(),
    vencimiento: f.vencimiento.value || "",
  };
  if (f.id.value) {
    const d = deudaPorId(f.id.value);
    if (monto < pagadoDe(d)) {
      e.preventDefault();
      toast(`El monto no puede ser menor a lo ya pagado (${plata(pagadoDe(d))})`);
      return;
    }
    Object.assign(d, datos);
    toast("Deuda actualizada ✏");
    $("#modalDetalle").close();
  } else {
    db.deudas.push({ id: uid(), creado: Date.now(), ...datos });
    toast("Deuda cargada 📌");
  }
  guardar();
  render();
});

$("#selectDeudaPago").addEventListener("change", () => actualizarInfoPago(true));
$("#btnPagoTotal").addEventListener("click", () => {
  const d = deudaPorId($("#formPago").deudaId.value);
  if (d) $("#formPago").monto.value = saldoDe(d);
});

$("#formPago").addEventListener("submit", (e) => {
  const f = e.target;
  const d = deudaPorId(f.deudaId.value);
  const monto = redondear(parseFloat(f.monto.value));
  if (!d || !(monto > 0)) { e.preventDefault(); toast("Ingresá un monto válido"); return; }
  if (monto > saldoDe(d)) {
    e.preventDefault();
    toast(`El pago supera el saldo (${plata(saldoDe(d))})`);
    return;
  }
  db.pagos.push({
    id: uid(), creado: Date.now(), deudaId: d.id,
    fecha: f.fecha.value, monto, medio: f.medio.value, nota: f.nota.value.trim(),
  });
  guardar();
  render();
  if ($("#modalDetalle").open) abrirDetalle(d.id);
  toast(saldoDe(d) <= 0 ? "¡Deuda saldada! ✅" : "Pago registrado 💸");
});

$("#listaDeudas").addEventListener("click", (e) => {
  const pagar = e.target.closest("[data-pagar]");
  if (pagar) { e.stopPropagation(); abrirPago(pagar.dataset.pagar); return; }
  const fila = e.target.closest(".deuda");
  if (fila) abrirDetalle(fila.dataset.id);
});

$("#tablaHistorial").addEventListener("click", (e) => {
  const borrar = e.target.closest("[data-borrar-pago]");
  if (borrar) {
    e.stopPropagation();
    const p = db.pagos.find((x) => x.id === borrar.dataset.borrarPago);
    if (p && confirm(`¿Anular el pago de ${plata(p.monto)} del ${fecha(p.fecha)}?`)) {
      db.pagos = db.pagos.filter((x) => x.id !== p.id);
      guardar(); render(); toast("Pago anulado");
    }
    return;
  }
  const fila = e.target.closest("tr[data-deuda]");
  if (fila) abrirDetalle(fila.dataset.deuda);
});

$("#btnPagarDetalle").addEventListener("click", () => abrirPago(deudaEnDetalle));
$("#btnEditarDeuda").addEventListener("click", () => abrirDeuda(deudaPorId(deudaEnDetalle)));
$("#btnEliminarDeuda").addEventListener("click", () => {
  const d = deudaPorId(deudaEnDetalle);
  if (!d) return;
  const n = pagosDe(d.id).length;
  if (!confirm(`¿Eliminar la deuda con ${d.proveedor} por ${plata(d.monto)}?` +
    (n ? `\nTambién se borrarán sus ${n} pago(s).` : ""))) return;
  db.deudas = db.deudas.filter((x) => x.id !== d.id);
  db.pagos = db.pagos.filter((p) => p.deudaId !== d.id);
  guardar(); render();
  $("#modalDetalle").close();
  toast("Deuda eliminada 🗑");
});

["#buscarDeudas"].forEach((s) => $(s).addEventListener("input", renderDeudas));
["#filtroTipo", "#filtroMes", "#buscarHistorial"].forEach((s) => $(s).addEventListener("input", renderHistorial));

// ---------- Respaldo / exportación ----------
function descargar(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("#btnExportar").addEventListener("click", () => {
  descargar(`cuentas-corrientes-${hoyISO()}.json`, JSON.stringify(db, null, 2), "application/json");
  toast("Respaldo descargado 💾");
});

$("#inputImportar").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.deudas) || !Array.isArray(data.pagos)) throw new Error("formato");
    if (!confirm(`Se van a reemplazar los datos actuales por el respaldo (${data.deudas.length} deudas, ${data.pagos.length} pagos). ¿Continuar?`)) return;
    db = { deudas: data.deudas, pagos: data.pagos, motivos: data.motivos?.length ? data.motivos : [...MOTIVOS_DEFAULT] };
    guardar(); render();
    toast("Respaldo restaurado ✅");
  } catch {
    toast("⚠ El archivo no es un respaldo válido");
  }
});

$("#btnCSV").addEventListener("click", () => {
  const filas = [["Fecha", "Tipo", "Sucursal", "Proveedor", "Motivo/Medio", "Detalle", "Monto"]];
  historialFiltrado().forEach((m) => filas.push([
    fecha(m.fecha), m.tipo === "deuda" ? "Deuda" : "Pago", m.sucursal, m.proveedor,
    m.titulo, m.detalle || "", (m.tipo === "deuda" ? m.monto : -m.monto).toFixed(2).replace(".", ","),
  ]));
  const csv = filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  descargar(`historial-${hoyISO()}.csv`, "﻿" + csv, "text/csv;charset=utf-8");
});

// ---------- Inicio ----------
render();
