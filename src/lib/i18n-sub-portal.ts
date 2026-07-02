// Lightweight i18n for the sub portal — English + Spanish only.
// No framework dependency; just a string map keyed by label.

export type SubPortalLang = "en" | "es";

const strings: Record<string, Record<SubPortalLang, string>> = {
  your_portal: { en: "Your portal", es: "Tu portal" },
  from_builder: { en: "from", es: "de" },
  schedule: { en: "Schedule", es: "Horario" },
  payments: { en: "Payments", es: "Pagos" },
  documents: { en: "Documents", es: "Documentos" },
  schedule_not_available: { en: "Schedule not available", es: "Horario no disponible" },
  link_expired: {
    en: "This link may have expired. Reach out to your builder for an updated one.",
    es: "Este enlace puede haber expirado. Comuníquese con su constructor para obtener uno actualizado.",
  },
  upcoming: { en: "Upcoming", es: "Próximos" },
  completed: { en: "Completed", es: "Completado" },
  no_upcoming: { en: "No upcoming phases assigned to you.", es: "No hay fases próximas asignadas a usted." },
  confirm: { en: "Confirm", es: "Confirmar" },
  confirmed: { en: "You confirmed this phase", es: "Confirmaste esta fase" },
  flag_conflict: { en: "Flag a conflict", es: "Señalar conflicto" },
  conflict_flagged: { en: "You flagged a conflict", es: "Señalaste un conflicto" },
  conflict_reason: { en: "Reason (optional)", es: "Razón (opcional)" },
  submit: { en: "Submit", es: "Enviar" },
  cancel: { en: "Cancel", es: "Cancelar" },
  total_paid: { en: "Total paid", es: "Total pagado" },
  total_awarded: { en: "Total awarded", es: "Total adjudicado" },
  outstanding: { en: "Outstanding", es: "Pendiente" },
  no_payments: { en: "No payments recorded yet.", es: "Aún no se han registrado pagos." },
  no_documents: { en: "No documents yet.", es: "Aún no hay documentos." },
  updated: { en: "Updated", es: "Actualizado" },
  questions: { en: "Questions? Contact", es: "¿Preguntas? Contacte a" },
  date: { en: "Date", es: "Fecha" },
  amount: { en: "Amount", es: "Monto" },
  method: { en: "Method", es: "Método" },
  project: { en: "Project", es: "Proyecto" },
  scope: { en: "Scope", es: "Alcance" },
  bid: { en: "Bid", es: "Oferta" },
  enable_notifications: { en: "Enable notifications", es: "Activar notificaciones" },
  notifications_desc: {
    en: "Get notified about schedule changes and updates.",
    es: "Recibe notificaciones sobre cambios y actualizaciones del horario.",
  },
};

export function t(key: string, lang: SubPortalLang): string {
  return strings[key]?.[lang] ?? strings[key]?.en ?? key;
}
