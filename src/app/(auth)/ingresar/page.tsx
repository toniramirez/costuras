import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Iniciar sesión' };

export default function IngresarPage() {
  return (
    <Suspense
      fallback={<div className="h-80 animate-pulse rounded-card border border-line bg-surface" />}
    >
      <LoginForm />
    </Suspense>
  );
}
