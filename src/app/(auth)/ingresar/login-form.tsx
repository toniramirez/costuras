'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { createClient } from '@/lib/supabase/client';
import { mapAuthError } from '@/lib/auth-errors';

const esquema = z.object({
  email: z.string().min(1, 'Ingresá tu correo').email('El correo no parece válido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
});

type Datos = z.infer<typeof esquema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Datos>({ resolver: zodResolver(esquema) });

  async function onSubmit(datos: Datos) {
    setErrorGeneral(null);
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email: datos.email.trim(),
      password: datos.password,
    });

    if (error) {
      setErrorGeneral(mapAuthError(error.message));
      return;
    }

    // La raíz decide el destino según el rol; si venía de una ruta protegida,
    // lo devolvemos ahí.
    const destino = searchParams.get('redirect') ?? '/';
    router.push(destino);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="rounded-card border border-line bg-surface/80 p-5 shadow-flotante backdrop-blur-sm"
    >
      <h2 className="mb-1 text-lg font-semibold text-ink">Iniciar sesión</h2>
      <p className="mb-5 text-sm text-muted">Ingresá con el correo que te dio la academia.</p>

      {errorGeneral && (
        <div
          role="alert"
          className="animate-surgir mb-4 flex items-start gap-2 rounded-xl border-l-2 border-danger/40 bg-danger-soft px-3 py-2.5 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{errorGeneral}</span>
        </div>
      )}

      <div className="space-y-4">
        <Input
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoFocus
          placeholder="nombre@correo.com"
          required
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          error={errors.password?.message}
          {...register('password')}
        />
      </div>

      <Button type="submit" size="lg" fullWidth loading={isSubmitting} className="mt-6">
        Ingresar
      </Button>

      {/* No hay «te mandamos un mail»: el envío de correos no está enganchado y
          prometerlo sería dejar al alumno esperando algo que no llega. La
          academia le genera una contraseña nueva desde su ficha, en el acto. */}
      <p className="mt-4 text-center text-sm text-muted">
        ¿Olvidaste tu contraseña? Pedile una nueva a la academia.
      </p>
    </form>
  );
}
