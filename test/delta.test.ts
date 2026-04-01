import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildLocationDelta, buildMetadataDelta, buildMeteoDelta } from '../src/delta';
import type { LocationFeature, MeasurementFeature, VesselMetadata, SignalKValue } from '../src/types';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-06-15T12:00:00.000Z'));
});

function findValue(values: SignalKValue[], path: string): SignalKValue | undefined {
  return values.find((v) => v.path === path);
}

describe('buildLocationDelta', () => {
  const feature: LocationFeature = {
    mmsi: 230012345,
    geometry: { coordinates: [24.9384, 60.1699] },
    properties: {
      sog: 18.52,
      cog: 90,
      navStat: 0,
      rot: 5,
      heading: 95,
      timestampExternal: '2024-06-15T11:55:00Z',
    },
  };

  it('sets correct context with MMSI', () => {
    const delta = buildLocationDelta(feature, 'net-ais-plugin');
    expect(delta.context).toBe('vessels.urn:mrn:imo:mmsi:230012345');
  });

  it('has one update with source label', () => {
    const delta = buildLocationDelta(feature, 'net-ais-plugin');
    expect(delta.updates).toHaveLength(1);
    expect(delta.updates[0]?.source?.label).toBe('net-ais-plugin');
  });

  it('sets MMSI as string at root path', () => {
    const delta = buildLocationDelta(feature, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const mmsiValue = findValue(values, '');
    expect(mmsiValue?.value).toEqual({ mmsi: '230012345' });
  });

  it('converts position from coordinates array', () => {
    const delta = buildLocationDelta(feature, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const pos = findValue(values, 'navigation.position');
    expect(pos?.value).toEqual({ longitude: 24.9384, latitude: 60.1699 });
  });

  it('converts SOG from km/h to knots', () => {
    const delta = buildLocationDelta(feature, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const sog = findValue(values, 'navigation.speedOverGround');
    expect(sog?.value).toBeCloseTo(10); // 18.52 km/h ≈ 10 knots
  });

  it('converts COG from degrees to radians', () => {
    const delta = buildLocationDelta(feature, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const cog = findValue(values, 'navigation.courseOverGroundTrue');
    expect(cog?.value).toBeCloseTo(Math.PI / 2); // 90° = π/2
  });

  it('sets both true and magnetic COG', () => {
    const delta = buildLocationDelta(feature, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const cogTrue = findValue(values, 'navigation.courseOverGroundTrue');
    const cogMag = findValue(values, 'navigation.courseOverGroundMagnetic');
    expect(cogTrue?.value).toBe(cogMag?.value);
  });

  it('converts ROT from degrees to radians', () => {
    const delta = buildLocationDelta(feature, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const rot = findValue(values, 'navigation.rateOfTurn');
    expect(rot?.value).toBeCloseTo(5 * (Math.PI / 180));
  });

  it('converts heading from degrees to radians', () => {
    const delta = buildLocationDelta(feature, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const heading = findValue(values, 'navigation.headingTrue');
    expect(heading?.value).toBeCloseTo(95 * (Math.PI / 180));
  });

  it('maps navStat to navigation state string', () => {
    const delta = buildLocationDelta(feature, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const state = findValue(values, 'navigation.state');
    expect(state?.value).toBe('motoring');
  });

  it('formats timestamp as ISO string', () => {
    const delta = buildLocationDelta(feature, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const dt = findValue(values, 'navigation.datetime');
    expect(dt?.value).toBe('2024-06-15T11:55:00.000Z');
  });

  it('uses default for unknown navStat', () => {
    const modified = { ...feature, properties: { ...feature.properties, navStat: 99 } };
    const delta = buildLocationDelta(modified, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const state = findValue(values, 'navigation.state');
    expect(state?.value).toBe('default');
  });
});

describe('buildMetadataDelta', () => {
  const metadata: VesselMetadata = {
    mmsi: 230012345,
    name: 'FINLAND STAR',
    destination: 'HELSINKI',
    callSign: 'OJAB',
    imo: 9876543,
    shipType: 70,
    draught: 85,
    eta: 7200,
    posType: 1,
    timestamp: 1718452800000,
    referencePointA: 120,
    referencePointB: 30,
    referencePointC: 16,
    referencePointD: 16,
  };

  it('sets correct context with MMSI', () => {
    const delta = buildMetadataDelta(metadata, 'net-ais-plugin');
    expect(delta.context).toBe('vessels.urn:mrn:imo:mmsi:230012345');
  });

  it('sets vessel name at root path', () => {
    const delta = buildMetadataDelta(metadata, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const nameValues = values.filter((v) => v.path === '');
    const nameValue = nameValues.find(
      (v) => typeof v.value === 'object' && v.value !== null && 'name' in v.value
    );
    expect(nameValue?.value).toEqual({ name: 'FINLAND STAR' });
  });

  it('sets destination', () => {
    const delta = buildMetadataDelta(metadata, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const dest = findValue(values, 'navigation.destination.commonName');
    expect(dest?.value).toBe('HELSINKI');
  });

  it('maps ship type with name', () => {
    const delta = buildMetadataDelta(metadata, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const shipType = findValue(values, 'design.aisShipType');
    expect(shipType?.value).toEqual({ id: 70, name: 'Cargo ship' });
  });

  it('formats IMO registration', () => {
    const delta = buildMetadataDelta(metadata, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const regValues = values.filter((v) => v.path === '');
    const regValue = regValues.find(
      (v) => typeof v.value === 'object' && v.value !== null && 'registrations' in v.value
    );
    expect(regValue?.value).toEqual({ registrations: { imo: 'IMO 9876543' } });
  });

  it('sets callsign', () => {
    const delta = buildMetadataDelta(metadata, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const commValues = values.filter((v) => v.path === '');
    const commValue = commValues.find(
      (v) => typeof v.value === 'object' && v.value !== null && 'communication' in v.value
    );
    expect(commValue?.value).toEqual({ communication: { callsignVhf: 'OJAB' } });
  });

  it('converts draught from tenths to meters', () => {
    const delta = buildMetadataDelta(metadata, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const draft = findValue(values, 'design.draft');
    expect(draft?.value).toEqual({ current: 8.5, maximum: 8.5 });
  });

  it('calculates length from reference points A+B', () => {
    const delta = buildMetadataDelta(metadata, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const length = findValue(values, 'design.length');
    expect(length?.value).toEqual({ overall: 150 }); // 120 + 30
  });

  it('calculates beam from reference points C+D', () => {
    const delta = buildMetadataDelta(metadata, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const beam = findValue(values, 'design.beam');
    expect(beam?.value).toBe(32); // 16 + 16
  });

  it('sets position sensor type from lookup', () => {
    const delta = buildMetadataDelta(metadata, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const sensor = findValue(values, 'sensors.position.sensorType');
    expect(sensor?.value).toBe('GPS');
  });

  it('sets AIS class to A', () => {
    const delta = buildMetadataDelta(metadata, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const aisClass = findValue(values, 'sensors.ais.class');
    expect(aisClass?.value).toBe('A');
  });

  it('sets epoch ETA when eta is 0', () => {
    const modified = { ...metadata, eta: 0 };
    const delta = buildMetadataDelta(modified, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const eta = findValue(values, 'navigation.destination.eta');
    expect(eta?.value).toBe('1970-01-01T00:00:00.000Z');
  });

  it('calculates ETA from timestamp + eta seconds', () => {
    const delta = buildMetadataDelta(metadata, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const eta = findValue(values, 'navigation.destination.eta');
    const expected = new Date(1718452800000 + 7200 * 1000).toISOString();
    expect(eta?.value).toBe(expected);
  });

  it('uses Unknown for unmapped ship type', () => {
    const modified = { ...metadata, shipType: 0 };
    const delta = buildMetadataDelta(modified, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const shipType = findValue(values, 'design.aisShipType');
    expect(shipType?.value).toEqual({ id: 0, name: 'Unknown' });
  });

  it('uses N/A for unmapped position type', () => {
    const modified = { ...metadata, posType: 0 };
    const delta = buildMetadataDelta(modified, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const sensor = findValue(values, 'sensors.position.sensorType');
    expect(sensor?.value).toBe('N/A');
  });
});

describe('buildMeteoDelta', () => {
  const feature: MeasurementFeature = {
    properties: {
      siteNumber: 12345,
      siteName: 'Kalbådagrund',
      siteType: 'wave',
      seaState: 3,
      trend: 'rising',
      windWaveDir: 270,
      temperature: 15.5,
      lastUpdate: '2024-06-15T11:50:00Z',
    },
    geometry: { coordinates: [25.6, 59.99] },
  };

  it('sets meteo context with padded MMSI', () => {
    const delta = buildMeteoDelta(feature, 'net-ais-plugin');
    expect(delta.context).toBe('meteo.urn:mrn:imo:mmsi:000012345');
  });

  it('sets site number', () => {
    const delta = buildMeteoDelta(feature, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const siteNum = findValue(values, 'environment.station.siteNumber');
    expect(siteNum?.value).toBe(12345);
  });

  it('sets position from coordinates', () => {
    const delta = buildMeteoDelta(feature, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const pos = findValue(values, 'navigation.position');
    expect(pos?.value).toEqual({ longitude: 25.6, latitude: 59.99 });
  });

  it('sets station name at root', () => {
    const delta = buildMeteoDelta(feature, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const nameValues = values.filter((v) => v.path === '');
    const nameValue = nameValues.find(
      (v) => typeof v.value === 'object' && v.value !== null && 'name' in v.value
    );
    expect(nameValue?.value).toEqual({ name: 'Kalbådagrund' });
  });

  it('sets station type', () => {
    const delta = buildMeteoDelta(feature, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const type = findValue(values, 'environment.station.type');
    expect(type?.value).toBe('wave');
  });

  it('sets sea state', () => {
    const delta = buildMeteoDelta(feature, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const seaState = findValue(values, 'environment.water.seaState');
    expect(seaState?.value).toBe(3);
  });

  it('converts wind direction to radians', () => {
    const delta = buildMeteoDelta(feature, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const wind = findValue(values, 'environment.wind.directionTrue');
    expect(wind?.value).toBeCloseTo(270 * (Math.PI / 180));
  });

  it('converts temperature from Celsius to Kelvin', () => {
    const delta = buildMeteoDelta(feature, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const temp = findValue(values, 'environment.outside.temperature');
    expect(temp?.value).toBeCloseTo(288.65);
  });

  it('formats date as ISO string', () => {
    const delta = buildMeteoDelta(feature, 'net-ais-plugin');
    const values = delta.updates[0]?.values ?? [];
    const date = findValue(values, 'environment.date');
    expect(date?.value).toBe('2024-06-15T11:50:00.000Z');
  });
});
