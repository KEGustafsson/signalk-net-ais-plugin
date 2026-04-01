import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchLocations,
  fetchVesselMetadata,
  fetchMeasurements,
  formatMeasurementDate,
  isNetworkError,
  getErrorMessage,
} from '../src/api';
import type { LocationsResponse, MeasurementsResponse, VesselMetadata } from '../src/types';
import { ApiError } from '../src/types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockJsonResponse<T>(data: T, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
  } as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('fetchLocations', () => {
  const params = { from: 1000000, radius: 10, latitude: 60.0, longitude: 24.0 };

  it('fetches locations with correct URL', async () => {
    const mockData: LocationsResponse = { features: [] };
    mockFetch.mockResolvedValue(mockJsonResponse(mockData));

    await fetchLocations(params);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://meri.digitraffic.fi/api/ais/v1/locations?from=1000000&radius=10&latitude=60&longitude=24',
      { method: 'GET' }
    );
  });

  it('returns parsed location data', async () => {
    const mockData: LocationsResponse = {
      features: [
        {
          mmsi: 123456789,
          geometry: { coordinates: [24.5, 60.1] },
          properties: {
            sog: 10.5,
            cog: 180,
            navStat: 0,
            rot: 0,
            heading: 180,
            timestampExternal: '2024-01-01T00:00:00Z',
          },
        },
      ],
    };
    mockFetch.mockResolvedValue(mockJsonResponse(mockData));

    const result = await fetchLocations(params);
    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.mmsi).toBe(123456789);
  });

  it('throws ApiError on non-ok response', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({}, 500));

    await expect(fetchLocations(params)).rejects.toThrow(ApiError);
    await expect(fetchLocations(params)).rejects.toThrow('HTTP 500');
  });

  it('propagates network errors', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));

    await expect(fetchLocations(params)).rejects.toThrow('fetch failed');
  });
});

describe('fetchVesselMetadata', () => {
  it('fetches metadata with correct URL', async () => {
    const mockData: VesselMetadata = {
      mmsi: 123456789,
      name: 'Test Vessel',
      destination: 'Helsinki',
      callSign: 'ABCD',
      imo: 9999999,
      shipType: 70,
      draught: 85,
      eta: 3600,
      posType: 1,
      timestamp: 1704067200000,
      referencePointA: 100,
      referencePointB: 50,
      referencePointC: 15,
      referencePointD: 15,
    };
    mockFetch.mockResolvedValue(mockJsonResponse(mockData));

    const result = await fetchVesselMetadata(123456789);
    expect(result.name).toBe('Test Vessel');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://meri.digitraffic.fi/api/ais/v1/vessels/123456789',
      { method: 'GET' }
    );
  });

  it('throws ApiError on 404', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({}),
    } as Response);

    await expect(fetchVesselMetadata(999)).rejects.toThrow(ApiError);
  });
});

describe('fetchMeasurements', () => {
  it('fetches measurements with encoded date', async () => {
    const mockData: MeasurementsResponse = { features: [] };
    mockFetch.mockResolvedValue(mockJsonResponse(mockData));

    await fetchMeasurements('2024-01-01T00:00:00.000Z');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://meri.digitraffic.fi/api/sse/v1/measurements?from=2024-01-01T00%3A00%3A00.000Z',
      { method: 'GET' }
    );
  });

  it('returns parsed measurement data', async () => {
    const mockData: MeasurementsResponse = {
      features: [
        {
          properties: {
            siteNumber: 12345,
            siteName: 'Test Station',
            siteType: 'wave',
            seaState: 3,
            trend: 'rising',
            windWaveDir: 180,
            temperature: 15.5,
            lastUpdate: '2024-01-01T00:00:00Z',
          },
          geometry: { coordinates: [24.5, 60.1] },
        },
      ],
    };
    mockFetch.mockResolvedValue(mockJsonResponse(mockData));

    const result = await fetchMeasurements('2024-01-01T00:00:00.000Z');
    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.properties.siteName).toBe('Test Station');
  });
});

describe('formatMeasurementDate', () => {
  it('returns a properly formatted date string', () => {
    const result = formatMeasurementDate();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
  });

  it('returns a date approximately 60 minutes in the past', () => {
    const result = formatMeasurementDate();
    const parsed = new Date(result).getTime();
    const expected = Date.now() - 60 * 60 * 1000;
    // Allow 5 seconds tolerance
    expect(Math.abs(parsed - expected)).toBeLessThan(5000);
  });
});

describe('isNetworkError', () => {
  it('returns true for TypeError', () => {
    expect(isNetworkError(new TypeError('fetch failed'))).toBe(true);
  });

  it('returns true for ENOTFOUND', () => {
    const error = Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
    expect(isNetworkError(error)).toBe(true);
  });

  it('returns true for EAI_AGAIN', () => {
    const error = Object.assign(new Error('EAI_AGAIN'), { code: 'EAI_AGAIN' });
    expect(isNetworkError(error)).toBe(true);
  });

  it('returns false for ApiError', () => {
    expect(isNetworkError(new ApiError('test', 500, 'url'))).toBe(false);
  });

  it('returns false for generic Error', () => {
    expect(isNetworkError(new Error('generic'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isNetworkError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isNetworkError(undefined)).toBe(false);
  });
});

describe('getErrorMessage', () => {
  it('returns message from Error', () => {
    expect(getErrorMessage(new Error('test message'))).toBe('test message');
  });

  it('returns string representation of non-Error', () => {
    expect(getErrorMessage('string error')).toBe('string error');
  });

  it('handles number', () => {
    expect(getErrorMessage(42)).toBe('42');
  });
});
