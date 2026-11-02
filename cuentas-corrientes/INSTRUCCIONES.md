# Cuentas Corrientes

Página para controlar las cuentas corrientes de San Martín 70 y Dean Funes 18.
Está publicada en Vercel y guarda los datos en Vercel Blob (almacenamiento privado).

- `cuentas-corrientes/`: la página (HTML, CSS y JS).
- `api/datos.js`: la API que valida la contraseña y guarda deudas y pagos.

## Cambiar la contraseña

En Vercel → proyecto → **Settings → Environment Variables**, agregá `CLAVE_ACCESO`
con la contraseña nueva y hacé **Redeploy**.
