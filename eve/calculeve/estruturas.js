/* ---------- Cadastrar Estruturas: busca por nome na ESI e cadastro no navegador ----------
   Keepstar vira estrutura de mercado, com o broker do dono digitado à mão; Engineering Complex e
   Refinery viram estrutura de indústria, com os bônus digitados à mão (a ESI não informa rigs). */
(function(){
  "use strict";
  var el = CV.el;
  var form = document.getElementById("estr-form"), q = document.getElementById("estr-q"),
      body = document.getElementById("estr-body");
  var geracao = 0;
  var CHAVE = "calculeve.estruturas";          // { mercado: [...], industria: [...] }
  var MERCADO = { Keepstar: 1 };               // typeName que cadastra como mercado
  var GRUPOS_INDUSTRIA = { 1404: 1, 1406: 1 }; // Engineering Complex, Refinery
  /* campos digitados por tipo de estrutura: onde ficam no registro e [chave, rótulo] de cada um, em % */
  var CAMPOS = {
    mercado:   { onde: "taxas", titulo: "Taxas", lista: [["brokerDono", "Broker do dono da estrutura (%)"]] },
    industria: { onde: "bonus", titulo: "Bônus", lista: [
      ["meEstr", "ME da estrutura — fabricação (%)"], ["meRigFab", "ME do rig — fabricação (%)"],
      ["meRigReac", "ME do rig — reação (%)"], ["teEstrFab", "TE da estrutura — fabricação (%)"],
      ["teRigFab", "TE do rig — fabricação (%)"], ["teEstrReac", "TE da estrutura — reação (%)"],
      ["teRigReac", "TE do rig — reação (%)"]] }
  };
  var cad = document.getElementById("estr-cad"), ebForm = document.getElementById("eb-form"),
      ebTitulo = document.getElementById("eb-title"), ebCampos = document.getElementById("eb-campos");
  var pendente = null;                         // { tipo, e }: estrutura esperando os campos

  /* ---------------- cadastro no navegador ---------------- */
  function le(){ var c = CV.lsGet(CHAVE, {}); c.mercado = c.mercado || []; c.industria = c.industria || []; return c; }
  function grava(c){ CV.lsSet(CHAVE, c); desenhaCad(); }
  function salva(tipo, e){
    var c = le();
    c[tipo] = c[tipo].filter(function(x){ return x.id !== e.id; }).concat([e]);
    grava(c);
  }
  function remove(tipo, id){ var c = le(); c[tipo] = c[tipo].filter(function(x){ return x.id !== id; }); grava(c); CV.limpaOrfaos(); }

  function desenhaCad(){
    var c = le(); cad.innerHTML = "";
    if (!c.mercado.length && !c.industria.length){ cad.appendChild(el("div", "vazio", "Nenhuma estrutura cadastrada.")); return; }
    [["mercado", "Mercado"], ["industria", "Indústria"]].forEach(function(t){
      c[t[0]].forEach(function(e){
        var row = el("div", "cad"), rm = el("button", "btn alerta", "Remover"), txt = el("b", null, e.name);
        row.appendChild(CV.iconeTipo(e.type, "icon"));
        txt.appendChild(el("span", "sub", " · " + t[1] + (e.sistema ? " · " + e.sistema : "")));
        row.appendChild(txt);
        var cfg = CAMPOS[t[0]], v = e[cfg.onde];
        row.appendChild(el("span", "sub", v ? cfg.lista.map(function(k){ return v[k[0]]; }).join(" / ") : cfg.titulo + " não cadastradas"));
        rm.addEventListener("click", function(){ remove(t[0], e.id); });
        var ed = el("button", "btn", "Editar");
        ed.addEventListener("click", function(){ pedeCampos(t[0], e); });
        row.appendChild(ed);
        row.appendChild(rm);
        cad.appendChild(row);
      });
    });
  }

  /* ---------------- campos digitados (taxas do mercado / bônus da indústria) ---------------- */
  function pedeCampos(tipo, e){
    var cfg = CAMPOS[tipo];
    pendente = { tipo: tipo, e: e };
    ebTitulo.textContent = cfg.titulo + " — " + e.name;
    var atual = (le()[tipo].filter(function(x){ return x.id === e.id; })[0] || {})[cfg.onde] || {};
    ebCampos.innerHTML = "";
    cfg.lista.forEach(function(k){
      var lb = el("label", null, k[1] + " "), inp = el("input");
      inp.type = "number"; inp.step = "any"; inp.min = "0"; inp.name = k[0];
      inp.value = atual[k[0]] != null ? atual[k[0]] : "";
      lb.appendChild(inp); ebCampos.appendChild(lb);
    });
    WIN.open("w-estr-bonus");
  }
  ebForm.addEventListener("submit", function(ev){
    ev.preventDefault();
    if (!pendente) return;
    var cfg = CAMPOS[pendente.tipo], v = {};
    cfg.lista.forEach(function(k){ v[k[0]] = Number(ebForm.elements[k[0]].value) || 0; });
    pendente.e[cfg.onde] = v;
    salva(pendente.tipo, pendente.e);
    pendente = null;
    WIN.close("w-estr-bonus");
  });

  function status(msg){ CV.status(body, msg); }

  /* busca com cada char logado: /characters/{id}/search/ com categoria structure.
     Devolve Map id da estrutura -> [chars que a encontraram] e os erros por char. */
  async function busca(txt){
    var achados = new Map(), erros = [];
    await CV.limite(SSO.chars(), 4, async function(c){
      try {
        var tk = await SSO.token(c.id);
        var j = (await CV.esi("/characters/" + c.id + "/search/?categories=structure&strict=false&search=" +
                              encodeURIComponent(txt), { token: tk })).json;
        (j.structure || []).forEach(function(id){
          if (!achados.has(id)) achados.set(id, []);
          achados.get(id).push({ id: c.id, name: c.name, tk: tk });
        });
      } catch(e){ erros.push(c.name + ": " + e.message); }
    });
    return { achados: achados, erros: erros };
  }

  /* /universe/structures/{id}/ com o token de quem achou; o primeiro que responder vale */
  async function detalhe(id, chars){
    var ultimo = null;
    for (var c of chars){
      try { return (await CV.esi("/universe/structures/" + id + "/", { token: c.tk })).json; }
      catch(e){ ultimo = e; }
    }
    return { erro: ultimo ? ultimo.message : "?" };
  }

  async function executa(){
    var txt = q.value.trim(), g = ++geracao;
    if (txt.length < 3){ status("Digite pelo menos 3 letras."); return; }
    if (!SSO.chars().length){ status("Nenhum personagem — adicione em Personagens."); return; }
    status("Buscando…");
    var r = await busca(txt);
    if (g !== geracao) return;
    var ids = Array.from(r.achados.keys());
    status("Resolvendo " + ids.length + " estrutura(s)…");
    var det = {};
    await CV.limite(ids, 6, async function(id){ det[id] = await detalhe(id, r.achados.get(id)); });
    var T = await CV.tipos();
    var sis = await CV.sistemas(Array.from(new Set(ids.map(function(id){ return det[id].solar_system_id; }).filter(Boolean))));
    if (g !== geracao) return;

    body.innerHTML = "";
    if (r.erros.length) body.appendChild(el("div", "status", "Erro na busca — " + r.erros.join(" · ")));
    if (!ids.length){ body.appendChild(el("div", "status", "Nenhuma estrutura encontrada.")); return; }

    ids.sort(function(a, b){ return (det[a].name || "~").localeCompare(det[b].name || "~"); });
    var tab = el("table", "as"), hr = el("tr");
    ["Nome", "Sistema", "Tipo", "ID", "Achada por"].forEach(function(h){ hr.appendChild(el("th", null, h)); });
    var th = el("thead"); th.appendChild(hr); tab.appendChild(th);
    var tb = el("tbody");
    ids.forEach(function(id){
      var d = det[id], s = d.solar_system_id && sis[d.solar_system_id], tr = el("tr");
      var tipo = d.type_id && T.get(d.type_id);
      var alvo = !tipo ? null : MERCADO[tipo.name] ? "mercado" : GRUPOS_INDUSTRIA[tipo.group] ? "industria" : null;
      if (alvo && d.name){
        var e = { id: id, name: d.name, type: d.type_id, sys: d.solar_system_id, sistema: s ? s.name : null };
        tr.className = "clica";
        tr.title = alvo === "mercado" ? "Cadastrar como mercado" : "Cadastrar como indústria";
        tr.addEventListener("click", function(){ pedeCampos(alvo, e); });
      }
      tr.appendChild(el("td", null, d.name || ("sem acesso (" + d.erro + ")")));
      tr.appendChild(el("td", null, s ? s.name : (d.solar_system_id || "—")));
      var td = el("td");
      if (d.type_id){ td.appendChild(CV.iconeTipo(d.type_id, "icon")); td.appendChild(document.createTextNode((T.get(d.type_id) || {}).name || d.type_id)); }
      else td.textContent = "—";
      tr.appendChild(td);
      tr.appendChild(el("td", null, String(id)));
      tr.appendChild(el("td", null, r.achados.get(id).map(function(c){ return c.name; }).join(", ")));
      tb.appendChild(tr);
    });
    tab.appendChild(tb); body.appendChild(tab);
  }

  form.addEventListener("submit", function(e){
    e.preventDefault();
    executa().catch(function(err){ console.error(err); status("Erro: " + err.message); });
  });
  document.getElementById("ic-estr").addEventListener("click", function(){ desenhaCad(); WIN.open("w-estr"); q.focus(); });
})();
