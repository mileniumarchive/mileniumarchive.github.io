/* ---------- Fuel Blocks: blueprints de fuel block e isótopos, do estoque salvo do Tudão ---------- */
(function(){
  "use strict";
  var el = CV.el;
  var GRUPO_FUEL = 1136;                // groupID "Fuel Block" no invTypes
  var GRUPO_GELO = 423;                 // groupID "Ice Product": bloco Gelo; o resto da receita é PI
  var FABRICACAO = CV.ATIV.FAB;
  var ME_SEM_BP = 10;                   // ME usado quando o isótopo não tem blueprint no estoque
  var ISOTOPOS = ["Helium Isotopes", "Hydrogen Isotopes", "Nitrogen Isotopes", "Oxygen Isotopes"];
  var fmtInt = CV.fmt.int, hms = CV.hms, isk = Mercado.iskOuNaoTem;

  /* ---------------- escolhas: char que fabrica, mercado, fábrica e freighter service ----------------
     Componente comum (CV.seletores): cada escolha fica salva no navegador. */
  var SEL = CV.seletores("fuel", { char: "calculeve.fuel.char", merc: "calculeve.fuel.mercado",
                                   fab: "calculeve.fuel.fabrica", frete: "calculeve.fuel.frete" });
  document.getElementById("w-fuel").addEventListener("fechou", SEL.fecha);

  var grid = document.getElementById("fuel-grid"), iso = document.getElementById("fuel-iso"),
      nota = document.getElementById("fuel-nota");
  var mTitulo = document.getElementById("fmat-title"), mBp = document.getElementById("fmat-bp"),
      mRuns = document.getElementById("fmat-runs"), mAviso = document.getElementById("fmat-aviso"),
      mBody = document.getElementById("fmat-body"), mMax = document.getElementById("fmat-max"),
      mZerar = document.getElementById("fmat-zerar"), mTempo = document.getElementById("fmat-tempo"),
      mPrecosTs = document.getElementById("fmat-precos-ts"), mPrecosBtn = document.getElementById("fmat-precos-btn"),
      mNerdBtn = document.getElementById("fmat-nerd-btn");
  var ultimo = null;         // números da última conta da janela de materiais, para o Números para Nerds

  /* bônus da fábrica escolhida (fabricação), como multiplicadores:
     mult (material) = (1 − ME estrutura) × (1 − ME rig) · te (tempo) = (1 − TE estrutura) × (1 − TE rig).
     Sem fábrica escolhida: estrutura sem bônus nenhum (1 e 1). */
  function bonusEstrutura(){
    var f = SEL.escolhido("fab");
    if (!f) return { mult: 1, te: 1 };
    var b = f.bonus || {};
    function p(k){ return (Number(b[k]) || 0) / 100; }
    return { mult: (1 - p("meEstr")) * (1 - p("meRigFab")), te: (1 - p("teEstrFab")) * (1 - p("teRigFab")) };
  }



  /* tempo base por run (s) de fabricação, do índice comum do SDE: .get(typeID da blueprint) -> segundos */
  function tempos(){
    return CV.industria().then(function(I){ return { get: function(bp){ return I.tempo.get(I.k(FABRICACAO, bp)); } }; });
  }

  /* bônus de tempo por nível das skills de fabricação (CV.bonusSkill): [{ skill: typeID, nome, pct }] */
  function bonusSkill(){
    return CV.bonusSkill().then(function(l){ return l.filter(function(b){ return b.act === FABRICACAO; }); });
  }

  /* typeID da blueprint de fuel block -> [{ t: material, q: qtd base (ME 0) por run }], do índice comum do SDE.
     PRODUTO (preenchido junto): typeID da blueprint -> { t: fuel block, q: unidades por run } */
  var receitasP = null, PRODUTO = new Map();
  function receitas(){
    if (!receitasP) receitasP = CV.industria().then(function(I){
      var m = new Map();
      I.produto.forEach(function(p, k){
        var par = k.split("|"), prod = I.T.get(p.t);
        if (par[0] !== FABRICACAO || !prod || prod.group !== GRUPO_FUEL) return;
        m.set(Number(par[1]), I.mat.get(k) || []);
        PRODUTO.set(Number(par[1]), p);
      });
      return m;
    });
    return receitasP;
  }

  /* ---------------- janela de materiais ---------------- */
  var atual = null;          // { bpTipo, me, te, nomeBp, T, R, E }

  /* mesma conta da planilha: MAX(runs; ROUNDUP(runs × base × (1−ME) × bônus da estrutura)) */
  function necessario(m, runs, mult){
    return Math.max(runs, Math.ceil(runs * m.q * (1 - atual.me / 100) * mult));
  }

  /* runs que um material sozinho aguenta, pela mesma conta do Necessário:
     parte de ROUNDDOWN(estoque ÷ (base × (1−ME) × bônus)) e desce 1 run enquanto o saldo dele for negativo */
  function runsDoMaterial(m, mult){
    var tem = (atual.E.get(m.t) || { qt: 0 }).qt;
    var n = Math.floor(tem / (m.q * (1 - atual.me / 100) * mult));
    while (n > 0 && necessario(m, n, mult) > tem) n--;
    return n;
  }

  /* Max estoque: o material que aguenta menos runs manda (saldo ≥ 0 em todos).
     Zerar estoque: o que aguenta mais runs manda (os outros mostram, no saldo, o que falta comprar). */
  function porEstoque(escolhe){
    if (!atual) return;
    var bonus = bonusEstrutura(), rec = atual.R.get(atual.bpTipo) || [];
    if (!rec.length) return;
    var mult = bonus.mult;
    mRuns.value = escolhe.apply(null, rec.map(function(m){ return runsDoMaterial(m, mult); }));
    desenhaMateriais();
  }

  function tabela(titulo, linhas, T, E, runs, mult){
    mBody.appendChild(el("h4", null, titulo));
    var tab = el("table", "as"), hr = el("tr");
    [["Item"], ["Necessário", "n"], ["Estoque", "n"], ["Saldo", "n"], ["Preço (UnMerc)", "n"],
     ["CustoMerc", "n rota-e"], ["CustoJita", "n rota-j"]].forEach(function(c){ hr.appendChild(el("th", c[1] || null, c[0])); });
    var th = el("thead"); th.appendChild(hr); tab.appendChild(th);
    var tb = el("tbody");
    linhas.forEach(function(m){
      var nec = necessario(m, runs, mult);
      var tem = (E.get(m.t) || { qt: 0 }).qt;
      var tr = el("tr"), td = el("td");
      td.appendChild(CV.iconeTipo(m.t, "icon")); td.appendChild(document.createTextNode((T.get(m.t) || {}).name || String(m.t)));
      tr.appendChild(td);
      tr.appendChild(el("td", "n", fmtInt.format(nec)));
      tr.appendChild(el("td", "n", fmtInt.format(tem)));
      var saldo = tem - nec;
      tr.appendChild(el("td", "n" + CV.sinal(saldo), fmtInt.format(saldo)));
      tr.appendChild(celPreco("compra", m.t));
      tr.appendChild(celCusto(m.t, saldo));
      tr.appendChild(celJita(m.t, saldo));
      tb.appendChild(tr);
    });
    tab.appendChild(tb); mBody.appendChild(tab);
  }

  function desenhaMateriais(){
    if (!atual) return;
    ultimo = null;
    var runs = Math.floor(Number(mRuns.value));
    mBody.innerHTML = "";
    if (!(runs >= 1)){ CV.status(mBody, "Runs precisa ser um inteiro maior que zero."); return; }
    var est = bonusEstrutura(), T = atual.T;
    mBp.textContent = "ME: " + atual.me + " / TE: " + atual.te;
    desenhaTempo(runs, est);
    var rec = (atual.R.get(atual.bpTipo) || []).slice().sort(function(a, b){
      return ((T.get(a.t) || {}).name || "").localeCompare((T.get(b.t) || {}).name || "");
    });
    function gelo(m){ return (T.get(m.t) || {}).group === GRUPO_GELO; }
    tabela("PIs", rec.filter(function(m){ return !gelo(m); }), T, atual.E, runs, est.mult);
    tabela("Gelo", rec.filter(gelo), T, atual.E, runs, est.mult);
    var total = totalCompra(rec, runs, est.mult);
    linhaTotal(total);
    resultado(T, runs, total, { buy: vendaInsumos(rec, runs, est.mult, "buy"), sell: vendaInsumos(rec, runs, est.mult, "sell") });
  }

  /* Resultado: o fuel block produzido = runs × unidades por run (industryActivityProducts).
     A quantidade ocupa as três colunas de número dos blocos de cima. */
  /* Total: soma do CustoMerc de todos os materiais (PIs e Gelo).
     Número; null se algum material que falta não tem sell order; texto se o preço ainda não está pronto. */
  function totalCompra(rec, runs, mult){
    var soma = 0;
    for (var i = 0; i < rec.length; i++){
      var m = rec[i], saldo = (atual.E.get(m.t) || { qt: 0 }).qt - necessario(m, runs, mult);
      var c = custoFalta(m.t, saldo);
      if (typeof c === "string" || c == null) return c;
      soma += c;
    }
    return soma;
  }
  /* valor de vender os insumos do job (Necessário de cada material), pelo lado de Mercado.venda:
     "buy" = direto na maior buy (líquido de sales tax) · "sell" = sell order na menor sell (líquido de broker e sales tax).
     Número; null se algum material não tem ordem daquele lado; texto se o preço não está pronto. */
  function vendaInsumos(rec, runs, mult, lado){
    var soma = 0;
    for (var i = 0; i < rec.length; i++){
      var v = precoUn("venda", rec[i].t);
      if (typeof v === "string") return v;
      if (v[lado] == null) return null;
      soma += necessario(rec[i], runs, mult) * v[lado];
    }
    return soma;
  }

  /* linha Total, com o valor na coluna do CustoMerc */
  function linhaTotal(total){
    var tab = el("table", "as"), tb = el("tbody"), tr = el("tr", "total"), td = el("td");
    td.appendChild(Nerds.rotulo("Total a comprar"));
    td.colSpan = 5;
    tr.append(td, el("td", "n", typeof total === "string" ? total : isk(total)), el("td"));
    tb.appendChild(tr); tab.appendChild(tb); mBody.appendChild(tab);
  }

  function resultado(T, runs, total, insumos){
    var p = PRODUTO.get(atual.bpTipo);
    if (!p) return;
    mBody.appendChild(el("h4", null, "Resultado"));
    var tab = el("table", "as"), hr = el("tr"), thq = el("th", "n", "Quantidade");
    thq.colSpan = 3;
    hr.append(el("th", null, "Item"), thq, el("th", "n", "Preço (UnMerc)"), el("th", "n", "Receita"), el("th"));
    var th = el("thead"); th.appendChild(hr); tab.appendChild(th);
    var tb = el("tbody"), tr = el("tr"), td = el("td"), tq = el("td", "n", fmtInt.format(runs * p.q));
    td.appendChild(CV.iconeTipo(p.t, "icon")); td.appendChild(document.createTextNode((T.get(p.t) || {}).name || String(p.t)));
    tq.colSpan = 3;
    tr.append(td, tq, celPreco("venda", p.t), celReceita(p.t, runs * p.q, total, insumos), el("td")); tb.appendChild(tr); tab.appendChild(tb); mBody.appendChild(tab);
  }

  /* tempo do job = base × runs × (1 − TE da BP) × Π(1 + bônus da skill × nível) × (1 − TE estrutura) × (1 − TE rig)
     bônus da skill por nível: SDE (bonusSkill) */
  function desenhaTempo(runs, est){
    mTempo.textContent = "";
    if (!(runs >= 1)) return;
    if (atual.skills instanceof Error){ mTempo.textContent = "Tempo: erro nas skills — " + atual.skills.message; return; }
    if (!atual.skills || atual.base == null || !atual.bSkill){ mTempo.textContent = "Tempo: carregando skills…"; return; }
    var mult = 1, niveis = [];
    atual.bSkill.forEach(function(b){
      var lv = atual.skills.get(b.skill) || 0;
      mult *= 1 + b.pct / 100 * lv;
      niveis.push(b.nome + " " + lv);
    });
    var seg = atual.base * runs * (1 - atual.te / 100) * mult * est.te;
    mTempo.textContent = "Tempo: " + hms(seg) + "  (" + niveis.join(" · ") + ")";
  }

  /* ---------------- preço (Mercado): 4ª coluna ----------------
     compra (materiais): menor sell direto · buy order na maior buy + broker
     venda (resultado):  sell order na menor sell − broker − sales tax · direto na maior buy − sales tax */
  /* preço por unidade {sell, buy} do lado pedido, ou o texto do que falta */
  function precoUn(lado, typeId){
    if (!atual.merc) return "SP";
    if (atual.px instanceof Error) return "erro nos preços";
    if (atual.tx === false) return "cadastre o broker do dono";
    if (!atual.px || !atual.tx) return "carregando…";
    return (lado === "compra" ? Mercado.compra : Mercado.venda)(atual.px.p[typeId], atual.tx);
  }
  /* célula de duas linhas [[rótulo, valor], …]; texto no lugar se `v` for string */
  function celDupla(v, linhas){
    var td = el("td", "n preco");
    if (typeof v === "string"){ td.textContent = v; return td; }
    linhas.forEach(function(l){
      var d = el("div"), r = Nerds.rotulo(l[0]); r.classList.add("lado"); d.appendChild(r);
      d.appendChild(document.createTextNode(isk(l[1]))); td.appendChild(d);
    });
    return td;
  }
  function celPreco(lado, typeId){
    var v = precoUn(lado, typeId);
    return celDupla(v, typeof v === "string" ? [] : [["Sell", v.sell], ["Buy", v.buy]]);
  }
  /* CustoMerc: o que falta (saldo negativo) comprado direto da menor sell */
  /* custo de comprar o que falta direto da menor sell: 0 sem falta, null sem sell order, texto se o preço não está pronto */
  function custoFalta(typeId, saldo){
    if (saldo >= 0) return 0;
    var v = precoUn("compra", typeId);
    if (typeof v === "string") return v;
    return v.sell == null ? null : -saldo * v.sell;
  }
  /* CustoJita: o que falta (saldo negativo) comprado direto da menor sell de Jita 4-4, mais o frete do
     freighter service escolhido por unidade (Mercado.frete; sem serviço, 0) */
  function celJita(typeId, saldo){
    if (saldo >= 0) return el("td", "n rota-j", "—");
    if (atual.jita instanceof Error) return el("td", "n rota-j", "erro em Jita");
    if (!atual.jita || !atual.vol) return el("td", "n rota-j", "carregando…");
    var sell = (atual.jita.p[typeId] || [null])[0];
    if (sell == null) return el("td", "n rota-j", "NÃO TEM");
    var f = SEL.escolhido("frete");
    return el("td", "n rota-j", isk(-saldo * (sell + Mercado.frete(f && f.f, sell, atual.vol[typeId] || 0))));
  }
  function celCusto(typeId, saldo){
    if (saldo >= 0) return el("td", "n rota-e", "—");
    var c = custoFalta(typeId, saldo);
    return el("td", "n rota-e", typeof c === "string" ? c : isk(c));
  }
  /* Receita: a qtd produzida vendida em sell order na menor sell, ou direto na maior buy (líquido de taxas) */
  /* Receita (sell e buy) e o delta de cada uma contra o Total a comprar */
  /* Receita (sell e buy); guarda também os deltas contra o Total a comprar para o Números para Nerds */
  function celReceita(typeId, qtd, total, insumos){
    var v = precoUn("venda", typeId);
    ultimo = null;
    if (typeof v === "string") return celDupla(v, []);
    var rs = v.sell == null ? null : qtd * v.sell, rb = v.buy == null ? null : qtd * v.buy;
    var ok = typeof total === "number";
    /* [nome da venda dos insumos, valor, nome do delta sell, nome do delta buy] */
    function grupoInsumos(nome, val, dS, dB){
      var okI = typeof val === "number";
      return [[nome, okI ? val : null],
              [dS, okI && rs != null ? rs - val : null],
              [dB, okI && rb != null ? rb - val : null]];
    }
    ultimo = { grupos: [
      [["DeltaSellMerc", ok && rs != null ? rs - total : null],
       ["DeltaBuyMerc",  ok && rb != null ? rb - total : null]],
      grupoInsumos("VendaInsumosBuyMerc", insumos.buy, "DeltaSellInsumos", "DeltaBuyInsumos"),
      grupoInsumos("VendaInsumosSellMerc", insumos.sell, "DeltaSellInsumosSell", "DeltaBuyInsumosSell")] };
    return celDupla(v, [["ReceitaSellMerc", rs], ["ReceitaBuyMerc", rb]]);
  }

  /* ---------------- Números para Nerds (nerds.js) ----------------
     grupo 1: DeltaSellMerc, DeltaBuyMerc · grupo 2: VendaInsumosBuyMerc, DeltaSellInsumos, DeltaBuyInsumos */
  mNerdBtn.addEventListener("click", function(){
    Nerds.abre(atual ? atual.nomeBp : "", ultimo && ultimo.grupos);
  });

  /* carrega preços (salvos ou baixados) e taxas do mercado escolhido; `forca` baixa de novo */
  /* preços de Jita e volumes dos materiais (CustoJita); `forca` baixa Jita de novo */
  function carregaJita(este, forca){
    este.jita = null; este.vol = null;
    var ids = (este.R.get(este.bpTipo) || []).map(function(m){ return m.t; });
    Promise.all([Mercado.jita(ids, forca), Mercado.volumes(ids)]).then(function(r){
      if (atual !== este) return;
      este.jita = r[0]; este.vol = r[1]; desenhaMateriais();
    }, function(e){
      console.error(e);
      if (atual !== este) return;
      este.jita = e; desenhaMateriais();
    });
  }

  function carregaMercado(este, forca){
    mPrecosTs.textContent = "";
    if (!este.merc) return;
    este.px = null; este.tx = null;
    var pP = forca ? Mercado.atualiza(este.merc) : Mercado.precos(este.merc);
    Promise.all([pP, CV.niveis(este.char).then(function(n){ return Mercado.taxas(este.merc, n); })]).then(function(r){
      if (atual !== este) return;
      este.px = r[0]; este.tx = r[1] || false;
      mPrecosTs.textContent = "Preços de " + este.merc.name + " — " + CV.dataHora(r[0].ts);
      desenhaMateriais();
    }, function(e){
      console.error(e);
      if (atual !== este) return;
      este.px = e; mPrecosTs.textContent = "Erro nos preços: " + e.message; desenhaMateriais();
    });
  }
  mPrecosBtn.addEventListener("click", function(){ if (atual){ carregaMercado(atual, true); carregaJita(atual, true); desenhaMateriais(); } });

  function abreMateriais(dados, aviso){
    atual = dados;
    atual.char = SEL.escolhido("char");
    atual.skills = null; atual.base = null; atual.bSkill = null;
    atual.merc = SEL.escolhido("merc");
    var este = atual;
    carregaMercado(este, false);
    carregaJita(este, false);
    Promise.all([tempos(), CV.niveis(atual.char), bonusSkill()]).then(function(r){
      if (atual !== este) return;
      este.base = r[0].get(este.bpTipo); este.skills = r[1]; este.bSkill = r[2]; desenhaMateriais();
    }, function(e){
      console.error(e);
      if (atual !== este) return;
      este.skills = e; desenhaMateriais();
    });
    mTitulo.textContent = dados.nomeBp;
    mAviso.textContent = aviso || "";
    WIN.open("w-fmat");
    desenhaMateriais();
  }
  mRuns.addEventListener("input", desenhaMateriais);
  mMax.addEventListener("click", function(){ porEstoque(Math.min); });
  mZerar.addEventListener("click", function(){ porEstoque(Math.max); });

  /* ---------------- janela Fuel Blocks ---------------- */
  async function desenha(){
    grid.innerHTML = ""; iso.innerHTML = ""; nota.textContent = "Carregando…";
    var snap = CV.tudao();
    if (!snap){ nota.textContent = "Sem estoque do Tudão salvo. Atualize o Tudão no Estoque."; return; }
    var T = await CV.tipos(), R = await receitas(), E = CV.estoquePorTipo(snap);
    function curto(t){ return ((T.get(t) || {}).name || String(t)).replace(/ Fuel Block Blueprint$/, ""); }
    var lista = CV.blueprints(snap, T, function(t){ return R.has(t); });
    nota.textContent = "Estoque do Tudão de " + CV.dataHora(snap.ts) + ".";

    // blueprints
    if (!lista.length) grid.appendChild(el("div", "vazio", "Nenhuma blueprint de fuel block."));
    lista.forEach(function(b){
      var ic = CV.cartaoBp(b, (T.get(b.t) || {}).name, curto(b.t));
      ic.addEventListener("click", function(){
        abreMateriais({ bpTipo: b.t, me: b.me, te: b.te, nomeBp: (T.get(b.t) || {}).name + (b.copia ? " (BPC)" : ""), T: T, R: R, E: E });
      });
      grid.appendChild(ic);
    });

    // isótopos: a blueprint é a de fuel block que consome o isótopo; usa a de maior ME do estoque
    var porNome = new Map(); T.forEach(function(t, id){ if (ISOTOPOS.indexOf(t.name) >= 0) porNome.set(t.name, id); });
    ISOTOPOS.map(function(n){ return porNome.get(n); }).filter(function(id){ return id != null; }).forEach(function(id){
      var x = E.get(id) || { qt: 0, locais: new Set() };
      var ic = CV.cartao(id, "icon", T.get(id).name.replace(/ Isotopes$/, ""),
                         "QT: " + fmtInt.format(x.qt) + " / Locais: " + x.locais.size, T.get(id).name);
      ic.addEventListener("click", function(){
        var bpTipo = null;
        R.forEach(function(rec, bp){ if (rec.some(function(m){ return m.t === id; })) bpTipo = bp; });
        if (bpTipo == null) return;
        var melhor = lista.filter(function(b){ return b.t === bpTipo; })
                          .sort(function(a, b){ return (b.me - a.me) || (b.te - a.te); })[0];
        var nome = (T.get(bpTipo) || {}).name;
        if (melhor) abreMateriais({ bpTipo: bpTipo, me: melhor.me, te: melhor.te,
                                    nomeBp: nome + (melhor.copia ? " (BPC)" : ""), T: T, R: R, E: E });
        else abreMateriais({ bpTipo: bpTipo, me: ME_SEM_BP, te: 0, nomeBp: nome, T: T, R: R, E: E },
                           "Não há blueprint de " + nome.replace(/ Blueprint$/, "") + " no estoque. Calculado com ME " + ME_SEM_BP + ".");
      });
      iso.appendChild(ic);
    });
    CV.igualaCartoes(grid.parentNode);
  }

  document.getElementById("ic-fuel").addEventListener("click", function(){
    WIN.open("w-fuel");
    SEL.desenha();
    desenha().catch(function(e){ console.error(e); nota.textContent = "Erro: " + e.message; });
  });
})();
