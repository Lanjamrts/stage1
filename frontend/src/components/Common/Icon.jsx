// Icônes SVG du menu SIGBD, sans dépendance.
import React from 'react';

export default function Icon({ name, className = 'w-5 h-5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {drawIcon(name)}
    </svg>
  );
}

function drawIcon(name) {
  switch (name) {
    case 'dashboard':
      return (
        <>
          <rect x="2" y="2" width="9" height="9" fill="none" />
          <rect x="13" y="2" width="9" height="9" fill="none" />
          <rect x="2" y="13" width="9" height="9" fill="none" />
          <rect x="13" y="13" width="9" height="9" fill="none" />
        </>
      );
    case 'edit':
      return (
        <>
          <rect x="8" y="2" width="12" height="18" rx="2" ry="2" fill="none" />
          <path d="M21 6l-3 3m-3 3L8 2" fill="none" />
          <line x1="12" y1="6" x2="12" y2="2" fill="none" />
          <line x1="12" y1="10" x2="16" y2="10" fill="none" />
          <line x1="12" y1="14" x2="18" y2="14" fill="none" />
        </>
      );
    case 'folder':
      return (
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3l2 2h9a2 2 0 0 1 2 2z" fill="none" />
      );
    case 'search':
      return (
        <>
          <circle cx="11" cy="11" r="8" fill="none" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" fill="none" />
        </>
      );
    case 'chat':
      return (
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="none" />
      );
    case 'users':
      return (
        <>
          <circle cx="9" cy="7" r="4" fill="none" />
          <path d="M5 21v-4a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v4" fill="none" />
          <circle cx="19" cy="7" r="3" fill="none" />
          <path d="M16 21v-4a3 3 0 0 1 3-3h1a3 3 0 0 1 3 3v4" fill="none" />
        </>
      );
    case 'chart':
      return (
        <>
          <line x1="4" y1="20" x2="4" y2="18" fill="none" />
          <line x1="8" y1="20" x2="8" y2="16" fill="none" />
          <line x1="12" y1="20" x2="12" y2="12" fill="none" />
          <line x1="16" y1="20" x2="16" y2="6" fill="none" />
          <line x1="20" y1="20" x2="20" y2="8" fill="none" />
        </>
      );
    case 'clipboard':
      return (
        <>
          <rect x="8" y="2" width="8" height="4" fill="none" />
          <path d="M8 6h8v14a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V6z" fill="none" />
          <line x1="12" y1="8" x2="12" y2="16" fill="none" />
          <line x1="16" y1="8" x2="16" y2="12" fill="none" />
        </>
      );
    case 'settings':
      return (
        <>
          <circle cx="12" cy="12" r="3" fill="none" />
          <line x1="12" y1="3" x2="12" y2="5" fill="none" />
          <line x1="12" y1="19" x2="12" y2="21" fill="none" />
          <line x1="3" y1="12" x2="5" y2="12" fill="none" />
          <line x1="19" y1="12" x2="21" y2="12" fill="none" />
          <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" fill="none" />
          <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" fill="none" />
          <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" fill="none" />
          <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" fill="none" />
        </>
      );
    default:
      return <circle cx="12" cy="12" r="2" fill="none" />;
  }
}
