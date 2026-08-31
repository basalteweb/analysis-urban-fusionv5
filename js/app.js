window.AU = window.AU || {};

AU.app = (() => {
  const state = {
    imports: { clients: null, ventes: [], catalogue: null },
    model: null,
    currentView: 'dashboard',
    analysisRunning: false,
    autoRunTimer: null,
    viewRenderSeq: 0
  };

  const $ = sel => document.querySelector(sel);
  const U = () => AU.util;

  function openImport() { $('#importModal').classList.remove('hidden'); }
  function closeImport() { $('#importModal').classList.add('hidden'); }

  function setProgress(type, pct) {
    const el = $(`#${type}Progress`);
    if (el) el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }

  function setImportStatus(type, status, text) {
    const el = $(`#${type}Status`);
    if (!el) return;
    el.className = `import-status ${status}`;
    el.textContent = text;
  }

  function describeImport(result) {
    if (!result) return 'En attente';
    if (!result.ok) return `❌ REFUSÉ\n${result.report.errors.join('\n')}`;
    const m = result.report.metrics || {};
    const warn = result.report.warnings.length ? `\n⚠ ${result.report.warnings.join(' · ')}` : '';
    if (result.type === 'clients') return `✅ VALIDÉ · ${U().integer(result.rowCount)} clients\nCodes uniques : ${U().integer(m.uniqueCodes)}${warn}`;
    if (result.type === 'ventes') return `✅ VALIDÉ · ${U().integer(result.rowCount)} lignes · ${U().integer(m.transactionCount)} transactions\n${U().formatDate(m.minDate)} → ${U().formatDate(m.maxDate)}${warn}`;
    if (result.type === 'catalogue') return `✅ VALIDÉ · ${U().integer(result.rowCount)} références\nStock 0 : ${m.zeroStock} · négatif : ${m.negativeStock}${warn}`;
    return `✅ VALIDÉ · ${U().integer(result.rowCount)} lignes${warn}`;
  }

  function updateRunButton() {
    const ready = state.imports.clients?.ok && state.imports.catalogue?.ok && state.imports.ventes.length && state.imports.ventes.every(v => v.ok);
    $('#runAnalysisBtn').disabled = !ready || state.analysisRunning;
    if (ready && !state.model && !state.analysisRunning) {
      const cross = $('#crossStatus');
      cross.className = 'cross-status good';
      cross.innerHTML = `<div class="cross-icon">↻</div><div><strong>Sources validées</strong><p>Analysis Power lance automatiquement le croisement, le diagnostic et les causes retenues.</p></div>`;
      if (!state.autoRunTimer) {
        state.autoRunTimer = setTimeout(() => {
          state.autoRunTimer = null;
          if (!state.model && !state.analysisRunning) runAnalysis();
        }, 650);
      }
    }
  }

  async function importOne(type, file) {
    setImportStatus(type, 'neutral', `Lecture de ${file.name}…`);
    setProgress(type, 2);
    try {
      const result = await AU.importer.parseFile(type, file, (pct, text) => {
        setProgress(type, pct);
        setImportStatus(type, 'neutral', text);
      });
      setProgress(type, 100);
      setImportStatus(type, result.ok ? (result.report.warnings.length ? 'warning' : 'success') : 'error', describeImport(result));
      return result;
    } catch (err) {
      setProgress(type, 0);
      setImportStatus(type, 'error', `❌ ÉCHEC\n${err.message || err}`);
      return { ok: false, type, fileName: file.name, report: { errors: [String(err.message || err)], warnings: [], metrics: {} } };
    }
  }

  async function handleClients(files) {
    const file = files?.[0]; if (!file) return;
    state.imports.clients = await importOne('clients', file);
    state.model = null; updateRunButton();
  }

  async function handleCatalogue(files) {
    const file = files?.[0]; if (!file) return;
    state.imports.catalogue = await importOne('catalogue', file);
    state.model = null; updateRunButton();
  }

  async function handleSales(files) {
    const list = [...(files || [])]; if (!list.length) return;
    state.imports.ventes = [];
    setProgress('ventes', 1);
    for (let i = 0; i < list.length; i++) {
      setImportStatus('ventes', 'neutral', `Fichier ${i + 1}/${list.length} · ${list[i].name}`);
      const result = await AU.importer.parseFile('ventes', list[i], (pct, text) => {
        const overall = ((i + pct / 100) / list.length) * 100;
        setProgress('ventes', overall);
        setImportStatus('ventes', 'neutral', `Fichier ${i + 1}/${list.length} · ${text}`);
      }).catch(err => ({ ok: false, type: 'ventes', fileName: list[i].name, report: { errors: [String(err.message || err)], warnings: [], metrics: {} } }));
      state.imports.ventes.push(result);
      if (!result.ok) break;
    }
    const ok = state.imports.ventes.length === list.length && state.imports.ventes.every(x => x.ok);
    if (ok) {
      const rows = U().sum(state.imports.ventes.map(x => x.rowCount));
      const tx = U().sum(state.imports.ventes.map(x => x.report.metrics.transactionCount || 0));
      const warnings = state.imports.ventes.flatMap(x => x.report.warnings || []);
      setImportStatus('ventes', warnings.length ? 'warning' : 'success', `✅ ${list.length} FICHIER(S) VALIDÉ(S) · ${U().integer(rows)} lignes lues\n${U().integer(tx)} transactions avant contrôle des chevauchements${warnings.length ? `\n⚠ ${warnings.join(' · ')}` : ''}`);
      setProgress('ventes', 100);
    } else {
      const failed = state.imports.ventes.find(x => !x.ok);
      setImportStatus('ventes', 'error', `❌ REFUSÉ · ${failed?.fileName || ''}\n${failed?.report?.errors?.join('\n') || 'Erreur inconnue'}`);
    }
    state.model = null; updateRunButton();
  }

  async function runAnalysis() {
    if (state.analysisRunning) return;
    state.analysisRunning = true;
    if (state.autoRunTimer) { clearTimeout(state.autoRunTimer); state.autoRunTimer = null; }
    const btn = $('#runAnalysisBtn');
    btn.disabled = true; btn.textContent = 'Croisement en cours…';
    const cross = $('#crossStatus');
    cross.className = 'cross-status';
    cross.innerHTML = `<div class="cross-icon">↻</div><div><strong>Contrôles croisés en cours</strong><p>Clients ↔ ventes ↔ catalogue, doublons, conflits et intégrité.</p></div>`;
    await new Promise(r => setTimeout(r, 60));
    try {
      const model = AU.analytics.buildModel({
        clientsImport: state.imports.clients,
        salesImports: state.imports.ventes,
        catalogueImport: state.imports.catalogue
      });
      if (!model.quality.analysisAllowed) {
        cross.className = 'cross-status bad';
        cross.innerHTML = `<div class="cross-icon">!</div><div><strong>ANALYSE BLOQUÉE</strong><p>${U().escapeHtml(model.quality.blocking.join(' '))}</p></div>`;
        state.model = null;
        AU.ui.toast('Croisement bloqué : conflit de données détecté.', 'bad');
        return;
      }
      try {
        model.publicContext = await AU.publicContext?.load?.();
        if (AU.power?.hydrateContext) await AU.power.hydrateContext(model);
        model.contextCorrelation = AU.publicContext?.correlate?.(model, model.publicContext) || null;
        model.intelligence = AU.intelligence?.analyze ? AU.intelligence.analyze(model) : model.intelligence;
        model.causalContext = AU.causalContext?.apply ? AU.causalContext.apply(model) : null;
      } catch (e) { console.warn('Contexte public indisponible', e); }
      try { model.analysisHistory = await AU.storage.listAnalysisSnapshots(); } catch (e) { model.analysisHistory = []; }
      model.autopilot = AU.autopilot?.run ? AU.autopilot.run(model) : model.autopilot;
      state.model = model;
      cross.className = 'cross-status good';
      const q = model.quality;
      cross.innerHTML = `<div class="cross-icon">✓</div><div><strong>CROISEMENT RÉUSSI</strong><p>${U().integer(model.transactions.length)} transactions · clients certifiés ${U().percent(q.clientCertifiedCoverage)} · catalogue ${U().percent(q.catalogueCoverage)} · ${q.duplicateTransactionsIgnored} chevauchement(s) exact(s) ignoré(s).</p></div>`;
      try {
        await AU.storage.saveSession({ imports: state.imports });
        await AU.storage.saveStockSnapshot(state.imports.catalogue);
        await AU.storage.saveAnalysisSnapshot(model);
        model.analysisHistory = await AU.storage.listAnalysisSnapshots();
      } catch (storageErr) {
        console.warn('Persistence locale indisponible', storageErr);
        AU.ui.toast('Analyse réussie, mais la sauvegarde locale du navigateur a échoué.', 'bad');
      }
      showModel();
      closeImport();
      AU.ui.toast(`Analyse Power terminée. ${model.intelligence?.findings?.length || 0} diagnostics générés.`, 'good');
    } catch (err) {
      console.error(err);
      cross.className = 'cross-status bad';
      cross.innerHTML = `<div class="cross-icon">!</div><div><strong>ÉCHEC DU CROISEMENT</strong><p>${U().escapeHtml(err.message || err)}</p></div>`;
      AU.ui.toast('Le croisement a été refusé.', 'bad');
    } finally {
      state.analysisRunning = false;
      btn.textContent = 'Relancer l’analyse';
      updateRunButton();
    }
  }

  async function refreshContextFromStore() {
    if (!state.model) return false;
    try {
      if (AU.power?.hydrateContext) await AU.power.hydrateContext(state.model);
      state.model.contextCorrelation = AU.publicContext?.correlate?.(state.model, state.model.publicContext) || null;
      state.model.intelligence = AU.intelligence?.analyze ? AU.intelligence.analyze(state.model) : state.model.intelligence;
      state.model.causalContext = AU.causalContext?.apply ? AU.causalContext.apply(state.model) : null;
      state.model.autopilot = AU.autopilot?.run ? AU.autopilot.run(state.model) : state.model.autopilot;
      showModel();
      return true;
    } catch (err) {
      console.error('Actualisation du contexte commerce impossible', err);
      return false;
    }
  }

  function showModel() {
    if (!state.model) return;
    $('#emptyState').classList.add('hidden');
    $('#viewRoot').classList.remove('hidden');
    $('#dataRangeBadge').className = 'pill good';
    $('#dataRangeBadge').textContent = `${U().formatDate(state.model.range.min)} → ${U().formatDate(state.model.range.max)}`;
    switchView(state.currentView);
  }

  function switchView(view) {
    const root=$('#viewRoot');
    state.currentView = view || 'dashboard';
    const seq=++state.viewRenderSeq;
    document.querySelectorAll('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.view === state.currentView));
    if (!state.model || !root) return;
    root.dataset.viewState='loading';
    if(state.currentView==='geo') root.innerHTML='<section class="panel"><div class="empty-mini">Geo Intelligence prépare le radar des zones et le contexte urbain…</div></section>';
    requestAnimationFrame(()=>{
      if(seq!==state.viewRenderSeq||!state.model||!root.isConnected)return;
      try{AU.ui.render(state.currentView,state.model,root);}
      catch(err){console.error('switchView protected render error',err);AU.ui.toast('Une erreur d’affichage a été interceptée. Les calculs restent disponibles.','bad');}
    });
  }

  async function restoreSession() {
    try {
      const saved = await AU.storage.loadSession();
      if (!saved?.imports?.clients?.ok || !saved?.imports?.catalogue?.ok || !saved?.imports?.ventes?.length) return;
      state.imports = saved.imports;
      const model = AU.analytics.buildModel({ clientsImport: state.imports.clients, salesImports: state.imports.ventes, catalogueImport: state.imports.catalogue });
      if (!model.quality.analysisAllowed) return;
      try {
        model.publicContext = await AU.publicContext?.load?.();
        if (AU.power?.hydrateContext) await AU.power.hydrateContext(model);
        model.contextCorrelation = AU.publicContext?.correlate?.(model, model.publicContext) || null;
        model.intelligence = AU.intelligence?.analyze ? AU.intelligence.analyze(model) : model.intelligence;
        model.causalContext = AU.causalContext?.apply ? AU.causalContext.apply(model) : null;
      } catch (e) { console.warn('Contexte public indisponible', e); }
      try { model.analysisHistory = await AU.storage.listAnalysisSnapshots(); } catch (e) { model.analysisHistory = []; }
      model.autopilot = AU.autopilot?.run ? AU.autopilot.run(model) : model.autopilot;
      state.model = model;
      setProgress('clients', 100); setProgress('ventes', 100); setProgress('catalogue', 100);
      setImportStatus('clients', 'success', describeImport(state.imports.clients));
      setImportStatus('catalogue', 'success', describeImport(state.imports.catalogue));
      setImportStatus('ventes', 'success', `✅ SESSION RESTAURÉE · ${state.imports.ventes.length} fichier(s) Ventes`);
      updateRunButton(); showModel();
      AU.ui.toast('Dernière session restaurée depuis ce navigateur.', 'good');
    } catch (err) {
      console.warn('Impossible de restaurer la session', err);
    }
  }

  async function clearLocalData() {
    if (!confirm('Effacer la session Analysis Power et les snapshots de stock enregistrés dans ce navigateur ?')) return;
    try { await AU.storage.clearAll(); } catch (e) { console.warn(e); }
    state.imports = { clients: null, ventes: [], catalogue: null };
    state.model = null;
    location.reload();
  }

  function bind() {
    $('#versionLabel').textContent = `v${AU.APP.version}`;
    $('#openImportBtn').addEventListener('click', openImport);
    $('#emptyImportBtn').addEventListener('click', openImport);
    document.querySelectorAll('[data-close-modal]').forEach(x => x.addEventListener('click', closeImport));
    document.querySelectorAll('[data-close-detail]').forEach(x => x.addEventListener('click', AU.ui.closeDetail));
    $('#clientsFile').addEventListener('change', e => handleClients(e.target.files));
    $('#ventesFile').addEventListener('change', e => handleSales(e.target.files));
    $('#catalogueFile').addEventListener('change', e => handleCatalogue(e.target.files));
    $('#runAnalysisBtn').addEventListener('click', runAnalysis);
    $('#clearDataBtn').addEventListener('click', clearLocalData);
    document.querySelectorAll('.nav-item').forEach(x => x.addEventListener('click', () => switchView(x.dataset.view)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeImport(); AU.ui.closeDetail(); } });
  }

  async function init() {
    bind();
    if (!AU.xlsxLite || !AU.csv) {
      $('#fatal').classList.remove('hidden');
      $('#fatal').innerHTML = `<strong>Moteur d’import local indisponible.</strong><br>Rechargez la page : les parseurs CSV/XLSX sont inclus directement dans Analysis Power.`;
    }
    await restoreSession();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  }

  return { init, openImport, runAnalysis, switchView, refreshContextFromStore, state };
})();

document.addEventListener('DOMContentLoaded', AU.app.init);
