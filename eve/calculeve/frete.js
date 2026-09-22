/* ---------- Cadastrar Freighter Service: fretes digitados à mão, salvos no navegador ----------
   Cada serviço: nome, ISK por m³, % do colateral e frete mínimo por contrato (§4 do DOC_planilha). */
(function(){
  "use strict";
  var el = CV.el;
  var CHAVE = "calculeve.fretes";      // [{ id, nome, iskM3, pctColat, minimo }]
  var CAMPOS = ["iskM3", "pctColat", "minimo"];
  var lista = document.getElementById("frete-lista"), form = document.getElementById("ff-form"),
      titulo = document.getElementById("ff-title");
  var editando = null;                 // id do serviço em edição; null = novo

  function le(){ return CV.lsGet(CHAVE, []); }
  function grava(l){ CV.lsSet(CHAVE, l); desenha(); }

  function desenha(){
    var l = le(); lista.innerHTML = "";
    if (!l.length){ lista.appendChild(el("div", "vazio", "Nenhum freighter service cadastrado.")); return; }
    l.forEach(function(f){
      var row = el("div", "cad"), ed = el("button", "btn", "Editar"), rm = el("button", "btn alerta", "Remover");
      row.appendChild(el("b", null, f.nome));
      row.appendChild(el("span", "sub", Mercado.isk(f.iskM3) + " ISK/m³ · " + f.pctColat + "% colateral · mín. " +
                                        Mercado.isk(f.minimo) + " ISK"));
      ed.addEventListener("click", function(){ abreForm(f); });
      rm.addEventListener("click", function(){ grava(le().filter(function(x){ return x.id !== f.id; })); });
      row.append(ed, rm);
      lista.appendChild(row);
    });
  }

  function abreForm(f){
    editando = f ? f.id : null;
    titulo.textContent = f ? "Freighter service — " + f.nome : "Novo freighter service";
    form.elements.nome.value = f ? f.nome : "";
    CAMPOS.forEach(function(k){ form.elements[k].value = f && f[k] != null ? f[k] : ""; });
    WIN.open("w-frete-form");
  }

  form.addEventListener("submit", function(ev){
    ev.preventDefault();
    var f = { id: editando || Date.now(), nome: form.elements.nome.value.trim() };
    CAMPOS.forEach(function(k){ f[k] = Number(form.elements[k].value) || 0; });
    var l = le().filter(function(x){ return x.id !== f.id; });
    l.push(f);
    grava(l);
    WIN.close("w-frete-form");
  });

  document.getElementById("frete-add").addEventListener("click", function(){ abreForm(null); });
  document.getElementById("ic-frete").addEventListener("click", function(){ desenha(); WIN.open("w-frete"); });
})();
