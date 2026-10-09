import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, formatDate, formatDateTime } from '../../api.js';
import StatusBadge from '../../components/Common/StatusBadge.jsx';
import DynamicForm from '../../components/Form/DynamicForm.jsx';
import { sourcesOf } from '../../lib/sources.js';

const periodLabel = (s) => {
  if (s.periodeLabel) return s.periodeLabel;
  if (s.eventDate) return `Événement du ${new Date(s.eventDate).toLocaleDateString('fr-FR')}`;
  return '—';
};

// Page rapport en lecture seule (SPEC §4, consultant) : contenu affiché avec
// le moteur de gabarits désactivé + historique des étapes. Aucun bouton
// d'action, aucun téléchargement.
export default function ConsultationRapport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [saisie, setSaisie] = useState(null);
  const [steps, setSteps] = useState([]);
  const [options, setOptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await api(`/saisies/${id}`);
        if (cancelled) return;
        setSaisie(data);
        const h = await api(`/saisies/${id}/historique`).catch(() => []);
        if (!cancelled) setSteps(h);

        const sources = sourcesOf((data.module && data.module.fields) || []);
        if (sources.length > 0) {
          const lists = await Promise.all(
            sources.map((s) => api(`/referentiels/${s}`).catch(() => ({ values: [] })))
          );
          if (cancelled) return;
          const map = {};
          sources.forEach((src, i) => {
            map[src] = lists[i].values;
          });
          setOptions(map);
        }
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <div className="text-[#5B6778]">Chargement...</div>;

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          {error}
        </div>
        <button
          onClick={() => navigate('/consultation-donnees')}
          className="h-[40px] px-4 rounded-lg border border-[#E3E8EF] text-sm font-medium hover:bg-[#F5F7FA]"
        >
          Retour à la consultation
        </button>
      </div>
    );
  }

  if (!saisie) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            onClick={() => navigate('/consultation-donnees')}
            className="text-sm font-semibold text-[#1F5FA8] hover:underline mb-2"
          >
            ← Retour à la consultation
          </button>
          <h1 className="text-[24px] font-semibold text-[#0B2A4A] flex items-center gap-3">
            {saisie.moduleCode} — {saisie.moduleLabel}
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-[#D7C4F0] bg-[#F3ECFB] text-xs font-semibold text-[#6B3FA0]">
              Lecture seule
            </span>
          </h1>
          <p className="text-sm text-[#5B6778] mt-1">
            {saisie.structureLabel || '—'} · {periodLabel(saisie)} · Soumise par{' '}
            {saisie.authorLabel || '—'} le {formatDateTime(saisie.dates && saisie.dates.submitted)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={saisie.status} />
        </div>
      </div>

      {/* Historique des étapes */}
      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm p-5">
        <h2 className="text-[15px] font-semibold text-[#0B2A4A] mb-3">Historique des étapes</h2>
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="font-semibold text-[#0B2A4A]">{s.decisionLabel}</span>
              <span className="text-[#5B6778]">
                {s.actor || '—'} · {formatDate(s.date)} {s.date ? formatDateTime(s.date).slice(-5) : ''}
              </span>
              {s.motif && (
                <span className="text-[#B42318] italic">— motif : {s.motif}</span>
              )}
            </li>
          ))}
        </ol>
      </div>

      {/* Contenu du rapport (moteur de gabarits, lecture seule) */}
      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm p-6">
        <h2 className="text-[15px] font-semibold text-[#0B2A4A] mb-4">Contenu du rapport</h2>
        <DynamicForm
          fields={(saisie.module && saisie.module.fields) || []}
          values={saisie.values || {}}
          errors={{}}
          onChange={() => {}}
          disabled
          options={options}
          autoCtx={{
            region: '',
            structure: saisie.structureLabel || '',
            author: saisie.authorLabel || '',
          }}
        />
      </div>
    </div>
  );
}
