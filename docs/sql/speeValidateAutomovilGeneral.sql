CREATE PROCEDURE [dbo].[speeValidateAutomovilGeneral]
		@cplan VARCHAR(10),
		@xplaca  VARCHAR(15),
    @xsercar  VARCHAR(60),
 		@xsermot  VARCHAR(60) = null

AS
BEGIN
    SET NOCOUNT ON;
		
		DECLARE 
		@cramo int
		
		IF (@cplan = '' OR @cplan IS NULL) BEGIN 
				BEGIN
						;THROW 99001, 'Plan no debe estar vacío.', 1;
				END
		END
		
		SELECT @cramo = cramo from maplanes WHERE cplan = @cplan and iestado = 'V'

    -- SI EL PLAN ENVIADO NO SE ENCUENTRA EN BASE DE DATOS
    IF @cramo IS NULL BEGIN
				BEGIN
						;THROW 99001, 'Plan enviado no se encuentra registrado.', 1;
				END
		END
			
		IF (@cramo = 18) BEGIN
		
			-- VALIDACIÓN DATA VACÍA
			IF (@xplaca = '' OR @xplaca IS NULL) BEGIN 
					BEGIN
							;THROW 99001, 'Placa no debe estar vacío', 1;
					END
			END
			
			IF (@xsercar = '' OR @xsercar IS NULL) BEGIN 
					BEGIN
							;THROW 99001, 'Serial de Carrocería no debe estar vacío', 1;
					END
			END

			-- VALIDACIÓN PLACA EXISTENTE
			IF EXISTS ( SELECT 1 FROM vhcerti WHERE xplaca = @xplaca AND istatcer = 'V' and fhasta >= GETDATE()) BEGIN
					BEGIN
							;THROW 99001, 'Se ha detectado la existencia de una póliza vigente la misma placa del vehículo.', 1;
					END
			END
			
			-- VALIDACIÓN SERIAL CARROCERÍA EXISTENTE
			IF EXISTS ( SELECT 1 FROM vhcerti WHERE xsercar = @xsercar AND istatcer = 'V' and fhasta >= GETDATE()) BEGIN
					BEGIN
							;THROW 99001, 'Se ha detectado la existencia de una póliza vigente con el mismo Serial Carrocería del Vehículo.', 1;
					END
			END

			-- VALIDACIÓN SERIAL MOTOR EXISTENTE
-- 			IF (@xsermot <> '' AND @xsermot IS NOT NULL ) BEGIN
-- 					IF EXISTS ( SELECT 1 FROM vhcerti WHERE xsermot = @xsermot AND istatcer = 'V') BEGIN
-- 						BEGIN
-- 								;THROW 99001, 'Se ha detectado la existencia de una póliza vigente con el mismo Serial Motor del Vehículo.', 1;
-- 						END
-- 					END
-- 			END
				
		END	ELSE BEGIN 
		
				BEGIN
						;THROW 99001, 'Ramo no corresponde a Automóvil.', 1;
				END
				
		END	
		
END
