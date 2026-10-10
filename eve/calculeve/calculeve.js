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

  /* apaga do navegador o que já não é usado: preço e histórico de estrutura descadastrada, estoque de char removido
     (e o Tudão, que leva o estoque de todos os chars) */
  function limpaOrfaos(){
    var chars = SSO.chars().map(function(c){ return String(c.id); }), merc = estruturas("mercado"),
        regioes = lsGet("calculeve.cache.regiaosis", {});
    var ids = merc.map(function(e){ return String(e.id); }),
        regs = merc.map(function(e){ return String(regioes[e.sys]); });
    function apaga(k){ try { localStorage.removeItem(k); } catch(e){} }
    Object.keys(localStorage).forEach(function(k){
      var m;
      if ((m = k.match(/^calculeve\.mercado\.(\d+)$/))){ if (ids.indexOf(m[1]) < 0) apaga(k); }
      else if ((m = k.match(/^calculeve\.mercado\.hist\.(\d+)$/))){ if (regs.indexOf(m[1]) < 0) apaga(k); }
      else if ((m = k.match(/^calculeve\.estoque\.(\d+)$/))){ if (chars.indexOf(m[1]) < 0) apaga(k); }
    });
    var tudo = lsGet("calculeve.estoque.tudo", null);
    if (tudo && tudo.dados.some(function(d){ return d.char && chars.indexOf(String(d.char.id)) < 0; })) apaga("calculeve.estoque.tudo");
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

  /* ---------- CSV ----------
     Parser próprio porque o invTypes tem descrição com vírgula, aspas e quebra de linha.
     csv(texto) devolve as linhas de campos (texto cru); a primeira é o cabeçalho. */
  function csv(txt){
    var out = [], i = 0, L = txt.length, row = [], f = "", q = false;
    if (txt.charCodeAt(0) === 0xFEFF) i = 1;
    function fimLinha(){ row.push(f); f = ""; out.push(row); row = []; }
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
  }
  /* sde(arquivo, colunas) devolve, uma vez por arquivo, as linhas de sde/*.csv só com as colunas pedidas, na ordem pedida */
  var sdeP = {};
  function sde(arquivo, colunas){
    var k = arquivo + "|" + colunas.join(",");
    if (!sdeP[k]) sdeP[k] = fetch("sde/" + arquivo).then(function(r){ return r.text(); }).then(function(txt){
      var linhas = csv(txt), idx = colunas.map(function(c){ return linhas[0].indexOf(c); });
      return linhas.slice(1).filter(function(l){ return l.length > 1; }).map(function(l){
        return idx.map(function(j){ return l[j]; });
      });
    });
    return sdeP[k];
  }
  /* typeID -> { name, group, vol, pub } (pub = publicado no jogo) */
  var tiposP = null;
  function tipos(){
    if (!tiposP) tiposP = sde("invTypes.csv", ["typeID", "groupID", "typeName", "volume", "published"]).then(function(rows){
      var m = new Map();
      rows.forEach(function(r){ m.set(Number(r[0]), { name: r[2], group: Number(r[1]), vol: Number(r[3]) || 0, pub: r[4] === "1" }); });
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

  /* ids das alianças Brave Collective e Brave United, por nome (POST /universe/ids/), cacheados no navegador */
  var ALIANCAS_BRAVE = ["Brave Collective", "Brave United"];
  async function aliancasBrave(){
    var c = lsGet("calculeve.cache.brave", null);
    if (!c || !c.length){
      var r = await esi("/universe/ids/", { body: ALIANCAS_BRAVE });
      c = (r.json.alliances || []).map(function(a){ return a.id; });
      if (c.length !== ALIANCAS_BRAVE.length) throw new Error("aliança da Brave não resolvida pelo nome");
      lsSet("calculeve.cache.brave", c);
    }
    return c;
  }
  /* quais chars logados estão na Brave Collective ou na Brave United (POST /characters/affiliation/, sem login).
     Devolve { membro: algum char está, chars: [{ id, name }] dos que estão } */
  async function brave(){
    var chars = SSO.chars();
    if (!chars.length) return { membro: false, chars: [] };
    var alv = await aliancasBrave();
    var afil = (await esi("/characters/affiliation/", { body: chars.map(function(c){ return c.id; }) })).json;
    var dentro = chars.filter(function(c){
      return afil.some(function(a){ return a.character_id === c.id && alv.indexOf(a.alliance_id) >= 0; });
    });
    return { membro: dentro.length > 0, chars: dentro };
  }

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
     HTML um contêiner `<prefixo>-escolhas` e chama seletores(prefixo, chaves), que monta os botões nele, com `chaves` = { id: chave do localStorage } só dos que ela usa.
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
      var box = el("div", "seletor");
      s.btn = el("button", "btn"); s.lista = el("div", "vidro"); s.lista.hidden = true;
      box.append(s.btn, s.lista);
      document.getElementById(prefixo + "-escolhas").appendChild(box);
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

  var ATIV = { FAB: "1", INV: "8", REAC: "11" };   // activityID nos industryActivity*.csv
  /* ---------- índices do SDE (indústria) ----------
     produto  "act|bp"     -> { t: produto, q: unidades por run }
     porProd  produto      -> [{ bp, act, q }]  (fabricação e reação)
     mat      "act|bp"     -> [{ t: material, q: qtd base (ME 0) por run }]
     tempo    "act|bp"     -> segundos por run
     prob     bp           -> chance base de invenção
     skills   bp           -> [skillID] exigidas pela invenção */
  var idxP = null;
  function industria(){
    if (idxP) return idxP;
    idxP = Promise.all([
      tipos(),
      sde("industryActivityProducts.csv", ["typeID", "activityID", "productTypeID", "quantity"]),
      sde("industryActivityMaterials.csv", ["typeID", "activityID", "materialTypeID", "quantity"]),
      sde("industryActivity.csv", ["typeID", "activityID", "time"]),
      sde("industryActivityProbabilities.csv", ["typeID", "activityID", "productTypeID", "probability"]),
      sde("industryActivitySkills.csv", ["typeID", "activityID", "skillID", "level"])
    ]).then(function(r){
      var I = { T: r[0], produto: new Map(), porProd: new Map(), mat: new Map(),
                tempo: new Map(), prob: new Map(), skills: new Map() };
      I.k = function(act, bp){ return act + "|" + bp; };
      r[1].forEach(function(x){
        var bp = Number(x[0]), p = { t: Number(x[2]), q: Number(x[3]) };
        I.produto.set(I.k(x[1], bp), p);
        if (x[1] === ATIV.FAB || x[1] === ATIV.REAC){
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
      r[4].forEach(function(x){ if (x[1] === ATIV.INV) I.prob.set(Number(x[0]), Number(x[3])); });
      r[5].forEach(function(x){
        if (x[1] !== ATIV.INV) return;
        var bp = Number(x[0]);
        if (!I.skills.has(bp)) I.skills.set(bp, []);
        I.skills.get(bp).push(Number(x[2]));
      });
      return I;
    });
    return idxP;
  }

  /* ---------- formatação pt-BR: um formatador de cada, nunca recriado nos scripts ---------- */
  var fmt = { int: new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }),
              qtd: new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }),
              n2:  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
              pct: new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) };

  /* segundos -> "h:mm:ss" (horas acumuladas, como o [hh]:mm:ss da planilha) */
  function hms(seg){
    seg = Math.round(seg);
    var h = Math.floor(seg / 3600), m = Math.floor(seg % 3600 / 60), s = seg % 60;
    return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  /* mensagem de uma linha no lugar do conteúdo de uma janela */
  function status(corpo, msg){ corpo.innerHTML = ""; corpo.appendChild(el("div", "status", msg)); }

  /* níveis de skill do char escolhido: sem char, tudo 0; fictício, tudo no nível dele; senão, os da ESI */
  function niveis(c){
    if (!c) return Promise.resolve(new Map());
    if (c.ficticio) return Promise.resolve({ get: function(){ return c.nivel; } });
    return skills(c);
  }

  /* ---------- SDE: bônus de tempo por nível das skills, em % (negativo reduz) ----------
     Industry e Advanced Industry na fabricação (act 1), Reactions na reação (act 11); os atributos são os
     do dogma. Promise de [{ skill: typeID, nome, act, pct }]; quem só fabrica filtra por `act`. */
  var SKILLS_TEMPO = [["Industry", "manufacturingTimeBonus", "1"],
                      ["Advanced Industry", "advancedIndustrySkillIndustryJobTimeBonus", "1"],
                      ["Reactions", "reactionTimeBonus", "11"]];
  var bSkillP = null;
  function bonusSkill(){
    if (bSkillP) return bSkillP;
    bSkillP = Promise.all([tipos(),
      sde("dgmAttributeTypes.csv", ["attributeID", "attributeName"]),
      sde("dgmTypeAttributes.csv", ["typeID", "attributeID", "valueInt", "valueFloat"])]).then(function(r){
        var idTipo = {}, idAttr = {}, alvo = {}, out = [];
        r[0].forEach(function(t, id){ if (!idTipo[t.name]) idTipo[t.name] = id; });
        r[1].forEach(function(a){ idAttr[a[1]] = a[0]; });
        SKILLS_TEMPO.forEach(function(k){ alvo[idTipo[k[0]] + "|" + idAttr[k[1]]] = { skill: idTipo[k[0]], nome: k[0], act: k[2] }; });
        r[2].forEach(function(x){
          var a = alvo[x[0] + "|" + x[1]];
          if (a) out.push({ skill: a.skill, nome: a.nome, act: a.act, pct: Number(x[3] !== "" ? x[3] : x[2]) });
        });
        return out;
      });
    return bSkillP;
  }

  /* ---------- estoque salvo do Tudão ---------- */
  /* por tipo: quantidade total e locais (estação/estrutura/sistema, como no Estoque) que têm o item;
     nave e container contam como o local onde estão */
  function estoquePorTipo(snap){
    var assets = [].concat.apply([], snap.dados.map(function(d){ return d.assets || []; }));
    var porId = new Map(); assets.forEach(function(a){ porId.set(a.item_id, a); });
    function raiz(a){
      var p;
      while (a.location_type === "item" && (p = porId.get(a.location_id))) a = p;
      return a.location_id;
    }
    var r = new Map();
    assets.forEach(function(a){
      if (!r.has(a.type_id)) r.set(a.type_id, { qt: 0, locais: new Set() });
      var x = r.get(a.type_id); x.qt += a.quantity; x.locais.add(raiz(a));
    });
    return r;
  }
  /* blueprints do estoque que `aceita(typeID)`, uma linha por (tipo, ME, TE, runs, cópia ou original), com a
     quantidade (`aceita(typeID, copia)` filtra), ordenadas por nome, original antes de cópia, maior ME e TE. `T` = CV.tipos(). */
  function blueprints(snap, T, aceita){
    var g = new Map();
    snap.dados.forEach(function(d){
      (d.bps || []).forEach(function(b){
        var q = b.quantity || 1, copia = (b.runs != null && b.runs > 0) || q === -2;
        if (!aceita(b.type_id, copia)) return;
        var me = b.material_efficiency || 0, te = b.time_efficiency || 0, runs = copia ? b.runs : 0;
        var k = [b.type_id, copia, me, te, runs].join("|");
        if (!g.has(k)) g.set(k, { t: b.type_id, copia: copia, me: me, te: te, runs: runs, qt: 0 });
        g.get(k).qt += q > 0 ? q : 1;
      });
    });
    function nome(t){ return (T.get(t) || {}).name || ""; }
    return Array.from(g.values()).sort(function(a, b){
      return nome(a.t).localeCompare(nome(b.t)) || (a.copia - b.copia) || (b.me - a.me) || (b.te - a.te);
    });
  }
  /* cartão clicável das janelas de lista (blueprint ou isótopo): ícone, nome curto e uma linha de dados */
  function cartao(tipo, variante, curto, dados, titulo){
    var ic = el("button", "icon bp");
    ic.title = titulo;
    ic.appendChild(iconeTipo(tipo, variante));
    ic.appendChild(el("span", "bp-nome", curto));
    ic.appendChild(el("span", "bp-dados", dados));
    return ic;
  }
  /* ---------- caixa de busca pelo nome ----------
     `busca(input, aoMudar)` chama `aoMudar(termo)` a cada tecla e devolve um getter do termo atual;
     `contem(texto, termo)` compara sem acento e sem diferença de maiúscula (termo vazio casa tudo) */
  function normaliza(s){ return String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function contem(texto, termo){ return !termo || normaliza(texto).indexOf(termo) >= 0; }
  function busca(input, aoMudar){
    function termo(){ return normaliza(input.value.trim()); }
    input.addEventListener("input", function(){ aoMudar(termo()); });
    return termo;
  }

  /* estoque salvo do Tudão (null se ainda não foi baixado) */
  function tudao(){ return lsGet("calculeve.estoque.tudo", null); }
  /* janela de lista de blueprints do estoque do Tudão: aviso, cartões e `aoAbrir(b, snap)` no clique.
     `o` = { grid, nota, aceita(typeID, copia), vazio, extraNota, tituloFaltam, faltam(lista, T) -> [{ t: blueprint, nome, dados }],
             simula } — com `simula: true`, a busca também mostra, numa seção própria, as blueprints publicadas do SDE que
     `aceita(typeID, false)` e o estoque não tem; o clique chama `aoAbrir({ t, copia: false, me: 0, te: 0, runs: 0, qt: 0, sim: true }, snap)` */
  var SIM_MAX = 60;                                     // cartões simulados desenhados por busca; o resto pede refinar o termo
  async function listaBps(o){
    o.grid.innerHTML = ""; o.nota.textContent = "Carregando…";
    var snap = tudao();
    if (!snap){ o.nota.textContent = "Sem estoque do Tudão salvo. Atualize o Tudão no Estoque."; return; }
    var T = await tipos(), lista = blueprints(snap, T, o.aceita);
    if (o.prepara) await o.prepara(lista, T);
    o.nota.textContent = "Estoque do Tudão de " + dataHora(snap.ts) + "." + (o.extraNota || "");
    var faltam = o.faltam ? o.faltam(lista, T) : [];
    if (!lista.length && !faltam.length){ o.grid.appendChild(el("div", "vazio", o.vazio)); if (!o.simula) return; }
    var porSecao = new Map();
    lista.forEach(function(b){
      var t = o.secao ? o.secao(b, T) : "";
      if (!porSecao.has(t)) porSecao.set(t, []);
      porSecao.get(t).push(b);
    });
    var secs = [], nada = el("div", "vazio", "Nada com esse nome."); nada.hidden = true;
    (o.secoes || [""]).forEach(function(t){
      if (!porSecao.has(t)) return;
      var sec = el("div"), g = el("div", "grid");
      if (t) sec.appendChild(el("h4", null, t));
      porSecao.get(t).forEach(function(b){
        var nome = (T.get(b.t) || {}).name || String(b.t), ic = cartaoBp(b, nome, nome.replace(/ Blueprint$/, ""));
        ic.dataset.nome = nome.replace(/ Blueprint$/, "");      // a busca não olha o "Blueprint" que todas têm
        ic.addEventListener("click", function(){ o.aoAbrir(b, snap); });
        g.appendChild(ic);
      });
      sec.appendChild(g); o.grid.appendChild(sec); secs.push(sec);
    });
    /* o que falta (blueprint que o estoque não tem): cartões sem clique, numa seção no fim */
    if (faltam.length){
      var sf = el("div"), gf = el("div", "grid");
      sf.appendChild(el("h4", null, o.tituloFaltam));
      faltam.forEach(function(f){
        var nome = (T.get(f.t) || {}).name || String(f.t), ic = cartao(f.t, "bp", f.nome, f.dados, nome);
        ic.dataset.nome = f.nome; ic.disabled = true;
        gf.appendChild(ic);
      });
      sf.appendChild(gf); o.grid.appendChild(sf); secs.push(sf);
    }
    /* blueprints que o estoque não tem: só aparecem com termo na busca, como BPO 0/0 simulada */
    var cand = [], sSim = null, gSim = null, nSim = null;
    if (o.simula){
      var tem = new Set(lista.map(function(b){ return b.t; }));
      T.forEach(function(x, t){
        if (x.pub && !tem.has(t) && /Blueprint$/.test(x.name) && o.aceita(t, false)) cand.push({ t: t, nome: x.name, curto: x.name.replace(/ Blueprint$/, "") });
      });
      cand.sort(function(a, b){ return a.nome.localeCompare(b.nome); });
      sSim = el("div"); gSim = el("div", "grid"); nSim = el("div", "nota");
      sSim.appendChild(el("h4", null, "Blueprints que você não tem — BPO simulada"));
      sSim.appendChild(gSim); sSim.appendChild(nSim); sSim.hidden = true;
      o.grid.appendChild(sSim);
    }
    function desenhaSim(termo){
      if (!sSim) return false;
      gSim.innerHTML = ""; nSim.textContent = "";
      var achou = termo ? cand.filter(function(c){ return contem(c.curto, termo); }) : [];
      sSim.hidden = !achou.length;
      achou.slice(0, SIM_MAX).forEach(function(c){
        var ic = cartao(c.t, "bp", c.curto, "não está no estoque — ME/TE ajustáveis", c.nome + " (BPO simulada)");
        ic.addEventListener("click", function(){ o.aoAbrir({ t: c.t, copia: false, me: 0, te: 0, runs: 0, qt: 0, sim: true }, snap); });
        gSim.appendChild(ic);
      });
      if (achou.length > SIM_MAX) nSim.textContent = "Mais " + fmt.int.format(achou.length - SIM_MAX) + " — refine a busca.";
      if (achou.length) igualaCartoes(o.grid);
      return achou.length > 0;
    }
    o.grid.appendChild(nada);
    /* filtro: some o cartão que não casa e a seção que ficou sem cartão */
    function filtra(termo){
      var algum = desenhaSim(termo);
      secs.forEach(function(sec){
        var vis = 0;
        sec.querySelectorAll(".icon.bp").forEach(function(ic){ ic.hidden = !contem(ic.dataset.nome, termo); if (!ic.hidden) vis++; });
        sec.hidden = !vis; if (vis) algum = true;
      });
      nada.hidden = algum || !termo;
    }
    igualaCartoes(o.grid);
    if (o.busca){
      var entrada = o.busca;                          // a caixa é uma só; o filtro é o da última lista desenhada
      if (!entrada._filtra) busca(entrada, function(t){ entrada._filtra(t); });
      entrada._filtra = filtra;
      filtra(normaliza(entrada.value.trim()));
    }
  }
  /* todos os cartões de `raiz` com a largura do maior texto (medida na tela, com a janela aberta): grade regular */
  function igualaCartoes(raiz){
    raiz.style.removeProperty("--card-w");
    var maior = 0;
    raiz.querySelectorAll(".icon.bp").forEach(function(ic){ maior = Math.max(maior, ic.offsetWidth); });
    if (maior) raiz.style.setProperty("--card-w", maior + "px");
  }
  /* grupos do jogo (id -> { n: nome, c: categoria }), da ESI, com cache no navegador */
  function grupos(ids){
    return cacheado("calculeve.cache.gruposinfo", ids, async function(id){
      var j = (await esi("/universe/groups/" + id + "/")).json;
      return { n: j.name, c: j.category_id };
    });
  }
  function cartaoBp(b, nome, curto){
    return cartao(b.t, b.copia ? "bpc" : "bp", curto, "ME: " + b.me + " / TE: " + b.te + " / QT: " + fmt.int.format(b.qt) +
                  (b.copia ? " / runs: " + b.runs : ""), nome + (b.copia ? " (BPC)" : " (BPO)"));
  }

  return { FICTICIOS: FICTICIOS, imgFicticio: imgFicticio, sinal: sinal, lsGet: lsGet, lsSet: lsSet, el: el, retrato: retrato, iconeTipo: iconeTipo, dataHora: dataHora,
           sde: sde, tipos: tipos,
           esi: esi, esiPaginado: esiPaginado, limite: limite, cacheado: cacheado, sistemas: sistemas, brave: brave, limpaOrfaos: limpaOrfaos, csv: csv,
           skills: skills, niveis: niveis, seletores: seletores,
           ATIV: ATIV, industria: industria, fmt: fmt, hms: hms, status: status, bonusSkill: bonusSkill, estoquePorTipo: estoquePorTipo,
           blueprints: blueprints, cartao: cartao, cartaoBp: cartaoBp, tudao: tudao, listaBps: listaBps, igualaCartoes: igualaCartoes, grupos: grupos, contem: contem, busca: busca };
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

  /* o botão da Brave só aparece com pelo menos um char logado que seja da Brave Collective ou da Brave United */
  var icBrave = document.getElementById("ic-brave");
  function mostraBrave(){
    CV.brave().then(function(r){ icBrave.hidden = !r.membro; }, function(e){ console.error(e); icBrave.hidden = true; });
  }
  mostraBrave();
  CV.limpaOrfaos();

  function desenha(){
    var cs = SSO.chars();
    list.innerHTML = "";
    if (!cs.length){ var v = el("div", "char"); v.appendChild(el("span", "vazio", "nenhum personagem")); list.appendChild(v); return; }
    cs.forEach(function(c){
      var row = el("div", "char"), rm = el("button", "btn alerta", "Remover");
      rm.addEventListener("click", function(){ SSO.remove(c.id); CV.limpaOrfaos(); desenha(); mostraBrave(); });
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

  /* ---------- Log: botão na bandeja, depois do Mr. Satan. Abre a lista de logs do Mudanças.md (cada "# " começa um
     log, na ordem do arquivo); cada log é um ícone que abre o texto dele numa segunda janela ---------- */
  var logBtn = el("button", "tb log"); logBtn.type = "button"; logBtn.title = "Log";
  logBtn.innerHTML = '<svg viewBox="0 0 24 24"><use href="../../assets/icons/ui.svg#log"/></svg><span>Log</span>';
  wallbtn.parentNode.insertBefore(logBtn, document.getElementById("clock"));
  /* markdown mínimo: ##, ###, listas com "- " (aninhadas por 2 espaços), **negrito**, `código` */
  function mdInline(t){
    return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  }
  function mdRender(linhas){
    var html = "", nivel = -1;
    function fecha(ate){ while (nivel > ate){ html += "</li></ul>"; nivel--; } }
    linhas.forEach(function(l){
      var m;
      if ((m = /^(\s*)- (.*)$/.exec(l))){
        var n = Math.floor(m[1].length / 2);
        if (n > nivel){ while (nivel < n){ html += "<ul><li>"; nivel++; } }
        else { fecha(n); html += "</li><li>"; }
        html += mdInline(m[2]); return;
      }
      fecha(-1);
      if ((m = /^#{2,3} (.*)$/.exec(l))) html += "<h4>" + mdInline(m[1]) + "</h4>";
      else if (l.trim()) html += "<p>" + mdInline(l) + "</p>";
    });
    fecha(-1);
    return html;
  }
  /* Mudanças.md -> [{ titulo, linhas }], um por "# " */
  function separaLogs(txt){
    var logs = [];
    txt.replace(/\r/g, "").split("\n").forEach(function(l){
      var m = /^# (.*)$/.exec(l);
      if (m) logs.push({ titulo: m[1], linhas: [] });
      else if (logs.length) logs[logs.length - 1].linhas.push(l);
    });
    return logs;
  }
  var logLista = document.getElementById("log-lista"), logBody = document.getElementById("log-body"),
      logTitle = document.getElementById("log-title");
  logBtn.addEventListener("click", function(){
    WIN.open("w-log");
    CV.status(logLista, "Carregando…");
    fetch("Mudanças.md", { cache: "no-cache" }).then(function(r){
      if (!r.ok) throw new Error("HTTP " + r.status); return r.text();
    }).then(function(t){
      var logs = separaLogs(t);
      logLista.innerHTML = "";
      if (!logs.length){ CV.status(logLista, "Nenhum log."); return; }
      logs.forEach(function(lg){
        var ic = el("button", "icon"); ic.type = "button"; ic.title = lg.titulo;
        ic.innerHTML = '<svg viewBox="0 0 24 24"><use href="../../assets/icons/ui.svg#log"/></svg>';
        ic.appendChild(el("span", null, lg.titulo));
        ic.addEventListener("click", function(){
          logTitle.textContent = lg.titulo;
          logBody.innerHTML = mdRender(lg.linhas);
          WIN.open("w-logtxt");
        });
        logLista.appendChild(ic);
      });
    }, function(e){ console.error(e); CV.status(logLista, "Erro ao ler o log: " + e.message); });
  });

  /* ---------- Exportar dados: todo o localStorage da Calculeve (prefixo "calculeve.") num .json ---------- */
  document.getElementById("ic-export").addEventListener("click", function(){
    var dados = {};
    try {
      Object.keys(localStorage).filter(function(k){ return k.indexOf("calculeve.") === 0; }).sort()
        .forEach(function(k){ try { dados[k] = JSON.parse(localStorage.getItem(k)); } catch(e){ dados[k] = localStorage.getItem(k); } });
    } catch(e){}
    var d = new Date(), dia = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    var url = URL.createObjectURL(new Blob([JSON.stringify({ exportado: d.toISOString(), app: SSO.app, dados: dados }, null, 1)],
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
      var j = JSON.parse(txt.replace(/^\uFEFF/, "")), dados = j && j.dados;
      if (!dados || typeof dados !== "object" || Array.isArray(dados)) throw new Error("não é um arquivo do Exportar dados");
      var chaves = Object.keys(dados).filter(function(k){ return k.indexOf("calculeve.") === 0; });
      if (!chaves.length) throw new Error("o arquivo não tem dados da Calculeve");
      var outroApp = j.app && j.app !== SSO.app;   // refresh token é amarrado ao Client ID que o criou
      if (outroApp) chaves = chaves.filter(function(k){ return k !== "calculeve.chars"; });
      var novos = {};
      chaves.forEach(function(k){ novos[k] = JSON.stringify(dados[k]); });
      var antigos = {};
      Object.keys(localStorage).filter(function(k){ return k.indexOf("calculeve.") === 0; })
        .forEach(function(k){ antigos[k] = localStorage.getItem(k); });
      try {
        Object.keys(antigos).forEach(function(k){ localStorage.removeItem(k); });
        chaves.forEach(function(k){
          try { localStorage.setItem(k, novos[k]); }
          catch(e){ throw new Error("não coube no navegador (" + k + ")"); }
        });
      } catch(e){
        Object.keys(localStorage).filter(function(k){ return k.indexOf("calculeve.") === 0; })
          .forEach(function(k){ localStorage.removeItem(k); });
        Object.keys(antigos).forEach(function(k){ try { localStorage.setItem(k, antigos[k]); } catch(e2){} });
        throw e;
      }
      if (outroApp) { impMsg.textContent = "Importado, mas os logins não valem neste endereço: entre de novo em cada char."; setTimeout(function(){ location.reload(); }, 2500); return; }
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
