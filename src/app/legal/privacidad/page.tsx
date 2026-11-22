import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Política de privacidad", robots: { index: false, follow: false } };

export default function PrivacidadPage() {
  return (
    <LegalPage
      title="Política de privacidad"
      updated="22 de noviembre de 2026"
      other={{ href: "/legal/terminos", label: "Ver los términos de uso" }}
      sections={[
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
            "Las fotos nunca son públicas. Solo las ven tus amigos, y solo las de hábitos que no sean Solo yo. En un reto, la otra persona ve las fotos del hábito del reto.",
            "Tus retos y deudas los ven las personas que participan en ellos.",
          ],
        },
        {
          title: "Perfil público",
          body: [
            "Tu perfil público, la página con tu @usuario, muestra tu nombre, tu @usuario y la racha de tus hábitos públicos. Nunca muestra fotos, fecha de nacimiento ni correo.",
            "Para retirar un hábito del perfil público, cambia su visibilidad a Amigos o Solo yo desde su detalle. Si no tienes hábitos públicos, tu perfil queda sin contenido.",
          ],
        },
        {
          title: "Dónde se guardan las fotos",
          body: [
            "Las fotos se guardan en un almacenamiento privado. Se comprimen y se les quitan los datos de ubicación y de cámara antes de guardarlas. Quien tiene permiso para verlas accede con un enlace temporal de unos cinco minutos.",
          ],
        },
        {
          title: "Contraseña",
          body: [
            "En esta versión no hay recuperación de contraseña. Guárdala en un lugar seguro.",
          ],
        },
        {
          title: "Cómo borrar tu cuenta",
          body: [
            "Puedes borrar tu cuenta desde Perfil. Se borran tus fotos y tus datos personales. Tus amigos conservan el historial de deudas de los retos compartidos, que aparece como \"cuenta eliminada\".",
          ],
        },
        {
          title: "Tus derechos y la Ley 21.719",
          body: [
            "Esta política busca alinearse con la Ley 21.719, sobre protección de datos personales en Chile. Tienes derecho a saber qué datos tenemos sobre ti, a corregirlos y a pedir que los borremos. El texto definitivo está pendiente de revisión legal.",
            "Contacto para ejercer tus derechos: [correo de contacto por definir].",
          ],
        },
      ]}
    />
  );
}
