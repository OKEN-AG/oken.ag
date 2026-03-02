import { useState } from 'react';
import type { ChannelSegment, ContractPriceType } from '@/types/barter';

export function useOrderWizardState(initialCampaignId: string) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedCampaignId, setSelectedCampaignId] = useState(initialCampaignId);

  const [clientName, setClientName] = useState('');
  const [clientDocument, setClientDocument] = useState('');
  const [clientCity, setClientCity] = useState('');
  const [clientCityCode, setClientCityCode] = useState('');
  const [clientState, setClientState] = useState('');
  const [clientType, setClientType] = useState<'PF' | 'PJ'>('PJ');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientIE, setClientIE] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [selectedDistributorId, setSelectedDistributorId] = useState('');
  const [channelSegmentName, setChannelSegmentName] = useState('');
  const [channelMarginPercent, setChannelMarginPercent] = useState(0);
  const [channelAdjustmentPercent, setChannelAdjustmentPercent] = useState(0);
  const [segment, setSegment] = useState<string>('');
  const [channelEnum, setChannelEnum] = useState<ChannelSegment>('distribuidor');
  const [area, setArea] = useState(500);
  const [comboQty, setComboQty] = useState(1);
  const [quantityMode, setQuantityMode] = useState<'dose' | 'livre'>('dose');
  const [freeQuantities, setFreeQuantities] = useState<Map<string, number>>(new Map());
  const [showCampaignPreview, setShowCampaignPreview] = useState(false);
  const [packagingSplits, setPackagingSplits] = useState<Map<string, { productId: string; qty: number }[]>>(new Map());
  const [selectedProducts, setSelectedProducts] = useState<Map<string, number>>(new Map());

  const [dueMonths, setDueMonths] = useState(12);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [selectedCommodity, setSelectedCommodity] = useState('');

  const [port, setPort] = useState('');
  const [freightOrigin, setFreightOrigin] = useState('');
  const [hasContract, setHasContract] = useState(false);
  const [userPrice, setUserPrice] = useState(0);
  const [showInsurance, setShowInsurance] = useState(false);
  const [volatility, setVolatility] = useState(25);
  const [selectedBuyerId, setSelectedBuyerId] = useState('');
  const [counterpartyOther, setCounterpartyOther] = useState('');
  const [contractPriceType, setContractPriceType] = useState<ContractPriceType>('fixo');
  const [performanceIndex, setPerformanceIndex] = useState(100);

  return {
    currentStep, setCurrentStep, selectedCampaignId, setSelectedCampaignId,
    clientName, setClientName, clientDocument, setClientDocument, clientCity, setClientCity,
    clientCityCode, setClientCityCode, clientState, setClientState, clientType, setClientType,
    clientEmail, setClientEmail, clientPhone, setClientPhone, clientIE, setClientIE,
    deliveryAddress, setDeliveryAddress, selectedDistributorId, setSelectedDistributorId,
    channelSegmentName, setChannelSegmentName, channelMarginPercent, setChannelMarginPercent,
    channelAdjustmentPercent, setChannelAdjustmentPercent, segment, setSegment,
    channelEnum, setChannelEnum, area, setArea, comboQty, setComboQty, quantityMode,
    setQuantityMode, freeQuantities, setFreeQuantities, showCampaignPreview,
    setShowCampaignPreview, packagingSplits, setPackagingSplits, selectedProducts,
    setSelectedProducts, dueMonths, setDueMonths, selectedPaymentMethod, setSelectedPaymentMethod,
    selectedCommodity, setSelectedCommodity, port, setPort, freightOrigin, setFreightOrigin,
    hasContract, setHasContract, userPrice, setUserPrice, showInsurance, setShowInsurance,
    volatility, setVolatility, selectedBuyerId, setSelectedBuyerId, counterpartyOther,
    setCounterpartyOther, contractPriceType, setContractPriceType, performanceIndex,
    setPerformanceIndex,
  };
}
