--  ˚☽˚. ‧₊˚✩₊˚.⋆☾⋆⁺₊✧⋆⁺₊⋆ ☀︎ ⋆⁺₊⋆
-- Author:	Franjhely Araujo <3
-- Create date: 6/8/2024
-- Description:	Emision Automovil 
--  ˚☽˚. ‧₊˚✩₊˚.⋆☾⋆⁺₊✧⋆⁺₊⋆ ☀︎ ⋆⁺₊⋆
ALTER PROCEDURE [dbo].[spGeneraAdpolrea]
    @crecibo numeric(20)
AS
DECLARE
@mprimabruta numeric(18,6) , @mprimabrutaext numeric(18,6),
@msumaaseg numeric(18,6) , @msumaasegext numeric(18,6) , @ccontrea smallint , @cramorea int ,
@mcomision numeric(18,6) , @mcomisionext numeric(18,6) , @isuma char (1)

	DECLARE recibo_cursor CURSOR FOR
	select distinct(ccontrea) , cramorea from adpolcob where crecibo = @crecibo;

    -- Abrir el cursor
    OPEN recibo_cursor;

    -- Obtener el primer recibo
    FETCH NEXT FROM recibo_cursor INTO @ccontrea, @cramorea;

    -- Procesar cada recibo
    WHILE @@FETCH_STATUS = 0
    BEGIN 
		--Iniciamos primas en 0
		set @mprimabruta = 0
		set @mprimabrutaext = 0
		--Buscamos el ramo de reaseguro
        select @mprimabruta = sum(mprimabruta) from adpolcob where ccontrea = @ccontrea and crecibo = @crecibo

		select @mprimabrutaext = sum(mprimabrutaext) from adpolcob where ccontrea = @ccontrea and crecibo = @crecibo

		select @mcomision = sum(mcomision) from adpolcob where ccontrea = @ccontrea and crecibo = @crecibo

		select @mcomisionext = sum(mcomisionext) from adpolcob where ccontrea = @ccontrea and crecibo = @crecibo
		
		select top 1 @isuma = isuma from adpolcob where ccontrea = @ccontrea and crecibo = @crecibo
		if @isuma = '>'
		begin
			select @msumaaseg = max(msumaaseg)  from adpolcob where ccontrea = @ccontrea and crecibo = @crecibo
			select @msumaasegext = max(msumaasegext)  from adpolcob where ccontrea = @ccontrea and crecibo = @crecibo
		end
		else
		begin
			select @msumaaseg = sum(msumaaseg)  from adpolcob where ccontrea = @ccontrea and crecibo = @crecibo
			select @msumaasegext = sum(msumaasegext)  from adpolcob where ccontrea = @ccontrea and crecibo = @crecibo
		end

		if exists(select * from adpolrea where  ccontrea = @ccontrea and crecibo = @crecibo and cramorea = @cramorea)
		BEGIN
			PRINT 'SUM MPRIMAEXT: ' + CAST(@mprimabrutaext AS VARCHAR(100)); 
 PRINT 'SUM MSUMAASEG: ' + CAST(@msumaaseg AS VARCHAR(100)); 
 PRINT 'SUM MSUMAASEGEXT: ' + CAST(@msumaasegext AS VARCHAR(100)); 
 update adpolrea set 
				mprimabruta = @mprimabruta,
				mprimabrutaext = @mprimabrutaext,
				mprimareas = @mprimabruta,
				mprimareasext = @mprimabrutaext,
				mcomision = @mcomision,
				mcomisionext = @mcomisionext,
				msumabruta  = @msumaaseg, 
				msumabrutaext  = @msumaasegext
		 where  ccontrea = @ccontrea and crecibo = @crecibo and cramorea = @cramorea
		END
		else
		begin

			INSERT INTO adpolrea
			(
				crecibo,ccontrea,cramorea,u_version,cano_cierre,cmes_cierre,cmoneda_rea,fdesde_cont,fhasta_cont,fdesde_org,fhasta_org,fcobro,fpago_aseg,
                reas_ok,cproces,crecibo_org,ctiporamo,icontsust,itipocontalt,ccontalt,cramoalt,fanopol,fmespol,cpoliza,cnpoliza,
				fdesde_pol,fhasta_pol,cserie_rea,itipocont,cramo,criesgo,ccerti,cmoneda,cmoneda_origen,mcambio_a_bs,ptasamon_pago,qcuotas,
				fdesde,fhasta,mcomision,mcomisionext,msumabruta,msumabrutaext,msumabrutaext_2,mprimabruta,mprimabrutaext,mprimabrutaext_2,
				pcoa,pporret,msumacoa,msumacoaext,msumacoaext_2,mprimacoa,mprimacoaext,mprimacoaext_2,msumaneta,msumanetaext,msumanetaext_2,
				mprimaneta,mprimanetaext,mprimanetaext_2,mprimabruta_emi,mprimacoa_emi,mprimaneta_emi,mprimareas,mprimareasext,mprimareas_c,
				mprimareasext_c,mprimareas_n,mprimareasext_n,fdesde_dev,fhasta_dev,mprimadev,mprimadevext,mprimadif,mprimadifext,msretadic,
				msretadicext,mpretadic,mpretadicext,mscp1,mscp1ext,mpcp1,mpcp1ext,mccp1,mccp1ext,micp1,micp1ext,mscp2,mscp2ext,mpcp2,mpcp2ext,
				mccp2,mccp2ext,micp2,micp2ext,msret,msretext,mpret,mpretext,msret1,msret1ext,mpret1,mpret1ext,ms1e,ms1eext,mp1e,mp1eext,mc1e,
				mc1eext,mi1e,mi1eext,ms2e,ms2eext,mp2e,mp2eext,mc2e,mc2eext,mi2e,mi2eext,ms3e,ms3eext,mp3e,mp3eext,mc3e,mc3eext,mi3e,mi3eext,
				ms4e,ms4eext,mp4e,mp4eext,mc4e,mc4eext,mi4e,mi4eext,ccontfo,cramofo,itipocontfo,msfo,msfoext,mpfo,mpfoext,msforet,msforetext,
				mpforet,mpforetext,mcfo,mcfoext,mifo,mifoext,ccontfo1,cramofo1,itipocontfo1,msfo1,msfo1ext,mpfo1,mpfo1ext,msfo1ret,msfo1retext,
				mpfo1ret,mpfo1retext,mcfo1,mcfo1ext,mifo1,mifo1ext,ifpexceso,msfp,msfpext,mpfp,mpfpext,mpfpret,mpfpretext,mcfp,mcfpext,mifp,
				mifpext,msretesp,msretespext,mpretesp,mpretespext,ifperrado,iestado,iestadorec,itiporec,nerr_a,nerr_f,cprog,ifuente,bok,cerror,
				fingreso,cusuario,cusuariomod,cusuarioauto,ccategoria,ccategoriamod,ccategoriaauto,fultmod
			)   
			select 
			  @crecibo, @ccontrea,@cramorea,'!',0,0,cmoneda,0,0,0,0,fcobro,fpago_aseg,
              1,cproces,0,(select ctiporamo from maramos where cramo = adrecibos.cramo ),'N','N',0,0, 
			  fanopol,fmespol,cpoliza,cnpoliza,fdesde,fhasta,fanopol,'RET',cramo,0,ccerti,cmoneda, 0,  ptasamon, 0,qcuotas,  fdesde,   fhasta,@mcomision,@mcomisionext, 
			  @msumaaseg,@msumaasegext,0,@mprimabruta,@mprimabrutaext,0,0,100,0,0,0,0,0,0,@msumaaseg,@msumaasegext,0,@mprimabruta,@mprimabrutaext,0,@mprimabruta,0,@mprimabruta,
			  @mprimabruta,@mprimabrutaext,0,0,@mprimabruta,@mprimabrutaext,fdesde,fhasta,@mprimabruta,@mprimabrutaext,0,0,0,0,0,0,0,0,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,
			  0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,
			  0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0,0,'N',
			  0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0,0,'N',
			  0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,
			  0,0.00,@mprimabruta, @mprimabrutaext,0,'N',iestadorec,itiporec,0,0,cprog,ifuente,bok,cerror,fingreso,cusuario,cusuariomod,cusuarioauto,ccategoria,ccategoriamod,ccategoriaauto,fultmod
			from adrecibos where crecibo = @crecibo 
	end

    FETCH NEXT FROM recibo_cursor INTO @ccontrea,@cramorea;
    END;

    CLOSE recibo_cursor;
    DEALLOCATE recibo_cursor;

