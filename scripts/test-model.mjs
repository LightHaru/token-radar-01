import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const V=require('../dashboard/valuation.js');

const model={tvl_multiple:.25,growth_weight:.35,growth_floor:-60,growth_cap:120,maturity_floor:.75,maturity_range:.30,maturity_days:1095,unknown_age_days:365,comparable_blend:.45};
function calc(change7d,listedAt='2024-01-01'){return V.calculate({model,change7d,asOf:'2026-11-14',listedAt,tvlUsd:100000000,comparableRatio:1})}
if(!(calc(-10).implied<calc(0).implied&&calc(0).implied<calc(10).implied))throw new Error('growth monotonicity');
if(calc(null).implied!==calc(0).implied)throw new Error('missing growth');
if(calc(0,null).age!==null)throw new Error('unknown age handling changed');
if(calc(120).growth!==120||calc(-60).growth!==-60||calc(1000).growth!==120||calc(-1000).growth!==-60)throw new Error('growth clamp');
if(calc(0,'2020-01-01').maturityMultiplier<=calc(0,'2026-01-01').maturityMultiplier)throw new Error('age scaling');
const scenario=V.scenarioMath({capital:100,fees:5,days:365,rate:10,probability:100});
if(scenario.opportunity!==10||scenario.breakEven!==15)throw new Error('scenario cost/reward');
const conditional=V.scenarioMath({capital:100,fees:5,days:365,rate:10,probability:50});
if(conditional.breakEven!==15||conditional.conditionalRequired!==30)throw new Error('50% conditional');
const zero=V.scenarioMath({capital:100,fees:5,days:365,rate:10,probability:0});
if(zero.conditionalRequired!==null)throw new Error('0% probability not unattainable');
const v2Tiny=V.fit([{slug:'a',mcap_usd:1,tvl_usd:100000,category:'Lending',change_7d:1,listed_at:'2025-01-01'}],['Lending'],{name:'v2'},'2026-11-14');
const v2Pred=V.predict(v2Tiny,{category:'Lending',tvl_usd:1000000,change_7d:0,listed_at:'2025-01-01'});
if(!Number.isFinite(v2Pred)||v2Pred<=0)throw new Error('V2 null-comparable fallback is not finite');
const mini=V.proof({as_of:'2026-11-14',protocols:[{slug:'a',mcap_usd:100,tvl_usd:50,category:'Dexs',change_7d:2,listed_at:'2025-01-01'},{slug:'b',mcap_usd:200,tvl_usd:50,category:'Lending',change_7d:-2,listed_at:'2024-01-01'}]});
if(mini.peer_count!==2||!mini.parameters)throw new Error('tiny fixture proof');

const kit=process.env.KIT_DIR;if(!kit&&!process.argv[2])throw new Error('pass snapshot argv or set KIT_DIR');
const snapshotArg=process.argv[2]||(kit?path.join(kit,'input','snapshot.json'):null);
const {parseSnapshot,buildRadar,boardIssue}=await import('../lib/model.ts');
const snapshot=parseSnapshot(fs.readFileSync(snapshotArg,'utf8'));
const {board,radar}=buildRadar(snapshot);
const partition=radar.full_coverage.partitions;
const accounted=partition.official.count+partition.eligible_above_floor.count+partition.eligible_early.count+partition.recorded_traded.count+partition.set_aside.count;
if(accounted!==snapshot.protocols.length||radar.full_coverage.unique!==snapshot.protocols.length)throw new Error('exact-one partition');
if(partition.official.count!==40||partition.official.count!==radar.coverage.covered)throw new Error('watchlist coverage');
if(partition.eligible_above_floor.count<1||partition.eligible_early.count<1)throw new Error('floor tiers missing');
if(boardIssue(board,snapshot))throw new Error(boardIssue(board,snapshot));
for(const slug of snapshot.watchlist)if(!board.some(r=>r.slug===slug))throw new Error('missing watchlist '+slug);
for(const slug of ['wbtc','binance-staked-eth','coinbase-wrapped-staked-eth','coinbase-staked-eth'])if(board.some(r=>r.slug===slug))throw new Error('derivative ranked '+slug);
for(const r of board){
  const p=snapshot.protocols.find(x=>x.slug===r.slug);
  const projected=Math.max(1,Math.round(V.selectedPredict(radar.valuation_proof.parameters,{category:p.category,tvl_usd:p.tvl_usd,change_7d:p.change_7d,listed_at:p.listed_at})));
  if(projected!==r.implied_value_usd)throw new Error('selected fit parity '+r.slug);
}
const proof=radar.valuation_proof;
if(!proof.peer_count||!proof.held_out||proof.held_out.n!==proof.peer_count)throw new Error('pooled held-out proof');
if(!proof.options||Object.keys(proof.options).length<5)throw new Error('candidate ablations missing');
if(!proof.older_to_newer||proof.older_to_newer.n<1||!proof.newer_to_older||proof.newer_to_older.n<1)throw new Error('older/newer cohort missing');
if(V.planStatus('Lending')!=='Conditional'||V.planStatus('Dexs')!=='Conditional'||V.planStatus('Bridge')!=='Skip'||V.planStatus('Chain')!=='Research')throw new Error('plan status');
const preSlugs=new Set(board.map(r=>r.slug));
const liveSlugs=new Set(radar.live.map(r=>r.slug));
if([...preSlugs].some(slug=>liveSlugs.has(slug)))throw new Error('live/pre-token slug overlap');
if(radar.live.length<1||radar.live.some(r=>r.slug===undefined))throw new Error('live reference rows missing');
const lending=V.planActions({name:'Lend Example',category:'Lending',chains:['Ethereum']});
const pool=V.planActions({name:'Pool Example',category:'Dexs',chains:['Base']});
const unknown=V.planActions({name:'Unknown Example',category:'Chain',chains:['Solana']});
if(!lending.verify.toLowerCase().includes('supply')||!pool.verify.toLowerCase().includes('pool')||unknown.status!=='Research')throw new Error('plan exemplars');

const triples=board.map(r=>[r.rank,r.slug,r.implied_value_usd]);
const corrupt=triples.map(x=>x.slice());corrupt[0][2]++;
if(V.parityCheck(triples,triples)!==true)throw new Error('valid parity rejected');
if(V.parityCheck(triples,corrupt)!==false)throw new Error('corrupt parity accepted');
console.log(`valuation tests: baseline, fit candidates, pooled LOO, cohorts and tiny fixture pass`);
console.log(`snapshot tests: ${accounted}/${snapshot.protocols.length} exact, 40/40 watchlist, ${partition.eligible_above_floor.count} above-floor, ${partition.eligible_early.count} early, derivatives excluded`);
console.log(`fit: ${proof.selected}; pooled median ${proof.held_out.median_multiplicative_error}; pooled rank ${proof.held_out.rank_correlation}; peers ${proof.peer_count}`);
