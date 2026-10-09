export default function AccessDenied() {
  return (
    <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center px-4">
      <div className="w-full max-w-[480px] bg-white rounded-xl border border-[#E3E8EF] shadow-card p-10 text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-[#FDECEA] flex items-center justify-center mb-5">
          <svg className="w-7 h-7 text-[#B42318]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 className="text-[24px] font-semibold text-[#0B2A4A] mb-2">Accès refusé</h1>
        <p className="text-[15px] text-[#5B6778] leading-relaxed">
          Vous n'avez pas l'autorisation d'accéder à cette page.
        </p>
        <p className="text-[15px] text-[#5B6778] leading-relaxed mt-2">
          Cette page n'est pas disponible pour votre profil. Si vous pensez qu'il s'agit d'une
          erreur, contactez votre administrateur.
        </p>
        <a
          href="/"
          className="inline-flex items-center justify-center mt-6 h-[44px] px-6 bg-[#1F5FA8] hover:bg-[#174C87] text-white text-[15px] font-semibold rounded-lg transition-colors"
        >
          Retour à l'accueil
        </a>
      </div>
    </div>
  );
}
