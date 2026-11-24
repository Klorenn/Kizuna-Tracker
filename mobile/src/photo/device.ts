import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { env } from "../lib/env";
import { supabase } from "../lib/supabase";
import type { CaptureDeps } from "./capture";
import { prepareJpeg } from "./compress";
import { uploadPhoto } from "./upload";

/** The real camera, image codec, file system and session behind `takeAndSendPhoto` (no logic of its own: the tests cover the flow). */
export const deviceCapture: CaptureDeps = {
  requestCamera: async () => (await ImagePicker.requestCameraPermissionsAsync()).granted,
  launchCamera: async () => {
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1, exif: false });
    const asset = r.canceled ? null : r.assets[0];
    return asset ? { uri: asset.uri, mimeType: asset.mimeType } : null;
  },
  prepare: (uri, mimeType) =>
    prepareJpeg(
      uri,
      {
        manipulate: (u, o) => ImageManipulator.manipulateAsync(u, [{ resize: { width: o.width } }], { compress: o.quality, format: ImageManipulator.SaveFormat.JPEG }),
        fileSize: async (u) => {
          const info = await FileSystem.getInfoAsync(u);
          return info.exists ? info.size : 0;
        },
      },
      mimeType,
    ),
  getJwt: async () => (await supabase().auth.getSession()).data.session?.access_token ?? null,
  upload: ({ target, jwt, fileUri }) =>
    uploadPhoto({ apiUrl: env().apiUrl, jwt, fileUri, target, multipart: FileSystem.FileSystemUploadType.MULTIPART }, { uploadAsync: (url, uri, options) => FileSystem.uploadAsync(url, uri, options) }),
};
