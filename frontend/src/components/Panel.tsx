import type { ReactNode } from 'react';

interface PanelProps {
  children: ReactNode;
  className?: string;
}

export function Panel({ children, className = '' }: PanelProps) {
  return (
    <div className={['panel-frame rounded-2xl', className].join(' ')}>
      {children}
    </div>
  );
}
