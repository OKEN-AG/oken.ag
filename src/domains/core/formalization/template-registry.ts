export interface FormalizationTemplate {
  id: string;
  name: string;
  jurisdiction: string;
  language: string;
  body: string;
  requiredClauses: string[];
  version: number;
  createdAt: string;
}

export class TemplateRegistry {
  private templates = new Map<string, FormalizationTemplate>();

  register(template: FormalizationTemplate): void {
    this.templates.set(template.id, template);
  }

  getById(id: string): FormalizationTemplate | undefined {
    return this.templates.get(id);
  }

  listByJurisdiction(jurisdiction: string): FormalizationTemplate[] {
    return [...this.templates.values()].filter((template) => template.jurisdiction === jurisdiction);
  }
}
