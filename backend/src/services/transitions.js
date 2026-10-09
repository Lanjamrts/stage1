"use strict";

// Machine à états du rapport (SPEC §2) : ces transitions, et rien d'autre.
export const ALLOWED_TRANSITIONS = {
  brouillon: ['soumise'],
  rejetee: ['soumise'],
  soumise: ['validee', 'rejetee'],
  validee: ['exportee'],
  exportee: ['archivee'],
};

export function canTransition(from, to) {
  return Array.isArray(ALLOWED_TRANSITIONS[from]) && ALLOWED_TRANSITIONS[from].includes(to);
}

export const TRANSITION_ERROR = "Cette transition n'est pas autorisée.";
