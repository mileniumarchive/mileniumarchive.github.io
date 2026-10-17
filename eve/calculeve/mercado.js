/* ==========================================================================
   mercado.js — preços de estrutura de mercado e taxas de compra/venda (Mercado).
   Parte comum da Calculeve: toda janela que compra, vende ou compara preço usa daqui.
   Regras de taxa: §4 do DOC_planilha.
   ========================================================================== */
var Mercado = (function(){
  "use strict";
  var SALES_TAX_BASE = 7.5;          // % sobre a venda
  var ACCOUNTING_POR_NIVEL = 11;     // % de redução da sales tax por nível de Accounting
  var BROKER_SCC = 0.5;              // % fixo da SCC em estrutura Upwell (+ o % do dono, cadastrado)

  function chave(id){ return "calculeve.mercado." + id; }

  /* valor em ISK arredondado: 2 casas, com k (mil), m (milhão) e bi (bilhão) */
  var ESCALAS = [[1e9, " bi"], [1e6, " m"], [1e3, " k"]];
  function isk(v){
    var a = Math.abs(v);
    for (var i = 0; i < ESCALAS.length; i++) if (a >= ESCALAS[i][0]) return CV.fmt.n2.format(v / ESCALAS[i][0]) + ESCALAS[i][1];
    return CV.fmt.n2.format(v);
  }
  function iskOuNaoTem(v){ return v == null ? "NÃO TEM" : isk(v); }

  /* /markets/prices/ da ESI (average_price e adjusted_price de todo tipo), baixado uma vez por carga da página */
  var precosEsiP = null;
  function precosEsi(){
    if (!precosEsiP) precosEsiP = CV.esiPaginado("/markets/prices/").catch(function(e){ precosEsiP = null; throw e; });
    return precosEsiP;
  }

  /* preços salvos da estrutura: { ts, p: { typeID: [menor sell, maior buy] } } (null = sem ordem) */
  function salvos(estr){ return CV.lsGet(chave(estr.id), null); }

  /* baixa /markets/structures/{id}/ (todas as páginas) com o primeiro char que tiver acesso,
     reduz a menor sell e a maior buy por tipo e salva no navegador */
  async function atualiza(estr){
    var ordens = null, ultimo = null;
    for (var c of SSO.chars()){
      try { ordens = await CV.esiPaginado("/markets/structures/" + estr.id + "/", await SSO.token(c.id)); break; }
      catch(e){ ultimo = e; }
    }
    if (!ordens) throw ultimo || new Error("nenhum personagem");
    var p = {};
    ordens.forEach(function(o){
      var x = p[o.type_id] || (p[o.type_id] = [null, null]);
      if (o.is_buy_order){ if (x[1] == null || o.price > x[1]) x[1] = o.price; }
      else if (x[0] == null || o.price < x[0]) x[0] = o.price;
    });
    var s = { ts: Date.now(), p: p };
    CV.lsSet(chave(estr.id), s);
    return s;
  }

  /* salvos, ou baixa se ainda não houver */
  async function precos(estr){ return salvos(estr) || atualiza(estr); }

  /* ---------- Jita IV - Moon 4 (estação NPC): preços por tipo, das ordens da região filtradas pela estação ---------- */
  var JITA = 60003760;               // Jita IV - Moon 4 - Caldari Navy Assembly Plant (§2 do DOC_planilha)
  var CHAVE_JITA = "calculeve.mercado.jita";
  var regiaoP = null;
  /* região de um sistema: sistema → constelação → região (cacheada no navegador) */
  async function regiaoDoSistema(sis){
    var c = await CV.cacheado("calculeve.cache.regiaosis", [sis], async function(id){
      var sy = (await CV.esi("/universe/systems/" + id + "/")).json;
      return (await CV.esi("/universe/constellations/" + sy.constellation_id + "/")).json.region_id;
    });
    if (!c[sis]) throw new Error("região do sistema " + sis + " não resolvida");
    return c[sis];
  }
  /* região da estação: estação → sistema → região */
  function regiaoJita(){
    if (!regiaoP) regiaoP = CV.cacheado("calculeve.cache.regiao", [JITA], async function(id){
      return regiaoDoSistema((await CV.esi("/universe/stations/" + id + "/")).json.system_id);
    }).then(function(c){ if (!c[JITA]){ regiaoP = null; throw new Error("região de Jita não resolvida"); } return c[JITA]; });
    return regiaoP;
  }
  /* { ts, p: { typeID: [menor sell, maior buy] } } de Jita 4-4 para os `ids`: baixa só os que faltam no salvo
     (todos, com `forca`), por /markets/{região}/orders/?type_id=, e salva no navegador */
  async function jita(ids, forca){
    var s = forca ? { ts: 0, p: {} } : CV.lsGet(CHAVE_JITA, null) || { ts: 0, p: {} };   // atualizar descarta o que ficou salvo
    var falta = ids.filter(function(id){ return !(id in s.p); });
    if (falta.length){
      var reg = await regiaoJita();
      await CV.limite(falta, 6, async function(id){
        var ordens = await CV.esiPaginado("/markets/" + reg + "/orders/?order_type=all&type_id=" + id);
        var x = [null, null];
        ordens.forEach(function(o){
          if (o.location_id !== JITA) return;
          if (o.is_buy_order){ if (x[1] == null || o.price > x[1]) x[1] = o.price; }
          else if (x[0] == null || o.price < x[0]) x[0] = o.price;
        });
        s.p[id] = x;
      });
      s.ts = Date.now();
      CV.lsSet(CHAVE_JITA, s);
    }
    return s;
  }

  /* ---------- histórico da região (/markets/{região}/history/): últimos 30 dias, por tipo ----------
     { ts, p: { typeID: [preço médio ponderado pelo volume, unidades por dia] } }. A ESI atualiza o histórico
     uma vez por dia; o salvo com mais de 24 h é baixado de novo. Dia sem negociação conta como zero unidades. */
  var DIAS_HIST = 30, DIA_MS = 864e5;
  async function historico(regiao, ids, forca){
    var chv = "calculeve.mercado.hist." + regiao, s = CV.lsGet(chv, null);
    if (!s || forca || Date.now() - s.ts > DIA_MS) s = { ts: Date.now(), p: {} };
    var falta = ids.filter(function(id){ return !(id in s.p); });
    if (falta.length){
      var corte = new Date(Date.now() - DIAS_HIST * DIA_MS).toISOString().slice(0, 10);
      await CV.limite(falta, 6, async function(id){
        var dias;
        try { dias = (await CV.esi("/markets/" + regiao + "/history/?type_id=" + id)).json; }
        catch(e){ if (e.status === 404) dias = []; else throw e; }
        var vol = 0, isk = 0;
        dias.forEach(function(d){ if (d.date > corte){ vol += d.volume; isk += d.average * d.volume; } });
        s.p[id] = [vol ? isk / vol : null, vol / DIAS_HIST];
      });
      CV.lsSet(chv, s);
    }
    return s;
  }

  /* volume embalado (m³) por tipo, da ESI /universe/types/{id}/ (packaged_volume), cacheado */
  function volumes(ids){
    return CV.cacheado("calculeve.cache.volumes", ids, async function(id){
      var j = (await CV.esi("/universe/types/" + id + "/")).json;
      return j.packaged_volume != null ? j.packaged_volume : j.volume;
    });
  }

  /* frete por unidade de um freighter service (§4 do DOC_planilha): MAX(ISK/m³ × volume ; % do colateral × preço).
     O frete mínimo por contrato é pago à parte e não entra aqui. Sem serviço: 0. */
  function frete(servico, preco, vol){
    if (!servico) return 0;
    return Math.max((Number(servico.iskM3) || 0) * vol, (Number(servico.pctColat) || 0) / 100 * preco);
  }

  /* buyback (calculeve.buybacks) para um tipo: % do Jita buy menos a taxa adicional da exceção do item ou, se o
     item não tem, a do grupo dele. { pct, un }; un = null sem Jita buy. */
  function buyback(bb, tipo, grupo, jitaBuy){
    var exc = bb.exc || [], x = exc.filter(function(e){ return e.tipo === "i" && e.id === tipo; })[0] ||
                                exc.filter(function(e){ return e.tipo === "g" && e.id === grupo; })[0];
    var pct = (Number(bb.pct) || 0) - (x ? Number(x.taxa) || 0 : 0);
    return { pct: pct, un: jitaBuy == null ? null : jitaBuy * pct / 100 };
  }

  /* taxas em fração: sales = 7,5% × (1 − 11% × Accounting) · broker = 0,5% SCC + % do dono.
     `niveis` = Map skill_id -> nível (CV.skills). null se a estrutura não tem o broker do dono cadastrado. */
  async function taxas(estr, niveis){
    if (!estr.taxas || estr.taxas.brokerDono == null) return null;
    var s = await salesTax(niveis);
    return { sales: s.sales, broker: (BROKER_SCC + Number(estr.taxas.brokerDono)) / 100, accounting: s.accounting };
  }
  /* só a sales tax, em fração (venda direto em buy order não paga broker): { sales, accounting } */
  async function salesTax(niveis){
    var T = await CV.tipos(), acc = 0;
    T.forEach(function(t, id){ if (t.name === "Accounting") acc = niveis.get(id) || 0; });
    return { sales: SALES_TAX_BASE / 100 * (1 - ACCOUNTING_POR_NIVEL / 100 * acc), accounting: acc };
  }

  /* por unidade; null = sem ordem daquele lado */
  /* vender: sell order na menor sell (paga broker + sales tax) · direto na maior buy (só sales tax) */
  function venda(par, tx){
    par = par || [null, null];
    return { sell: par[0] == null ? null : par[0] * (1 - tx.broker - tx.sales),
             buy:  par[1] == null ? null : par[1] * (1 - tx.sales) };
  }
  /* comprar: direto da menor sell (sem taxa) · buy order na maior buy (paga broker) */
  function compra(par, tx){
    par = par || [null, null];
    return { sell: par[0],
             buy:  par[1] == null ? null : par[1] * (1 + tx.broker) };
  }

  return { isk: isk, iskOuNaoTem: iskOuNaoTem, precosEsi: precosEsi, jita: jita, regiaoDoSistema: regiaoDoSistema, historico: historico, volumes: volumes, frete: frete, buyback: buyback, salvos: salvos, atualiza: atualiza, precos: precos, taxas: taxas, salesTax: salesTax, venda: venda, compra: compra };
})();
