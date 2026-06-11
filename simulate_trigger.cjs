const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.USER_BD,
    password: process.env.PASSWORD_BD,
    server: process.env.SERVER_BD,
    database: process.env.NAME_BD,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

async function testTrigger() {
    try {
        let pool = await sql.connect(config);
        
        console.log('--- SIMULANDO SEGUNDO TRIGGER TEmision_Per_Ge ---');
        
        // Lee el SQL del trigger
        const fs = require('fs');
        let triggerSql = fs.readFileSync('trigger_fixed4.sql', 'utf8');
        
        // Extrae todo desde "DECLARE @error VARCHAR(max)" en adelante
        let bodyStart = triggerSql.indexOf('DECLARE @error VARCHAR(max)');
        if (bodyStart === -1) throw new Error("No encontré el body del trigger");
        
        let body = triggerSql.substring(bodyStart);
        // Remove the final END ;
        body = body.replace(/END\s*;\s*$/, '');
        
        const script = `
        DECLARE
        @id int, @cnpoliza_rel varchar(30), @cplan varchar(6), @xcanal_venta varchar(250), @icedula_tomador char(1),
        @xrif_tomador  numeric(9),   @xnombre_tomador   varchar(250),   @xapellido_tomador   varchar(250),   @isexo_tomador   char(1),
        @iestado_civil_tomador  char(1),  @fnac_tomador  DATE,  @cestado_tomador  varchar(100),   @cciudad_tomador   varchar(100),
        @xdireccion_tomador varchar(1000), @xtelefono_tomador varchar(250), @xcorreo_tomador varchar(250),  @icedula_titular  char(1),
        @xrif_titular  numeric(9),   @xnombre_titular   varchar(250),   @xapellido_titular   varchar(250),   @isexo_titular   char(1),
        @iestado_civil_titular  char(1),  @fnac_titular  DATE,  @cestado_titular  varchar(100),   @cciudad_titular   varchar(100),
        @xdireccion_titular varchar(1000), @xtelefono_titular varchar(250), @xcorreo_titular varchar(250), @cproductor int,  @ptasamon numeric(18,6), @ifrecuencia char(1), @femision DATE, @fdesde DATE, @fhasta DATE, 
        @api varchar(100), @method varchar(100),  @cprog  char(20),  @ifuente char(10), @fingreso DATETIME, @cpoliza NUMERIC(19,0), @cnpoliza  varchar(30),  @cproces  NUMERIC(13,0),  @pcomision  numeric(9,  2),
        @cramo int, @cmoneda CHAR(4),
        @msumaaseg  numeric(18,  2),  @msumaasegext  numeric(18,  2),  @mprima  numeric(18,  2),  @mprimaext  numeric(18,2),   @mcomision numeric(18,2),  @mcomisionext  numeric(18,2),  @qcontador   numeric(18,0),   
        @crecibo numeric(19,0), @cnrecibo varchar(30), @qcontadorrec numeric(18,0),
        @contador_polacc numeric(18,0), @fano smallint, @fmes smallint,  @fanopol  smallint,  @fmespol  smallint,  @fdesde_pol  DATE,
        @fhasta_pol DATE, @fdesde_rec DATE, @fhasta_rec DATE,  @corigen_rel  char(2),  @qrecibo1  numeric(19,0),  @ncuo  int,
        @ifpexceso numeric(18,2), @msfp numeric(18,2), @mpfp numeric(18,2), @mpfpext numeric(18,2), @mpfpret  numeric(18,2),  @mpfpretext numeric(18,2), @mcfp numeric(18,2), @mcfpext numeric(18,2), @mifp numeric(18,2), @mifpext numeric(18,2), @msretesp numeric(18,2),
        @msretespext numeric(18,2), @mpretesp numeric(18,2),  @mpretespext  numeric(18,2),  @ctiporamo  int,  @itipocont  char(3),  @pcoa numeric(18,8),    @nparentesco_asegurado    tinyint,    @icedula_asegurado    char(1),    @xrif_asegurado     numeric(12,     0),
        @iestado_civil_asegurado char(1), @xnombre_asegurado varchar(250), @xapellido_asegurado varchar(250),  @isexo_asegurado  char(1),
        @fnac_asegurado   DATE,   @xdireccion_asegurado   varchar(1000),   @xcorreo_asegurado   varchar(250),    @xtelefono_asegurado varchar(250), @caseg  numeric(12,0),  @cben  numeric(12,0),  @nparentesco_beneficiario  tinyint,  @icedula_beneficiario  char(1),
        @xrif_beneficiario numeric(12, 0), @xnombre_beneficiario varchar(250), @xapellido_beneficiario varchar(250), @isexo_beneficiario char(1),
        @nbeneficia int, @fnac_beneficiario DATE , @ncobertura
        TINYINT, @POL_RAMO VARCHAR(20), @cparen TINYINT, @ctablatar CHAR(10),
        @nedad_asegurado VARCHAR(20),
        @nrecibo int, @fcobro DATE, @iestadorec CHAR(1), @cnrecibo_rel varchar(30), @xcliente_tomador VARCHAR(250), 
        @xcliente_titular VARCHAR(250), @xcliente_asegurado VARCHAR(250), @xcliente_beneficiario VARCHAR(250), @cuotas INT, @cramoint INT,
        @ccanalalt int, @cscanalalt int, @ctipocanal CHAR(1), @cbeneficiario numeric(9), @msumatabla  numeric(18,  2), @cgestor VARCHAR(30),
        @mprimarec  numeric(18,2), @mprimarecext  numeric(18,2),
        @mprimabrutaext numeric(18,2), @pdescuento numeric(13,2), @mdescuentoext numeric(18,2), @precargo numeric(13,2), @mrecargoext numeric(18,2), 
        @mmontonetoext numeric(18,2),
        @mprimabrutarecext numeric(18,2), @mdescuentorecext numeric(18,2), @mrecargorecext numeric(18,2), @mmontonetorecext numeric(18,2),
        @mprimabrutarec numeric(18,2), @mdescuentorec numeric(18,2), @mrecargorec numeric(18,2), @mmontonetorec numeric(18,2),
        @pdescuento_cob numeric(13,2), @precargo_cob numeric(13,2),
        @pporce NUMERIC(13, 2),
        @mprima_tar NUMERIC(18, 2), @mprimabruta_tar NUMERIC(18, 2),
        @mprimaext_tar NUMERIC(18, 2), @mprimabrutaext_tar NUMERIC(18, 2),
        @mdescuento_tar NUMERIC(18, 2), @mdescuentoext_tar NUMERIC(18, 2),
        @mrecargo_tar NUMERIC(18, 2), @mrecargoext_tar NUMERIC(18, 2)

        SELECT TOP 1
        @id = id, @cnpoliza_rel = cnpoliza_rel,  @cplan  =  cplan,  @xcanal_venta  =  xcanal_venta,  @icedula_tomador  =  icedula_tomador,
        @xrif_tomador = xrif_tomador,  @xnombre_tomador  =  xnombre_tomador,  @xapellido_tomador  =  xapellido_tomador,  @isexo_tomador  = isexo_tomador, @iestado_civil_tomador = iestado_civil_tomador, @fnac_tomador = fnac_tomador, @cestado_tomador  =  cestado_tomador,
        @cciudad_tomador  =  cciudad_tomador,  @xdireccion_tomador   =   xdireccion_tomador,   @xtelefono_tomador =   xtelefono_tomador,
        @xcorreo_tomador  =  xcorreo_tomador,  @icedula_titular  =  icedula_titular,  @xrif_titular  =  xrif_titular,  @xnombre_titular  = xnombre_titular,   @xapellido_titular   =   xapellido_titular,   @isexo_titular   =   isexo_titular,   @iestado_civil_titular    = iestado_civil_titular, @fnac_titular = fnac_titular,  @cestado_titular  =  cestado_titular,  @cciudad_titular  =  cciudad_titular,
        @xdireccion_titular = xdireccion_titular, @xtelefono_titular = xtelefono_titular, @xcorreo_titular = xcorreo_titular,  @cproductor = cproductor, @ptasamon = ptasamon, @ifrecuencia = ifrecuencia, @femision = femision, @api =  api,  @method  =  method,  @cprog  = cprog, @ifuente = ifuente, @fingreso = fingreso, @cpoliza = cpoliza, @cnpoliza  =  cnpoliza,  @cproces  =  cproces,  @pcomision  = pcomision, @cramo = cramo, @mprimaext = mprimaext, @corigen_rel = corigen_rel, @ccanalalt = ccanalalt, @cscanalalt = cscanalalt, @ctipocanal = ctipocanal, @msumaaseg = msumaaseg, @fdesde = fdesde, @fhasta = fhasta
        FROM TMEMISION_PERSONAS_GENERAL
        WHERE id = 1041

        PRINT 'Iniciando bloque...'
        BEGIN TRY
            ${body}
        END TRY
        BEGIN CATCH
            PRINT '--- ERROR ATRAPADO ---'
            PRINT ERROR_MESSAGE()
            PRINT ERROR_LINE()
        END CATCH
        `;
        
        pool.on('info', info => console.log('[SQL PRINT]', info.message));
        
        await pool.request().query(script);
        console.log('Terminado de evaluar script.');

    } catch (err) {
        console.error('Error externo:', err.message);
    } finally {
        sql.close();
    }
}

testTrigger();
