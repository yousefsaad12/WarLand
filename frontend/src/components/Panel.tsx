import type { ReactNode } from 'react';

interface PanelProps {
  children: ReactNode;
  className?: string;
}

export function Panel({ children, className = '' }: PanelProps) {
  return (
    <div className={['panel-frame rounded-3xl overflow-hidden', className].join(' ')}>
      {children}
    </div>
  );
}
