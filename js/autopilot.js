window.AU = window.AU || {};

AU.autopilot = (() => {
  const U=()=>AU.util;
  function priority(level){return {critical:5,warning:4,opportunity:3,positive:2,info:1,quality:0}[level]||1;}
  function run(model){
    const intel=model.intelligence; const geo=model.geoIntelligence;
    const executed=[]; const recommendations=[];
    const add=(id,title,result,details=[],level='info',payload=null)=>executed.push({id,title,result,details,level,status:'executed',payload});

    const high=model.customers.filter(c=>c.risk?.key==='high').sort((a,b)=>b.estimatedMonthlyValue-a.estimatedMonthlyValue);
    add('customer-rescue','Liste de sauvetage clients générée',`${high.length} clients à risque élevé classés automatiquement`,high.slice(0,12).map(c=>`${c.client.name} · ${c.geo?.zone||'zone inconnue'} · ${U().money(c.estimatedMonthlyValue)}/mois estimés`),high.length>20?'warning':'info',{customers:high.map(c=>c.client.codeClient)});

    const restock=model.products.filter(p=>p.qty30>0&&p.stock!==null&&p.coverageDays!==null&&p.coverageDays<21).map(p=>({...p,target21:Math.max(0,Math.ceil(p.velocity30*21-p.stock))})).sort((a,b)=>(a.coverageDays??999)-(b.coverageDays??999));
    add('restock-plan','Plan de réapprovisionnement calculé',`${restock.length} références nécessitent une couverture à examiner`,restock.slice(0,12).map(p=>`${p.designation} · stock ${p.stock} · couverture ${p.coverageDays.toFixed(1)} j · cible +${p.target21}`),restock.some(p=>p.coverageDays<7)?'critical':'warning',{products:restock.map(p=>({code:p.code,target21:p.target21}))});

    const zones=(geo?.zones||[]).filter(z=>z.impactScore>=25);
    add('geo-watch','Surveillance géographique exécutée',zones.length?`${zones.length} zone(s) sous pression détectée(s)`:'Aucune zone sous pression significative',zones.slice(0,10).map(z=>`${z.name} · impact ${z.impactScore}/100 · CA ${z.caDelta===null?'—':`${(z.caDelta*100).toFixed(1)} %`} · visites ${z.visitsDelta===null?'—':`${(z.visitsDelta*100).toFixed(1)} %`}`),zones.some(z=>z.impactScore>=70)?'critical':zones.length?'warning':'positive');

    const forecastZones=(geo?.zones||[]).filter(z=>z.forecast7?.confidence>=55).sort((a,b)=>b.forecast7.ca-a.forecast7.ca);
    add('geo-forecast','Prévisions géographiques à 7 jours calculées',`${forecastZones.length} zone(s) avec historique suffisant`,forecastZones.slice(0,10).map(z=>`${z.name} · CA attendu ≈ ${U().money(z.forecast7.ca)} · ${z.forecast7.visits.toFixed(1)} visites · confiance ${z.forecast7.confidence} %`),'info');

    const due=model.customers.filter(c=>c.expectedNext&&c.expectedNext>=U().startOfDay(model.range.max)&&c.expectedNext<=U().endOfDay(U().addDays(model.range.max,7))).sort((a,b)=>b.estimatedMonthlyValue-a.estimatedMonthlyValue);
    add('due-next','Revisites attendues identifiées',`${due.length} clients devraient entrer dans leur fenêtre habituelle sous 7 jours`,due.slice(0,12).map(c=>`${c.client.name} · attendu vers ${U().formatDate(c.expectedNext)} · ${c.geo?.zone||'zone inconnue'}`),'info',{customers:due.map(c=>c.client.codeClient)});

    const decliners=(intel?.drivers?.products||[]).filter(p=>p.delta<0).sort((a,b)=>a.delta-b.delta).slice(0,15);
    add('product-decline','Produits en décrochage isolés',`${decliners.length} références principales expliquent une partie de la baisse`,decliners.map(p=>`${p.label} · ${U().money(p.delta)}`),decliners.length?'warning':'positive');

    const previousSnapshot=(model.analysisHistory||[]).at(-1);
    if(previousSnapshot?.geo?.length && geo?.zones?.length){
      const prevMap=new Map(previousSnapshot.geo.map(z=>[z.name,z]));
      const evolution=geo.zones.map(z=>{const p=prevMap.get(z.name);return p?{name:z.name,impactNow:z.impactScore,impactBefore:p.impactScore,deltaImpact:z.impactScore-p.impactScore,caNow:z.current.ca,caBefore:p.ca}:null}).filter(Boolean).sort((a,b)=>Math.abs(b.deltaImpact)-Math.abs(a.deltaImpact));
      add('since-last-import','Évolution depuis le dernier import analysée',evolution.length?`${evolution.length} zone(s) comparées au dernier snapshot local`:'Aucune zone comparable avec le snapshot précédent',evolution.slice(0,10).map(x=>`${x.name} · impact ${x.impactBefore} → ${x.impactNow} (${x.deltaImpact>=0?'+':''}${x.deltaImpact} pts) · CA fenêtre ${U().money(x.caBefore)} → ${U().money(x.caNow)}`),evolution.some(x=>x.deltaImpact>=20)?'warning':'info');
    }

    const ctx=model.contextCorrelation;
    if(ctx?.source){
      const s=ctx.source;
      const apiText=s.apiOk?`API Clermont connectée · ${s.totalDatasets??'—'} jeux détectés · ${s.apiLatency??'—'} ms`:`API Clermont indisponible · fallback local/pages activé`;
      const details=[apiText,`Sources publiques valides : ${s.ok}/${s.total}`,`Fraîcheur : ${s.ageHours===null?'inconnue':`${s.ageHours.toFixed(1)} h`}`,`État contexte : ${s.status}`];
      if(ctx.parking)details.push(`Parkings API : ${ctx.parking.records} relevé(s) · occupation moyenne ${ctx.parking.avgOccupancy.toFixed(1)} %`);
      if(ctx.apiDatasets)details.push(`Jeux connus API valides : ${ctx.apiDatasets.knownOk}/${ctx.apiDatasets.known.length} · candidats mobilité/travaux : ${ctx.apiDatasets.relevant.length}`);
      add('public-api-sentinel','Local Context Sentinel contrôlé',apiText,details,!s.apiOk||s.stale?'warning':'positive');
    }

    const causal=model.causalContext;
    if(causal){
      add('causal-context-engine','Moteur causal contrôlé',`${causal.tested} diagnostic(s) testés · ${causal.strong} cause(s) forte(s) · ${causal.moderate} compatible(s)`,causal.top.slice(0,10).map(x=>`${x.title} · ${x.label} ${x.score}/100 · ${x.topZone||'zone non dominante'}${x.works?.[0]?` · ${x.works[0].place||x.works[0].sector}`:''}`),causal.strong?'critical':causal.moderate?'warning':'positive',{diagnostics:causal.top.map(x=>x.findingId)});
      const causalOps=causal.top.filter(x=>['strong','moderate'].includes(x.status)).slice(0,8);
      add('causal-action-plan','Plan de vérification contextuelle généré',causalOps.length?`${causalOps.length} chaîne(s) explicative(s) suivies automatiquement`:'Aucune cause n’atteint le seuil de restitution',causalOps.map(x=>`${x.topZone||'Zone'} · ${x.title} · alternatives : ${(x.alternatives||[]).slice(0,2).map(a=>a.label).join(', ')||'aucune cause concurrente forte'}`),causalOps.some(x=>x.status==='strong')?'warning':'info');
    }

    const quality=model.quality;
    add('quality-guard','Contrôle qualité exécuté',quality.analysisAllowed?'Analyse autorisée : aucune contradiction bloquante':'Analyse bloquée',[
      `Rattachement client certifié : ${U().percent(quality.clientCertifiedCoverage)}`,
      `Couverture catalogue : ${U().percent(quality.catalogueCoverage)}`,
      `Intégrité financière : ${quality.financialIntegrity===null?'—':U().percent(quality.financialIntegrity)}`
    ],quality.status==='certified'?'positive':quality.analysisAllowed?'warning':'critical');

    const findings=[...(intel?.findings||[])].sort((a,b)=>(priority(b.level)*100+(b.confidence||0))-(priority(a.level)*100+(a.confidence||0)));
    for(const f of findings.slice(0,12)) for(const action of (f.actions||[]).slice(0,2)) recommendations.push({action,source:f.title,confidence:f.confidence,level:f.level,external:false});
    if(high.length) recommendations.push({action:`Utiliser la liste automatique des ${Math.min(30,high.length)} clients à plus forte valeur pour préparer une campagne de réactivation conforme aux consentements commerciaux.`,source:'Liste de sauvetage clients',confidence:90,level:'warning',external:true});
    if(restock.length) recommendations.push({action:`Vérifier/commander les ${Math.min(15,restock.length)} références les plus tendues selon la cible de 21 jours calculée automatiquement.`,source:'Plan stock',confidence:94,level:'warning',external:true});

    const critical=executed.filter(x=>x.level==='critical').length; const warnings=executed.filter(x=>x.level==='warning').length;
    const brief=[
      `Autopilot a exécuté ${executed.length} contrôles/actions internes sans intervention.`,
      zones.length?`${zones.length} zone(s) géographique(s) nécessitent une surveillance renforcée.`:'Aucune zone géographique ne présente actuellement un décrochage majeur selon les seuils du moteur.',
      high.length?`${high.length} clients à risque élevé ont été automatiquement classés par valeur et zone.`:'Aucune liste critique de clients à risque élevé.',
      restock.length?`${restock.length} références ont une couverture calculée inférieure à 21 jours.`:'Aucune tension stock < 21 jours détectée parmi les références actives.'
    ];
    return {generatedAt:new Date(),executed,recommendations,brief,status:critical?'ALERTE':warnings?'SURVEILLANCE':'NORMAL',score:Math.max(0,100-critical*18-warnings*7)};
  }
  return {run};
})();
