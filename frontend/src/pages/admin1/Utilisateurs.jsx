import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Common/Toast/Toast.jsx';
import Drawer from '../../components/Common/Drawer.jsx';
import ConfirmModal from '../../components/Common/Modal/ConfirmModal.jsx';
import { ROLE_LABELS } from '../../menus.js';

const ROLES = ['client', 'admin2', 'admin1', 'developpeur', 'consultant'];
const REQUIRED = 'Ce champ est obligatoire.';

const emptyForm = {
  im: '',
  nom: '',
  prenom: '',
  direction: '',
  service: '',
  role: 'client',
  structureId: '',
};

const inputCls =
  'w-full h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-[15px] focus:outline-none focus:ring-2 focus:ring-[#1F5FA8]/30';

const roleBadge = {
  client: 'bg-[#EBF3FC] border-[#B8D2EF] text-[#1F5FA8]',
  admin2: 'bg-[#EBF7EE] border-[#B7E3C8] text-[#1E7B4F]',
  admin1: 'bg-[#F3ECFB] border-[#D7C4F0] text-[#6B3FA0]',
  developpeur: 'bg-[#FEF6E7] border-[#F8D7A4] text-[#B7791F]',
  consultant: 'bg-[#F5F7FA] border-[#E3E8EF] text-[#5B6778]',
};

// « Utilisateurs » (SPEC §4) : tableau, tiroir d'ajout, modifier profil,
// désactiver, réinitialiser mot de passe (provisoire affiché une fois).
export default function Utilisateurs() {
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ role: '', status: '', q: '' });

  const [drawer, setDrawer] = useState(null); // {mode:'add'|'edit', user}
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [confirm, setConfirm] = useState(null); // {type:'desactiver'|'reset', user}
  const [passwordModal, setPasswordModal] = useState(null); // {title, password}

  const load = async (f = filters) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (f.role) qs.set('role', f.role);
      if (f.status) qs.set('status', f.status);
      if (f.q) qs.set('q', f.q);
      const q = qs.toString();
      const data = await api(`/users${q ? `?${q}` : ''}`);
      setUsers(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    api('/referentiels/structures?full=1')
      .then((d) => setStructures(d.items || []))
      .catch(() => setStructures([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = (next) => {
    setFilters(next);
    load(next);
  };

  const setFilter = (key, value) => applyFilters({ ...filters, [key]: value });

  const openAdd = () => {
    setForm(emptyForm);
    setFormError(null);
    setDrawer({ mode: 'add' });
  };

  const openEdit = (user) => {
    setForm({
      im: user.im,
      nom: user.nom,
      prenom: user.prenom,
      direction: user.direction,
      service: user.service,
      role: user.role,
      structureId: user.structureId || '',
    });
    setFormError(null);
    setDrawer({ mode: 'edit', user });
  };

  const closeDrawer = () => setDrawer(null);

  const submitForm = async () => {
    const missing = ['im', 'nom', 'prenom', 'direction', 'service', 'structureId'].find(
      (k) => !String(form[k] || '').trim()
    );
    if (missing) {
      setFormError(REQUIRED);
      return;
    }
    setBusy(true);
    try {
      if (drawer.mode === 'add') {
        const res = await api('/users', { method: 'POST', body: form });
        setDrawer(null);
        setPasswordModal({
          title: 'Utilisateur créé',
          password: res.provisionalPassword,
          intro:
            'Utilisateur créé. Voici le mot de passe provisoire — il ne sera plus jamais affiché :',
        });
        addToast('Utilisateur créé.', 'success');
      } else {
        const { im, ...profile } = form;
        await api(`/users/${drawer.user.id}/profil`, { method: 'PATCH', body: profile });
        setDrawer(null);
        addToast('Profil mis à jour.', 'success');
      }
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.type === 'desactiver') {
        await api(`/users/${confirm.user.id}/desactiver`, { method: 'POST' });
        addToast('Utilisateur désactivé.', 'success');
        setConfirm(null);
        await load();
      } else {
        const res = await api(`/users/${confirm.user.id}/reinitialiser-mdp`, { method: 'POST' });
        setConfirm(null);
        setPasswordModal({
          title: 'Mot de passe réinitialisé',
          password: res.provisionalPassword,
          intro:
            'Nouveau mot de passe provisoire — il ne sera plus jamais affiché :',
        });
        addToast('Mot de passe réinitialisé.', 'success');
      }
    } catch (err) {
      addToast(err.message, 'error');
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold text-[#0B2A4A]">Utilisateurs</h1>
          <p className="text-sm text-[#5B6778] mt-1">
            Créer, modifier, désactiver des comptes et réinitialiser les mots de passe.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center h-[40px] px-5 rounded-lg bg-[#1F5FA8] hover:bg-[#174C87] text-white text-sm font-semibold"
        >
          Ajouter un utilisateur
        </button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <select
          className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[170px]"
          value={filters.role}
          onChange={(e) => setFilter('role', e.target.value)}
        >
          <option value="">Tous les rôles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <select
          className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[160px]"
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
        >
          <option value="">Tous les statuts</option>
          <option value="actif">Actif</option>
          <option value="desactive">Désactivé</option>
        </select>
        <input
          type="search"
          className="h-[40px] px-3 rounded-lg border border-[#D6DCE5] bg-white text-sm min-w-[220px]"
          placeholder="Rechercher (IM, nom, prénom)"
          value={filters.q}
          onChange={(e) => setFilter('q', e.target.value)}
        />
        {(filters.role || filters.status || filters.q) && (
          <button
            onClick={() => applyFilters({ role: '', status: '', q: '' })}
            className="h-[40px] px-4 rounded-lg border border-[#E3E8EF] text-sm font-medium hover:bg-[#F5F7FA]"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          {error}
        </div>
      )}

      {/* Tableau */}
      <div className="bg-white rounded-xl border border-[#E3E8EF] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F5F7FA] text-left">
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">IM</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Nom</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Prénom</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Rôle</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Structure</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Statut</th>
                <th className="px-5 py-3 font-semibold text-[#0B2A4A]">Actions</th>
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
              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-[#5B6778]">
                    Aucun utilisateur ne correspond à ces filtres.
                  </td>
                </tr>
              )}
              {!loading &&
                users.map((u) => (
                  <tr key={u.id} className="border-t border-[#E3E8EF]">
                    <td className="px-5 py-3 font-mono text-[#0B2A4A]">{u.im}</td>
                    <td className="px-5 py-3 text-[#1A2433]">{u.nom}</td>
                    <td className="px-5 py-3 text-[#1A2433]">{u.prenom}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-semibold ${
                          roleBadge[u.role] || roleBadge.client
                        }`}
                      >
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[#5B6778]">{u.structureLabel || '—'}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-semibold ${
                          u.status === 'actif'
                            ? 'bg-[#EBF7EE] border-[#B7E3C8] text-[#1E7B4F]'
                            : 'bg-[#F5F7FA] border-[#E3E8EF] text-[#5B6778]'
                        }`}
                      >
                        {u.status === 'actif' ? 'Actif' : 'Désactivé'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => openEdit(u)}
                          className="h-[30px] px-3 rounded-lg border border-[#D6DCE5] text-xs font-semibold text-[#1F5FA8] hover:bg-[#EBF3FC]"
                        >
                          Modifier
                        </button>
                        {u.status === 'actif' && (
                          <button
                            onClick={() => setConfirm({ type: 'desactiver', user: u })}
                            className="h-[30px] px-3 rounded-lg border border-[#F6C7C3] text-xs font-semibold text-[#B42318] hover:bg-[#FEF3F2]"
                          >
                            Désactiver
                          </button>
                        )}
                        <button
                          onClick={() => setConfirm({ type: 'reset', user: u })}
                          className="h-[30px] px-3 rounded-lg border border-[#D6DCE5] text-xs font-semibold text-[#0B2A4A] hover:bg-[#F5F7FA]"
                        >
                          Réinitialiser le mot de passe
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tiroir ajouter / modifier */}
      <Drawer
        isOpen={!!drawer}
        title={drawer && drawer.mode === 'add' ? 'Ajouter un utilisateur' : 'Modifier le profil'}
        onClose={closeDrawer}
        busy={busy}
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={closeDrawer}
              disabled={busy}
              className="h-[40px] px-4 rounded-lg border border-[#E3E8EF] text-sm font-medium hover:bg-[#F5F7FA] disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={submitForm}
              disabled={busy}
              className="h-[40px] px-5 rounded-lg bg-[#1F5FA8] hover:bg-[#174C87] text-white text-sm font-semibold disabled:opacity-60"
            >
              {busy ? 'Veuillez patienter…' : drawer && drawer.mode === 'add' ? 'Créer' : 'Enregistrer'}
            </button>
          </div>
        }
      >
        {drawer && (
          <div className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-[#F6C7C3] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
                {formError}
              </div>
            )}
            <div>
              <label className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">
                IM <span className="text-[#B42318]">*</span>
              </label>
              <input
                type="text"
                className={`${inputCls} ${drawer.mode === 'edit' ? 'bg-[#F5F7FA] text-[#5B6778]' : ''}`}
                value={form.im}
                disabled={drawer.mode === 'edit'}
                maxLength={32}
                onChange={(e) => setField('im', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">
                  Nom <span className="text-[#B42318]">*</span>
                </label>
                <input
                  type="text"
                  className={inputCls}
                  value={form.nom}
                  maxLength={100}
                  onChange={(e) => setField('nom', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">
                  Prénom <span className="text-[#B42318]">*</span>
                </label>
                <input
                  type="text"
                  className={inputCls}
                  value={form.prenom}
                  maxLength={100}
                  onChange={(e) => setField('prenom', e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">
                Direction <span className="text-[#B42318]">*</span>
              </label>
              <input
                type="text"
                className={inputCls}
                value={form.direction}
                maxLength={150}
                onChange={(e) => setField('direction', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">
                Service <span className="text-[#B42318]">*</span>
              </label>
              <input
                type="text"
                className={inputCls}
                value={form.service}
                maxLength={150}
                onChange={(e) => setField('service', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">
                Rôle <span className="text-[#B42318]">*</span>
              </label>
              <select
                className={inputCls}
                value={form.role}
                onChange={(e) => setField('role', e.target.value)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#0B2A4A] mb-1.5">
                Structure <span className="text-[#B42318]">*</span>
              </label>
              <select
                className={inputCls}
                value={form.structureId}
                onChange={(e) => setField('structureId', e.target.value)}
              >
                <option value="">— Choisir une structure —</option>
                {structures.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            {drawer.mode === 'add' && (
              <p className="text-xs text-[#5B6778]">
                Un mot de passe provisoire sera généré et affiché une seule fois.
              </p>
            )}
          </div>
        )}
      </Drawer>

      {/* Confirmation désactiver / réinitialiser */}
      <ConfirmModal
        isOpen={!!confirm && confirm.type === 'desactiver'}
        title="Désactiver cet utilisateur ?"
        message={
          confirm &&
          confirm.type === 'desactiver' &&
          `${confirm.user.prenom} ${confirm.user.nom} (${confirm.user.im}) ne pourra plus se connecter.`
        }
        confirmLabel="Désactiver"
        danger
        busy={busy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmModal
        isOpen={!!confirm && confirm.type === 'reset'}
        title="Réinitialiser le mot de passe ?"
        message={
          confirm &&
          confirm.type === 'reset' &&
          `Un nouveau mot de passe provisoire sera généré pour ${confirm.user.prenom} ${confirm.user.nom} (${confirm.user.im}) et devra être changé à la prochaine connexion.`
        }
        confirmLabel="Réinitialiser"
        busy={busy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />

      {/* Mot de passe provisoire affiché une fois */}
      {passwordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-[#0B2A4A]/40" />
          <div className="relative w-full max-w-[440px] bg-white rounded-xl border border-[#E3E8EF] shadow-card p-6">
            <h2 className="text-[18px] font-semibold text-[#0B2A4A] mb-2">
              {passwordModal.title}
            </h2>
            <p className="text-[15px] text-[#5B6778] leading-relaxed">{passwordModal.intro}</p>
            <p className="mt-4 px-4 py-3 rounded-lg border border-[#B8D2EF] bg-[#EBF3FC] text-center font-mono text-[20px] font-semibold text-[#0B2A4A] select-all">
              {passwordModal.password}
            </p>
            <p className="mt-3 text-xs text-[#B7791F]">
              Notez-le maintenant : il ne sera plus jamais affiché.
            </p>
            <div className="flex justify-end mt-6">
              <button
                type="button"
                onClick={() => setPasswordModal(null)}
                className="h-[40px] px-5 rounded-lg bg-[#1F5FA8] hover:bg-[#174C87] text-white text-sm font-semibold"
              >
                J'ai noté le mot de passe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
