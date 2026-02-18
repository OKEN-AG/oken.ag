import { useLocation } from 'react-router-dom';
import { NavLink } from 'react-router-dom';
import { Settings, ShoppingCart, Wheat, FileText, BarChart3, LayoutDashboard } from 'lucide-react';

const steps = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, step: 0 },
  { path: '/campanha', label: 'Campanha', icon: Settings, step: 1 },
  { path: '/simulacao', label: 'Simulação', icon: ShoppingCart, step: 2 },
  { path: '/paridade', label: 'Paridade', icon: Wheat, step: 3 },
  { path: '/documentos', label: 'Documentos', icon: FileText, step: 4 },
  { path: '/monitoramento', label: 'Monitoramento', icon: BarChart3, step: 5 },
];

export default function JourneyHeader() {
  const location = useLocation();
  const currentStep = steps.findIndex(s => 
    s.path === '/' ? location.pathname === '/' : location.pathname.startsWith(s.path)
  );

  // Don't show on admin pages
  if (location.pathname.startsWith('/admin')) return null;

  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-6 py-2">
      <div className="flex items-center gap-1 overflow-x-auto">
        {steps.map((step, i) => {
          const isActive = i === currentStep;
          const isPast = i < currentStep;
          const Icon = step.icon;
          return (
            <div key={step.path} className="flex items-center">
              <NavLink
                to={step.path}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isPast
                    ? 'bg-success/10 text-success'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {step.label}
              </NavLink>
              {i < steps.length - 1 && (
                <div className={`w-4 h-px mx-0.5 ${isPast ? 'bg-success' : 'bg-border'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
