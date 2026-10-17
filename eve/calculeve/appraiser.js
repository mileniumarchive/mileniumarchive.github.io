/* ==========================================================================
   appraiser.js — janela Loot Appraiser: cola a lista de itens (como o jogo copia: nome, tab, quantidade)
   e diz, item a item, qual das quatro rotas rende mais:
     E  vender direto no buy da estrutura de mercado            (ciano, .rota-e)
     J  mandar pra Jita e vender direto no buy de lá            (rosa,  .rota-j)
     RE reprocessar na estrutura de refino e vender no buy da estrutura de mercado (verde, .rota-re)
     RJ mandar pra Jita, reprocessar lá e vender no buy de Jita (pêssego, .rota-rj)
   Tudo por buy order: só sales tax, sem broker (Mercado.salesTax).
   ========================================================================== */
(function(){
  "use strict";
  var el = CV.el, isk = Mercado.isk, fmtInt = CV.fmt.int;
  var JITA = 60003760;                                 // Jita IV - Moon 4 (mesma estação do Mercado.jita)
  var ROTAS = [["E", "Estrutura", "rota-e"], ["J", "Jita", "rota-j"],
               ["RE", "Refino na estrutura", "rota-re"], ["RJ", "Refino em Jita", "rota-rj"]];

  var SEL = CV.seletores("lap", { char: "calculeve.lap.char", merc: "calculeve.lap.mercado",
                                  refino: "calculeve.lap.refino", frete: "calculeve.lap.frete" },
                         function(){ avalia(false); });
  var wLap = document.getElementById("w-lap"), txt = document.getElementById("lap-txt"),
      body = document.getElementById("lap-body"), aviso = document.getElementById("lap-aviso"),
      ts = document.getElementById("lap-ts");
  wLap.addEventListener("fechou", SEL.fecha);

  /* ---------------- colagem: "nome<TAB>qtd<TAB>…" por linha; sem qtd = 1; nome repetido soma ---------------- */
  function le(texto){
    var m = new Map();
    texto.split(/\r?\n/).forEach(function(l){
      var c = l.split("\t"), nome = (c[0] || "").trim();
      if (!nome) return;
      var q = (c[1] || "").replace(/\D/g, "");
      m.set(nome, (m.get(nome) || 0) + (q ? Number(q) : 1));
    });
    return Array.from(m, function(x){ return { nome: x[0], qt: x[1] }; })
                .sort(function(a, b){ return a.nome.localeCompare(b.nome); });
  }

  /* ---------------- dados fixos, lidos uma vez ----------------
     receita de reprocesso (invTypeMaterials, por lote = portionSize do invTypes); do dogma, o bônus por nível
     da Scrapmetal Processing (refiningYieldMutator) e o rendimento base do serviço de reprocesso das estruturas
     (refiningYieldMultiplier do Standup Reprocessing Facility I); da ESI, o rendimento e a taxa base de Jita 4-4
     (reprocessing_efficiency e reprocessing_stations_take de /universe/stations/{id}/) */
  var fixosP = null;
  function fixos(){
    if (!fixosP) fixosP = Promise.all([CV.tipos(),
      CV.sde("invTypeMaterials.csv", ["typeID", "materialTypeID", "quantity"]),
      CV.sde("dgmAttributeTypes.csv", ["attributeID", "attributeName"]),
      CV.sde("dgmTypeAttributes.csv", ["typeID", "attributeID", "valueInt", "valueFloat"]),
      CV.esi("/universe/stations/" + JITA + "/")]).then(function(r){
        var T = r[0], porNome = new Map(), receita = new Map();
        T.forEach(function(t, id){ if (!porNome.has(t.name) || t.pub) porNome.set(t.name, id); });
        r[1].forEach(function(x){
          var t = Number(x[0]);
          if (!receita.has(t)) receita.set(t, []);
          receita.get(t).push({ t: Number(x[1]), q: Number(x[2]) });
        });
        var attr = {}; r[2].forEach(function(a){ attr[a[1]] = a[0]; });
        var scrap = porNome.get("Scrapmetal Processing"), facil = porNome.get("Standup Reprocessing Facility I");
        var mut = null, baseEstr = null;
        r[3].forEach(function(x){
          var v = Number(x[3] !== "" ? x[3] : x[2]);
          if (Number(x[0]) === scrap && x[1] === attr.refiningYieldMutator) mut = v;
          if (Number(x[0]) === facil && x[1] === attr.refiningYieldMultiplier) baseEstr = v;
        });
        if (mut == null || baseEstr == null) throw new Error("rendimento de reprocesso não achado no dogma do SDE");
        var st = r[4].json;
        return { T: T, porNome: porNome, receita: receita, scrap: scrap, mut: mut, baseEstr: baseEstr,
                 baseJita: st.reprocessing_efficiency, taxaJita: st.reprocessing_stations_take };
      }).catch(function(e){ fixosP = null; throw e; });
    return fixosP;
  }

  /* ---------------- conta ---------------- */
  /* valor de uma rota, para a quantidade inteira; null = rota impossível (sem preço, sem receita, sem estrutura) */
  function rotas(F, c, it){
    var t = it.t, info = F.T.get(t), qt = it.qt, s = c.sales;
    var bE = c.px ? (c.px.p[t] || [null, null])[1] : null, bJ = (c.jita.p[t] || [null, null])[1];
    var vol = c.vol[t] || 0, frete = Mercado.frete(c.frete, bJ || 0, vol);
    var v = {};
    v.E = bE == null ? null : qt * bE * (1 - s);
    v.J = bJ == null ? null : qt * (bJ * (1 - s) - frete);

    var rec = F.receita.get(t), lote = info.lote || 1, lotes = Math.floor(qt / lote), sobra = qt - lotes * lote;
    function refinado(rend, taxa, preco){              // minerais de `lotes` lotes × rendimento × (1 − taxa), no buy
      var tot = 0, algum = false;
      rec.forEach(function(m){
        var p = preco(m.t);
        if (p == null) return;
        algum = true; tot += m.q * lotes * rend * (1 - taxa) * p * (1 - s);
      });
      return algum ? tot : null;
    }
    if (rec && lotes > 0){
      if (c.refino && c.px){
        var r = refinado(c.rendE, c.taxaE, function(m){ return (c.px.p[m] || [null, null])[1]; });
        v.RE = r == null ? null : r + sobra * (bE || 0) * (1 - s);
      }
      var j = refinado(c.rendJ, F.taxaJita, function(m){ return (c.jita.p[m] || [null, null])[1]; });
      v.RJ = j == null ? null : j - qt * frete + sobra * (bJ || 0) * (1 - s);
    } else {
      /* não refina (sem receita, ou menos de um lote): nas rotas de refino vai inteiro, vendido no buy do mesmo lugar */
      v.inteiro = true; v.RE = v.E; v.RJ = v.J;
    }
    var melhor = null;
    ROTAS.forEach(function(rt){ var x = v[rt[0]]; if (x != null && (melhor == null || x > v[melhor])) melhor = rt[0]; });
    v.melhor = melhor;
    return v;
  }

  /* ---------------- render ---------------- */
  var CLS = {}, NOME = {};
  ROTAS.forEach(function(r){ CLS[r[0]] = r[2]; NOME[r[0]] = r[1]; });
  /* ordenação da tabela: "nome" (alfabética, a padrão) ou do maior para o menor por "qt" ou por uma rota;
     vale até trocar, inclusive entre avaliações */
  var ordem = "nome", linhas = [];
  function ordena(){
    function val(l){ return ordem === "qt" ? l.it.qt : l.v ? l.v[ordem] : null; }
    return linhas.slice().sort(function(a, b){
      if (ordem === "nome") return a.it.nome.localeCompare(b.it.nome);
      var x = val(a), y = val(b);
      if (x == null || y == null) return (x == null) - (y == null) || a.it.nome.localeCompare(b.it.nome);
      return y - x || a.it.nome.localeCompare(b.it.nome);
    });
  }

  function desenha(F, c, itens){
    zera();
    linhas = itens.map(function(it){ var v = it.t == null ? null : rotas(F, c, it); if (v) soma(tot, v); return { it: it, v: v }; });
    tabela();
  }

  /* cabeçalho: Item, Qtd e as quatro rotas são botões de ordenar (Melhor não) */
  function tabela(){
    body.innerHTML = "";
    var tab = el("table", "as"), hr = el("tr");
    [["nome", "Item"], ["qt", "Qtd", "n"]].concat(ROTAS.map(function(r){ return [r[0], r[1], "n"]; })).concat([[null, "Melhor"]])
      .forEach(function(h){
        var c = el("th", h[2] || null);
        if (h[0] == null) c.textContent = h[1];
        else {
          var b = el("button", "ordena", h[1]);
          b.title = h[0] === "nome" ? "Ordem alfabética" : "Do maior para o menor";
          b.setAttribute("aria-pressed", String(ordem === h[0]));
          b.addEventListener("click", function(){ ordem = h[0]; tabela(); });
          c.appendChild(b);
        }
        hr.appendChild(c);
      });
    var th = el("thead"); th.appendChild(hr); tab.appendChild(th);
    var tb = el("tbody");
    ordena().forEach(function(l){
      var it = l.it, v = l.v, tr = el("tr"), td = el("td");
      if (it.t != null) td.appendChild(CV.iconeTipo(it.t, "icon"));
      td.appendChild(document.createTextNode(it.nome));
      tr.append(td, el("td", "n", fmtInt.format(it.qt)));
      if (!v){
        var nf = el("td", "cinza", "não encontrado no SDE"); nf.colSpan = ROTAS.length + 1; tr.appendChild(nf);
        tb.appendChild(tr); return;
      }
      ROTAS.forEach(function(r){
        var x = v[r[0]], refino = r[0] === "RE" || r[0] === "RJ";
        var td = el("td", "n" + (x == null ? " cinza" : " " + r[2] + (v.melhor === r[0] ? " melhor" : "")) +
                          (v.inteiro && refino ? " inteiro" : ""), x == null ? "—" : isk(x));
        if (v.inteiro && refino) td.title = "Não refina: item inteiro, vendido no buy do mesmo lugar";
        tr.appendChild(td);
      });
      tr.appendChild(v.melhor ? el("td", CLS[v.melhor] + " melhor", NOME[v.melhor]) : el("td", "cinza", "sem preço"));
      tb.appendChild(tr);
    });
    tab.appendChild(tb); body.appendChild(tab);
    veredito(tot);
  }

  /* veredito do lote: o lote inteiro por cada rota (item que não refina já vem inteiro nas rotas de refino, ver
     `rotas`); rota sem preço conta 0 */
  var tot;
  function zera(){ tot = { E: 0, J: 0, RE: 0, RJ: 0 }; }
  function soma(t, v){ ROTAS.forEach(function(r){ t[r[0]] += v[r[0]] || 0; }); }
  function veredito(t){
    body.appendChild(el("h4", null, "Veredito do lote"));
    var melhor = ROTAS.reduce(function(m, r){ return m == null || t[r[0]] > t[m] ? r[0] : m; }, null);
    var tab = el("table", "as grade"), tb = el("tbody"), rot = el("tr", "rot"), val = el("tr"), dif = el("tr");
    ROTAS.forEach(function(r){
      rot.appendChild(el("th", "c " + r[2], r[1]));
      val.appendChild(el("td", "c " + r[2] + (r[0] === melhor ? " melhor" : ""), isk(t[r[0]])));
      dif.appendChild(r[0] === melhor ? el("td", "c constroi melhor", "V") : el("td", "c neg", isk(t[r[0]] - t[melhor])));
    });
    tb.append(rot, val, dif); tab.appendChild(tb); body.appendChild(tab);
    body.appendChild(el("p", "nota", "Nas rotas de refino, item que não refina (sem receita de reprocesso, ou menos de um " +
      "lote) entra inteiro, vendido no buy do mesmo lugar. Misturar itens que refinam com itens que não refinam pode " +
      "deixar o appraisal de refino impreciso."));
    ultimo.tot = t; ultimo.melhor = melhor;
  }

  /* ---------------- carga ---------------- */
  var geracao = 0, ultimo = null;
  async function avalia(forca){
    var g = ++geracao, itensTxt = le(txt.value);
    aviso.textContent = ""; ts.textContent = ""; ultimo = null;
    if (!itensTxt.length){ CV.status(body, "Cole os itens acima."); return; }
    CV.status(body, "Carregando…");
    try {
      var F = await fixos();
      var itens = itensTxt.map(function(x){ return { nome: x.nome, qt: x.qt, t: F.porNome.has(x.nome) ? F.porNome.get(x.nome) : null }; });
      var char = SEL.escolhido("char"), merc = SEL.escolhido("merc"), refino = SEL.escolhido("refino");
      var niveis = await CV.niveis(char), lvl = F.scrap != null ? (niveis.get(F.scrap) || 0) : 0;
      var c = { frete: (SEL.escolhido("frete") || {}).f || null, refino: refino,
                sales: (await Mercado.salesTax(niveis)).sales,
                rendE: F.baseEstr * (1 + F.mut / 100 * lvl), rendJ: F.baseJita * (1 + F.mut / 100 * lvl),
                taxaE: refino && refino.bonus && refino.bonus.taxaRefino != null ? Number(refino.bonus.taxaRefino) / 100 : 0 };
      var avisos = [];
      if (!char) avisos.push("sem personagem: skills no 0");
      if (!merc) avisos.push("sem mercado: rotas da estrutura ficam de fora");
      if (!refino) avisos.push("sem refino: Refino na estrutura fica de fora");
      else if (!refino.bonus || refino.bonus.taxaRefino == null) avisos.push("taxa de refino de " + refino.name + " não cadastrada: conta 0");
      if (!c.frete) avisos.push("sem freighter service: frete 0");

      var ids = new Set();
      itens.forEach(function(it){
        if (it.t == null) return;
        ids.add(it.t);
        (F.receita.get(it.t) || []).forEach(function(m){ ids.add(m.t); });
      });
      ids = Array.from(ids);
      var r = await Promise.all([merc ? (forca ? Mercado.atualiza(merc) : Mercado.precos(merc)) : Promise.resolve(null),
                                 Mercado.jita(ids, forca),
                                 Mercado.volumes(itens.filter(function(it){ return it.t != null; }).map(function(it){ return it.t; }))]);
      if (g !== geracao) return;
      c.px = r[0]; c.jita = r[1]; c.vol = r[2];
      var quando = merc ? Math.min(c.px.ts, c.jita.ts) : c.jita.ts, pct = CV.fmt.pct;
      ts.textContent = "Preços: " + CV.dataHora(quando) + " · " +
                       (c.rendE === c.rendJ ? pct.format(c.rendE * 100) + "%"
                                            : pct.format(c.rendE * 100) + "% estrutura / " + pct.format(c.rendJ * 100) + "% Jita") +
                       " · Scrapmetal Processing (" + lvl + ")";
      ultimo = { c: c, F: F, lvl: lvl };
      aviso.textContent = avisos.join(" · ");
      desenha(F, c, itens);
    } catch(e){
      console.error(e);
      if (g === geracao) CV.status(body, "Erro: " + e.message);
    }
  }

  /* Números para Nerds: os parâmetros da conta e o lote por rota */
  document.getElementById("lap-nerd").addEventListener("click", function(){
    if (!ultimo || !ultimo.tot){ Nerds.abre("Loot Appraiser", null); return; }
    var c = ultimo.c, pct = function(x){ return CV.fmt.pct.format(x * 100) + "%"; };
    Nerds.abre("Loot Appraiser", [
      [["sales tax", pct(c.sales)], ["Scrapmetal Processing", String(ultimo.lvl)],
       ["Rendimento de refino (estrutura)", pct(c.rendE)], ["Rendimento de refino (Jita)", pct(c.rendJ)],
       ["Taxa de refino (estrutura)", c.refino ? pct(c.taxaE) : "sem refino escolhido"],
       ["Taxa de refino (Jita)", pct(ultimo.F.taxaJita)],
       ["frete por unidade", c.frete ? c.frete.nome : "sem freighter service"]],
      ROTAS.map(function(r){ return ["Lote — " + r[1], ultimo.tot[r[0]]]; })
    ]);
  });
  document.getElementById("lap-ok").addEventListener("click", function(){ avalia(false); });
  document.getElementById("lap-precos").addEventListener("click", function(){ avalia(true); });
  document.getElementById("ic-lap").addEventListener("click", function(){ WIN.open("w-lap"); SEL.desenha(); txt.focus(); });
})();
