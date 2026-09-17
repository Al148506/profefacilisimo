# Fase 1: base implementada

## Alcance
Frontend React/TypeScript/Vite, API .NET 10, PostgreSQL con Compose, Identity + JWT,
sesiones renovables, modelos Lesson/Activity y pruebas. No hay CRUD de clases,
editor, player ni IA. La pantalla privada es un estado vacío explícito, no un dashboard simulado.

## Requisitos y arranque
- PowerShell 7, SDK .NET 10, Node 24 y Docker Desktop con motor Linux iniciado.
- En esta máquina el SDK está instalado en .tools/dotnet; los scripts lo detectan.
- Puertos locales: PostgreSQL 5432, API 5080, Vite 5173, API E2E 5081.
- Ejecutar desde la raíz:

```powershell
./scripts/Setup.ps1
./scripts/Start-Api.ps1
# En otra terminal:
npm --prefix frontend run dev
```

Abrir http://localhost:5173. Registrar una cuenta, entrar, recargar y cerrar sesión.
Setup crea .env y .tools/local-settings.json con secretos aleatorios si no existen.
No sobrescribe secretos existentes; ambos archivos están ignorados por Git.
Los secretos locales son archivos de desarrollo, NO un almacén para producción.
Si cambias .env, actualiza también local-settings.json y las credenciales del servidor.
Cambiar POSTGRES_PASSWORD no cambia la contraseña de un volumen ya inicializado.

Setup es repetible: levanta PostgreSQL, restaura dependencias y aplica migraciones pendientes.
No se aplican migraciones automáticamente al iniciar la API en producción.

## Etapas y archivos
1. Estructura: Profefacilisimo.slnx, global.json, Directory.Build.props, backend/*/*.csproj,
   frontend/package.json y package-lock.json, frontend/tsconfig.json, vite.config.ts,
   eslint.config.js, .editorconfig, .gitignore.
   Prueba: dotnet build Profefacilisimo.slnx.
2. API/BD: compose.yaml, .env.example, scripts/*.ps1, backend/Api/Program.cs,
   appsettings.json, Properties/launchSettings.json.
   Prueba: Setup y GET /health/live, GET /health/ready.
3. Dominio/persistencia: backend/Domain/Lesson.cs, Activity.cs,
   backend/Infrastructure/AppDbContext.cs, LessonReader.cs y Migrations/*.
   Prueba: tests/Domain.Tests y tests/Integration.Tests/PersistenceTests.cs.
4. Autenticación: backend/Application/Contracts.cs,
   backend/Infrastructure/AuthService.cs y backend/Api/Program.cs.
   Prueba: tests/Integration.Tests/AuthTests.cs.
5. Frontend: frontend/src/{main.tsx,App.tsx,auth.ts,validation.ts,styles.css}.
   Prueba: npm --prefix frontend run dev; flujo de cuenta en navegador.
6. Calidad: tests/*, frontend/src/*.test.*, frontend/e2e/session.spec.ts,
   frontend/playwright.config.ts, .github/workflows/ci.yml y este documento.

## Arquitectura
- Domain: entidades y reglas; no depende de EF, Identity ni ASP.NET.
- Application: contratos de autenticación y una consulta explícita de clases del propietario.
- Infrastructure: EF/Npgsql, Identity, sesiones y JWT.
- API: composición de dependencias, endpoints, seguridad HTTP y respuestas ProblemDetails.
- Sin MediatR, CQRS, repositorios genéricos ni entidades de estudiantes/cursos.
- Identity AppUser queda en Infrastructure; Lesson solo necesita un UserId.
- ILessonReader filtra por propietario y se verifica con dos usuarios reales.
  No está expuesto por HTTP en esta fase. Futuros endpoints deben obtener el usuario del claim sub.

## Dominio y JSONB
Niveles A2/B1/B2; duración opcional en minutos positivos; fechas UTC.
Una clase admite cero actividades mientras sea borrador.
Lesson.AddActivity asigna índices consecutivos desde cero; (LessonId, Order) es único.
No se implementa reordenamiento hasta fase 2.

Content se persiste como JSONB desde contratos validados:
- Speaking: questionsList.
- Reading: text y questionsList.
- Writing: prompt.
- VocabularyGrammar: explanation y exercises.
También se serializa type numérico; la columna Type es el discriminador autoritativo.
Los campos no se editan directamente: se validan antes de serializar.
PostgreSQL comprueba objeto JSON, nivel, tipo, duración y orden, no todo el esquema pedagógico.
No existe una tabla por subtipo ni un repositorio genérico.
Eliminar una Lesson elimina sus Activities.

## Autenticación y decisiones de seguridad
- POST /api/auth/register: 201; errores 400.
- POST /api/auth/login: JWT y usuario; credencial inválida o bloqueo 401.
- POST /api/auth/refresh: rota cookie y devuelve nuevo JWT; inválida/expirada/reutilizada 401.
- POST /api/auth/logout: revoca refresh actual y elimina cookie; 204 idempotente.
- GET /api/auth/me: requiere Authorization: Bearer y devuelve el usuario del claim sub.
- Todo POST de auth exige Origin igual a FrontendOrigin y X-Requested-With: Profefacilisimo.
  Para clientes de línea de comandos también hay que enviar ambos encabezados.
- JWT HS256 de 10 minutos; firma, algoritmo, emisor, audiencia y expiración validados.
- Refresh opaco de 48 bytes aleatorios, duración 7 días y solo SHA256 persistido.
  UPDATE condicional y transacción permiten un único ganador ante renovaciones simultáneas.
- Cookies HttpOnly, SameSite=Strict, ruta /api/auth. Secure obligatorio fuera de Development.
- Producción asume frontend y /api bajo el mismo origen mediante reverse proxy HTTPS.
  Configurar FrontendOrigin, AllowedHosts, ConnectionStrings__Default y Jwt__SigningKey.
  El proxy debe terminar TLS y no exponer directamente el puerto HTTP de la API.
- Access token solo en memoria: no localStorage/sessionStorage. Refresh deduplicado en una pestaña.
- Identity: contraseña 12-128 caracteres con mayúscula, minúscula y dígito;
  bloqueo de 15 minutos tras 5 fallos. Límite HTTP: 30 solicitudes auth/minuto por IP.
- Logout NO invalida un JWT ya emitido; expira en un máximo de 10 minutos (+5 segundos de tolerancia).
- Falta de servidor al hacer logout se muestra como error: no se afirma una revocación inexistente.
- Clave de firma aleatoria de al menos 32 bytes; no hay clave por defecto.
- Errores de autenticación no exponen excepciones ni credenciales.
- Confirmación de correo, recuperación de contraseña, MFA, revocación global, coordinación
  multipestaña y limpieza programada de sesiones expiradas quedan pendientes antes de ampliar
  la autenticación o lanzar públicamente.
- Rate limiting en memoria es para una instancia; un despliegue escalado necesita política
  en gateway/distribuida y configuración explícita de proxies confiables.
- OpenAPI JSON solo en Development: /openapi/v1.json.
- /health/ready exige conexión y cero migraciones pendientes.

## Pruebas
```powershell
./scripts/Test.ps1
# Primera vez para E2E:
cd frontend
npx playwright install chromium
cd ..
./scripts/Test-E2E.ps1
```

Test.ps1 ejecuta backend, lint, build y Vitest. Integración requiere PostgreSQL real:
crea bases pf_test_<guid>, aplica migración desde cero y las elimina al terminar.
Nunca sustituye PostgreSQL por EF InMemory ni omite silenciosamente pruebas.
El usuario local debe poder crear bases (el usuario Compose lo permite).
Test-E2E.ps1 crea pf_e2e_<guid>, inicia API en 5081, ejecuta Playwright y limpia su base/proceso.
No usa las cuentas ni clases de la base de desarrollo.
Para E2E cierra antes Vite si lo abriste manualmente: se necesita su proxy a la API de pruebas.
Los informes y trazas de fallo no se versionan.

Para usar dotnet manualmente con SDK local:
```powershell
. ./scripts/Common.ps1
dotnet test tests/Domain.Tests
```

## Operación local
- docker compose ps: estado y healthcheck.
- docker compose stop / docker compose start: apagar/encender conservando datos.
- No borrar el volumen salvo que quieras perder deliberadamente la base local.
- CI reproduce setup, pruebas y E2E en un runner con PostgreSQL Docker.
- No hay despliegue público configurado.


## Validación realizada (9 de septiembre de 2026)
- dotnet build: correcto, cero errores y advertencias.
- scripts/Test.ps1: 10 tests de dominio, 15 tests PostgreSQL/HTTP y 13 tests frontend aprobados; ninguno omitido.
- scripts/Test-E2E.ps1: 1 flujo completo aprobado en Chromium (aprox. 7 segundos de Playwright, más arranque/migración).
- Lint y build frontend correctos. Rollup avisa sobre comentarios PURE de Zod, sin impedir el build.
- Auditorías npm y NuGet (incluyendo transitivas): sin vulnerabilidades reportadas al ejecutar.
- Revisadas capturas de login escritorio y pantalla privada móvil, sin recortes/desbordamientos observados.
- Comprobado que solo quedan las bases postgres, profefacilisimo, template0 y template1; bases temporales eliminadas.
- CI está definido, pero aún no se ejecutó en GitHub; no hay remoto, commit ni despliegue.
- Frontend usa CSS propio y fuentes del sistema, sin dependencias visuales o fuentes externas.
- En esta máquina se autorizó safe.directory únicamente para este repositorio por la diferencia de propietario del sandbox.
