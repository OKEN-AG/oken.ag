/**
 * Document Generator — Generates structured document content from templates + operation data.
 */

export interface DocumentSection {
  heading: string;
  type?: 'table' | 'list' | 'text';
  content?: string;
  fields?: string[];
  items?: string[];
  columns?: string[];
  dataKey?: string;
}

export interface DocumentTemplate {
  title: string;
  sections: DocumentSection[];
}

export interface DocumentData {
  clientName?: string;
  clientDocument?: string;
  clientCity?: string;
  clientState?: string;
  farmName?: string;
  farmAddress?: string;
  counterparty?: string;
  commodity?: string;
  quantitySacas?: number;
  commodityPrice?: number;
  deliveryLocation?: string;
  deliveryDate?: string;
  creditorName?: string;
  creditorDocument?: string;
  grossRevenue?: number;
  comboDiscount?: number;
  netRevenue?: number;
  dueDate?: string;
  paymentMethod?: string;
  quantity?: number;
  quality?: string;
  items?: { product: string; dose: string; quantity: string; price: string; subtotal: string }[];
}

const fieldLabels: Record<string, string> = {
  clientName: 'Nome/Razão Social',
  clientDocument: 'CPF/CNPJ',
  clientCity: 'Cidade',
  clientState: 'Estado',
  farmName: 'Nome da Fazenda',
  farmAddress: 'Endereço da Fazenda',
  counterparty: 'Contraparte/Comprador',
  commodity: 'Commodity',
  quantitySacas: 'Quantidade (sacas)',
  commodityPrice: 'Preço por Saca',
  deliveryLocation: 'Local de Entrega',
  deliveryDate: 'Data de Entrega',
  creditorName: 'Credor',
  creditorDocument: 'CNPJ Credor',
  grossRevenue: 'Receita Bruta',
  comboDiscount: 'Desconto Total',
  netRevenue: 'Valor Líquido',
  dueDate: 'Vencimento',
  paymentMethod: 'Meio de Pagamento',
  quantity: 'Quantidade',
  quality: 'Qualidade/Padrão',
};

function formatValue(key: string, value: any): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'number') {
    if (['grossRevenue', 'comboDiscount', 'netRevenue', 'commodityPrice'].includes(key)) {
      return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    return value.toLocaleString('pt-BR');
  }
  if (key === 'dueDate' || key === 'deliveryDate') {
    try { return new Date(value).toLocaleDateString('pt-BR'); } catch { return String(value); }
  }
  return String(value);
}

export function generateDocumentHtml(template: DocumentTemplate, data: DocumentData): string {
  const lines: string[] = [];
  lines.push(`<div style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 24px;">`);
  lines.push(`<h1 style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 24px;">${template.title}</h1>`);
  lines.push(`<p style="text-align: right; color: #666; font-size: 12px;">Data: ${new Date().toLocaleDateString('pt-BR')}</p>`);

  for (const section of template.sections) {
    lines.push(`<h2 style="color: #333; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 24px;">${section.heading}</h2>`);

    if (section.content) {
      lines.push(`<p style="line-height: 1.6;">${section.content}</p>`);
    }

    if (section.fields) {
      lines.push(`<table style="width: 100%; border-collapse: collapse; margin: 8px 0;">`);
      for (const field of section.fields) {
        const label = fieldLabels[field] || field;
        const value = formatValue(field, (data as any)[field]);
        lines.push(`<tr><td style="padding: 6px 12px; font-weight: 600; width: 40%; border-bottom: 1px solid #eee;">${label}</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${value}</td></tr>`);
      }
      lines.push(`</table>`);
    }

    if (section.type === 'table' && section.dataKey === 'items' && data.items) {
      lines.push(`<table style="width: 100%; border-collapse: collapse; margin: 8px 0;">`);
      if (section.columns) {
        lines.push(`<thead><tr>${section.columns.map(c => `<th style="padding: 8px; text-align: left; border-bottom: 2px solid #333; font-size: 12px;">${c}</th>`).join('')}</tr></thead>`);
      }
      lines.push(`<tbody>`);
      for (const item of data.items) {
        lines.push(`<tr>${Object.values(item).map(v => `<td style="padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 13px;">${v}</td>`).join('')}</tr>`);
      }
      lines.push(`</tbody></table>`);
    }

    if (section.items) {
      lines.push(`<ol style="line-height: 1.8; padding-left: 20px;">`);
      for (const item of section.items) {
        lines.push(`<li>${item}</li>`);
      }
      lines.push(`</ol>`);
    }
  }

  lines.push(`<div style="margin-top: 48px; border-top: 1px solid #ccc; padding-top: 24px;">`);
  lines.push(`<div style="display: flex; justify-content: space-between; margin-top: 48px;">`);
  lines.push(`<div style="text-align: center; width: 45%;"><div style="border-top: 1px solid #333; padding-top: 4px;">EMITENTE</div></div>`);
  lines.push(`<div style="text-align: center; width: 45%;"><div style="border-top: 1px solid #333; padding-top: 4px;">CLIENTE</div></div>`);
  lines.push(`</div></div></div>`);

  return lines.join('\n');
}

/** Default templates for when DB templates aren't loaded */
export const defaultTemplates: Record<string, DocumentTemplate> = {
  pedido: {
    title: 'PEDIDO DE COMPRA',
    sections: [
      { heading: 'DADOS DO CLIENTE', fields: ['clientName', 'clientDocument', 'clientCity', 'clientState'] },
      { heading: 'PRODUTOS', type: 'table', columns: ['Produto', 'Dose/ha', 'Quantidade', 'Preço Unit.', 'Subtotal'], dataKey: 'items' },
      { heading: 'CONDIÇÕES COMERCIAIS', fields: ['grossRevenue', 'comboDiscount', 'netRevenue', 'dueDate', 'paymentMethod'] },
      { heading: 'OBSERVAÇÕES', content: 'Este pedido está sujeito às condições da campanha vigente.' },
    ],
  },
  termo_barter: {
    title: 'TERMO DE COMPROMISSO DE BARTER',
    sections: [
      { heading: 'PARTES', fields: ['clientName', 'clientDocument', 'counterparty'] },
      { heading: 'OBJETO', content: 'O CLIENTE se compromete a entregar a commodity abaixo especificada como forma de pagamento dos produtos adquiridos.' },
      { heading: 'COMMODITY', fields: ['commodity', 'quantitySacas', 'commodityPrice', 'deliveryLocation', 'deliveryDate'] },
      { heading: 'OBRIGAÇÕES', items: ['Apresentar contrato de compra e venda (CCV)', 'Ceder créditos em favor do credor', 'Emitir garantias conforme campanha', 'Entregar documentação complementar em até 30 dias'] },
      { heading: 'CONDIÇÕES', content: 'O faturamento e liberação do crédito ficam condicionados ao cumprimento integral das obrigações acima.' },
    ],
  },
  cpr: {
    title: 'CÉDULA DE PRODUTO RURAL - CPR',
    sections: [
      { heading: 'EMITENTE', fields: ['clientName', 'clientDocument', 'farmName', 'farmAddress'] },
      { heading: 'PRODUTO', fields: ['commodity', 'quantity', 'quality', 'deliveryLocation'] },
      { heading: 'BENEFICIÁRIO', fields: ['creditorName', 'creditorDocument'] },
      { heading: 'VENCIMENTO', fields: ['dueDate'] },
      { heading: 'GARANTIAS', content: 'Esta CPR é garantida pela produção descrita e pelos bens eventualmente alienados fiduciariamente.' },
    ],
  },
};
