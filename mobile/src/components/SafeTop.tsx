import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";

/**
 * The app frame: everything between the status bar and the gesture bar. Android draws edge to edge, so without this every screen (the
 * notification banner, Hoy's title, the login) sits under the clock and the battery. The color is the theme's background,
 * so the bar area matches the screen in light and dark.
 */
export function SafeTop({ children, testID }: { children: ReactNode; testID?: string }) {
  const { colors } = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  return (
    <View testID={testID} style={{ flex: 1, paddingTop: top, paddingBottom: bottom, backgroundColor: colors.bg }}>
      {children}
    </View>
  );
}
