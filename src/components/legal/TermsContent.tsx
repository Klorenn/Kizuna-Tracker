import { LegalBody, type LegalSection } from "@/components/LegalPage";

export const TERMS_TITLE = "Términos de uso";

const SECTIONS: LegalSection[] = [
    {
      title: "Qué es Kizuna",
      body: [
        "Kizuna es una app para llevar rachas de hábitos y proponer retos entre amigos. Al crear una cuenta aceptas estos términos y la política de privacidad.",
      ],
    },
    {
      title: "Quién puede usarla",
      body: [
        "Kizuna es solo para personas mayores de 18 años. Te pedimos tu fecha de nacimiento al registrarte para comprobarlo. Si no cumples la edad mínima, no puedes crear una cuenta.",
      ],
    },
    {
      title: "Retos, multas y deudas",
      body: [
        "Un reto es un acuerdo entre tú y un amigo. La multa y su monto los fijan ustedes. Kizuna solo anota quién debe a quién; es un registro de cuentas entre amigos.",
        "Kizuna no es parte de las deudas. No garantiza que se paguen ni se cobren, no procesa pagos, no recibe ni guarda dinero, y no intermedia entre las personas. Si hay una deuda, se paga fuera de la app, de común acuerdo.",
        "Marcar una deuda como pagada es solo una anotación. Cualquier desacuerdo debes resolverlo directamente con tu amigo.",
      ],
    },
    {
      title: "Fotos de prueba",
      body: [
        "Algunos hábitos y retos piden una foto tomada en el momento. Debes subir solo fotos tuyas, de tu hábito, y que no muestren a otras personas sin su permiso.",
        "Tus amigos pueden rechazar una foto durante las 24 horas siguientes si no corresponde al hábito. Pasado ese plazo, la foto queda aprobada.",
      ],
    },
    {
      title: "Tu cuenta",
      body: [
        "Eres responsable de tu contraseña y de lo que ocurra con tu cuenta. En esta versión no hay recuperación de contraseña: si la pierdes, no podremos restablecerla.",
        "Puedes borrar tu cuenta cuando quieras desde Perfil > Ajustes. Puedes cerrar tu sesión en el mismo lugar.",
      ],
    },
    {
      title: "Uso adecuado",
      body: [
        "No uses Kizuna para acosar, engañar a otras personas o subir contenido ilegal. Podemos suspender cuentas que incumplan estas reglas.",
      ],
    },
    {
      title: "Cambios y contacto",
      body: [
        "Podemos actualizar estos términos. Si el cambio es importante, te avisaremos en la app.",
        "Contacto: [correo de contacto por definir].",
      ],
    },
  ];

/** Legal text without page chrome: shared by /legal/terminos and the in-app sheet. */
export function TermsContent() {
  return <LegalBody updated="22 de noviembre de 2026" sections={SECTIONS} />;
}
