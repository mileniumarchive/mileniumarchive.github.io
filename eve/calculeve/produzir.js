/* ==========================================================================
   produzir.js — janela Produzir: das blueprints (BPO e BPC) do estoque até o item vendido.
   É a Invenção T2 sem a invenção: a mesma cadeia até a folha de compra, com três vias e poda, os mesmos
   insumos crus, resultado e rotas de venda. O motor, as seções e a carga de preços são os do t2.js (T2.*);
   aqui ficam só a lista de blueprints e o lote (Runs).
   ========================================================================== */
(function(){
  "use strict";
  var el = CV.el, FAB = CV.ATIV.FAB;
  var SEM_DEC = { t: null, name: "—", prob: 1, me: 0, te: 0, runs: 0 };

  var SEL = CV.seletores("prod", { char: "calculeve.prod.char", merc: "calculeve.prod.mercado",
                                   fab: "calculeve.prod.fabrica", frete: "calculeve.prod.frete" },
                         function(){ if (atual) T2.carrega(atual); });
  document.getElementById("w-prod").addEventListener("fechou", SEL.fecha);

  var atual = null, ultimo = null;
  var jTitulo = document.getElementById("pj-title"), jBp = document.getElementById("pj-bp"),
      jRuns = document.getElementById("pj-runs"), jAviso = document.getElementById("pj-aviso"),
      jBody = document.getElementById("pj-body"), jTs = document.getElementById("pj-precos-ts"),
      jBtn = document.getElementById("pj-precos-btn"), jNerd = document.getElementById("pj-nerd-btn"),
      jMax = document.getElementById("pj-max"),
      jMe = document.getElementById("pj-me"), jTe = document.getElementById("pj-te"),
      jMeL = document.getElementById("pj-me-l"), jTeL = document.getElementById("pj-te-l");

  function desenha(){
    if (!atual) return;
    var ctx = atual;
    T2.corpo(jBody, jAviso);
    jBody.innerHTML = ""; jAviso.textContent = ""; ultimo = null;
    var r = Math.floor(Number(jRuns.value));
    if (!(r >= 1)){ CV.status(jBody, "Runs precisa ser um inteiro maior que zero."); return; }
    if (ctx.maxRuns && r > ctx.maxRuns){ r = ctx.maxRuns; jRuns.value = String(r); }
    ctx.runs = r;
    if (ctx.sim){                                       // BPO simulada: ME 0–10, TE 0–20 de 2 em 2, como no jogo
      var me = Number(jMe.value), te = Number(jTe.value);
      if (!(Number.isInteger(me) && me >= 0 && me <= 10)){ CV.status(jBody, "ME precisa ser um inteiro de 0 a 10."); return; }
      if (!(Number.isInteger(te) && te >= 0 && te <= 20 && te % 2 === 0)){ CV.status(jBody, "TE precisa ser par, de 0 a 20."); return; }
      ctx.meBp = me; ctx.teBp = te;
    }
    if (!ctx.niveis || !ctx.bSkill){ CV.status(jBody, "Carregando skills…"); return; }
    if (!ctx.merc) jAviso.textContent = "Sem mercado escolhido: nenhum preço, nenhuma decisão.";
    var c = T2.cenario(ctx, SEM_DEC);
    ultimo = { ctx: ctx, c: c };
    T2.secCadeia(ctx, c);
    T2.secCrus(ctx, c);
    T2.secResultado(ctx, c);
  }

  /* abre o lote de uma blueprint com 1 run; numa BPC o campo Runs não passa de cópias × runs da cópia;
     na BPO simulada (b.sim, blueprint fora do estoque) ME e TE viram campos */
  function abre(I, b, E, BPS){
    var prod = I.produto.get(I.k(FAB, b.t));                      // item fabricado e unidades por run
    if (!prod) return;
    var ctx = { I: I, bp: b.t, bpT2: b.t, item: prod.t, qRun: prod.q, producao: true,
                meBp: b.me, teBp: b.te, E: E, BPS: BPS, chanceBase: 0, sk: { sci: [], enc: null },
                jobs: 1, sobra: 0, runs: 1, maxRuns: b.copia ? b.runs * b.qt : null, sim: !!b.sim };
    T2.ligaJanela(ctx, SEL, { ts: jTs, aviso: jAviso }, function(){ return atual === ctx; }, desenha);
    ctx.ids = Array.from(T2.arvore(I, ctx.item, ctx.bpT2).keys());
    atual = ctx;
    jTitulo.textContent = ctx.nome(ctx.item);
    jRuns.max = ctx.maxRuns ? String(ctx.maxRuns) : "";
    jMax.hidden = !ctx.maxRuns;
    jMeL.hidden = jTeL.hidden = !ctx.sim;
    jMe.value = String(b.me); jTe.value = String(b.te);
    jRuns.value = "1";
    jBp.textContent = ctx.sim ? "BPO simulada (não está no estoque)" : (b.copia ? "BPC" : "BPO") + ": ME " + b.me + " / TE " + b.te + (b.copia ? " / " + b.qt + " × " + b.runs + " runs = " + ctx.maxRuns : "");
    WIN.open("w-prodjob");
    T2.carrega(ctx);
    desenha();
  }

  jNerd.addEventListener("click", function(){
    Nerds.abre(ultimo ? ultimo.ctx.nome(ultimo.ctx.item) : "", ultimo && T2.gruposNerd(ultimo.ctx, ultimo.c));
  });
  jRuns.addEventListener("input", desenha);
  jMe.addEventListener("input", desenha);
  jTe.addEventListener("input", desenha);
  jMax.addEventListener("click", function(){ if (atual && atual.maxRuns){ jRuns.value = String(atual.maxRuns); desenha(); } });
  jBtn.addEventListener("click", function(){ if (atual) T2.carrega(atual, true); });

  /* ---------------- janela Produzir: as blueprints do estoque do Tudão que fabricam algo ---------------- */
  var grid = document.getElementById("prod-grid"), nota = document.getElementById("prod-nota");

  /* seção de cada blueprint pela categoria do que ela fabrica (categoria e grupo do jogo, via ESI):
     nave (6) · rig (módulo, grupo "Rig …") · módulo (7) · munição (8) · o resto em Outros */
  var SECOES = ["Naves", "Rigs", "Módulos", "Munição", "Outros"];
  var bBrave = document.getElementById("prod-brave"), soBrave = false;   // só o que as doutrinas da Brave importadas usam
  async function desenhaGrid(){
    var I = await CV.industria(), G = {};
    var doutrina = new Set((Brave.naves() || { naves: [] }).naves.map(function(n){ return n.tipo; }));
    function produto(b){ return I.produto.get(I.k(FAB, b.t)).t; }
    return CV.listaBps({ grid: grid, nota: nota, busca: document.getElementById("prod-busca"), vazio: soBrave ? "Nenhuma blueprint do estoque fabrica algo das doutrinas da Brave." : "Nenhuma blueprint de fabricação no estoque.",
                         simula: true,
                         aceita: function(tipo){ return I.produto.has(I.k(FAB, tipo)) && (!soBrave || doutrina.has(produto({ t: tipo }))); },
                         secoes: SECOES,
                         tituloFaltam: "Blueprints que faltam para as naves das doutrinas",
                         faltam: function(lista){
                           if (!soBrave) return [];
                           var tem = new Set(lista.map(produto));
                           return Brave.naves().naves.filter(function(n){ return n.meta !== "Faction" && !tem.has(n.tipo); })
                             .sort(function(a, b){ return b.fits - a.fits || a.nome.localeCompare(b.nome); })
                             .map(function(n){
                               var bp = (I.porProd.get(n.tipo) || []).filter(function(x){ return x.act === FAB; })[0];
                               return bp && { t: bp.bp, nome: n.nome, dados: n.meta + " / fits: " + n.fits };
                             }).filter(Boolean);
                         },
                         prepara: async function(lista, T){
                           G = await CV.grupos(Array.from(new Set(lista.map(function(b){ return (T.get(produto(b)) || {}).group; }))));
                         },
                         secao: function(b, T){
                           var g = G[(T.get(produto(b)) || {}).group] || {};
                           return g.c === 6 ? "Naves" : g.c === 7 ? (/^Rig /.test(g.n) ? "Rigs" : "Módulos")
                                : g.c === 8 ? "Munição" : "Outros";
                         },
                         aoAbrir: function(b, snap){ abre(I, b, CV.estoquePorTipo(snap), T2.bpsDoEstoque(snap)); } });
  }

  bBrave.addEventListener("click", function(){
    soBrave = !soBrave;
    bBrave.setAttribute("aria-pressed", String(soBrave));
    desenhaGrid().catch(function(e){ console.error(e); nota.textContent = "Erro: " + e.message; });
  });

  document.getElementById("ic-prod").addEventListener("click", function(){
    WIN.open("w-prod");
    SEL.desenha();
    var temCsv = !!Brave.naves();                     // o botão só existe com um CSV da Brave importado
    bBrave.hidden = !temCsv;
    if (!temCsv){ soBrave = false; bBrave.setAttribute("aria-pressed", "false"); }
    desenhaGrid().catch(function(e){ console.error(e); nota.textContent = "Erro: " + e.message; });
  });
})();
