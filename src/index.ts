/*
MIT License

Copyright (c) 2020 Karl-Erik Gustafsson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import type { PluginOptions, SignalKApp, SignalKPlugin } from './types';
import {
  fetchLocations,
  fetchMeasurements,
  fetchVesselMetadata,
  formatMeasurementDate,
  getErrorMessage,
  isNetworkError,
} from './api';
import { buildLocationDelta, buildMetadataDelta, buildMeteoDelta } from './delta';
import { estimateDataSizeKb } from './converters';

// Single source of truth for the plugin configuration defaults. The JSON
// schema below advertises these to the server UI, and start() falls back to
// them whenever the server hands over a partial or empty configuration (which
// it does when the plugin is enabled before it has ever been configured).
const DEFAULT_OPTIONS: PluginOptions = {
  position_update: 1,
  position_retention: 30,
  position_radius: 10,
  atons_data: true,
};

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function resolveOptions(options?: Partial<PluginOptions>): PluginOptions {
  const given = options ?? {};
  return {
    position_update: positiveNumber(given.position_update, DEFAULT_OPTIONS.position_update),
    position_retention: positiveNumber(
      given.position_retention,
      DEFAULT_OPTIONS.position_retention
    ),
    position_radius: positiveNumber(given.position_radius, DEFAULT_OPTIONS.position_radius),
    atons_data:
      typeof given.atons_data === 'boolean' ? given.atons_data : DEFAULT_OPTIONS.atons_data,
  };
}

function createPlugin(app: SignalKApp): SignalKPlugin {
  let positionUpdate = DEFAULT_OPTIONS.position_update;
  let positionRetention = DEFAULT_OPTIONS.position_retention;
  let positionRadius = DEFAULT_OPTIONS.position_radius;

  let timeoutInitialAis: ReturnType<typeof setTimeout> | undefined;
  let intervalAis: ReturnType<typeof setInterval> | undefined;
  let timeoutInitialMeteo: ReturnType<typeof setTimeout> | undefined;
  let intervalMeteo: ReturnType<typeof setInterval> | undefined;
  let unsubscribes: Array<() => void> = [];

  const setStatus = app.setPluginStatus ?? app.setProviderStatus;

  async function readInfo(): Promise<void> {
    const lon = app.getSelfPath('navigation.position.value.longitude');
    const lat = app.getSelfPath('navigation.position.value.latitude');

    if (lon === undefined || lat === undefined) {
      app.debug('No vessel position available, skipping AIS fetch');
      return;
    }

    try {
      const from = Math.floor(Date.now()) - 60000 * positionRetention;
      const json = await fetchLocations({
        from,
        radius: positionRadius,
        latitude: lat,
        longitude: lon,
      });

      const numberAIS = json.features.length;
      const dateStr = new Date().toISOString();
      const jsonStr = JSON.stringify(json);

      app.debug(`${numberAIS} vessels in ${positionRadius}km radius`);

      for (const feature of json.features) {
        const locationDelta = buildLocationDelta(feature, plugin.id);
        app.handleMessage(plugin.id, locationDelta);
      }

      if (setStatus) {
        setStatus(
          `Number of AIS targets: ${numberAIS} (data: ${estimateDataSizeKb(jsonStr, numberAIS)}kB, ${dateStr})`
        );
      }

      const metadataResults = await Promise.allSettled(
        json.features.map((feature) => fetchVesselMetadata(feature.mmsi))
      );

      for (const result of metadataResults) {
        if (result.status === 'fulfilled') {
          const metaDelta = buildMetadataDelta(result.value, plugin.id);
          app.handleMessage(plugin.id, metaDelta);
        } else {
          const reason: unknown = result.reason;
          if (isNetworkError(reason)) {
            app.error(`Network error fetching vessel metadata: ${getErrorMessage(reason)}`);
          } else {
            app.error(`Error fetching vessel metadata: ${getErrorMessage(reason)}`);
          }
        }
      }
    } catch (error: unknown) {
      if (isNetworkError(error)) {
        app.error(`Network error fetching AIS locations: ${getErrorMessage(error)}`);
      } else {
        app.error(`Error fetching AIS locations: ${getErrorMessage(error)}`);
      }
    }
  }

  async function readMeteo(): Promise<void> {
    try {
      const fromDate = formatMeasurementDate();
      const json = await fetchMeasurements(fromDate);

      for (const feature of json.features) {
        const delta = buildMeteoDelta(feature, plugin.id);
        app.handleMessage(plugin.id, delta);

        app.debug(`Meteo: ${feature.properties.siteName} (${feature.properties.siteNumber})`);
      }
    } catch (error: unknown) {
      if (isNetworkError(error)) {
        app.error(`Network error fetching meteo data: ${getErrorMessage(error)}`);
      } else {
        app.error(`Error fetching meteo data: ${getErrorMessage(error)}`);
      }
    }
  }

  const plugin: SignalKPlugin = {
    id: 'net-ais-plugin',
    name: 'Net-AIS',
    description:
      "Marine traffic information is gathered from Finnish Transport Agency's data sources",

    start(options?: Partial<PluginOptions>) {
      // Guard against double-start: clean up any existing timers
      plugin.stop();

      const config = resolveOptions(options);
      positionUpdate = config.position_update;
      positionRetention = config.position_retention;
      positionRadius = config.position_radius;

      app.debug(`position_update: ${positionUpdate}`);
      app.debug(`position_retention: ${positionRetention}`);
      app.debug(`position_radius: ${positionRadius}`);
      app.debug('Plugin started');

      app.subscriptionmanager.subscribe(
        {
          context: 'vessels.self',
          subscribe: [{ path: 'navigation.position.value', period: 10000 }],
        },
        unsubscribes,
        (subscriptionError) => {
          app.error(`Error: ${subscriptionError}`);
        },
        (delta) => {
          delta.updates.forEach((u) => {
            app.debug(u);
          });
        }
      );

      // Initial fetch after short delay, then at configured interval
      timeoutInitialAis = setTimeout(() => void readInfo(), 5000);
      intervalAis = setInterval(() => void readInfo(), positionUpdate * 60000);

      if (config.atons_data) {
        timeoutInitialMeteo = setTimeout(() => void readMeteo(), 5000);
        intervalMeteo = setInterval(() => void readMeteo(), positionUpdate * 60000);
      }
    },

    stop() {
      if (timeoutInitialAis !== undefined) {
        clearTimeout(timeoutInitialAis);
        timeoutInitialAis = undefined;
      }
      if (intervalAis !== undefined) {
        clearInterval(intervalAis);
        intervalAis = undefined;
      }
      if (timeoutInitialMeteo !== undefined) {
        clearTimeout(timeoutInitialMeteo);
        timeoutInitialMeteo = undefined;
      }
      if (intervalMeteo !== undefined) {
        clearInterval(intervalMeteo);
        intervalMeteo = undefined;
      }
      unsubscribes.forEach((f) => f());
      unsubscribes = [];
      app.debug('Net-AIS Stopped');
    },

    schema: {
      type: 'object',
      properties: {
        position_update: {
          type: 'integer',
          default: DEFAULT_OPTIONS.position_update,
          title: 'How often AIS data is fetch (in minutes)',
        },
        position_retention: {
          type: 'integer',
          default: DEFAULT_OPTIONS.position_retention,
          title: 'How old AIS data is fetch (minutes from now)',
        },
        position_radius: {
          type: 'integer',
          default: DEFAULT_OPTIONS.position_radius,
          title: 'AIS targets around the vessel (radius in km)',
        },
        atons_data: {
          type: 'boolean',
          default: DEFAULT_OPTIONS.atons_data,
          title: 'Fetch Meteo data (Sea State Estimation) from AtoN sites',
        },
      },
    },
  };

  return plugin;
}

export = createPlugin;
