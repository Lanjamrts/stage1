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
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="16" y2="17" />
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
          <rect x="3" y="12" width="4" height="9" rx="1" />
          <rect x="10" y="3" width="4" height="18" rx="1" />
          <rect x="17" y="8" width="4" height="13" rx="1" />
        </>
      );
    case 'clipboard':
      return (
        <>
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          <line x1="8" y1="12" x2="16" y2="12" />
          <line x1="8" y1="16" x2="14" y2="16" />
        </>
      );
    case 'settings':
      return (
        <>
          <line x1="4" y1="21" x2="4" y2="14" />
          <line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" />
          <line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" />
          <line x1="9" y1="8" x2="15" y2="8" />
          <line x1="17" y1="16" x2="23" y2="16" />
        </>
      );
    default:
      return <circle cx="12" cy="12" r="2" fill="none" />;
  }
}
