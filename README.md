# Altercom21 — GitHub Pages + Supabase

Portal estático para GitHub Pages con autenticación y base de datos en Supabase.

## Qué incluye
- Web corporativa (`index.html`) con servicios, metodología, planes de auditoría, presupuesto y métodos de pago.
- Registro, inicio de sesión, recuperación y cambio de contraseña.
- Perfil de cliente con **datos de facturación** (NIF/CIF, dirección fiscal).
- Formulario profesional de **presupuesto** y **auditoría** (`solicitud.html`): contacto, sector, urgencia, alcance autorizado, ventana de pruebas, requisitos normativos y declaración de autorización. Si el usuario no ha iniciado sesión, el borrador se guarda y se recupera tras el login.
- Área de cliente (`dashboard.html`): KPIs, línea de tiempo del estado, **aceptar/rechazar presupuesto**, importe con IVA desglosado.
- **Pago** (`pago.html`): transferencia bancaria, Bizum o tarjeta (pasarela externa). Cada pago tiene una referencia única (`ALT-AAMM-XXXXXX`) y el importe se calcula siempre en el servidor.
- Panel de administración (`admin.html`): solicitudes con filtros y buscador, envío de presupuestos con validez, verificación de cobros y listado de clientes.
- SQL con tablas, triggers, políticas RLS y funciones seguras (`respond_quote`, `create_payment`, `mark_payment_sent`).

## 1. Crear el proyecto Supabase
1. Entra en https://supabase.com/ y crea un proyecto.
2. Abre **SQL Editor**.
3. Copia y ejecuta todo `supabase/schema.sql`.
4. Después, copia y ejecuta todo `supabase/02_presupuestos_pagos.sql` (presupuestos, auditorías y pagos). Si ya tenías la base de datos creada, **solo necesitas ejecutar este segundo archivo**: no borra datos y se puede ejecutar varias veces.
5. Ve a **Project Settings → API** (la ubicación puede variar en el panel).
6. Copia la Project URL y la publishable/anon key pública.

## 2. Configurar el frontend
Edita `assets/js/config.js` y reemplaza:
- `SUPABASE_URL` por la URL de tu proyecto.
- `SUPABASE_ANON_KEY` por la clave pública (publishable/anon).

Nunca pongas una `service_role` o secret key en archivos publicados en GitHub.

### Métodos de pago
En el mismo `assets/js/config.js`, rellena `PAYMENT_CONFIG`:
- `transfer.iban` / `beneficiary`: datos de la cuenta donde recibir transferencias.
- `bizum.phone`: teléfono asociado a Bizum (vacío = método desactivado).
- `card.paymentUrl`: enlace de pago de una pasarela externa, por ejemplo un **Stripe Payment Link** (vacío = desactivado). Se le añade `client_reference_id` con la referencia del pago.

La web **nunca** pide ni guarda datos de tarjeta. El flujo es: el administrador envía el presupuesto → el cliente lo acepta → elige método y paga → pulsa «Ya he realizado el pago» → el administrador comprueba el cobro y pulsa «Confirmar cobro» en la pestaña *Pagos* (la solicitud pasa automáticamente a «En curso»).

## 3. Configurar Auth en Supabase
En **Authentication → URL Configuration**:
- Site URL: `https://TU-USUARIO.github.io/Projecte-Intermodular-2026_2027/`
- Añade esa URL a **Redirect URLs**.
- Añade también `https://TU-USUARIO.github.io/Projecte-Intermodular-2026_2027/**` si el panel permite comodines.
- En el proveedor Email, configura confirmación de correo según lo que quieras probar.
- Para recuperación, configura las plantillas de correo y la URL de redirección. El enlace debe acabar en `reset-password.html`.

Sustituye `TU-USUARIO` por tu usuario real de GitHub. Mantén la barra final en Site URL.

## 4. Hacer administrador al usuario inicial
1. Regístrate en la web con la cuenta que quieras usar como administradora.
2. Confirma el correo si Supabase te lo pide.
3. En Supabase → **SQL Editor**, ejecuta lo siguiente, sustituyendo el email:
   ```sql
   update public.profiles p
   set role = 'admin'
   from auth.users u
   where p.id = u.id
     and lower(u.email) = lower('tu-correo@ejemplo.com');
   ```
4. Cierra sesión y vuelve a entrar. Abre `admin.html`.

No añadas un botón público para cambiar roles. La promoción a administrador se hace desde el panel SQL.

## 5. Publicar en GitHub Pages
1. Descomprime este ZIP en tu ordenador.
2. Copia el contenido de la carpeta del proyecto al repositorio de GitHub (no subas solo el ZIP).
3. En GitHub → Settings → Pages, selecciona la rama y carpeta que publican la web (normalmente `main` y `/ (root)`).
4. Espera a que termine el despliegue y abre la URL de GitHub Pages.

Esta carpeta contiene un portal autónomo de ejemplo. Si quieres integrarlo en tu web existente, copia las páginas y `assets/` al repositorio y adapta la navegación/estilos.

## 6. Prueba básica
- Registra un cliente de prueba y confirma el correo.
- Comprueba que puede crear una solicitud y ver solo sus solicitudes.
- Promueve otra cuenta a `admin` desde SQL.
- Entra como administrador y prueba cambiar el estado y el presupuesto.
- Prueba la recuperación de contraseña desde la pantalla de login.

## 7. App de escritorio NEXUS (opcional)
La app de escritorio **Altercom21 NEXUS** (Python + Tkinter) usa **las mismas cuentas** que esta web:
- Una cuenta creada en la app se crea también aquí (Supabase Auth + `profiles`), con la misma confirmación por correo, y al revés.
- El perfil y los datos de facturación son los mismos en la app y en `profile.html`.
- Desde la app se pueden crear solicitudes de auditoría o presupuesto a partir de un escaneo; aparecen en `dashboard.html` y siguen el flujo normal (presupuesto → aceptación → pago en la web).
- Los escaneos que la app sube se muestran en `dashboard.html`, en la sección **Escaneos de NEXUS**.

Para activar la sincronización de escaneos, ejecuta una vez `supabase/03_nexus_app.sql` en el SQL Editor (crea la tabla `nexus_scans` con RLS: cada usuario solo ve y borra sus escaneos, y el administrador puede leerlos todos). Si no se ejecuta, la web y la app siguen funcionando, pero la sección de escaneos permanece oculta.

La app solo usa la clave pública (publishable/anon), igual que la web.

## Seguridad y límites
- GitHub Pages solo sirve archivos estáticos; Supabase proporciona Auth y PostgreSQL.
- La clave pública de Supabase puede estar en el navegador; RLS es imprescindible.
- No publiques contraseñas, claves secretas ni `service_role`.
- Antes de usar datos reales, revisa políticas, configura correo/SMTP y HTTPS, y prueba los permisos con dos cuentas distintas.
- Este proyecto es una base inicial y no sustituye una auditoría de seguridad ni pruebas de aceptación.
