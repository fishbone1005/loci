import * as Location from 'expo-location';

export type GeoAddress = { latitude: number; longitude: number; address: string };

export function formatAddress(result: Partial<Location.LocationGeocodedAddress>): string {
  const candidates = [result.region, result.city, result.district, result.street, result.name]
    .filter((part): part is string => !!part && part.trim().length > 0)
    .map((part) => part.trim());

  // Korean lot-number addresses often repeat the neighborhood inside `street`
  // (e.g. district "일도이동" + street "일도이동 389-1"). Collapse by
  // substring containment, not just exact-match, and keep whichever variant
  // carries more information.
  const parts: string[] = [];
  for (const candidate of candidates) {
    const containedIndex = parts.findIndex((part) => candidate.includes(part));
    if (containedIndex !== -1) {
      parts[containedIndex] = candidate;
      continue;
    }
    if (parts.some((part) => part.includes(candidate))) continue;
    parts.push(candidate);
  }

  return parts.join(' ').trim();
}

export async function getCurrentAddress(): Promise<GeoAddress | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const [result] = await Location.reverseGeocodeAsync({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    address: result ? formatAddress(result) : '',
  };
}
