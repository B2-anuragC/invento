import { useEffect, useState } from 'react';
import { Image as NativeImage, Platform, type ImageProps, type ImageURISource } from 'react-native';
import { cachedImageFile, downloadStoredFile } from '@/services/file-storage';

// React Native Web does not forward Image source headers. Fetch protected files
// ourselves and render a browser blob URL; native devices keep a physical cache.
export function StoredImage(props: ImageProps) {
  const source = props.source as ImageURISource;
  const remote = source?.uri && source.headers && /\/files\//.test(source.uri) ? source.uri : undefined;
  const [resolved, setResolved] = useState<{ remote: string; uri: string }>();
  useEffect(() => {
    if (!remote) return;
    let active = true;
    let blobUrl: string | undefined;
    const prepare = async () => {
      const uri = Platform.OS === 'web' ? (blobUrl = URL.createObjectURL(await downloadStoredFile(remote))) : await cachedImageFile(remote);
      if (active) setResolved({ remote, uri }); else if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    void prepare().catch(() => { /* The layout remains stable when offline without a cached image. */ });
    return () => { active = false; if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [remote]);
  return <NativeImage {...props} source={remote ? resolved?.remote === remote ? { uri: resolved.uri } : undefined : props.source} />;
}
