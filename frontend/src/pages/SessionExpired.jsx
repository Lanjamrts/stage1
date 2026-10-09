export default function SessionExpired() {
  return (
    <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center px-4">
      <div className="w-full max-w-[480px] bg-white rounded-xl border border-[#E3E8EF] shadow-card p-10 text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-[#FEF3C7] flex items-center justify-center mb-5">
          <svg className="w-7 h-7 text-[#B7791F]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-[24px] font-semibold text-[#0B2A4A] mb-2">Votre session a expiré</h1>
        <p className="text-[15px] text-[#5B6778] leading-relaxed">
          Pour votre sécurité, vous avez été déconnecté après une période d'inactivité.
        </p>
        <div className="mt-5 flex items-start gap-2 bg-[#EBF7EE] border border-[#1E7B4F]/30 rounded-lg p-3 text-[13px] text-[#1E7B4F] text-left">
          <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span>Les données que vous avez enregistrées en brouillon sont conservées.</span>
        </div>
        <a
          href="/login"
          className="inline-flex items-center justify-center mt-6 h-[44px] px-6 bg-[#1F5FA8] hover:bg-[#174C87] text-white text-[15px] font-semibold rounded-lg transition-colors"
        >
          Se reconnecter
        </a>
      </div>
    </div>
  );
}
