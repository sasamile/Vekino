import { View, Text } from "react-native";
import Svg, { Rect, Line } from "react-native-svg";
import { C } from "@/lib/theme";
import { useCondominio } from "@/context/condominio-context";

export interface BarDatum {
  periodo: string;
  value: number;
}

const SHORT_MONTHS = [
  "",
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

function shortPeriodo(periodo: string): string {
  const m = Number(periodo.split("-")[1] ?? 1);
  return SHORT_MONTHS[m] ?? periodo;
}

/** Hex #RRGGBB → rgba con alpha. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Barras de recaudo — color del tema; el período actual más intenso. */
export function MiniBarChart({
  data,
  height = 140,
  color,
}: {
  data: BarDatum[];
  height?: number;
  color?: string;
}) {
  const { theme } = useCondominio();
  const accent = color ?? theme.accent ?? C.brand;

  const rows = data.slice(-6);
  if (rows.length === 0) {
    return (
      <View style={{ height, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: C.textMuted, fontSize: 13 }}>Sin datos suficientes</Text>
      </View>
    );
  }

  const W = 320;
  const H = height;
  const padBottom = 22;
  const chartH = H - padBottom;
  const max = Math.max(...rows.map((d) => d.value), 1);
  const gap = 10;
  const barW = (W - gap * (rows.length - 1)) / rows.length;

  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <Line x1={0} y1={chartH} x2={W} y2={chartH} stroke={C.border} strokeWidth={1} />
        {rows.map((d, i) => {
          const h = Math.max((d.value / max) * (chartH - 8), d.value > 0 ? 4 : 2);
          const x = i * (barW + gap);
          const y = chartH - h;
          const isLast = i === rows.length - 1;
          const fill = isLast ? accent : withAlpha(accent, 0.38);
          return (
            <Rect
              key={d.periodo}
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={5}
              fill={fill}
            />
          );
        })}
      </Svg>
      <View style={{ flexDirection: "row", marginTop: -14 }}>
        {rows.map((d, i) => (
          <Text
            key={d.periodo}
            style={{
              flex: 1,
              textAlign: "center",
              color: i === rows.length - 1 ? accent : C.textMuted,
              fontSize: 11,
              fontWeight: i === rows.length - 1 ? "600" : "500",
            }}
            numberOfLines={1}
          >
            {shortPeriodo(d.periodo)}
          </Text>
        ))}
      </View>
    </View>
  );
}
