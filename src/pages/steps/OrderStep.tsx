import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/NumericInput';
import { Progress } from '@/components/ui/progress';
import { Plus, Minus, X, Lightbulb } from 'lucide-react';
import type { Product } from '@/types/barter';
import type { ProductGroup } from '@/pages/hooks/useProductSelection';
import type { ComboRecommendation } from '@/pages/hooks/useComboEngine';

export interface OrderStepProps {
  isActive: boolean;
  // Area
  area: number;
  onAreaChange: (v: number) => void;
  comboQty: number;
  onComboQtyChange: (v: number) => void;
  effectiveArea: number;
  // Quantity mode
  quantityMode: 'dose' | 'livre';
  onQuantityModeChange: (mode: 'dose' | 'livre') => void;
  onSwitchToFreeMode: () => void;
  // Product data
  productGroups: ProductGroup[];
  selectedProducts: Map<string, number>;
  freeQuantities: Map<string, number>;
  products: Product[];
  // Combo data
  combos: any[];
  comboActivations: any[];
  maxDiscount: number;
  activatedDiscount: number;
  complementaryDiscount: number;
  discountProgress: number;
  comboRecommendations: ComboRecommendation[];
  // Selection results
  selections: any[];
  simResult: any;
  // Pricing
  formatCurrency: (v: number) => string;
  // Handlers
  toggleProduct: (id: string, dose?: number) => void;
  clearOrder: () => void;
  updateDoseForRef: (ref: string, dose: number) => void;
  updateFreeQuantity: (id: string, qty: number) => void;
  addPackagingVariant: (ref: string, id: string) => void;
  removePackagingVariant: (ref: string, id: string) => void;
  getPackageLabel: (p: Product) => string;
  isPerAreaProduct: (p: Product) => boolean;
  setSelectedProducts: (v: Map<string, number>) => void;
  setFreeQuantities: (v: Map<string, number>) => void;
}

export function OrderStep(props: OrderStepProps) {
  if (!props.isActive) return null;

  const {
    area, onAreaChange, comboQty, onComboQtyChange, effectiveArea,
    quantityMode, onQuantityModeChange, onSwitchToFreeMode,
    productGroups, selectedProducts, freeQuantities, products,
    combos, comboActivations, maxDiscount, activatedDiscount, complementaryDiscount, discountProgress, comboRecommendations,
    selections, simResult, formatCurrency,
    toggleProduct, clearOrder, updateDoseForRef, updateFreeQuantity,
    addPackagingVariant, removePackagingVariant, getPackageLabel, isPerAreaProduct,
    setSelectedProducts, setFreeQuantities,
  } = props;

  return (
    <div className="space-y-4">
      {/* Sticky discount bar + mode toggle */}
      <div className="glass-card p-4 space-y-3 sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-foreground">Modo:</span>
            <div className="flex rounded-md border border-border overflow-hidden">
              <button onClick={() => onQuantityModeChange('dose')} className={`px-3 py-1 text-xs font-medium transition-colors ${quantityMode === 'dose' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>Dose/ha</button>
              <button onClick={onSwitchToFreeMode} className={`px-3 py-1 text-xs font-medium transition-colors ${quantityMode === 'livre' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>Qtd Livre</button>
            </div>
            <div className="flex items-center gap-2 border-l border-border pl-3">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">ha</span>
                <Button size="icon" variant="outline" className="h-6 w-6 rounded" onClick={() => onAreaChange(Math.max(1, area - 50))} disabled={area <= 1}><Minus className="w-3 h-3" /></Button>
                <Input type="number" min={1} value={area} onChange={e => onAreaChange(Math.max(1, Number(e.target.value) || 1))} className="h-6 w-16 text-xs font-mono text-center px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <Button size="icon" variant="outline" className="h-6 w-6 rounded" onClick={() => onAreaChange(area + 50)}><Plus className="w-3 h-3" /></Button>
              </div>
              <span className="text-xs text-muted-foreground font-bold">×</span>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Combos</span>
                <Button size="icon" variant="outline" className="h-6 w-6 rounded" onClick={() => onComboQtyChange(Math.max(1, comboQty - 1))} disabled={comboQty <= 1}><Minus className="w-3 h-3" /></Button>
                <Input type="number" min={1} value={comboQty} onChange={e => onComboQtyChange(Math.max(1, Number(e.target.value) || 1))} className="h-6 w-12 text-xs font-mono text-center px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <Button size="icon" variant="outline" className="h-6 w-6 rounded" onClick={() => onComboQtyChange(comboQty + 1)}><Plus className="w-3 h-3" /></Button>
              </div>
              <span className="text-xs text-muted-foreground font-bold">=</span>
              <span className="text-sm font-mono font-bold text-success">{effectiveArea} ha</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {selectedProducts.size > 0 && (
              <Button size="sm" variant="ghost" onClick={clearOrder} className="text-destructive text-xs h-7 gap-1">
                <X className="w-3 h-3" /> Limpar Pedido
              </Button>
            )}
            {combos.length > 0 && (
              <span className="font-mono text-sm text-success font-bold">{activatedDiscount.toFixed(1)}% / {maxDiscount}%{complementaryDiscount > 0 && <span className="ml-2 text-info">+ {complementaryDiscount.toFixed(1)}%</span>}</span>
            )}
          </div>
        </div>
        {combos.length > 0 && (
          <>
            <Progress value={discountProgress} className="h-2.5 bg-muted" />
            <div className="flex flex-wrap gap-1.5 mt-1">
              {[...comboActivations]
                .sort((a: any, b: any) => b.discountPercent - a.discountPercent)
                .map((ca: any) => {
                  const comboDef = combos.find((c: any) => c.id === ca.comboId);
                  const comboProducts = comboDef?.products || [];
                  const missingRefs = ca.applied ? [] : comboProducts
                    .filter((cp: any) => !selections.some((s: any) => (s.ref || '').toUpperCase().trim() === (cp.ref || '').toUpperCase().trim()))
                    .map((cp: any) => {
                      const prod = products.find(p => (p.ref || '').toUpperCase().trim() === (cp.ref || '').toUpperCase().trim());
                      return prod?.name || cp.ref;
                    });
                  const handleComboClick = () => {
                    if (ca.applied) return;
                    const nextProducts = new Map(selectedProducts);
                    const nextFree = new Map(freeQuantities);
                    for (const cp of comboProducts) {
                      const ref = (cp.ref || '').toUpperCase().trim();
                      const prod = products.find(p => (p.ref || '').toUpperCase().trim() === ref);
                      if (!prod) continue;
                      const minDose = cp.minDosePerHa || prod.minDose || prod.dosePerHectare;
                      if (!nextProducts.has(prod.id)) {
                        nextProducts.set(prod.id, minDose);
                        if (quantityMode === 'livre') nextFree.set(prod.id, Math.ceil(area * minDose));
                      } else {
                        const currentDose = nextProducts.get(prod.id) ?? 0;
                        if (currentDose < minDose) {
                          nextProducts.set(prod.id, minDose);
                          if (quantityMode === 'livre') nextFree.set(prod.id, Math.ceil(area * minDose));
                        }
                      }
                    }
                    setSelectedProducts(nextProducts);
                    setFreeQuantities(nextFree);
                  };
                  return (
                    <button key={ca.comboId} onClick={handleComboClick}
                      title={ca.applied ? 'Ativado' : `Clique para adicionar: ${missingRefs.join(', ')}`}
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                        ca.applied ? 'bg-success/15 text-success border border-success/30 cursor-default'
                          : 'bg-muted text-muted-foreground border border-border hover:bg-primary/10 hover:text-primary hover:border-primary/30 cursor-pointer'
                      }`}>
                      {ca.comboName} ({ca.discountPercent}%){ca.applied ? ' ✓' : ' +'}
                    </button>
                  );
                })}
            </div>
            {comboRecommendations.length > 0 && (
              <div className="space-y-1">
                {comboRecommendations.map((rec, i) => (
                  <button key={i} onClick={() => {
                    if (rec.productId && !selectedProducts.has(rec.productId)) {
                      toggleProduct(rec.productId, rec.suggestedDose);
                      if (quantityMode === 'livre' && rec.suggestedQty) updateFreeQuantity(rec.productId, rec.suggestedQty);
                    }
                  }} className="flex items-center gap-2 text-xs text-info bg-info/10 border border-info/20 rounded-md px-3 py-1.5 w-full text-left hover:bg-info/20 transition-colors cursor-pointer">
                    <Lightbulb className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1">{rec.action}</span>
                    {rec.productId && !selectedProducts.has(rec.productId) && <Plus className="w-3.5 h-3.5 shrink-0 text-success" />}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Product grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {productGroups.map(group => {
          const selectedVariants = group.variants.filter(v => selectedProducts.has(v.id));
          const isSelected = selectedVariants.length > 0;
          const primaryVariant = selectedVariants[0] || group.variants[0];
          const dose = selectedProducts.get(primaryVariant.id) ?? group.defaultDose;
          const simPricing = simResult?.pricingResults?.find((p: any) => group.variants.some(v => v.id === p.productId));
          const displayPrice = simPricing?.normalizedPrice ?? group.pricePerUnit;
          return (
            <div key={group.ref} className={`glass-card p-4 cursor-pointer transition-all ${isSelected ? 'glow-border' : 'hover:border-muted-foreground/30'}`} onClick={() => !isSelected && toggleProduct(group.variants[0].id)}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-foreground">{group.ref}</span>
                {isSelected ? <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); toggleProduct(primaryVariant.id); }} className="text-destructive h-6 w-6 p-0"><Minus className="w-3 h-3" /></Button>
                  : <Button size="sm" variant="ghost" className="text-success h-6 w-6 p-0"><Plus className="w-3 h-3" /></Button>}
              </div>
              <div className="text-xs text-muted-foreground">{group.category} — {formatCurrency(displayPrice)}/{group.unitType}</div>
              {isSelected && (
                <div className="mt-2 pt-2 border-t border-border space-y-2" onClick={e => e.stopPropagation()}>
                  {quantityMode === 'dose' ? (
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-muted-foreground w-24 shrink-0">{isPerAreaProduct(primaryVariant) ? 'Dose/ha:' : 'Quantidade:'}</label>
                      <Button size="icon" variant="outline" className="h-7 w-7 shrink-0" onClick={() => updateDoseForRef(group.ref, Math.max(0, dose - 0.1))}><Minus className="w-3 h-3" /></Button>
                      <NumericInput value={dose} onChange={v => updateDoseForRef(group.ref, v)} decimals={2} className="h-7 bg-muted border-border text-xs text-foreground" />
                      <Button size="icon" variant="outline" className="h-7 w-7 shrink-0" onClick={() => updateDoseForRef(group.ref, dose + 0.1)}><Plus className="w-3 h-3" /></Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-muted-foreground w-16 shrink-0">Qtd ({group.unitType}):</label>
                      <Button size="icon" variant="outline" className="h-7 w-7 shrink-0" onClick={() => updateFreeQuantity(primaryVariant.id, Math.max(0, (freeQuantities.get(primaryVariant.id) || 0) - 1))}><Minus className="w-3 h-3" /></Button>
                      <NumericInput value={freeQuantities.get(primaryVariant.id) || 0} onChange={v => updateFreeQuantity(primaryVariant.id, v)} decimals={0} placeholder="0" className="h-7 bg-muted border-border text-xs text-foreground" />
                      <Button size="icon" variant="outline" className="h-7 w-7 shrink-0" onClick={() => updateFreeQuantity(primaryVariant.id, (freeQuantities.get(primaryVariant.id) || 0) + 1)}><Plus className="w-3 h-3" /></Button>
                    </div>
                  )}
                  {/* Packaging variants */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">Embalagem</span>
                      {group.variants.length > 1 && selectedVariants.length < group.variants.length && (
                        <button className="text-[10px] text-primary hover:underline" onClick={() => {
                          const unselected = group.variants.find(v => !selectedProducts.has(v.id));
                          if (unselected) addPackagingVariant(group.ref, unselected.id);
                        }}>+ Dividir</button>
                      )}
                    </div>
                    {selectedVariants.map(variant => {
                      const sel = selections.find((s: any) => s.productId === variant.id);
                      const selFresh = sel && sel.areaHectares === effectiveArea ? sel : undefined;
                      const totalQty = selFresh?.roundedQuantity ?? (quantityMode === 'livre' ? (freeQuantities.get(variant.id) || 0) : Math.ceil(effectiveArea * dose));
                      return (
                        <div key={variant.id} className="bg-muted/50 rounded p-2 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-foreground">{getPackageLabel(variant)}</span>
                            {selectedVariants.length > 1 && (
                              <button onClick={() => removePackagingVariant(group.ref, variant.id)} className="text-destructive hover:text-destructive/80"><X className="w-3 h-3" /></button>
                            )}
                          </div>
                          {selectedVariants.length > 1 && (
                            <div className="flex items-center gap-1">
                              <label className="text-[10px] text-muted-foreground shrink-0">Qtd ({variant.unitType}):</label>
                              <Button size="icon" variant="outline" className="h-6 w-6 shrink-0" onClick={() => updateFreeQuantity(variant.id, Math.max(0, (freeQuantities.get(variant.id) || totalQty) - 1))}><Minus className="w-2.5 h-2.5" /></Button>
                              <NumericInput value={freeQuantities.get(variant.id) || totalQty} onChange={v => updateFreeQuantity(variant.id, v)} decimals={0} className="h-6 bg-background border-border text-[11px] text-foreground flex-1" />
                              <Button size="icon" variant="outline" className="h-6 w-6 shrink-0" onClick={() => updateFreeQuantity(variant.id, (freeQuantities.get(variant.id) || totalQty) + 1)}><Plus className="w-2.5 h-2.5" /></Button>
                            </div>
                          )}
                          <div className="grid grid-cols-3 gap-1 text-[10px]">
                            <div className="text-center"><span className="text-muted-foreground">Vol</span><div className="font-mono text-foreground">{selFresh?.roundedQuantity?.toFixed(0) ?? totalQty}</div></div>
                            <div className="text-center"><span className="text-muted-foreground">Cx</span><div className="font-mono text-foreground">{selFresh?.boxes ?? 0}</div></div>
                            <div className="text-center"><span className="text-muted-foreground">Plt</span><div className="font-mono text-foreground">{selFresh?.pallets ?? 0}</div></div>
                          </div>
                        </div>
                      );
                    })}
                    {/* Swap packaging (single variant mode) */}
                    {selectedVariants.length === 1 && group.variants.length > 1 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {group.variants.filter(v => !selectedProducts.has(v.id)).map(v => (
                          <button key={v.id} onClick={() => {
                            const next = new Map(selectedProducts);
                            const nextFree = new Map(freeQuantities);
                            const currentId = selectedVariants[0].id;
                            const currentDose = next.get(currentId) || group.defaultDose;
                            const currentQty = nextFree.get(currentId);
                            next.delete(currentId); nextFree.delete(currentId);
                            next.set(v.id, currentDose);
                            if (currentQty !== undefined) nextFree.set(v.id, currentQty);
                            setSelectedProducts(next);
                            setFreeQuantities(nextFree);
                          }} className="text-[10px] px-2 py-0.5 rounded bg-muted border border-border text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                            {getPackageLabel(v)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
