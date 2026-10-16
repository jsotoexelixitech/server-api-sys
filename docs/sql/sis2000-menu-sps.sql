/*
  Menú lateral de Sis2000: desplegables, opciones y permisos por rol (plantilla).
  Lo usa nest-api (módulo menu-sis2000) para administrar el menú desde la interfaz.

  Tablas:
    semenuprincipal    desplegables (cmenu_principal identidad)
    semenu             opciones de cada desplegable (cmenu identidad)
    semenuparam        plantilla de permisos por departamento + rol (cusuario NULL)
                       o propia de un usuario (cusuario = X)
    sedistribucionmenu menú efectivo de cada usuario (lo lee seVmenu / get-menu)

  Regla de sincronización (igual que "Asignación de menú" del backend de La Mundial):
    - Usuario con plantilla propia (semenuparam.cusuario = X, istatus 'V') -> recibe solo esa.
    - Si no -> recibe la plantilla de su departamento + rol (cusuario NULL).
    - Si no hay ninguna de las dos -> su menú no se toca.

  Usuarios existentes: NO se tocan salvo pedido explícito.
    - Guardar la plantilla de un rol solo la guarda (la toman los usuarios nuevos);
      aplicarla a los existentes del rol requiere @aplicar_existentes = 1.
    - Al crear un corredor solo recibe menú el usuario nuevo (sin filas en sedistribucionmenu).
    - spMenuSincronizarUsuario rehace el menú solo del usuario indicado.

  Ejecutar primero en sis2000_qa. Requiere SQL Server 2016+ (OPENJSON).
*/

------------------------------------------------------------------------------
-- 1. Sincroniza sedistribucionmenu de los usuarios indicados en #menu_usuarios
--    (tabla temporal creada por quien llama: cusuario INT PRIMARY KEY)
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[spMenuSincronizarUsuarios]
    @cusuario1 NUMERIC(9, 0) = NULL,
    @usuarios INT = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    -- Solo usuarios que tienen alguna plantilla aplicable
    DELETE u
    FROM #menu_usuarios u
    INNER JOIN seusuariosweb s ON s.cusuario = u.cusuario
    WHERE NOT EXISTS (SELECT 1 FROM semenuparam p WHERE p.cusuario = s.cusuario AND p.istatus = 'V')
      AND NOT EXISTS (SELECT 1 FROM semenuparam p WHERE p.cusuario IS NULL AND p.istatus = 'V'
                        AND p.cdepartamento = s.cdepartamento AND p.crol = s.crol);

    DELETE d
    FROM sedistribucionmenu d
    INNER JOIN #menu_usuarios u ON u.cusuario = d.cusuario;

    INSERT INTO sedistribucionmenu (
        u_version, cusuario, cdepartamento, crol, cmenuprincipal, cmenu, csubmenu,
        istatus, fingreso, cusuario1
    )
    SELECT DISTINCT
        '!', s.cusuario, p.cdepartamento, p.crol, p.cmenuprincipal, p.cmenu, NULL,
        'V', GETDATE(), @cusuario1
    FROM #menu_usuarios u
    INNER JOIN seusuariosweb s ON s.cusuario = u.cusuario
    INNER JOIN semenuparam p ON p.istatus = 'V'
       AND (
            p.cusuario = s.cusuario
            OR (p.cusuario IS NULL
                AND p.cdepartamento = s.cdepartamento AND p.crol = s.crol
                AND NOT EXISTS (SELECT 1 FROM semenuparam pp WHERE pp.cusuario = s.cusuario AND pp.istatus = 'V'))
       );

    -- Sin SELECT: también lo usa spCreateMenuCorredorWeb dentro de los SPs de alta (pasarela / nest-api)
    SELECT @usuarios = COUNT(*) FROM #menu_usuarios;
END
GO

------------------------------------------------------------------------------
-- 2. Rehace el menú de un usuario desde su plantilla
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[spMenuSincronizarUsuario]
    @cusuario INT,
    @cusuario1 NUMERIC(9, 0) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM seusuariosweb WHERE cusuario = @cusuario)
        THROW 99001, 'USUARIO NO EXISTE', 1;

    CREATE TABLE #menu_usuarios (cusuario INT PRIMARY KEY);
    INSERT INTO #menu_usuarios (cusuario) VALUES (@cusuario);

    DECLARE @usuarios INT;
    BEGIN TRAN;
    EXEC dbo.spMenuSincronizarUsuarios @cusuario1 = @cusuario1, @usuarios = @usuarios OUTPUT;
    COMMIT;

    SELECT @usuarios AS usuarios;
END
GO

------------------------------------------------------------------------------
-- 3. Crea (@cmenu_principal NULL) o edita un desplegable
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[spMenuGuardarPrincipal]
    @cmenu_principal INT = NULL,
    @xmenu VARCHAR(50),
    @xicono VARCHAR(50) = NULL,
    @xruta VARCHAR(250) = NULL,
    @istatus CHAR(1) = 'V',
    @cusuario NUMERIC(9, 0) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SET @xmenu = NULLIF(LTRIM(RTRIM(@xmenu)), '');
    IF @xmenu IS NULL
        THROW 99001, 'EL NOMBRE DEL MENU NO PUEDE ESTAR VACIO', 1;
    IF @istatus NOT IN ('V', 'I')
        THROW 99001, 'ESTATUS INVALIDO (V o I)', 1;
    IF EXISTS (SELECT 1 FROM semenuprincipal
               WHERE istatus = 'V' AND LTRIM(RTRIM(xmenu)) = @xmenu
                 AND (@cmenu_principal IS NULL OR cmenu_principal <> @cmenu_principal))
        THROW 99001, 'YA EXISTE UN MENU ACTIVO CON ESE NOMBRE', 1;

    IF @cmenu_principal IS NULL
    BEGIN
        INSERT INTO semenuprincipal (u_version, xmenu, xicono, xruta, istatus, fingreso, cusuario)
        VALUES ('!', @xmenu, NULLIF(LTRIM(RTRIM(@xicono)), ''), NULLIF(LTRIM(RTRIM(@xruta)), ''), @istatus, GETDATE(), @cusuario);
        SET @cmenu_principal = CAST(SCOPE_IDENTITY() AS INT);
    END
    ELSE
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM semenuprincipal WHERE cmenu_principal = @cmenu_principal)
            THROW 99001, 'EL MENU NO EXISTE', 1;
        UPDATE semenuprincipal
           SET xmenu = @xmenu,
               xicono = NULLIF(LTRIM(RTRIM(@xicono)), ''),
               xruta = NULLIF(LTRIM(RTRIM(@xruta)), ''),
               istatus = @istatus,
               fultmod = GETDATE(),
               cusuariomod = @cusuario
         WHERE cmenu_principal = @cmenu_principal;
    END

    SELECT @cmenu_principal AS cmenu_principal;
END
GO

------------------------------------------------------------------------------
-- 4. Crea (@cmenu NULL) o edita una opción de un desplegable.
--    Si se mueve a otro desplegable, se actualizan plantilla y menús ya asignados.
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[spMenuGuardarOpcion]
    @cmenu INT = NULL,
    @cmenu_principal INT,
    @xmenu VARCHAR(100),
    @xruta VARCHAR(250),
    @istatus CHAR(1) = 'V',
    @cusuario NUMERIC(9, 0) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @xmenu = NULLIF(LTRIM(RTRIM(@xmenu)), '');
    SET @xruta = NULLIF(LTRIM(RTRIM(@xruta)), '');
    IF @xmenu IS NULL
        THROW 99001, 'EL NOMBRE DE LA OPCION NO PUEDE ESTAR VACIO', 1;
    IF @xruta IS NULL
        THROW 99001, 'LA RUTA DE LA OPCION NO PUEDE ESTAR VACIA', 1;
    IF @istatus NOT IN ('V', 'I')
        THROW 99001, 'ESTATUS INVALIDO (V o I)', 1;
    IF NOT EXISTS (SELECT 1 FROM semenuprincipal WHERE cmenu_principal = @cmenu_principal AND istatus = 'V')
        THROW 99001, 'EL MENU PRINCIPAL NO EXISTE O ESTA INACTIVO', 1;
    IF EXISTS (SELECT 1 FROM semenu
               WHERE istatus = 'V' AND cmenu_principal = @cmenu_principal AND LTRIM(RTRIM(xmenu)) = @xmenu
                 AND (@cmenu IS NULL OR cmenu <> @cmenu))
        THROW 99001, 'YA EXISTE UNA OPCION ACTIVA CON ESE NOMBRE EN EL MENU', 1;

    BEGIN TRAN;

    IF @cmenu IS NULL
    BEGIN
        INSERT INTO semenu (cmenu_principal, u_version, xmenu, xruta, istatus, fingreso, cusuario)
        VALUES (@cmenu_principal, '!', @xmenu, @xruta, @istatus, GETDATE(), @cusuario);
        SET @cmenu = CAST(SCOPE_IDENTITY() AS INT);
    END
    ELSE
    BEGIN
        DECLARE @principal_anterior INT = (SELECT cmenu_principal FROM semenu WHERE cmenu = @cmenu);
        IF @principal_anterior IS NULL AND NOT EXISTS (SELECT 1 FROM semenu WHERE cmenu = @cmenu)
            THROW 99001, 'LA OPCION NO EXISTE', 1;

        UPDATE semenu
           SET cmenu_principal = @cmenu_principal,
               xmenu = @xmenu,
               xruta = @xruta,
               istatus = @istatus,
               fultmod = GETDATE(),
               cusuariomod = @cusuario
         WHERE cmenu = @cmenu;

        IF ISNULL(@principal_anterior, -1) <> @cmenu_principal
        BEGIN
            UPDATE semenuparam SET cmenuprincipal = @cmenu_principal WHERE cmenu = @cmenu;
            UPDATE sedistribucionmenu SET cmenuprincipal = @cmenu_principal WHERE cmenu = @cmenu;
        END
    END

    COMMIT;
    SELECT @cmenu AS cmenu;
END
GO

------------------------------------------------------------------------------
-- 5. Guarda la plantilla de permisos de un departamento + rol (o de un usuario).
--    Plantilla de un usuario: se aplica a ese usuario.
--    Plantilla de un rol: la toman los usuarios nuevos; a los existentes solo con @aplicar_existentes = 1.
--    @menus: JSON [{"cmenuprincipal": 2, "cmenu": 89}, ...]  (cmenu null = solo el desplegable)
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[spMenuGuardarPlantilla]
    @cdepartamento INT,
    @crol INT,
    @cusuario INT = NULL,
    @menus NVARCHAR(MAX),
    @cusuario1 NUMERIC(9, 0) = NULL,
    @aplicar_existentes BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM serol WHERE cdepartamento = @cdepartamento AND crol = @crol)
        THROW 99001, 'EL ROL NO EXISTE PARA ESE DEPARTAMENTO', 1;
    IF @cusuario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM seusuariosweb WHERE cusuario = @cusuario)
        THROW 99001, 'USUARIO NO EXISTE', 1;
    IF ISJSON(@menus) = 0
        THROW 99001, 'LISTA DE MENUS INVALIDA', 1;

    -- Opciones pedidas, solo las que existen y están activas
    DECLARE @items TABLE (cmenuprincipal INT NOT NULL, cmenu INT NULL);
    INSERT INTO @items (cmenuprincipal, cmenu)
    SELECT DISTINCT j.cmenuprincipal, j.cmenu
    FROM OPENJSON(@menus) WITH (cmenuprincipal INT '$.cmenuprincipal', cmenu INT '$.cmenu') j
    INNER JOIN semenuprincipal mp ON mp.cmenu_principal = j.cmenuprincipal AND mp.istatus = 'V'
    LEFT JOIN semenu m ON m.cmenu = j.cmenu AND m.cmenu_principal = j.cmenuprincipal AND m.istatus = 'V'
    WHERE j.cmenu IS NULL OR m.cmenu IS NOT NULL;

    -- Cada desplegable con opciones lleva también su fila de cabecera (cmenu NULL), como las plantillas actuales
    INSERT INTO @items (cmenuprincipal, cmenu)
    SELECT DISTINCT i.cmenuprincipal, NULL
    FROM @items i
    WHERE i.cmenu IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM @items h WHERE h.cmenuprincipal = i.cmenuprincipal AND h.cmenu IS NULL);

    CREATE TABLE #menu_usuarios (cusuario INT PRIMARY KEY);

    BEGIN TRAN;

    DELETE FROM semenuparam
    WHERE cdepartamento = @cdepartamento AND crol = @crol
      AND ((@cusuario IS NULL AND cusuario IS NULL) OR cusuario = @cusuario);

    INSERT INTO semenuparam (
        u_version, cusuario, cdepartamento, crol, cmenuprincipal, cmenu, csubmenu,
        istatus, fingreso, cusuario1
    )
    SELECT '!', @cusuario, @cdepartamento, @crol, i.cmenuprincipal, i.cmenu, NULL,
           'V', GETDATE(), @cusuario1
    FROM @items i;

    -- Usuarios afectados: el indicado, o (solo si se pide) los activos del departamento + rol
    IF @cusuario IS NOT NULL
        INSERT INTO #menu_usuarios (cusuario) VALUES (@cusuario);
    ELSE IF @aplicar_existentes = 1
        INSERT INTO #menu_usuarios (cusuario)
        SELECT DISTINCT cusuario FROM seusuariosweb
        WHERE cdepartamento = @cdepartamento AND crol = @crol AND istatus = 'V';

    DECLARE @usuarios INT;
    EXEC dbo.spMenuSincronizarUsuarios @cusuario1 = @cusuario1, @usuarios = @usuarios OUTPUT;

    COMMIT;

    SELECT (SELECT COUNT(*) FROM @items) AS opciones, @usuarios AS usuarios;
END
GO

------------------------------------------------------------------------------
-- 6. Menú del corredor al crearlo (plantilla de su rol en lugar de opciones fijas)
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[spCreateMenuCorredorWeb]
    @ccorredor VARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;

    -- Solo el usuario recién creado (aún sin menú); los existentes del corredor no se tocan
    CREATE TABLE #menu_usuarios (cusuario INT PRIMARY KEY);
    INSERT INTO #menu_usuarios (cusuario)
    SELECT DISTINCT s.cusuario FROM seusuariosweb s
    WHERE s.ccorredor = @ccorredor
      AND NOT EXISTS (SELECT 1 FROM sedistribucionmenu d WHERE d.cusuario = s.cusuario);

    IF NOT EXISTS (SELECT 1 FROM #menu_usuarios)
        RETURN;

    EXEC dbo.spMenuSincronizarUsuarios @cusuario1 = 1;
END
GO

/* Pruebas rápidas (QA)
EXEC spMenuSincronizarUsuario @cusuario = 4772;
SELECT cmenuprincipal, cmenu FROM sedistribucionmenu WHERE cusuario = 4772 ORDER BY 1, 2;
*/
