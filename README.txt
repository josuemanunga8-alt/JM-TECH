JM TECH — TIENDA DE DEMOSTRACIÓN

Ejecución local
Requisitos: Node.js 22 o superior.
1. Copia .env.example como .env.
2. Genera un secreto de sesión: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   Pega el resultado en SESSION_SECRET dentro de .env. No compartas ni publiques .env.
3. Ejecuta npm ci.
4. Crea la cuenta administrativa desde una terminal interactiva:
   npm run admin:create -- nombre_de_usuario
   El usuario admite letras, números, punto, guion y guion bajo; la contraseña requiere 14 caracteres.
   La contraseña se solicita sin mostrarla y se guarda en la base de datos con scrypt, salt aleatorio y comparación segura.
5. Ejecuta npm start y abre http://localhost:3000. No abras index.html directamente.
6. Ejecuta npm test para verificar las pruebas de seguridad.

El servidor local escucha solo en 127.0.0.1. La base de datos y las sesiones SQLite se guardan en .private/,
fuera de los archivos publicados por el servidor. Haz copias de seguridad de esa carpeta y protégelas.
Los archivos .env, .private/ y node_modules/ están excluidos de Git.

Seguridad implementada
- El panel y los datos de productos, clientes y ventas requieren una sesión administrativa verificada en el servidor.
- Cookies HttpOnly, SameSite=Strict, vencimiento de ocho horas y Secure en producción.
- Tokens CSRF y comprobación del origen en las operaciones de autenticación y escritura.
- Límite de ocho intentos fallidos de inicio de sesión por IP cada 15 minutos.
- Validación de datos en el servidor, límite del cuerpo JSON, encabezados de seguridad y Content Security Policy.
- El navegador conserva solo preferencias de compra; clientes y ventas no se guardan en localStorage.
- Los datos administrativos locales antiguos se pueden importar tras iniciar sesión si la base de datos del servidor aún no tiene cambios. Los pedidos de demostración no se migran.

Despliegue público
Esta configuración es solo local y no publica el sitio. Antes de abrirlo en Internet:
- Usa un alojamiento que ejecute Node.js 22+ y almacene persistente la carpeta configurada en DATA_DIR.
- Configura NODE_ENV=production, SESSION_SECRET nuevo y único, APP_ORIGIN con el dominio HTTPS exacto y TRUST_PROXY
  con el número de proxies confiables de tu alojamiento. No uses HTTP ni compartas el archivo .env.
- Revisa las copias de seguridad, permisos, privacidad y retención de datos. Limita el acceso al archivo SQLite.
- El limitador de inicio de sesión está en memoria; para varias instancias configura un almacén compartido de límites.
- El login no implementa restablecimiento de contraseña ni administración de varios usuarios. No agregues cuentas
  compartidas; la cuenta inicial se crea una sola vez con npm run admin:create.
- La tienda, el checkout, los precios y las ventas siguen siendo una demostración: no hay pago real, pedidos
  comerciales, validación de stock transaccional ni proceso de envío. No ingreses información personal real.

Catálogo y gamas
Edita productos.js para agregar modelos. Los productos iniciales se copian a SQLite al crear la base de datos.
Los precios, inventario y especificaciones son de demostración y deben confirmarse antes de publicar o vender.
Las gamas son orientativas: baja hasta $1.000.000 COP; media hasta $2.000.000 COP; alta por encima.

Imágenes
El catálogo usa imágenes locales de iPhone 15, Galaxy A55 y Xiaomi Redmi 15. Xiaomi 15 y OPPO A5 Pro 5G usan
imágenes enlazadas a sus páginas oficiales; HONOR 400 y Motorola Edge 40 usan imágenes de ficha de GSMArena;
iPhone 14 y Samsung Galaxy S24 usan imágenes enlazadas a Apple y Samsung. Cada producto guarda su fuente,
crédito y licencia cuando se conocen. Las licencias de las fotos de GSMArena no están verificadas. Verifica
los permisos de reutilización antes de publicar la tienda comercialmente.

Funciones locales
- Búsqueda, filtros por gama/marca/precio/almacenamiento/color/estado y ordenamiento.
- Carrito, favoritos, comparación, vistos recientemente y cupón de demostración JMTECH10 (10 %).
- Asistente local que filtra y recomienda solo según el catálogo; no es una IA conectada.
- Panel administrativo para productos, inventario, clientes, ventas y reportes (datos de demostración en SQLite).
- Formulario de contacto que valida los datos, pero no los envía.
- El checkout solo muestra una vista previa temporal en la pestaña; no guarda ni envía pedidos ni procesa pagos.

API local
- GET /api/products y GET /api/health son públicos.
- GET /api/auth/csrf prepara el token CSRF; POST /api/auth/session inicia sesión y DELETE /api/auth/session la cierra.
- GET/PUT /api/admin/state y POST /api/admin/import-local requieren sesión válida, origen correcto y token CSRF.
- Las respuestas de API no se almacenan en caché. Los datos administrativos no se sirven como archivos estáticos.

Marca y configuración
La identidad visual es JM TECH, con colores azul/violeta y tipografías Outfit y DM Sans. WhatsApp está
desactivado hasta que se configure WHATSAPP_NUMBER en script.js con indicativo y número comercial, solo dígitos.
