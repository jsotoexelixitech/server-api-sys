CREATE PROCEDURE [dbo].[spCalculoPer]
@cramo INT, @cplan CHAR(10), @ptasamon FLOAT, @cparen INT, @nedad_asegurado INT, @xrif_asegurado varchar(10),
@ifrecuencia CHAR(1), @msumaaseg numeric (18,2)

AS
BEGIN

 	DECLARE

    @mprimatotal FLOAT, @mprimatotalext FLOAT, @mprima_cob FLOAT, @mprimaext_cob FLOAT, @mprima FLOAT, @mprimaext FLOAT,
    @ccobertura INT, @ctablatar CHAR(10), @msumaasegext FLOAT, @minedad CHAR(3), @maxedad CHAR(3), @error VARCHAR(MAX),
		@cmoneda char(4), @cuotas INT

IF EXISTS(SELECT * FROM maplcober_per WHERE cramo=@cramo AND cplan=@cplan) BEGIN
		IF (@ifrecuencia IS NULL) SELECT @ifrecuencia = 'A'
		IF (@ifrecuencia = 'M') SELECT @cuotas = 12
		IF (@ifrecuencia = 'T') SELECT @cuotas = 4
		IF (@ifrecuencia = 'C') SELECT @cuotas = 3
		IF (@ifrecuencia = 'S') SELECT @cuotas = 2
		IF (@ifrecuencia = 'A') SELECT @cuotas = 1
		IF (@ifrecuencia = 'E') SELECT @cuotas = 1

		SELECT @mprima = 0, @mprimaext = 0

		SELECT @cmoneda = cmoneda FROM maplanes_per WHERE cplan = @cplan
		IF (@ptasamon IS NULL) BEGIN
				SELECT @ptasamon = ptasamon FROM mamonedas WHERE cmoneda = @cmoneda
		END

		SELECT @minedad = cemin_ase, @maxedad = cemax_ase FROM mapledades_per WHERE cramo = @cramo and cplan = @cplan and cparen = @cparen

		IF (@minedad IS NULL OR @maxedad IS NULL) BEGIN
			BEGIN
					SET @error = 'El asegurado/titular no cumple con los criterios de parentesco para este plan.'
            ;THROW 99001, @error, 1;
        END
		END

		IF (@nedad_asegurado > @maxedad OR @nedad_asegurado < @minedad) BEGIN
			BEGIN
					SET @error = 'El asegurado/titular no cumple con los criterios de edad para este plan. (Min: ' + @minedad + ', Max: ' + @maxedad + ').'
					;THROW 99001, @error, 1;
			END
		END


		CREATE TABLE #temp_calculo_per (xrif_asegurado varchar(10), cparen int, ccobertura int, xcobertura VARCHAR(100), msumaasegext FLOAT, mprima FLOAT, mprimaext FLOAT)
		CREATE TABLE #temp_calculo_per_totales (xrif_asegurado varchar(10), cparen INT, msumaaseg FLOAT, mprima FLOAT, mprimaext FLOAT)

		DECLARE cursito3 CURSOR FOR
		select distinct(ccobertura) from maplcober_per where cplan=@cplan AND cramo=@cramo

		OPEN cursito3

		FETCH NEXT FROM cursito3
		INTO @ccobertura

				WHILE @@FETCH_STATUS = 0
				BEGIN

				DECLARE cursito4 CURSOR FOR
				select ctablatar, @nedad_asegurado from mapltarifas_per
-- 				INNER JOIN peasegurados ON peasegurados.cpoliza = @cpoliza AND peasegurados.cparentesco = mapltarifas_per.cparen
				WHERE mapltarifas_per.cplan=@cplan AND mapltarifas_per.cramo=@cramo AND mapltarifas_per.ccobertura=@ccobertura
				and mapltarifas_per.cparen = @cparen

				SELECT @mprimaext_cob = 0
				OPEN cursito4
				-- while 1 = 1
				-- BEGIN

				FETCH NEXT FROM cursito4
				INTO @ctablatar, @nedad_asegurado

						WHILE @@FETCH_STATUS = 0
						BEGIN
						IF @msumaaseg IS NULL BEGIN
							SELECT @msumaasegext = msuma FROM mapltabedad_d
							WHERE ctablaedad = @ctablatar and @nedad_asegurado >= nedad_min and @nedad_asegurado <= nedad_max;

							SELECT @mprimaext_cob = (mprima + @mprimaext_cob) / @cuotas FROM mapltabedad_d
							WHERE ctablaedad = @ctablatar and @nedad_asegurado >= nedad_min and @nedad_asegurado <= nedad_max;
						END ELSE BEGIN
                            IF @cmoneda != 'Bs' BEGIN
                                SELECT @msumaasegext = @msumaaseg
                                SELECT @msumaaseg = @msumaaseg * @ptasamon
                            END ELSE BEGIN
                                SELECT @msumaasegext = @msumaaseg / @ptasamon
                            END

                            SELECT @mprimaext_cob = @msumaasegext * pprima / 100 FROM mapltabedad_d
                            WHERE ctablaedad = @ctablatar and @nedad_asegurado >= nedad_min and @nedad_asegurado <= nedad_max;
                        END

				FETCH NEXT FROM cursito4
				INTO @ctablatar, @nedad_asegurado

				END
				CLOSE cursito4
				DEALLOCATE cursito4

				INSERT INTO #temp_calculo_per SELECT @xrif_asegurado, @cparen, @ccobertura, TRIM(xdescripcion_l), @msumaasegext, @mprimaext_cob * @ptasamon, @mprimaext_cob
				FROM macoberturas WHERE ccobertura=@ccobertura AND cramo = @cramo

				SELECT @mprimaext = @mprimaext_cob  + @mprimaext

		FETCH NEXT FROM cursito3
		INTO @ccobertura

		END
		CLOSE cursito3
		DEALLOCATE cursito3

		INSERT INTO #temp_calculo_per_totales
		SELECT @xrif_asegurado, cparen, MAX(msumaasegext), @mprimaext * @ptasamon, @mprimaext
		FROM #temp_calculo_per GROUP BY cparen

		SELECT * FROM #temp_calculo_per
		SELECT a.cparen, TRIM(b.xparentesco) [xparentesco], xrif_asegurado, mprima, mprimaext FROM #temp_calculo_per_totales a
		INNER JOIN maparent b ON a.cparen = b.cparentesco

		DROP table #temp_calculo_per
		DROP table #temp_calculo_per_totales

END

END

