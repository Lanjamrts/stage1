// Bouton commun SIGBD (variantes et tailles). À utiliser dans toute nouvelle page.
import React from 'react';

const base =
  'inline-flex items-center justify-center whitespace-nowrap shrink-0 rounded-lg font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F5FA8]/40 disabled:opacity-60 disabled:cursor-not-allowed';

const variants = {
  primary: 'bg-[#1F5FA8] hover:bg-[#174C87] text-white',
  secondary: 'border border-[#D6DCE5] bg-white text-[#1A2433] hover:bg-[#F5F7FA]',
  danger: 'border border-[#F6C7C3] bg-white text-[#B42318] hover:bg-[#FEF3F2]',
};

const sizes = {
  md: 'h-[36px] px-5 text-sm',
  sm: 'h-[32px] px-3 text-[13px]',
  lg: 'h-[44px] px-5 text-[15px]',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled,
  className,
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className || ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}
