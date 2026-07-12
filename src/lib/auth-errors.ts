/**
 * Traduce los errores de Supabase Auth a mensajes claros en español.
 * Nunca revelamos si un correo existe o no: sería un vector de enumeración.
 */
const MENSAJES: Record<string, string> = {
  'Invalid login credentials': 'El correo o la contraseña no son correctos.',
  'Email not confirmed': 'Tu correo todavía no fue confirmado. Revisá tu bandeja.',
  'User not found': 'El correo o la contraseña no son correctos.',
  'New password should be different from the old password.':
    'La nueva contraseña debe ser distinta de la anterior.',
  'Password should be at least 6 characters.':
    'La contraseña debe tener al menos 8 caracteres.',
  // Ya no hay recuperación por correo: la academia genera la contraseña nueva
  // desde la ficha del alumno. Los mensajes tienen que mandar ahí, no a una
  // pantalla que no existe.
  'Auth session missing!':
    'Tu sesión expiró. Volvé a entrar; si no te acordás la contraseña, pedila en la academia.',
  'Token has expired or is invalid':
    'El enlace expiró o ya fue usado. Pedí una contraseña nueva en la academia.',
};

export function mapAuthError(mensaje: string | undefined): string {
  if (!mensaje) return 'Ocurrió un error inesperado. Intentá nuevamente.';
  return MENSAJES[mensaje] ?? 'No pudimos completar la operación. Intentá nuevamente.';
}
