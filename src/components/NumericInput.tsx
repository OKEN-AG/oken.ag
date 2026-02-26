import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { parsePtBrNumber, formatPtBrNumber } from '@/lib/ptbr';
import { cn } from '@/lib/utils';

interface NumericInputProps {
  value: number;
  onChange: (value: number) => void;
  /** Decimal places for display formatting (default 2) */
  decimals?: number;
  /** Optional prefix shown before value */
  prefix?: string;
  placeholder?: string;
  className?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
}

/**
 * A locale-aware numeric input that accepts comma as decimal separator.
 * Displays formatted pt-BR number, allows free-form typing, and emits
 * parsed number on blur or Enter.
 */
export function NumericInput({
  value,
  onChange,
  decimals = 2,
  prefix,
  placeholder = '0,00',
  className,
  min,
  max,
  disabled,
}: NumericInputProps) {
  const [text, setText] = useState(() => formatPtBrNumber(value, decimals));
  const [focused, setFocused] = useState(false);

  // Sync external value changes when not focused
  useEffect(() => {
    if (!focused) {
      setText(formatPtBrNumber(value, decimals));
    }
  }, [value, decimals, focused]);

  const commit = useCallback((raw: string) => {
    let parsed = parsePtBrNumber(raw);
    if (min !== undefined) parsed = Math.max(min, parsed);
    if (max !== undefined) parsed = Math.min(max, parsed);
    onChange(parsed);
    setText(formatPtBrNumber(parsed, decimals));
  }, [onChange, min, max, decimals]);

  return (
    <div className="relative flex items-center">
      {prefix && <span className="absolute left-2 text-xs text-muted-foreground pointer-events-none">{prefix}</span>}
      <Input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        className={cn('font-mono', prefix ? 'pl-8' : '', className)}
        onChange={e => {
          // Allow digits, comma, dot, minus
          const v = e.target.value.replace(/[^\d,.\-]/g, '');
          setText(v);
        }}
        onFocus={() => setFocused(true)}
        onBlur={e => {
          setFocused(false);
          commit(e.target.value);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            commit((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}
