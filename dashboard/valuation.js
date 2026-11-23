(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TokenRadarValuation=factory()}(typeof globalThis!=='undefined'?globalThis:this,function(){
"use strict";
function clamp(n,lo,hi){return Math.max(lo,Math.min(hi,n))}
function median(values){var clean=(values||[]).filter(function(n){return Number.isFinite(n)&&n>0.01&&n<100}).sort(function(a,b){return a-b});if(!clean.length)return null;var m=Math.floor(clean.length/2);return clean.length%2?clean[m]:((clean[m-1]+clean[m])/2)}
function ageDays(asOf,listed){if(!listed)return null;var a=Date.parse(asOf+'T00:00:00Z'),b=Date.parse(listed+'T00:00:00Z');return Number.isFinite(a)&&Number.isFinite(b)?Math.max(0,Math.floor((a-b)/86400000)):null}
function calculate(input){var m=input.model,g=clamp(input.change7d==null?0:input.change7d,m.growth_floor,m.growth_cap),gm=1+(g/100)*m.growth_weight,age=ageDays(input.asOf,input.listedAt),au=age===null?m.unknown_age_days:age,mm=m.maturity_floor+clamp(au,0,m.maturity_days)/m.maturity_days*m.maturity_range,tvl=input.tvlUsd*m.tvl_multiple,ca=input.comparableRatio==null?null:input.tvlUsd*input.comparableRatio,blend=ca===null?tvl:tvl*(1-m.comparable_blend)+ca*m.comparable_blend,implied=Math.max(1,Math.round(blend*gm*mm));return{age:age,growth:g,growthMultiplier:gm,maturityMultiplier:mm,tvlAnchor:tvl,comparableAnchor:ca,implied:implied}}
function spearman(a,b){function ranks(v){var o=v.map(function(x,i){return[x,i]}).sort(function(x,y){return x[0]-y[0]||x[1]-y[1]}),r=[];for(var i=0;i<o.length;){var j=i;while(j<o.length&&o[j][0]==o[i][0])j++;var avg=(i+j-1)/2+1;for(var k=i;k<j;k++)r[o[k][1]]=avg;i=j}return r}if(!a.length)return 0;var x=ranks(a),y=ranks(b),xm=x.reduce(function(s,n){return s+n},0)/x.length,ym=y.reduce(function(s,n){return s+n},0)/y.length,num=0,dx=0,dy=0;for(var i=0;i<x.length;i++){var xx=x[i]-xm,yy=y[i]-ym;num+=xx*yy;dx+=xx*xx;dy+=yy*yy}return dx&&dy?num/Math.sqrt(dx*dy):0}
function ols(rows,features,lambda){if(!rows.length||!features.length)return[];var p=features[0].length,n=rows.length,xtx=Array(p*p).fill(0),xty=Array(p).fill(0);rows.forEach(function(r,i){for(var a=0;a<p;a++){xty[a]+=features[i][a]*r.y;for(var b=0;b<p;b++)xtx[a*p+b]+=features[i][a]*features[i][b]}});for(var d=1;d<p;d++)xtx[d*p+d]+=lambda;var a=xtx.slice(),b=xty.slice();for(var k=0;k<p;k++){var pivot=k;for(var i=k+1;i<p;i++)if(Math.abs(a[i*p+k])>Math.abs(a[pivot*p+k]))pivot=i;if(Math.abs(a[pivot*p+k])<1e-12)continue;for(var j=k;j<p;j++){var t=a[k*p+j];a[k*p+j]=a[pivot*p+j];a[pivot*p+j]=t}var t=b[k];b[k]=b[pivot];b[pivot]=t;var z=a[k*p+k];for(j=k;j<p;j++)a[k*p+j]/=z;b[k]/=z;for(i=0;i<p;i++)if(i!==k){z=a[i*p+k];for(j=k;j<p;j++)a[i*p+j]-=z*a[k*p+j];b[i]-=z*b[k]}}return b}
function design(p,categories,option,asOf){var x=[1];if(option.size)x.push(Math.log(Math.max(1,p.tvl_usd)));if(option.growth)x.push(p.change_7d==null?0:clamp(p.change_7d,-60,120)/100);if(option.age){var age=ageDays(asOf,p.listed_at);x.push(age==null?365/1095:clamp(age,0,1095)/1095)}if(option.category)categories.forEach(function(c){x.push(p.category===c?1:0)});return x}
function fit(peers,categories,option,asOf){
  var model={tvl_multiple:.25,growth_weight:.35,growth_floor:-60,growth_cap:120,maturity_floor:.75,maturity_range:.30,maturity_days:1095,unknown_age_days:365,comparable_blend:.45};
  if(option.name==='flat'||option.name==='v2'){
    var peer=[].concat(peers).filter(function(p){return p.mcap_usd>0&&p.tvl_usd>0});
    var ratios=peer.map(function(p){return p.mcap_usd/p.tvl_usd}).filter(function(r){return r>.01&&r<100});
    return{option:option,categories:categories,asOf:asOf,beta:[],ratio:median(ratios),model:model,peers:peer};
  }
  var features=peers.map(function(p){return design(p,categories,option,asOf)}),y=peers.map(function(p){return Math.log(Math.max(1,p.mcap_usd))}),beta=ols(y.map(function(v){return{y:v}}),features,option.category?20:0);
  return{option:option,categories:categories,asOf:asOf,beta:beta,ratio:null,model:model,peers:peers};
}
function predict(f,p){if(f.option.name==='flat')return p.tvl_usd*.25;if(f.option.name==='v2'){var cat=f.peers.filter(function(q){return q.category===p.category&&q.mcap_usd>0&&q.tvl_usd>0}),pool=cat.length>=3?cat:f.peers.filter(function(q){return q.mcap_usd>0&&q.tvl_usd>0}),ratios=pool.map(function(q){return q.mcap_usd/q.tvl_usd}).filter(function(r){return r>.01&&r<100}),ratio=median(ratios),tvl=p.tvl_usd*.25,anchor=ratio==null?tvl:tvl*(1-f.model.comparable_blend)+p.tvl_usd*ratio*f.model.comparable_blend,c=calculate({model:f.model,change7d:p.change_7d,asOf:f.asOf,listedAt:p.listed_at,tvlUsd:p.tvl_usd,comparableRatio:ratio});return anchor*c.growthMultiplier*c.maturityMultiplier}var x=design(p,f.categories,f.option,f.asOf),z=0;for(var i=0;i<f.beta.length;i++)z+=(Number.isFinite(f.beta[i])?f.beta[i]:0)*x[i];var v=Math.exp(z);return Number.isFinite(v)?v:Math.max(1,p.tvl_usd*.25)}
function trueMedian(values){if(!values.length)return null;var v=values.slice().sort(function(a,b){return a-b}),m=Math.floor(v.length/2);return v.length%2?v[m]:((v[m-1]+v[m])/2)}
function evaluate(pairs){var actual=[],pred=[],ratios=[],residual=[];pairs.forEach(function(x){var a=Number(x.actual),b=Number(x.predicted);if(!Number.isFinite(a)||!Number.isFinite(b)||a<=0||b<=0)return;actual.push(a);pred.push(b);ratios.push(Math.max(a/b,b/a));residual.push(Math.log(a)-Math.log(b))});return{median_multiplicative_error:trueMedian(ratios),rank_correlation:spearman(actual,pred),n:pairs.length,residual:residual}}
function looPairs(peers,categories,option,asOf){var pairs=[];for(var i=0;i<peers.length;i++){var train=peers.filter(function(_,j){return j!==i}),f=fit(train,categories,option,asOf),p=peers[i];pairs.push({actual:p.mcap_usd,predicted:predict(f,p)})}return pairs}
function parityCheck(derived,exported){
  if(!Array.isArray(derived)||!Array.isArray(exported)||derived.length!==exported.length)return false;
  for(var i=0;i<derived.length;i++){if(!Array.isArray(derived[i])||derived[i].length!==3||derived[i][0]!==exported[i][0]||derived[i][1]!==exported[i][1]||derived[i][2]!==exported[i][2])return false}return true;
}
function proof(snapshot){
  var peers=snapshot.protocols.filter(function(p){return p.mcap_usd!==null&&p.mcap_usd>0&&p.tvl_usd>0});
  if(peers.length<2)return{peer_count:peers.length,options:{},selected:'flat',parameters:fit([],[],{name:'flat'},snapshot.as_of),held_out:{median_multiplicative_error:null,rank_correlation:0,n:0,residual:[]},bands:{low:.75,high:1.25,basis:'insufficient held-out peers'},older_to_newer:{n:0,median_multiplicative_error:null,rank_correlation:0},newer_to_older:{n:0,median_multiplicative_error:null,rank_correlation:0},cohort_note:'Unknown-dated records excluded.',peers:[]};
  var categories=[];peers.forEach(function(p){if(p.category&&categories.indexOf(p.category)<0)categories.push(p.category)});
  var options=[{name:'flat',size:false,growth:false,age:false,category:false},{name:'v2',size:false,growth:true,age:true,category:true},{name:'log-size',size:true,growth:false,age:false,category:false},{name:'log-size-category',size:true,growth:false,age:false,category:true},{name:'log-size-growth',size:true,growth:true,age:false,category:false},{name:'log-size-age',size:true,growth:false,age:true,category:false},{name:'log-size-growth-age-category',size:true,growth:true,age:true,category:true}],pairs={},metrics={};
  options.forEach(function(option){pairs[option.name]=looPairs(peers,categories,option,snapshot.as_of);metrics[option.name]=evaluate(pairs[option.name])});
  var lowest=options.slice().sort(function(a,b){var am=metrics[a.name].median_multiplicative_error,bm=metrics[b.name].median_multiplicative_error;if(am==null)return 1;if(bm==null)return -1;if(am!==bm)return am-bm;return metrics[b.name].rank_correlation-metrics[a.name].rank_correlation})[0];
  var deployed=options.find(function(o){return o.name==='log-size-growth-age-category'})||lowest;
  var selected=deployed;
  var held=metrics[selected.name],residual=held.residual.slice().sort(function(a,b){return a-b}),qlo=residual.length?residual[Math.floor(residual.length*.1)]:-.25,qhi=residual.length?residual[Math.ceil(residual.length*.9)-1]:.25;
  var known=peers.filter(function(p){return p.listed_at}).sort(function(a,b){return a.listed_at.localeCompare(b.listed_at)}),dates=known.map(function(p){return p.listed_at}).filter(function(d,i,a){return i===0||d!==a[i-1]}),boundary=dates.length?dates[Math.floor(dates.length*.7)]:null;
  var older=boundary?known.filter(function(p){return p.listed_at<boundary}):[],newer=boundary?known.filter(function(p){return p.listed_at>=boundary}):[];
  function cohort(train,test){var f=fit(train,categories,selected,snapshot.as_of),pairs=test.map(function(p){return{actual:p.mcap_usd,predicted:predict(f,p)}});return evaluate(pairs)}
  var full=fit(peers,categories,selected,snapshot.as_of),bands={low:Math.exp(qlo),high:Math.exp(qhi),basis:'10th/90th pooled leave-one-out residual ratios; illustrative, snapshot not backtest'};
  return{peer_count:peers.length,options:metrics,lowest_error:lowest.name,selected:selected.name,parameters:full,held_out:held,bands:bands,older_to_newer:cohort(older,newer),newer_to_older:cohort(newer,older),cohort_note:'Snapshot-date grouping from listed_at; train strictly before boundary, test at/after boundary; unknown dates excluded. Boundary '+(boundary||'none')+', neither side is a historical backtest.',peers:peers.slice(0,12).map(function(p){return[p.slug,p.name,p.category,p.tvl_usd,p.mcap_usd,p.change_7d,p.listed_at]})};
}
function selectedPredict(parameters,p){return predict(parameters,p)}
function buildPlan(protocol,ageDaysValue){
  var c=(protocol.category||'').toLowerCase(),chain=(protocol.chains&&protocol.chains[0])||'main chain',capital=protocol.tvl_usd>=5000000000?250:protocol.tvl_usd>=1000000000?150:protocol.tvl_usd>=100000000?100:50,hold=ageDaysValue===null||ageDaysValue===undefined?30:ageDaysValue<180?60:ageDaysValue<365?45:30;
  var lending=/lend|lending|cdp|collateral/.test(c),pool=/dex|pool|yield|liquidity|amm/.test(c),skip=/bridge|staking|restak/.test(c)||/cex/.test(c);
  var status=skip?'Skip':lending||pool?'Conditional':'Research';
  if(status==='Research'){
    var researchSteps=['Read-only research: verify an official supported product for '+protocol.name+' on '+chain+'; the snapshot category does not establish one. $0 execution, hands-on 20m.',
      'Go/no-go: require official app/contract, stable route, balance/liquidity, approval scope and a verified withdrawal or settlement page. $0 execution, hands-on 20m.',
      'Do not size or enter until a documented route passes the checklist. Hypothetical budget $0; no fee or gas market quote is assumed.',
      'Personal monitor: check availability once weekly, as a user-defined assumption rather than campaign cadence. Hands-on 5m.',
      'Stop: cancel if support, chain, route or exit terms remain unclear. $0 execution and $0 execution fees.',
      'Unwind: no transaction is recommended; record the result of verification and close the case. Hands-on 5m.'];
    return{status:status,capital:0,fees:0,gas:0,total:0,hold:hold,steps:researchSteps};
  }
  if(status==='Skip'){
    var skipSteps=['Read-only: verify whether '+protocol.name+' has a stable route on '+chain+' and whether withdrawal or unstaking is actually available. Hypothetical cost $0; hands-on 15m.',
      'Go/no-go: require official contract, support status, and an exit/settlement page; if unavailable, keep $0 execution budget. Hands-on 20m.',
      'Do not enter: '+protocol.name+' is not given a runnable workflow by the snapshot; personal monitor weekly, not a campaign cadence. Hands-on 5m.',
      'Stop: cancel before wallet approval if oracle, route, lockup or settlement is unclear. $0 until verified.',
      'No unwind transaction: if no route exists, record verification and close the case. Hands-on 5m.',
      'Exit/settlement: this category has no verified execution claim; no fees or market quotes are implied.'];
    return{status:status,capital:0,fees:0,gas:0,total:0,hold:hold,steps:skipSteps};
  }
  var product=lending?'supported supply, borrow, or collateral market':'low-complexity two-asset liquidity pool';
  var entryFee=lending?0.50:pool?1.50:0.50,entryGas=lending?4:pool?6:3;
  var exitFee=lending?0.50:pool?1.50:0.50,exitGas=lending?4:pool?6:3;
  var fee=entryFee+exitFee,gas=entryGas+exitGas,total=capital+fee+gas;
  var steps=lending?[
    'Research: open the official '+protocol.name+' app and '+chain+' contract for a supported '+product+'; verify the exact route and withdrawal page. Read-only $0, hands-on 20m.',
    'Gate: confirm stable availability, approval scope, pool/market balance, fees, oracle/liquidation or depeg terms, and a cancellable exit. Read-only $0, hands-on 20m.',
    'Hypothetical size: cap capital at $'+capital+'. Entry assumption: $'+entryFee.toFixed(2)+' protocol fee + $'+entryGas.toFixed(2)+' gas. Exit assumption: $'+exitFee.toFixed(2)+' protocol fee + $'+exitGas.toFixed(2)+' gas. Principal is not a fee. Total costs $'+(fee+gas).toFixed(2)+'; principal-plus-cost $'+total.toFixed(2)+', hands-on 15m.',
    'Enter only if verified: test one small user-sized position, retain transaction and route links, and set a personal stop threshold. Elapsed '+hold+'d hold assumption, hands-on 15m.',
    'Monitor: personally check position, risk and withdrawal status once weekly (not a campaign cadence); stop if availability or liquidation/depeg terms worsen. Hands-on 10m.',
    'Cancel/unwind: close or redeem through the verified interface, verify settlement, and use $'+exitGas.toFixed(2)+' exit-gas assumption plus $'+exitFee.toFixed(2)+' hypothetical exit fee. Hands-on 20m.'
  ]:[
    'Research: open the official '+protocol.name+' app and '+chain+' contract for a supported low-complexity two-asset liquidity pool; verify the exact pair, pool, and withdrawal route. Read-only $0, hands-on 20m.',
    'Gate: confirm pool availability, pair balance, approval scope, pool share terms, slippage, fees, oracle/depeg risk and a cancellable withdrawal route. Read-only $0, hands-on 20m.',
    'Hypothetical size: cap capital at $'+capital+'. Entry assumption: $'+entryFee.toFixed(2)+' protocol fee + $'+entryGas.toFixed(2)+' gas. Exit assumption: $'+exitFee.toFixed(2)+' protocol fee + $'+exitGas.toFixed(2)+' gas. Principal is not a fee. Total costs $'+(fee+gas).toFixed(2)+'; principal-plus-cost $'+total.toFixed(2)+', hands-on 15m.',
    'Enter only if verified: add one small pool position after checking pair balance and slippage, retain transaction/route links, and set a personal stop threshold. Elapsed '+hold+'d hold assumption, hands-on 15m.',
    'Monitor: personally check pool share, pair balance, withdrawal liquidity and depeg/slippage risk once weekly (not campaign cadence); stop if terms worsen. Hands-on 10m.',
    'Cancel/unwind: burn or withdraw the pool share through the verified interface, verify settlement and pair redemption, and use $'+exitGas.toFixed(2)+' exit-gas plus $'+exitFee.toFixed(2)+' hypothetical exit fee. Hands-on 20m.'
  ];
  return{status:status,capital:capital,fees:fee,gas:gas,total:total,entry:{fee:entryFee,gas:entryGas},exit:{fee:exitFee,gas:exitGas},hold:hold,steps:steps};
}
function scenarioMath(input){var capital=Math.max(0,Number(input.capital)||0),rate=Math.max(0,Number(input.rate)||0)/100,days=Math.max(0,Number(input.days)||0),fees=Math.max(0,Number(input.fees)||0),raw=input.probability===undefined?100:Number(input.probability),probability=Number.isFinite(raw)?clamp(raw,0,100)/100:1,opportunity=capital*rate*days/365,breakEven=fees+opportunity,conditionalRequired=probability>0?breakEven/probability:null;return{opportunity:opportunity,breakEven:breakEven,conditionalRequired:conditionalRequired}}
return{clamp:clamp,median:median,ageDays:ageDays,calculate:calculate,spearman:spearman,ols:ols,fit:fit,predict:predict,evaluate:evaluate,proof:proof,selectedPredict:selectedPredict,parityCheck:parityCheck,buildPlan:buildPlan,scenarioMath:scenarioMath};
}));
