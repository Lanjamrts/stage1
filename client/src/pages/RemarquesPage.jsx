import React, { useEffect, useState } from 'react';
import { api, formatDateTime } from '../api.js';
import { useToast } from '../components/Common/Toast/Toast.jsx';
import useMe from '../lib/useMe.js';

const STATE_BADGE = {
  nouvelle: { cls: 'bg-[#EBF3FC] border-[#B8D2EF] text-[#1F5FA8]', label: 'Nouvelle' },
  en_cours: { cls: 'bg-[#FEF6E7] border-[#F8D7A4] text-[#B7791F]', label: 'En cours' },
  traitee: { cls: 'bg-[#EBF7EE] border-[#B7E3C8] text-[#1E7B4F]', label: 'Traitée' },
};

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
    return (
      <div className="bg-white rounded-xl border border-[#E3E8EF] p-6 shadow-sm">
        <h1 className="text-[20px] font-semibold text-[#0B2A4A]">Remarques</h1>
        <p className="text-[#5B6778] mt-2">Contenu de cette page (à implémenter)</p>
      </div>
    );
  }

  const submit = async () => {
    if (!context.trim() || !text.trim()) {
      addToast('Le contexte et le message sont obligatoires.', 'error');
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
          Envoyez une remarque à l'équipe technique et suivez son état.
        </p>
      </div>

      {/* Envoi */}
      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm p-6">
        <h2 className="text-[16px] font-semibold text-[#0B2A4A] mb-4">Nouvelle remarque</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">
              Contexte <span className="text-[#B42318]">*</span>
            </label>
            <input
              type="text"
              className={inputCls}
              value={context}
              maxLength={200}
              placeholder="Ex. : Module RA — Octobre 2026"
              onChange={(e) => setContext(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">
              Message <span className="text-[#B42318]">*</span>
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
          <div className="flex justify-end">
            <button
              onClick={submit}
              disabled={busy}
              className="h-[40px] px-5 rounded-lg bg-[#1F5FA8] hover:bg-[#174C87] text-white text-sm font-semibold disabled:opacity-60"
            >
              {busy ? 'Envoi…' : 'Envoyer la remarque'}
            </button>
          </div>
        </div>
      </div>

      {/* Liste */}
      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E3E8EF]">
          <h2 className="text-[16px] font-semibold text-[#0B2A4A]">Mes remarques</h2>
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
                    <p className="text-sm font-semibold text-[#0B2A4A]">{r.context}</p>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-semibold ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-sm text-[#1A2433] mt-1 whitespace-pre-wrap">{r.text}</p>
                  <p className="text-xs text-[#5B6778] mt-1.5">
                    Envoyée le {formatDateTime(r.createdAt)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
