# Altercom21 — GitHub Pages + Supabase

Portal estático para GitHub Pages con autenticación y base de datos en Supabase.

## Qué incluye
- Registro, inicio de sesión y cierre de sesión.
- Recuperación y cambio de contraseña.
- Perfil de cliente.
- Solicitudes de auditoría/presupuesto y seguimiento.
- Vista de administrador para consultar solicitudes y actualizar estado/presupuesto.
- SQL con tablas, trigger de perfil, políticas RLS y función de comprobación de administrador.

## 1. Crear el proyecto Supabase
1. Entra en https://supabase.com/ y crea un proyecto.
2. Abre **SQL Editor**.
3. Copia y ejecuta todo `supabase/schema.sql`.
4. Ve a **Project Settings → API** (la ubicación puede variar en el panel).
5. Copia la Project URL y la publishable/anon key pública.

## 2. Configurar el frontend
Edita `assets/js/config.js` y reemplaza:
- `SUPABASE_URL` por la URL de tu proyecto.
- `SUPABASE_ANON_KEY` por la clave pública (publishable/anon).

Nunca pongas una `service_role` o secret key en archivos publicados en GitHub.

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

## Seguridad y límites
- GitHub Pages solo sirve archivos estáticos; Supabase proporciona Auth y PostgreSQL.
- La clave pública de Supabase puede estar en el navegador; RLS es imprescindible.
- No publiques contraseñas, claves secretas ni `service_role`.
- Antes de usar datos reales, revisa políticas, configura correo/SMTP y HTTPS, y prueba los permisos con dos cuentas distintas.
- Este proyecto es una base inicial y no sustituye una auditoría de seguridad ni pruebas de aceptación.
