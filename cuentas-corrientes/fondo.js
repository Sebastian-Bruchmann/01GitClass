/* Fondo animado inspirado en el logo de GEO: destellos que titilan y suben despacio.
   Se pausa cuando la pestaña no está visible y queda quieto si el sistema pide menos movimiento. */
(function () {
  const canvas = document.getElementById("destellos");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const quieto = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const oscuroMq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  let ancho = 0, alto = 0, dpr = 1, estrellas = [], ultimo = 0, corriendo = false;

  const esOscuro = () => {
    const t = document.documentElement.getAttribute("data-theme");
    return t ? t === "dark" : !!(oscuroMq && oscuroMq.matches);
  };

  function crear() {
    const cantidad = Math.round(Math.min(70, Math.max(24, (ancho * alto) / 26000)));
    estrellas = Array.from({ length: cantidad }, () => ({
      x: Math.random() * ancho,
      y: Math.random() * alto,
      r: 1.5 + Math.random() * 3.5,               // tamaño del destello
      fase: Math.random() * Math.PI * 2,
      vel: 0.4 + Math.random() * 0.9,             // velocidad del titileo
      sube: 4 + Math.random() * 10,               // px por segundo hacia arriba
      naranja: Math.random() < 0.18,              // algunos con el naranja del logo
    }));
  }

  function medir() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    ancho = window.innerWidth; alto = window.innerHeight;
    canvas.width = ancho * dpr; canvas.height = alto * dpr;
    canvas.style.width = ancho + "px"; canvas.style.height = alto + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    crear();
  }

  // Destello de 4 puntas como los del logo
  function destello(x, y, r, a, color) {
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 2.4);
    ctx.quadraticCurveTo(x, y, x + r * 2.4, y);
    ctx.quadraticCurveTo(x, y, x, y + r * 2.4);
    ctx.quadraticCurveTo(x, y, x - r * 2.4, y);
    ctx.quadraticCurveTo(x, y, x, y - r * 2.4);
    ctx.fill();
    ctx.globalAlpha = a * 0.35;
    ctx.beginPath(); ctx.arc(x, y, r * 1.1, 0, Math.PI * 2); ctx.fill();
  }

  function dibujar(t) {
    const dt = ultimo ? Math.min(0.05, (t - ultimo) / 1000) : 0;
    ultimo = t;
    ctx.clearRect(0, 0, ancho, alto);
    const oscuro = esOscuro();
    const base = oscuro ? "#ffffff" : "#2f5d88";
    const naranja = oscuro ? "#f47b3e" : "#ed611f";
    const maximo = oscuro ? 0.85 : 0.5;
    for (const e of estrellas) {
      if (!quieto) {
        e.y -= e.sube * dt;
        if (e.y < -20) { e.y = alto + 20; e.x = Math.random() * ancho; }
      }
      const brillo = quieto ? 0.6 : (Math.sin(t / 1000 * e.vel + e.fase) + 1) / 2;
      const a = Math.pow(brillo, 3) * maximo;     // la mayor parte del tiempo tenues, con picos de brillo
      if (a > 0.02) destello(e.x, e.y, e.r * (0.7 + brillo * 0.5), a, e.naranja ? naranja : base);
    }
    ctx.globalAlpha = 1;
    if (corriendo) requestAnimationFrame(dibujar);
  }

  function arrancar() {
    if (quieto) { requestAnimationFrame(dibujar); return; }
    if (corriendo || document.hidden) return;
    corriendo = true; ultimo = 0;
    requestAnimationFrame(dibujar);
  }

  window.addEventListener("resize", () => { medir(); if (quieto) requestAnimationFrame(dibujar); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) corriendo = false; else arrancar();
  });
  if (oscuroMq && oscuroMq.addEventListener) oscuroMq.addEventListener("change", () => quieto && requestAnimationFrame(dibujar));
  medir();
  arrancar();
})();
