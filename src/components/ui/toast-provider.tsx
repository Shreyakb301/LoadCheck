'use client';

import { ToastProvider as Toast } from '@/components/ui/toast';

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <Toast>
      {children}
    </Toast>
  );
}
