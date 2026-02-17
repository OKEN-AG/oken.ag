import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { mockProducts, mockCampaign, mockCombos } from '@/data/mock-data';
import { calculateAgronomicSelection } from '@/engines/agronomic';
import { applyComboCascade, getMaxPossibleDiscount, getActivatedDiscount } from '@/engines/combo-cascade';
import { decomposePricing, calculateGrossToNet } from '@/engines/pricing';
import type { AgronomicSelection, ChannelSegment, Product } from '@/types/barter';
import { Plus, Minus, Wheat, ShoppingCart, TrendingUp, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useNavigate } from 'react-router-dom';

export default function SimulationPage() {
  const navigate = useNavigate();
  const [area, setArea] = useState(500);
  const [segment, setSegment] = useState<ChannelSegment>('distribuidor');
  const [dueMonths, setDueMonths] = useState(12);
  const [selectedProducts, setSelectedProducts] = useState<Map<string, number>>(new Map());

  const toggleProduct = (productId: string) => {
    const next = new Map(selectedProducts);
    if (next.has(productId)) {
      next.delete(productId);
    } else {
      const prod = mockProducts.find(p => p.id === productId)!;
      next.set(productId, prod.dosePerHectare);
    }
    setSelectedProducts(next);
  };

  const updateDose = (productId: string, dose: number) => {
    const next = new Map(selectedProducts);
    next.set(productId, dose);
    setSelectedProducts(next);
  };

  const selections = useMemo<AgronomicSelection[]>(() => {
    return Array.from(selectedProducts.entries()).map(([id, dose]) => {
      const product = mockProducts.find(p => p.id === id)!;
      return calculateAgronomicSelection(product, area, dose);
    });
  }, [selectedProducts, area]);

  const comboActivations = useMemo(() => {
    return applyComboCascade(mockCombos, selections);
  }, [selections]);

  const maxDiscount = getMaxPossibleDiscount(mockCombos);
  const activatedDiscount = getActivatedDiscount(comboActivations);
  const discountProgress = maxDiscount > 0 ? (activatedDiscount / maxDiscount) * 100 : 0;

  const pricingResults = useMemo(() => {
    return selections.map(sel =>
      decomposePricing(sel.product, mockCampaign, segment, dueMonths, sel.roundedQuantity)
    );
  }, [selections, segment, dueMonths]);

  const grossToNet = useMemo(() => {
    return calculateGrossToNet(pricingResults, comboActivations);
  }, [pricingResults, comboActivations]);

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Simulação de Pedido</h1>
        <p className="text-sm text-muted-foreground">Selecione produtos, ajuste doses e visualize a simulação completa</p>
      </div>

      {/* Config row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <label className="stat-label">Área (hectares)</label>
          <Input
            type="number"
            value={area}
            onChange={e => setArea(Number(e.target.value))}
            className="mt-2 bg-muted border-border font-mono text-foreground"
            min={1}
          />
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">Canal de Venda</label>
          <Select value={segment} onValueChange={(v) => setSegment(v as ChannelSegment)}>
            <SelectTrigger className="mt-2 bg-muted border-border text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="distribuidor">Distribuidor</SelectItem>
              <SelectItem value="cooperativa">Cooperativa</SelectItem>
              <SelectItem value="direto">Venda Direta</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">Prazo (meses)</label>
          <Select value={String(dueMonths)} onValueChange={(v) => setDueMonths(Number(v))}>
            <SelectTrigger className="mt-2 bg-muted border-border text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">6 meses</SelectItem>
              <SelectItem value="9">9 meses</SelectItem>
              <SelectItem value="12">12 meses</SelectItem>
              <SelectItem value="15">15 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Combo discount bar */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-success" /> Ativação de Combos
          </span>
          <span className="font-mono text-sm text-success font-bold">{activatedDiscount.toFixed(1)}% / {maxDiscount}%</span>
        </div>
        <Progress value={discountProgress} className="h-3 bg-muted" />
        <div className="flex flex-wrap gap-2 mt-3">
          {comboActivations.map(ca => (
            <span key={ca.comboId} className={`engine-badge ${ca.applied ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
              {ca.comboName} ({ca.discountPercent}%)
              {ca.applied ? ' ✓' : ''}
            </span>
          ))}
        </div>
        {discountProgress < 100 && (
          <div className="flex items-center gap-1 mt-2 text-xs text-warning">
            <AlertCircle className="w-3 h-3" />
            Adicione mais produtos ou ajuste doses para maximizar descontos
          </div>
        )}
      </div>

      {/* Product selection */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Portfólio de Produtos</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {mockProducts.map(product => {
            const isSelected = selectedProducts.has(product.id);
            const dose = selectedProducts.get(product.id) ?? product.dosePerHectare;
            const selection = selections.find(s => s.productId === product.id);

            return (
              <motion.div
                key={product.id}
                layout
                className={`glass-card p-4 cursor-pointer transition-all ${isSelected ? 'glow-border' : 'hover:border-muted-foreground/30'}`}
                onClick={() => !isSelected && toggleProduct(product.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm font-semibold text-foreground">{product.name}</span>
                    <span className="ml-2 engine-badge bg-muted text-muted-foreground">{product.category}</span>
                  </div>
                  {isSelected ? (
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); toggleProduct(product.id); }} className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7 p-0">
                      <Minus className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" className="text-success hover:text-success hover:bg-success/10 h-7 w-7 p-0">
                      <Plus className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <div className="text-xs text-muted-foreground mb-2">{product.activeIngredient}</div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Dose rec.:</span>
                    <span className="ml-1 font-mono text-foreground">{product.dosePerHectare} {product.unitType}/ha</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Preço:</span>
                    <span className="ml-1 font-mono text-foreground">US$ {product.pricePerUnit.toFixed(2)}/{product.unitType}</span>
                  </div>
                </div>

                {isSelected && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 pt-3 border-t border-border space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground w-20">Dose/ha:</label>
                      <Input
                        type="number"
                        value={dose}
                        step={0.05}
                        min={product.minDose}
                        max={product.maxDose}
                        onChange={e => { e.stopPropagation(); updateDose(product.id, Number(e.target.value)); }}
                        onClick={e => e.stopPropagation()}
                        className="h-7 bg-muted border-border font-mono text-xs text-foreground"
                      />
                    </div>
                    {selection && (
                      <div className="grid grid-cols-3 gap-1 text-xs">
                        <div className="bg-muted/50 rounded p-1.5 text-center">
                          <div className="text-muted-foreground">Volume</div>
                          <div className="font-mono font-medium text-foreground">{selection.roundedQuantity.toFixed(0)} {product.unitType}</div>
                        </div>
                        <div className="bg-muted/50 rounded p-1.5 text-center">
                          <div className="text-muted-foreground">Caixas</div>
                          <div className="font-mono font-medium text-foreground">{selection.boxes}</div>
                        </div>
                        <div className="bg-muted/50 rounded p-1.5 text-center">
                          <div className="text-muted-foreground">Pallets</div>
                          <div className="font-mono font-medium text-foreground">{selection.pallets}</div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      {selections.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5 glow-border">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" /> Resumo da Simulação
          </h2>

          {/* Product line items */}
          <div className="space-y-1 mb-4">
            {pricingResults.map(pr => {
              const prod = mockProducts.find(p => p.id === pr.productId)!;
              return (
                <div key={pr.productId} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50">
                  <span className="text-foreground">{prod.name}</span>
                  <div className="flex items-center gap-6 font-mono text-xs">
                    <span className="text-muted-foreground">{pr.quantity.toFixed(0)} {prod.unitType}</span>
                    <span className="text-muted-foreground">{formatCurrency(pr.normalizedPrice)}/{prod.unitType}</span>
                    <span className="text-foreground font-medium w-28 text-right">{formatCurrency(pr.subtotal)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Gross to Net */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border">
            <div>
              <div className="stat-label">Receita Bruta</div>
              <div className="font-mono font-bold text-foreground">{formatCurrency(grossToNet.grossRevenue)}</div>
            </div>
            <div>
              <div className="stat-label">Desconto Combo</div>
              <div className="font-mono font-bold text-warning">-{formatCurrency(grossToNet.comboDiscount)}</div>
            </div>
            <div>
              <div className="stat-label">Receita Financeira</div>
              <div className="font-mono font-bold text-info">{formatCurrency(grossToNet.financialRevenue)}</div>
            </div>
            <div>
              <div className="stat-label">Total a Pagar (Prazo)</div>
              <div className="font-mono font-bold text-xl text-success">{formatCurrency(grossToNet.netRevenue)}</div>
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <Button
              onClick={() => navigate('/paridade', { state: { amount: grossToNet.netRevenue, grossAmount: grossToNet.grossRevenue } })}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Wheat className="w-4 h-4 mr-2" /> Calcular Paridade Barter →
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
