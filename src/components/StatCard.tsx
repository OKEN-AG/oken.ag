import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
}

export default function StatCard({ label, value, subtitle, icon, trend, trendValue, className = '' }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card p-5 ${className}`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="stat-label">{label}</span>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>
      <div className="stat-value text-foreground">{value}</div>
      {(subtitle || trendValue) && (
        <div className="flex items-center gap-2 mt-1">
          {trendValue && (
            <span className={`text-xs font-mono font-medium ${
              trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground'
            }`}>
              {trend === 'up' ? '▲' : trend === 'down' ? '▼' : '●'} {trendValue}
            </span>
          )}
          {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        </div>
      )}
    </motion.div>
  );
}
