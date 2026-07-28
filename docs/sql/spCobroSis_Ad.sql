--  ˚☽˚. ‧₊˚✩₊˚.⋆☾⋆⁺₊✧⋆⁺₊⋆ ☀︎ ⋆⁺₊⋆
-- Author:	Franjhely Araujo <3
-- Create date: 02/09/2024
-- Description:	Cobros de recibos(SisIp Administración)
--  ˚☽˚. ‧₊˚✩₊˚.⋆☾⋆⁺₊✧⋆⁺₊⋆ ☀︎ ⋆⁺₊⋆
CREATE PROCEDURE [dbo].[spCobroSis_Ad]
    @freporte DATE,
    @cusuario NUMERIC(11) = NULL,
    @ctenedor NUMERIC(11), 
    @numRecibos NUMERIC(7),
    @mpago DECIMAL(18, 2),
    @mpagoext DECIMAL(18, 2),
    @cprog NVARCHAR(10), 
    @recibos NVARCHAR(MAX),
    @status BIT OUTPUT, 	
    @mensaje NVARCHAR(MAX) OUTPUT,
    @ptasamon DECIMAL(18, 6) OUTPUT,
    @transaccion NUMERIC(7) OUTPUT ,
		@cnpoliza NVARCHAR(30) OUTPUT,
		@fanopol int OUTPUT,
		@fmespol int OUTPUT
AS
BEGIN
    DECLARE 
        @cproductor NUMERIC(11),    @ifuente NVARCHAR(50),   @cramo smallint,   @crecibo NUMERIC(21),  @ptasamonref DECIMAL(18, 6), 
        @mprimabruta DECIMAL(18, 4), @mprimabrutaext DECIMAL(18, 4),  @motrosrec DECIMAL(18, 4), @motrosrecext DECIMAL(18, 4), 
        @motrosdes DECIMAL(18, 4), @motrosdesext DECIMAL(18, 4),   @mgastos DECIMAL(18, 4),  @mgastosext DECIMAL(18, 4), @motrosgas DECIMAL(18, 4), 
        @motrosgasext DECIMAL(18, 4), @mgemi DECIMAL(18, 4), @mgemiext DECIMAL(18, 4), @mmontoneto DECIMAL(18, 4), @mmontonetoext DECIMAL(18, 4),  @recibo NVARCHAR(max),
        @mimpuesto DECIMAL(18, 4), @mimpuestoext DECIMAL(18, 4), @mmontoapag DECIMAL(18, 4),  @mmontoapagext DECIMAL(18, 4), @cnpoliza_rel char(30)

    -- Inicializar variables
    SET @ifuente = 'WEBSIS'
    
    SELECT 
        @ptasamon = ptasamon 
    FROM mamonedas 
    where cmoneda = '$'

    --Primer INSERT en cbreporte_tran
    INSERT INTO cbreporte_tran (
        freporte, casegurado, mpago, mpagoext, 
        ptasamon, cprog, ifuente, cusuario, 
        iestado_tran, fingreso, iestado
    ) 
    VALUES (
        @freporte, @ctenedor, @mpago, @mpagoext, 
        @ptasamon, @cprog, @ifuente, @cusuario, 
        'TN', GETDATE(), '1'
    );

    -- Obtener el último ID insertado
    SET @transaccion = SCOPE_IDENTITY();
		
    IF @numRecibos = 0 BEGIN
        SET @status = 0
        SET @mensaje = 'No se han encontrado recibos a cobrar.'
        ;THROW 99001, @mensaje, 1;

    END ELSE BEGIN
    
        WHILE @numRecibos > 0
        BEGIN
                -- Extraer el primer recibo
                SET @recibo = LEFT(@recibos, CHARINDEX(',', @recibos + ',') - 1);
                        
                        -- Eliminar el recibo procesado de la lista
                SET @recibos = STUFF(@recibos, 1, CHARINDEX(',', @recibos + ',') , '');

                SET @recibo = REPLACE(@recibo, '''', '');

                SELECT @ptasamonref = 
                        CASE 
                                WHEN a.cmoneda = 'eur' THEN (SELECT top 1 ptasamon from  mavamoneda where trim(cmoneda) = 'eur' and convert(date,fmoneda) = isnull(@freporte,getdate())) 
                                ELSE (SELECT top 1 ptasamon from  mavamoneda where trim(cmoneda) = '$' and convert(date,fmoneda) = isnull(@freporte,getdate())) 
                        END
                FROM adrecibos a 
                LEFT JOIN mamonedas b ON a.cmoneda = b.cmoneda 
                WHERE a.cnrecibo = @recibo;

                ---Actualizar transaccion antigua si la tiene
                IF EXISTS(SELECT * FROM cbreporte_pago_d WHERE  cnrecibo =  @recibo)BEGIN 
                        update cbreporte_tran set iestado = 1
                        from  adrecibos a 
                        inner join cbreporte_pago_d b on a.crecibo = b.crecibo
                        left join cbreporte_tran c on b.ctransaccion = c.ctransaccion
                        where c.iestado = 0 and a.cnrecibo =  @recibo and a.cdoccob != @transaccion
                END


                SELECT 
                        @mmontoapag =   CASE  WHEN cmoneda = 'BS' THEN mmontorec  ELSE mmontorecext *  isnull(@ptasamonref,@ptasamon)  END,
                        @mprimabruta =  CASE  WHEN cmoneda = 'BS' THEN mprimabruta  ELSE mprimabrutaext *  isnull(@ptasamonref,@ptasamon)   END,
                        @mgastos =      CASE  WHEN cmoneda = 'BS' and mgastos > 0  THEN mgastos  ELSE mgastosext  *  isnull(@ptasamonref,@ptasamon)   END,
                        @motrosgas =    CASE  WHEN cmoneda = 'BS' and motrosgas > 0  THEN motrosgas  ELSE motrosgasext  *  isnull(@ptasamonref,@ptasamon)   END,
                        @mgemi =        CASE  WHEN cmoneda = 'BS' and mgemi > 0  THEN mgemi  ELSE mgemiext *  isnull(@ptasamonref,@ptasamon)   END,
                        @mimpuesto =    CASE  WHEN cmoneda = 'BS' and mimpuesto > 0 THEN mimpuesto  ELSE mimpuestoext *  isnull(@ptasamonref,@ptasamon)  END,
                        @mmontoneto =   CASE  WHEN cmoneda = 'BS' THEN mmontoneto  ELSE mmontonetoext *  isnull(@ptasamonref,@ptasamon)   END,
                        @motrosrec =    CASE  WHEN cmoneda = 'BS' THEN motrosrec   ELSE motrosrecext *  isnull(@ptasamonref,@ptasamon)  END,
                        @mmontoapagext =    CASE  WHEN cmoneda = 'BS' THEN mmontorec /  isnull(@ptasamonref,@ptasamon)   ELSE mmontorecext  END,
                        @mprimabrutaext =   CASE  WHEN cmoneda = 'BS' THEN mprimabruta /  isnull(@ptasamonref,@ptasamon)   ELSE mprimabrutaext  END,
                        @mgastosext =       CASE  WHEN cmoneda = 'BS' and mgastos > 0 THEN mgastos /  isnull(@ptasamonref,@ptasamon)   ELSE mgastosext  END,
                        @motrosgasext =     CASE  WHEN cmoneda = 'BS' and motrosgas > 0 THEN motrosgas /  isnull(@ptasamonref,@ptasamon)   ELSE motrosgasext  END,
                        @mgemiext =         CASE  WHEN cmoneda = 'BS' and mgemi > 0 THEN mgemi /  isnull(@ptasamonref,@ptasamon)   ELSE mgemiext  END,
                        @mimpuestoext =     CASE  WHEN cmoneda = 'BS' and mimpuesto > 0 THEN mimpuesto /  isnull(@ptasamonref,@ptasamon)   ELSE mimpuestoext  END,
                        @mmontonetoext =    CASE  WHEN cmoneda = 'BS' THEN mmontoneto /  isnull(@ptasamonref,@ptasamon)   ELSE mmontonetoext  END,
                        @motrosrecext=      CASE  WHEN cmoneda = 'BS' THEN mmontoneto /  isnull(@ptasamonref,@ptasamon)   ELSE motrosrecext  END,
                        @cproductor = cproductor , @cramo = cramo , @crecibo = crecibo
                FROM adrecibos 
                WHERE cnrecibo =  @recibo

                UPDATE adrecibos
                SET 
                        mpagadoext = @mmontoapagext, 
                        mpagado = @mmontoapag, 
			mgastos = @mgastos, 
                        mgastosext = @mgastosext, 
			motrosgas = @motrosgas, 
                        motrosgasext = @motrosgasext, 
                        fcobro =  @freporte,
                        cdoccob = @transaccion,
                        ptasamon_pago = isnull(@ptasamonref,@ptasamon),
                        mprimabruta = @mprimabruta,
                        mprimabrutaext = @mprimabrutaext,
                        iestadorec = 'C'
                FROM adrecibos 
                WHERE cnrecibo =  @recibo


                UPDATE cbreporte_pago set 
                    ptasamon = @ptasamon ,
                    mtotal = CASE  WHEN cmoneda = 'BS' THEN mtotal ELSE mtotalext * @ptasamon END, 
                    mtotalext =  CASE  WHEN cmoneda = 'BS' THEN mtotal / @ptasamon ELSE mtotalext END,
                    mpago = CASE  WHEN cmoneda = 'BS' THEN mpago ELSE mpagoext * @ptasamon END, 
                    mpagoext =  CASE  WHEN cmoneda = 'BS' THEN mpagoext / @ptasamon ELSE mpagoext END
                WHERE ctransaccion = @transaccion;

                IF EXISTS(SELECT * FROM adpolrea WHERE crecibo =  @crecibo)
                BEGIN 
                        UPDATE adpolrea
                        SET 
                                ptasamon_pago = isnull(@ptasamonref,@ptasamon)
                        FROM adpolrea 
                        WHERE crecibo =  @crecibo
                END

                INSERT INTO cbreporte_pago_d (
                                ctransaccion,crecibo,u_version,casegurado,ccorredor,cnpoliza,cnrecibo,cpoliza,
                                fanopol,fmespol,cramo,csucur,cmoneda,ccajero,ccaja,fdesde_pol,fhasta_pol,fdesde_rec,fhasta_rec,iestacon,
                                mprimabruta,mprimabrutaext,ptasamon,potrosrec,motrosrec,motrosrecext,potrosdes,motrosdes,motrosdesext,
                                pgastos,mgastos,mgastosext,potrosgas,motrosgas,motrosgasext,mgemi,mgemiext,pgemi,mmontoneto,mmontonetoext,
                                pimpuesto,mimpuesto,mimpuestoext,mmontoapag,mmontoapagext,fcobro,ifuente,fingreso,cusuario
                        )
                        SELECT 
                                @transaccion, crecibo,u_version,casegurado,cproductor,cnpoliza,cnrecibo,cpoliza, 
                                fanopol,fmespol,cramo,csucur,cmoneda,1,1,fdesde_pol,fhasta_pol,fdesde,fhasta,'P',
                                @mprimabruta, @mprimabrutaext, isnull(@ptasamonref,@ptasamon),potrosrec,@motrosrec,@motrosrecext,potrosdes,@motrosdes,@motrosdesext,
                                pgastos,@mgastos,@mgastosext,potrosgas,@motrosgas,@motrosgasext,@mgemi,@mgemiext,pgemi,@mmontoneto,@mmontonetoext,
                                pimpuesto,@mimpuesto,@mimpuestoext,@mmontoapag,@mmontoapagext,@freporte ,@cprog, GETDATE(),@cusuario
                        FROM adrecibos 
                WHERE cnrecibo = @recibo

                -- ---Condicional para insertar en admovcom
                IF(@cproductor != 80080 and @mprimabruta > 0)
                BEGIN
                        IF @CRAMO = 18 AND (((select mcomisionext from adrecibos where  crecibo = @crecibo) / @mprimabrutaext ) * 100  > 20 or ((select mcomisionext from adrecibos where  crecibo = @crecibo) / @mprimabrutaext ) * 100  < 0)
                        BEGIN
                                INSERT INTO admovcom (
                                        cproductor, ccodigo, cnrecibo, imovcom, canexo, cmoneda, 
                                        ptasamon, fmovcom, mmovcom, mmovcomext, istatcon, 
                                        istatcom, fingreso, cusuario, cprog, ifuente, pmovim
                                )
                                SELECT 
                                        cproductor, crecibo, cnrecibo, 'CO', 1, cmoneda, 
                                        isnull(@ptasamonref,@ptasamon),@freporte , 
                                        0, 0, 'P', 'P', GETDATE(), 1, @cprog, @ifuente, pcomision 
                                FROM adrecibos 
                                WHERE crecibo = @crecibo
                        END
                        ELSE
                        BEGIN
                                EXEC adGeneraComision @crecibo,@ptasamon

                                -- Ejecutar el cálculo del bono
                                IF @ptasamonref > 0
                                BEGIN
                                        EXEC adBCalculo_Bonos @crecibo, @CRAMO,@ptasamonref,@cusuario, 1
                                END
                                ELSE
                                BEGIN
                                        EXEC adBCalculo_Bonos @crecibo, @CRAMO,@ptasamon,@cusuario, 1
                                END
                               EXEC adBCalculo_GastoRamov2 @crecibo, @CRAMO,@ptasamon,@cusuario,'CobroSisAd';
                        END
                END


      /*  IF(@cproductor != 80080) BEGIN 
                EXEC spOrdenPago @freporte,@cusuario,@transaccion,@cproductor,null,null

        END*/

        select @cnpoliza_rel = cnpoliza_rel from 
        adpoliza a 
        INNER JOIN adrecibos b on a.cpoliza = b.cpoliza and a.fanopol = b.fanopol and a.fmespol = b.fmespol
        where a.corigen_rel = '01' and cnpoliza_rel is not null and b.cnrecibo =  @recibo

        IF @cnpoliza_rel is not null
        BEGIN
                EXEC adCobroSis_Pas @transaccion
        END

        SET @numRecibos = @numRecibos - 1;
        END
        
        SELECT @cnpoliza = cnpoliza, @fanopol = fanopol, @fmespol = fmespol FROM adrecibos WHERE crecibo = @crecibo
    set @status = 1
    set @mensaje = 'Pago exitoso'	
    END	
END
