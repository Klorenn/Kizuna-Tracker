import MaskedView from "@react-native-masked-view/masked-view";
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

/**
 * M0 spike (design #10): does expo-image `tintColor` recolor the animated cat GIF on Android? The web draws the GIF as a
 * luminance mask filled with the accent. `tint` is the first try; `mask` (MaskedView, alpha mask) is the fallback.
 * The on-device result is recorded in task 0.16; flip EXPO_PUBLIC_CAT_STRATEGY=mask if tint renders a flat silhouette
 * or ignores the color. Neither reproduces the web's luminance shading exactly: if the GIF's gray levels matter, the
 * cat needs a pre-baked alpha asset.
 */
export type CatStrategy = "tint" | "mask";

const CAT_GIF = require("../../assets/brand/cat-lift.gif");

export function resolveCatStrategy(pref: string | undefined): CatStrategy {
  return pref?.trim().toLowerCase() === "mask" ? "mask" : "tint";
}

type Props = { accent: string; size?: number; strategy?: CatStrategy; testID?: string };

export function Cat({ accent, size = 120, strategy = resolveCatStrategy(process.env.EXPO_PUBLIC_CAT_STRATEGY), testID = "cat" }: Props) {
  const box = { width: size, height: size };
  if (strategy === "mask") {
    return (
      <MaskedView
        testID={`${testID}-mask`}
        style={box}
        maskElement={<Image testID={`${testID}-image`} source={CAT_GIF} style={box} contentFit="contain" />}
      >
        <View testID={`${testID}-fill`} style={[StyleSheet.absoluteFill, { backgroundColor: accent }]} />
      </MaskedView>
    );
  }
  return <Image testID={`${testID}-image`} source={CAT_GIF} style={box} contentFit="contain" tintColor={accent} />;
}
