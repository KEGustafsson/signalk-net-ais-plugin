/*
MIT License
Copyright (c) 2020 Karl-Erik Gustafsson
*/

// --- SignalK Plugin Types ---

export interface PluginOptions {
  position_update: number;
  position_retention: number;
  position_radius: number;
  atons_data: boolean;
}

export interface SignalKApp {
  debug: (...args: unknown[]) => void;
  error: (msg: string) => void;
  handleMessage: (id: string, delta: SignalKDelta) => void;
  getSelfPath: (path: string) => number | undefined;
  setPluginStatus?: (status: string) => void;
  setProviderStatus?: (status: string) => void;
  subscriptionmanager: SubscriptionManager;
}

export interface SubscriptionManager {
  subscribe: (
    subscription: Subscription,
    unsubscribes: Array<() => void>,
    errorCallback: (error: string) => void,
    deltaCallback: (delta: SubscriptionDelta) => void
  ) => void;
}

export interface Subscription {
  context: string;
  subscribe: Array<{ path: string; period: number }>;
}

export interface SubscriptionDelta {
  updates: Array<{ [key: string]: unknown }>;
}

export interface SignalKPlugin {
  id: string;
  name: string;
  description: string;
  start: (options: PluginOptions, restartPlugin?: () => void) => void;
  stop: () => void;
  schema: PluginSchema;
}

export interface PluginSchema {
  type: 'object';
  properties: {
    [key: string]: {
      type: string;
      default: number | boolean;
      title: string;
    };
  };
}

// --- SignalK Delta Message Types ---

export interface SignalKDelta {
  context: string;
  updates: SignalKUpdate[];
}

export interface SignalKUpdate {
  source?: { label: string };
  timestamp?: string;
  values: SignalKValue[];
}

export interface Position {
  longitude: number;
  latitude: number;
}

export interface AisShipType {
  id: number;
  name: string;
}

export interface DraftValue {
  current: number;
  maximum: number;
}

export interface LengthValue {
  overall: number;
}

export interface Registrations {
  imo: string;
}

export interface Communication {
  callsignVhf: string;
}

export type SignalKPathValue =
  | string
  | number
  | Position
  | AisShipType
  | DraftValue
  | LengthValue
  | { mmsi: string }
  | { name: string }
  | { registrations: Registrations }
  | { communication: Communication };

export interface SignalKValue {
  path: string;
  value: SignalKPathValue;
}

// --- Digitraffic API Response Types ---

export interface LocationsResponse {
  features: LocationFeature[];
}

export interface LocationFeature {
  mmsi: number;
  geometry: GeoJsonPoint;
  properties: LocationProperties;
}

export interface GeoJsonPoint {
  coordinates: [number, number];
}

export interface LocationProperties {
  sog: number;
  cog: number;
  navStat: number;
  rot: number;
  heading: number;
  timestampExternal: string;
}

export interface VesselMetadata {
  mmsi: number;
  name: string;
  destination: string;
  callSign: string;
  imo: number;
  shipType: number;
  draught: number;
  eta: number;
  posType: number;
  timestamp: number;
  referencePointA: number;
  referencePointB: number;
  referencePointC: number;
  referencePointD: number;
}

export interface MeasurementsResponse {
  features: MeasurementFeature[];
}

export interface MeasurementFeature {
  properties: MeasurementProperties;
  geometry: GeoJsonPoint;
}

export interface MeasurementProperties {
  siteNumber: number;
  siteName: string;
  siteType: string;
  seaState: number;
  trend: string;
  windWaveDir: number;
  temperature: number;
  lastUpdate: string;
}

// --- API Error Type ---

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly url: string;

  constructor(message: string, statusCode: number, url: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.url = url;
  }
}
