export interface FormalizationClause {
  id: string;
  title: string;
  text: string;
  tags: string[];
  required: boolean;
  version: number;
}

export class ClauseLibrary {
  private clauses = new Map<string, FormalizationClause>();

  add(clause: FormalizationClause): void {
    this.clauses.set(clause.id, clause);
  }

  get(id: string): FormalizationClause | undefined {
    return this.clauses.get(id);
  }

  listRequired(): FormalizationClause[] {
    return [...this.clauses.values()].filter((clause) => clause.required);
  }

  listByTag(tag: string): FormalizationClause[] {
    return [...this.clauses.values()].filter((clause) => clause.tags.includes(tag));
  }
}
