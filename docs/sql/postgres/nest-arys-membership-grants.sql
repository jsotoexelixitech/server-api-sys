-- Permisos del usuario de la app sobre las tablas del respaldo de membresías Arys.
--
-- Síntoma si faltan:  prisma:error ... code "42501" permission denied for table arys_membership_config
-- (se repite cada minuto en el log de sysip-nest-api; el reintento queda apagado y el respaldo no guarda).
--
-- Cuándo: las tablas las crea quien ejecuta nest-arys-membership.sql (normalmente un admin); el usuario con el
-- que corre la app (el de NEST_PG_DATABASE_URL) no recibe permisos automáticamente.
--
-- Ejecutar con un usuario administrador en nest_api, indicando el usuario de la app:
--   psql -h 192.168.8.120 -U <admin> -d nest_api -v app_role=<usuario_de_NEST_PG_DATABASE_URL> \
--        -f docs/sql/postgres/nest-arys-membership-grants.sql

GRANT USAGE ON SCHEMA nest_auth TO :"app_role";

GRANT SELECT, INSERT, UPDATE, DELETE ON
  nest_auth.arys_membership_job,
  nest_auth.arys_membership_attempt,
  nest_auth.arys_membership_config
TO :"app_role";

-- Verificación: las tres filas deben decir "t".
SELECT t AS tabla,
       has_table_privilege(:'app_role', 'nest_auth.' || t, 'SELECT')  AS puede_leer,
       has_table_privilege(:'app_role', 'nest_auth.' || t, 'INSERT')  AS puede_insertar,
       has_table_privilege(:'app_role', 'nest_auth.' || t, 'UPDATE')  AS puede_actualizar
FROM (VALUES ('arys_membership_job'), ('arys_membership_attempt'), ('arys_membership_config')) AS v(t);
