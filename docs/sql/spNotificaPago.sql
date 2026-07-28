CREATE   PROCEDURE [dbo].[spNotificaPago]
    @freporte DATE,
    @cusuario NUMERIC(11) = null,
    @ctenedor NUMERIC(11), 
    @recibos NVARCHAR(MAX),
    @numRecibos NUMERIC(7),
    @mpago DECIMAL(18, 2),
    @mpagoext DECIMAL(18, 2),
    @cprog NVARCHAR(20),
    @cmoneda_pago NVARCHAR(4) = null,
    @soporte NVARCHAR(MAX) = null,
	@status BIT OUTPUT, 	
    @mensaje NVARCHAR(MAX) OUTPUT,
    @ptasamon DECIMAL(18, 6) OUTPUT,
    @transaccion NUMERIC(7) OUTPUT 
AS
BEGIN
    DECLARE 
        @cproductor NUMERIC(11),    @ifuente NVARCHAR(50),   @cramo smallint,   @crecibo NUMERIC(21),  @ptasamonref DECIMAL(18, 6), 
        @mprimabruta DECIMAL(18, 4), @mprimabrutaext DECIMAL(18, 4),  @motrosrec DECIMAL(18, 4), @motrosrecext DECIMAL(18, 4), 
        @motrosdes DECIMAL(18, 4), @motrosdesext DECIMAL(18, 4),   @mgastos DECIMAL(18, 4),  @mgastosext DECIMAL(18, 4), @motrosgas DECIMAL(18, 4), 
        @motrosgasext DECIMAL(18, 4), @mgemi DECIMAL(18, 4), @mgemiext DECIMAL(18, 4), @mmontoneto DECIMAL(18, 4), @mmontonetoext DECIMAL(18, 4),  @recibo NVARCHAR(max),
        @mimpuesto DECIMAL(18, 4), @mimpuestoext DECIMAL(18, 4), @mmontoapag DECIMAL(18, 4),  @mmontoapagext DECIMAL(18, 4)

    SET @ifuente = 'WEBSIS'
    SET @cmoneda_pago = ISNULL(@cmoneda_pago, '$')

    INSERT INTO cbreporte_tran (
        freporte, casegurado, mpago, mpagoext, 
        ptasamon, cprog, ifuente, cusuario, 
        iestado_tran, fingreso, iestado
    ) 
    VALUES (
        @freporte, @ctenedor, @mpago, @mpagoext, 
        @ptasamon, @cprog, @ifuente, @cusuario, 
        'TN', GETDATE(), '0'
    );

    SET @transaccion = SCOPE_IDENTITY();

    IF @soporte IS NOT NULL AND @soporte <> '' AND @soporte <> '[]'
    BEGIN
        INSERT INTO cbreporte_pago (
            ctransaccion, freporte, npago, casegurado, 
            cmoneda, cbanco, cbanco_destino, ctipopago, mpago, mpagoext, mpagoigtf, mtotal, mtotalext,
            mnotificado, mnotificadoext, xreferencia, xruta,  cprog , ptasamon
        )
        select 
            @transaccion, 
            CAST(freporte AS DATETIMEOFFSET),
            ROW_NUMBER() OVER(ORDER BY (SELECT NULL)), @ctenedor,
            cmoneda, cbanco, cbanco_destino, ctipopago, mpago, mpagoext, mpagoigtf, mtotal, mtotalext,
            mnotificado, mnotificadoext, xreferencia, xruta, cprog , ptasamon
        FROM OPENJSON(@soporte) 
        WITH (
            cmoneda        NVARCHAR(5)   '$.cmoneda',
            cbanco         INT           '$.cbanco',
            cbanco_destino INT           '$.cbanco_destino',
            ctipopago      INT           '$.ctipopago',
            mpago          DECIMAL(18,2) '$.mpago',
            mpagoext       DECIMAL(18,2) '$.mpagoext',
            mpagoigtf      DECIMAL(18,2) '$.mpagoigtf',
            mtotal         DECIMAL(18,2) '$.mtotal',
            mtotalext      DECIMAL(18,2) '$.mtotalext',
            mnotificado    DECIMAL(18,2) '$.mnotificado',
            mnotificadoext DECIMAL(18,2) '$.mnotificadoext',
            xreferencia    NVARCHAR(50)  '$.xreferencia',
            xruta          NVARCHAR(MAX) '$.xruta',
            freporte       NVARCHAR(50)  '$.freporte',
            cprog          NVARCHAR(20)  '$.cprog',
            ptasamon       DECIMAL(18,2) '$.ptasamon'
        );
    END

    declare @fpago date = (select CONVERT(date,max(freporte)) from cbreporte_pago where ctransaccion = @transaccion)
    SET @fpago = ISNULL(@fpago, @freporte)
    SET @ptasamon = (SELECT top 1 ptasamon from  mavamoneda where trim(cmoneda) = '$' and convert(date,fmoneda) = isnull(@fpago,getdate()) )

    WHILE @numRecibos > 0
    BEGIN
        SET @recibo = LEFT(@recibos, CHARINDEX(',', @recibos + ',') - 1);
        SET @recibos = STUFF(@recibos, 1, CHARINDEX(',', @recibos + ',') , '');
        SET @recibo = REPLACE(@recibo, '''', '');

        SELECT @ptasamonref = b.ptasamon 
        FROM adrecibos a 
        LEFT JOIN mavamoneda b ON b.cmoneda = case when trim(a.cmoneda) = 'BS' then '$' else a.cmoneda end and convert(date,b.fmoneda) = CONVERT(date,@fpago)
        WHERE a.cnrecibo = @recibo;

        IF @ptasamonref IS NULL
        BEGIN
            SELECT @ptasamonref = 
                CASE 
                    WHEN a.cmoneda = 'eur' THEN b.ptasamon 
                    ELSE (SELECT ptasamon FROM mamonedas WHERE cmoneda = '$') 
                END
            FROM adrecibos a 
            LEFT JOIN mamonedas b ON a.cmoneda = b.cmoneda 
            WHERE a.cnrecibo = @recibo;
        END

        SELECT 
            @mmontoapag =   CASE  WHEN cmoneda = 'BS' THEN mmontorec  ELSE mmontorecext *  @ptasamonref  END,
            @mprimabruta =  CASE  WHEN cmoneda = 'BS' THEN mprimabruta  ELSE mprimabrutaext *  @ptasamonref   END,
            @mgastos =      CASE  WHEN cmoneda = 'BS' and mgastos > 0  THEN mgastos  ELSE mgastosext  *  @ptasamonref   END,
            @motrosgas =    CASE  WHEN cmoneda = 'BS' and motrosgas > 0  THEN motrosgas  ELSE motrosgasext  *  @ptasamonref   END,
            @mgemi =        CASE  WHEN cmoneda = 'BS' and mgemi > 0  THEN mgemi  ELSE mgemiext *  @ptasamonref   END,
            @mimpuesto =    CASE  WHEN cmoneda = 'BS' and mimpuesto > 0 THEN mimpuesto  ELSE mimpuestoext *  @ptasamonref  END,
            @mmontoneto =   CASE  WHEN cmoneda = 'BS' THEN mmontoneto  ELSE mmontonetoext *  @ptasamonref   END,
            @motrosrec =    CASE  WHEN cmoneda = 'BS' THEN motrosrec   ELSE motrosrecext *  @ptasamonref  END,
            @mmontoapagext =    CASE  WHEN cmoneda = 'BS' THEN mmontorec /  @ptasamonref   ELSE mmontorecext  END,
            @mprimabrutaext =   CASE  WHEN cmoneda = 'BS' THEN mprimabruta /  @ptasamonref   ELSE mprimabrutaext  END,
            @mgastosext =       CASE  WHEN cmoneda = 'BS' and mgastos > 0 THEN mgastos /  @ptasamonref   ELSE mgastosext  END,
            @motrosgasext =     CASE  WHEN cmoneda = 'BS' and motrosgas > 0 THEN motrosgas /  @ptasamonref   ELSE motrosgasext  END,
            @mgemiext =         CASE  WHEN cmoneda = 'BS' and mgemi > 0 THEN mgemi /  @ptasamonref   ELSE mgemiext  END,
            @mimpuestoext =     CASE  WHEN cmoneda = 'BS' and mimpuesto > 0 THEN mimpuesto /  @ptasamonref   ELSE mimpuestoext  END,
            @mmontonetoext =    CASE  WHEN cmoneda = 'BS' THEN mmontoneto /  @ptasamonref   ELSE mmontonetoext  END,
            @motrosrecext=      CASE  WHEN cmoneda = 'BS' THEN mmontoneto /  @ptasamonref   ELSE motrosrecext  END,
            @cproductor = cproductor , @cramo = cramo , @crecibo = crecibo
        FROM adrecibos 
        WHERE cnrecibo =  @recibo

        UPDATE adrecibos
        SET 
            mpagadoext = @mmontoapagext, 
            mpagado = @mmontoapag, 
            cdoccob = @transaccion,
            fpago = @freporte,
            iestadorec = 'N',
            fpago_aseg = @freporte
        FROM adrecibos 
        WHERE cnrecibo =  @recibo
 
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
                @mprimabruta, @mprimabrutaext, @ptasamonref,potrosrec,@motrosrec,@motrosrecext,potrosdes,@motrosdes,@motrosdesext,
                pgastos,@mgastos,@mgastosext,potrosgas,@motrosgas,@motrosgasext,@mgemi,@mgemiext,pgemi,@mmontoneto,@mmontonetoext,
                pimpuesto,@mimpuesto,@mimpuestoext,@mmontoapag,@mmontoapagext,@freporte ,@cprog, GETDATE(),@cusuario
            FROM adrecibos 
            WHERE cnrecibo = @recibo

        SET @status = 1;
        SET @mensaje = 'Pago exitoso';
        SET @numRecibos = @numRecibos - 1;
    END

    SET @mensaje = 'Pago exitoso';
END
