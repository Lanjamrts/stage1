import React, { useEffect, useMemo, useState } from 'react';
import { api, formatDateTime } from '../api.js';
import { useToast } from '../components/Common/Toast/Toast.jsx';
import useMe from '../lib/useMe.js';
import { ROLE_MENUS, ROLE_LABELS } from '../menus.js';
import Button from '../components/Common/Button.jsx';

const STATE_BADGE = {
  nouvelle: { cls: 'bg-[#EBF3FC] border-[#B8D2EF] text-[#1F5FA8]', label: 'Nouvelle' },
  en_cours: { cls: 'bg-[#FEF6E7] border-[#F8D7A4] text-[#B7791F]', label: 'En cours' },
  traitee: { cls: 'bg-[#EBF7EE] border-[#B7E3C8] text-[#1E7B4F]', label: 'Traitée' },
};

const STATE_OPTIONS = [
  ['nouvelle', 'Nouvelle'],
  ['en_cours', 'En cours'],
  ['traitee', 'Traitée'],
];

const shortDate = (d) =>
  d
    ? `${new Date(d).toLocaleDateString('fr-FR')} à ${new Date(d)
        .toTimeString()
        .slice(0, 5)}`
    : '—';

// Boîte de réception des remarques (SPEC §4, developpeur) : toutes les
// remarques reçues avec état Nouvelle / En cours / Traitée, modifiable.
function RemarquesInbox() {
  const { addToast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [stateTab, setStateTab] = useState('');
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const load = async () => {
    try {
      const data = await api('/remarques');
      setItems(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const changeEtat = async (id, etat) => {
    setBusyId(id);
    try {
      await api(`/remarques/${id}/etat`, { method: 'PATCH', body: { etat } });
      addToast('État mis à jour.', 'success');
      await load();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const counts = useMemo(
    () => ({
      all: items.length,
      nouvelle: items.filter((r) => r.state === 'nouvelle').length,
      en_cours: items.filter((r) => r.state === 'en_cours').length,
      traitee: items.filter((r) => r.state === 'traitee').length,
    }),
    [items]
  );

  const needle = q.trim().toLowerCase();
  const visible = items.filter(
    (r) =>
      (!stateTab || r.state === stateTab) &&
      (!roleFilter || r.authorRole === roleFilter) &&
      (!needle ||
        [r.context, r.text, r.author]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle)))
  );

  const TABS = [
    { key: '', label: 'Toutes' },
    { key: 'nouvelle', label: 'Nouvelles' },
    { key: 'en_cours', label: 'En cours' },
    { key: 'traitee', label: 'Traitées' },
  ];

  const hasFilters = !!(stateTab || roleFilter || needle);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold text-[#0B2A4A] flex items-center gap-3">
          Remarques reçues
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-[#D7C4F0] bg-[#F3ECFB] text-xs font-semibold text-[#6B3FA0]">
            Cellule Informatique
          </span>
        </h1>
        <p className="text-sm text-[#5B6778] mt-1">
          Remarques transmises par les administrateurs. Consultez-les et indiquez où en est leur
          traitement.
        </p>
      </div>

      {/* Onglets d'état avec compteurs */}
      <div className="flex flex-wrap gap-2 border-b border-[#E3E8EF]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStateTab(t.key)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${
              stateTab === t.key
                ? 'border-[#1F5FA8] text-[#1F5FA8]'
                : 'border-transparent text-[#5B6778] hover:text-[#0B2A4A]'
            }`}
          >
            {t.label}
            <span
              className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[12px] font-semibold ${
                stateTab === t.key ? 'bg-[#EBF3FC] text-[#1F5FA8]' : 'bg-[#F5F7FA] text-[#5B6778]'
              }`}
            >
              {t.key ? counts[t.key] : counts.all}
            </span>
          </button>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[240px]"
          placeholder="Rechercher (auteur, page, texte...)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[170px]"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">Tous les profils</option>
          <option value="admin1">Admin 1</option>
          <option value="admin2">Admin 2</option>
        </select>
        <Button
          type="button"
          variant="secondary"
          className="gap-2"
          onClick={() => {
            setStateTab('');
            setQ('');
            setRoleFilter('');
          }}
        >
          <span aria-hidden="true">↺</span> Réinitialiser les filtres
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
        {error && (
          <div className="px-5 py-3 text-sm text-[#B42318] bg-[#FEF3F2]">{error}</div>
        )}
        {loading ? (
          <p className="px-5 py-6 text-sm text-[#5B6778]">Chargement...</p>
        ) : visible.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-[#5B6778]">Aucune remarque pour ces filtres.</p>
            <p className="text-xs text-[#8A94A6] mt-1">
              Modifiez ou réinitialisez les filtres pour afficher d'autres remarques.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#E3E8EF]">
            {visible.map((r) => {
              const badge = STATE_BADGE[r.state] || STATE_BADGE.nouvelle;
              return (
                <li key={r.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-[#5B6778]">
                        {shortDate(r.createdAt)} · {r.author || '—'}{' '}
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-[#E3E8EF] bg-[#F5F7FA] text-[11px] font-semibold text-[#5B6778] ml-1">
                          {r.authorRole ? ROLE_LABELS[r.authorRole] || r.authorRole : '—'}
                        </span>
                      </p>
                      <p className="text-sm font-semibold text-[#0B2A4A] mt-1">{r.context}</p>
                      <p className="text-sm text-[#1A2433] mt-1 whitespace-pre-wrap">{r.text}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-semibold ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                      <select
                        className="h-[34px] px-2 rounded-lg border border-[#D6DCE5] bg-white text-xs font-medium"
                        value={r.state}
                        disabled={busyId === r.id}
                        onChange={(e) => changeEtat(r.id, e.target.value)}
                        aria-label="État du traitement"
                      >
                        {STATE_OPTIONS.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!loading && visible.length > 0 && (
          <div className="px-5 py-3 border-t border-[#E3E8EF] text-xs text-[#5B6778]">
            {hasFilters ? 'Filtres actifs · ' : ''}
            Affichage de 1 à {visible.length} sur {items.length} entrées
          </div>
        )}
      </div>
    </div>
  );
}

// « Remarques » admin1 / admin2 : envoyer une remarque à l'équipe technique
// + liste de ses propres remarques avec leur état (SPEC §4).
// Le developpeur a sa boîte de réception (Phase 6).
export default function RemarquesPage() {
  const { me, loading: meLoading } = useMe();
  const { addToast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const data = await api('/remarques/mes');
      setItems(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (me && (me.role === 'admin1' || me.role === 'admin2')) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  if (meLoading) return <div className="text-[#5B6778]">Chargement...</div>;

  if (me && me.role === 'developpeur') {
    return <RemarquesInbox />;
  }

  // Pages de « Page concernée » = libellés du menu du rôle connecté (zip).
  const pageOptions = (ROLE_MENUS[me && me.role] || []).map((m) => m.label);

  const submit = async () => {
    if (!context.trim() || !text.trim()) {
      addToast('Ce champ est obligatoire.', 'error');
      return;
    }
    setBusy(true);
    try {
      await api('/remarques', {
        method: 'POST',
        body: { context: context.trim(), text: text.trim() },
      });
      addToast('Remarque envoyée à l\'équipe technique.', 'success');
      setContext('');
      setText('');
      await load();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'w-full h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-[15px] focus:outline-none focus:ring-2 focus:ring-[#1F5FA8]/30';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold text-[#0B2A4A]">Remarques</h1>
        <p className="text-sm text-[#5B6778] mt-1">
          Signalez un problème ou une difficulté à l'équipe technique de l'application.
        </p>
      </div>

      {/* Envoi */}
      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <span aria-hidden="true">✏️</span>
          <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Nouvelle remarque</h2>
          <span className="ml-auto text-xs text-[#5B6778]">
            {me ? `${me.structureLabel || ''} · ${ROLE_LABELS[me.role] || ''}` : ''}
          </span>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">
              Page concernée <span className="text-[#B42318]">*</span>
            </label>
            <select
              className={inputCls}
              value={context}
              onChange={(e) => setContext(e.target.value)}
            >
              <option value="">-- Sélectionner --</option>
              {pageOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <p className="text-xs text-[#8A94A6] mt-1">
              Indiquez la page où se situe le problème.
            </p>
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">
              Votre remarque <span className="text-[#B42318]">*</span>
            </label>
            <textarea
              className="w-full min-h-[100px] px-3 py-2 rounded-lg border border-[#D6DCE5] bg-white text-[15px] focus:outline-none focus:ring-2 focus:ring-[#1F5FA8]/30"
              value={text}
              maxLength={2000}
              placeholder="Décrivez votre remarque…"
              onChange={(e) => setText(e.target.value)}
            />
            <p className="text-xs text-[#5B6778] mt-1 text-right">{text.length} / 2000</p>
          </div>
          <div className="rounded-lg border border-[#B8D2EF] bg-[#EBF3FC] px-4 py-3 text-xs text-[#1F5FA8]">
            Transmis directement à la cellule informatique DGBF.
          </div>
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={submit}
              disabled={busy}
            >
              {busy ? 'Envoi…' : 'Envoyer la remarque'}
            </Button>
          </div>
        </div>
      </div>

      {/* Liste */}
      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E3E8EF] flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Mes remarques envoyées</h2>
          <span className="text-sm text-[#5B6778]">
            <span className="font-semibold text-[#0B2A4A]">{items.length}</span>{' '}
            {items.length > 1 ? 'enregistrements' : 'enregistrement'}
          </span>
        </div>
        {error && (
          <div className="px-5 py-3 text-sm text-[#B42318] bg-[#FEF3F2]">{error}</div>
        )}
        {loading ? (
          <p className="px-5 py-6 text-sm text-[#5B6778]">Chargement...</p>
        ) : items.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[#5B6778]">
            Aucune remarque envoyée pour le moment.
          </p>
        ) : (
          <ul className="divide-y divide-[#E3E8EF]">
            {items.map((r) => {
              const badge = STATE_BADGE[r.state] || STATE_BADGE.nouvelle;
              return (
                <li key={r.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-[#5B6778]">{shortDate(r.createdAt)}</p>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-semibold ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-[#0B2A4A] mt-1">{r.context}</p>
                  <p className="text-sm text-[#1A2433] mt-1 whitespace-pre-wrap">{r.text}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
