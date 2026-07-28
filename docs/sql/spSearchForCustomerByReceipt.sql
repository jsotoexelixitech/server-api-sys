


--  ˚☽˚. ‧₊˚✩₊˚.⋆☾⋆⁺₊✧⋆⁺₊⋆ ☀︎ ⋆⁺₊⋆
-- Author:	Franjhely Araujo <3
-- Create date: 30/6/2025
-- Description:	Busqueda de tomador/asegurado/productor con recibos segun el caso aplique -- Search for insured/producer with receipts as applicable
--  ˚☽˚. ‧₊˚✩₊˚.⋆☾⋆⁺₊✧⋆⁺₊⋆ ☀︎ ⋆⁺₊⋆

CREATE PROCEDURE [dbo].[spSearchForCustomerByReceipt]
        @iestadorec NVARCHAR(2),
        @itiporec NVARCHAR(2),
        @xcaso NVARCHAR(10),
        @cci_rif nvarchar(20)
AS
BEGIN
/*
Chicos,no me odien por el nombre
*/
    IF @xcaso = 'cliente'
    BEGIN
        IF @itiporec = 'D'
        BEGIN
            SELECT a.cci_rif,trim(a.cid)'cid',trim(a.xcliente)'xcliente',trim(b.xcorreo)'xcorreo' FROM maclient a left join maVclient_correo_pri b on a.cci_rif = b.cci_rif where exists
            (SELECT * from adrecibos where (ctenedor = a.cci_rif or casegurado = a.cci_rif) and itiporec = @itiporec and iestadorec = @iestadorec AND NOT EXISTS(SELECT * FROM admovrec WHERE ccodigo = adrecibos.crecibo ))
            UNION
            SELECT a.cproductor 'cci_rif',
            (select trim(cid) from maclient where cci_rif = a.cci_rif )'cid',
            a.xproductor 'xcliente',a.xcorreo  FROM maproduc a where exists
            (SELECT * from adrecibos where cproductor = a.cproductor and itiporec = @itiporec and iestadorec = @iestadorec AND NOT EXISTS(SELECT * FROM admovrec WHERE ccodigo = adrecibos.crecibo ))
        END
        ELSE IF @iestadorec = 'P' and  @itiporec <> 'D'
        BEGIN

            SELECT distinct (a.cci_rif),trim(a.cid)'cid',trim(a.xcliente)'xcliente',trim(b.xcorreo)'xcorreo'
			    FROM maclient a
			left join maVclient_correo_pri b on a.cci_rif = b.cci_rif
			inner join adrecibos c on c.ctenedor = a.cci_rif or c.casegurado = a.cci_rif
			inner join adpoliza d on c.cpoliza = d.cpoliza and c.fanopol = d.fanopol and c.fmespol = d.fmespol
			where  c.iestadorec in(@iestadorec,'n') and d.istatpol in ('V','0') and c.fdesde >= '2025-07-01'
            UNION
            SELECT distinct (a.cproductor) 'cci_rif',
            (select trim(cid) from maclient where cci_rif = a.cci_rif )'cid',
            a.xproductor 'xcliente',a.xcorreo
				FROM maproduc a-- where exists
			inner join adrecibos c on c.cproductor = a.cproductor
			inner join adpoliza d on c.cpoliza = d.cpoliza and c.fanopol = d.fanopol and c.fmespol = d.fmespol
			where  c.iestadorec in(@iestadorec,'n') and d.istatpol in ('V','0') and c.fdesde >= '2025-07-01'


        END
        ELSE
        BEGIN
            SELECT a.cci_rif,trim(a.cid)'cid',trim(a.xcliente)'xcliente',trim(b.xcorreo)'xcorreo' FROM maclient a left join maVclient_correo_pri b on a.cci_rif = b.cci_rif where exists
            (SELECT * from adrecibos where (ctenedor = a.cci_rif or casegurado = a.cci_rif) and iestadorec = @iestadorec )
            UNION
                        SELECT a.cproductor 'cci_rif',
            (select trim(cid) from maclient where cci_rif = a.cci_rif )'cid',
            a.xproductor 'xcliente',a.xcorreo   FROM maproduc a where exists
            (SELECT * from adrecibos where cproductor = a.cproductor and iestadorec = @iestadorec )
        END
    END
    IF @xcaso = 'recibos'
    BEGIN
        IF @itiporec = 'D'
        BEGIN
	        ;with planes as (
				select cramo, cplan, case cramo when 18 then '24' else cproducto end as cproducto from maplanes
				union all
				select cramo, cplan, cproducto from maplanes_per
			)
            SELECT
                TRIM(p.xcorreo) 'xcorreo_prod',a.cdoccob,
                (SELECT top 1 TRIM(xcorreo) [xcorreo] FROM maclient_correo WHERE cci_rif = A.ctenedor) 'xcorreo',
                a.ctenedor 'casegurado', trim(c1.xcliente) 'xcliente',
                trim(c1.cid) 'cid', convert(nvarchar,a.cproductor) + '-' + trim(p.xproductor) 'productor', trim(a.cmoneda) 'cmoneda',
                case a.cramo when 18 then (select top 1  'Marca:'+(select trim(xmarca) from mamarcas where cmarca = vhcerti.cmarca) + ', Placa : ' + trim(xplaca) from vhcerti where cpoliza = a.cpoliza and fanopol = a.fanopol and fmespol = a.fmespol and ccerti = a.ccerti)
                else
                (select case when a.casegurado != a.ctenedor then xcliente else 'N/A' end from maclient where cci_rif = a.casegurado)
                END 'infPoliza',
                upper(trim(F.xdescripcion_l)) as xramo,
                (select top 1 trim(prod.xdescripcion_l) from planes pl join maproductos prod on pl.cproducto = prod.cproducto where pl.cramo = a.cramo and pl.cplan = a.cplan) as xproducto,
                b.msaldo, b.msaldoext,
                A.cnpoliza, trim(A.cnrecibo) 'cnrecibo', A.qcuotas, f.xdescripcion_c 'cramo', a.cproductor, FORMAT(A.fhasta, 'dd-MM-yyyy')  'fhasta',
                A.mprimabruta, A.mprimabrutaext,A.mmontorec, A.mmontorecext,
                case a.itipoprod when 'RE' then 'Renovación' when  'NU' then 'Nuevo Ingreso'  when  'SO' then 'Solicitud'  else a.itipoprod end as itipoprod, --tipo de producto
                CASE a.cmoneda WHEN '$' THEN CONCAT (a.cmoneda ,A.mmontorecext) WHEN 'BS' THEN CONCAT (a.cmoneda ,A.mmontorec)  WHEN 'eur' THEN CONCAT (a.cmoneda ,A.mmontorecext) END AS recibo, --Concat Recibo
                CASE  WHEN a.mgastosext > 0 THEN a.mgastosext  WHEN a.motrosgasext > 0 THEN  a.motrosgasext else 0 end as gastosext, --gastos EXT
                CASE  WHEN a.mgastos > 0 THEN a.mgastos WHEN a.motrosgas > 0 THEN a.motrosgas else 0 end as gastos --gastos BS
            FROM
            adrecibos AS A inner JOIN
            maproduc AS P ON A.cproductor = P.cproductor
            LEFT JOIN adctacli as b on a.ctenedor = b.ctenedor
            LEFT JOIN maclient AS C1 ON A.ctenedor = C1.cci_rif
            LEFT JOIN maclient AS C2 ON A.casegurado = C2.cci_rif
            LEFT JOIN maclient AS C3 ON p.cci_rif = C3.cci_rif
            LEFT JOIN maramos as F on a.cramo = f.cramo
            where itiporec = @itiporec and iestadorec = @iestadorec  and (trim(c1.cid)  = trim(@cci_rif) or trim(c2.cid) = trim(@cci_rif) or trim(c3.cid)  = trim(@cci_rif)) AND NOT EXISTS(SELECT * FROM admovrec WHERE ccodigo = A.crecibo )
            ORDER by a.fhasta ASC
        END
        ELSE IF @iestadorec = 'P' and  @itiporec <> 'D'
        BEGIN
	        ;with planes as (
				select cramo, cplan, case cramo when 18 then '24' else cproducto end as cproducto from maplanes
				union all
				select cramo, cplan, cproducto from maplanes_per
			)
            SELECT
                TRIM(p.xcorreo) 'xcorreo_prod',a.cdoccob,
                (SELECT top 1 TRIM(xcorreo) [xcorreo] FROM maclient_correo WHERE cci_rif = A.ctenedor) 'xcorreo',
                a.ctenedor 'casegurado', trim(c1.xcliente) 'xcliente',
                trim(c1.cid) 'cid', convert(nvarchar,a.cproductor) + '-' + trim(p.xproductor) 'productor', trim(a.cmoneda) 'cmoneda',
                case a.cramo when 18 then (select top 1  'Marca:'+(select trim(xmarca) from mamarcas where cmarca = vhcerti.cmarca) + ', Placa : ' + trim(xplaca) from vhcerti where cpoliza = a.cpoliza and fanopol = a.fanopol and fmespol = a.fmespol and ccerti = a.ccerti)
                else
                (select case when a.casegurado != a.ctenedor then xcliente else 'N/A' end from maclient where cci_rif = a.casegurado)
                END 'infPoliza',
                upper(trim(F.xdescripcion_l)) as xramo,
                (select top 1 trim(prod.xdescripcion_l) from planes pl join maproductos prod on pl.cproducto = prod.cproducto where pl.cramo = a.cramo and pl.cplan = a.cplan) as xproducto,
                b.msaldo, b.msaldoext,a.ccerti,a.fanopol,
                A.cnpoliza, trim(A.cnrecibo) 'cnrecibo', A.qcuotas, f.xdescripcion_c 'cramo', a.cproductor, FORMAT(A.fhasta, 'dd-MM-yyyy') 'fhasta',
                A.mprimabruta, A.mprimabrutaext, d.itipopol ,
                case when b.msaldo > 0 then A.mmontorec - b.msaldo else A.mmontorec end 'mmontorec',
                case when b.msaldoext > 0 then A.mmontorecext - b.msaldoext else A.mmontorecext end 'mmontorecext',
                case a.itipoprod when 'RE' then 'Renovación' when  'NU' then 'Nuevo Ingreso'  when  'SO' then 'Solicitud'  else a.itipoprod end as itipoprod, --tipo de producto
                CASE a.cmoneda WHEN '$' THEN CONCAT (a.cmoneda ,A.mmontorecext) WHEN 'BS' THEN CONCAT (a.cmoneda ,A.mmontorec)  WHEN 'eur' THEN CONCAT (a.cmoneda ,A.mmontorecext) END AS recibo, --Concat Recibo
                CASE  WHEN a.mgastosext > 0 THEN a.mgastosext  WHEN a.motrosgasext > 0 THEN  a.motrosgasext else 0 end as gastosext, --gastos EXT
                CASE  WHEN a.mgastos > 0 THEN a.mgastos WHEN a.motrosgas > 0 THEN a.motrosgas else 0 end as gastos --gastos BS
            FROM
            adrecibos AS A inner JOIN
            maproduc AS P ON A.cproductor = P.cproductor
            LEFT JOIN adctacli as b on a.ctenedor = b.ctenedor and b.iestado = 'A'
            LEFT JOIN maclient AS C1 ON A.ctenedor = C1.cci_rif
            LEFT JOIN maclient AS C2 ON A.casegurado = C2.cci_rif
            LEFT JOIN maclient AS C3 ON p.cci_rif = C3.cci_rif
            LEFT JOIN maramos as F on a.cramo = f.cramo
            inner join adpoliza d on a.cpoliza = d.cpoliza and a.fanopol = d.fanopol and a.fmespol = d.fmespol
            where iestadorec in(@iestadorec,'n') and a.fdesde >= '2025-07-01' and (trim(c1.cid)  = trim(@cci_rif) or trim(c2.cid) = trim(@cci_rif) or trim(c3.cid)  = trim(@cci_rif)) and d.istatpol in ('V','0')
            ORDER by a.fhasta ASC
        END
        ELSE
        BEGIN
	        ;with planes as (
				select cramo, cplan, case cramo when 18 then '24' else cproducto end as cproducto from maplanes
				union all
				select cramo, cplan, cproducto from maplanes_per
			)
            SELECT
                TRIM(p.xcorreo) 'xcorreo_prod',a.cdoccob,
                (SELECT top 1 TRIM(xcorreo) [xcorreo] FROM maclient_correo WHERE cci_rif = A.ctenedor) 'xcorreo',
                a.ctenedor 'casegurado', trim(c1.xcliente) 'xcliente',
                trim(c1.cid) 'cid', convert(nvarchar,a.cproductor) + '-' + trim(p.xproductor) 'productor', trim(a.cmoneda) 'cmoneda',
                case a.cramo when 18 then (select top 1  'Marca:'+(select trim(xmarca) from mamarcas where cmarca = vhcerti.cmarca) + ', Placa : ' + trim(xplaca) from vhcerti where cpoliza = a.cpoliza and fanopol = a.fanopol and fmespol = a.fmespol)
                else
                (select case when a.casegurado != a.ctenedor then xcliente else 'N/A' end from maclient where cci_rif = a.casegurado)
                END 'infPoliza',
                upper(trim(F.xdescripcion_l)) as xramo,
                (select top 1 trim(prod.xdescripcion_l) from planes pl join maproductos prod on pl.cproducto = prod.cproducto where pl.cramo = a.cramo and pl.cplan = a.cplan) as xproducto,
                b.msaldo, b.msaldoext, d.itipopol ,
                A.cnpoliza, trim(A.cnrecibo) 'cnrecibo', A.qcuotas, f.xdescripcion_c 'cramo', a.cproductor, FORMAT(A.fhasta, 'dd-MM-yyyy')  'fhasta',
                A.mprimabruta, A.mprimabrutaext,A.mmontorec, A.mmontorecext,
                case a.itipoprod when 'RE' then 'Renovación' when  'NU' then 'Nuevo Ingreso'  when  'SO' then 'Solicitud'  else a.itipoprod end as itipoprod, --tipo de producto
                CASE a.cmoneda WHEN '$' THEN CONCAT (a.cmoneda ,A.mmontorecext) WHEN 'BS' THEN CONCAT (a.cmoneda ,A.mmontorec)  WHEN 'eur' THEN CONCAT (a.cmoneda ,A.mmontorecext) END AS recibo, --Concat Recibo
                CASE  WHEN a.mgastosext > 0 THEN a.mgastosext  WHEN a.motrosgasext > 0 THEN  a.motrosgasext else 0 end as gastosext, --gastos EXT
                CASE  WHEN a.mgastos > 0 THEN a.mgastos WHEN a.motrosgas > 0 THEN a.motrosgas else 0 end as gastos --gastos BS
            FROM
            adrecibos AS A inner JOIN
            maproduc AS P ON A.cproductor = P.cproductor
            LEFT JOIN adctacli as b on a.ctenedor = b.ctenedor
            LEFT JOIN maclient AS C1 ON A.ctenedor = C1.cci_rif
            LEFT JOIN maclient AS C2 ON A.casegurado = C2.cci_rif
            LEFT JOIN maclient AS C3 ON p.cci_rif = C3.cci_rif
            LEFT JOIN maramos as F on a.cramo = f.cramo
            inner join adpoliza d on a.cpoliza = d.cpoliza and a.fanopol = d.fanopol and a.fmespol = d.fmespol
            where iestadorec in(@iestadorec) and a.fdesde >= '2025-07-01' and (trim(c1.cid)  = trim(@cci_rif) or trim(c2.cid) = trim(@cci_rif) or trim(c3.cid)  = trim(@cci_rif)) and d.istatpol in ('V','0')
            ORDER by a.fhasta ASC
        END
    END
END

