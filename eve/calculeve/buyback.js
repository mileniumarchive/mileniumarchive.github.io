/* ---------- Cadastrar Buyback: programas de buyback digitados à mão, salvos no navegador ----------
   Cada buyback: nome, % do Jita buy e exceções por grupo ou por item, com taxa adicional em pontos percentuais
   (93% com 3 de taxa adicional = 90%). O preço sai de Mercado.buyback. */
var Buyback = (function(){
  "use strict";
  var el = CV.el;
  var CHAVE = "calculeve.buybacks";    // [{ id, nome, pct, exc: [{ tipo: "g"|"i", id, nome, taxa }] }]
  var MAX_RES = 15;
  var lista = document.getElementById("bb-lista"), form = document.getElementById("bbf-form"),
      titulo = document.getElementById("bbf-title"), excBox = document.getElementById("bbf-exc"),
      resBox = document.getElementById("bbf-res"), q = document.getElementById("bbf-q");
  var editando = null, exc = [];       // id em edição (null = novo) · exceções do formulário aberto

  function le(){ return CV.lsGet(CHAVE, []); }
  function grava(l){ CV.lsSet(CHAVE, l); desenha(); }
  function pctTxt(v){ return CV.fmt.qtd.format(v) + "%"; }

  function desenha(){
    var l = le(); lista.innerHTML = "";
    if (!l.length){ lista.appendChild(el("div", "vazio", "Nenhum buyback cadastrado.")); return; }
    l.forEach(function(b){
      var row = el("div", "cad"), ed = el("button", "btn", "Editar"), rm = el("button", "btn alerta", "Remover");
      row.appendChild(el("b", null, b.nome));
      row.appendChild(el("span", "sub", pctTxt(b.pct) + " do Jita buy · " + (b.exc || []).length +
                                        ((b.exc || []).length === 1 ? " exceção" : " exceções")));
      ed.addEventListener("click", function(){ abreForm(b); });
      rm.addEventListener("click", function(){ grava(le().filter(function(x){ return x.id !== b.id; })); });
      row.append(ed, rm);
      lista.appendChild(row);
    });
  }

  /* exceções do formulário: nome, Grupo/Item, taxa adicional editável, remover */
  function desenhaExc(){
    excBox.innerHTML = "";
    if (!exc.length){ excBox.appendChild(el("div", "vazio", "Nenhuma exceção.")); return; }
    exc.forEach(function(x){
      var row = el("div", "cad"), rm = el("button", "btn alerta", "Remover"), lab = el("label", "bb-taxa", "Taxa adicional (%) ");
      var inp = el("input", "campo campo-num"); inp.type = "number"; inp.step = "any"; inp.value = x.taxa;
      inp.addEventListener("input", function(){ x.taxa = Number(inp.value) || 0; });
      lab.appendChild(inp);
      rm.type = "button";
      rm.addEventListener("click", function(){ exc = exc.filter(function(y){ return y !== x; }); desenhaExc(); });
      row.append(el("b", null, x.nome), el("span", "sub", x.tipo === "g" ? "Grupo" : "Item"), lab, rm);
      excBox.appendChild(row);
    });
  }
  function adiciona(tipo, id, nome){
    if (exc.some(function(x){ return x.tipo === tipo && x.id === id; })) return;
    exc.push({ tipo: tipo, id: id, nome: nome, taxa: 0 });
    desenhaExc();
  }

  /* busca de item publicado no SDE (mín. 3 letras): cada resultado adiciona o item ou o grupo dele */
  var geracao = 0;
  var termo = CV.busca(q, function(){ buscaItens(); });
  async function buscaItens(){
    var t = termo(), g = ++geracao;
    resBox.innerHTML = "";
    if (t.length < 3) return;
    var T = await CV.tipos(), achados = [];
    T.forEach(function(x, id){ if (x.pub && CV.contem(x.name, t)) achados.push({ id: id, x: x }); });
    if (g !== geracao) return;
    achados.sort(function(a, b){ return a.x.name.localeCompare(b.x.name); });
    var mais = achados.length > MAX_RES; achados = achados.slice(0, MAX_RES);
    if (!achados.length){ resBox.appendChild(el("div", "vazio", "Nada com esse nome.")); return; }
    var G = {};
    try { G = await CV.grupos(Array.from(new Set(achados.map(function(a){ return a.x.group; })))); } catch(e){ console.error(e); }
    if (g !== geracao) return;
    achados.forEach(function(a){
      var gn = (G[a.x.group] || {}).n || "grupo " + a.x.group;
      var row = el("div", "cad"), bi = el("button", "btn", "+ Item"), bg = el("button", "btn", "+ Grupo: " + gn);
      bi.type = bg.type = "button";
      bi.addEventListener("click", function(){ adiciona("i", a.id, a.x.name); });
      bg.addEventListener("click", function(){ adiciona("g", a.x.group, gn); });
      row.append(el("b", null, a.x.name), bi, bg);
      resBox.appendChild(row);
    });
    if (mais) resBox.appendChild(el("div", "nota", "Mostrando os " + MAX_RES + " primeiros. Refine a busca."));
  }

  function abreForm(b){
    editando = b ? b.id : null;
    titulo.textContent = b ? "Buyback — " + b.nome : "Novo buyback";
    form.elements.nome.value = b ? b.nome : "";
    form.elements.pct.value = b && b.pct != null ? b.pct : "";
    exc = b ? (b.exc || []).map(function(x){ return Object.assign({}, x); }) : [];
    q.value = ""; resBox.innerHTML = "";
    desenhaExc();
    WIN.open("w-bb-form");
  }

  form.addEventListener("submit", function(ev){
    ev.preventDefault();
    var b = { id: editando || Date.now(), nome: form.elements.nome.value.trim(),
              pct: Number(form.elements.pct.value) || 0, exc: exc };
    var l = le().filter(function(x){ return x.id !== b.id; });
    l.push(b);
    grava(l);
    WIN.close("w-bb-form");
  });

  document.getElementById("bb-add").addEventListener("click", function(){ abreForm(null); });
  document.getElementById("ic-bb").addEventListener("click", function(){ desenha(); WIN.open("w-bb"); });

  /* grade do Resultado (Fuel Blocks, Invenção T2, Produzir) com cada buyback cadastrado:
     "Buyback — nome (%)" e qtd × Jita buy × % (Mercado.buyback). `jitaBuy` = maior buy de Jita do item (null sem ordem),
     ou um texto ("carregando…") que vai no lugar do valor. Sem buyback cadastrado, não desenha nada. */
  var POR_LINHA = 5;
  function grade(alvo, tipo, grupo, jitaBuy, qtd){
    var l = le();
    if (!l.length) return;
    var pares = l.map(function(b){
      var r = Mercado.buyback(b, tipo, grupo, typeof jitaBuy === "number" ? jitaBuy : null);
      return ["Buyback — " + b.nome + " (" + pctTxt(r.pct) + ")",
              typeof jitaBuy === "string" ? jitaBuy : Mercado.iskOuNaoTem(r.un == null ? null : r.un * qtd)];
    });
    var tab = el("table", "as grade"), tb = el("tbody");
    for (var i = 0; i < pares.length; i += POR_LINHA){
      var faixa = pares.slice(i, i + POR_LINHA), hr = el("tr", "rot"), vr = el("tr");
      faixa.forEach(function(par){ hr.appendChild(el("th", "c", par[0])); vr.appendChild(el("td", "c", par[1])); });
      for (var f = faixa.length; f < POR_LINHA; f++){ hr.appendChild(el("th")); vr.appendChild(el("td")); }
      tb.append(hr, vr);
    }
    tab.appendChild(tb); alvo.appendChild(tab);
  }

  return { grade: grade };
})();
