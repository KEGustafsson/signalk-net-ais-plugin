import type {
  LocationFeature,
  MeasurementFeature,
  SignalKDelta,
  VesselMetadata,
} from './types';
import { celsiusToKelvin, degreesToRadians, draughtToMeters, kmhToKnots } from './converters';
import { NAVIGATION_STATES, POSITION_TYPES, VESSEL_TYPES } from './lookups';

export function buildLocationDelta(
  feature: LocationFeature,
  pluginId: string
): SignalKDelta {
  const mmsi = String(feature.mmsi);
  const latitude = feature.geometry.coordinates[1];
  const longitude = feature.geometry.coordinates[0];
  const sog = kmhToKnots(feature.properties.sog);
  const cog = degreesToRadians(feature.properties.cog);
  const navStat = NAVIGATION_STATES[feature.properties.navStat] ?? 'default';
  const rot = degreesToRadians(feature.properties.rot);
  const heading = degreesToRadians(feature.properties.heading);
  const timestamp = new Date(feature.properties.timestampExternal).toISOString();

  return {
    context: `vessels.urn:mrn:imo:mmsi:${mmsi}`,
    updates: [
      {
        source: { label: pluginId },
        timestamp: new Date().toISOString(),
        values: [
          { path: '', value: { mmsi } },
          { path: 'navigation.position', value: { longitude, latitude } },
          { path: 'navigation.courseOverGroundTrue', value: cog },
          { path: 'navigation.courseOverGroundMagnetic', value: cog },
          { path: 'navigation.speedOverGround', value: sog },
          { path: 'navigation.rateOfTurn', value: rot },
          { path: 'navigation.headingTrue', value: heading },
          { path: 'navigation.datetime', value: timestamp },
          { path: 'navigation.state', value: navStat },
        ],
      },
    ],
  };
}

export function buildMetadataDelta(
  metadata: VesselMetadata,
  pluginId: string
): SignalKDelta {
  const mmsi = String(metadata.mmsi);
  const shipTypeName = VESSEL_TYPES[metadata.shipType] ?? 'Unknown';
  const draught = draughtToMeters(metadata.draught);
  const posType = POSITION_TYPES[metadata.posType] ?? 'N/A';
  const length = metadata.referencePointA + metadata.referencePointB;
  const beam = metadata.referencePointC + metadata.referencePointD;

  let etaTime: string;
  if (metadata.eta === 0) {
    etaTime = new Date(0).toISOString();
  } else {
    etaTime = new Date(metadata.timestamp + metadata.eta * 1000).toISOString();
  }

  return {
    context: `vessels.urn:mrn:imo:mmsi:${mmsi}`,
    updates: [
      {
        source: { label: pluginId },
        timestamp: new Date().toISOString(),
        values: [
          { path: '', value: { name: metadata.name } },
          { path: 'navigation.destination.commonName', value: metadata.destination },
          { path: 'design.aisShipType', value: { id: metadata.shipType, name: shipTypeName } },
          { path: '', value: { registrations: { imo: `IMO ${metadata.imo}` } } },
          { path: '', value: { communication: { callsignVhf: metadata.callSign } } },
          { path: 'navigation.destination.eta', value: etaTime },
          { path: 'design.draft', value: { current: draught, maximum: draught } },
          { path: 'design.length', value: { overall: length } },
          { path: 'design.beam', value: beam },
          { path: 'sensors.position.sensorType', value: posType },
          { path: 'sensors.ais.class', value: 'A' },
        ],
      },
    ],
  };
}

export function buildMeteoDelta(
  feature: MeasurementFeature,
  pluginId: string
): SignalKDelta {
  const mmsi = String(feature.properties.siteNumber).padStart(9, '0');
  const latitude = feature.geometry.coordinates[1];
  const longitude = feature.geometry.coordinates[0];
  const windWaveDir = degreesToRadians(feature.properties.windWaveDir);
  const temperature = celsiusToKelvin(feature.properties.temperature);
  const timestamp = new Date(feature.properties.lastUpdate).toISOString();

  return {
    context: `meteo.urn:mrn:imo:mmsi:${mmsi}`,
    updates: [
      {
        source: { label: pluginId },
        timestamp: new Date().toISOString(),
        values: [
          { path: '', value: { mmsi } },
          { path: 'environment.station.siteNumber', value: feature.properties.siteNumber },
          { path: 'navigation.position', value: { longitude, latitude } },
          { path: '', value: { name: feature.properties.siteName } },
          { path: 'environment.station.type', value: feature.properties.siteType },
          { path: 'environment.water.seaState', value: feature.properties.seaState },
          { path: 'environment.forecast.trend', value: feature.properties.trend },
          { path: 'environment.wind.directionTrue', value: windWaveDir },
          { path: 'environment.outside.temperature', value: temperature },
          { path: 'environment.date', value: timestamp },
        ],
      },
    ],
  };
}
