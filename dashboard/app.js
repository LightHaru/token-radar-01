// Original offline renderer: snapshot data is injected into data.js by main.ts.
(function () {
  "use strict";
  var D = window.RADAR;
  if (!D) return;
  var app = document.getElementById("app");
  var detail = document.getElementById("detail");
  var state = { q:"", chain:"all", category:"all", visibility:"all", sort:"rank", dir:1, selected:null };

  function usd(n) {
    if (n == null) return "n/a";
    if (Math.abs(n)>=1e9) return "$"+(n/1e9).toFixed(2)+"B";
    if (Math.abs(n)>=1e6) return "$"+(n/1e6).toFixed(1)+"M";
    if (Math.abs(n)>=1e3) return "$"+(n/1e3).toFixed(0)+"K";
    return "$"+n.toLocaleString("en-US");
  }
  function pct(n) { return n == null ? "n/a" : (n>0?"+":"")+n.toFixed(2)+"%"; }
  function age(n) { return n == null ? "unknown" : n>=365 ? (n/365).toFixed(1)+"y" : n+"d"; }
  function el(tag, cls, text) {
    var n=document.createElement(tag); if(cls)n.className=cls; if(text!=null)n.textContent=text;
    return n;
  }
  function option(parent, value, text) { var o=el("option","",text); o.value=value; parent.appendChild(o); }
  function readHash() {
    var p=new URLSearchParams(location.hash.slice(1));
    state.q=p.get("q")||""; state.category=p.get("category")||"all"; state.chain=p.get("chain")||"all";
    state.visibility=p.get("visibility")||"all"; state.selected=p.get("p")||null;
  }
  function writeHash() {
    var p=new URLSearchParams();
    if(state.q)p.set("q",state.q); if(state.category!="all")p.set("category",state.category);
    if(state.chain!="all")p.set("chain",state.chain); if(state.visibility!="all")p.set("visibility",state.visibility);
    if(state.selected)p.set("p",state.selected);
    history.replaceState(null,"",p.toString()?("#"+p.toString()):(location.pathname+location.search));
  }
  function chains() {
    var set={}; D.rows.forEach(function(r){(r.chains||[]).forEach(function(c){set[c]=1});});
    return Object.keys(set).sort();
  }
  function categories() {
    var set={}; D.rows.forEach(function(r){set[r.category||"Other"]=1});
    return Object.keys(set).sort();
  }
  function filtered() {
    var q=state.q.toLowerCase().trim();
    return D.rows.filter(function(r){
      if(state.category!="all"&&(r.category||"Other")!=state.category)return false;
      if(state.chain!="all"&&(r.chains||[]).indexOf(state.chain)<0)return false;
      if(state.visibility=="watchlist"&&!r.watchlist)return false;
      if(state.visibility=="early"&&r.watchlist)return false;
      if(q){var h=[r.name,r.slug,r.category||"",(r.chains||[]).join(" ")].join(" ").toLowerCase();if(h.indexOf(q)<0)return false;}
      return true;
    });
  }
  function sorted(rows) {
    return rows.slice().sort(function(a,b){
      var av,bv;
      if(state.sort=="name"){av=a.name.toLowerCase();bv=b.name.toLowerCase();}
      else if(state.sort=="tvl"){av=a.tvl_usd;bv=b.tvl_usd;}
      else if(state.sort=="growth"){av=a.change_7d==null?-Infinity:a.change_7d;bv=b.change_7d==null?-Infinity:b.change_7d;}
      else if(state.sort=="age"){av=a.age_days==null?Infinity:a.age_days;bv=b.age_days==null?Infinity:b.age_days;}
      else if(state.sort=="rank"){av=a.rank;bv=b.rank;}
      else {av=a.implied_value_usd;bv=b.implied_value_usd;}
      if(av< bv)return -state.dir;if(av>bv)return state.dir;return a.slug<b.slug?-1:a.slug>b.slug?1:0;
    });
  }
  function header() {
    var top=el("header","top");
    var brand=el("div","brand"); brand.appendChild(el("span","dot"));brand.appendChild(el("span","", "Token Radar"));
    var meta=el("div","top-meta");meta.appendChild(el("span","","Snapshot "+D.as_of));meta.appendChild(el("span","",""+D.model_version+" model"));
    top.appendChild(brand);top.appendChild(meta);return top;
  }
  function controls() {
    var c=el("div","controls");
    function field(labelText,type) {
      var f=el("div","control");var lab=el("label","",labelText);lab.htmlFor=type;f.appendChild(lab);return f;
    }
    var fq=field("Search","q");var q=el("input","");q.id="q";q.type="search";q.placeholder="Name, slug or chain";q.value=state.q;
    q.oninput=function(){state.q=q.value;writeHash();refreshBoard()} ;fq.appendChild(q);
    var fc=field("Chain","chain");var cs=el("select","");cs.id="chain";option(cs,"all","All chains");
    chains().forEach(function(v){option(cs,v,v)});cs.value=state.chain;cs.onchange=function(){state.chain=cs.value;writeHash();render()};fc.appendChild(cs);
    var fk=field("Category","category");var ct=el("select","");ct.id="category";option(ct,"all","All categories");
    categories().forEach(function(v){option(ct,v,v)});ct.value=state.category;ct.onchange=function(){state.category=ct.value;writeHash();render()};fk.appendChild(ct);
    var fv=field("Visibility","visibility");var vs=el("select","");vs.id="visibility";option(vs,"all","Watchlist + early");option(vs,"watchlist","Watchlist only");option(vs,"early","Beyond-floor early");
    vs.value=state.visibility;vs.onchange=function(){state.visibility=vs.value;writeHash();render()};fv.appendChild(vs);
    c.appendChild(fq);c.appendChild(fc);c.appendChild(fk);c.appendChild(fv);
    var count=el("span","count","");    c.appendChild(count);count.id="protocol-count";count.textContent=filtered().length+" protocols";
    return c;
  }
  function refreshBoard() {
    var old=document.getElementById("board-content");
    if(!old)return;
    var count=document.getElementById("protocol-count");
    if(count)count.textContent=filtered().length+" protocols";
    old.replaceChildren(table());
  }
  function sortHead(key,label) {
    var th=el("th","");var b=el("button","",label);b.onclick=function(){
      if(state.sort==key)state.dir=-state.dir;else{state.sort=key;state.dir=key=="name"?1:-1}render();
    };if(state.sort==key)b.textContent=label+(state.dir<0?"  v":"  ^");th.appendChild(b);return th;
  }
  function table() {
    var rows=sorted(filtered());
    var panel=el("div","panel");var wrap=el("div","table-wrap");var table=el("table","");
    var thead=el("thead","");var hr=el("tr","");
    hr.appendChild(sortHead("rank","Rank"));var nth=el("th","","Protocol");hr.appendChild(nth);
    hr.appendChild(sortHead("tvl","TVL"));hr.appendChild(sortHead("growth","7d"));hr.appendChild(sortHead("age","Age"));
    hr.appendChild(sortHead("value","Implied value"));var vh=el("th","","Visibility");hr.appendChild(vh);thead.appendChild(hr);table.appendChild(thead);
    var tb=el("tbody","");
    if(!rows.length){var tr=el("tr","");var td=el("td","");td.colSpan=7;td.appendChild(el("div","empty"));var empty=td.firstChild;empty.appendChild(el("h2","","No matching protocols"));empty.appendChild(el("p","","Clear or change a filter."));var btn=el("button","button primary","Clear filters");btn.onclick=function(){state={q:"",chain:"all",category:"all",visibility:"all",sort:"rank",dir:1,selected:null};writeHash();render()};empty.appendChild(btn);tr.appendChild(td);tb.appendChild(tr);}
    var max=rows.length?rows[0].implied_value_usd:1;
    rows.forEach(function(r){
      var tr=el("tr","");tr.dataset.slug=r.slug;tr.tabIndex=0;tr.onclick=function(){openDetail(r.slug)};tr.onkeydown=function(e){if(e.key=="Enter"||e.key==" "){e.prevent();openDetail(r.slug)}};
      tr.appendChild(el("td","num rank",""+r.rank));
      var protocol=el("td","protocol");protocol.appendChild(el("b","",r.name));protocol.appendChild(el("span","sub",(r.category||"Other")+"  "+(r.chains||[]).slice(0,2).join(", ")));tr.appendChild(protocol);
      tr.appendChild(el("td","num",usd(r.tvl_usd)));
      tr.appendChild(el("td","num "+(r.change_7d==null?"":r.change_7d>=0?"pos":"neg"),pct(r.change_7d)));
      tr.appendChild(el("td","num",age(r.age_days)));
      var td=el("td","");var val=el("div","value");var bar=el("div","bar");var i=el("i","");i.style.width=Math.max(3,Math.round(r.implied_value_usd/max*100))+"%";bar.appendChild(i);val.appendChild(bar);val.appendChild(el("span","num",usd(r.implied_value_usd)));td.appendChild(val);tr.appendChild(td);
      tr.appendChild(el("td","", ""));var pill=el("span","pill "+(r.watchlist?"watch":""),r.watchlist?"Watchlist":"Beyond floor");tr.lastChild.appendChild(pill);
      tb.appendChild(tr);
    });
    table.appendChild(tb);wrap.appendChild(table);panel.appendChild(wrap);return panel;
  }
  function openDetail(slug) {
    state.selected=slug;writeHash();var r=D.rows.find(function(x){return x.slug==slug});if(!r)return;
    detail.hidden=false;detail.replaceChildren();
    var head=el("div","detail-head");var title=el("div","");title.appendChild(el("span","sub",r.watchlist?"WATCHLIST":"BEYOND-FLOOR EARLY"));
    title.appendChild(el("span","sub"," · "+r.workflow_status));
    title.appendChild(el("h2","",r.name));title.appendChild(el("span","sub",(r.category||"Other")+"  /  "+(r.chains||[]).join(", ")));
    var close=el("button","close","Close");close.onclick=function(){closeDetail()};head.appendChild(title);head.appendChild(close);detail.appendChild(head);
    var evidence=el("section","detail-section");evidence.appendChild(el("h3","","Evidence"));
    var ul=el("ul","evidence");(r.evidence||[]).forEach(function(v){ul.appendChild(el("li","",v))});evidence.appendChild(ul);detail.appendChild(evidence);
    var model=el("section","detail-section");model.appendChild(el("h3","","Value estimate"));
    var eq=el("div","equation");
    [["TVL anchor",usd(r.model.tvl_anchor_usd)],["Comparable anchor",r.model.comparable_anchor_usd==null?"n/a":usd(r.model.comparable_anchor_usd)],
     ["Growth factor",""+r.model.growth_multiplier+"x"],["Maturity factor",""+r.model.maturity_multiplier+"x"],["Low sensitivity",usd(r.sensitivity.low_usd)],["Base estimate",usd(r.sensitivity.base_usd)],["High sensitivity",usd(r.sensitivity.high_usd)]].forEach(function(v){var row=el("div","");row.appendChild(el("span","",v[0]));row.appendChild(el("b","",v[1]));eq.appendChild(row)});
    model.appendChild(eq);var pill=el("span","pill "+r.confidence.toLowerCase(),r.confidence+" confidence");model.appendChild(pill);detail.appendChild(model);
    var assumptions=el("section","detail-section");assumptions.appendChild(el("h3","","Assumptions"));var au=el("ul","evidence");(r.assumptions||[]).forEach(function(v){au.appendChild(el("li","",v))});assumptions.appendChild(au);detail.appendChild(assumptions);
    var sensitivity=el("section","detail-section");sensitivity.appendChild(el("h3","","Sensitivity"));sensitivity.appendChild(el("p","sub",r.sensitivity.drive));detail.appendChild(sensitivity);
    var steps=el("section","detail-section");steps.appendChild(el("h3","","Specific farm plan"));var su=el("ol","steps");(r.farm_steps||[]).forEach(function(v){su.appendChild(el("li","",v))});steps.appendChild(su);detail.appendChild(steps);
    var caveat=el("section","detail-section");var cv=el("div","caveat",r.caveat);caveat.appendChild(cv);detail.appendChild(caveat);
  }
  function closeDetail(){state.selected=null;detail.hidden=true;writeHash()}
  function render() {
    app.setAttribute("aria-busy","false");app.replaceChildren();
    var shell=el("div","shell");shell.appendChild(header());
    var lede=el("section","lede");var copy=el("div","");copy.appendChild(el("h1","","Pre-token protocol radar"));copy.appendChild(el("p","",""+D.watchlist_size+" watchlist protocols plus "+D.early_size+" credible beyond-floor candidates. Ranked estimates use TVL, comparable market-cap ratios, growth, and tracking age."));
    var metrics=el("div","metrics");
    [["Board",D.board_size],["Watchlist",D.watchlist_size],["Beyond floor",D.early_size],["Live comparables",D.live_size]].forEach(function(v){var m=el("div","metric");m.appendChild(el("span","",v[0]));m.appendChild(el("b","",String(v[1])));metrics.appendChild(m)});
    lede.appendChild(copy);lede.appendChild(metrics);shell.appendChild(lede);shell.appendChild(controls());
    var boardContent=el("div","","");boardContent.id="board-content";boardContent.appendChild(table());shell.appendChild(boardContent);
    var method=el("div","method panel");
    var methodText=el("span","");
    var methodLabel=el("strong","","Method:");
    methodText.appendChild(methodLabel);
    methodText.appendChild(document.createTextNode(" "+D.comparable_method));
    method.appendChild(methodText);method.appendChild(el("span","","No promised issuance or reward"));
    shell.appendChild(method);app.appendChild(shell);
  }
  readHash();render();
  if(state.selected)openDetail(state.selected);
  window.addEventListener("hashchange",function(){readHash();render();if(state.selected)openDetail(state.selected)});
})();
