/* ---------- Fuel Blocks: atalho do Produzir para as blueprints de fuel block e os isótopos, do estoque salvo do Tudão.
   O clique abre o lote do Produzir (Produzir.abre) com as escolhas desta janela. ---------- */
(function(){
  "use strict";
  var el = CV.el;
  var GRUPO_FUEL = 1136;                // groupID "Fuel Block" no invTypes
  var FABRICACAO = CV.ATIV.FAB;
  var ME_SEM_BP = 10;                   // ME da BPO simulada quando o isótopo não tem blueprint no estoque
  var ISOTOPOS = ["Helium Isotopes", "Hydrogen Isotopes", "Nitrogen Isotopes", "Oxygen Isotopes"];
  var fmtInt = CV.fmt.int;

  /* ---------------- escolhas: char que fabrica, mercado, fábrica e freighter service ----------------
     Componente comum (CV.seletores), com chaves próprias; trocar refaz a conta do lote aberto por esta janela. */
  var SEL = CV.seletores("fuel", { char: "calculeve.fuel.char", merc: "calculeve.fuel.mercado",
                                   fab: "calculeve.fuel.fabrica", reac: "calculeve.fuel.reacao", frete: "calculeve.fuel.frete" },
                         function(){ Produzir.recarrega(SEL); });
  document.getElementById("w-fuel").addEventListener("fechou", SEL.fecha);

  var grid = document.getElementById("fuel-grid"), iso = document.getElementById("fuel-iso"),
      nota = document.getElementById("fuel-nota");

  /* typeID da blueprint de fuel block -> [{ t: material, q: qtd base (ME 0) por run }], do índice comum do SDE */
  var receitasP = null;
  function receitas(){
    if (!receitasP) receitasP = CV.industria().then(function(I){
      var m = new Map();
      I.produto.forEach(function(p, k){
        var par = k.split("|"), prod = I.T.get(p.t);
        if (par[0] !== FABRICACAO || !prod || prod.group !== GRUPO_FUEL) return;
        m.set(Number(par[1]), I.mat.get(k) || []);
      });
      return m;
    });
    return receitasP;
  }

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
      ic.addEventListener("click", function(){ Produzir.abre(b, snap, SEL); });
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
        Produzir.abre(melhor || { t: bpTipo, me: ME_SEM_BP, te: 0, copia: false, qt: 1, runs: 0, sim: true }, snap, SEL);
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
