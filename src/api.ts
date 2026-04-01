import {
  ApiError,
  LocationsResponse,
  MeasurementsResponse,
  VesselMetadata,
} from './types';

const BASE_URL = 'https://meri.digitraffic.fi';

interface LocationParams {
  from: number;
  radius: number;
  latitude: number;
  longitude: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) {
    throw new ApiError(
      `HTTP ${response.status}: ${response.statusText}`,
      response.status,
      url
    );
  }
  return response.json() as Promise<T>;
}

export async function fetchLocations(params: LocationParams): Promise<LocationsResponse> {
  const url = `${BASE_URL}/api/ais/v1/locations?from=${params.from}&radius=${params.radius}&latitude=${params.latitude}&longitude=${params.longitude}`;
  return fetchJson<LocationsResponse>(url);
}

export async function fetchVesselMetadata(mmsi: number): Promise<VesselMetadata> {
  const url = `${BASE_URL}/api/ais/v1/vessels/${mmsi}`;
  return fetchJson<VesselMetadata>(url);
}

export async function fetchMeasurements(fromDate: string): Promise<MeasurementsResponse> {
  const encodedDate = encodeURIComponent(fromDate);
  const url = `${BASE_URL}/api/sse/v1/measurements?from=${encodedDate}`;
  return fetchJson<MeasurementsResponse>(url);
}

export function formatMeasurementDate(): string {
  const date = new Date(Date.now() - 60 * 60 * 1000);
  return date.toISOString();
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && /fetch|network|abort/i.test(error.message)) {
    return true;
  }
  if (error !== null && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code;
    return code === 'ENOTFOUND' || code === 'EAI_AGAIN';
  }
  return false;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
