import { LegalBody, type LegalSection } from "@/components/LegalPage";

export const PRIVACY_TITLE = "Política de privacidad";

const SECTIONS: LegalSection[] = [
    {
      title: "Qué datos guardamos",
      body: [
        "Al registrarte guardamos tu nombre, apellido, fecha de nacimiento, @usuario, correo, contraseña (cifrada) y zona horaria. Mientras usas la app guardamos tus hábitos, tus registros diarios, tus fotos de prueba, tus retos, las deudas anotadas y tus notificaciones.",
        "Si activas los avisos, guardamos el dato técnico que tu navegador entrega para enviártelos.",
      ],
    },
    {
      title: "Para qué usamos tu fecha de nacimiento",
      body: [
        "La usamos solo para comprobar que tienes 18 años o más. No la mostramos a otras personas.",
      ],
    },
    {
      title: "Quién ve qué",
      body: [
        "Cada hábito tiene una visibilidad: Solo yo, Amigos o Público.",
        "Solo yo: nadie más ve el hábito ni sus fotos. Amigos: tus amigos ven tu racha y tus fotos. Público: tu racha aparece en tu perfil público.",
        "Las fotos nunca son públicas. Fuera de un grupo, solo las ven tus amigos, y solo las de hábitos que no sean Solo yo. En un reto, la otra persona ve las fotos del hábito del reto.",
        "Tus retos y deudas los ven las personas que participan en ellos.",
      ],
    },
    {
      title: "Grupos",
      body: [
        "Los miembros de un grupo al que te unes ven tu nombre, tu @usuario y tu avatar, y los registros y las fotos del único hábito que vinculas a ese grupo. No ven tus otros hábitos ni ningún otro dato tuyo. Pueden ser personas que no son tus amigos.",
        "Lo ven desde el día en que te unes: lo anterior a ese día sigue siendo privado, aunque vincules un hábito que ya tenías. Al salir del grupo, o si te sacan, los demás dejan de ver tus registros y fotos de inmediato. Tu nombre y tu resultado en las semanas que ya se cerraron quedan en el historial del grupo.",
        "Quienes administran un grupo pueden rechazar una foto de un miembro: el motivo lo ven esas personas y quien subió la foto.",
        "Los grupos son solo por invitación: solo se entra con un enlace de invitación y no aparecen en ninguna lista ni en la búsqueda.",
      ],
    },
    {
      title: "Perfil público",
      body: [
        "Tu perfil público, la página con tu @usuario, muestra tu nombre, tu @usuario y la racha de tus hábitos públicos. También muestra tu avatar: tu foto de perfil si subiste una o, si no, el gatito que elegiste. Las fotos de prueba de tus hábitos nunca se muestran. Tampoco se muestran tu fecha de nacimiento ni tu correo.",
        "Para retirar un hábito del perfil público, cambia su visibilidad a Amigos o Solo yo desde su detalle. Si no tienes hábitos públicos, tu perfil queda sin contenido.",
        "Otras personas con cuenta pueden encontrar tu nombre, tu @usuario y tu avatar en las sugerencias y en Explorar, a menos que lo desactives en Ajustes.",
      ],
    },
    {
      title: "Datos sensibles: peso y altura",
      body: [
        "Si registras tu peso o tu altura, se guardan solo para ti. No tienen opción de visibilidad: nadie más puede verlos, ni tus amigos, ni en tu perfil público, ni en el resumen de actividad, ni en las notificaciones. Tu peso y tu altura se eliminan al borrar tu cuenta.",
      ],
    },
    {
      title: "Dónde se guardan las fotos",
      body: [
        "Las fotos se guardan en un almacenamiento privado. Se comprimen y se les quitan los datos de ubicación y de cámara antes de guardarlas. Quien tiene permiso para verlas accede con un enlace temporal de unos cinco minutos.",
      ],
    },
    {
      title: "Cookies y almacenamiento del dispositivo",
      body: [
        "Usamos una cookie de sesión para mantenerte con la sesión iniciada y una cookie llamada theme que recuerda el tema que elegiste (claro, oscuro o el del sistema). Ninguna se usa para publicidad ni seguimiento.",
        "Si instalas Kizuna como app, tu dispositivo guarda una copia de archivos estáticos (íconos, estilos y código) para que abra más rápido. No guarda tus datos ni tus fotos.",
        "Si activas los avisos, tu navegador guarda una suscripción de avisos y nosotros guardamos su dato técnico. Para quitarla, desactiva los permisos de notificaciones de Kizuna en el navegador o en los ajustes de tu dispositivo; también se borra al eliminar tu cuenta.",
      ],
    },
    {
      title: "Contraseña",
      body: [
        "Puedes restablecer tu contraseña desde Iniciar sesión. Te enviamos un enlace al correo de la cuenta.",
      ],
    },
    {
      title: "Cómo borrar tu cuenta",
      body: [
        "Puedes borrar tu cuenta desde Perfil > Ajustes. Se borran tus fotos y tus datos personales. Tus amigos conservan el historial de deudas de los retos compartidos, que aparece como \"cuenta eliminada\".",
      ],
    },
    {
      title: "Tus derechos y la Ley 21.719",
      body: [
        "Esta política busca alinearse con la Ley 21.719, sobre protección de datos personales en Chile. Tienes derecho a saber qué datos tenemos sobre ti, a corregirlos y a pedir que los borremos. El texto definitivo está pendiente de revisión legal.",
        "Contacto para ejercer tus derechos: [correo de contacto por definir].",
      ],
    },
  ];

/** Legal text without page chrome: shared by /legal/privacidad and the in-app sheet. */
export function PrivacyContent() {
  return <LegalBody updated="25 de noviembre de 2026" sections={SECTIONS} />;
}
