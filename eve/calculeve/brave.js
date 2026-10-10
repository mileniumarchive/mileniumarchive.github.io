/* ---------- Brave: importa o CSV da tabela Ship Overview do site de doutrinas ----------
   O CSV fica em `calculeve.brave.naves`, inteiro: cada importação substitui a anterior. As outras janelas leem
   por Brave.naves(). Colunas lidas pela posição, porque "% Jita" aparece três vezes. */
var Brave = (function(){
  "use strict";
  var CHAVE = "calculeve.brave.naves";     // { ts, naves: [...] }
  var NCOLUNAS = 18, COL_NOME = 2, COL_TIPO = "Ship Type";
  var arq = document.getElementById("brave-arq"), msg = document.getElementById("brave-msg");

  /* { ts, naves: [{ grupo, tipo, nome, meta, fits, minimo, estoque, estoquePc, perdidas, vendidas7d,
                     lowSell, lowPc, avgSell, avgPc, highSell, highPc, jitaSell, modulos }] } ou null */
  function naves(){ return CV.lsGet(CHAVE, null); }

  function converte(txt){
    var linhas = CV.csv(txt);
    if (!linhas.length || linhas[0].length !== NCOLUNAS || linhas[0][COL_NOME] !== COL_TIPO)
      throw new Error("não é o CSV do Ship Overview");
    return linhas.slice(1).filter(function(l){ return l.length === NCOLUNAS; }).map(function(l){
      var n = l.map(Number), t = /\/types\/(\d+)\//.exec(l[1]);
      return { grupo: l[0], tipo: t ? Number(t[1]) : null, nome: l[2], meta: l[3], fits: n[4], minimo: n[5], estoque: n[6],
               estoquePc: n[7], perdidas: n[8], vendidas7d: n[9], lowSell: n[10], lowPc: n[11], avgSell: n[12],
               avgPc: n[13], highSell: n[14], highPc: n[15], jitaSell: n[16], modulos: n[17] };
    });
  }

  function mostra(){
    var s = naves();
    msg.textContent = s ? s.naves.length + " naves importadas em " + CV.dataHora(s.ts) + "." : "Nenhum CSV importado.";
  }

  document.getElementById("ic-brave").addEventListener("click", function(){ mostra(); WIN.open("w-brave"); });
  document.getElementById("brave-ok").addEventListener("click", function(){ arq.value = ""; arq.click(); });
  arq.addEventListener("change", function(){
    var f = arq.files[0];
    if (!f) return;
    f.text().then(function(txt){
      var lista = converte(txt);
      if (!lista.length) throw new Error("o arquivo não tem naves");
      if (!CV.lsSet(CHAVE, { ts: Date.now(), naves: lista })) throw new Error("não coube no navegador");
      mostra();
    }).catch(function(e){ msg.textContent = "Não importou: " + e.message; });
  });

  return { naves: naves };
})();
