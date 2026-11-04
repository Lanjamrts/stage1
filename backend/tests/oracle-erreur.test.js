"use strict";

import { describe, it, expect } from 'vitest';
import { messageErreurOracle } from '../src/db/oracle.js';

// Le masquage s'appuie sur ORACLE_PASSWORD (config chargée paresseusement au
// premier loadConfig(), qui n'est appelé nulle part ailleurs dans la suite).
const MOT_DE_PASSE = 'SecretOracleTest99!';
process.env.ORACLE_PASSWORD = MOT_DE_PASSE;

function err(message, errorNum) {
  const e = new Error(message);
  if (errorNum !== undefined) e.errorNum = errorNum;
  return e;
}

describe("Traduction des erreurs Oracle (messageErreurOracle)", () => {
  it('ORA-01017 → identifiants refusés, accents présents', () => {
    for (const errorNum of [1017, '01017']) {
      const m = messageErreurOracle(err('ORA-01017: invalid username/password; logon denied', errorNum));
      expect(m).toContain('Identifiants Oracle refusés (ORA-01017)');
      expect(m).toContain('vérifiez ORACLE_USER et ORACLE_PASSWORD');
      expect(m).not.toContain('refuses');
      expect(m).not.toContain('verifiez');
    }
  });

  it('ORA-12514 → service introuvable, « vérifiez » accentué', () => {
    const m = messageErreurOracle(err('ORA-12514: TNS:listener does not currently know of service requested', 12514));
    expect(m).toContain('Service Oracle introuvable (ORA-12514)');
    expect(m).toContain('vérifiez ORACLE_CONNECT_STRING');
  });

  it('ORA-12170 → « délai dépassé » accentué', () => {
    const m = messageErreurOracle(err('ORA-12170: TNS:Connect timeout occurred', 12170));
    expect(m).toContain('Délai de connexion Oracle dépassé (ORA-12170)');
    expect(m).not.toContain('depasse');
  });

  it('NJS-503 / ECONNREFUSED → message dédié conteneur/service démarré', () => {
    const erreurs = [
      err('NJS-503: Connection error: connect ECONNREFUSED 127.0.0.1:1521'),
      err('connect ECONNREFUSED 127.0.0.1:1521'),
      err('NJS-503: Connection error', 503),
    ];
    for (const e of erreurs) {
      const m = messageErreurOracle(e);
      expect(m).toContain('Oracle est injoignable (connexion refusée)');
      expect(m).toContain('le conteneur ou le service Oracle est-il démarré ?');
      expect(m).toContain('Vérifiez ORACLE_CONNECT_STRING');
    }
  });

  it('Erreur inconnue → « Erreur Oracle : … »', () => {
    expect(messageErreurOracle(err('boom inattendu'))).toBe('Erreur Oracle : boom inattendu');
    expect(messageErreurOracle(null)).toBe('Erreur Oracle : Erreur Oracle inconnue.');
  });

  it('Le mot de passe est masqué dans le message', () => {
    const m = messageErreurOracle(err(`login failed for user sigbd with password ${MOT_DE_PASSE}`));
    expect(m).toContain('*****');
    expect(m).not.toContain(MOT_DE_PASSE);
  });

  it('Une erreur multi-lignes (stack) tient sur une seule ligne', () => {
    const m = messageErreurOracle(err('NJS-503: Connection error\n    at Protocol.connect'));
    expect(m).not.toContain('\n');
  });

  it('Timeout et hôte injoignable → phrases accentuées', () => {
    expect(messageErreurOracle(err('connect ETIMEDOUT 10.0.0.1:1521'))).toContain("l'hôte ne répond pas");
    const hote = messageErreurOracle(err('getaddrinfo ENOTFOUND db.example.local'));
    expect(hote).toContain('Hôte Oracle injoignable : vérifiez ORACLE_CONNECT_STRING et le réseau');
  });
});
