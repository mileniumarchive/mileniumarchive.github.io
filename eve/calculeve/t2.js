/* ==========================================================================
   t2.js — janela Invenção T2: da BPC T1 do estoque até o item T2 vendido.
   Molde da aba de produção com invenção da planilha (§5.3b do DOC_planilha): invenção e decryptors,
   cadeia completa até a folha de compra com três vias e poda, insumos crus, resultado e rotas de venda.
   Tudo que é preço e taxa vem do Mercado (mercado.js); o que é receita, tempo e skill vem do SDE.
   ========================================================================== */
(function(){
  "use strict";
  var el = CV.el;
  var FAB = "1", INV = "8", REAC = "11";          // activityID nos industryActivity*.csv
  var GRUPO_DECRYPTOR = 1304;                     // groupID "Decryptors" no invTypes
  var BPC_ME = 2, BPC_TE = 4;                     // ME/TE de uma BPC inventada sem decryptor
  var FUNDO = 14;                                 // teto de profundidade da árvore (trava de segurança)
  var JOBS_PADRAO = 100;                          // jobs de invenção com que a janela abre
  var fmtInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  var fmtQtd = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  var fmtPct = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  /* ---------------- escolhas (CV.seletores), as mesmas do Fuel Blocks ---------------- */
  var SEL = CV.seletores("t2", { char: "calculeve.t2.char", merc: "calculeve.t2.mercado",
                                 fab: "calculeve.t2.fabrica", frete: "calculeve.t2.frete" },
                         function(){ if (atual) recarrega(atual); });
  document.getElementById("w-t2").addEventListener("fechou", SEL.fecha);

  /* ---------------- índices do SDE ----------------
     produto  "act|bp"     -> { t: produto, q: unidades por run }
     porProd  produto      -> [{ bp, act, q }]  (fabricação e reação)
     mat      "act|bp"     -> [{ t: material, q: qtd base (ME 0) por run }]
     tempo    "act|bp"     -> segundos por run
     prob     bp           -> chance base de invenção
     skills   bp           -> [skillID] exigidas pela invenção */
  var idxP = null;
  function idx(){
    if (idxP) return idxP;
    idxP = Promise.all([
      CV.tipos(),
      CV.sde("industryActivityProducts.csv", ["typeID", "activityID", "productTypeID", "quantity"]),
      CV.sde("industryActivityMaterials.csv", ["typeID", "activityID", "materialTypeID", "quantity"]),
      CV.sde("industryActivity.csv", ["typeID", "activityID", "time"]),
      CV.sde("industryActivityProbabilities.csv", ["typeID", "activityID", "productTypeID", "probability"]),
      CV.sde("industryActivitySkills.csv", ["typeID", "activityID", "skillID", "level"])
    ]).then(function(r){
      var I = { T: r[0], produto: new Map(), porProd: new Map(), mat: new Map(),
                tempo: new Map(), prob: new Map(), skills: new Map() };
      I.k = function(act, bp){ return act + "|" + bp; };
      r[1].forEach(function(x){
        var bp = Number(x[0]), p = { t: Number(x[2]), q: Number(x[3]) };
        I.produto.set(I.k(x[1], bp), p);
        if (x[1] === FAB || x[1] === REAC){
          if (!I.porProd.has(p.t)) I.porProd.set(p.t, []);
          I.porProd.get(p.t).push({ bp: bp, act: x[1], q: p.q });
        }
      });
      r[2].forEach(function(x){
        var kk = I.k(x[1], Number(x[0]));
        if (!I.mat.has(kk)) I.mat.set(kk, []);
        I.mat.get(kk).push({ t: Number(x[2]), q: Number(x[3]) });
      });
      r[3].forEach(function(x){ I.tempo.set(I.k(x[1], Number(x[0])), Number(x[2])); });
      r[4].forEach(function(x){ if (x[1] === INV) I.prob.set(Number(x[0]), Number(x[3])); });
      r[5].forEach(function(x){
        if (x[1] !== INV) return;
        var bp = Number(x[0]);
        if (!I.skills.has(bp)) I.skills.set(bp, []);
        I.skills.get(bp).push(Number(x[2]));
      });
      return I;
    });
    return idxP;
  }

  /* blueprint que fabrica (ou reação que produz) um item. Produto com mais de uma no dump fica com a que
     casa o nome — deduzir concatenando " Blueprint" erra nas reações (§3 do DOC_planilha). */
  function bpDoProduto(I, tipo){
    var l = I.porProd.get(tipo);
    if (!l || !l.length) return null;
    if (l.length === 1) return l[0];
    var nome = (I.T.get(tipo) || {}).name || "";
    return l.filter(function(b){
      var n = (I.T.get(b.bp) || {}).name || "";
      return n === nome + " Blueprint" || n === nome + " Reaction Formula";
    })[0] || l[0];
  }

  /* decryptors: os 8 do grupo, com os quatro modificadores do dogma, mais a linha "Sem decryptor".
     1112 chance (multiplicador) · 1113 ME · 1114 TE · 1124 runs — os três últimos somados aos da BPC. */
  var ATRIB_DEC = { inventionPropabilityMultiplier: "prob", inventionMEModifier: "me",
                    inventionTEModifier: "te", inventionMaxRunModifier: "runs" };
  var decsP = null;
  function decryptors(){
    if (decsP) return decsP;
    decsP = Promise.all([CV.tipos(),
      CV.sde("dgmAttributeTypes.csv", ["attributeID", "attributeName"]),
      CV.sde("dgmTypeAttributes.csv", ["typeID", "attributeID", "valueInt", "valueFloat"])]).then(function(r){
        var T = r[0], quero = {}, porTipo = new Map();
        r[1].forEach(function(a){ if (ATRIB_DEC[a[1]]) quero[a[0]] = ATRIB_DEC[a[1]]; });
        T.forEach(function(t, id){
          if (t.group === GRUPO_DECRYPTOR) porTipo.set(id, { t: id, name: t.name, prob: 1, me: 0, te: 0, runs: 0 });
        });
        r[2].forEach(function(x){
          var d = porTipo.get(Number(x[0])), campo = quero[x[1]];
          if (d && campo) d[campo] = Number(x[3] !== "" ? x[3] : x[2]);
        });
        var lista = Array.from(porTipo.values()).sort(function(a, b){ return a.name.localeCompare(b.name); });
        return [{ t: null, name: "Sem decryptor", prob: 1, me: 0, te: 0, runs: 0 }].concat(lista);
      });
    return decsP;
  }

  /* bônus de tempo por nível, do SDE: Industry e Advanced Industry na fabricação, Reactions na reação */
  var SKILLS_TEMPO = [["Industry", "manufacturingTimeBonus", FAB],
                      ["Advanced Industry", "advancedIndustrySkillIndustryJobTimeBonus", FAB],
                      ["Reactions", "reactionTimeBonus", REAC]];
  var bSkillP = null;
  function bonusSkill(){
    if (bSkillP) return bSkillP;
    bSkillP = Promise.all([CV.tipos(),
      CV.sde("dgmAttributeTypes.csv", ["attributeID", "attributeName"]),
      CV.sde("dgmTypeAttributes.csv", ["typeID", "attributeID", "valueInt", "valueFloat"])]).then(function(r){
        var idTipo = {}, idAttr = {}, alvo = {}, out = [];
        r[0].forEach(function(t, id){ if (!idTipo[t.name]) idTipo[t.name] = id; });
        r[1].forEach(function(a){ idAttr[a[1]] = a[0]; });
        SKILLS_TEMPO.forEach(function(s){ alvo[idTipo[s[0]] + "|" + idAttr[s[1]]] = { skill: idTipo[s[0]], nome: s[0], act: s[2] }; });
        r[2].forEach(function(x){
          var a = alvo[x[0] + "|" + x[1]];
          if (a) out.push({ skill: a.skill, nome: a.nome, act: a.act, pct: Number(x[3] !== "" ? x[3] : x[2]) });
        });
        return out;
      });
    return bSkillP;
  }

  /* ---------------- estoque salvo do Tudão ---------------- */
  /* quantidade por tipo, somando todos os chars e locais */
  function somaEstoque(snap){
    var r = new Map();
    snap.dados.forEach(function(d){
      (d.assets || []).forEach(function(a){ r.set(a.type_id, (r.get(a.type_id) || 0) + a.quantity); });
    });
    return r;
  }
  /* blueprints em hangar: typeID da BP -> { me, te } da melhor (maior ME, depois maior TE) */
  function bpsDoEstoque(snap){
    var r = new Map();
    snap.dados.forEach(function(d){
      (d.bps || []).forEach(function(b){
        var v = { me: b.material_efficiency || 0, te: b.time_efficiency || 0 }, a = r.get(b.type_id);
        if (!a || v.me > a.me || (v.me === a.me && v.te > a.te)) r.set(b.type_id, v);
      });
    });
    return r;
  }
  /* as BPCs T1 do estoque que têm invenção: uma linha por (tipo, ME, TE, runs), com a quantidade */
  function bpcsInventaveis(snap, I){
    var g = new Map();
    snap.dados.forEach(function(d){
      (d.bps || []).forEach(function(b){
        var copia = (b.runs != null && b.runs > 0) || b.quantity === -2;
        if (!copia || !I.produto.has(I.k(INV, b.type_id))) return;
        var me = b.material_efficiency || 0, te = b.time_efficiency || 0;
        var k = [b.type_id, me, te, b.runs].join("|");
        if (!g.has(k)) g.set(k, { t: b.type_id, me: me, te: te, runs: b.runs, qt: 0 });
        g.get(k).qt += b.quantity > 0 ? b.quantity : 1;
      });
    });
    return Array.from(g.values());
  }

  /* ---------------- bônus da fábrica escolhida ---------------- */
  function bonusFabrica(){
    var f = SEL.escolhido("fab");
    if (!f) return { meFab: 1, meReac: 1, teFab: 1, teReac: 1, sys: null, nome: null };
    var b = f.bonus || {};
    function p(k){ return (Number(b[k]) || 0) / 100; }
    return { meFab: (1 - p("meEstr")) * (1 - p("meRigFab")), meReac: 1 - p("meRigReac"),
             teFab: (1 - p("teEstrFab")) * (1 - p("teRigFab")), teReac: (1 - p("teEstrReac")) * (1 - p("teRigReac")),
             sys: f.sys, nome: f.name };
  }

  /* ---------------- custo de job: índice do sistema da fábrica × EIV ----------------
     EIV do job = Σ (qtd base ME 0 × adjusted_price de /markets/prices/); custo/run = EIV × índice da
     atividade no sistema da estrutura escolhida (/industry/systems/). Sem fábrica escolhida, 0. */
  var sistemasP = null, ajustadosP = null;
  /* endpoint sem token que pode ou não vir paginado: pega a primeira página e as demais, se houver */
  async function todas(path){
    var r = await CV.esi(path), out = r.json;
    for (var p = 2; p <= r.pages; p++) out = out.concat((await CV.esi(path + "?page=" + p)).json);
    return { json: out };
  }
  function indicesSistema(){
    if (!sistemasP) sistemasP = todas("/industry/systems/").then(function(r){
      var m = new Map();
      r.json.forEach(function(s){
        var a = {};
        (s.cost_indices || []).forEach(function(c){ a[c.activity] = c.cost_index; });
        m.set(s.solar_system_id, a);
      });
      return m;
    });
    return sistemasP;
  }
  function precosAjustados(){
    if (!ajustadosP) ajustadosP = todas("/markets/prices/").then(function(r){
      var m = new Map();
      r.json.forEach(function(p){ if (p.adjusted_price != null) m.set(p.type_id, p.adjusted_price); });
      return m;
    });
    return ajustadosP;
  }
  var ATIVIDADE = {}; ATIVIDADE[FAB] = "manufacturing"; ATIVIDADE[REAC] = "reaction";

  /* ---------------- chance de invenção ----------------
     chance = base × (1 + (ciência1 + ciência2)/30 + encryption/40) × multiplicador do decryptor
     (EVE University Wiki, Invention). As três skills saem do industryActivitySkills. */
  function separaSkills(I, bp){
    var ids = I.skills.get(bp) || [], enc = null, sci = [];
    ids.forEach(function(id){
      var n = (I.T.get(id) || {}).name || "";
      if (/Encryption Methods$/.test(n)) enc = { id: id, nome: n };
      else sci.push({ id: id, nome: n });
    });
    return { enc: enc, sci: sci };
  }
  function chanceDe(base, sk, niveis, mult){
    function lv(s){ return s ? (niveis.get(s.id) || 0) : 0; }
    var soma = sk.sci.reduce(function(a, s){ return a + lv(s); }, 0);
    return base * (1 + soma / 30 + lv(sk.enc) / 40) * mult;
  }

  /* segundos -> "h:mm:ss" */
  function hms(seg){
    seg = Math.round(seg);
    var h = Math.floor(seg / 3600), m = Math.floor(seg % 3600 / 60), s = seg % 60;
    return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  /* ==========================================================================
     Motor: monta a árvore, custeia as três vias, poda e distribui a demanda.
     `ctx` reúne tudo que não muda entre decryptors; `cenario(ctx, dec)` devolve o lote inteiro.
     ========================================================================== */

  /* árvore do item: nó é o que tem fabricação (act 1) ou reação (act 11) no SDE; folha é o resto.
     Item que aparece em mais de um pai ocupa um nó só, na maior profundidade (§8 do DOC_planilha). */
  function arvore(I, raiz, bpRaiz){
    var nos = new Map();
    (function desce(tipo, prof, bpForcada, caminho){
      if (prof > FUNDO || caminho.indexOf(tipo) >= 0) return;
      var b = bpForcada ? { bp: bpForcada, act: FAB, q: (I.produto.get(I.k(FAB, bpForcada)) || {}).q || 1 }
                        : bpDoProduto(I, tipo);
      var no = nos.get(tipo);
      if (no){ if (prof > no.prof) no.prof = prof; return; }
      no = { tipo: tipo, bp: b && b.bp, act: b && b.act, rend: b ? b.q : 0, prof: prof,
             mats: b ? (I.mat.get(I.k(b.act, b.bp)) || []) : [] };
      nos.set(tipo, no);
      no.mats.forEach(function(m){ desce(m.t, prof + 1, null, caminho.concat([tipo])); });
    })(raiz, 0, bpRaiz, []);
    return nos;
  }

  /* qtd efetiva de um material por run: MAX(1; base × (1 − ME) × bônus da estrutura) (§5.15) */
  function qtdEfetiva(base, me, act, bonus){
    return Math.max(1, base * (1 - (me || 0) / 100) * (act === REAC ? bonus.meReac : bonus.meFab));
  }
  /* tempo por run: base do SDE × (1 − TE da BP) × bônus de skill da atividade × bônus de tempo da estrutura */
  function tempoRun(ctx, no, te){
    var base = ctx.I.tempo.get(ctx.I.k(no.act, no.bp));
    if (base == null) return null;
    var mult = 1;
    ctx.bSkill.forEach(function(b){ if (b.act === no.act) mult *= 1 + b.pct / 100 * (ctx.niveis.get(b.skill) || 0); });
    return base * (1 - (te || 0) / 100) * mult * (no.act === REAC ? ctx.bonus.teReac : ctx.bonus.teFab);
  }

  function cenario(ctx, dec){
    var I = ctx.I;
    var c = { dec: dec, nos: [], crus: [], aviso: null };

    /* invenção */
    c.chance = chanceDe(ctx.chanceBase, ctx.sk, ctx.niveis, dec.prob);
    c.runsBPC = ctx.runsBase + dec.runs;
    c.copias = Math.floor(ctx.jobs * c.chance);
    c.me = BPC_ME + dec.me;
    c.te = BPC_TE + dec.te;
    c.unidades = c.copias * c.runsBPC * ctx.qRun;
    c.alvo = c.unidades + ctx.sobra * ctx.qRun;

    /* árvore e custo das três vias, de baixo para cima */
    var nos = arvore(I, ctx.item, ctx.bpT2);
    var memo = new Map();
    function me(no){ return no.tipo === ctx.item ? c.me : (ctx.BPS.get(no.bp) || {}).me || 0; }
    function te(no){ return no.tipo === ctx.item ? c.te : (ctx.BPS.get(no.bp) || {}).te || 0; }
    /* custo de um job, por run (não por unidade): EIV da receita × índice da atividade no sistema.
       Quem divide pelo rendimento é quem calcula o custo por unidade. */
    function custoJobRun(no){
      if (!ctx.indices || !ctx.ajustados || !ctx.bonus.sys) return 0;
      var ind = (ctx.indices.get(ctx.bonus.sys) || {})[ATIVIDADE[no.act]];
      if (ind == null) return 0;
      var eiv = 0;
      no.mats.forEach(function(m){ eiv += m.q * (ctx.ajustados.get(m.t) || 0); });
      return eiv * ind;
    }
    function efetivo(tipo, caminho){
      if (memo.has(tipo)) return memo.get(tipo);
      var no = nos.get(tipo), v = { produzir: null, estr: ctx.precoCompra(tipo, "sell"), jita: ctx.precoJita(tipo) };
      memo.set(tipo, v);                              // antes da recursão: trava contra ciclo
      if (no && no.bp && caminho.indexOf(tipo) < 0){
        var soma = 0, ok = true;
        no.mats.forEach(function(m){
          var f = efetivo(m.t, caminho.concat([tipo]));
          if (f.melhor == null){ ok = false; return; }
          soma += qtdEfetiva(m.q, meDe(m.t), no.act, ctx.bonus) * f.melhor;
        });
        if (ok) v.produzir = (soma + custoJobRun(no)) / no.rend;
      }
      var vias = [v.produzir, v.estr, v.jita].filter(function(x){ return typeof x === "number" && isFinite(x); });
      v.melhor = vias.length ? Math.min.apply(null, vias) : null;
      v.decisao = v.melhor == null ? "⚠ FALTA"
                : v.melhor === v.produzir ? "CONSTRUIR"
                : v.melhor === v.estr ? "COMPRAR (estrut)" : "COMPRAR (Jita)";
      return v;
    }
    function meDe(tipo){ var no = nos.get(tipo); return no ? me(no) : 0; }

    nos.forEach(function(no){ efetivo(no.tipo, []); });

    /* poda e demanda, de cima para baixo (profundidade crescente: todo pai vem antes do filho) */
    var ordem = Array.from(nos.values()).sort(function(a, b){ return a.prof - b.prof; });
    ordem.forEach(function(no){
      no.v = memo.get(no.tipo);
      no.estoque = ctx.E.get(no.tipo) || 0;
      no.demanda = 0; no.dem0 = 0; no.ativo = false; no.runs = 0; no.runs0 = 0; no.comprar = 0; no.sobra = 0;
      no.tempo = no.bp ? tempoRun(ctx, no, te(no)) : null;
    });
    /* a raiz é sempre construída: a BPC saiu da invenção, não se compra o T2 para "fabricar" */
    var raiz = nos.get(ctx.item);
    raiz.ativo = true; raiz.demanda = c.alvo; raiz.dem0 = c.alvo; raiz.estoque = 0;
    if (raiz.v.produzir != null) raiz.v.decisao = "CONSTRUIR (BPC)";
    ordem.forEach(function(no){
      if (!no.ativo) return;
      var d = no.v.decisao;
      if (d.indexOf("CONSTRUIR") === 0){
        no.runs = Math.ceil(Math.max(0, no.demanda - no.estoque) / no.rend);
        no.runs0 = Math.ceil(no.dem0 / no.rend);
        no.sobra = no.estoque + no.runs * no.rend - no.demanda;
        no.horas = no.tempo == null ? null : no.runs * no.tempo / 3600;
        no.mats.forEach(function(m){
          var filho = nos.get(m.t), q = qtdEfetiva(m.q, meDe(m.t), no.act, ctx.bonus);
          if (!filho) return;
          filho.ativo = true;
          filho.demanda += q * no.runs;
          filho.dem0 += q * no.runs0;
        });
      } else {
        no.comprar = Math.max(0, Math.ceil(no.demanda) - no.estoque);
      }
    });

    /* Soma o lote em duas contas, cada uma separada por rota:
       — investido: tudo que o ciclo consome comprado, estoque nenhum. É o que o lucro e o ROI usam —
         material tirado do estoque custa o que custaria comprar de novo;
       — falta: só o que o estoque não cobre. É o desembolso de hoje, e mora no Números para Nerds. */
    c.compraE = 0; c.compraJ = 0; c.faltaE = 0; c.faltaJ = 0;
    c.custoJobs = 0; c.custoJobs0 = 0; c.horas = 0; c.semPreco = false;
    ordem.forEach(function(no){
      (no.bp ? c.nos : c.crus).push(no);
      if (!no.ativo) return;
      if (no.v.decisao.indexOf("CONSTRUIR") === 0){
        c.custoJobs += no.runs * custoJobRun(no);
        c.custoJobs0 += no.runs0 * custoJobRun(no);
        if (no.horas) c.horas += no.horas;
        return;
      }
      if (no.v.melhor == null){ if (no.dem0 > 0) c.semPreco = true; return; }
      var naEstrutura = no.v.melhor === no.v.estr;
      if (naEstrutura){ c.compraE += Math.ceil(no.dem0) * no.v.estr; c.faltaE += no.comprar * no.v.estr; }
      else { c.compraJ += Math.ceil(no.dem0) * no.v.jita; c.faltaJ += no.comprar * no.v.jita; }
    });
    c.nos.sort(function(a, b){ return a.prof - b.prof; });
    c.crus.sort(function(a, b){ return ctx.nome(a.tipo).localeCompare(ctx.nome(b.tipo)); });

    /* invenção: datacores por job e o decryptor, cada um na rota que ele mesmo escolhe */
    function poeNaRota(r, total){
      if (r == null || total == null) return;
      if (r.rota === "E"){ c.compraE += total; c.faltaE += total; }
      else { c.compraJ += total; c.faltaJ += total; }
    }
    c.datacores = (I.mat.get(I.k(INV, ctx.bp)) || []).map(function(m){
      var r = ctx.rotaSimples(m.t), total = r == null ? null : r.valor * m.q * ctx.jobs;
      poeNaRota(r, total);
      return { t: m.t, q: m.q, un: r && r.valor, rota: r && r.rota, total: total };
    });
    c.custoDatacores = c.datacores.reduce(function(a, d){ return d.total == null ? a : a + d.total; }, 0);
    c.rotaDec = dec.t == null ? null : ctx.rotaSimples(dec.t);
    c.precoDec = c.rotaDec ? c.rotaDec.valor : 0;
    c.custoDec = dec.t == null ? 0 : (c.rotaDec == null ? null : c.rotaDec.valor * ctx.jobs);
    if (dec.t != null) poeNaRota(c.rotaDec, c.custoDec);
    c.custoInvencao = c.custoDatacores + (c.custoDec || 0);

    /* frete mínimo por contrato: pago uma vez, se houver qualquer compra em Jita (§4 do DOC_planilha) */
    var serv = ctx.servicoFrete();
    c.freteMinimo = serv && c.compraJ > 0 ? Number(serv.minimo) || 0 : 0;
    if (c.freteMinimo){ c.compraJ += c.freteMinimo; if (c.faltaJ > 0) c.faltaJ += c.freteMinimo; }

    c.desembolso = c.faltaE + c.faltaJ + c.custoJobs;
    c.custo = c.compraE + c.compraJ + c.custoJobs0;
    c.receita = ctx.receita(c.unidades);
    c.lucro = c.receita.valor == null ? null : c.receita.valor - c.custo;
    c.roi = c.lucro == null || !c.custo ? null : c.lucro / c.custo;
    c.margem = c.lucro == null || !c.receita.valor ? null : c.lucro / c.receita.valor;
    c.iskHora = c.lucro == null || !c.horas ? null : c.lucro / c.horas;
    return c;
  }

  /* ==========================================================================
     Janela do lote: monta o contexto, roda os 9 cenários e desenha o vencedor.
     ========================================================================== */
  var atual = null;                 // contexto do lote aberto
  var fixado = null;                // decryptor escolhido à mão (null = o vencedor por ROI)
  var ultimo = null;                // { ctx, c } do que está desenhado, para o Números para Nerds
  var jTitulo = document.getElementById("t2j-title"), jBp = document.getElementById("t2j-bp"),
      jJobs = document.getElementById("t2j-jobs"), jSobra = document.getElementById("t2j-sobra"),
      jAviso = document.getElementById("t2j-aviso"), jBody = document.getElementById("t2j-body"),
      jTs = document.getElementById("t2j-precos-ts"), jBtn = document.getElementById("t2j-precos-btn"),
      jNerd = document.getElementById("t2j-nerd-btn");

  function isk(v){ return v == null ? "NÃO TEM" : Mercado.isk(v); }
  function pct(v){ return v == null ? "—" : fmtPct.format(v * 100) + "%"; }

  /* preços do mercado escolhido e de Jita, no formato que o motor usa: número ou null */
  function ligaPrecos(ctx){
    ctx.precoCompra = function(tipo, lado){
      if (!ctx.px || ctx.px instanceof Error || !ctx.tx) return null;
      var v = Mercado.compra(ctx.px.p[tipo], ctx.tx);
      return v[lado];
    };
    ctx.jitaSell = function(tipo){
      if (!ctx.jita || ctx.jita instanceof Error) return null;
      return (ctx.jita.p[tipo] || [null])[0];
    };
    ctx.precoJita = function(tipo){
      var s = ctx.jitaSell(tipo);
      if (s == null) return null;
      return s + Mercado.frete(ctx.servicoFrete(), s, (ctx.vol || {})[tipo] || 0);
    };
    ctx.servicoFrete = function(){ var f = SEL.escolhido("frete"); return f && f.f; };
    /* compra melhor de um item solto (datacore, decryptor): MIN(estrutura ; Jita + frete), com a rota */
    ctx.rotaSimples = function(tipo){
      var e = ctx.precoCompra(tipo, "sell"), j = ctx.precoJita(tipo);
      var temE = typeof e === "number" && isFinite(e), temJ = typeof j === "number" && isFinite(j);
      if (!temE && !temJ) return null;
      if (temE && (!temJ || e <= j)) return { valor: e, rota: "E" };
      return { valor: j, rota: "J" };
    };
    /* Venda do T2, por unidade, nos quatro destinos, com os nomes do Fuel Blocks: sell order e buy order,
       no mercado escolhido e em Jita 4-4. As de Jita descontam o frete por unidade. As taxas são as do
       mercado escolhido — o broker do 4-4 é NPC e não é o mesmo da estrutura, é aproximação (§4 do
       DOC_planilha). */
    ctx.receita = function(un){
      var rotas = [{ nome: "ReceitaSellMerc", un: null }, { nome: "ReceitaBuyMerc", un: null },
                   { nome: "ReceitaSellJita", un: null }, { nome: "ReceitaBuyJita", un: null }];
      if (ctx.tx){
        if (ctx.px && !(ctx.px instanceof Error)){
          var v = Mercado.venda(ctx.px.p[ctx.item], ctx.tx);
          rotas[0].un = v.sell; rotas[1].un = v.buy;
        }
        if (ctx.jita && !(ctx.jita instanceof Error)){
          var j = Mercado.venda(ctx.jita.p[ctx.item], ctx.tx), vol = (ctx.vol || {})[ctx.item] || 0;
          var bruto = ctx.jita.p[ctx.item] || [null, null];
          if (j.sell != null) rotas[2].un = j.sell - Mercado.frete(ctx.servicoFrete(), bruto[0], vol);
          if (j.buy != null) rotas[3].un = j.buy - Mercado.frete(ctx.servicoFrete(), bruto[1], vol);
        }
      }
      var melhor = rotas.filter(function(r){ return typeof r.un === "number"; })
                        .sort(function(a, b){ return b.un - a.un; })[0];
      return { rotas: rotas, melhor: melhor || null, valor: melhor ? melhor.un * un : null };
    };
    ctx.nome = function(tipo){ return (ctx.I.T.get(tipo) || {}).name || String(tipo); };
  }

  /* ---------------- tabelas ---------------- */
  function secao(titulo){ jBody.appendChild(el("h4", null, titulo)); }
  function tabela(cols){
    var tab = el("table", "as"), hr = el("tr");
    cols.forEach(function(c){ hr.appendChild(el("th", c[1] || null, c[0])); });
    var th = el("thead"); th.appendChild(hr); tab.appendChild(th);
    var tb = el("tbody"); tab.appendChild(tb); jBody.appendChild(tab);
    return tb;
  }
  function celItem(ctx, tipo, nivel, variante){
    var td = el("td", nivel != null ? "arv" : null);
    if (nivel != null) td.style.setProperty("--nivel", nivel);
    td.appendChild(CV.iconeTipo(tipo, variante || "icon"));
    td.appendChild(document.createTextNode(ctx.nome(tipo)));
    return td;
  }
  /* parâmetros em colunas: rótulo em cima, valor embaixo, `porLinha` por faixa — em linha a linha
     sobrava espaço vazio à direita */
  function grade(pares, porLinha){
    var tab = el("table", "as grade"), tb = el("tbody");
    for (var i = 0; i < pares.length; i += porLinha){
      var faixa = pares.slice(i, i + porLinha), hr = el("tr", "rot"), vr = el("tr");
      faixa.forEach(function(par){
        hr.appendChild(el("th", "c", par[0]));
        vr.appendChild(el("td", "c" + (par[2] ? " " + par[2] : ""), par[1]));
      });
      for (var f = faixa.length; f < porLinha; f++){ hr.appendChild(el("th")); vr.appendChild(el("td")); }
      tb.append(hr, vr);
    }
    tab.appendChild(tb); jBody.appendChild(tab);
  }
  /* valor que não existe sai em cinza, como na planilha (§6 do DOC_planilha) */
  function celNum(valor, cls){
    var vazio = valor == null;
    return el("td", "n" + (vazio ? " cinza" : cls ? " " + cls : ""), isk(valor));
  }

  function secInvencao(ctx, c){
    secao("Invenção");
    var pares = [["Chance base (SDE)", pct(ctx.chanceBase)],
                 ["Chance com skills e decryptor", pct(c.chance)]];
    ctx.sk.sci.concat(ctx.sk.enc ? [ctx.sk.enc] : []).forEach(function(sk){
      pares.push([sk.nome, String(ctx.niveis.get(sk.id) || 0)]);
    });
    pares.push(["Jobs de invenção", fmtInt.format(ctx.jobs)],
               ["Cópias esperadas", fmtInt.format(c.copias)],
               ["Runs por BPC", fmtInt.format(c.runsBPC)],
               ["Unidades no ciclo", fmtInt.format(c.unidades)],
               ["ME / TE da BPC", c.me + " / " + c.te],
               ["Alvo de fabricação", fmtInt.format(c.alvo)]);
    if (ctx.tempoInv != null) pares.push(["Tempo do job (base do SDE)", hms(ctx.tempoInv)]);
    grade(pares, 5);

    var td = tabela([["Datacore / decryptor"], ["Qtd/job", "n"], ["Qtd do lote", "n"],
                     ["Comprar (E)", "n"], ["Comprar (J)", "n"], ["Melhor rota (gasto)", "n"]]);
    function linhaInv(tipo, qJob, rota, gasto){
      var tr = el("tr");
      tr.append(celItem(ctx, tipo), el("td", "n", fmtInt.format(qJob)),
                el("td", "n", fmtInt.format(qJob * ctx.jobs)),
                celCor(ctx.precoCompra(tipo, "sell"), "E"), celCor(ctx.precoJita(tipo), "J"),
                celCor(gasto, rota));
      td.appendChild(tr);
    }
    c.datacores.forEach(function(d){ linhaInv(d.t, d.q, d.rota, d.total); });
    if (c.dec.t != null) linhaInv(c.dec.t, 1, c.rotaDec && c.rotaDec.rota, c.custoDec);
  }

  function secDecryptors(ctx, cs, vencedor){
    secao("Decryptors");
    var tb = tabela([["Decryptor"], ["Chance", "n"], ["Runs/BPC", "n"], ["ME", "n"], ["TE", "n"], ["Cópias", "n"],
                     ["Unidades", "n"], ["Total investido", "n"], ["Receita", "n"], ["Lucro", "n"], ["ROI", "n"]]);
    cs.forEach(function(c){
      var tr = el("tr", "clica" + (c === vencedor ? " vence" : ""));
      tr.title = "Usar este decryptor";
      tr.addEventListener("click", function(){ fixado = fixado === c.dec.name ? null : c.dec.name; desenha(); });
      tr.append(c.dec.t == null ? el("td", null, c.dec.name) : celItem(ctx, c.dec.t),
                el("td", "n", pct(c.chance)), el("td", "n", fmtInt.format(c.runsBPC)),
                el("td", "n", String(c.me)), el("td", "n", String(c.te)),
                el("td", "n", fmtInt.format(c.copias)), el("td", "n", fmtInt.format(c.unidades)),
                el("td", "n", isk(c.custo)), el("td", "n", isk(c.receita.valor)),
                el("td", "n" + CV.sinal(c.lucro), isk(c.lucro)), el("td", "n" + CV.sinal(c.roi), pct(c.roi)));
      tb.appendChild(tr);
    });
  }

  /* cor por via de compra, igual em toda a Calculeve: estrutura em ciano, Jita em rosa, produzir em verde */
  var CLS = { E: "rota-e", J: "rota-j", P: "constroi" };
  function viaDe(v){
    return v.melhor == null ? null : v.melhor === v.produzir ? "P" : v.melhor === v.estr ? "E" : "J";
  }
  function celCor(valor, via, texto){
    if (texto != null) return el("td", "n cinza", texto);
    return el("td", "n" + (valor == null ? " cinza" : via ? " " + CLS[via] : ""), isk(valor));
  }
  /* coluna BP: V verde quem tem a blueprint (ou a fórmula) no estoque, x vermelho quem não tem */
  function celBp(ctx, no){
    if (no.tipo === ctx.item) return el("td", null, "inventada");
    var tem = ctx.BPS.has(no.bp);
    return el("td", tem ? "constroi" : "falta", tem ? "V" : "x");
  }

  function secCadeia(ctx, c){
    secao("Cadeia de fabricáveis — produzir vs comprar (3 vias), com poda");
    var tb = tabela([["Item (árvore)"], ["BP"], ["Runs a fazer", "n"], ["Estoque", "n"], ["Comprar (un)", "n"],
                     ["Produzir", "n"], ["Comprar (E)", "n"], ["Comprar (J)", "n"], ["Melhor rota", "n"],
                     ["Qtd no ciclo", "n"], ["Horas de fila", "n"], ["Sobra (un)", "n"]]);
    c.nos.forEach(function(no){
      if (no.tipo === ctx.item) return;          // o item inventado é o Resultado, não um insumo da cadeia
      var v = no.v, via = no.ativo ? viaDe(v) : null, tr = el("tr", no.ativo ? null : "podado");
      tr.append(celItem(ctx, no.tipo, no.prof), celBp(ctx, no),
                el("td", "n", fmtInt.format(no.runs)),
                el("td", "n" + (no.estoque ? "" : " cinza"), fmtInt.format(no.estoque)),
                el("td", "n", fmtInt.format(no.comprar)),
                celCor(v.produzir, "P"), celCor(v.estr, "E"), celCor(v.jita, "J"),
                celCor(v.melhor, via, no.ativo ? null : "— desnecessário"),
                el("td", "n", fmtQtd.format(no.demanda)),
                el("td", "n", no.horas == null ? "—" : fmtQtd.format(no.horas) + " h"),
                el("td", "n", fmtQtd.format(no.sobra)));
      tb.appendChild(tr);
    });
  }

  function secCrus(ctx, c){
    secao("Insumos crus — a lista de compra");
    var tb = tabela([["Insumo"], ["Qtd no ciclo", "n"], ["Estoque", "n"], ["Comprar (un)", "n"],
                     ["Comprar (E)", "n"], ["Comprar (J)", "n"], ["Melhor rota (gasto)", "n"]]);
    c.crus.forEach(function(no){
      var v = no.v, via = no.ativo ? viaDe(v) : null, tr = el("tr", no.ativo ? null : "podado");
      var gasto = v.melhor == null ? null : no.comprar * v.melhor;
      tr.append(celItem(ctx, no.tipo),
                el("td", "n", fmtQtd.format(no.demanda)),
                el("td", "n" + (no.estoque ? "" : " cinza"), fmtInt.format(no.estoque)),
                el("td", "n", fmtInt.format(no.comprar)),
                celCor(v.estr, "E"), celCor(v.jita, "J"),
                celCor(gasto, gasto === 0 ? "P" : via, no.ativo ? null : "— desnecessário"));
      tb.appendChild(tr);
    });
  }

  /* Resultado: o item inventado com as quatro rotas de venda, o que comprar por rota e o saldo.
     O resto vai para o Números para Nerds. */
  function secResultado(ctx, c){
    secao("Resultado");
    var raiz = c.nos.filter(function(no){ return no.tipo === ctx.item; })[0];
    var tb = tabela([["Item"], ["Runs a fazer", "n"], ["Unidades", "n"], ["Produzir (un)", "n"]]
                    .concat(c.receita.rotas.map(function(r){ return [r.nome, "n"]; }))
                    .concat([["Melhor rota", "n"]]));
    var tr = el("tr");
    tr.append(celItem(ctx, ctx.item), el("td", "n", fmtInt.format(raiz ? raiz.runs : 0)),
              el("td", "n", fmtInt.format(c.unidades)),
              celCor(raiz ? raiz.v.produzir : null, "P"));
    c.receita.rotas.forEach(function(r){ tr.appendChild(celNum(r.un)); });
    tr.appendChild(el("td", "n" + (c.receita.melhor ? "" : " cinza"),
                      c.receita.melhor ? c.receita.melhor.nome : "NÃO TEM"));
    tb.appendChild(tr);

    /* o que cada rota deixa em cima do custo de produzir uma unidade, e o mesmo vezes o ciclo */
    var prod = raiz && typeof raiz.v.produzir === "number" ? raiz.v.produzir : null;
    function linhaDelta(rotulo, fator){
      var l = el("tr"), rot = el("td", null, rotulo);
      rot.colSpan = 4;
      l.appendChild(rot);
      c.receita.rotas.forEach(function(r){
        var d = prod == null || r.un == null ? null : (r.un - prod) * fator;
        l.appendChild(el("td", "n" + (d == null ? " cinza" : CV.sinal(d)), isk(d)));
      });
      l.appendChild(el("td"));
      tb.appendChild(l);
    }
    linhaDelta("Delta por unidade (rota − produzir)", 1);
    linhaDelta("Delta do ciclo (unidades × delta)", c.unidades);
    grade([["Compra (E)", isk(c.compraE), "rota-e"], ["Compra (J)", isk(c.compraJ), "rota-j"],
           ["Custo dos jobs", isk(c.custoJobs0)]], 3);
    grade([["Total investido", isk(c.custo)], ["Receita", isk(c.receita.valor)],
           ["Lucro", isk(c.lucro), CV.sinal(c.lucro).trim()], ["ROI", pct(c.roi), CV.sinal(c.roi).trim()]], 4);
    if (c.semPreco) jAviso.textContent = "Algum item da cadeia não tem ordem em nenhuma das duas rotas: o total investido sai por baixo.";
  }

  /* ---------------- Números para Nerds: o resto da conta ---------------- */
  function gruposNerd(ctx, c){
    var g1 = [["Compra (E)", c.compraE], ["Compra (J)", c.compraJ], ["Custo dos jobs", c.custoJobs0],
              ["Total investido", c.custo], ["Lucro", c.lucro]];
    var g2 = [["Desembolso do ciclo", c.desembolso], ["Desembolso — estrutura", c.faltaE],
              ["Desembolso — Jita", c.faltaJ], ["Frete mínimo por contrato", c.freteMinimo],
              ["Custo dos jobs — só o que falta fabricar", c.custoJobs]];
    var g3 = [["Invenção — datacores", c.custoDatacores], ["Invenção — decryptor", c.custoDec],
              ["Chance de invenção", pct(c.chance)], ["Cópias esperadas", fmtInt.format(c.copias)],
              ["Unidades no ciclo", fmtInt.format(c.unidades)]];
    var g4 = c.receita.rotas.map(function(r){ return [r.nome + " (un)", r.un]; })
      .concat([["Receita", c.receita.valor], ["Margem", pct(c.margem)],
               ["Horas de fila", c.horas ? fmtQtd.format(c.horas) + " h" : "—"],
               ["ISK por hora de fila", c.iskHora]]);
    var g5 = c.nos.map(function(no){
      return [ctx.nome(no.tipo) + " — rend/run e tempo/run",
              fmtInt.format(no.rend) + " un/run · " + (no.tempo == null ? "—" : hms(no.tempo))];
    });
    return [g1, g2, g3, g4, g5];
  }

  /* ---------------- desenho: roda os cenários e mostra o vencedor por ROI ---------------- */
  function desenha(){
    if (!atual) return;
    var ctx = atual;
    jBody.innerHTML = ""; jAviso.textContent = ""; ultimo = null;
    ctx.jobs = Math.floor(Number(jJobs.value));
    ctx.sobra = Math.max(0, Math.floor(Number(jSobra.value)) || 0);
    if (!(ctx.jobs >= 1)){ jBody.appendChild(el("div", "status", "Jobs precisa ser um inteiro maior que zero.")); return; }
    if (!ctx.niveis || !ctx.bSkill || !ctx.decs){ jBody.appendChild(el("div", "status", "Carregando skills e decryptors…")); return; }
    if (!ctx.merc) jAviso.textContent = "Sem mercado escolhido: nenhum preço, nenhuma decisão.";

    var cs = ctx.decs.map(function(d){ return cenario(ctx, d); });
    var comRoi = cs.filter(function(c){ return c.roi != null; });
    var vencedor = comRoi.sort(function(a, b){ return b.roi - a.roi; })[0] || cs[0];
    if (fixado){
      var esc = cs.filter(function(c){ return c.dec.name === fixado; })[0];
      if (esc) vencedor = esc;
    }
    jBp.textContent = "BPC T1: ME " + ctx.meBp + " / TE " + ctx.teBp +
                      " · decryptor: " + vencedor.dec.name + (fixado ? " (fixado)" : " (vencedor por ROI)");
    ultimo = { ctx: ctx, c: vencedor };
    secInvencao(ctx, vencedor);
    secDecryptors(ctx, cs, vencedor);
    secCadeia(ctx, vencedor);
    secCrus(ctx, vencedor);
    secResultado(ctx, vencedor);
  }

  /* ---------------- carga: preços do mercado, Jita, volumes, skills, índices de custo ---------------- */
  function recarrega(ctx, forca){
    ctx.merc = SEL.escolhido("merc");
    ctx.bonus = bonusFabrica();
    ctx.px = null; ctx.tx = null; jTs.textContent = "";
    var este = ctx;

    var skillsP = ctx.char ? (ctx.char.ficticio ? Promise.resolve({ get: function(){ return ctx.char.nivel; } }) : CV.skills(ctx.char))
                           : Promise.resolve(new Map());
    Promise.all([skillsP, bonusSkill(), decryptors()]).then(function(r){
      if (atual !== este) return;
      este.niveis = r[0]; este.bSkill = r[1]; este.decs = r[2]; desenha();
    }, function(e){ console.error(e); if (atual === este){ jAviso.textContent = "Erro nas skills: " + e.message; } });

    if (ctx.merc){
      Promise.all([forca ? Mercado.atualiza(ctx.merc) : Mercado.precos(ctx.merc), skillsP.then(function(n){ return Mercado.taxas(ctx.merc, n); })])
        .then(function(r){
          if (atual !== este) return;
          este.px = r[0]; este.tx = r[1];
          jTs.textContent = "Preços de " + este.merc.name + " — " + CV.dataHora(r[0].ts) +
                            (este.tx ? "" : " · falta o broker do dono da estrutura");
          desenha();
        }, function(e){ console.error(e); if (atual === este){ este.px = e; jTs.textContent = "Erro nos preços: " + e.message; desenha(); } });
    }

    Promise.all([Mercado.jita(ctx.ids, forca), Mercado.volumes(ctx.ids)]).then(function(r){
      if (atual !== este) return;
      este.jita = r[0]; este.vol = r[1]; desenha();
    }, function(e){ console.error(e); if (atual === este){ este.jita = e; desenha(); } });

    if (ctx.bonus.sys) Promise.all([indicesSistema(), precosAjustados()]).then(function(r){
      if (atual !== este) return;
      este.indices = r[0]; este.ajustados = r[1]; desenha();
    }, function(e){ console.error(e); if (atual === este){ jAviso.textContent = "Erro no índice de custo: " + e.message; } });
  }

  /* ---------------- abre o lote de uma BPC T1 ---------------- */
  function abre(I, bpc, E, BPS){
    var inv = I.produto.get(I.k(INV, bpc.t));                     // BPC T2 inventada e runs por BPC
    var fab = I.produto.get(I.k(FAB, inv.t));                     // item T2 e unidades por run
    if (!fab) return;
    var ctx = { I: I, bp: bpc.t, bpT2: inv.t, item: fab.t, qRun: fab.q, runsBase: inv.q,
                meBp: bpc.me, teBp: bpc.te, E: E, BPS: BPS,
                chanceBase: I.prob.get(bpc.t) || 0, sk: separaSkills(I, bpc.t),
                tempoInv: I.tempo.get(I.k(INV, bpc.t)), jobs: JOBS_PADRAO, sobra: 0 };
    ligaPrecos(ctx);
    var ids = Array.from(arvore(I, ctx.item, ctx.bpT2).keys());
    (I.mat.get(I.k(INV, bpc.t)) || []).forEach(function(m){ ids.push(m.t); });
    ctx.ids = ids;
    ctx.char = SEL.escolhido("char");
    atual = ctx; fixado = null;
    jTitulo.textContent = ctx.nome(ctx.item);
    jJobs.value = String(ctx.jobs); jSobra.value = "0";
    decryptors().then(function(ds){
      ds.forEach(function(d){ if (d.t != null && ctx.ids.indexOf(d.t) < 0) ctx.ids.push(d.t); });
    });
    WIN.open("w-t2job");
    recarrega(ctx);
    desenha();
  }

  jNerd.addEventListener("click", function(){
    Nerds.abre(ultimo ? ultimo.ctx.nome(ultimo.ctx.item) : "", ultimo && gruposNerd(ultimo.ctx, ultimo.c));
  });
  jJobs.addEventListener("input", desenha);
  jSobra.addEventListener("input", desenha);
  jBtn.addEventListener("click", function(){ if (atual) recarrega(atual, true); });

  /* ---------------- janela Invenção T2: as BPCs T1 do estoque do Tudão ---------------- */
  var grid = document.getElementById("t2-grid"), nota = document.getElementById("t2-nota");
  async function desenhaGrid(){
    grid.innerHTML = ""; nota.textContent = "Carregando…";
    var snap = CV.lsGet("calculeve.estoque.tudo", null);
    if (!snap){ nota.textContent = "Sem estoque do Tudão salvo. Atualize o Tudão no Estoque."; return; }
    var I = await idx(), E = somaEstoque(snap), BPS = bpsDoEstoque(snap);
    var lista = bpcsInventaveis(snap, I).sort(function(a, b){
      return ((I.T.get(a.t) || {}).name || "").localeCompare((I.T.get(b.t) || {}).name || "") || (b.me - a.me);
    });
    nota.textContent = "Estoque do Tudão de " + CV.dataHora(snap.ts) +
                       ". Só BPC: invenção só roda em cópia.";
    if (!lista.length){ grid.appendChild(el("div", "vazio", "Nenhuma BPC com invenção no estoque.")); return; }
    lista.forEach(function(b){
      var nome = (I.T.get(b.t) || {}).name || String(b.t), ic = el("button", "icon bp");
      ic.title = nome + " (BPC)";
      ic.appendChild(CV.iconeTipo(b.t, "bpc"));
      ic.appendChild(el("span", "bp-nome", nome.replace(/ Blueprint$/, "")));
      ic.appendChild(el("span", "bp-dados", "ME: " + b.me + " / TE: " + b.te + " / QT: " + b.qt +
                                            (b.runs > 0 ? " / runs: " + b.runs : "")));
      ic.addEventListener("click", function(){ abre(I, b, E, BPS); });
      grid.appendChild(ic);
    });
  }

  document.getElementById("ic-t2").addEventListener("click", function(){
    WIN.open("w-t2");
    SEL.desenha();
    desenhaGrid().catch(function(e){ console.error(e); nota.textContent = "Erro: " + e.message; });
  });
})();
