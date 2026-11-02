# Cuentas Corrientes: publicarla en Vercel

Son 2 pasos, todo con clics y una sola vez.

## 1. Importar el proyecto

1. Entrá a https://vercel.com y tocá **Continue with GitHub**.
2. **Add New… → Project** → elegí el repositorio `01GitClass` → **Import**.
3. No cambies nada y tocá **Deploy**.

## 2. Conectar la base de datos (gratis)

1. En el proyecto, abrí la pestaña **Storage** → **Create Database** → **Upstash for Redis** (plan Free).
2. Conectala al proyecto con los valores que vienen por defecto.
3. Pestaña **Deployments** → en el último, menú **⋯** → **Redeploy**.

Listo: el enlace es el que muestra Vercel (algo como `https://01gitclass.vercel.app`).
Cualquiera con el enlace y la contraseña entra y ve los mismos datos.

## Cambiar la contraseña

**Settings → Environment Variables** → agregá `CLAVE_ACCESO` con la contraseña nueva → **Redeploy**.
