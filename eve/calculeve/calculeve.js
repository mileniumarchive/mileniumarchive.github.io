/* ==========================================================================
   calculeve.js — utilidades comuns da Calculeve (CV) e a própria página:
   área de trabalho, janela Personagens e "Apagar dados".
   Carregado antes de sso.js e estoque.js, que usam o CV. A montagem da página
   espera o DOMContentLoaded, quando todos os scripts já foram lidos.
   ========================================================================== */
var CV = (function(){
  "use strict";
  var IMG = "https://images.evetech.net";
  var fmtDH = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  /* localStorage tolerante a falha (aba privada, cota cheia): devolve `padrao` se não houver valor */
  function lsGet(k, padrao){
    try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? padrao : v; }
    catch(e){ return padrao; }
  }
  function lsSet(k, v){
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch(e){ console.warn("não salvou " + k + ": " + e.message); return false; }
  }

  /* cria elemento com classe e texto opcionais (button já sai com type="button") */
  function el(tag, cls, txt){
    var e = document.createElement(tag);
    if (tag === "button") e.type = "button";
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  /* imagem do servidor da CCP; some (classe .falhou) se não carregar */
  function imagem(url, cls){
    var i = el("img", cls); i.alt = ""; i.loading = "lazy"; i.src = url;
    i.onerror = function(){ i.classList.add("falhou"); };
    return i;
  }
  function retrato(id, cls){ return imagem(IMG + "/characters/" + id + "/portrait?size=64", cls); }
  /* variante: "icon" (item comum), "bp" (BPO/fórmula) ou "bpc" (cópia) */
  function iconeTipo(typeId, variante){ return imagem(IMG + "/types/" + typeId + "/" + variante + "?size=32", "ico"); }

  /* classe de cor pelo sinal: " pos" (verde), " neg" (vermelho) ou "" no zero/sem número */
  function sinal(v){ return typeof v !== "number" ? "" : v > 0 ? " pos" : v < 0 ? " neg" : ""; }

  /* "dd/mm hh:mm" */
  function dataHora(d){ var x = new Date(d); return isNaN(x) ? "?" : fmtDH.format(x); }

  /* ---------- SDE (sde/*.csv) ----------
     sde(arquivo, colunas) devolve, uma vez por arquivo, as linhas só com as colunas pedidas, na ordem
     pedida (texto cru). Parser próprio porque o invTypes tem descrição com vírgula, aspas e quebra de linha. */
  var sdeP = {};
  function sde(arquivo, colunas){
    var k = arquivo + "|" + colunas.join(",");
    if (!sdeP[k]) sdeP[k] = fetch("sde/" + arquivo).then(function(r){ return r.text(); }).then(function(txt){
      var out = [], i = 0, L = txt.length, row = [], f = "", q = false, idx = null;
      if (txt.charCodeAt(0) === 0xFEFF) i = 1;
      function fimLinha(){
        row.push(f); f = "";
        if (!idx) idx = colunas.map(function(c){ return row.indexOf(c); });
        else if (row.length > 1) out.push(idx.map(function(j){ return row[j]; }));
        row = [];
      }
      for (; i < L; i++){
        var c = txt[i];
        if (q){ if (c === '"'){ if (txt[i + 1] === '"'){ f += '"'; i++; } else q = false; } else f += c; }
        else if (c === '"') q = true;
        else if (c === ",") { row.push(f); f = ""; }
        else if (c === "\n") fimLinha();
        else if (c !== "\r") f += c;
      }
      if (f || row.length) fimLinha();
      return out;
    });
    return sdeP[k];
  }
  /* typeID -> { name, group, vol } */
  var tiposP = null;
  function tipos(){
    if (!tiposP) tiposP = sde("invTypes.csv", ["typeID", "groupID", "typeName", "volume"]).then(function(rows){
      var m = new Map();
      rows.forEach(function(r){ m.set(Number(r[0]), { name: r[2], group: Number(r[1]), vol: Number(r[3]) || 0 }); });
      return m;
    });
    return tiposP;
  }

  /* ---------- ESI ---------- */
  var ESI = "https://esi.evetech.net/latest";
  /* GET (ou POST, com opt.body) na ESI; opt.token = access token. Erro HTTP vira exceção com .status */
  async function esi(path, opt){
    opt = opt || {};
    var h = {};
    if (opt.token) h["Authorization"] = "Bearer " + opt.token;
    if (opt.body) h["Content-Type"] = "application/json";
    var r = await fetch(ESI + path, { method: opt.body ? "POST" : "GET", headers: h,
                                      body: opt.body ? JSON.stringify(opt.body) : undefined });
    if (!r.ok){ var e = new Error("ESI " + r.status + " em " + path); e.status = r.status; throw e; }
    return { json: await r.json(), pages: Number(r.headers.get("X-Pages") || 1) };
  }
  async function esiPaginado(path, token){
    var sep = path.indexOf("?") < 0 ? "?" : "&";
    var r = await esi(path + sep + "page=1", { token: token }), out = r.json;
    for (var p = 2; p <= r.pages; p++) out = out.concat((await esi(path + sep + "page=" + p, { token: token })).json);
    return out;
  }
  /* roda fn em cada item com no máximo n requisições simultâneas */
  async function limite(itens, n, fn){
    var i = 0, out = new Array(itens.length);
    async function w(){ while (i < itens.length){ var k = i++; out[k] = await fn(itens[k]); } }
    await Promise.all(Array.from({ length: Math.min(n, itens.length) }, w));
    return out;
  }
  /* dado estático da ESI com cache no navegador: busca(id) só roda para o id que ainda não está em `chave` */
  async function cacheado(chave, ids, busca){
    var c = lsGet(chave, {}), falta = ids.filter(function(id){ return !(id in c); });
    await limite(falta, 10, async function(id){ try { c[id] = await busca(id); } catch(e){ c[id] = null; } });
    lsSet(chave, c);
    return c;
  }
  /* id do sistema -> { name, sec } */
  function sistemas(ids){ return cacheado("calculeve.cache.sistemas", ids, async function(id){
    var j = (await esi("/universe/systems/" + id + "/")).json; return { name: j.name, sec: j.security_status }; }); }

  /* skills do char (/characters/{id}/skills/, active_skill_level): Promise de Map skill_id -> nível.
     Uma consulta por char enquanto a página está aberta. `c` = { id } de SSO.chars(). */
  var skillsP = {};
  function skills(c){
    if (!skillsP[c.id]) skillsP[c.id] = SSO.token(c.id).then(function(tk){
      return esi("/characters/" + c.id + "/skills/", { token: tk });
    }).then(function(r){
      var m = new Map(); r.json.skills.forEach(function(s){ m.set(s.skill_id, s.active_skill_level); }); return m;
    }).catch(function(e){ delete skillsP[c.id]; throw e; });
    return skillsP[c.id];
  }

  /* chars fictícios de comparação: todas as skills no mesmo nível (usados nos seletores de personagem) */
  var FICTICIOS = [
    { id: "saitama", name: "Saitama", ficticio: true, nivel: 5, img: "Sai.png",
      desc: "Protagonista de One-Punch Man, descrito como o ser mais poderoso da série: derrota qualquer inimigo " +
            "com um único soco, e a falta de desafio lhe causa uma crise existencial. Na Hero Association, é " +
            "herói classe B, rank 7, com o nome de herói Caped Baldy.",
      fonte: "https://onepunchman.fandom.com/wiki/Saitama" },
    { id: "mrsatan", name: "Mr. Satan", ficticio: true, nivel: 0, img: "Satan.png",
      desc: "Campeão Mundial de Artes Marciais e \"protetor da Terra\" em Dragon Ball, com fama muito maior que a " +
            "força real: ganhou o título vencendo lutadores comuns enquanto os guerreiros de verdade lutavam em outro " +
            "lugar. Egocêntrico e fanfarrão no começo, revela-se um homem bom e generoso, cuja influência sobre as " +
            "pessoas vale mais que a habilidade marcial.",
      fonte: "https://dragonball.fandom.com/wiki/Mr._Satan" }
  ];
  function imgFicticio(c){ var i = el("img"); i.alt = ""; i.src = "../../assets/icons/" + c.img; return i; }

  /* ---------- seletores de personagem, mercado, fábrica e freighter service ----------
     Componente comum: qualquer janela que fabrique, compre ou venda escolhe por aqui. A janela põe no
     HTML, para cada seletor, um botão `<prefixo>-<id>-btn` e uma lista `<prefixo>-<id>-lista` (hidden), e
     chama seletores(prefixo, chaves), com `chaves` = { id: chave do localStorage } só dos que ela usa.
     O × ao lado de cada botão tira a escolha; a conta de quem chamou segue sem ela. */
  function estruturas(tipo){ return (lsGet("calculeve.estruturas", {})[tipo]) || []; }
  var DEFS = {
    char:  { vazio: "Escolher personagem",
             opcoes: function(){ return SSO.chars().concat(FICTICIOS); },
             imagem: function(c){ return c.ficticio ? imgFicticio(c) : retrato(c.id); } },
    merc:  { vazio: "Escolher mercado", semOpcao: "Nenhum mercado — cadastre em Cadastrar Estruturas.",
             opcoes: function(){ return estruturas("mercado"); }, imagem: function(e){ return iconeTipo(e.type, "icon"); } },
    fab:   { vazio: "Escolher fábrica", semOpcao: "Nenhuma fábrica — cadastre em Cadastrar Estruturas.",
             opcoes: function(){ return estruturas("industria"); }, imagem: function(e){ return iconeTipo(e.type, "icon"); } },
    frete: { vazio: "Escolher freighter service", semOpcao: "Nenhum freighter service — cadastre em Cadastrar Freighter Service.",
             opcoes: function(){ return lsGet("calculeve.fretes", []).map(function(f){ return { id: f.id, name: f.nome, f: f }; }); },
             imagem: function(){ return el("span", "mascara mascara-freighter"); } }
  };
  /* devolve { desenha, escolhido(id), fecha }; `aoTrocar(id)` é chamado quando a escolha muda */
  function seletores(prefixo, chaves, aoTrocar){
    var sels = Object.keys(chaves).map(function(id){
      var d = DEFS[id], s = { id: id, chave: chaves[id], vazio: d.vazio, semOpcao: d.semOpcao,
                              opcoes: d.opcoes, imagem: d.imagem };
      s.btn = document.getElementById(prefixo + "-" + id + "-btn");
      s.lista = document.getElementById(prefixo + "-" + id + "-lista");
      return s;
    });
    function escolhidoDe(s){
      var id = lsGet(s.chave, null);
      return s.opcoes().filter(function(o){ return o.id === id; })[0] || null;
    }
    function desenhaUm(s){
      var o = escolhidoDe(s);
      s.btn.innerHTML = "";
      if (o){ s.btn.appendChild(s.imagem(o)); s.btn.appendChild(document.createTextNode(o.name)); }
      else s.btn.textContent = s.vazio;
      s.limpa.hidden = !o;
    }
    function fecha(){ sels.forEach(function(s){ s.lista.hidden = true; }); }
    function troca(s, valor){
      lsSet(s.chave, valor); fecha(); desenhaUm(s);
      if (aoTrocar) aoTrocar(s.id);
    }
    sels.forEach(function(s){
      s.limpa = el("button", "btn alerta limpa", "×"); s.limpa.title = "Remover";
      s.limpa.addEventListener("click", function(){ troca(s, null); });
      s.btn.after(s.limpa);
      s.btn.addEventListener("click", function(){
        var aberta = !s.lista.hidden;
        fecha();
        if (aberta) return;
        s.lista.innerHTML = "";
        var ops = s.opcoes();
        if (!ops.length && s.semOpcao) s.lista.appendChild(el("div", "status", s.semOpcao));
        ops.forEach(function(o){
          var b = el("button");
          b.appendChild(s.imagem(o)); b.appendChild(document.createTextNode(o.name));
          b.addEventListener("click", function(){ troca(s, o.id); });
          s.lista.appendChild(b);
        });
        s.lista.hidden = false;
      });
    });
    return { desenha: function(){ sels.forEach(desenhaUm); }, fecha: fecha,
             escolhido: function(id){ return escolhidoDe(sels.filter(function(s){ return s.id === id; })[0]); } };
  }

  return { FICTICIOS: FICTICIOS, imgFicticio: imgFicticio, sinal: sinal, lsGet: lsGet, lsSet: lsSet, el: el, retrato: retrato, iconeTipo: iconeTipo, dataHora: dataHora,
           sde: sde, tipos: tipos,
           esi: esi, esiPaginado: esiPaginado, limite: limite, cacheado: cacheado, sistemas: sistemas,
           skills: skills, seletores: seletores };
})();

document.addEventListener("DOMContentLoaded", function(){
  "use strict";
  var el = CV.el;
  var DIR = "../../assets/wallpapers/calculeve/",
      CRED = "<b>EVE Online</b> — arte oficial © CCP Games · via ";
  Desktop.init({ walls: ["2045024.jpg", "2622303.jpg", "3122843.jpg", "3549235.jpg"].map(function(f){
    return { file: DIR + f,
             badge: CRED + '<a href="https://wallpaperaccess.com/full/' + f + '" target="_blank" rel="noopener">WallpaperAccess</a>' };
  })});

  /* ---------- Personagens ---------- */
  var list = document.getElementById("char-list"), msg = document.getElementById("char-msg");

  function desenha(){
    var cs = SSO.chars();
    list.innerHTML = "";
    if (!cs.length){ var v = el("div", "char"); v.appendChild(el("span", "vazio", "nenhum personagem")); list.appendChild(v); return; }
    cs.forEach(function(c){
      var row = el("div", "char"), rm = el("button", "btn alerta", "Remover");
      rm.addEventListener("click", function(){ SSO.remove(c.id); desenha(); });
      row.append(CV.retrato(c.id), el("b", null, c.name), rm);
      list.appendChild(row);
    });
  }
  function abre(){ desenha(); WIN.open("w-chars"); }

  document.getElementById("ic-chars").addEventListener("click", abre);
  document.getElementById("add-char").addEventListener("click", function(){ SSO.login(); });

  SSO.retorno().then(function(c){ if (c) abre(); },
    function(e){ console.error(e); abre(); msg.textContent = "Erro no login: " + e.message; });

  /* ---------- botões dos chars fictícios na bandeja, ao lado do trocar papel de parede ---------- */
  var wallbtn = document.getElementById("wallbtn");
  CV.FICTICIOS.slice().reverse().forEach(function(c){
    var b = el("button", "tb fic"); b.title = c.name;
    b.appendChild(CV.imgFicticio(c));
    b.addEventListener("click", function(){
      document.getElementById("fic-title").textContent = c.name;
      document.getElementById("fic-nivel").textContent = c.name + ": todas as skills no " + c.nivel + ".";
      document.getElementById("fic-desc").textContent = c.desc;
      var a = document.getElementById("fic-fonte"); a.href = c.fonte; a.textContent = c.fonte;
      WIN.open("w-fic");
    });
    wallbtn.after(b);
  });

  /* ---------- Exportar dados: todo o localStorage da Calculeve (prefixo "calculeve.") num .json ---------- */
  document.getElementById("ic-export").addEventListener("click", function(){
    var dados = {};
    try {
      Object.keys(localStorage).filter(function(k){ return k.indexOf("calculeve.") === 0; }).sort()
        .forEach(function(k){ try { dados[k] = JSON.parse(localStorage.getItem(k)); } catch(e){ dados[k] = localStorage.getItem(k); } });
    } catch(e){}
    var d = new Date(), dia = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    var url = URL.createObjectURL(new Blob([JSON.stringify({ exportado: d.toISOString(), dados: dados }, null, 1)],
                                           { type: "application/json" }));
    var a = el("a"); a.href = url; a.download = "calculeve-dados-" + dia + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  });

  /* ---------- Importar dados: arquivo do Exportar dados substitui todo o localStorage da Calculeve ---------- */
  var impArq = document.getElementById("import-arq"), impMsg = document.getElementById("import-msg");
  document.getElementById("ic-import").addEventListener("click", function(){ impMsg.textContent = ""; WIN.open("w-import"); });
  document.getElementById("import-ok").addEventListener("click", function(){ impArq.value = ""; impArq.click(); });
  impArq.addEventListener("change", function(){
    var f = impArq.files[0];
    if (!f) return;
    f.text().then(function(txt){
      var j = JSON.parse(txt), dados = j && j.dados;
      if (!dados || typeof dados !== "object") throw new Error("não é um arquivo do Exportar dados");
      var chaves = Object.keys(dados).filter(function(k){ return k.indexOf("calculeve.") === 0; });
      if (!chaves.length) throw new Error("o arquivo não tem dados da Calculeve");
      Object.keys(localStorage).filter(function(k){ return k.indexOf("calculeve.") === 0; })
        .forEach(function(k){ localStorage.removeItem(k); });
      chaves.forEach(function(k){ localStorage.setItem(k, JSON.stringify(dados[k])); });
      location.reload();
    }).catch(function(e){ impMsg.textContent = "Não importou: " + e.message; });
  });

  /* ---------- Apagar dados: tudo que a Calculeve salvou (prefixo "calculeve.") ---------- */
  document.getElementById("ic-wipe").addEventListener("click", function(){ WIN.open("w-wipe"); });
  document.getElementById("wipe-ok").addEventListener("click", function(){
    [window.localStorage, window.sessionStorage].forEach(function(st){
      try {
        Object.keys(st).filter(function(k){ return k.indexOf("calculeve.") === 0; })
          .forEach(function(k){ st.removeItem(k); });
      } catch(e){}
    });
    location.reload();
  });
});
