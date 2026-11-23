import {
  CAT_ARM_VIEWBOX,
  CAT_BODY_VIEWBOX,
  CAT_MARKS_L_VIEWBOX,
  CAT_MARKS_R_VIEWBOX,
  CatArmLPaths,
  CatArmRPaths,
  CatBodyPaths,
  CatMarksLPaths,
  CatMarksRPaths,
} from "./cat-paths";

/* Figma "Logo/Cat Indigo" (827:2754) frame: 120.4 × 135.45, layers placed as in Figma. */
const W = 120.4;
const H = 135.45;

/**
 * Gato índigo con pesas, estático: cuerpo cat, pesas cat2 (índigo fijo, no sigue el color elegido), directo sobre el fondo.
 * Para el gato animado usa CatLift (GIF del dueño).
 */
export function CatMark({
  className,
  width = 140,
}: {
  className?: string;
  width?: number;
}) {
  return (
    <svg
      className={className}
      width={width}
      height={(width * H) / W}
      viewBox={`0 0 ${W} ${H}`}
      fill="none"
      aria-hidden="true"
      focusable="false"
      overflow="visible"
    >
      <g>
        <svg x={0} y={0} width={106.357} height={133.19} viewBox={CAT_BODY_VIEWBOX} overflow="visible">
          <CatBodyPaths />
        </svg>
        <g>
          <svg x={14.67} y={19.75} width={90.3} height={90.3} viewBox={CAT_ARM_VIEWBOX} overflow="visible">
            <CatArmLPaths />
          </svg>
        </g>
        <g>
          <svg x={40.45} y={19.75} width={90.3} height={90.3} viewBox={CAT_ARM_VIEWBOX} overflow="visible">
            <CatArmRPaths />
          </svg>
        </g>
        <g opacity={0}>
          <svg
            x={W * 0.089}
            y={H * 0.431}
            width={W * (1 - 0.089 - 0.8425)}
            height={H * (1 - 0.431 - 0.4914)}
            viewBox={CAT_MARKS_L_VIEWBOX}
            preserveAspectRatio="none"
            overflow="visible"
          >
            <CatMarksLPaths />
          </svg>
        </g>
        <g opacity={0}>
          <svg
            x={W * 0.8066}
            y={H * 0.1349}
            width={W * (1 + 0.0002 - 0.8066)}
            height={H * (1 - 0.1349 - 0.3411)}
            viewBox={CAT_MARKS_R_VIEWBOX}
            preserveAspectRatio="none"
            overflow="visible"
          >
            <CatMarksRPaths />
          </svg>
        </g>
      </g>
    </svg>
  );
}
