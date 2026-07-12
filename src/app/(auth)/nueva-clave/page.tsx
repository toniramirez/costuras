'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { createClient } from '@/lib/supabase/client';
import { mapAuthError } from '@/lib/auth-errors';

/**
 * Sirve para dos escenarios:
 *   1. El alumno llegó desde el enlace de "olvidé mi contraseña".
 *   2. Primer ingreso con contraseña temporal (must_change_password = true):
 *      los layouts de /admin y /alumno lo traen acá hasta que la cambie.
 */
const esquema = z
  .object({
    password: z
      .string()
      .min(8, 'Usá al menos 8 caracteres')
      .regex(/[a-zA-Z]/, 'Incluí al menos una letra')
      .regex(/[0-9]/, 'Incluí al menos un número'),
    confirmacion: z.string().min(1, 'Repetí la contraseña'),
  })
  .refine((d) => d.password === d.confirmacion, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmacion'],
  });

type Datos = z.infer<typeof esquema>;

export default function NuevaClavePage() {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Datos>({ resolver: zodResolver(esquema) });

  async function onSubmit(datos: Datos) {
    setErrorGeneral(null);
    const supabase = createClient();

    const { data, error } = await supabase.auth.updateUser({ password: datos.password });

    if (error) {
      setErrorGeneral(mapAuthError(error.message));
      return;
    }

    // Ya cambió la contraseña temporal: dejamos de forzar el cambio.
    if (data.user) {
      await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', data.user.id);
    }

    toast.success('Tu contraseña se actualizó correctamente.');
    router.push('/');
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="rounded-card border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(43,37,34,0.04)]"
    >
      <h2 className="mb-1 text-lg font-semibold text-ink">Crear contraseña nueva</h2>
      <p className="mb-5 text-sm text-muted">
        Elegí una contraseña que solo vos conozcas. Mínimo 8 caracteres, con letras y números.
      </p>

      {errorGeneral && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{errorGeneral}</span>
        </div>
      )}

      <div className="space-y-4">
        <Input
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          autoFocus
          required
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Repetir contraseña"
          type="password"
          autoComplete="new-password"
          required
          error={errors.confirmacion?.message}
          {...register('confirmacion')}
        />
      </div>

      <Button type="submit" size="lg" fullWidth loading={isSubmitting} className="mt-6">
        Guardar contraseña
      </Button>
    </form>
  );
}
