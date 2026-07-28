CREATE   PROCEDURE [dbo].[spCnSaldo_Ad]
    @cusuario   NUMERIC(10),
    @transaccion NUMERIC(7),
    @ctenedor NUMERIC(13)
AS
BEGIN
    DECLARE 
    @cprog NVARCHAR(20) ='SaldoCli', 
    @ifuente NVARCHAR (10) = 'SQL', 
    @ptasamon NUMERIC(18,6), 
    @msaldo NUMERIC (18,6), 
    @msaldoext NUMERIC (18,6),
    @mpago NUMERIC (18,6), 
    @fechaSol datetime = getdate(),
    @cmoneda VARCHAR(4),
    @ctipopago bit,
    @recibos varchar(max) , @soporte varchar(max) , @calculo varchar(max)

    SELECT @ptasamon = ptasamon from mamonedas where cmoneda = '$'
    SELECT TOP 1 @cmoneda = cmoneda from cbreporte_pago where ctransaccion = @transaccion  ORDER BY npago DESC;
    set @ctipopago = isnull((SELECT 1 from cbreporte_pago where ctransaccion = @transaccion and ctipopago = 10),0)
    set @soporte = (select cmoneda,case cmoneda when 'bs' then mpago else mpagoext end as mmonto,freporte as ftasa from cbreporte_pago where ctransaccion = @transaccion FOR JSON PATH)
    set @recibos = (select trim(cnrecibo) as cnrecibo  from adrecibos where cdoccob = @transaccion FOR JSON PATH)
    set @calculo = (SELECT dbo.CalcularNotificacion (@recibos, @soporte))

    SELECT @msaldo = sobranteBs, @msaldoext = sobranteDolares
        FROM OPENJSON(@calculo) 
    WITH (
        sobranteBs  DECIMAL(18,2) '$.sobranteBs',
        sobranteDolares DECIMAL(18,2) '$.sobranteDolares'
    ) 

    IF @ctipopago = 1 BEGIN
        update adsolpg set istatsol = 'B' where cben = @ctenedor and ccuenta <> @transaccion and itransaccion = 'U' and isolpag = 'SOB' and istatsol = 'C'
    END
    
    IF @msaldo  > 1 BEGIN
        
        INSERT INTO adctacli_det (
                msaldo_debe,msaldoext_debe ,ctenedor ,ctransaccion,fingreso,cusuario,cprog,ifuente,ptasamon,cmoneda,u_version,msaldo_haber,msaldoext_haber) 
        VALUES  (0,0,@ctenedor,@transaccion,GETDATE(),@cusuario,@cprog,@ifuente,@ptasamon,@cmoneda,'$',@msaldo,@msaldoext) 

        IF EXISTS (select * from adctacli where ctenedor = @ctenedor)
        BEGIN
            update adctacli set 
            msaldo = (select sum(msaldo_haber)  + sum(msaldo_debe) from adctacli_det where  ctenedor = @ctenedor ),
            msaldoext= (select sum(msaldoext_haber)  + sum(msaldoext_debe) from adctacli_det where  ctenedor = @ctenedor ),
            cusuariomod= @cusuario,
            ctransaccion= @transaccion,
            fultmod = GETDATE(),
            cprog = @cprog,
            ifuente = @ifuente ,
            cmoneda = @cmoneda
            where ctenedor = @ctenedor
        END
        ELSE
        BEGIN
            insert into adctacli (
                ctenedor,ctransaccion,msaldo,msaldoext,cprog,ifuente,fingreso,cusuario,cmoneda,u_version,iestado
            ) values (
                @ctenedor,@transaccion,@msaldo,@msaldoext,@cprog,@ifuente,GETDATE(),@cusuario,@cmoneda,'$','I'
            ) 
        END

        EXEC SpMovim 'DP','Or_SOB', @fechaSol,null,@transaccion,@cusuario,null,null,null
    END 

END
