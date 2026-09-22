/* ==========================================================================
   nerds.js — janela "Números para Nerds" (Nerds), comum a toda a Calculeve.
   Mostra grupos de [nome, valor em ISK]; o nome que tem explicação em EXPLICA vira botão (Nerds.rotulo,
   que qualquer janela usa para o mesmo nome) e o valor de Delta sai verde/vermelho pelo sinal.
   Textos genéricos: servem para qualquer item fabricado, em qualquer janela.
   ========================================================================== */
var Nerds = (function(){
  "use strict";
  var el = CV.el;
  /* uma explicação por métrica, com a conta dela: { t: texto (linhas separadas por \n), ver: [métricas citadas] }.
     O que ela cita não é explicado de novo: vira botão embaixo do texto e abre a explicação própria. */
  var EXPLICA = {
    "sales tax": { t: "sales tax = 7,5% × (1 − 11% × nível de Accounting do personagem)\n\n" +
      "Paga quando o item vende, sobre o valor da venda." },
    "broker": { t: "broker = 0,5% da SCC + broker do dono da estrutura (cadastrado)\n\n" +
      "Pago ao criar uma ordem (sell ou buy), sobre o valor dela. Vender ou comprar direto numa ordem que já existe não paga." },
    "ReceitaSellMerc": { t: "ReceitaSellMerc = quantidade produzida × menor sell order do mercado × (1 − broker − sales tax)\n\n" +
      "Vender o item fabricado pondo uma sell order no preço da menor sell.", ver: ["broker", "sales tax"] },
    "ReceitaBuyMerc": { t: "ReceitaBuyMerc = quantidade produzida × maior buy order do mercado × (1 − sales tax)\n\n" +
      "Vender o item fabricado direto na maior buy order.", ver: ["sales tax"] },
    "Compra (E)": { t: "Compra (E) = soma, de cada item que o ciclo consome, de (quantidade do ciclo × menor sell " +
      "order do mercado escolhido), para os itens em que a estrutura sai mais barata que Jita com frete\n\n" +
      "Comprar direto de uma sell order que já existe não paga taxa. Não desconta estoque: material tirado do " +
      "estoque custa o que custaria comprar de novo." },
    "Compra (J)": { t: "Compra (J) = soma, de cada item que o ciclo consome, de (quantidade do ciclo × (menor sell " +
      "order de Jita 4-4 + frete por unidade)), para os itens em que Jita sai mais barato, mais o frete mínimo por " +
      "contrato\n\nO frete por unidade é o do freighter service escolhido; o mínimo é pago uma vez, se houver " +
      "qualquer compra em Jita.", ver: ["Compra (E)"] },
    "Custo dos jobs": { t: "Custo dos jobs = soma, de cada job da cadeia, de (runs × EIV da receita × índice de " +
      "custo do sistema)\n\nO EIV é a receita em quantidade base (ME 0) pelo adjusted_price da ESI; o índice é o " +
      "da atividade (fabricação ou reação) no sistema da fábrica escolhida. O job de invenção não entra." },
    "Total investido": { t: "Total investido = Compra (E) + Compra (J) + Custo dos jobs\n\n" +
      "Tudo que o ciclo consome comprado, estoque nenhum. É a base do Lucro e do ROI.",
      ver: ["Compra (E)", "Compra (J)", "Custo dos jobs"] },
    "Lucro": { t: "Lucro = Receita − Total investido", ver: ["Total investido"] },
    "Desembolso do ciclo": { t: "Desembolso do ciclo = o que ainda falta comprar depois do estoque, mais o custo " +
      "dos jobs que faltam rodar\n\nÉ o dinheiro que sai agora. Não é a base do ROI: o que veio do estoque não é " +
      "de graça, só já foi pago.", ver: ["Total investido"] },
    "ReceitaSellJita": { t: "ReceitaSellJita = quantidade produzida × (menor sell order de Jita 4-4 × " +
      "(1 − broker − sales tax) − frete por unidade)\n\nMandar para Jita e vender pondo uma sell order no preço " +
      "da menor sell. O broker do 4-4 é NPC e não é o mesmo da estrutura: aqui entra o da estrutura, como " +
      "aproximação.", ver: ["broker", "sales tax"] },
    "ReceitaBuyJita": { t: "ReceitaBuyJita = quantidade produzida × (maior buy order de Jita 4-4 × " +
      "(1 − sales tax) − frete por unidade)\n\nMandar para Jita e vender direto na maior buy order.",
      ver: ["sales tax"] },
    "Total a comprar": { t: "Total a comprar = soma, de cada material com Saldo negativo, de (quantidade que falta × " +
      "menor sell order do mercado)\n\nComprar direto da sell order não paga taxa. Material que o estoque cobre entra com custo 0." },
    "VendaInsumosBuyMerc": { t: "VendaInsumosBuyMerc = soma, de cada material, de (Necessário × maior buy order do mercado × " +
      "(1 − sales tax))\n\nVender direto na buy order todos os materiais que o job consome, em vez de fabricar.", ver: ["sales tax"] },
    "VendaInsumosSellMerc": { t: "VendaInsumosSellMerc = soma, de cada material, de (Necessário × menor sell order do mercado × " +
      "(1 − broker − sales tax))\n\nVender todos os materiais que o job consome pondo sell orders no preço da menor sell, em vez de fabricar.",
      ver: ["broker", "sales tax"] },
    DeltaSellMerc: { t: "DeltaSellMerc = ReceitaSellMerc − Total a comprar\n\n" +
      "Positivo: vendendo o item em sell order, sobra dinheiro depois de comprar o que falta dos materiais.",
      ver: ["ReceitaSellMerc", "Total a comprar"] },
    DeltaBuyMerc: { t: "DeltaBuyMerc = ReceitaBuyMerc − Total a comprar\n\n" +
      "Positivo: vendendo o item direto na buy order, sobra dinheiro depois de comprar o que falta dos materiais.",
      ver: ["ReceitaBuyMerc", "Total a comprar"] },
    DeltaSellInsumos: { t: "DeltaSellInsumos = ReceitaSellMerc − VendaInsumosBuyMerc\n\n" +
      "Positivo: fabricar e vender o item em sell order rende mais que vender os materiais.",
      ver: ["ReceitaSellMerc", "VendaInsumosBuyMerc"] },
    DeltaBuyInsumos: { t: "DeltaBuyInsumos = ReceitaBuyMerc − VendaInsumosBuyMerc\n\n" +
      "Positivo: fabricar e vender o item direto na buy order rende mais que vender os materiais.",
      ver: ["ReceitaBuyMerc", "VendaInsumosBuyMerc"] },
    DeltaSellInsumosSell: { t: "DeltaSellInsumosSell = ReceitaSellMerc − VendaInsumosSellMerc\n\n" +
      "Positivo: fabricar e vender o item em sell order rende mais que vender os materiais em sell order.",
      ver: ["ReceitaSellMerc", "VendaInsumosSellMerc"] },
    DeltaBuyInsumosSell: { t: "DeltaBuyInsumosSell = ReceitaBuyMerc − VendaInsumosSellMerc\n\n" +
      "Positivo: fabricar e vender o item direto na buy order rende mais que vender os materiais em sell order.",
      ver: ["ReceitaBuyMerc", "VendaInsumosSellMerc"] }
  };

  /* rótulo de uma métrica: botão que abre a explicação se ela existe, senão texto */
  function rotulo(nome){
    if (!EXPLICA[nome]) return el("span", null, nome);
    var b = el("button", "btn explica", nome);
    b.addEventListener("click", function(){ explica(nome); });
    return b;
  }

  /* abre (ou troca) a janela de explicação; os termos citados viram botões embaixo do texto */
  function explica(nome){
    var e = EXPLICA[nome], ver = document.getElementById("explica-ver");
    document.getElementById("explica-title").textContent = nome;
    document.getElementById("explica-texto").textContent = e.t;
    ver.innerHTML = "";
    (e.ver || []).forEach(function(n){ ver.appendChild(rotulo(n)); });
    WIN.open("w-explica");
  }

  /* abre a janela: `titulo` vai depois de "Números para Nerds — "; `grupos` = [[[nome, valor], …], …]
     (valor null = NÃO TEM); sem grupos, avisa que faltam dados */
  function abre(titulo, grupos){
    var body = document.getElementById("nerd-body");
    document.getElementById("nerd-title").textContent = "Números para Nerds" + (titulo ? " — " + titulo : "");
    body.innerHTML = "";
    if (!grupos) body.appendChild(el("div", "status", "Sem números: sem mercado (SP), sem ordem ou preço ainda carregando."));
    else grupos.forEach(function(g){
      var tab = el("table", "as nerd"), tb = el("tbody");
      g.forEach(function(l){
        var tr = el("tr"), nome = el("td");
        nome.appendChild(rotulo(l[0]));
        var v = l[1] == null ? "NÃO TEM" : typeof l[1] === "string" ? l[1] : Mercado.isk(l[1]);
        tr.append(nome, el("td", "n" + (/^Delta|^Lucro/.test(l[0]) ? CV.sinal(l[1]) : ""), v));
        tb.appendChild(tr);
      });
      tab.appendChild(tb); body.appendChild(tab);
    });
    WIN.open("w-nerd");
  }

  return { abre: abre, rotulo: rotulo, EXPLICA: EXPLICA };
})();
