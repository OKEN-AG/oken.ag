import { describe, expect, it } from 'vitest';
import {
  ClauseLibrary,
  DraftVersioningService,
  TemplateRegistry,
  canTransitionDocumentState,
  generateDocumentFromSnapshot,
  isDocumentDone,
  normalizeDocumentState,
  validateMinimumDocumentRule,
} from '@/domains/core/formalization';

describe('formalization core', () => {
  it('normaliza estados legados para canônicos', () => {
    expect(normalizeDocumentState('emitido')).toBe('draft');
    expect(normalizeDocumentState('validado')).toBe('aprovado');
    expect(normalizeDocumentState('desconhecido')).toBe('pendente');
  });

  it('versiona minutas sequencialmente', () => {
    const service = new DraftVersioningService();

    const first = service.append({
      documentId: 'doc-1',
      version: 0,
      state: 'draft',
      contentHash: 'a',
      createdBy: 'user-1',
      createdAt: new Date().toISOString(),
    });

    const second = service.append({
      documentId: 'doc-1',
      version: 0,
      state: 'aprovado',
      contentHash: 'b',
      createdBy: 'user-1',
      createdAt: new Date().toISOString(),
    });

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(service.getLatest('doc-1')?.state).toBe('aprovado');
  });

  it('mantém template registry e clause library', () => {
    const templates = new TemplateRegistry();
    templates.register({
      id: 'tpl-1',
      name: 'CPR Base',
      jurisdiction: 'BR',
      language: 'pt-BR',
      body: 'conteúdo',
      requiredClauses: ['cl-1'],
      version: 1,
      createdAt: new Date().toISOString(),
    });

    const clauses = new ClauseLibrary();
    clauses.add({
      id: 'cl-1',
      title: 'Cláusula de Registro',
      text: '...',
      tags: ['registro'],
      required: true,
      version: 1,
    });

    expect(templates.listByJurisdiction('BR')).toHaveLength(1);
    expect(clauses.listRequired()).toHaveLength(1);
    expect(clauses.listByTag('registro')).toHaveLength(1);
  });

  it('bloqueia desembolso quando regra mínima não for atendida', () => {
    const result = validateMinimumDocumentRule(
      [
        { docType: 'termo_barter', minimumState: 'assinado' },
        { docType: 'cpr', minimumState: 'assinado' },
      ],
      [
        { doc_type: 'termo_barter', status: 'assinado' },
        { doc_type: 'cpr', status: 'aprovado' },
      ],
    );

    expect(result.canDisburse).toBe(false);
    expect(result.missing).toEqual(['cpr']);
  });

  it('valida transições permitidas da máquina de estados', () => {
    expect(canTransitionDocumentState('draft', 'aprovado')).toBe(true);
    expect(canTransitionDocumentState('aprovado', 'registrado')).toBe(false);
  });

  it('gera documento com payload congelado a partir de core snapshot', () => {
    const snapshot = {
      id: 'snap-1',
      payload: { operationId: 'op-1', amount: 10 },
      payloadHash: 'hash-1',
      createdAt: new Date().toISOString(),
    };

    const draft = generateDocumentFromSnapshot(snapshot, {
      id: 'tv-1',
      body: 'template body',
      versionNumber: 1,
    });

    expect(draft.snapshotId).toBe('snap-1');
    expect(draft.payloadFrozen).toEqual(snapshot.payload);
    expect(draft.contentHash).toBe('hash-1');
  });

  it('expõe document_done para gate de desembolso', () => {
    const required = [
      { docType: 'termo_barter', minimumState: 'assinado' as const },
      { docType: 'cpr', minimumState: 'assinado' as const },
    ];

    const existing = [
      { doc_type: 'termo_barter', status: 'assinado' },
      { doc_type: 'cpr', status: 'assinado' },
    ];

    expect(isDocumentDone(required, existing)).toBe(true);
  });
});
