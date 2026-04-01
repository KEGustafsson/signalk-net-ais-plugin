import { describe, it, expect } from 'vitest';
import {
  degreesToRadians,
  kmhToKnots,
  draughtToMeters,
  celsiusToKelvin,
  estimateDataSizeKb,
} from '../src/converters';

describe('degreesToRadians', () => {
  it('converts 0 degrees to 0 radians', () => {
    expect(degreesToRadians(0)).toBe(0);
  });

  it('converts 180 degrees to PI radians', () => {
    expect(degreesToRadians(180)).toBeCloseTo(Math.PI);
  });

  it('converts 360 degrees to 2*PI radians', () => {
    expect(degreesToRadians(360)).toBeCloseTo(2 * Math.PI);
  });

  it('converts 90 degrees to PI/2 radians', () => {
    expect(degreesToRadians(90)).toBeCloseTo(Math.PI / 2);
  });

  it('handles negative degrees', () => {
    expect(degreesToRadians(-90)).toBeCloseTo(-Math.PI / 2);
  });
});

describe('kmhToKnots', () => {
  it('converts 0 km/h to 0 knots', () => {
    expect(kmhToKnots(0)).toBe(0);
  });

  it('converts 1.852 km/h to 1 knot', () => {
    expect(kmhToKnots(1.852)).toBeCloseTo(1);
  });

  it('converts 18.52 km/h to ~10 knots', () => {
    expect(kmhToKnots(18.52)).toBeCloseTo(10);
  });

  it('handles large speeds', () => {
    expect(kmhToKnots(55.56)).toBeCloseTo(30);
  });
});

describe('draughtToMeters', () => {
  it('converts 0 to 0 meters', () => {
    expect(draughtToMeters(0)).toBe(0);
  });

  it('converts 85 to 8.5 meters', () => {
    expect(draughtToMeters(85)).toBe(8.5);
  });

  it('converts 10 to 1 meter', () => {
    expect(draughtToMeters(10)).toBe(1);
  });

  it('converts 1 to 0.1 meters', () => {
    expect(draughtToMeters(1)).toBeCloseTo(0.1);
  });
});

describe('celsiusToKelvin', () => {
  it('converts 0°C to 273.15K', () => {
    expect(celsiusToKelvin(0)).toBe(273.15);
  });

  it('converts 100°C to 373.15K', () => {
    expect(celsiusToKelvin(100)).toBe(373.15);
  });

  it('converts -273.15°C to 0K (absolute zero)', () => {
    expect(celsiusToKelvin(-273.15)).toBeCloseTo(0);
  });

  it('handles negative temperatures', () => {
    expect(celsiusToKelvin(-20)).toBeCloseTo(253.15);
  });
});

describe('estimateDataSizeKb', () => {
  it('returns a string with one decimal place', () => {
    const result = estimateDataSizeKb('hello', 1);
    expect(result).toMatch(/^\d+\.\d$/);
  });

  it('accounts for vessel count overhead', () => {
    const base = parseFloat(estimateDataSizeKb('', 0));
    const withVessels = parseFloat(estimateDataSizeKb('', 10));
    expect(withVessels - base).toBeCloseTo(2.0);
  });

  it('increases with larger JSON strings', () => {
    const small = parseFloat(estimateDataSizeKb('a', 0));
    const large = parseFloat(estimateDataSizeKb('a'.repeat(1024), 0));
    expect(large).toBeGreaterThan(small);
  });
});
