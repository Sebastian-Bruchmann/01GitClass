# Cuentas Corrientes: cómo ponerla en línea

La página guarda los datos en **Firebase** (gratis, de Google) y se publica con **GitHub Pages**.
Cualquiera que tenga el enlace y la contraseña ve y carga la misma información.

## 1. Crear la base de datos en Firebase (una sola vez)

1. Entrá a https://console.firebase.google.com con tu cuenta de Google y tocá **Crear un proyecto**
   (por ejemplo `cuentas-geomayorista`). Google Analytics no hace falta.
2. **Firestore Database** → **Crear base de datos** → ubicación `southamerica-east1` → modo **producción**.
3. En Firestore → pestaña **Reglas**, pegá el contenido de `firestore.rules` y tocá **Publicar**.
4. **Authentication** → **Comenzar** → **Correo electrónico/contraseña** → Habilitar → Guardar.
5. Authentication → **Usuarios** → **Agregar usuario**:
   - Correo: `acceso@geomayorista.com` (el mismo que figura en `firebase-config.js`)
   - Contraseña: la contraseña de acceso que van a usar en los negocios.
6. ⚙ **Configuración del proyecto** → **Tus apps** → ícono **</>** (Web) → registrá la app.
   Copiá los valores de `firebaseConfig` (apiKey, authDomain, projectId, etc.).
7. Pegá esos valores en `firebase-config.js` (o pasáselos a Claude para que los cargue).

## 2. Publicar la página con GitHub Pages

1. En GitHub, en el repositorio → **Settings** → **Pages**.
2. En **Source** elegí **Deploy from a branch**, la rama donde está la página y la carpeta `/ (root)`. Guardá.
3. A los pocos minutos queda en:
   `https://sebastian-bruchmann.github.io/01GitClass/cuentas-corrientes/`
4. En Firebase → Authentication → **Configuración** → **Dominios autorizados**, agregá
   `sebastian-bruchmann.github.io`.

## Cambiar la contraseña

Firebase → Authentication → Usuarios → menú del usuario `acceso@geomayorista.com` → **Restablecer contraseña**
(o borralo y crealo de nuevo con la contraseña nueva). No hace falta tocar el código.
