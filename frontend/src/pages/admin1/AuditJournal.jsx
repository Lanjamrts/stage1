import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import Button from '../../components/Common/Button.jsx';
import { PERIOD_SHORTCUTS, TZ_LABEL, ACTION_LIBELLE, ANOMALY_ACTIONS } from '../../components/Audit/helpers.js';
import { Toolbar } from '../../components/Audit/Toolbar.jsx';
import { AuditTable } from '../../components/Audit/Table.jsx';
import { Pagination } from '../../components/Audit/Pagination.jsx';
import { DetailPanel } from '../../components/Audit/DetailPanel.jsx';

const LIMITS = [25, 50, 100];
const DEFAULT_LIMIT = 50;

const EMPTY_PARAMS = {
  page: '1',
  limit: String(DEFAULT_LIMIT),
  q: '',
  action: '',
  role: '',
  from: '',
  to: '',
  since: '',
  resultat: '',
};

export default function AuditJournal() {
  const [urlParams, setUrlParams] = useSearchParams();
  const [qLocal, setQLocal] = useState(urlParams.get('q') || '');
  const [debouncedQ, setDebouncedQ] = useState(qLocal);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const rowRefs = useRef({});
  const isInitial = useRef(true);

  const read = (key) => urlParams.get(key) || EMPTY_PARAMS[key];

  // Anti-rebond 400 ms sur la recherche : seule la valeur debouncée est envoyée au serveur.
  // Après l'anti-rebond, q est écrit dans l'URL et la page revient à 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(qLocal);
      if (!isInitial.current) {
        const urlQ = urlParams.get('q') || '';
        if (qLocal !== urlQ) {
          navigateTo({ q: qLocal }, true);
        }
      }
      isInitial.current = false;
    }, 400);
    return () => clearTimeout(timer);
  }, [qLocal, urlParams, navigateTo]);

  // Synchronise le champ local avec l'URL (navigation retour/avant).
  useEffect(() => {
    setQLocal(urlParams.get('q') || '');
  }, [urlParams.get('q')]);

  const buildParams = useCallback(
    (updates) => {
      const next = new URLSearchParams(urlParams);
      Object.entries(updates).forEach(([k, v]) => {
        if (v === '' || v === null || v === undefined) next.delete(k);
        else next.set(k, String(v));
      });
      return next;
    },
    [urlParams]
  );

  const navigateTo = useCallback(
    (updates, resetPage = false) => {
      const next = buildParams(updates);
      if (resetPage) {
        next.delete('page');
        next.set('page', '1');
      }
      setUrlParams(next, { replace: true });
    },
    [buildParams, setUrlParams]
  );

  const page = Number(read('page')) || 1;
  const limit = LIMITS.includes(Number(read('limit'))) ? Number(read('limit')) : DEFAULT_LIMIT;
  const q = debouncedQ;
  const actionParam = read('action');
  const roleParam = read('role');
  const fromParam = read('from');
  const toParam = read('to');
  const sinceParam = read('since');
  const resultatParam = read('resultat');

  const hasFilters =
    !!actionParam || !!roleParam || !!fromParam || !!toParam || !!sinceParam || !!resultatParam;

  const periodLabel = PERIOD_SHORTCUTS.find((p) => p.sinceMinutes != null && String(p.sinceMinutes) === sinceParam)
    ?.label;

  const anomalyValue = [...ANOMALY_ACTIONS].join(',');
  let effectiveAction = actionParam;
  let anomalyNoMatch = false;
  if (resultatParam === 'anomalies') {
    if (actionParam === '') {
      effectiveAction = anomalyValue;
    } else if (!ANOMALY_ACTIONS.has(actionParam)) {
      effectiveAction = '';
      anomalyNoMatch = true;
    }
  }

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Aucun résultat si Résultat = Anomalies et l'action choisie n'est pas une anomalie.
    if (anomalyNoMatch) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    // Paramètres API explicites : page, limit, q, action, role, from, to, sinceMinutes.
    // Jamais 'since' ni 'resultat' (paramètres d'interface uniquement).
    const apiParams = new URLSearchParams();
    apiParams.set('page', String(page));
    apiParams.set('limit', String(limit));
    if (q) apiParams.set('q', q);
    if (effectiveAction) apiParams.set('action', effectiveAction);
    if (roleParam) apiParams.set('role', roleParam);
    if (fromParam) apiParams.set('from', fromParam);
    if (toParam) apiParams.set('to', toParam);
    const sinceMinutes = sinceParam ? Number(sinceParam) : null;
    if (sinceMinutes) apiParams.set('sinceMinutes', String(sinceMinutes));
    try {
      const res = await fetch(`/api/audit?${apiParams.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Une erreur est survenue.');
      }
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
      setTotal(parseInt(res.headers.get('x-total-count') || '0', 10));
      setError(null);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setError(err.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, q, effectiveAction, anomalyNoMatch, roleParam, fromParam, toParam, sinceParam]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const setFilter = (key, value) => {
    navigateTo({ [key]: value }, true);
  };

  const onPeriodChange = (label) => {
    const p = PERIOD_SHORTCUTS.find((x) => x.label === label);
    navigateTo({
      since: p && p.sinceMinutes !== null ? String(p.sinceMinutes) : '',
      from: '',
      to: '',
    }, true);
  };

  const onFromChange = (v) => navigateTo({ from: v, since: '' }, true);
  const onToChange = (v) => navigateTo({ to: v, since: '' }, true);

  const onQChange = (e) => {
    setQLocal(e.target.value);
  };

  const onActionChange = (v) => setFilter('action', v);
  const onRoleChange = (v) => setFilter('role', v);
  const onResultatChange = (v) => setFilter('resultat', v);

  const onReset = () => {
    const next = new URLSearchParams();
    next.set('page', '1');
    next.set('limit', String(DEFAULT_LIMIT));
    setUrlParams(next, { replace: true });
    setQLocal('');
    setDebouncedQ('');
  };

  const onChangePage = (nextPage) => navigateTo({ page: String(Math.max(1, nextPage)) }, false);
  const onChangeLimit = (nextLimit) => {
    navigateTo({ limit: String(nextLimit), page: '1' }, false);
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const visiblePage = Math.min(page, totalPages);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold text-[#0B2A4A] flex items-center gap-3">
          Journal d'audit
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[#E3E8EF] bg-[#F5F7FA] text-xs font-semibold text-[#5B6778]">
            <span aria-hidden="true">🔒</span> Lecture seule
          </span>
        </h1>
        <p className="text-sm text-[#5B6778] mt-1">
          Historique automatique des connexions et des actions sensibles.           Les lignes ne peuvent être
          ni modifiées ni supprimées.
        </p>
        <p className="text-sm text-[#5B6778] mt-2">
          {TZ_LABEL}. Données conservées 12 mois minimum.
        </p>
      </div>

      <div className="rounded-lg border border-[#B8D2EF] bg-[#EBF3FC] px-4 py-3 text-sm text-[#1F5FA8]">
        Les données du journal sont conservées pendant 12 mois minimum.
      </div>

      <Toolbar
        period={periodLabel || ''}
        sinceMinutes={sinceParam ? Number(sinceParam) : null}
        from={fromParam}
        to={toParam}
        q={qLocal}
        action={actionParam}
        role={roleParam}
        resultat={resultatParam}
        onPeriodChange={onPeriodChange}
        onFromChange={onFromChange}
        onToChange={onToChange}
        onQChange={onQChange}
        onActionChange={onActionChange}
        onRoleChange={onRoleChange}
        onResultatChange={onResultatChange}
        onReset={onReset}
        hasFilters={hasFilters}
      />

      {error && (
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          {error}
        </div>
      )}

      {anomalyNoMatch && (
        <div className="rounded-lg border border-[#F3D9A4] bg-[#FFF7E8] px-4 py-3 text-sm text-[#B7791F]">
          Aucune anomalie pour l'action choisie (« {ACTION_LIBELLE(actionParam)} » n'est pas une anomalie).
        </div>
      )}

      <Pagination
        page={visiblePage}
        limit={limit}
        total={total}
        onChangePage={onChangePage}
        onChangeLimit={onChangeLimit}
        className="mt-2"
      />

      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
        <AuditTable
          rows={rows}
          loading={loading}
          onSelect={(row) => setSelectedRow(row)}
          selectedId={selectedRow?.id}
          rowRefs={rowRefs}
        />
      </div>

      <Pagination
        page={visiblePage}
        limit={limit}
        total={total}
        onChangePage={onChangePage}
        onChangeLimit={onChangeLimit}
      />

      {selectedRow && (
        <DetailPanel isOpen row={selectedRow} onClose={() => setSelectedRow(null)} />
      )}
    </div>
  );
}
