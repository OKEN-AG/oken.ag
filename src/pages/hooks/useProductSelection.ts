import { useState, useMemo, useCallback } from 'react';
import { getSuggestedDoseForRef } from '@/engines/combo-cascade';
import type { Product } from '@/types/barter';

export interface ProductGroup {
  ref: string;
  variants: Product[];
  defaultDose: number;
  minDose: number;
  maxDose: number;
  category: string;
  unitType: string;
  pricePerUnit: number;
}

export function useProductSelection(products: Product[], combos: any[], clearSimResult?: () => void) {
  const [selectedProducts, setSelectedProducts] = useState<Map<string, number>>(new Map());
  const [freeQuantities, setFreeQuantities] = useState<Map<string, number>>(new Map());
  const [packagingSplits, setPackagingSplits] = useState<Map<string, { productId: string; qty: number }[]>>(new Map());
  const [quantityMode, setQuantityMode] = useState<'dose' | 'livre'>('dose');

  const productGroups = useMemo<ProductGroup[]>(() => {
    const groups = new Map<string, ProductGroup>();
    for (const p of products) {
      const ref = (p.ref || p.name).toUpperCase().trim();
      if (!groups.has(ref)) {
        groups.set(ref, { ref, variants: [], defaultDose: p.dosePerHectare, minDose: p.minDose, maxDose: p.maxDose, category: p.category, unitType: p.unitType, pricePerUnit: p.pricePerUnit });
      }
      groups.get(ref)!.variants.push(p);
    }
    for (const g of groups.values()) {
      g.variants.sort((a, b) => {
        const aMax = Math.max(...(a.packageSizes?.length ? a.packageSizes : [1]));
        const bMax = Math.max(...(b.packageSizes?.length ? b.packageSizes : [1]));
        return bMax - aMax;
      });
    }
    return Array.from(groups.values());
  }, [products]);

  const getRefForProduct = useCallback((productId: string): string => {
    const p = products.find(pr => pr.id === productId);
    return (p?.ref || p?.name || '').toUpperCase().trim();
  }, [products]);

  const getPackageLabel = useCallback((p: Product) => {
    const sizes = p.packageSizes?.length ? p.packageSizes : [];
    const maxSize = sizes.length ? Math.max(...sizes) : 0;
    return maxSize > 0 ? `${maxSize}${p.unitType} (${p.unitsPerBox}×${maxSize}${p.unitType})` : p.name;
  }, []);

  const isPerAreaProduct = useCallback((product: Product) => (product.pricingBasis || 'por_hectare') === 'por_hectare', []);

  const toggleProduct = useCallback((productId: string, suggestedDose?: number) => {
    const ref = getRefForProduct(productId);
    const group = productGroups.find(g => g.ref === ref);
    if (group) {
      const selectedVariants = group.variants.filter(v => selectedProducts.has(v.id));
      if (selectedVariants.length > 0) {
        const next = new Map(selectedProducts);
        const nextFree = new Map(freeQuantities);
        for (const v of group.variants) { next.delete(v.id); nextFree.delete(v.id); }
        setSelectedProducts(next);
        setFreeQuantities(nextFree);
        const nextSplits = new Map(packagingSplits);
        nextSplits.delete(ref);
        setPackagingSplits(nextSplits);
        return;
      }
    }
    const next = new Map(selectedProducts);
    const prod = products.find(p => p.id === productId)!;
    const dose = suggestedDose ?? getSuggestedDoseForRef(combos, prod.ref || '') ?? prod.dosePerHectare;
    next.set(productId, dose);
    setSelectedProducts(next);
  }, [products, productGroups, selectedProducts, freeQuantities, packagingSplits, combos, getRefForProduct]);

  const clearOrder = useCallback(() => {
    setSelectedProducts(new Map());
    setFreeQuantities(new Map());
    setPackagingSplits(new Map());
    clearSimResult?.();
  }, [clearSimResult]);

  const updateDose = useCallback((productId: string, dose: number) => {
    setSelectedProducts(prev => { const next = new Map(prev); next.set(productId, dose); return next; });
  }, []);

  const updateDoseForRef = useCallback((ref: string, dose: number) => {
    const group = productGroups.find(g => g.ref === ref);
    if (!group) return;
    setSelectedProducts(prev => {
      const next = new Map(prev);
      for (const v of group.variants) { if (next.has(v.id)) next.set(v.id, dose); }
      return next;
    });
  }, [productGroups]);

  const updateFreeQuantity = useCallback((productId: string, qty: number) => {
    setFreeQuantities(prev => { const next = new Map(prev); next.set(productId, qty); return next; });
  }, []);

  const addPackagingVariant = useCallback((ref: string, productId: string) => {
    if (selectedProducts.has(productId)) return;
    const group = productGroups.find(g => g.ref === ref);
    if (!group) return;
    const existingVariant = group.variants.find(v => selectedProducts.has(v.id));
    const dose = existingVariant ? (selectedProducts.get(existingVariant.id) || group.defaultDose) : group.defaultDose;
    setSelectedProducts(prev => { const next = new Map(prev); next.set(productId, dose); return next; });
    setFreeQuantities(prev => { const next = new Map(prev); next.set(productId, 0); return next; });
  }, [selectedProducts, productGroups]);

  const removePackagingVariant = useCallback((ref: string, productId: string) => {
    const group = productGroups.find(g => g.ref === ref);
    if (!group) return;
    const selectedVariants = group.variants.filter(v => selectedProducts.has(v.id));
    if (selectedVariants.length <= 1) return;
    setSelectedProducts(prev => { const next = new Map(prev); next.delete(productId); return next; });
    setFreeQuantities(prev => { const next = new Map(prev); next.delete(productId); return next; });
  }, [selectedProducts, productGroups]);

  return {
    selectedProducts, setSelectedProducts,
    freeQuantities, setFreeQuantities,
    packagingSplits, setPackagingSplits,
    quantityMode, setQuantityMode,
    productGroups, getRefForProduct, getPackageLabel, isPerAreaProduct,
    toggleProduct, clearOrder, updateDose, updateDoseForRef, updateFreeQuantity,
    addPackagingVariant, removePackagingVariant,
  };
}
