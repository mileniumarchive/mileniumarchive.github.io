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
      "order de Jita 4-4 + frete por unidade)), para os itens em que Jita sai mais barato\n\nO frete por unidade é o do freighter service " +
      "escolhido. O frete mínimo por contrato não entra.", ver: ["Compra (E)"] },
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

    /* lista de compra (Invenção T2, Produzir e Fuel Blocks) */
    "Que diabo são esses check box?": { t: "Clipboard E e Clipboard J copiam a lista de compra, um item por linha " +
      "(nome, tab, quantidade): o Comprar (un) da Cadeia e dos Insumos crus e, na invenção, os datacores e o decryptor do " +
      "lote. O E leva só o que a melhor rota manda comprar na estrutura; o J, só o que manda comprar em Jita.\n\n" +
      "Comprar tudo — conta como se o estoque (e o que está em job) estivesse vazio: compra tudo o que o ciclo consome. " +
      "A rota de cada item e a decisão de produzir ou comprar continuam as mesmas, e os dois clipboards continuam " +
      "separados. Desmarcar desmarca o COMPRAR TUDO DE VERDADE.\n\n" +
      "COMPRAR TUDO DE VERDADE — só aparece com Comprar tudo marcado. Junta os dois clipboards num botão só, Clipboard " +
      "(tudo), com a lista completa, estrutura e Jita juntas.\n\n" +
      "Não gosto de reação — independe dos outros. Nada da cadeia é produzido: todos os materiais da blueprint do item " +
      "final são comprados prontos, cada um na mais barata entre estrutura e Jita, e só se faz o job do item final. " +
      "Material sem ordem de venda em nenhuma das duas continua sendo produzido. Sozinho, desconta o estoque; com Comprar " +
      "tudo, não; com os três, é a lista de todos os materiais da blueprint do item final, num clipboard só.\n\n" +
      "A Cadeia, os Insumos crus e o Resultado refletem o que estiver marcado." },

    /* Loot Appraiser */
    "frete por unidade": { t: "frete por unidade = MAX(ISK por m³ × volume da unidade ; % do colateral × preço da unidade)\n\n" +
      "Do freighter service escolhido. No Loot Appraiser o colateral é o maior buy de Jita do item. O frete mínimo por " +
      "contrato não entra." },
    "Scrapmetal Processing": { t: "Nível da skill Scrapmetal Processing do personagem escolhido (ESI). Sem personagem, 0.\n\n" +
      "Cada nível soma o bônus da skill ao rendimento de reprocesso de itens (o refiningYieldMutator dela, no dogma do SDE)." },
    "Rendimento de refino (estrutura)": { t: "Rendimento de refino (estrutura) = base da estrutura × (1 + bônus por nível × " +
      "nível de Scrapmetal Processing)\n\nA base é o refiningYieldMultiplier do Standup Reprocessing Facility I, do dogma " +
      "do SDE. É a fração da receita de reprocesso que volta.", ver: ["Scrapmetal Processing"] },
    "Rendimento de refino (Jita)": { t: "Rendimento de refino (Jita) = base de Jita 4-4 × (1 + bônus por nível × nível de " +
      "Scrapmetal Processing)\n\nA base é o reprocessing_efficiency da estação, da ESI (/universe/stations/).",
      ver: ["Scrapmetal Processing"] },
    "Taxa de refino (estrutura)": { t: "Campo Taxa de refino (%) da estrutura de refino escolhida, em Cadastrar Estruturas " +
      "(a ESI não informa). Sai do que o reprocesso devolve." },
    "Taxa de refino (Jita)": { t: "reprocessing_stations_take de Jita 4-4, da ESI (/universe/stations/). É a taxa base da " +
      "estação, sem o desconto de standing. Sai do que o reprocesso devolve." },
    "Lote — Estrutura": { t: "Lote — Estrutura = soma, de cada item, de (quantidade × maior buy order do mercado escolhido × " +
      "(1 − sales tax))\n\nVender o lote inteiro direto no buy da estrutura.", ver: ["sales tax"] },
    "Lote — Jita": { t: "Lote — Jita = soma, de cada item, de (quantidade × (maior buy order de Jita 4-4 × (1 − sales tax) − " +
      "frete por unidade))\n\nMandar o lote inteiro para Jita e vender direto no buy.", ver: ["sales tax", "frete por unidade"] },
    "Lote — Refino na estrutura": { t: "Lote — Refino na estrutura = soma, de cada item que refina, de (minerais de ⌊quantidade ÷ " +
      "lote⌋ lotes × rendimento × (1 − taxa) × maior buy do mercado × (1 − sales tax)) + a sobra abaixo de um lote no buy do " +
      "mercado\n\nItem que não refina entra inteiro, vendido no buy do mercado (o mesmo que Lote — Estrutura). Misturar " +
      "itens que refinam com itens que não refinam pode deixar o appraisal de refino impreciso.",
      ver: ["Rendimento de refino (estrutura)", "Taxa de refino (estrutura)", "sales tax", "Lote — Estrutura"] },
    "Lote — Refino em Jita": { t: "Lote — Refino em Jita = soma, de cada item que refina, de (minerais de ⌊quantidade ÷ lote⌋ " +
      "lotes × rendimento × (1 − taxa) × maior buy de Jita × (1 − sales tax) − quantidade × frete por unidade) + a sobra abaixo " +
      "de um lote no buy de Jita\n\nO frete é do item inteiro, antes de reprocessar. Item que não refina entra inteiro, " +
      "vendido no buy de Jita (o mesmo que Lote — Jita). Misturar itens que refinam com itens que não refinam pode deixar o " +
      "appraisal de refino impreciso.",
      ver: ["Rendimento de refino (Jita)", "Taxa de refino (Jita)", "sales tax", "frete por unidade", "Lote — Jita"] }
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
