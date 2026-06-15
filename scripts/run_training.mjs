/**
 * FocusMeet ML Training Pipeline — pure Node.js implementation.
 * Generates 2000 synthetic samples, trains 3 linear models via closed-form
 * normal equations, evaluates MAE/R²/feature importances, writes results.
 *
 * Run: node scripts/run_training.mjs
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ML_DIR = join(__dirname, '..', 'backend', 'ml');
if (!existsSync(ML_DIR)) mkdirSync(ML_DIR, { recursive: true });

const FEATURES = [
  'focus_score','face_detected','gaze_variance','blink_rate',
  'mic_active_pct','speaking_turns','words_per_min',
  'typing_events_per_min','chat_messages_in_window',
  'chat_sentiment_avg','reaction_count_in_window','poll_participation',
];
const N = 2000, TEST = 0.2, p = FEATURES.length;

let _s = 42;
const sr = s => { _s = s; };
const rn = () => { _s = (_s * 16807) % 2147483647; return (_s - 1) / 2147483646; };
const gs = (m, s) => { const u = rn(), v = rn(); return m + s * Math.sqrt(-2*Math.log(u||1e-4)) * Math.cos(2*Math.PI*v); };
const cl = (v, a=0, b=100) => Math.max(a, Math.min(b, v));
const ch = (items, wts) => { const t = wts.reduce((a,b)=>a+b); let r = rn()*t, a = 0;
  for (let i = 0; i < items.length; i++) { a += wts[i]; if (r <= a) return items[i]; } return items.at(-1); };

function genRow() {
  const ar = ch(['F','P','D','A','M'],[35,25,15,15,10]);
  let f,fc,gv,br,mi,tu,wp,ty,cn,se,re,po,en;
  if (ar==='F'){f=cl(78+gs(0,12));fc=1;gv=Math.max(0,3.5+gs(0,2.5));br=cl(14+gs(0,4),0,40);mi=cl(35+gs(0,18));tu=Math.max(0,Math.round(3+gs(0,2)));wp=Math.max(0,28+gs(0,12));ty=Math.max(0,8+gs(0,5));cn=Math.max(0,Math.round(2+gs(0,1.5)));se=cl(.3+gs(0,.25),-1,1);re=Math.max(0,Math.round(1.5+gs(0,1.2)));po=ch([1,0,-1],[60,20,20]);en=cl(72+gs(0,8));}
  else if(ar==='P'){f=cl(55+gs(0,15));fc=1;gv=Math.max(0,8+gs(0,4));br=cl(16+gs(0,5),0,40);mi=cl(8+gs(0,8));tu=Math.max(0,Math.round(.5+gs(0,.8)));wp=Math.max(0,5+gs(0,4));ty=Math.max(0,3+gs(0,3));cn=Math.max(0,Math.round(.5+gs(0,.8)));se=cl(.05+gs(0,.2),-1,1);re=Math.max(0,Math.round(.3+gs(0,.6)));po=ch([1,0,-1],[30,40,30]);en=cl(42+gs(0,10));}
  else if(ar==='D'){fc=rn()>.4?1:0;f=fc?cl(15+gs(0,12)):0;gv=fc?Math.max(0,18+gs(0,6)):0;br=fc?cl(10+gs(0,5),0,40):0;mi=cl(2+gs(0,3));tu=0;wp=Math.max(0,1+gs(0,2));ty=Math.max(0,.5+gs(0,1));cn=0;se=0;re=0;po=ch([0,-1],[30,70]);en=cl(12+gs(0,7));}
  else if(ar==='A'){fc=0;f=0;gv=0;br=0;mi=cl(55+gs(0,20));tu=Math.max(0,Math.round(4+gs(0,2)));wp=Math.max(0,35+gs(0,15));ty=Math.max(0,12+gs(0,6));cn=Math.max(0,Math.round(1.5+gs(0,1.2)));se=cl(.15+gs(0,.3),-1,1);re=Math.max(0,Math.round(1+gs(0,1)));po=ch([1,0,-1],[50,25,25]);en=cl(58+gs(0,12));}
  else{f=cl(40+gs(0,15));fc=1;gv=Math.max(0,22+gs(0,8));br=cl(20+gs(0,6),0,45);mi=cl(15+gs(0,12));tu=Math.max(0,Math.round(1+gs(0,1.2)));wp=Math.max(0,10+gs(0,8));ty=Math.max(0,18+gs(0,8));cn=Math.max(0,Math.round(3+gs(0,2)));se=cl(.1+gs(0,.3),-1,1);re=Math.max(0,Math.round(2+gs(0,1.5)));po=ch([1,0,-1],[40,35,25]);en=cl(38+gs(0,10));}
  return{focus_score:+f.toFixed(2),face_detected:fc,gaze_variance:+gv.toFixed(4),blink_rate:+br.toFixed(2),mic_active_pct:+mi.toFixed(2),speaking_turns:tu,words_per_min:+wp.toFixed(2),typing_events_per_min:+ty.toFixed(2),chat_messages_in_window:cn,chat_sentiment_avg:+se.toFixed(4),reaction_count_in_window:re,poll_participation:po<0?0:po,self_reported_score:+en.toFixed(2)};
}

// ─── Linear algebra ──────────────────────────────────────
const tp = A => A[0].map((_,j)=>A.map(r=>r[j]));
const mm = (A,B) => A.map(r=>B[0].map((_,j)=>r.reduce((s,v,k)=>s+v*B[k][j],0)));
const mv = (A,v) => A.map(r=>r.reduce((s,a,j)=>s+a*v[j],0));
const ad = (A,l) => A.map((r,i)=>r.map((v,j)=>v+(i===j?l:0)));
function inv(M){const n=M.length;const a=M.map((r,i)=>[...r,...Array.from({length:n},(_,j)=>i===j?1:0)]);
for(let c=0;c<n;c++){let mx=c;for(let r=c+1;r<n;r++)if(Math.abs(a[r][c])>Math.abs(a[mx][c]))mx=r;
[a[c],a[mx]]=[a[mx],a[c]];const pv=a[c][c]||1e-12;for(let j=0;j<2*n;j++)a[c][j]/=pv;
for(let r=0;r<n;r++){if(r===c)continue;const f=a[r][c];for(let j=0;j<2*n;j++)a[r][j]-=f*a[c][j];}}
return a.map(r=>r.slice(n));}
const fit=(X,y,l=0)=>{const Xt=tp(X);let XtX=mm(Xt,X);if(l>0)XtX=ad(XtX,l);return mv(inv(XtX),Xt.map(r=>r.reduce((s,v,i)=>s+v*y[i],0)));};
const pred=(X,w)=>X.map(r=>Math.max(0,Math.min(100,r.reduce((s,v,j)=>s+v*w[j],0))));
const mae=(yt,yp)=>yt.reduce((s,v,i)=>s+Math.abs(v-yp[i]),0)/yt.length;
const r2=(yt,yp)=>{const m=yt.reduce((a,b)=>a+b)/yt.length;const sr=yt.reduce((s,v,i)=>s+(v-yp[i])**2,0);const st=yt.reduce((s,v)=>s+(v-m)**2,0);return st>0?1-sr/st:0;};
function v1fb(row){const fo=row.focus_score,fa=!!row.face_detected,mi=row.mic_active_pct,w=row.words_per_min,t=row.typing_events_per_min;
const cs=Math.min(row.chat_messages_in_window*25,100),rs=Math.min(row.reaction_count_in_window*20,100);
if(fa)return cl(.6*fo+.2*mi+.1*cs+.1*rs);return cl(.4*mi+.2*Math.min(w/2,100)+.2*cs+.1*Math.min(t/.5,100)+.1*rs);}

// ─── MAIN ────────────────────────────────────────────────
sr(42);
const rows = Array.from({length:N}, genRow);
const means = FEATURES.map(f=>rows.reduce((s,r)=>s+r[f],0)/N);
const stds = FEATURES.map((f,j)=>{const m=means[j];const v=rows.reduce((s,r)=>s+(r[f]-m)**2,0)/N;return Math.sqrt(v)||1;});
const XAll = rows.map(r=>[1,...FEATURES.map((f,j)=>(r[f]-means[j])/stds[j])]);
const yAll = rows.map(r=>r.self_reported_score);
const idx = Array.from({length:N},(_,i)=>i);
for(let i=idx.length-1;i>0;i--){const j=Math.floor(rn()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]];}
const sp=Math.floor(N*(1-TEST));
const trI=idx.slice(0,sp),teI=idx.slice(sp);
const XTr=trI.map(i=>XAll[i]),yTr=trI.map(i=>yAll[i]);
const XTe=teI.map(i=>XAll[i]),yTe=teI.map(i=>yAll[i]);

console.log(`\n${'='.repeat(64)}`);
console.log(`  FocusMeet Engagement Model — Training Pipeline`);
console.log(`${'='.repeat(64)}`);
console.log(`  Dataset: ${N} samples, ${p} features`);
console.log(`  Split:   ${trI.length} train / ${teI.length} test`);
console.log(`${'='.repeat(64)}\n`);

const models = {};
for(const [nm,l] of [['LinearRegression',0],['Ridge (α=1.0)',1],['Ridge (α=10)',10]]){
  const w=fit(XTr,yTr,l);const yp=pred(XTe,w);const m=mae(yTe,yp),rv=r2(yTe,yp);
  models[nm]={w,mae:+m.toFixed(3),r2:+rv.toFixed(4)};
  console.log(`  ${nm}\n    MAE:  ${m.toFixed(3)}\n    R²:   ${rv.toFixed(4)}\n`);
}
const bn=Object.keys(models).reduce((a,b)=>models[a].r2>models[b].r2?a:b);
const best=models[bn];
console.log(`${'─'.repeat(64)}`);
console.log(`  ★ Best model: ${bn}`);
console.log(`    MAE = ${best.mae}   R² = ${best.r2}`);
console.log(`${'─'.repeat(64)}\n`);

const ca=FEATURES.map((_,j)=>Math.abs(best.w[j+1]));
const ti=ca.reduce((a,b)=>a+b)||1;
const imp={};FEATURES.forEach((f,j)=>{imp[f]=+(ca[j]/ti*100).toFixed(2);});
const si=Object.entries(imp).sort((a,b)=>b[1]-a[1]);
console.log('  Feature Importances (% of total |coef|):');
console.log(`  ${'Feature'.padEnd(30)} ${'Importance'.padStart(10)}`);
console.log(`  ${'─'.repeat(42)}`);
for(const [f,v] of si){console.log(`  ${f.padEnd(30)} ${v.toFixed(2).padStart(8)}%  ${'█'.repeat(Math.floor(v/2))}${'░'.repeat(Math.max(0,25-Math.floor(v/2)))}`);}

console.log(`\n${'─'.repeat(64)}`);
console.log('  v1 Fallback baseline:');
const yV1=teI.map(i=>v1fb(rows[i]));
const mV1=mae(yTe,yV1),rV1=r2(yTe,yV1);
console.log(`    MAE:  ${mV1.toFixed(3)}\n    R²:   ${rV1.toFixed(4)}\n`);
const mi2=(mV1-best.mae)/mV1*100,ri2=best.r2-rV1;
console.log(`  📊 Improvement over v1 fallback:`);
console.log(`     MAE reduced by ${mi2.toFixed(1)}%`);
console.log(`     R² improved by ${ri2>=0?'+':''}${ri2.toFixed(4)}\n`);

const output={dataset_size:N,test_size:teI.length,feature_count:p,feature_order:FEATURES,
  models:Object.fromEntries(Object.entries(models).map(([k,v])=>[k,{mae:v.mae,r2:v.r2}])),
  best_model:bn,best_mae:best.mae,best_r2:best.r2,v1_mae:+mV1.toFixed(3),v1_r2:+rV1.toFixed(4),
  mae_improvement_pct:+mi2.toFixed(1),r2_improvement:+ri2.toFixed(4),feature_importances:Object.fromEntries(si)};

writeFileSync(join(ML_DIR,'ml_results.json'),JSON.stringify(output,null,2));
writeFileSync(join(ML_DIR,'fusion_model.json'),JSON.stringify({model_type:bn,weights:best.w,feature_order:FEATURES,means,stds,bias:best.w[0]},null,2));
console.log(`  ✓ Results → backend/ml/ml_results.json`);
console.log(`  ✓ Model   → backend/ml/fusion_model.json`);
console.log(`\n${'='.repeat(64)}\n`);
