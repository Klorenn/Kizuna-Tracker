import {
  Barbell,
  Bell,
  Book,
  BookOpen,
  CalendarBlank,
  Camera,
  ChartBar,
  Check,
  Clock,
  Drop,
  Flag,
  Flame,
  ForkKnife,
  Gear,
  GlobeSimple,
  House,
  Image as ImageIcon,
  Lock,
  Moon,
  PencilSimple,
  Receipt,
  SneakerMove,
  Target,
  Trophy,
  Users,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { IconKey, Visibility } from "@/domain/presets";

const ICONS: Record<IconKey, Icon> = {
  barbell: Barbell,
  drop: Drop,
  "book-open": BookOpen,
  book: Book,
  "sneaker-move": SneakerMove,
  moon: Moon,
  "fork-knife": ForkKnife,
  flame: Flame,
  target: Target,
  clock: Clock,
  "calendar-blank": CalendarBlank,
  bell: Bell,
  camera: Camera,
  "pencil-simple": PencilSimple,
  gear: Gear,
  trophy: Trophy,
  "chart-bar": ChartBar,
  house: House,
  users: Users,
  "globe-simple": GlobeSimple,
  image: ImageIcon,
  receipt: Receipt,
  flag: Flag,
  check: Check,
};

export const ICON_LABEL: Record<IconKey, string> = {
  barbell: "Pesas",
  drop: "Gota",
  "book-open": "Libro abierto",
  book: "Libro",
  "sneaker-move": "Zapatilla",
  moon: "Luna",
  "fork-knife": "Cubiertos",
  flame: "Llama",
  target: "Objetivo",
  clock: "Reloj",
  "calendar-blank": "Calendario",
  bell: "Campana",
  camera: "Cámara",
  "pencil-simple": "Lápiz",
  gear: "Engranaje",
  trophy: "Trofeo",
  "chart-bar": "Gráfico",
  house: "Casa",
  users: "Personas",
  "globe-simple": "Globo",
  image: "Imagen",
  receipt: "Recibo",
  flag: "Bandera",
  check: "Check",
};

export function HabitIcon({ name, size = 20 }: { name: IconKey; size?: number }) {
  const C = ICONS[name] ?? Target;
  return <C size={size} weight="light" aria-hidden />;
}

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  private: "Solo yo",
  friends: "Amigos",
  public: "Público",
};

/** 14 px: lock = solo yo, users = amigos, globe = público. */
export function VisibilityIcon({ value, size = 14 }: { value: Visibility; size?: number }) {
  const C = value === "private" ? Lock : value === "public" ? GlobeSimple : Users;
  return <C size={size} weight="light" aria-label={VISIBILITY_LABEL[value]} role="img" />;
}
