import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../components/Common/Toast/Toast.jsx';
import Button from '../../components/Common/Button.jsx';

const PERIODICITY_LABELS = { monthly: 'Mensuelle', quarterly: 'Trimestrielle' };
const KIND_LABELS = { periodic: 'Périodique', event: 'Événement' };

// Libellés de déclencheur par module (zip a_liste_des_modules).
const TRIGGER_BY_CODE = {
  RA: 'Mensuelle ou trimestrielle',
  CRGP: 'Par réunion',
  ASS: 'Par intervention',
  FOR: 'Par session',
  NOS: 'À chaque changement',
  NPR: 'À chaque changement',
  NCA: 'À chaque changement',
  RAV: 'À chaque création',
  TSE: 'À chaque demande',
};

const periodLabel = (m) =>
  TRIGGER_BY_CODE[m.code] || PERIODICITY_LABELS[m.periodicity] || m.periodicity;

// Listes de référence affichées (SPEC §4) : Régions, Structures, Directions,
// Services, Grades, Périodes, EPN, STD. Seules Directions/Services/Grades/EPN/STD
// sont modifiables (POST|PUT|PATCH /referentiels — Régions, Structures et
// Périodes n'ont pas d'API d'écriture).
const REF_LISTS = [
  { key: 'regions', label: 'Régions', editable: false },
  { key: 'structures', label: 'Structures', editable: false, full: true },
  { key: 'directions', label: 'Directions', editable: true },
  { key: 'services', label: 'Services', editable: true },
  { key: 'grades', label: 'Grades', editable: true },
  { key: 'periodes', label: 'Périodes', editable: false },
  { key: 'epn', label: 'EPN', editable: true },
  { key: 'std', label: 'STD', editable: true },
];

const inputCls =
  'w-full h-[36px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1F5FA8]/30';

// Une carte de liste de référence : valeurs + (si modifiable) ajout et rename.
function ReferenceCard({ list, onChanged }) {
  const { addToast } = useToast();
  const [values, setValues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newValue, setNewValue] = useState('');
  const [editing, setEditing] = useState(null); // {index, value}
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      if (list.key === 'periodes') {
        const p = await api('/periodes');
        setValues(p.map((x) => x.label));
      } else if (list.full) {
        const d = await api(`/referentiels/${list.key}?full=1`);
        setValues((d.items || []).map((i) => i.label));
      } else {
        const d = await api(`/referentiels/${list.key}`);
        setValues(d.values || []);
      }
    } catch {
      setValues([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.key]);

  const add = async () => {
    const v = newValue.trim();
    if (!v) return;
    setBusy(true);
    try {
      await api(`/referentiels/${list.key}`, { method: 'POST', body: { value: v } });
      addToast(`« ${v} » ajouté(e).`, 'success');
      setNewValue('');
      await load();
      onChanged();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const rename = async () => {
    const v = (editing.value || '').trim();
    if (!v) return;
    setBusy(true);
    try {
      await api(`/referentiels/${list.key}`, {
        method: 'PUT',
        body: { value: values[editing.index], newValue: v },
      });
      addToast('Valeur renommée.', 'success');
      setEditing(null);
      await load();
      onChanged();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-semibold text-[#0B2A4A]">{list.label}</h3>
        <span className="text-xs text-[#5B6778]">{values.length} valeur{values.length > 1 ? 's' : ''}</span>
      </div>

      {loading && <p className="text-sm text-[#5B6778]">Chargement...</p>}

      {!loading && values.length === 0 && (
        <p className="text-sm text-[#5B6778] mb-3">Liste vide.</p>
      )}

      <ul className="space-y-1.5 max-h-[220px] overflow-y-auto mb-3">
        {!loading &&
          values.map((v, i) => (
            <li key={`${v}-${i}`} className="flex items-center justify-between gap-2 text-sm">
              {editing && editing.index === i ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    className={inputCls}
                    value={editing.value}
                    onChange={(e) => setEditing({ index: i, value: e.target.value })}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={rename}
                    disabled={busy}
                  >
                    OK
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditing(null)}
                  >
                    Annuler
                  </Button>
                </div>
              ) : (
                <>
                  <span className="text-[#1A2433] truncate">{v}</span>
                  {list.editable && (
                    <button
                      onClick={() => setEditing({ index: i, value: v })}
                      className="text-xs font-semibold text-[#1F5FA8] hover:underline shrink-0"
                    >
                      Renommer
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
      </ul>

      {list.editable && (
        <div className="flex items-center gap-2 pt-3 border-t border-[#E3E8EF]">
          <input
            type="text"
            className={inputCls}
            placeholder="Nouvelle valeur"
            value={newValue}
            maxLength={200}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
          />
          <Button
            variant="primary"
            className="shrink-0"
            onClick={add}
            disabled={busy || !newValue.trim()}
          >
            Ajouter
          </Button>
        </div>
      )}
      {!list.editable && (
        <p className="text-xs text-[#5B6778] pt-3 border-t border-[#E3E8EF]">
          Liste en lecture seule.
        </p>
      )}
    </div>
  );
}

// « Paramétrage » (SPEC §4, developpeur) : liste des gabarits + éditeur,
// et listes de référence. Aucun accès aux rapports ni aux utilisateurs.
export default function Parametrage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [tab, setTab] = useState('gabarits');
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api('/modules');
      setModules(data);
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

  const toggleActive = async (m) => {
    try {
      await api(`/config/modules/${m.id}/active`, {
        method: 'PATCH',
        body: { active: !m.active },
      });
      addToast(
        m.active ? `Gabarit ${m.code} désactivé.` : `Gabarit ${m.code} activé.`,
        'success'
      );
      await load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold text-[#0B2A4A]">Paramétrage</h1>
        <p className="text-sm text-[#5B6778] mt-1">
          Définissez les canevas, les listes de référence et les règles de contrôle.
        </p>
      </div>

      {/* Onglets */}
      <div className="flex flex-wrap gap-2 border-b border-[#E3E8EF]">
        {[
          { key: 'gabarits', label: 'Canevas des modules', count: modules.length },
          { key: 'listes', label: 'Listes de référence' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${
              tab === t.key
                ? 'border-[#1F5FA8] text-[#1F5FA8]'
                : 'border-transparent text-[#5B6778] hover:text-[#0B2A4A]'
            }`}
          >
            {t.label}
            {t.count != null && (
              <span
                className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[12px] font-semibold ${
                  tab === t.key ? 'bg-[#EBF3FC] text-[#1F5FA8]' : 'bg-[#F5F7FA] text-[#5B6778]'
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          {error}
        </div>
      )}

      {tab === 'gabarits' && (
        <>
        <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F5F7FA] text-left">
                  <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Code</th>
                  <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Module</th>
                  <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Périodicité</th>
                  <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Champs</th>
                  <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Version</th>
                  <th className="px-5 py-3 font-semibold text-[#0B2A4A]">État</th>
                  <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-[#5B6778]">
                      Chargement...
                    </td>
                  </tr>
                )}
                {!loading &&
                  modules.map((m) => (
                    <tr key={m.id} className="border-t border-[#E3E8EF]">
                      <td className="px-5 py-3 font-semibold text-[#0B2A4A]">{m.code}</td>
                      <td className="px-5 py-3 text-[#1A2433]">{m.label}</td>
                      <td className="px-5 py-3 text-[#5B6778]">{periodLabel(m)}</td>
                      <td className="px-5 py-3 text-[#1A2433]">
                        {(m.fields || []).length}
                      </td>
                      <td className="px-5 py-3 text-[#1A2433]">Version {m.version}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-semibold ${
                            m.active
                              ? 'bg-[#EBF7EE] border-[#B7E3C8] text-[#1E7B4F]'
                              : 'bg-[#F5F7FA] border-[#E3E8EF] text-[#5B6778]'
                          }`}
                        >
                          {m.active ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => navigate(`/parametrage/${m.id}`)}
                          >
                            Configurer
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => toggleActive(m)}
                          >
                            {m.active ? 'Désactiver' : 'Activer'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-[#E3E8EF] text-xs text-[#5B6778]">
            Affichage de 1 à {modules.length} sur {modules.length} modules enregistrés
          </div>
        </div>
        <div className="rounded-lg border border-[#B8D2EF] bg-[#EBF3FC] px-4 py-3 text-sm text-[#1F5FA8]">
          Une modification de canevas crée une nouvelle version. Les saisies déjà enregistrées
          gardent la version avec laquelle elles ont été créées.
        </div>
        </>
      )}

      {tab === 'listes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {REF_LISTS.map((list) => (
            <ReferenceCard key={list.key} list={list} onChanged={() => {}} />
          ))}
        </div>
      )}
    </div>
  );
}
