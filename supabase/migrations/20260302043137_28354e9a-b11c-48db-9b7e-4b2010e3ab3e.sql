
-- PR-2: order_installments table for credit schedule persistence
CREATE TABLE public.order_installments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  installment_number integer NOT NULL,
  principal_amount numeric NOT NULL DEFAULT 0,
  interest_amount numeric NOT NULL DEFAULT 0,
  payment_amount numeric NOT NULL DEFAULT 0,
  balance_amount numeric NOT NULL DEFAULT 0,
  amortization_method text NOT NULL DEFAULT 'PRICE',
  payment_method text,
  cet_operation_annual numeric,
  cet_payment_method_annual numeric,
  total_cost_operation numeric,
  total_cost_payment_method numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own installments" ON public.order_installments
  FOR ALL USING (EXISTS (SELECT 1 FROM operations WHERE operations.id = order_installments.order_id AND operations.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM operations WHERE operations.id = order_installments.order_id AND operations.user_id = auth.uid()));

CREATE POLICY "Admins can view all installments" ON public.order_installments
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- PR-4: document_templates table for structured document generation
CREATE TABLE public.document_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doc_type text NOT NULL,
  template_name text NOT NULL,
  template_body jsonb NOT NULL DEFAULT '{}',
  variables text[] DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage templates" ON public.document_templates
  FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Authenticated view templates" ON public.document_templates
  FOR SELECT USING (true);

-- Seed default document templates
INSERT INTO public.document_templates (doc_type, template_name, template_body, variables) VALUES
('pedido', 'Pedido de Compra Padrão', '{"title":"PEDIDO DE COMPRA","sections":[{"heading":"DADOS DO CLIENTE","fields":["clientName","clientDocument","clientCity","clientState"]},{"heading":"PRODUTOS","type":"table","columns":["Produto","Dose/ha","Quantidade","Preço Unit.","Subtotal"],"dataKey":"items"},{"heading":"CONDIÇÕES COMERCIAIS","fields":["grossRevenue","comboDiscount","netRevenue","dueDate","paymentMethod"]},{"heading":"OBSERVAÇÕES","content":"Este pedido está sujeito às condições da campanha vigente."}]}', ARRAY['clientName','clientDocument','clientCity','clientState','items','grossRevenue','comboDiscount','netRevenue','dueDate','paymentMethod']),
('termo_barter', 'Termo de Compromisso Barter', '{"title":"TERMO DE COMPROMISSO DE BARTER","sections":[{"heading":"PARTES","fields":["clientName","clientDocument","counterparty"]},{"heading":"OBJETO","content":"O CLIENTE se compromete a entregar a commodity abaixo especificada como forma de pagamento dos produtos adquiridos."},{"heading":"COMMODITY","fields":["commodity","quantitySacas","commodityPrice","deliveryLocation","deliveryDate"]},{"heading":"OBRIGAÇÕES","items":["Apresentar contrato de compra e venda (CCV)","Ceder créditos em favor do credor","Emitir garantias conforme campanha","Entregar documentação complementar em até 30 dias"]},{"heading":"CONDIÇÕES","content":"O faturamento e liberação do crédito ficam condicionados ao cumprimento integral das obrigações acima."}]}', ARRAY['clientName','clientDocument','counterparty','commodity','quantitySacas','commodityPrice','deliveryLocation','deliveryDate']),
('cpr', 'Cédula de Produto Rural', '{"title":"CÉDULA DE PRODUTO RURAL - CPR","sections":[{"heading":"EMITENTE","fields":["clientName","clientDocument","farmName","farmAddress"]},{"heading":"PRODUTO","fields":["commodity","quantity","quality","deliveryLocation"]},{"heading":"BENEFICIÁRIO","fields":["creditorName","creditorDocument"]},{"heading":"VENCIMENTO","fields":["dueDate"]},{"heading":"GARANTIAS","content":"Esta CPR é garantida pela produção descrita e pelos bens eventualmente alienados fiduciariamente."}]}', ARRAY['clientName','clientDocument','farmName','farmAddress','commodity','quantity','quality','deliveryLocation','creditorName','creditorDocument','dueDate']);
