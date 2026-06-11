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
      
      select 
        @crecibo as f1, @ccontrea as f2,@cramorea as f3,'!' as f4,0 as f5,0 as f6,cmoneda,0 as f7,0 as f8,0 as f9,0 as f10,fcobro,fpago_aseg,
        1 as f11,cproces,0 as f12,(select ctiporamo from maramos where cramo = adrecibos.cramo ) as f13,'N' as f14,'N' as f15,0 as f16,0 as f17, 
        fanopol,fmespol,cpoliza,cnpoliza,fdesde,fhasta,fanopol as f18,'RET' as f19,cramo,0 as f20,ccerti,cmoneda as cmoneda2, 0 as f21,  ptasamon, 0 as f22,qcuotas,  fdesde as fdesde2,   fhasta as fhasta2,@mcomision as mcom,@mcomisionext as mcomext, 
        @msumaaseg as m1,@msumaasegext as m2,0 as f23,@mprimabruta as m3,@mprimabrutaext as m4,0 as f24,0 as f25,100 as f26,0 as f27,0 as f28,0 as f29,0 as f30,0 as f31,0 as f32,@msumaaseg as m5,@msumaasegext as m6,0 as f33,@mprimabruta as m7,@mprimabrutaext as m8,0 as f34,@mprimabruta as m9,0 as f35,@mprimabruta as m10,
        @mprimabruta as m11,@mprimabrutaext as m12,0 as f36,0 as f37,@mprimabruta as m13,@mprimabrutaext as m14,fdesde as fdesde3,fhasta as fhasta3,@mprimabruta as m15,@mprimabrutaext as m16,0 as f38,0 as f39,0 as f40,0 as f41,0 as f42,0 as f43,0 as f44,0 as f45,0.00 as f46,0.00 as f47,0.00 as f48,0.00 as f49,0.00 as f50,0.00 as f51,0.00 as f52,0.00 as f53,0.00 as f54,0.00 as f55,0.00 as f56,
        0.00 as f57,0.00 as f58,0.00 as f59,0.00 as f60,0.00 as f61,0.00 as f62,0.00 as f63,0.00 as f64,0.00 as f65,0.00 as f66,0.00 as f67,0.00 as f68,0.00 as f69,0.00 as f70,0.00 as f71,0.00 as f72,0.00 as f73,0.00 as f74,0.00 as f75,0.00 as f76,0.00 as f77,0.00 as f78,0.00 as f79,0.00 as f80,0.00 as f81,0.00 as f82,0.00 as f83,0.00 as f84,0.00 as f85,
        0.00 as f86,0.00 as f87,0.00 as f88,0.00 as f89,0.00 as f90,0.00 as f91,0.00 as f92,0.00 as f93,0.00 as f94,0.00 as f95,0.00 as f96,0.00 as f97,0.00 as f98,0.00 as f99,0 as f100,0 as f101,'N' as f102,
        0.00 as f103,0.00 as f104,0.00 as f105,0.00 as f106,0.00 as f107,0.00 as f108,0.00 as f109,0.00 as f110,0.00 as f111,0.00 as f112,0.00 as f113,0.00 as f114,0 as f115,0 as f116,'N' as f117,
        0.00 as f118,0.00 as f119,0.00 as f120,0.00 as f121,0.00 as f122,0.00 as f123,0.00 as f124,0.00 as f125,0.00 as f126,0.00 as f127,0.00 as f128,0.00 as f129,0 as f130,0.00 as f131,0.00 as f132,0.00 as f133,0.00 as f134,0.00 as f135,0.00 as f136,0.00 as f137,0.00 as f138,0.00 as f139,0.00 as f140,
        0 as f141,0.00 as f142,@mprimabruta as m17, @mprimabrutaext as m18,0 as f143,'N' as f144,iestadorec,itiporec,0 as f145,0 as f146,cprog,ifuente,bok,cerror,fingreso,cusuario,cusuariomod,cusuarioauto,ccategoria,ccategoriamod,ccategoriaauto,fultmod
      into #temp_adpolrea
      from adrecibos where crecibo = @crecibo 
      `;
      await pool.request().batch(query);
      console.log('SELECT INTO TEMP SUCCESS!');
  } catch (err) {
      console.error(err);
  }
  process.exit(0);
}
run().catch(console.error);
