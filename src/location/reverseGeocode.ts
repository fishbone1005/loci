import * as Location from 'expo-location';

export type GeoAddress = { latitude: number; longitude: number; address: string };

export function formatAddress(result: Partial<Location.LocationGeocodedAddress>): string {
  const parts = [result.region, result.city, result.district, result.street, result.name].filter(
    (part): part is string => !!part && part.trim().length > 0
  );
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  return unique.join(' ').trim();
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
