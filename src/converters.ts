export function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function kmhToKnots(speed: number): number {
  return speed / 1.852;
}

export function draughtToMeters(raw: number): number {
  return raw / 10;
}

export function celsiusToKelvin(celsius: number): number {
  return celsius + 273.15;
}

export function estimateDataSizeKb(json: string, vesselCount: number): string {
  const encoded = encodeURIComponent(json);
  const multiByteChars = encoded.match(/%[89ABab]/g);
  const byteLength = json.length + (multiByteChars ? multiByteChars.length : 0);
  return ((byteLength / 1024) + (vesselCount * 0.2)).toFixed(1);
}
