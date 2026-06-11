const sql = require('mssql');
require('dotenv').config();

const sqlConfig = {
  user: process.env.USER_BD,
  password: process.env.PASSWORD_BD,
  database: process.env.NAME_BD,
  server: process.env.SERVER_BD,
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  options: { encrypt: false, trustServerCertificate: true }
};

async function run() {
  const pool = await sql.connect(sqlConfig);
  try {
      const query = `
      DECLARE 
        @crecibo varchar(30) = '9-100170929', @ccontrea smallint = 1, @cramorea int = 9, 
        @mcomision numeric(18,6) = 0, @mcomisionext numeric(18,6) = 0, 
        @msumaaseg numeric(18,6) = 1673928.60, @msumaasegext numeric(18,6) = 3000.00,
        @mprimabruta numeric(18,6) = 1171.75, @mprimabrutaext numeric(18,6) = 2.10
      
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
      `;
      await pool.request().batch(query);
      console.log('INSERT SUCCESS!');
  } catch (err) {
      console.error(err);
  }
  process.exit(0);
}
run().catch(console.error);
