import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const ROOT_DIR = __dirname;

function readRootFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf-8');
}

describe('Auditoria Estática & Invariantes de Segurança — firestore.rules', () => {
  const rulesText = readRootFile('firestore.rules');
  const blueprint = JSON.parse(readRootFile('firebase-blueprint.json')) as {
    firestore: Record<string, unknown>;
    entities: Record<string, { required?: string[] }>;
  };
  const securitySpec = readRootFile('security_spec.md');

  it('inicia com negação padrão explícita e não contém regras permissivas abertas', () => {
    expect(rulesText).toContain("rules_version = '2';");
    expect(rulesText).toMatch(/match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/);
    expect(rulesText).not.toMatch(/allow\s+(read|write|get|list|create|update|delete)\s*:\s*if\s+true\s*;/);
  });

  it('bloqueia listagem do diretório /users e exige email_verified == true para todas as escritas', () => {
    expect(rulesText).toContain('allow list: if false;');
    expect(rulesText).toContain('request.auth.token.email_verified == true');
    expect(rulesText).toContain('request.auth != null;');
    expect(rulesText).toContain('isSignedIn() && request.auth.uid == uid');
    expect(rulesText).toContain('resource.data.ownerUid == request.auth.uid');
  });

  it('protege imutabilidade de ownerUid/id/createdAt e mantém backups imutáveis após criação', () => {
    expect(rulesText).toContain('preservesImmutableOwnerAndCreated');
    expect(rulesText).toContain('request.resource.data.ownerUid == resource.data.ownerUid');
    expect(rulesText).toContain('request.resource.data.createdAt == resource.data.createdAt');
    expect(rulesText).toMatch(/match \/backups\/\{backupId\}[\s\S]*allow update: if false;/);
  });

  it('valida IDs de documento, enums críticos, limites de tamanho e rejeita chaves desconhecidas (hasOnly/hasAll)', () => {
    expect(rulesText).toContain('function isValidId(id)');
    expect(rulesText).toContain("!(id in ['.', '..'])");
    expect(rulesText).toContain('data.keys().hasAll(');
    expect(rulesText).toContain('data.keys().hasOnly(');
    expect(rulesText).toContain('isBoundedStr(data.payloadJson, 2, 850000)');
    expect(rulesText).toContain("val is string && (val == 'CPF' || val == 'CNPJ')");
    expect(rulesText).toContain('isEntityScopePair(data.entityId)');
  });

  it('cobre todas as 13 coleções especificadas em firebase-blueprint.json e documenta a matriz Dirty Dozen', () => {
    const collections = [
      'users/{uid}',
      'accounts/{accountId}',
      'transactions/{txId}',
      'creditCards/{cardId}',
      'boletos/{boletoId}',
      'debts/{debtId}',
      'assets/{assetId}',
      'documents/{docId}',
      'salaries/{salaryDocId}',
      'budgets/{budgetId}',
      'categoryRules/{ruleId}',
      'settings/{settingId}',
      'backups/{backupId}',
    ];

    expect(Object.keys(blueprint.firestore)).toHaveLength(13);
    for (const colMatch of collections) {
      expect(rulesText, `Coleção ausente nas regras: ${colMatch}`).toContain(colMatch);
    }

    expect(securitySpec).toContain('Dirty Dozen');
    expect(securitySpec).toContain('DENIED');
  });
});
